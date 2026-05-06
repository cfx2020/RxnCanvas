"""Headless graph editor workspace state and orchestration."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
import hashlib
from typing import Any, TypeVar

from .errors import RxnFlowError, RxnFlowWarning
from .graph import ReactionGraphService
from .import_workflow import ImportRegistryWorkflow
from .models import (
    ChemicalObject,
    GraphPatch,
    ID,
    ISODateTime,
    ReactionEdge,
    ReactionGraph,
    ReactionNode,
    ReactionNodeKind,
    ReactionPath,
)
from .registry import ChemicalRegistry
from .result import Result, err, ok


T = TypeVar("T")


@dataclass(frozen=True)
class CanvasViewport:
    x: float = 0.0
    y: float = 0.0
    zoom: float = 1.0


@dataclass(frozen=True)
class WorkspaceSelection:
    node_ids: tuple[ID, ...] = ()
    edge_ids: tuple[ID, ...] = ()
    path_ids: tuple[ID, ...] = ()


@dataclass(frozen=True)
class ObjectPaletteItem:
    object_id: ID
    label: str | None
    formula: str | None
    charge: int | None
    spin_multiplicity: int | None
    method: str | None
    source_file_id: ID
    energy_keys: tuple[str, ...]


@dataclass(frozen=True)
class NetworkPreview:
    graph_id: ID
    active_path_id: ID | None
    nodes: tuple[ReactionNode, ...]
    edges: tuple[ReactionEdge, ...]
    paths: tuple[ReactionPath, ...]
    disconnected_node_ids: tuple[ID, ...] = ()
    warnings: tuple[RxnFlowWarning, ...] = ()


@dataclass(frozen=True)
class WorkspaceSnapshot:
    workspace_id: ID
    project_id: ID
    graph: ReactionGraph
    palette: tuple[ObjectPaletteItem, ...]
    selection: WorkspaceSelection
    viewport: CanvasViewport
    active_path_id: ID | None
    preview: NetworkPreview
    updated_at: ISODateTime | None = None


@dataclass(frozen=True)
class NodePlacement:
    kind: ReactionNodeKind
    label: str
    chemical_object_ids: tuple[ID, ...] = ()
    position: tuple[float, float] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class _WorkspaceState:
    workspace_id: ID
    project_id: ID
    graph: ReactionGraph
    objects: tuple[ChemicalObject, ...] = ()
    selection: WorkspaceSelection = WorkspaceSelection()
    viewport: CanvasViewport = CanvasViewport()
    active_path_id: ID | None = None
    updated_at: ISODateTime | None = None


class GraphEditorWorkspaceService:
    """Project-scoped headless workspace for graph editing shells and agents."""

    def __init__(
        self,
        graph_service: ReactionGraphService,
        import_workflow: ImportRegistryWorkflow | None = None,
        chemical_registry: ChemicalRegistry | None = None,
    ) -> None:
        self._graph_service = graph_service
        self._import_workflow = import_workflow
        self._chemical_registry = chemical_registry
        self._workspaces: dict[ID, dict[ID, _WorkspaceState]] = {}

    def open_workspace(
        self,
        project_id: ID,
        graph_id: ID | None = None,
        label: str | None = None,
        objects: tuple[ChemicalObject, ...] = (),
    ) -> Result[WorkspaceSnapshot]:
        if graph_id is None:
            graph_result = self._graph_service.create_graph(project_id, label)
        else:
            graph_result = self._graph_service.apply_patch(project_id, graph_id, ())
        if not graph_result.ok or graph_result.value is None:
            assert graph_result.error is not None
            return err(graph_result.error)

        graph = graph_result.value
        state = _WorkspaceState(
            workspace_id=_workspace_id(graph.id),
            project_id=project_id,
            graph=graph,
            objects=objects,
        )
        self._workspaces.setdefault(project_id, {})[state.workspace_id] = state
        return ok(self._snapshot_from_state(state))

    def snapshot(self, project_id: ID, workspace_id: ID) -> Result[WorkspaceSnapshot]:
        state_result = self._get_state(project_id, workspace_id)
        if not state_result.ok or state_result.value is None:
            assert state_result.error is not None
            return err(state_result.error)
        return ok(self._snapshot_from_state(state_result.value))

    def list_workspaces(self, project_id: ID) -> Result[tuple[WorkspaceSnapshot, ...]]:
        if not project_id:
            return _invalid_input("Project id is required.", "project_id")
        return ok(
            tuple(
                self._snapshot_from_state(state)
                for state in self._workspaces.get(project_id, {}).values()
            )
        )

    def restore_workspaces(
        self,
        project_id: ID,
        workspaces: tuple[WorkspaceSnapshot, ...],
        objects: tuple[ChemicalObject, ...] = (),
        replace: bool = False,
    ) -> Result[tuple[WorkspaceSnapshot, ...]]:
        if not project_id:
            return _invalid_input("Project id is required.", "project_id")

        target_workspaces = {} if replace else dict(self._workspaces.get(project_id, {}))
        seen_workspace_ids: set[ID] = set()
        for workspace in workspaces:
            graph_result = self._graph_service.list_graphs(project_id)
            if not graph_result.ok or graph_result.value is None:
                assert graph_result.error is not None
                return err(graph_result.error)
            graph = next((item for item in graph_result.value if item.id == workspace.graph.id), None)
            if graph is None:
                return _invalid_input("Reaction graph is not registered in this project.", workspace.graph.id)
            validation_error = _validate_restore_workspace(
                project_id,
                workspace,
                graph,
                seen_workspace_ids,
            )
            if validation_error is not None:
                return err(validation_error)
            state = _WorkspaceState(
                workspace_id=workspace.workspace_id,
                project_id=project_id,
                graph=graph,
                objects=objects,
                selection=workspace.selection,
                viewport=workspace.viewport,
                active_path_id=workspace.active_path_id,
                updated_at=workspace.updated_at,
            )
            existing = target_workspaces.get(state.workspace_id)
            if existing is not None and existing != state:
                return _invalid_input("Workspace id conflicts with existing workspace.", state.workspace_id)
            target_workspaces[state.workspace_id] = state

        self._workspaces[project_id] = target_workspaces
        return ok(tuple(self._snapshot_from_state(state) for state in target_workspaces.values()))

    def add_node(
        self,
        project_id: ID,
        workspace_id: ID,
        placement: NodePlacement,
    ) -> Result[WorkspaceSnapshot]:
        state_result = self._get_state(project_id, workspace_id)
        if not state_result.ok or state_result.value is None:
            assert state_result.error is not None
            return err(state_result.error)
        state = state_result.value
        node = ReactionNode(
            id=_node_id(state.graph, placement),
            kind=placement.kind,
            label=placement.label,
            chemical_object_ids=placement.chemical_object_ids,
            position=placement.position,
            metadata=dict(placement.metadata),
        )
        return self._apply_graph_patches(
            state,
            (GraphPatch("add_node", node=node),),
            object_ids=_object_ids(self._available_objects(state)),
        )

    def connect_nodes(
        self,
        project_id: ID,
        workspace_id: ID,
        from_node_id: ID,
        to_node_id: ID,
        label: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Result[WorkspaceSnapshot]:
        state_result = self._get_state(project_id, workspace_id)
        if not state_result.ok or state_result.value is None:
            assert state_result.error is not None
            return err(state_result.error)
        state = state_result.value
        edge = ReactionEdge(
            id=_edge_id(state.graph, from_node_id, to_node_id),
            from_node=from_node_id,
            to_node=to_node_id,
            label=label,
            metadata=dict(metadata or {}),
        )
        return self._apply_graph_patches(state, (GraphPatch("add_edge", edge=edge),))

    def set_active_path(
        self,
        project_id: ID,
        workspace_id: ID,
        path_id: ID,
        node_ids: tuple[ID, ...],
        label: str | None = None,
    ) -> Result[WorkspaceSnapshot]:
        state_result = self._get_state(project_id, workspace_id)
        if not state_result.ok or state_result.value is None:
            assert state_result.error is not None
            return err(state_result.error)
        state = state_result.value
        path = ReactionPath(id=path_id, label=label or path_id, node_ids=node_ids)
        return self._apply_graph_patches(
            state,
            (GraphPatch("set_path", path=path),),
            active_path_id=path_id,
        )

    def apply_patches(
        self,
        project_id: ID,
        workspace_id: ID,
        patches: tuple[GraphPatch, ...],
    ) -> Result[WorkspaceSnapshot]:
        state_result = self._get_state(project_id, workspace_id)
        if not state_result.ok or state_result.value is None:
            assert state_result.error is not None
            return err(state_result.error)
        state = state_result.value
        return self._apply_graph_patches(
            state,
            patches,
            object_ids=_object_ids(self._available_objects(state)),
        )

    def select(
        self,
        project_id: ID,
        workspace_id: ID,
        selection: WorkspaceSelection,
    ) -> Result[WorkspaceSnapshot]:
        state_result = self._get_state(project_id, workspace_id)
        if not state_result.ok or state_result.value is None:
            assert state_result.error is not None
            return err(state_result.error)
        state = state_result.value
        updated = replace(state, selection=selection)
        self._workspaces[project_id][workspace_id] = updated
        return ok(self._snapshot_from_state(updated))

    def set_viewport(
        self,
        project_id: ID,
        workspace_id: ID,
        viewport: CanvasViewport,
    ) -> Result[WorkspaceSnapshot]:
        state_result = self._get_state(project_id, workspace_id)
        if not state_result.ok or state_result.value is None:
            assert state_result.error is not None
            return err(state_result.error)
        state = state_result.value
        updated = replace(state, viewport=viewport)
        self._workspaces[project_id][workspace_id] = updated
        return ok(self._snapshot_from_state(updated))

    def _snapshot_from_state(self, state: _WorkspaceState) -> WorkspaceSnapshot:
        palette = tuple(_palette_item(obj) for obj in self._available_objects(state))
        preview = _network_preview(state.graph, state.active_path_id)
        return WorkspaceSnapshot(
            workspace_id=state.workspace_id,
            project_id=state.project_id,
            graph=state.graph,
            palette=palette,
            selection=state.selection,
            viewport=state.viewport,
            active_path_id=state.active_path_id,
            preview=preview,
            updated_at=state.updated_at,
        )

    def _available_objects(self, state: _WorkspaceState) -> tuple[ChemicalObject, ...]:
        objects_by_id: dict[ID, ChemicalObject] = {}
        for obj in state.objects:
            objects_by_id[obj.id] = obj

        if self._import_workflow is None or self._chemical_registry is None:
            return tuple(objects_by_id.values())

        batches = self._import_workflow.list_batches(state.project_id)
        if not batches.ok or batches.value is None:
            return tuple(objects_by_id.values())

        for batch in batches.value:
            for item in batch.items:
                if item.status != "registered":
                    continue
                for object_id in item.registered_object_ids:
                    if object_id in objects_by_id:
                        continue
                    registered = self._chemical_registry.get_object(state.project_id, object_id)
                    if registered.ok and registered.value is not None:
                        objects_by_id[object_id] = registered.value

        return tuple(objects_by_id.values())

    def _get_state(self, project_id: ID, workspace_id: ID) -> Result[_WorkspaceState]:
        if not project_id:
            return _invalid_input("Project id is required.", "project_id")
        project_workspaces = self._workspaces.get(project_id)
        if project_workspaces is None or workspace_id not in project_workspaces:
            return _invalid_input("Workspace is not registered in this project.", workspace_id)
        return ok(project_workspaces[workspace_id])

    def _apply_graph_patches(
        self,
        state: _WorkspaceState,
        patches: tuple[GraphPatch, ...],
        object_ids: frozenset[ID] | None = None,
        active_path_id: ID | None = None,
    ) -> Result[WorkspaceSnapshot]:
        graph_result = self._graph_service.apply_patch(
            state.project_id,
            state.graph.id,
            patches,
            object_ids=object_ids,
        )
        if not graph_result.ok or graph_result.value is None:
            assert graph_result.error is not None
            return err(graph_result.error)

        graph = graph_result.value
        resolved_active_path_id = (
            active_path_id if active_path_id is not None else state.active_path_id
        )
        if resolved_active_path_id not in {path.id for path in graph.paths}:
            resolved_active_path_id = None
        updated = replace(
            state,
            graph=graph,
            active_path_id=resolved_active_path_id,
        )
        self._workspaces[state.project_id][state.workspace_id] = updated
        return ok(self._snapshot_from_state(updated))


def _workspace_id(graph_id: ID) -> ID:
    return f"workspace-{graph_id.removeprefix('graph-')}"


def _node_id(graph: ReactionGraph, placement: NodePlacement) -> ID:
    payload = f"{graph.id}:{placement.kind}:{placement.label}:{len(graph.nodes) + 1}".encode(
        "utf-8"
    )
    return f"node-{hashlib.sha256(payload).hexdigest()[:12]}"


def _edge_id(graph: ReactionGraph, from_node_id: ID, to_node_id: ID) -> ID:
    payload = f"{graph.id}:{from_node_id}:{to_node_id}:{len(graph.edges) + 1}".encode("utf-8")
    return f"edge-{hashlib.sha256(payload).hexdigest()[:12]}"


def _object_ids(objects: tuple[ChemicalObject, ...]) -> frozenset[ID]:
    return frozenset(obj.id for obj in objects)


def _palette_item(obj: ChemicalObject) -> ObjectPaletteItem:
    return ObjectPaletteItem(
        object_id=obj.id,
        label=obj.label,
        formula=obj.formula,
        charge=obj.charge,
        spin_multiplicity=obj.spin_multiplicity,
        method=obj.method,
        source_file_id=obj.source_file_id,
        energy_keys=tuple(sorted(obj.energies)),
    )


def _network_preview(graph: ReactionGraph, active_path_id: ID | None) -> NetworkPreview:
    connected_node_ids = {
        node_id
        for edge in graph.edges
        for node_id in (edge.from_node, edge.to_node)
    }
    disconnected_node_ids = tuple(
        node.id for node in graph.nodes if node.id not in connected_node_ids
    )
    warnings: tuple[RxnFlowWarning, ...] = ()
    if disconnected_node_ids:
        warnings = (
            RxnFlowWarning(
                code="disconnected_nodes",
                message="Graph contains nodes with no incident edges.",
                target=",".join(disconnected_node_ids),
            ),
        )
    return NetworkPreview(
        graph_id=graph.id,
        active_path_id=active_path_id,
        nodes=graph.nodes,
        edges=graph.edges,
        paths=graph.paths,
        disconnected_node_ids=disconnected_node_ids,
        warnings=warnings,
    )


def _validate_restore_workspace(
    project_id: ID,
    workspace: WorkspaceSnapshot,
    graph: ReactionGraph,
    seen_workspace_ids: set[ID],
) -> RxnFlowError | None:
    if not workspace.workspace_id:
        return RxnFlowError("invalid_input", "Workspace id is required.", target="workspace_id")
    if workspace.workspace_id in seen_workspace_ids:
        return RxnFlowError("invalid_input", "Workspace id is duplicated.", target=workspace.workspace_id)
    seen_workspace_ids.add(workspace.workspace_id)
    if workspace.project_id != project_id:
        return RxnFlowError(
            "invalid_input",
            "Workspace project_id does not match restore project_id.",
            target="project_id",
        )
    if workspace.graph.id != graph.id:
        return RxnFlowError(
            "invalid_input",
            "Workspace graph does not match restored graph.",
            target="graph_id",
        )
    if workspace.viewport.zoom <= 0:
        return RxnFlowError(
            "invalid_input",
            "Workspace viewport zoom must be positive.",
            target="viewport.zoom",
        )

    node_ids = {node.id for node in graph.nodes}
    edge_ids = {edge.id for edge in graph.edges}
    path_ids = {path.id for path in graph.paths}
    for node_id in workspace.selection.node_ids:
        if node_id not in node_ids:
            return RxnFlowError("invalid_input", "Workspace selection references a missing node.", target=node_id)
    for edge_id in workspace.selection.edge_ids:
        if edge_id not in edge_ids:
            return RxnFlowError("invalid_input", "Workspace selection references a missing edge.", target=edge_id)
    for path_id in workspace.selection.path_ids:
        if path_id not in path_ids:
            return RxnFlowError("invalid_input", "Workspace selection references a missing path.", target=path_id)
    if workspace.active_path_id is not None and workspace.active_path_id not in path_ids:
        return RxnFlowError(
            "invalid_input",
            "Workspace active_path_id references a missing path.",
            target=workspace.active_path_id,
        )
    return None


def _invalid_input(message: str, target: str) -> Result[T]:
    return err(RxnFlowError(code="invalid_input", message=message, target=target))
