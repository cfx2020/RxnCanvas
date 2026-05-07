"""Export artifact index persistence codec for project content sections."""

from __future__ import annotations

import math
from pathlib import PurePosixPath
import re
from typing import Any, cast

from .errors import RxnFlowError
from .export import ALLOWED_EXPORT_FORMATS, ExportArtifactRecord, ExportFormat
from .models import ID
from .result import Result, err, ok


EXPORT_ARTIFACTS_SCHEMA_VERSION = "export-artifacts-v1"
EXPORT_ARTIFACT_ROOT = "exports"
_CHECKSUM_PATTERN = re.compile(r"^sha256:[0-9a-fA-F]{64}$")


def export_artifacts_section_to_dict(
    project_id: ID,
    artifacts: tuple[ExportArtifactRecord, ...],
) -> Result[dict[str, Any]]:
    if not project_id:
        return err(RxnFlowError("invalid_input", "Export artifact section requires project_id.", target="project_id"))

    encoded_artifacts: list[dict[str, Any]] = []
    seen_ids: set[ID] = set()
    seen_paths: set[str] = set()
    for index, artifact in enumerate(artifacts):
        target = f"artifacts[{index}]"
        if not isinstance(artifact, ExportArtifactRecord):
            return err(RxnFlowError("invalid_input", "Export artifact record must be structured.", target=target))
        validation = _validate_record(artifact, seen_ids, seen_paths, target)
        if validation is not None:
            return err(validation)
        encoded_artifacts.append(_record_to_dict(artifact))

    return ok(
        {
            "schema_version": EXPORT_ARTIFACTS_SCHEMA_VERSION,
            "project_id": project_id,
            "artifacts": encoded_artifacts,
        }
    )


def export_artifacts_section_from_dict(
    project_id: ID,
    data: dict[str, Any] | None,
) -> Result[tuple[ExportArtifactRecord, ...]]:
    if data is None:
        return ok(())
    if not isinstance(data, dict):
        return err(RxnFlowError("invalid_input", "Export artifact section must be an object.", target="export_artifacts"))
    if data.get("schema_version") != EXPORT_ARTIFACTS_SCHEMA_VERSION:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Unsupported section schema_version '{data.get('schema_version')}'.",
                target="export_artifacts",
            )
        )
    if data.get("project_id") != project_id:
        return err(
            RxnFlowError(
                "invalid_input",
                "Export artifact section project_id does not match index.",
                target="export_artifacts",
            )
        )

    raw_artifacts = data.get("artifacts", [])
    if not isinstance(raw_artifacts, list):
        return err(RxnFlowError("invalid_input", "Export artifacts must be a list.", target="artifacts"))

    artifacts: list[ExportArtifactRecord] = []
    seen_ids: set[ID] = set()
    seen_paths: set[str] = set()
    for index, value in enumerate(raw_artifacts):
        target = f"artifacts[{index}]"
        if not isinstance(value, dict):
            return err(RxnFlowError("invalid_input", "Stored export artifact must be an object.", target=target))
        record = _record_from_dict(value, target)
        if not record.ok or record.value is None:
            assert record.error is not None
            return err(record.error)
        validation = _validate_record(record.value, seen_ids, seen_paths, target)
        if validation is not None:
            return err(validation)
        artifacts.append(record.value)

    return ok(tuple(artifacts))


def _record_to_dict(record: ExportArtifactRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "format": record.format,
        "path": record.path,
        "checksum": record.checksum,
        "created_at": record.created_at,
        "metadata": record.metadata,
    }


def _record_from_dict(data: dict[str, Any], target: str) -> Result[ExportArtifactRecord]:
    for field in ("id", "format", "path", "checksum", "created_at", "metadata"):
        if field not in data:
            return err(
                RxnFlowError(
                    "invalid_input",
                    f"Export artifact record is missing field '{field}'.",
                    target=f"{target}.{field}",
                )
            )
    metadata = data["metadata"]
    if not isinstance(metadata, dict):
        return err(
            RxnFlowError(
                "invalid_input",
                "Export artifact metadata must be an object.",
                target=f"{target}.metadata",
            )
        )
    return ok(
        ExportArtifactRecord(
            id=cast(str, data["id"]),
            format=cast(ExportFormat, data["format"]),
            path=cast(str, data["path"]),
            checksum=cast(str, data["checksum"]),
            created_at=cast(str, data["created_at"]),
            metadata=metadata,
        )
    )


def _validate_record(
    record: ExportArtifactRecord,
    seen_ids: set[ID],
    seen_paths: set[str],
    target: str,
) -> RxnFlowError | None:
    if not isinstance(record.id, str) or not record.id:
        return RxnFlowError("invalid_input", "Export artifact id is required.", target=f"{target}.id")
    if record.id in seen_ids:
        return RxnFlowError("invalid_input", "Export artifact id is duplicated.", target=record.id)
    seen_ids.add(record.id)

    if not isinstance(record.format, str) or record.format not in ALLOWED_EXPORT_FORMATS:
        return RxnFlowError("invalid_input", "Export artifact format is unsupported.", target=f"{target}.format")

    path_error = _validate_artifact_path(record.path, f"{target}.path")
    if path_error is not None:
        return path_error
    if record.path in seen_paths:
        return RxnFlowError("invalid_input", "Export artifact path is duplicated.", target=record.path)
    seen_paths.add(record.path)

    checksum_error = _validate_checksum(record.checksum, f"{target}.checksum")
    if checksum_error is not None:
        return checksum_error

    if not isinstance(record.created_at, str) or not record.created_at:
        return RxnFlowError("invalid_input", "Export artifact created_at is required.", target=f"{target}.created_at")

    if not isinstance(record.metadata, dict):
        return RxnFlowError("invalid_input", "Export artifact metadata must be an object.", target=f"{target}.metadata")
    return _validate_json_safe_value(record.metadata, f"{target}.metadata")


def _validate_artifact_path(path: str, target: str) -> RxnFlowError | None:
    if not isinstance(path, str) or path.strip() == "":
        return RxnFlowError("invalid_input", "Export artifact path is required.", target=target)
    if "\\" in path:
        return RxnFlowError("invalid_input", "Export artifact path must be POSIX relative.", target=target)
    posix_path = PurePosixPath(path)
    if posix_path.is_absolute() or str(posix_path) in {"", "."} or ".." in posix_path.parts:
        return RxnFlowError("invalid_input", "Export artifact path must be project-relative.", target=target)
    if len(posix_path.parts) < 2 or posix_path.parts[0] != EXPORT_ARTIFACT_ROOT:
        return RxnFlowError("invalid_input", "Export artifact path must be under exports/.", target=target)
    return None


def _validate_checksum(checksum: str, target: str) -> RxnFlowError | None:
    if not isinstance(checksum, str) or _CHECKSUM_PATTERN.fullmatch(checksum) is None:
        return RxnFlowError("invalid_input", "Export artifact checksum must be sha256:<64 hex>.", target=target)
    return None


def _validate_json_safe_value(value: Any, target: str) -> RxnFlowError | None:
    if value is None or isinstance(value, (str, bool, int)):
        return None
    if isinstance(value, float):
        if not math.isfinite(value):
            return RxnFlowError("invalid_input", "Export artifact metadata number must be finite.", target=target)
        return None
    if isinstance(value, list):
        for index, item in enumerate(value):
            error = _validate_json_safe_value(item, f"{target}[{index}]")
            if error is not None:
                return error
        return None
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                return RxnFlowError("invalid_input", "Export artifact metadata keys must be strings.", target=target)
            error = _validate_json_safe_value(item, f"{target}.{key}")
            if error is not None:
                return error
        return None
    return RxnFlowError("invalid_input", "Export artifact metadata must be JSON-safe.", target=target)
