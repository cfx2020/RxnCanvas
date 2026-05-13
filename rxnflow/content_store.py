"""Project content persistence for RxnFlow domain snapshots."""

from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
import json
import os
from pathlib import Path, PurePosixPath
from typing import Any, Literal, Protocol

from .chemical_object_codec import (
    chemical_objects_section_from_dict,
    chemical_objects_section_to_dict,
)
from .energy_profile_codec import (
    energy_profiles_section_from_dict,
    energy_profiles_section_to_dict,
)
from .errors import RxnFlowError
from .export import ExportArtifactRecord
from .export_artifact_codec import (
    export_artifacts_section_from_dict,
    export_artifacts_section_to_dict,
)
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
    ProjectResource,
    ReactionGraph,
)
from .project_manifest import project_manifest_from_dict
from .result import Result, err, ok
from .workspace import WorkspaceSnapshot


PROJECT_CONTENT_SCHEMA_VERSION = "project-content-v1"
PROJECT_CONTENT_TIME = "2026-05-05T00:00:00Z"
PROJECT_CONTENT_DIR = ".rxnflow/state"
PROJECT_CONTENT_INDEX_PATH = f"{PROJECT_CONTENT_DIR}/project-content.json"
PROJECT_MANIFEST_PATH = ".rxnflow/manifest.json"
CHEMICAL_OBJECTS_PATH = f"{PROJECT_CONTENT_DIR}/chemical-objects.json"
REACTION_GRAPHS_PATH = f"{PROJECT_CONTENT_DIR}/reaction-graphs.json"
WORKSPACES_PATH = f"{PROJECT_CONTENT_DIR}/workspaces.json"
ENERGY_PROFILES_PATH = f"{PROJECT_CONTENT_DIR}/energy-profiles.json"
IMPORT_LEDGER_PATH = f"{PROJECT_CONTENT_DIR}/import-ledger.json"
EXPORT_ARTIFACTS_PATH = f"{PROJECT_CONTENT_DIR}/export-artifacts.json"

SECTION_PATHS: dict[str, str] = {
    "chemical_objects": CHEMICAL_OBJECTS_PATH,
    "reaction_graphs": REACTION_GRAPHS_PATH,
    "workspaces": WORKSPACES_PATH,
    "energy_profiles": ENERGY_PROFILES_PATH,
    "import_ledger": IMPORT_LEDGER_PATH,
    "export_artifacts": EXPORT_ARTIFACTS_PATH,
}


ProjectContentValidationSeverity = Literal["error", "warning"]


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
    export_artifacts: tuple[ExportArtifactRecord, ...] = ()


@dataclass(frozen=True)
class ProjectContentValidationIssue:
    severity: ProjectContentValidationSeverity
    code: str
    message: str
    target: str | None = None
    details: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.severity not in {"error", "warning"}:
            raise ValueError("Validation issue severity must be 'error' or 'warning'.")
        object.__setattr__(self, "details", _json_safe_dict(self.details, "details"))


@dataclass(frozen=True)
class ProjectContentValidationReport:
    project_id: str | None
    schema_version: str | None
    issues: tuple[ProjectContentValidationIssue, ...] = ()
    checked_at: str = PROJECT_CONTENT_TIME
    summary: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        issues = tuple(self.issues)
        object.__setattr__(self, "issues", issues)
        summary = self.summary if self.summary else _validation_summary(issues)
        object.__setattr__(self, "summary", _json_safe_dict(summary, "summary"))

    @property
    def ok(self) -> bool:
        return not any(issue.severity == "error" for issue in self.issues)


@dataclass(frozen=True)
class ProjectContentMigrationPlan:
    current_schema_version: str | None
    target_schema_version: str
    needed: bool
    steps: tuple[str, ...] = ()
    issues: tuple[ProjectContentValidationIssue, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "steps", tuple(self.steps))
        object.__setattr__(self, "issues", tuple(self.issues))


@dataclass(frozen=True)
class _ValidationIndexFile:
    kind: str
    path: str
    checksum: str | None
    readable: bool = True


@dataclass(frozen=True)
class _DecodedSections:
    chemical_objects: tuple[ChemicalObject, ...] = ()
    reaction_graphs: tuple[ReactionGraph, ...] = ()
    workspaces: tuple[WorkspaceSnapshot, ...] = ()
    energy_profiles: tuple[EnergyProfile, ...] = ()
    import_batches: tuple[ImportBatch, ...] = ()
    export_artifacts: tuple[ExportArtifactRecord, ...] = ()


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


class ProjectContentValidator:
    def __init__(self, backend: ProjectStorageBackend | None = None) -> None:
        self._backend = backend or LocalProjectStorageBackend()

    def validate_project(self, project_ref: str | os.PathLike[str]) -> Result[ProjectContentValidationReport]:
        issues: list[ProjectContentValidationIssue] = []

        index_read = self._read_object(project_ref, PROJECT_CONTENT_INDEX_PATH, issues, "index_missing")
        if not index_read.ok or index_read.value is None:
            if index_read.error is not None:
                return err(index_read.error)
            return ok(ProjectContentValidationReport(None, None, issues=tuple(issues)))

        index_data = _json_from_bytes_for_validation(index_read.value.bytes, PROJECT_CONTENT_INDEX_PATH, issues)
        if index_data is None:
            return ok(ProjectContentValidationReport(None, None, issues=tuple(issues)))

        schema_version = index_data.get("schema_version")
        schema = schema_version if isinstance(schema_version, str) else None
        if schema != PROJECT_CONTENT_SCHEMA_VERSION:
            issues.append(
                _validation_issue(
                    "error",
                    "index_schema",
                    f"Unsupported project content schema_version '{schema_version}'.",
                    "schema_version",
                    {"expected": PROJECT_CONTENT_SCHEMA_VERSION, "actual": schema_version},
                )
            )

        project_id_value = index_data.get("project_id")
        project_id = project_id_value if isinstance(project_id_value, str) and project_id_value else None
        if project_id is None:
            issues.append(
                _validation_issue(
                    "error",
                    "index_project_id",
                    "Project content index requires a non-empty project_id.",
                    "project_id",
                    {"actual": project_id_value},
                )
            )

        files = _validation_index_files(index_data, issues)
        section_data = self._read_section_data(project_ref, files, issues)
        decoded = _DecodedSections()
        if project_id is not None:
            decoded = _decode_sections_for_validation(project_id, section_data, issues)
            raw_resources = self._manifest_raw_resources(project_ref, issues)
            _validate_source_file_refs(decoded, raw_resources, issues)
            artifact_result = self._validate_export_artifacts(project_ref, decoded, issues)
            if not artifact_result.ok:
                assert artifact_result.error is not None
                return err(artifact_result.error)

        return ok(ProjectContentValidationReport(project_id, schema, issues=tuple(issues)))

    def migration_plan(
        self,
        project_ref: str | os.PathLike[str],
        target_schema_version: str = PROJECT_CONTENT_SCHEMA_VERSION,
    ) -> Result[ProjectContentMigrationPlan]:
        issues: list[ProjectContentValidationIssue] = []
        current_schema_version: str | None = None

        index_read = self._read_object(project_ref, PROJECT_CONTENT_INDEX_PATH, issues, "index_missing")
        if not index_read.ok:
            if index_read.error is not None:
                return err(index_read.error)
        elif index_read.value is not None:
            index_data = _json_from_bytes_for_validation(index_read.value.bytes, PROJECT_CONTENT_INDEX_PATH, issues)
            if index_data is not None:
                schema = index_data.get("schema_version")
                current_schema_version = schema if isinstance(schema, str) else None

        if target_schema_version != PROJECT_CONTENT_SCHEMA_VERSION:
            issues.append(
                _validation_issue(
                    "error",
                    "unsupported_migration_target",
                    f"Unsupported project content migration target '{target_schema_version}'.",
                    "target_schema_version",
                    {"supported": PROJECT_CONTENT_SCHEMA_VERSION, "actual": target_schema_version},
                )
            )
        elif current_schema_version not in {None, PROJECT_CONTENT_SCHEMA_VERSION}:
            issues.append(
                _validation_issue(
                    "error",
                    "unsupported_migration_source",
                    f"Unsupported project content migration source '{current_schema_version}'.",
                    "schema_version",
                    {"supported": PROJECT_CONTENT_SCHEMA_VERSION, "actual": current_schema_version},
                )
            )

        return ok(
            ProjectContentMigrationPlan(
                current_schema_version=current_schema_version,
                target_schema_version=target_schema_version,
                needed=False,
                steps=(),
                issues=tuple(issues),
            )
        )

    def _read_section_data(
        self,
        project_ref: str | os.PathLike[str],
        files: tuple[_ValidationIndexFile, ...],
        issues: list[ProjectContentValidationIssue],
    ) -> dict[str, dict[str, Any]]:
        section_data: dict[str, dict[str, Any]] = {}
        for file in files:
            if not file.readable:
                continue
            read_result = self._read_object(project_ref, file.path, issues, "missing_section")
            if not read_result.ok:
                assert read_result.error is not None
                continue
            if read_result.value is None:
                continue
            if _checksum_is_valid(file.checksum) and read_result.value.checksum != file.checksum:
                issues.append(
                    _validation_issue(
                        "error",
                        "checksum_mismatch",
                        "Section checksum does not match project content index.",
                        file.path,
                        {"expected": file.checksum, "actual": read_result.value.checksum, "kind": file.kind},
                    )
                )
            data = _json_from_bytes_for_validation(read_result.value.bytes, file.path, issues)
            if data is not None:
                section_data[file.kind] = data
        return section_data

    def _manifest_raw_resources(
        self,
        project_ref: str | os.PathLike[str],
        issues: list[ProjectContentValidationIssue],
    ) -> tuple[ProjectResource, ...]:
        manifest_read = self._read_object(project_ref, PROJECT_MANIFEST_PATH, issues, "manifest_missing", "warning")
        if not manifest_read.ok or manifest_read.value is None:
            return ()
        manifest_data = _json_from_bytes_for_validation(
            manifest_read.value.bytes,
            PROJECT_MANIFEST_PATH,
            issues,
            "manifest_bad_json",
            "warning",
        )
        if manifest_data is None:
            return ()
        manifest_result = project_manifest_from_dict(manifest_data, PROJECT_MANIFEST_PATH)
        if not manifest_result.ok or manifest_result.value is None:
            assert manifest_result.error is not None
            issues.append(_issue_from_error(manifest_result.error, "manifest_invalid", "warning"))
            return ()
        return tuple(resource for resource in manifest_result.value.resources if resource.kind == "raw_file")

    def _validate_export_artifacts(
        self,
        project_ref: str | os.PathLike[str],
        decoded: _DecodedSections,
        issues: list[ProjectContentValidationIssue],
    ) -> Result[None]:
        graph_ids = {graph.id for graph in decoded.reaction_graphs}
        path_ids = {path.id for graph in decoded.reaction_graphs for path in graph.paths}
        profile_ids = {profile.id for profile in decoded.energy_profiles}
        for artifact in decoded.export_artifacts:
            _validate_export_artifact_metadata(artifact, graph_ids, path_ids, profile_ids, issues)
            read_result = self._read_object(project_ref, artifact.path, issues, "artifact_missing")
            if not read_result.ok:
                assert read_result.error is not None
                return err(read_result.error)
            if read_result.value is None:
                continue
            if read_result.value.checksum != artifact.checksum:
                issues.append(
                    _validation_issue(
                        "error",
                        "artifact_checksum_mismatch",
                        "Export artifact checksum does not match the recorded checksum.",
                        artifact.path,
                        {"expected": artifact.checksum, "actual": read_result.value.checksum, "artifact_id": artifact.id},
                    )
                )
        return ok(None)

    def _read_object(
        self,
        project_ref: str | os.PathLike[str],
        path: str,
        issues: list[ProjectContentValidationIssue],
        issue_code: str,
        severity: ProjectContentValidationSeverity = "error",
    ) -> Result[StorageObject | None]:
        read_result = self._backend.read_object(project_ref, path)
        if read_result.ok:
            return ok(read_result.value)
        assert read_result.error is not None
        if read_result.error.code == "internal_error":
            return err(read_result.error)
        issues.append(
            _validation_issue(
                severity,
                issue_code,
                read_result.error.message,
                path,
                {"error_code": read_result.error.code, "error_target": read_result.error.target},
            )
        )
        return ok(None)


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

    def validate_project(self, project_ref: str | os.PathLike[str]) -> Result[ProjectContentValidationReport]:
        return ProjectContentValidator(self._backend).validate_project(project_ref)

    def migration_plan(
        self,
        project_ref: str | os.PathLike[str],
        target_schema_version: str = PROJECT_CONTENT_SCHEMA_VERSION,
    ) -> Result[ProjectContentMigrationPlan]:
        return ProjectContentValidator(self._backend).migration_plan(project_ref, target_schema_version)


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


def _json_safe_dict(value: dict[str, Any], target: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"Project content validation {target} must be an object.")
    if not all(isinstance(key, str) for key in value):
        raise ValueError(f"Project content validation {target} keys must be strings.")
    try:
        json.dumps(value, ensure_ascii=False, sort_keys=True)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Project content validation {target} must be JSON-safe: {exc}.") from exc
    return dict(value)


def _validation_summary(issues: tuple[ProjectContentValidationIssue, ...]) -> dict[str, int]:
    error_count = sum(1 for issue in issues if issue.severity == "error")
    warning_count = sum(1 for issue in issues if issue.severity == "warning")
    return {
        "total": len(issues),
        "errors": error_count,
        "warnings": warning_count,
    }


def _json_from_bytes_for_validation(
    payload: bytes,
    target: str,
    issues: list[ProjectContentValidationIssue],
    code: str = "bad_json",
    severity: ProjectContentValidationSeverity = "error",
) -> dict[str, Any] | None:
    try:
        data = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        issues.append(
            _validation_issue(
                severity,
                code,
                f"Project content JSON is invalid: {exc}.",
                target,
                {"error": str(exc)},
            )
        )
        return None
    if not isinstance(data, dict):
        issues.append(
            _validation_issue(
                severity,
                code,
                "Project content JSON must be an object.",
                target,
                {"actual_type": type(data).__name__},
            )
        )
        return None
    return data


def _validation_index_files(
    data: dict[str, Any],
    issues: list[ProjectContentValidationIssue],
) -> tuple[_ValidationIndexFile, ...]:
    files_raw = data.get("files", [])
    if not isinstance(files_raw, list):
        issues.append(
            _validation_issue(
                "error",
                "index_files",
                "Project content files must be a list.",
                PROJECT_CONTENT_INDEX_PATH,
                {"actual_type": type(files_raw).__name__},
            )
        )
        return ()

    files: list[_ValidationIndexFile] = []
    seen_kinds: set[str] = set()
    seen_paths: set[str] = set()
    for index, value in enumerate(files_raw):
        target = f"{PROJECT_CONTENT_INDEX_PATH}.files[{index}]"
        if not isinstance(value, dict):
            issues.append(
                _validation_issue(
                    "error",
                    "index_file_entry",
                    "Project content file entry must be an object.",
                    target,
                    {"actual_type": type(value).__name__},
                )
            )
            continue

        kind_value = value.get("kind")
        kind = kind_value if isinstance(kind_value, str) else ""
        if not kind:
            issues.append(
                _validation_issue(
                    "error",
                    "invalid_section_kind",
                    "Project content file kind is required.",
                    f"{target}.kind",
                    {"actual": kind_value},
                )
            )
        elif kind in seen_kinds:
            issues.append(
                _validation_issue(
                    "error",
                    "duplicate_section_kind",
                    "Project content file kind is duplicated.",
                    f"{target}.kind",
                    {"kind": kind},
                )
            )
        else:
            seen_kinds.add(kind)
            if kind not in SECTION_PATHS:
                issues.append(
                    _validation_issue(
                        "warning",
                        "unknown_section_kind",
                        "Project content file kind is not a known RxnFlow section.",
                        f"{target}.kind",
                        {"kind": kind},
                    )
                )

        path_value = value.get("path")
        path = path_value if isinstance(path_value, str) else ""
        readable = True
        path_error = _validate_logical_path(path)
        if not isinstance(path_value, str) or path_error is not None:
            issues.append(
                _validation_issue(
                    "error",
                    "invalid_section_path",
                    "Project content file path must be a safe project-relative POSIX path.",
                    f"{target}.path",
                    {"actual": path_value},
                )
            )
            readable = False
        elif path in seen_paths:
            issues.append(
                _validation_issue(
                    "error",
                    "duplicate_section_path",
                    "Project content file path is duplicated.",
                    f"{target}.path",
                    {"path": path},
                )
            )
        else:
            seen_paths.add(path)

        canonical_path = SECTION_PATHS.get(kind)
        if canonical_path is not None and path and path != canonical_path:
            issues.append(
                _validation_issue(
                    "error",
                    "canonical_path_mismatch",
                    "Project content file path does not match the canonical section path.",
                    f"{target}.path",
                    {"kind": kind, "expected": canonical_path, "actual": path},
                )
            )

        checksum_value = value.get("checksum")
        checksum = checksum_value if isinstance(checksum_value, str) else None
        if not _checksum_is_valid(checksum_value):
            issues.append(
                _validation_issue(
                    "error",
                    "invalid_checksum",
                    "Project content file checksum must be sha256:<64 hex>.",
                    f"{target}.checksum",
                    {"actual": checksum_value},
                )
            )

        files.append(_ValidationIndexFile(kind=kind, path=path, checksum=checksum, readable=readable))
    return tuple(files)


def _decode_sections_for_validation(
    project_id: str,
    sections: dict[str, dict[str, Any]],
    issues: list[ProjectContentValidationIssue],
) -> _DecodedSections:
    chemical_objects: tuple[ChemicalObject, ...] = ()
    reaction_graphs: tuple[ReactionGraph, ...] = ()
    workspaces: tuple[WorkspaceSnapshot, ...] = ()
    energy_profiles: tuple[EnergyProfile, ...] = ()
    import_batches: tuple[ImportBatch, ...] = ()
    export_artifacts: tuple[ExportArtifactRecord, ...] = ()

    chemical_objects_result = _chemical_objects_from_section(project_id, sections.get("chemical_objects"))
    if chemical_objects_result.ok and chemical_objects_result.value is not None:
        chemical_objects = chemical_objects_result.value
    else:
        assert chemical_objects_result.error is not None
        issues.append(_issue_from_error(chemical_objects_result.error, "section_decode_error"))

    object_ids = {obj.id for obj in chemical_objects}
    import_batches_result = import_ledger_section_from_dict(
        project_id,
        sections.get("import_ledger"),
        object_ids=object_ids,
    )
    if import_batches_result.ok and import_batches_result.value is not None:
        import_batches = import_batches_result.value
    else:
        assert import_batches_result.error is not None
        issues.append(_issue_from_error(import_batches_result.error, "section_decode_error"))

    graphs_result = reaction_graphs_section_from_dict(
        project_id,
        sections.get("reaction_graphs"),
        object_ids=object_ids,
    )
    if graphs_result.ok and graphs_result.value is not None:
        reaction_graphs = graphs_result.value
    else:
        assert graphs_result.error is not None
        issues.append(_issue_from_error(graphs_result.error, "section_decode_error"))

    profiles_result = energy_profiles_section_from_dict(
        project_id,
        sections.get("energy_profiles"),
        graphs=reaction_graphs,
    )
    if profiles_result.ok and profiles_result.value is not None:
        energy_profiles = profiles_result.value
    else:
        assert profiles_result.error is not None
        issues.append(_issue_from_error(profiles_result.error, "section_decode_error"))

    export_artifacts_result = export_artifacts_section_from_dict(
        project_id,
        sections.get("export_artifacts"),
    )
    if export_artifacts_result.ok and export_artifacts_result.value is not None:
        export_artifacts = export_artifacts_result.value
    else:
        assert export_artifacts_result.error is not None
        issues.append(_issue_from_error(export_artifacts_result.error, "section_decode_error"))

    workspaces_result = workspaces_section_from_dict(
        project_id,
        sections.get("workspaces"),
        reaction_graphs,
        chemical_objects,
    )
    if workspaces_result.ok and workspaces_result.value is not None:
        workspaces = workspaces_result.value
    else:
        assert workspaces_result.error is not None
        issues.append(_issue_from_error(workspaces_result.error, "section_decode_error"))

    return _DecodedSections(
        chemical_objects=chemical_objects,
        reaction_graphs=reaction_graphs,
        workspaces=workspaces,
        energy_profiles=energy_profiles,
        import_batches=import_batches,
        export_artifacts=export_artifacts,
    )


def _validate_source_file_refs(
    decoded: _DecodedSections,
    raw_resources: tuple[ProjectResource, ...],
    issues: list[ProjectContentValidationIssue],
) -> None:
    manifest_raw_ids = {resource.id for resource in raw_resources}
    import_raw_ids: set[str] = set()
    for batch in decoded.import_batches:
        for item in batch.items:
            if item.raw_resource is not None:
                import_raw_ids.add(item.raw_resource.id)
                if manifest_raw_ids and item.raw_resource.id not in manifest_raw_ids:
                    issues.append(
                        _validation_issue(
                            "warning",
                            "raw_resource_missing",
                            "Import item raw_resource_id is not anchored in the project manifest.",
                            item.raw_resource.id,
                            {"batch_id": batch.id, "item_id": item.id},
                        )
                    )
            if item.preview is not None:
                import_raw_ids.add(item.preview.raw_resource_id)
                if manifest_raw_ids and item.preview.raw_resource_id not in manifest_raw_ids:
                    issues.append(
                        _validation_issue(
                            "warning",
                            "raw_resource_missing",
                            "Import preview raw_resource_id is not anchored in the project manifest.",
                            item.preview.raw_resource_id,
                            {"batch_id": batch.id, "item_id": item.id},
                        )
                    )

    anchors = manifest_raw_ids | import_raw_ids
    for obj in decoded.chemical_objects:
        if obj.source_file_id and obj.source_file_id not in anchors:
            issues.append(
                _validation_issue(
                    "warning",
                    "source_file_missing",
                    "ChemicalObject.source_file_id is not anchored in manifest raw files or import ledger.",
                    obj.source_file_id,
                    {"object_id": obj.id},
                )
            )


def _validate_export_artifact_metadata(
    artifact: ExportArtifactRecord,
    graph_ids: set[str],
    path_ids: set[str],
    profile_ids: set[str],
    issues: list[ProjectContentValidationIssue],
) -> None:
    _metadata_ref_warning(artifact, "profile_id", profile_ids, issues)
    _metadata_ref_warning(artifact, "graph_id", graph_ids, issues)
    _metadata_ref_warning(artifact, "path_id", path_ids, issues)


def _metadata_ref_warning(
    artifact: ExportArtifactRecord,
    key: str,
    allowed_ids: set[str],
    issues: list[ProjectContentValidationIssue],
) -> None:
    value = artifact.metadata.get(key)
    if isinstance(value, str) and value not in allowed_ids:
        issues.append(
            _validation_issue(
                "warning",
                "export_metadata_ref_missing",
                f"Export artifact metadata {key} does not match a registered project content id.",
                f"{artifact.id}.metadata.{key}",
                {"artifact_id": artifact.id, key: value},
            )
        )


def _issue_from_error(
    error: RxnFlowError,
    code: str,
    severity: ProjectContentValidationSeverity = "error",
) -> ProjectContentValidationIssue:
    return _validation_issue(
        severity,
        code,
        error.message,
        error.target,
        {"error_code": error.code, "error_target": error.target},
    )


def _validation_issue(
    severity: ProjectContentValidationSeverity,
    code: str,
    message: str,
    target: str | None,
    details: dict[str, Any] | None = None,
) -> ProjectContentValidationIssue:
    return ProjectContentValidationIssue(
        severity=severity,
        code=code,
        message=message,
        target=target,
        details=details or {},
    )


def _checksum_is_valid(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    prefix = "sha256:"
    digest = value.removeprefix(prefix)
    return value.startswith(prefix) and len(digest) == 64 and all(char in "0123456789abcdef" for char in digest)


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

    export_artifacts_result = export_artifacts_section_to_dict(
        snapshot.project_id,
        snapshot.export_artifacts,
    )
    if not export_artifacts_result.ok or export_artifacts_result.value is None:
        assert export_artifacts_result.error is not None
        return err(export_artifacts_result.error)

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
            (
                "export_artifacts",
                SECTION_PATHS["export_artifacts"],
                export_artifacts_result.value,
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

    export_artifacts_result = export_artifacts_section_from_dict(
        project_id,
        sections.get("export_artifacts"),
    )
    if not export_artifacts_result.ok or export_artifacts_result.value is None:
        assert export_artifacts_result.error is not None
        return err(export_artifacts_result.error)

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
            export_artifacts=export_artifacts_result.value,
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
