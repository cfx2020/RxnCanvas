"""Project content persistence for RxnFlow domain snapshots."""

from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
import json
import os
from pathlib import Path, PurePosixPath
from typing import Any, Protocol

from .chemical_object_codec import (
    chemical_objects_section_from_dict,
    chemical_objects_section_to_dict,
)
from .energy_profile_codec import (
    energy_profiles_section_from_dict,
    energy_profiles_section_to_dict,
)
from .errors import RxnFlowError
from .graph_workspace_codec import (
    reaction_graphs_section_from_dict,
    reaction_graphs_section_to_dict,
    workspace_snapshot_from_graph,
    workspaces_section_from_dict,
    workspaces_section_to_dict,
)
from .import_ledger_codec import (
    import_ledger_section_from_dict,
    import_ledger_section_to_dict,
)
from .import_workflow import ImportBatch
from .models import (
    ChemicalObject,
    CoreFixtureResult,
    EnergyProfile,
    ReactionGraph,
)
from .result import Result, err, ok
from .workspace import WorkspaceSnapshot


PROJECT_CONTENT_SCHEMA_VERSION = "project-content-v1"
PROJECT_CONTENT_TIME = "2026-05-05T00:00:00Z"
PROJECT_CONTENT_DIR = ".rxnflow/state"
PROJECT_CONTENT_INDEX_PATH = f"{PROJECT_CONTENT_DIR}/project-content.json"
CHEMICAL_OBJECTS_PATH = f"{PROJECT_CONTENT_DIR}/chemical-objects.json"
REACTION_GRAPHS_PATH = f"{PROJECT_CONTENT_DIR}/reaction-graphs.json"
WORKSPACES_PATH = f"{PROJECT_CONTENT_DIR}/workspaces.json"
ENERGY_PROFILES_PATH = f"{PROJECT_CONTENT_DIR}/energy-profiles.json"
IMPORT_LEDGER_PATH = f"{PROJECT_CONTENT_DIR}/import-ledger.json"

SECTION_PATHS: dict[str, str] = {
    "chemical_objects": CHEMICAL_OBJECTS_PATH,
    "reaction_graphs": REACTION_GRAPHS_PATH,
    "workspaces": WORKSPACES_PATH,
    "energy_profiles": ENERGY_PROFILES_PATH,
    "import_ledger": IMPORT_LEDGER_PATH,
}


@dataclass(frozen=True)
class ProjectContentFile:
    kind: str
    path: str
    checksum: str | None = None
    updated_at: str = PROJECT_CONTENT_TIME


@dataclass(frozen=True)
class ProjectContentIndex:
    schema_version: str
    project_id: str
    updated_at: str
    files: tuple[ProjectContentFile, ...] = ()


@dataclass(frozen=True)
class StorageObject:
    path: str
    bytes: bytes
    checksum: str | None = None
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class StorageObjectInfo:
    path: str
    checksum: str
    byte_size: int
    backend_id: str


@dataclass(frozen=True)
class WriteReceipt:
    path: str
    checksum: str
    byte_size: int
    updated_at: str
    backend_id: str


@dataclass(frozen=True)
class ProjectContentSnapshot:
    project_id: str
    chemical_objects: tuple[ChemicalObject, ...] = ()
    reaction_graphs: tuple[ReactionGraph, ...] = ()
    workspaces: tuple[WorkspaceSnapshot, ...] = ()
    energy_profiles: tuple[EnergyProfile, ...] = ()
    import_batches: tuple[ImportBatch, ...] = ()
    export_artifacts: tuple[Any, ...] = ()


class ProjectStorageBackend(Protocol):
    backend_id: str

    def read_object(self, project_ref: str | os.PathLike[str], path: str) -> Result[StorageObject]:
        ...

    def write_object(
        self,
        project_ref: str | os.PathLike[str],
        obj: StorageObject,
    ) -> Result[WriteReceipt]:
        ...

    def exists(self, project_ref: str | os.PathLike[str], path: str) -> Result[bool]:
        ...

    def list_objects(
        self,
        project_ref: str | os.PathLike[str],
        prefix: str,
    ) -> Result[tuple[StorageObjectInfo, ...]]:
        ...

    def delete_object(self, project_ref: str | os.PathLike[str], path: str) -> Result[None]:
        ...


class LocalProjectStorageBackend:
    backend_id = "local-filesystem-v1"

    def read_object(self, project_ref: str | os.PathLike[str], path: str) -> Result[StorageObject]:
        resolved = _resolve_project_path(project_ref, path)
        if not resolved.ok or resolved.value is None:
            assert resolved.error is not None
            return err(resolved.error)
        target = resolved.value
        if not target.is_file():
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Project storage object does not exist.",
                    target="path",
                    details={"path": path},
                )
            )
        try:
            payload = target.read_bytes()
        except OSError as exc:
            return err(
                RxnFlowError(
                    "internal_error",
                    f"Could not read project storage object: {exc}.",
                    target=str(target),
                )
            )
        return ok(StorageObject(path=path, bytes=payload, checksum=_checksum_bytes(payload)))

    def write_object(
        self,
        project_ref: str | os.PathLike[str],
        obj: StorageObject,
    ) -> Result[WriteReceipt]:
        resolved = _resolve_project_path(project_ref, obj.path)
        if not resolved.ok or resolved.value is None:
            assert resolved.error is not None
            return err(resolved.error)
        target = resolved.value
        checksum = _checksum_bytes(obj.bytes)
        tmp_path = target.with_name(f"{target.name}.tmp")
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp_path.write_bytes(obj.bytes)
            tmp_path.replace(target)
        except OSError as exc:
            return err(
                RxnFlowError(
                    "internal_error",
                    f"Could not write project storage object: {exc}.",
                    target=str(target),
                )
            )
        return ok(
            WriteReceipt(
                path=obj.path,
                checksum=checksum,
                byte_size=len(obj.bytes),
                updated_at=PROJECT_CONTENT_TIME,
                backend_id=self.backend_id,
            )
        )

    def exists(self, project_ref: str | os.PathLike[str], path: str) -> Result[bool]:
        resolved = _resolve_project_path(project_ref, path)
        if not resolved.ok or resolved.value is None:
            assert resolved.error is not None
            return err(resolved.error)
        return ok(resolved.value.exists())

    def list_objects(
        self,
        project_ref: str | os.PathLike[str],
        prefix: str,
    ) -> Result[tuple[StorageObjectInfo, ...]]:
        resolved = _resolve_project_path(project_ref, prefix)
        if not resolved.ok or resolved.value is None:
            assert resolved.error is not None
            return err(resolved.error)
        root_result = _resolve_project_root(project_ref)
        if not root_result.ok or root_result.value is None:
            assert root_result.error is not None
            return err(root_result.error)
        root = root_result.value
        prefix_path = resolved.value
        if not prefix_path.exists():
            return ok(())
        files = [prefix_path] if prefix_path.is_file() else sorted(path for path in prefix_path.rglob("*") if path.is_file())
        infos: list[StorageObjectInfo] = []
        for path in files:
            try:
                payload = path.read_bytes()
            except OSError as exc:
                return err(
                    RxnFlowError(
                        "internal_error",
                        f"Could not read project storage object: {exc}.",
                        target=str(path),
                    )
                )
            infos.append(
                StorageObjectInfo(
                    path=path.relative_to(root).as_posix(),
                    checksum=_checksum_bytes(payload),
                    byte_size=len(payload),
                    backend_id=self.backend_id,
                )
            )
        return ok(tuple(infos))

    def delete_object(self, project_ref: str | os.PathLike[str], path: str) -> Result[None]:
        resolved = _resolve_project_path(project_ref, path)
        if not resolved.ok or resolved.value is None:
            assert resolved.error is not None
            return err(resolved.error)
        try:
            if resolved.value.exists():
                resolved.value.unlink()
        except OSError as exc:
            return err(
                RxnFlowError(
                    "internal_error",
                    f"Could not delete project storage object: {exc}.",
                    target=str(resolved.value),
                )
            )
        return ok(None)


class ProjectContentStore:
    def __init__(self, backend: ProjectStorageBackend | None = None) -> None:
        self._backend = backend or LocalProjectStorageBackend()

    def save_snapshot(
        self,
        project_ref: str | os.PathLike[str],
        snapshot: ProjectContentSnapshot,
    ) -> Result[ProjectContentIndex]:
        validation = _validate_snapshot_for_v1(snapshot)
        if validation is not None:
            return err(validation)

        sections_result = _snapshot_sections(snapshot)
        if not sections_result.ok or sections_result.value is None:
            assert sections_result.error is not None
            return err(sections_result.error)

        files: list[ProjectContentFile] = []
        for kind, path, data in sections_result.value:
            payload = _json_bytes(data)
            write_result = self._backend.write_object(project_ref, StorageObject(path, payload))
            if not write_result.ok or write_result.value is None:
                assert write_result.error is not None
                return err(write_result.error)
            files.append(
                ProjectContentFile(
                    kind=kind,
                    path=path,
                    checksum=write_result.value.checksum,
                    updated_at=write_result.value.updated_at,
                )
            )

        index = ProjectContentIndex(
            schema_version=PROJECT_CONTENT_SCHEMA_VERSION,
            project_id=snapshot.project_id,
            updated_at=PROJECT_CONTENT_TIME,
            files=tuple(files),
        )
        index_payload = _json_bytes(_project_content_index_to_dict(index))
        write_index = self._backend.write_object(
            project_ref,
            StorageObject(PROJECT_CONTENT_INDEX_PATH, index_payload),
        )
        if not write_index.ok or write_index.value is None:
            assert write_index.error is not None
            return err(write_index.error)
        return ok(index)

    def load_index(self, project_ref: str | os.PathLike[str]) -> Result[ProjectContentIndex]:
        read_result = self._backend.read_object(project_ref, PROJECT_CONTENT_INDEX_PATH)
        if not read_result.ok or read_result.value is None:
            assert read_result.error is not None
            return err(read_result.error)
        data_result = _json_from_bytes(read_result.value.bytes, PROJECT_CONTENT_INDEX_PATH)
        if not data_result.ok or data_result.value is None:
            assert data_result.error is not None
            return err(data_result.error)
        return _project_content_index_from_dict(data_result.value, PROJECT_CONTENT_INDEX_PATH)

    def load_snapshot(self, project_ref: str | os.PathLike[str]) -> Result[ProjectContentSnapshot]:
        index_result = self.load_index(project_ref)
        if not index_result.ok or index_result.value is None:
            assert index_result.error is not None
            return err(index_result.error)
        index = index_result.value

        section_data: dict[str, dict[str, Any]] = {}
        for file in index.files:
            read_result = self._backend.read_object(project_ref, file.path)
            if not read_result.ok or read_result.value is None:
                assert read_result.error is not None
                return err(read_result.error)
            data_result = _json_from_bytes(read_result.value.bytes, file.path)
            if not data_result.ok or data_result.value is None:
                assert data_result.error is not None
                return err(data_result.error)
            section_data[file.kind] = data_result.value

        return _snapshot_from_sections(index.project_id, section_data)


def project_content_snapshot_from_fixture(result: CoreFixtureResult) -> ProjectContentSnapshot:
    workspace = workspace_snapshot_from_graph(
        result.project.id,
        result.graph,
        result.objects,
        result.graph.paths[0].id if result.graph.paths else None,
    )
    return ProjectContentSnapshot(
        project_id=result.project.id,
        chemical_objects=result.objects,
        reaction_graphs=(result.graph,),
        workspaces=(workspace,),
        energy_profiles=(result.profile,),
    )


def _resolve_project_root(project_ref: str | os.PathLike[str]) -> Result[Path]:
    if str(project_ref).strip() == "":
        return err(RxnFlowError("invalid_input", "Project reference is required.", target="project_ref"))
    return ok(Path(project_ref))


def _resolve_project_path(project_ref: str | os.PathLike[str], path: str) -> Result[Path]:
    root_result = _resolve_project_root(project_ref)
    if not root_result.ok or root_result.value is None:
        assert root_result.error is not None
        return err(root_result.error)
    path_error = _validate_logical_path(path)
    if path_error is not None:
        return err(path_error)
    return ok(root_result.value / PurePosixPath(path))


def _validate_logical_path(path: str) -> RxnFlowError | None:
    if not isinstance(path, str) or path.strip() == "":
        return RxnFlowError("invalid_input", "Project storage path is required.", target="path")
    if "\\" in path:
        return RxnFlowError("invalid_input", "Project storage path must be POSIX relative.", target="path")
    posix_path = PurePosixPath(path)
    if posix_path.is_absolute() or str(posix_path) in {"", "."} or ".." in posix_path.parts:
        return RxnFlowError("invalid_input", "Project storage path must be project-relative.", target="path")
    return None


def _checksum_bytes(payload: bytes) -> str:
    return f"sha256:{sha256(payload).hexdigest()}"


def _json_bytes(data: dict[str, Any]) -> bytes:
    return (json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _json_from_bytes(payload: bytes, target: str) -> Result[dict[str, Any]]:
    try:
        data = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Project content JSON is invalid: {exc}.",
                target=target,
            )
        )
    if not isinstance(data, dict):
        return err(RxnFlowError("invalid_input", "Project content JSON must be an object.", target=target))
    return ok(data)


def _validate_snapshot_for_v1(snapshot: ProjectContentSnapshot) -> RxnFlowError | None:
    if not snapshot.project_id:
        return RxnFlowError("invalid_input", "Project content snapshot requires project_id.", target="project_id")
    if snapshot.export_artifacts:
        return RxnFlowError(
            "invalid_input",
            "project-content-v1 does not persist export artifact indexes yet.",
            target="snapshot",
        )
    return None


def _snapshot_sections(
    snapshot: ProjectContentSnapshot,
) -> Result[tuple[tuple[str, str, dict[str, Any]], ...]]:
    chemical_objects_result = chemical_objects_section_to_dict(
        snapshot.project_id,
        snapshot.chemical_objects,
    )
    if not chemical_objects_result.ok or chemical_objects_result.value is None:
        assert chemical_objects_result.error is not None
        return err(chemical_objects_result.error)

    object_ids = {obj.id for obj in snapshot.chemical_objects}
    import_ledger_result = import_ledger_section_to_dict(
        snapshot.project_id,
        snapshot.import_batches,
        object_ids=object_ids,
    )
    if not import_ledger_result.ok or import_ledger_result.value is None:
        assert import_ledger_result.error is not None
        return err(import_ledger_result.error)

    graphs_result = reaction_graphs_section_to_dict(
        snapshot.project_id,
        snapshot.reaction_graphs,
        object_ids=object_ids,
    )
    if not graphs_result.ok or graphs_result.value is None:
        assert graphs_result.error is not None
        return err(graphs_result.error)

    workspaces_result = workspaces_section_to_dict(
        snapshot.project_id,
        snapshot.workspaces,
        graphs=snapshot.reaction_graphs,
        updated_at=PROJECT_CONTENT_TIME,
    )
    if not workspaces_result.ok or workspaces_result.value is None:
        assert workspaces_result.error is not None
        return err(workspaces_result.error)

    energy_profiles_result = energy_profiles_section_to_dict(
        snapshot.project_id,
        snapshot.energy_profiles,
        graphs=snapshot.reaction_graphs,
    )
    if not energy_profiles_result.ok or energy_profiles_result.value is None:
        assert energy_profiles_result.error is not None
        return err(energy_profiles_result.error)

    return ok(
        (
            (
                "chemical_objects",
                SECTION_PATHS["chemical_objects"],
                chemical_objects_result.value,
            ),
            (
                "reaction_graphs",
                SECTION_PATHS["reaction_graphs"],
                graphs_result.value,
            ),
            (
                "workspaces",
                SECTION_PATHS["workspaces"],
                workspaces_result.value,
            ),
            (
                "energy_profiles",
                SECTION_PATHS["energy_profiles"],
                energy_profiles_result.value,
            ),
            (
                "import_ledger",
                SECTION_PATHS["import_ledger"],
                import_ledger_result.value,
            ),
        )
    )


def _snapshot_from_sections(
    project_id: str,
    sections: dict[str, dict[str, Any]],
) -> Result[ProjectContentSnapshot]:
    chemical_objects_result = _chemical_objects_from_section(project_id, sections.get("chemical_objects"))
    if not chemical_objects_result.ok or chemical_objects_result.value is None:
        assert chemical_objects_result.error is not None
        return err(chemical_objects_result.error)

    object_ids = {obj.id for obj in chemical_objects_result.value}
    import_batches_result = import_ledger_section_from_dict(
        project_id,
        sections.get("import_ledger"),
        object_ids=object_ids,
    )
    if not import_batches_result.ok or import_batches_result.value is None:
        assert import_batches_result.error is not None
        return err(import_batches_result.error)

    graphs_result = reaction_graphs_section_from_dict(
        project_id,
        sections.get("reaction_graphs"),
        object_ids=object_ids,
    )
    if not graphs_result.ok or graphs_result.value is None:
        assert graphs_result.error is not None
        return err(graphs_result.error)

    profiles_result = energy_profiles_section_from_dict(
        project_id,
        sections.get("energy_profiles"),
        graphs=graphs_result.value,
    )
    if not profiles_result.ok or profiles_result.value is None:
        assert profiles_result.error is not None
        return err(profiles_result.error)

    workspaces_result = workspaces_section_from_dict(
        project_id,
        sections.get("workspaces"),
        graphs_result.value,
        chemical_objects_result.value,
    )
    if not workspaces_result.ok or workspaces_result.value is None:
        assert workspaces_result.error is not None
        return err(workspaces_result.error)

    return ok(
        ProjectContentSnapshot(
            project_id=project_id,
            chemical_objects=chemical_objects_result.value,
            reaction_graphs=graphs_result.value,
            workspaces=workspaces_result.value,
            energy_profiles=profiles_result.value,
            import_batches=import_batches_result.value,
        )
    )


def _project_content_index_to_dict(index: ProjectContentIndex) -> dict[str, Any]:
    return {
        "schema_version": index.schema_version,
        "project_id": index.project_id,
        "updated_at": index.updated_at,
        "files": [
            {
                "kind": file.kind,
                "path": file.path,
                "checksum": file.checksum,
                "updated_at": file.updated_at,
            }
            for file in index.files
        ],
    }


def _project_content_index_from_dict(data: dict[str, Any], target: str) -> Result[ProjectContentIndex]:
    if data.get("schema_version") != PROJECT_CONTENT_SCHEMA_VERSION:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Unsupported project content schema_version '{data.get('schema_version')}'.",
                target="schema_version",
            )
        )
    files_raw = data.get("files", [])
    if not isinstance(files_raw, list):
        return err(RxnFlowError("invalid_input", "Project content files must be a list.", target=target))
    files: list[ProjectContentFile] = []
    for index, value in enumerate(files_raw):
        if not isinstance(value, dict):
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Project content file entry must be an object.",
                    target=f"{target}.files[{index}]",
                )
            )
        path = str(value.get("path", ""))
        path_error = _validate_logical_path(path)
        if path_error is not None:
            return err(path_error)
        files.append(
            ProjectContentFile(
                kind=str(value.get("kind", "")),
                path=path,
                checksum=value.get("checksum"),
                updated_at=str(value.get("updated_at", PROJECT_CONTENT_TIME)),
            )
        )
    try:
        return ok(
            ProjectContentIndex(
                schema_version=str(data["schema_version"]),
                project_id=str(data["project_id"]),
                updated_at=str(data.get("updated_at", PROJECT_CONTENT_TIME)),
                files=tuple(files),
            )
        )
    except KeyError as exc:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Project content index is missing field '{exc.args[0]}'.",
                target=target,
            )
        )


def _chemical_objects_from_section(
    project_id: str,
    data: dict[str, Any] | None,
) -> Result[tuple[ChemicalObject, ...]]:
    return chemical_objects_section_from_dict(project_id, data)
