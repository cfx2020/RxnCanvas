"""Import workflow orchestration between project, parser, and registry services."""

from __future__ import annotations

from dataclasses import dataclass, replace
import hashlib
import os
from pathlib import Path
from typing import Literal, TypeVar

from .errors import RxnFlowError, RxnFlowWarning
from .models import ID, ProjectResource
from .parsers.contracts import ParseOptions, ParseResult, RawFile
from .parsers.registry import ParserRegistry
from .project import ProjectStore
from .registry import ChemicalRegistry
from .result import Result, err, ok


ImportItemStatus = Literal["raw_added", "parsed", "needs_confirmation", "registered", "failed"]
T = TypeVar("T")


@dataclass(frozen=True)
class ImportFileRequest:
    source_path: str | os.PathLike[str]
    parse_options: ParseOptions | None = None


@dataclass(frozen=True)
class ParsePreview:
    raw_resource_id: ID
    parser_id: str
    parser_version: str
    object_count: int
    warnings: tuple[RxnFlowWarning, ...]
    parse_result: ParseResult


@dataclass(frozen=True)
class ImportItem:
    id: ID
    source_path: str
    status: ImportItemStatus
    raw_resource: ProjectResource | None = None
    preview: ParsePreview | None = None
    registered_object_ids: tuple[ID, ...] = ()
    error: RxnFlowError | None = None
    warnings: tuple[RxnFlowWarning, ...] = ()


@dataclass(frozen=True)
class ImportBatch:
    id: ID
    project_id: ID
    items: tuple[ImportItem, ...]


@dataclass(frozen=True)
class ImportSelection:
    item_id: ID
    object_indices: tuple[int, ...] | None = None


class ImportRegistryWorkflow:
    """Project-scoped in-memory import state and confirmation workflow."""

    def __init__(
        self,
        project_store: ProjectStore,
        parser_registry: ParserRegistry,
        chemical_registry: ChemicalRegistry,
    ) -> None:
        self._project_store = project_store
        self._parser_registry = parser_registry
        self._chemical_registry = chemical_registry
        self._batches: dict[ID, dict[ID, ImportBatch]] = {}

    def import_files(
        self,
        project_path: str | os.PathLike[str],
        requests: tuple[ImportFileRequest, ...],
    ) -> Result[ImportBatch]:
        if not requests:
            return _invalid_input("Import workflow requires at least one file request.", "requests")

        manifest = self._project_store.load_project(project_path)
        if not manifest.ok or manifest.value is None:
            assert manifest.error is not None
            return err(manifest.error)

        items: list[ImportItem] = []
        for index, request in enumerate(requests):
            items.append(self._import_single_file(project_path, request, index))

        project_batches = self._batches.setdefault(manifest.value.id, {})
        batch = ImportBatch(
            id=_batch_id(manifest.value.id, len(project_batches) + 1),
            project_id=manifest.value.id,
            items=tuple(items),
        )
        project_batches[batch.id] = batch
        return ok(batch)

    def confirm_import(
        self,
        project_id: ID,
        batch_id: ID,
        selections: tuple[ImportSelection, ...],
    ) -> Result[ImportBatch]:
        if not selections:
            return _invalid_input("Import confirmation requires at least one selection.", "selections")

        batch_result = self.get_batch(project_id, batch_id)
        if not batch_result.ok or batch_result.value is None:
            return batch_result
        batch = batch_result.value

        items = list(batch.items)
        for selection in selections:
            item_index = _find_item_index(items, selection.item_id)
            if item_index is None:
                return _invalid_input(
                    f"Import item '{selection.item_id}' does not exist.",
                    selection.item_id,
                )

            item = items[item_index]
            if item.status == "registered":
                continue
            if item.preview is None:
                return _invalid_input(
                    f"Import item '{item.id}' does not have a parse preview to confirm.",
                    item.id,
                )

            parse_result = _select_parse_result(
                item.preview.parse_result,
                selection.object_indices,
                item.id,
            )
            if not parse_result.ok or parse_result.value is None:
                assert parse_result.error is not None
                return err(parse_result.error)

            registered = self._chemical_registry.register(project_id, parse_result.value)
            if not registered.ok or registered.value is None:
                assert registered.error is not None
                items[item_index] = replace(item, status="failed", error=registered.error)
                continue

            items[item_index] = replace(
                item,
                status="registered",
                registered_object_ids=tuple(obj.id for obj in registered.value),
                error=None,
            )

        updated = replace(batch, items=tuple(items))
        self._batches[project_id][batch_id] = updated
        return ok(updated)

    def get_batch(self, project_id: ID, batch_id: ID) -> Result[ImportBatch]:
        if not project_id:
            return _invalid_input("Project id is required.", "project_id")
        project_batches = self._batches.get(project_id)
        if project_batches is None or batch_id not in project_batches:
            return _invalid_input("Import batch is not registered in this project.", batch_id)
        return ok(project_batches[batch_id])

    def list_batches(self, project_id: ID) -> Result[tuple[ImportBatch, ...]]:
        if not project_id:
            return _invalid_input("Project id is required.", "project_id")
        return ok(tuple(self._batches.get(project_id, {}).values()))

    def _import_single_file(
        self,
        project_path: str | os.PathLike[str],
        request: ImportFileRequest,
        index: int,
    ) -> ImportItem:
        source_path = str(request.source_path)
        item_id = _item_id(source_path, index)

        raw_resource = self._project_store.add_raw_file(project_path, request.source_path)
        if not raw_resource.ok or raw_resource.value is None:
            assert raw_resource.error is not None
            return ImportItem(
                id=item_id,
                source_path=source_path,
                status="failed",
                error=raw_resource.error,
            )

        raw_file = _raw_file_from_resource(project_path, raw_resource.value)
        if not raw_file.ok or raw_file.value is None:
            assert raw_file.error is not None
            return ImportItem(
                id=item_id,
                source_path=source_path,
                status="failed",
                raw_resource=raw_resource.value,
                error=raw_file.error,
            )

        parsed = self._parser_registry.parse(raw_file.value, request.parse_options)
        if not parsed.ok or parsed.value is None:
            assert parsed.error is not None
            return ImportItem(
                id=item_id,
                source_path=source_path,
                status="failed",
                raw_resource=raw_resource.value,
                error=parsed.error,
                warnings=parsed.warnings,
            )

        preview = ParsePreview(
            raw_resource_id=raw_resource.value.id,
            parser_id=parsed.value.provenance.parser_id,
            parser_version=parsed.value.provenance.parser_version,
            object_count=len(parsed.value.objects),
            warnings=parsed.warnings,
            parse_result=parsed.value,
        )
        return ImportItem(
            id=item_id,
            source_path=source_path,
            status="needs_confirmation",
            raw_resource=raw_resource.value,
            preview=preview,
            warnings=parsed.warnings,
        )


def _raw_file_from_resource(
    project_path: str | os.PathLike[str],
    resource: ProjectResource,
) -> Result[RawFile]:
    if resource.kind != "raw_file":
        return _invalid_input("Project resource must be kind raw_file.", resource.id)
    if resource.path is None:
        return _invalid_input("Raw file resource must include a project-relative path.", resource.id)

    raw_path = Path(project_path) / resource.path
    source_name = resource.metadata.get("source_name")
    name = str(source_name) if source_name is not None else Path(resource.path).name
    size = resource.metadata.get("byte_size")
    return ok(
        RawFile(
            id=resource.id,
            name=name,
            path=raw_path,
            size=size if isinstance(size, int) else None,
        )
    )


def _select_parse_result(
    parse_result: ParseResult,
    object_indices: tuple[int, ...] | None,
    target: str,
) -> Result[ParseResult]:
    if object_indices is None:
        return ok(parse_result)
    if not object_indices:
        return _invalid_input("Import selection must include at least one object index.", target)

    normalized: list[int] = []
    object_count = len(parse_result.objects)
    for index in object_indices:
        resolved = index if index >= 0 else object_count + index
        if resolved < 0 or resolved >= object_count:
            return _invalid_input(f"Import object index '{index}' is out of range.", target)
        if resolved in normalized:
            return _invalid_input(f"Import object index '{index}' is duplicated.", target)
        normalized.append(resolved)

    return ok(
        ParseResult(
            objects=tuple(parse_result.objects[index] for index in normalized),
            provenance=parse_result.provenance,
        )
    )


def _find_item_index(items: list[ImportItem], item_id: ID) -> int | None:
    for index, item in enumerate(items):
        if item.id == item_id:
            return index
    return None


def _batch_id(project_id: ID, index: int) -> ID:
    return f"import-batch-{project_id.removeprefix('project-')}-{index}"


def _item_id(source_path: str, index: int) -> ID:
    digest = hashlib.sha256(source_path.encode("utf-8")).hexdigest()[:10]
    return f"import-item-{index + 1}-{digest}"


def _invalid_input(message: str, target: str) -> Result[T]:
    return err(RxnFlowError(code="invalid_input", message=message, target=target))
