"""Platform shell command and response contracts."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from pathlib import Path
from typing import Any
import base64

from .energy import EnergyProfileEngine
from .errors import RxnFlowError, RxnFlowWarning
from .export import ExportArtifact, ExportRequest, ReportExportService
from .fixture import run_core_fixture_vertical_slice
from .graph import ReactionGraphService
from .import_workflow import ImportFileRequest, ImportRegistryWorkflow, ImportSelection
from .models import (
    ChemicalObject,
    CoreFixtureResult,
    EnergyOptions,
    EnergyProfile,
    ProjectManifest,
    ReactionGraph,
)
from .parsers import ParseOptions, ParserRegistry
from .project import ProjectStore
from .registry import ChemicalRegistry
from .result import Result
from .workspace import GraphEditorWorkspaceService, NodePlacement, WorkspaceSnapshot


@dataclass(frozen=True)
class ShellCommand:
    name: str
    args: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ShellArtifact:
    id: str
    format: str
    path: str | None = None
    bytes_base64: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return _json_safe(asdict(self))


@dataclass(frozen=True)
class PlatformSession:
    id: str
    project_path: str | None = None
    project_id: str | None = None
    workspace_id: str | None = None
    graph_id: str | None = None
    profile_id: str | None = None
    object_ids: tuple[str, ...] = ()
    artifact_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class ShellResponse:
    ok: bool
    data: dict[str, Any] | None = None
    error: dict[str, Any] | None = None
    warnings: tuple[dict[str, Any], ...] = ()
    artifacts: tuple[ShellArtifact, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "data": _json_safe(self.data),
            "error": _json_safe(self.error),
            "warnings": _json_safe(self.warnings),
            "artifacts": [artifact.to_dict() for artifact in self.artifacts],
        }


@dataclass
class _PlatformSessionState:
    session: PlatformSession
    objects: tuple[ChemicalObject, ...] = ()
    graph: ReactionGraph | None = None
    profile: EnergyProfile | None = None
    workspace: WorkspaceSnapshot | None = None
    artifacts: tuple[ShellArtifact, ...] = ()
    import_batch_ids: tuple[str, ...] = ()


class AppKernel:
    """Process-local service container for platform shells."""

    def __init__(
        self,
        project_store: ProjectStore | None = None,
        parser_registry: ParserRegistry | None = None,
        chemical_registry: ChemicalRegistry | None = None,
        graph_service: ReactionGraphService | None = None,
        energy_engine: EnergyProfileEngine | None = None,
        export_service: ReportExportService | None = None,
    ) -> None:
        self.project_store = project_store or ProjectStore()
        self.parser_registry = parser_registry or ParserRegistry.default()
        self.chemical_registry = chemical_registry or ChemicalRegistry()
        self.import_workflow = ImportRegistryWorkflow(
            self.project_store,
            self.parser_registry,
            self.chemical_registry,
        )
        self.graph_service = graph_service or ReactionGraphService()
        self.workspace_service = GraphEditorWorkspaceService(
            self.graph_service,
            self.import_workflow,
            self.chemical_registry,
        )
        self.energy_engine = energy_engine or EnergyProfileEngine()
        self.export_service = export_service or ReportExportService()
        self._sessions: dict[str, _PlatformSessionState] = {}

    def create_session(
        self,
        project_path: str | None = None,
        project_id: str | None = None,
    ) -> PlatformSession:
        session_id = f"session-{len(self._sessions) + 1}"
        session = PlatformSession(
            id=session_id,
            project_path=project_path,
            project_id=project_id,
        )
        self._sessions[session_id] = _PlatformSessionState(session=session)
        return session

    def get_session_state(self, session_id: str) -> _PlatformSessionState | None:
        return self._sessions.get(session_id)

    def put_session_state(self, state: _PlatformSessionState) -> None:
        self._sessions[state.session.id] = state


class PlatformShellService:
    """Run JSON-safe platform shell commands against an app kernel."""

    def __init__(self, kernel: AppKernel | None = None) -> None:
        self._kernel = kernel or AppKernel()

    def run(self, command: ShellCommand) -> ShellResponse:
        if not command.name:
            return _invalid_input("Shell command name is required.", "command")
        if command.name == "fixture.run":
            return self._run_fixture(command)
        if command.name == "project.create":
            return self._run_project_create(command)
        if command.name == "project.load":
            return self._run_project_load(command)
        if command.name == "import.preview":
            return self._run_import_preview(command)
        if command.name == "import.register_all":
            return self._run_import_register_all(command)
        if command.name == "workspace.open":
            return self._run_workspace_open(command)
        if command.name == "workspace.add_node":
            return self._run_workspace_add_node(command)
        if command.name == "workspace.connect":
            return self._run_workspace_connect(command)
        if command.name == "workspace.set_path":
            return self._run_workspace_set_path(command)
        if command.name == "energy.compute":
            return self._run_energy_compute(command)
        if command.name == "export.profile":
            return self._run_export_profile(command)
        return _invalid_input(f"Unknown shell command: {command.name}", "command")

    def _run_fixture(self, command: ShellCommand) -> ShellResponse:
        fixture = run_core_fixture_vertical_slice()
        if not fixture.ok or fixture.value is None:
            return _result_error_response(fixture)
        value = fixture.value
        artifacts_result = _export_fixture_artifacts(self._kernel, command, value)
        if not artifacts_result.ok:
            return artifacts_result
        artifacts = artifacts_result.artifacts
        session = self._kernel.create_session(project_id=value.project.id)
        state = _PlatformSessionState(
            session=_session_with_core_state(
                session,
                project_id=value.project.id,
                graph_id=value.graph.id,
                profile_id=value.profile.id,
                object_ids=tuple(obj.id for obj in value.objects),
                artifact_ids=tuple(artifact.id for artifact in artifacts),
            ),
            objects=value.objects,
            graph=value.graph,
            profile=value.profile,
            artifacts=artifacts,
        )
        self._kernel.put_session_state(state)
        return ShellResponse(
            ok=True,
            data=_fixture_data(command.name, state.session, value, artifacts),
            warnings=artifacts_result.warnings,
            artifacts=artifacts,
        )

    def _run_project_create(self, command: ShellCommand) -> ShellResponse:
        name = _required_str(command.args, "name")
        if name is None:
            return _invalid_input("Project name is required.", "name")
        location = _required_str(command.args, "location")
        if location is None:
            return _invalid_input("Project location is required.", "location")

        created = self._kernel.project_store.create_project(name, location)
        if not created.ok or created.value is None:
            return _result_error_response(created)
        session = self._kernel.create_session(project_path=location, project_id=created.value.id)
        return ShellResponse(
            ok=True,
            data=_response_data(
                command.name,
                session,
                {"project": _project_summary(created.value)},
            ),
        )

    def _run_project_load(self, command: ShellCommand) -> ShellResponse:
        project_path = _required_str(command.args, "project_path")
        if project_path is None:
            return _invalid_input("Project path is required.", "project_path")

        loaded = self._kernel.project_store.load_project(project_path)
        if not loaded.ok or loaded.value is None:
            return _result_error_response(loaded)
        session = self._kernel.create_session(project_path=project_path, project_id=loaded.value.id)
        return ShellResponse(
            ok=True,
            data=_response_data(
                command.name,
                session,
                {"project": _project_summary(loaded.value)},
            ),
        )

    def _run_import_preview(self, command: ShellCommand) -> ShellResponse:
        resolved = self._resolve_state(command.args, allow_project_path=True)
        if isinstance(resolved, ShellResponse):
            return resolved
        state = resolved
        if state.session.project_path is None:
            return _invalid_input("Project path is required.", "project_path")

        source_paths = _source_paths(command.args)
        if not source_paths:
            return _invalid_input("At least one source path is required.", "source_path")
        parse_options = _parse_options(command.args)
        imported = self._kernel.import_workflow.import_files(
            state.session.project_path,
            tuple(ImportFileRequest(path, parse_options) for path in source_paths),
        )
        if not imported.ok or imported.value is None:
            return _result_error_response(imported)

        updated = _PlatformSessionState(
            session=state.session,
            objects=state.objects,
            graph=state.graph,
            profile=state.profile,
            workspace=state.workspace,
            artifacts=state.artifacts,
            import_batch_ids=state.import_batch_ids + (imported.value.id,),
        )
        self._kernel.put_session_state(updated)
        return ShellResponse(
            ok=True,
            data=_response_data(
                command.name,
                updated.session,
                {"batch": _import_batch_summary(imported.value)},
            ),
        )

    def _run_import_register_all(self, command: ShellCommand) -> ShellResponse:
        resolved = self._resolve_state(command.args)
        if isinstance(resolved, ShellResponse):
            return resolved
        state = resolved
        if state.session.project_id is None:
            return _invalid_input("Project id is required.", "project_id")
        batch_id = str(command.args.get("batch_id") or (state.import_batch_ids[-1] if state.import_batch_ids else ""))
        if not batch_id:
            return _invalid_input("Import batch id is required.", "batch_id")

        batch_result = self._kernel.import_workflow.get_batch(state.session.project_id, batch_id)
        if not batch_result.ok or batch_result.value is None:
            return _result_error_response(batch_result)
        selections = tuple(
            ImportSelection(item.id)
            for item in batch_result.value.items
            if item.preview is not None
        )
        if not selections:
            return _invalid_input("Import batch has no parse previews to register.", "batch_id")

        confirmed = self._kernel.import_workflow.confirm_import(
            state.session.project_id,
            batch_id,
            selections,
        )
        if not confirmed.ok or confirmed.value is None:
            return _result_error_response(confirmed)

        object_ids = tuple(
            object_id
            for item in confirmed.value.items
            for object_id in item.registered_object_ids
        )
        objects = list(state.objects)
        existing_ids = {obj.id for obj in objects}
        for object_id in object_ids:
            if object_id in existing_ids:
                continue
            loaded = self._kernel.chemical_registry.get_object(state.session.project_id, object_id)
            if loaded.ok and loaded.value is not None:
                objects.append(loaded.value)
                existing_ids.add(loaded.value.id)

        updated_session = _session_with_core_state(
            state.session,
            object_ids=tuple(obj.id for obj in objects),
        )
        updated = _PlatformSessionState(
            session=updated_session,
            objects=tuple(objects),
            graph=state.graph,
            profile=state.profile,
            workspace=state.workspace,
            artifacts=state.artifacts,
            import_batch_ids=state.import_batch_ids,
        )
        self._kernel.put_session_state(updated)
        return ShellResponse(
            ok=True,
            data=_response_data(
                command.name,
                updated.session,
                {
                    "batch": _import_batch_summary(confirmed.value),
                    "registered_object_ids": object_ids,
                },
            ),
        )

    def _run_workspace_open(self, command: ShellCommand) -> ShellResponse:
        resolved = self._resolve_state(command.args)
        if isinstance(resolved, ShellResponse):
            return resolved
        state = resolved
        if state.session.project_id is None:
            return _invalid_input("Project id is required.", "project_id")
        opened = self._kernel.workspace_service.open_workspace(
            state.session.project_id,
            label=command.args.get("label"),
            objects=state.objects,
        )
        if not opened.ok or opened.value is None:
            return _result_error_response(opened)
        return self._store_workspace(command.name, state, opened.value)

    def _run_workspace_add_node(self, command: ShellCommand) -> ShellResponse:
        resolved = self._resolve_state(command.args)
        if isinstance(resolved, ShellResponse):
            return resolved
        state = resolved
        if state.workspace is None:
            return _invalid_input("Workspace must be opened before adding nodes.", "workspace_id")
        kind = _required_str(command.args, "kind")
        label = _required_str(command.args, "label")
        if kind is None:
            return _invalid_input("Node kind is required.", "kind")
        if label is None:
            return _invalid_input("Node label is required.", "label")
        placement = NodePlacement(
            kind=kind,  # type: ignore[arg-type]
            label=label,
            chemical_object_ids=_tuple_of_str(command.args.get("chemical_object_ids", ())),
            position=_position(command.args.get("position")),
            metadata=dict(command.args.get("metadata") or {}),
        )
        updated = self._kernel.workspace_service.add_node(
            state.session.project_id or "",
            state.workspace.workspace_id,
            placement,
        )
        if not updated.ok or updated.value is None:
            return _result_error_response(updated)
        return self._store_workspace(command.name, state, updated.value)

    def _run_workspace_connect(self, command: ShellCommand) -> ShellResponse:
        resolved = self._resolve_state(command.args)
        if isinstance(resolved, ShellResponse):
            return resolved
        state = resolved
        if state.workspace is None:
            return _invalid_input("Workspace must be opened before connecting nodes.", "workspace_id")
        from_node_id = _required_str(command.args, "from_node_id")
        to_node_id = _required_str(command.args, "to_node_id")
        if from_node_id is None:
            return _invalid_input("Source node id is required.", "from_node_id")
        if to_node_id is None:
            return _invalid_input("Target node id is required.", "to_node_id")
        updated = self._kernel.workspace_service.connect_nodes(
            state.session.project_id or "",
            state.workspace.workspace_id,
            from_node_id,
            to_node_id,
            label=command.args.get("label"),
            metadata=dict(command.args.get("metadata") or {}),
        )
        if not updated.ok or updated.value is None:
            return _result_error_response(updated)
        return self._store_workspace(command.name, state, updated.value)

    def _run_workspace_set_path(self, command: ShellCommand) -> ShellResponse:
        resolved = self._resolve_state(command.args)
        if isinstance(resolved, ShellResponse):
            return resolved
        state = resolved
        if state.workspace is None:
            return _invalid_input("Workspace must be opened before setting a path.", "workspace_id")
        path_id = _required_str(command.args, "path_id")
        node_ids = _tuple_of_str(command.args.get("node_ids", ()))
        if path_id is None:
            return _invalid_input("Path id is required.", "path_id")
        if not node_ids:
            return _invalid_input("Path node ids are required.", "node_ids")
        updated = self._kernel.workspace_service.set_active_path(
            state.session.project_id or "",
            state.workspace.workspace_id,
            path_id,
            node_ids,
            label=command.args.get("label"),
        )
        if not updated.ok or updated.value is None:
            return _result_error_response(updated)
        return self._store_workspace(command.name, state, updated.value)

    def _run_energy_compute(self, command: ShellCommand) -> ShellResponse:
        resolved = self._resolve_state(command.args)
        if isinstance(resolved, ShellResponse):
            return resolved
        state = resolved
        if state.graph is None:
            return _invalid_input("Reaction graph is required to compute energy.", "graph_id")
        if not state.objects:
            return _invalid_input("Chemical objects are required to compute energy.", "object_ids")
        path_id = str(
            command.args.get("path_id")
            or (state.workspace.active_path_id if state.workspace is not None else "")
            or (state.graph.paths[0].id if state.graph.paths else "")
        )
        if not path_id:
            return _invalid_input("Path id is required to compute energy.", "path_id")
        options = EnergyOptions(
            output_unit=str(command.args.get("output_unit") or "kcal_mol"),  # type: ignore[arg-type]
            include_corrections=bool(command.args.get("include_corrections", False)),
            energy_key=str(command.args.get("energy_key") or "electronic"),
            baseline_node_id=command.args.get("baseline_node_id"),
        )
        profile = self._kernel.energy_engine.compute_profile(
            state.session.project_id or "",
            state.graph,
            path_id,
            state.objects,
            options,
        )
        if not profile.ok or profile.value is None:
            return _result_error_response(profile)

        updated_session = _session_with_core_state(state.session, profile_id=profile.value.id)
        updated = _PlatformSessionState(
            session=updated_session,
            objects=state.objects,
            graph=state.graph,
            profile=profile.value,
            workspace=state.workspace,
            artifacts=state.artifacts,
            import_batch_ids=state.import_batch_ids,
        )
        self._kernel.put_session_state(updated)
        return ShellResponse(
            ok=True,
            data=_response_data(
                command.name,
                updated.session,
                {"profile": _profile_summary(profile.value)},
            ),
            warnings=tuple(_warning_to_dict(warning) for warning in profile.warnings),
        )

    def _run_export_profile(self, command: ShellCommand) -> ShellResponse:
        resolved = self._resolve_state(command.args)
        if isinstance(resolved, ShellResponse):
            return resolved
        state = resolved
        if state.profile is None:
            return _invalid_input("Energy profile is required for export.", "profile_id")
        formats = _tuple_of_str(command.args.get("formats") or command.args.get("export_formats") or ())
        if not formats:
            return _invalid_input("At least one export format is required.", "formats")
        export_result = self._kernel.export_service.export(
            state.session.project_id or "",
            ExportRequest(
                formats=formats,
                graph=state.graph,
                profile=state.profile,
                objects=state.objects,
                destination_dir=command.args.get("destination_dir"),
                basename=command.args.get("basename"),
                title=command.args.get("title"),
            ),
        )
        if not export_result.ok or export_result.value is None:
            return _result_error_response(export_result)
        include_bytes = bool(command.args.get("include_bytes", False))
        artifacts = tuple(_shell_artifact(artifact, include_bytes=include_bytes) for artifact in export_result.value)
        updated_session = _session_with_core_state(
            state.session,
            artifact_ids=state.session.artifact_ids + tuple(artifact.id for artifact in artifacts),
        )
        updated = _PlatformSessionState(
            session=updated_session,
            objects=state.objects,
            graph=state.graph,
            profile=state.profile,
            workspace=state.workspace,
            artifacts=state.artifacts + artifacts,
            import_batch_ids=state.import_batch_ids,
        )
        self._kernel.put_session_state(updated)
        return ShellResponse(
            ok=True,
            data=_response_data(command.name, updated.session, {"profile": _profile_summary(state.profile)}, artifacts),
            warnings=tuple(_warning_to_dict(warning) for warning in export_result.warnings),
            artifacts=artifacts,
        )

    def _store_workspace(
        self,
        command_name: str,
        state: _PlatformSessionState,
        workspace: WorkspaceSnapshot,
    ) -> ShellResponse:
        updated_session = _session_with_core_state(
            state.session,
            workspace_id=workspace.workspace_id,
            graph_id=workspace.graph.id,
        )
        updated = _PlatformSessionState(
            session=updated_session,
            objects=state.objects,
            graph=workspace.graph,
            profile=state.profile,
            workspace=workspace,
            artifacts=state.artifacts,
            import_batch_ids=state.import_batch_ids,
        )
        self._kernel.put_session_state(updated)
        return ShellResponse(
            ok=True,
            data=_response_data(
                command_name,
                updated.session,
                {"workspace": _workspace_summary(workspace)},
            ),
            warnings=tuple(_warning_to_dict(warning) for warning in workspace.preview.warnings),
        )

    def _resolve_state(
        self,
        args: dict[str, Any],
        *,
        allow_project_path: bool = False,
    ) -> _PlatformSessionState | ShellResponse:
        session_id = args.get("session_id")
        if session_id is not None:
            state = self._kernel.get_session_state(str(session_id))
            if state is None:
                return _invalid_input("Platform session does not exist.", "session_id")
            return state

        if not allow_project_path:
            return _invalid_input("Session id is required.", "session_id")
        project_path = _required_str(args, "project_path")
        if project_path is None:
            return _invalid_input("Project path is required.", "project_path")
        loaded = self._kernel.project_store.load_project(project_path)
        if not loaded.ok or loaded.value is None:
            return _result_error_response(loaded)
        session = self._kernel.create_session(project_path=project_path, project_id=loaded.value.id)
        state = self._kernel.get_session_state(session.id)
        assert state is not None
        return state


def handle_platform_payload(
    payload: dict[str, Any],
    service: PlatformShellService | None = None,
) -> dict[str, Any]:
    """Handle a Web- or desktop-bridge payload without binding to a framework."""

    if not isinstance(payload, dict):
        return _invalid_input("Platform payload must be a JSON object.", "payload").to_dict()
    raw_args = payload.get("args", {})
    if raw_args is None:
        raw_args = {}
    if not isinstance(raw_args, dict):
        return _invalid_input("Platform payload args must be a JSON object.", "args").to_dict()
    shell_service = service or PlatformShellService()
    return shell_service.run(
        ShellCommand(str(payload.get("command") or ""), dict(raw_args))
    ).to_dict()


def _invalid_input(message: str, target: str) -> ShellResponse:
    return ShellResponse(
        ok=False,
        error=_error_to_dict(RxnFlowError("invalid_input", message, target=target)),
    )


def _error_to_dict(error: RxnFlowError) -> dict[str, Any]:
    return {
        "code": error.code,
        "message": error.message,
        "target": error.target,
        "details": _json_safe(error.details),
    }


def _warning_to_dict(warning: RxnFlowWarning) -> dict[str, Any]:
    return {
        "code": warning.code,
        "message": warning.message,
        "target": warning.target,
    }


def _result_error_response(result: Result[Any]) -> ShellResponse:
    if result.error is None:
        return ShellResponse(
            ok=False,
            error=_error_to_dict(
                RxnFlowError("internal_error", "Core service returned an error without details.")
            ),
            warnings=tuple(_warning_to_dict(warning) for warning in result.warnings),
        )
    return ShellResponse(
        ok=False,
        error=_error_to_dict(result.error),
        warnings=tuple(_warning_to_dict(warning) for warning in result.warnings),
    )


def _export_fixture_artifacts(
    kernel: AppKernel,
    command: ShellCommand,
    value: CoreFixtureResult,
) -> ShellResponse:
    export_formats = tuple(str(item) for item in command.args.get("export_formats", ()))
    if not export_formats:
        return ShellResponse(ok=True)
    export_result = kernel.export_service.export(
        value.project.id,
        ExportRequest(
            formats=export_formats,
            graph=value.graph,
            profile=value.profile,
            objects=value.objects,
            destination_dir=command.args.get("destination_dir"),
            basename=str(command.args.get("basename") or value.profile.id),
            title=command.args.get("title"),
        ),
    )
    if not export_result.ok or export_result.value is None:
        return _result_error_response(export_result)
    include_bytes = bool(command.args.get("include_bytes", False))
    return ShellResponse(
        ok=True,
        artifacts=tuple(_shell_artifact(artifact, include_bytes=include_bytes) for artifact in export_result.value),
        warnings=tuple(_warning_to_dict(warning) for warning in export_result.warnings),
    )


def _shell_artifact(artifact: ExportArtifact, *, include_bytes: bool = False) -> ShellArtifact:
    metadata = dict(artifact.metadata)
    if include_bytes and artifact.bytes is not None:
        metadata["encoding"] = "base64"
    return ShellArtifact(
        id=artifact.id,
        format=artifact.format,
        path=artifact.path,
        bytes_base64=(
            base64.b64encode(artifact.bytes).decode("ascii")
            if include_bytes and artifact.bytes is not None
            else None
        ),
        metadata=metadata,
    )


def _required_str(args: dict[str, Any], key: str) -> str | None:
    value = args.get(key)
    if value is None:
        return None
    text = str(value)
    return text if text else None


def _source_paths(args: dict[str, Any]) -> tuple[str, ...]:
    if "source_files" in args:
        return _tuple_of_str(args["source_files"])
    if "source_paths" in args:
        return _tuple_of_str(args["source_paths"])
    source_path = args.get("source_path")
    return (str(source_path),) if source_path else ()


def _parse_options(args: dict[str, Any]) -> ParseOptions | None:
    expected_format = args.get("expected_format")
    strict = args.get("strict")
    if expected_format is None and strict is None:
        return None
    return ParseOptions(
        expected_format=str(expected_format) if expected_format is not None else None,
        strict=bool(strict),
    )


def _tuple_of_str(value: Any) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        return (value,) if value else ()
    if isinstance(value, (list, tuple, set, frozenset)):
        return tuple(str(item) for item in value)
    return (str(value),)


def _position(value: Any) -> tuple[float, float] | None:
    if value is None:
        return None
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        return None
    return (float(value[0]), float(value[1]))


def _session_with_core_state(
    session: PlatformSession,
    *,
    project_path: str | None = None,
    project_id: str | None = None,
    workspace_id: str | None = None,
    graph_id: str | None = None,
    profile_id: str | None = None,
    object_ids: tuple[str, ...] | None = None,
    artifact_ids: tuple[str, ...] | None = None,
) -> PlatformSession:
    return PlatformSession(
        id=session.id,
        project_path=project_path if project_path is not None else session.project_path,
        project_id=project_id if project_id is not None else session.project_id,
        workspace_id=workspace_id if workspace_id is not None else session.workspace_id,
        graph_id=graph_id if graph_id is not None else session.graph_id,
        profile_id=profile_id if profile_id is not None else session.profile_id,
        object_ids=object_ids if object_ids is not None else session.object_ids,
        artifact_ids=artifact_ids if artifact_ids is not None else session.artifact_ids,
    )


def _fixture_data(
    command_name: str,
    session: PlatformSession,
    value: CoreFixtureResult,
    artifacts: tuple[ShellArtifact, ...],
) -> dict[str, Any]:
    return _response_data(
        command_name,
        session,
        {
            "project": _project_summary(value.project),
            "object_count": len(value.objects),
            "objects": [_object_summary(obj) for obj in value.objects],
            "graph": _graph_summary(value.graph),
            "profile": _profile_summary(value.profile),
        },
        artifacts,
    )


def _response_data(
    command_name: str,
    session: PlatformSession,
    payload: dict[str, Any],
    artifacts: tuple[ShellArtifact, ...] = (),
) -> dict[str, Any]:
    data = {
        "command": command_name,
        "session_id": session.id,
        "project_id": session.project_id,
        "workspace_id": session.workspace_id,
        "graph_id": session.graph_id,
        "profile_id": session.profile_id,
        "object_count": len(session.object_ids),
        "artifact_count": len(artifacts),
    }
    data.update(payload)
    return data


def _project_summary(project: ProjectManifest) -> dict[str, Any]:
    return {
        "id": project.id,
        "name": project.name,
        "schema_version": project.schema_version,
        "resource_count": len(project.resources),
    }


def _object_summary(obj: ChemicalObject) -> dict[str, Any]:
    return {
        "id": obj.id,
        "label": obj.label,
        "source_file_id": obj.source_file_id,
        "energy_keys": sorted(obj.energies),
    }


def _graph_summary(graph: ReactionGraph) -> dict[str, Any]:
    return {
        "id": graph.id,
        "project_id": graph.project_id,
        "node_count": len(graph.nodes),
        "edge_count": len(graph.edges),
        "path_count": len(graph.paths),
    }


def _profile_summary(profile: EnergyProfile) -> dict[str, Any]:
    return {
        "id": profile.id,
        "graph_id": profile.graph_id,
        "path_id": profile.path_id,
        "point_count": len(profile.points),
        "output_unit": profile.options.output_unit,
        "baseline_node_id": profile.options.baseline_node_id,
        "points": [
            {
                "node_id": point.node_id,
                "label": point.label,
                "relative_energy": _energy_value_summary(point.relative_energy),
                "missing_reason": point.missing_reason,
            }
            for point in profile.points
        ],
    }


def _import_batch_summary(batch: Any) -> dict[str, Any]:
    return {
        "id": batch.id,
        "project_id": batch.project_id,
        "items": [_import_item_summary(item) for item in batch.items],
    }


def _import_item_summary(item: Any) -> dict[str, Any]:
    return {
        "id": item.id,
        "source_path": item.source_path,
        "status": item.status,
        "raw_resource": _project_resource_summary(item.raw_resource) if item.raw_resource is not None else None,
        "preview": _parse_preview_summary(item.preview) if item.preview is not None else None,
        "registered_object_ids": list(item.registered_object_ids),
        "error": _error_to_dict(item.error) if item.error is not None else None,
        "warnings": [_warning_to_dict(warning) for warning in item.warnings],
    }


def _project_resource_summary(resource: Any) -> dict[str, Any]:
    return {
        "id": resource.id,
        "kind": resource.kind,
        "path": resource.path,
        "checksum": resource.checksum,
        "metadata": _json_safe(resource.metadata),
    }


def _parse_preview_summary(preview: Any) -> dict[str, Any]:
    return {
        "raw_resource_id": preview.raw_resource_id,
        "parser_id": preview.parser_id,
        "parser_version": preview.parser_version,
        "object_count": preview.object_count,
        "warnings": [_warning_to_dict(warning) for warning in preview.warnings],
    }


def _workspace_summary(workspace: WorkspaceSnapshot) -> dict[str, Any]:
    return {
        "workspace_id": workspace.workspace_id,
        "project_id": workspace.project_id,
        "active_path_id": workspace.active_path_id,
        "palette": [
            {
                "object_id": item.object_id,
                "label": item.label,
                "formula": item.formula,
                "charge": item.charge,
                "spin_multiplicity": item.spin_multiplicity,
                "method": item.method,
                "source_file_id": item.source_file_id,
                "energy_keys": list(item.energy_keys),
            }
            for item in workspace.palette
        ],
        "graph": _graph_detail(workspace.graph),
        "preview": {
            "graph_id": workspace.preview.graph_id,
            "active_path_id": workspace.preview.active_path_id,
            "node_count": len(workspace.preview.nodes),
            "edge_count": len(workspace.preview.edges),
            "path_count": len(workspace.preview.paths),
            "disconnected_node_ids": list(workspace.preview.disconnected_node_ids),
            "warnings": [_warning_to_dict(warning) for warning in workspace.preview.warnings],
        },
    }


def _graph_detail(graph: ReactionGraph) -> dict[str, Any]:
    detail = _graph_summary(graph)
    detail["nodes"] = [
        {
            "id": node.id,
            "kind": node.kind,
            "label": node.label,
            "chemical_object_ids": list(node.chemical_object_ids),
            "position": list(node.position) if node.position is not None else None,
            "metadata": _json_safe(node.metadata),
        }
        for node in graph.nodes
    ]
    detail["edges"] = [
        {
            "id": edge.id,
            "from_node": edge.from_node,
            "to_node": edge.to_node,
            "label": edge.label,
            "metadata": _json_safe(edge.metadata),
        }
        for edge in graph.edges
    ]
    detail["paths"] = [
        {"id": path.id, "label": path.label, "node_ids": list(path.node_ids)}
        for path in graph.paths
    ]
    return detail


def _energy_value_summary(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    return {"value": value.value, "unit": value.unit, "reference": value.reference}


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, bytes):
        return base64.b64encode(value).decode("ascii")
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_json_safe(item) for item in value]
    if is_dataclass(value):
        return _json_safe(asdict(value))
    return str(value)
