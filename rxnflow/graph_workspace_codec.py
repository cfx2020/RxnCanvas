"""Reaction graph and workspace persistence codecs for project content sections."""

from __future__ import annotations

import math
from typing import Any

from .errors import RxnFlowError, RxnFlowWarning
from .models import (
    ChemicalObject,
    ID,
    ReactionEdge,
    ReactionGraph,
    ReactionNode,
    ReactionNodeCompositionTerm,
    ReactionPath,
)
from .result import Result, err, ok
from .workspace import (
    CanvasViewport,
    NetworkPreview,
    ObjectPaletteItem,
    WorkspaceSelection,
    WorkspaceSnapshot,
)


REACTION_GRAPHS_SCHEMA_VERSION = "reaction-graphs-v1"
WORKSPACES_SCHEMA_VERSION = "workspaces-v1"
DEFAULT_WORKSPACE_UPDATED_AT = "2026-05-05T00:00:00Z"
SUPPORTED_NODE_KINDS = frozenset({"species", "transition_state", "group", "annotation"})


def reaction_graphs_section_to_dict(
    project_id: ID,
    graphs: tuple[ReactionGraph, ...],
    object_ids: set[ID] | frozenset[ID] | None = None,
) -> Result[dict[str, Any]]:
    if not project_id:
        return err(RxnFlowError("invalid_input", "Reaction graph section requires project_id.", target="project_id"))

    encoded_graphs: list[dict[str, Any]] = []
    seen_graph_ids: set[ID] = set()
    for index, graph in enumerate(graphs):
        target = f"graphs[{index}]"
        graph_error = _validate_graph(project_id, graph, object_ids, seen_graph_ids, target)
        if graph_error is not None:
            return err(graph_error)
        encoded_graphs.append(_reaction_graph_to_dict(graph))

    return ok(
        {
            "schema_version": REACTION_GRAPHS_SCHEMA_VERSION,
            "project_id": project_id,
            "graphs": encoded_graphs,
        }
    )


def reaction_graphs_section_from_dict(
    project_id: ID,
    data: dict[str, Any] | None,
    object_ids: set[ID] | frozenset[ID] | None = None,
) -> Result[tuple[ReactionGraph, ...]]:
    if data is None:
        return ok(())
    if not isinstance(data, dict):
        return err(RxnFlowError("invalid_input", "Reaction graph section must be an object.", target="reaction_graphs"))
    if data.get("schema_version") != REACTION_GRAPHS_SCHEMA_VERSION:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Unsupported section schema_version '{data.get('schema_version')}'.",
                target="reaction_graphs",
            )
        )
    if data.get("project_id") != project_id:
        return err(
            RxnFlowError(
                "invalid_input",
                "Reaction graph section project_id does not match index.",
                target="reaction_graphs",
            )
        )

    raw_graphs = data.get("graphs", [])
    if not isinstance(raw_graphs, list):
        return err(RxnFlowError("invalid_input", "Reaction graph section graphs must be a list.", target="graphs"))

    graphs: list[ReactionGraph] = []
    seen_graph_ids: set[ID] = set()
    for index, value in enumerate(raw_graphs):
        target = f"graphs[{index}]"
        if not isinstance(value, dict):
            return err(RxnFlowError("invalid_input", "Stored reaction graph must be an object.", target=target))
        decoded = _reaction_graph_from_dict(value, target)
        if not decoded.ok or decoded.value is None:
            assert decoded.error is not None
            return err(decoded.error)
        graph_error = _validate_graph(project_id, decoded.value, object_ids, seen_graph_ids, target)
        if graph_error is not None:
            return err(graph_error)
        graphs.append(decoded.value)

    return ok(tuple(graphs))


def workspaces_section_to_dict(
    project_id: ID,
    workspaces: tuple[WorkspaceSnapshot, ...],
    graphs: tuple[ReactionGraph, ...] = (),
    updated_at: str = DEFAULT_WORKSPACE_UPDATED_AT,
) -> Result[dict[str, Any]]:
    if not project_id:
        return err(RxnFlowError("invalid_input", "Workspace section requires project_id.", target="project_id"))

    graph_by_id = {graph.id: graph for graph in graphs}
    encoded_workspaces: list[dict[str, Any]] = []
    seen_workspace_ids: set[ID] = set()
    for index, workspace in enumerate(workspaces):
        target = f"workspaces[{index}]"
        workspace_error = _validate_workspace(
            project_id,
            workspace,
            graph_by_id or {workspace.graph.id: workspace.graph},
            seen_workspace_ids,
            target,
        )
        if workspace_error is not None:
            return err(workspace_error)
        encoded_workspaces.append(_workspace_to_dict(workspace, updated_at))

    return ok(
        {
            "schema_version": WORKSPACES_SCHEMA_VERSION,
            "project_id": project_id,
            "workspaces": encoded_workspaces,
        }
    )


def workspaces_section_from_dict(
    project_id: ID,
    data: dict[str, Any] | None,
    graphs: tuple[ReactionGraph, ...],
    objects: tuple[ChemicalObject, ...],
) -> Result[tuple[WorkspaceSnapshot, ...]]:
    if data is None:
        return ok(())
    if not isinstance(data, dict):
        return err(RxnFlowError("invalid_input", "Workspace section must be an object.", target="workspaces"))
    if data.get("schema_version") != WORKSPACES_SCHEMA_VERSION:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Unsupported section schema_version '{data.get('schema_version')}'.",
                target="workspaces",
            )
        )
    if data.get("project_id") != project_id:
        return err(
            RxnFlowError(
                "invalid_input",
                "Workspace section project_id does not match index.",
                target="workspaces",
            )
        )

    raw_workspaces = data.get("workspaces", [])
    if not isinstance(raw_workspaces, list):
        return err(RxnFlowError("invalid_input", "Workspace section workspaces must be a list.", target="workspaces"))

    graph_by_id = {graph.id: graph for graph in graphs}
    workspaces: list[WorkspaceSnapshot] = []
    seen_workspace_ids: set[ID] = set()
    for index, value in enumerate(raw_workspaces):
        target = f"workspaces[{index}]"
        if not isinstance(value, dict):
            return err(RxnFlowError("invalid_input", "Stored workspace must be an object.", target=target))
        decoded = _workspace_from_dict(project_id, value, graph_by_id, objects, target)
        if not decoded.ok or decoded.value is None:
            assert decoded.error is not None
            return err(decoded.error)
        workspace_error = _validate_workspace(project_id, decoded.value, graph_by_id, seen_workspace_ids, target)
        if workspace_error is not None:
            return err(workspace_error)
        workspaces.append(decoded.value)

    return ok(tuple(workspaces))


def _reaction_graph_to_dict(graph: ReactionGraph) -> dict[str, Any]:
    return {
        "id": graph.id,
        "project_id": graph.project_id,
        "nodes": [_reaction_node_to_dict(node) for node in graph.nodes],
        "edges": [_reaction_edge_to_dict(edge) for edge in graph.edges],
        "paths": [_reaction_path_to_dict(path) for path in graph.paths],
    }


def _reaction_graph_from_dict(data: dict[str, Any], target: str) -> Result[ReactionGraph]:
    nodes_result = _nodes_from_value(data.get("nodes", []), f"{target}.nodes")
    if not nodes_result.ok or nodes_result.value is None:
        assert nodes_result.error is not None
        return err(nodes_result.error)

    edges_result = _edges_from_value(data.get("edges", []), f"{target}.edges")
    if not edges_result.ok or edges_result.value is None:
        assert edges_result.error is not None
        return err(edges_result.error)

    paths_result = _paths_from_value(data.get("paths", []), f"{target}.paths")
    if not paths_result.ok or paths_result.value is None:
        assert paths_result.error is not None
        return err(paths_result.error)

    try:
        return ok(
            ReactionGraph(
                id=str(data["id"]),
                project_id=str(data["project_id"]),
                nodes=nodes_result.value,
                edges=edges_result.value,
                paths=paths_result.value,
            )
        )
    except KeyError as exc:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Reaction graph is missing field '{exc.args[0]}'.",
                target=target,
            )
        )


def _reaction_node_to_dict(node: ReactionNode) -> dict[str, Any]:
    return {
        "id": node.id,
        "kind": node.kind,
        "label": node.label,
        "chemical_object_ids": list(node.chemical_object_ids),
        "composition": [_composition_term_to_dict(term) for term in node.composition],
        "position": list(node.position) if node.position is not None else None,
        "metadata": node.metadata,
    }


def _reaction_node_from_dict(data: dict[str, Any], target: str) -> Result[ReactionNode]:
    position_result = _position_from_value(data.get("position"), f"{target}.position")
    if not position_result.ok:
        assert position_result.error is not None
        return err(position_result.error)
    chemical_object_ids = data.get("chemical_object_ids", [])
    if not isinstance(chemical_object_ids, list):
        return err(
            RxnFlowError(
                "invalid_input",
                "Reaction node chemical_object_ids must be a list.",
                target=f"{target}.chemical_object_ids",
            )
        )
    composition_result = _composition_from_value(data.get("composition"), chemical_object_ids, f"{target}.composition")
    if not composition_result.ok or composition_result.value is None:
        assert composition_result.error is not None
        return err(composition_result.error)
    projected_object_ids = _object_ids_from_composition(composition_result.value)
    if data.get("composition") is not None and tuple(str(object_id) for object_id in chemical_object_ids) != projected_object_ids:
        return err(
            RxnFlowError(
                "invalid_input",
                "Reaction node chemical_object_ids must match composition object_id projection.",
                target=f"{target}.chemical_object_ids",
            )
        )
    metadata = data.get("metadata", {})
    if not isinstance(metadata, dict):
        return err(RxnFlowError("invalid_input", "Reaction node metadata must be an object.", target=f"{target}.metadata"))
    try:
        return ok(
            ReactionNode(
                id=str(data["id"]),
                kind=data["kind"],
                label=str(data["label"]),
                chemical_object_ids=tuple(str(object_id) for object_id in chemical_object_ids),
                position=position_result.value,
                metadata=dict(metadata),
                composition=composition_result.value,
            )
        )
    except KeyError as exc:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Reaction node is missing field '{exc.args[0]}'.",
                target=target,
            )
        )


def _composition_term_to_dict(term: ReactionNodeCompositionTerm) -> dict[str, Any]:
    return {
        "object_id": term.object_id,
        "coefficient": term.coefficient,
        "role": term.role,
        "label": term.label,
        "metadata": term.metadata,
    }


def _object_ids_from_composition(
    composition: tuple[ReactionNodeCompositionTerm, ...],
) -> tuple[ID, ...]:
    return tuple(dict.fromkeys(term.object_id for term in composition if term.object_id))


def _composition_from_value(
    value: Any,
    fallback_object_ids: list[Any],
    target: str,
) -> Result[tuple[ReactionNodeCompositionTerm, ...]]:
    if value is None:
        return ok(tuple(ReactionNodeCompositionTerm(str(object_id)) for object_id in fallback_object_ids))
    if not isinstance(value, list):
        return err(RxnFlowError("invalid_input", "Reaction node composition must be a list.", target=target))

    terms: list[ReactionNodeCompositionTerm] = []
    for index, item in enumerate(value):
        item_target = f"{target}[{index}]"
        if not isinstance(item, dict):
            return err(
                RxnFlowError("invalid_input", "Reaction node composition term must be an object.", target=item_target)
            )
        object_id = item.get("object_id")
        if not isinstance(object_id, str) or not object_id:
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Reaction node composition term object_id is required.",
                    target=item_target,
                )
            )
        coefficient = item.get("coefficient", 1.0)
        if not isinstance(coefficient, (int, float)):
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Reaction node composition coefficient must be numeric.",
                    target=target,
                )
            )
        metadata = item.get("metadata", {})
        if not isinstance(metadata, dict):
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Reaction node composition metadata must be an object.",
                    target=f"{item_target}.metadata",
                )
            )
        role = item.get("role")
        if role is not None:
            role = str(role)
        label = item.get("label")
        if label is not None:
            label = str(label)
        terms.append(
            ReactionNodeCompositionTerm(
                object_id=object_id,
                coefficient=float(coefficient),
                role=role,  # type: ignore[arg-type]
                label=label,
                metadata=dict(metadata),
            )
        )
    return ok(tuple(terms))


def _reaction_edge_to_dict(edge: ReactionEdge) -> dict[str, Any]:
    return {
        "id": edge.id,
        "from_node": edge.from_node,
        "to_node": edge.to_node,
        "label": edge.label,
        "metadata": edge.metadata,
    }


def _reaction_edge_from_dict(data: dict[str, Any], target: str) -> Result[ReactionEdge]:
    metadata = data.get("metadata", {})
    if not isinstance(metadata, dict):
        return err(RxnFlowError("invalid_input", "Reaction edge metadata must be an object.", target=f"{target}.metadata"))
    try:
        return ok(
            ReactionEdge(
                id=str(data["id"]),
                from_node=str(data["from_node"]),
                to_node=str(data["to_node"]),
                label=data.get("label"),
                metadata=dict(metadata),
            )
        )
    except KeyError as exc:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Reaction edge is missing field '{exc.args[0]}'.",
                target=target,
            )
        )


def _reaction_path_to_dict(path: ReactionPath) -> dict[str, Any]:
    return {"id": path.id, "label": path.label, "node_ids": list(path.node_ids)}


def _reaction_path_from_dict(data: dict[str, Any], target: str) -> Result[ReactionPath]:
    node_ids = data.get("node_ids", [])
    if not isinstance(node_ids, list):
        return err(RxnFlowError("invalid_input", "Reaction path node_ids must be a list.", target=f"{target}.node_ids"))
    try:
        return ok(
            ReactionPath(
                id=str(data["id"]),
                label=str(data["label"]),
                node_ids=tuple(str(node_id) for node_id in node_ids),
            )
        )
    except KeyError as exc:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Reaction path is missing field '{exc.args[0]}'.",
                target=target,
            )
        )


def _workspace_to_dict(workspace: WorkspaceSnapshot, updated_at: str) -> dict[str, Any]:
    return {
        "workspace_id": workspace.workspace_id,
        "project_id": workspace.project_id,
        "graph_id": workspace.graph.id,
        "selection": {
            "node_ids": list(workspace.selection.node_ids),
            "edge_ids": list(workspace.selection.edge_ids),
            "path_ids": list(workspace.selection.path_ids),
        },
        "viewport": {
            "x": workspace.viewport.x,
            "y": workspace.viewport.y,
            "zoom": workspace.viewport.zoom,
        },
        "active_path_id": workspace.active_path_id,
        "updated_at": workspace.updated_at or updated_at,
    }


def _workspace_from_dict(
    project_id: ID,
    data: dict[str, Any],
    graph_by_id: dict[ID, ReactionGraph],
    objects: tuple[ChemicalObject, ...],
    target: str,
) -> Result[WorkspaceSnapshot]:
    workspace_id = str(data.get("workspace_id", ""))
    graph_id = str(data.get("graph_id", ""))
    if not workspace_id:
        return err(RxnFlowError("invalid_input", "Workspace id is required.", target=f"{target}.workspace_id"))
    graph = graph_by_id.get(graph_id)
    if graph is None:
        return err(
            RxnFlowError(
                "invalid_input",
                "Workspace references a missing graph.",
                target="workspaces",
                details={"graph_id": graph_id},
            )
        )

    selection = _selection_from_value(data.get("selection", {}), f"{target}.selection")
    if not selection.ok or selection.value is None:
        assert selection.error is not None
        return err(selection.error)

    viewport = _viewport_from_value(data.get("viewport", {}), f"{target}.viewport")
    if not viewport.ok or viewport.value is None:
        assert viewport.error is not None
        return err(viewport.error)

    if "project_id" in data and data.get("project_id") != project_id:
        return err(
            RxnFlowError(
                "invalid_input",
                "Workspace project_id does not match section project_id.",
                target=f"{target}.project_id",
            )
        )

    active_path_id = data.get("active_path_id")
    return ok(
        workspace_snapshot_from_graph(
            project_id,
            graph,
            objects,
            str(active_path_id) if active_path_id is not None else None,
            workspace_id=workspace_id,
            selection=selection.value,
            viewport=viewport.value,
            updated_at=str(data.get("updated_at", DEFAULT_WORKSPACE_UPDATED_AT)),
        )
    )


def _nodes_from_value(value: Any, target: str) -> Result[tuple[ReactionNode, ...]]:
    if not isinstance(value, list):
        return err(RxnFlowError("invalid_input", "Reaction graph nodes must be a list.", target=target))
    nodes: list[ReactionNode] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            return err(RxnFlowError("invalid_input", "Reaction node entry must be an object.", target=f"{target}[{index}]"))
        node = _reaction_node_from_dict(item, f"{target}[{index}]")
        if not node.ok or node.value is None:
            assert node.error is not None
            return err(node.error)
        nodes.append(node.value)
    return ok(tuple(nodes))


def _edges_from_value(value: Any, target: str) -> Result[tuple[ReactionEdge, ...]]:
    if not isinstance(value, list):
        return err(RxnFlowError("invalid_input", "Reaction graph edges must be a list.", target=target))
    edges: list[ReactionEdge] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            return err(RxnFlowError("invalid_input", "Reaction edge entry must be an object.", target=f"{target}[{index}]"))
        edge = _reaction_edge_from_dict(item, f"{target}[{index}]")
        if not edge.ok or edge.value is None:
            assert edge.error is not None
            return err(edge.error)
        edges.append(edge.value)
    return ok(tuple(edges))


def _paths_from_value(value: Any, target: str) -> Result[tuple[ReactionPath, ...]]:
    if not isinstance(value, list):
        return err(RxnFlowError("invalid_input", "Reaction graph paths must be a list.", target=target))
    paths: list[ReactionPath] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            return err(RxnFlowError("invalid_input", "Reaction path entry must be an object.", target=f"{target}[{index}]"))
        path = _reaction_path_from_dict(item, f"{target}[{index}]")
        if not path.ok or path.value is None:
            assert path.error is not None
            return err(path.error)
        paths.append(path.value)
    return ok(tuple(paths))


def _position_from_value(value: Any, target: str) -> Result[tuple[float, float] | None]:
    if value is None:
        return ok(None)
    if not isinstance(value, list | tuple) or len(value) != 2:
        return err(RxnFlowError("invalid_input", "Reaction node position must contain x and y.", target=target))
    try:
        return ok((float(value[0]), float(value[1])))
    except (TypeError, ValueError) as exc:
        return err(RxnFlowError("invalid_input", f"Reaction node position is invalid: {exc}.", target=target))


def _selection_from_value(value: Any, target: str) -> Result[WorkspaceSelection]:
    if not isinstance(value, dict):
        return err(RxnFlowError("invalid_input", "Workspace selection must be an object.", target=target))
    node_ids = _id_tuple_from_value(value.get("node_ids", []), f"{target}.node_ids")
    if not node_ids.ok or node_ids.value is None:
        assert node_ids.error is not None
        return err(node_ids.error)
    edge_ids = _id_tuple_from_value(value.get("edge_ids", []), f"{target}.edge_ids")
    if not edge_ids.ok or edge_ids.value is None:
        assert edge_ids.error is not None
        return err(edge_ids.error)
    path_ids = _id_tuple_from_value(value.get("path_ids", []), f"{target}.path_ids")
    if not path_ids.ok or path_ids.value is None:
        assert path_ids.error is not None
        return err(path_ids.error)
    return ok(WorkspaceSelection(node_ids=node_ids.value, edge_ids=edge_ids.value, path_ids=path_ids.value))


def _viewport_from_value(value: Any, target: str) -> Result[CanvasViewport]:
    if not isinstance(value, dict):
        return err(RxnFlowError("invalid_input", "Workspace viewport must be an object.", target=target))
    try:
        viewport = CanvasViewport(
            x=float(value.get("x", 0.0)),
            y=float(value.get("y", 0.0)),
            zoom=float(value.get("zoom", 1.0)),
        )
    except (TypeError, ValueError) as exc:
        return err(RxnFlowError("invalid_input", f"Workspace viewport is invalid: {exc}.", target=target))
    if viewport.zoom <= 0:
        return err(RxnFlowError("invalid_input", "Workspace viewport zoom must be positive.", target=f"{target}.zoom"))
    return ok(viewport)


def _id_tuple_from_value(value: Any, target: str) -> Result[tuple[ID, ...]]:
    if not isinstance(value, list):
        return err(RxnFlowError("invalid_input", "Workspace id selection must be a list.", target=target))
    return ok(tuple(str(item) for item in value))


def workspace_snapshot_from_graph(
    project_id: ID,
    graph: ReactionGraph,
    objects: tuple[ChemicalObject, ...],
    active_path_id: ID | None,
    *,
    workspace_id: ID | None = None,
    selection: WorkspaceSelection | None = None,
    viewport: CanvasViewport | None = None,
    updated_at: str | None = None,
) -> WorkspaceSnapshot:
    return WorkspaceSnapshot(
        workspace_id=workspace_id or f"workspace-{graph.id}",
        project_id=project_id,
        graph=graph,
        palette=tuple(_palette_item(obj) for obj in objects),
        selection=selection or WorkspaceSelection(),
        viewport=viewport or CanvasViewport(),
        active_path_id=active_path_id,
        preview=_network_preview(graph, active_path_id),
        updated_at=updated_at,
    )


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
    disconnected_node_ids = tuple(node.id for node in graph.nodes if node.id not in connected_node_ids)
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


def _validate_graph(
    project_id: ID,
    graph: ReactionGraph,
    object_ids: set[ID] | frozenset[ID] | None,
    seen_graph_ids: set[ID],
    target: str,
) -> RxnFlowError | None:
    if not graph.id:
        return RxnFlowError("invalid_input", "Reaction graph id is required.", target=f"{target}.id")
    if graph.id in seen_graph_ids:
        return RxnFlowError("invalid_input", "Reaction graph id is duplicated.", target=graph.id)
    seen_graph_ids.add(graph.id)
    if graph.project_id != project_id:
        return RxnFlowError(
            "invalid_input",
            "Reaction graph project_id does not match section project_id.",
            target=f"{target}.project_id",
        )

    node_ids: set[ID] = set()
    for index, node in enumerate(graph.nodes):
        node_error = _validate_node(node, object_ids, node_ids, f"{target}.nodes[{index}]")
        if node_error is not None:
            return node_error

    edge_ids: set[ID] = set()
    for index, edge in enumerate(graph.edges):
        edge_error = _validate_edge(edge, node_ids, edge_ids, f"{target}.edges[{index}]")
        if edge_error is not None:
            return edge_error

    path_ids: set[ID] = set()
    for index, path in enumerate(graph.paths):
        path_error = _validate_path(path, node_ids, path_ids, f"{target}.paths[{index}]")
        if path_error is not None:
            return path_error

    return None


def _validate_workspace(
    project_id: ID,
    workspace: WorkspaceSnapshot,
    graph_by_id: dict[ID, ReactionGraph],
    seen_workspace_ids: set[ID],
    target: str,
) -> RxnFlowError | None:
    if not workspace.workspace_id:
        return RxnFlowError("invalid_input", "Workspace id is required.", target=f"{target}.workspace_id")
    if workspace.workspace_id in seen_workspace_ids:
        return RxnFlowError("invalid_input", "Workspace id is duplicated.", target=workspace.workspace_id)
    seen_workspace_ids.add(workspace.workspace_id)
    if workspace.project_id != project_id:
        return RxnFlowError(
            "invalid_input",
            "Workspace project_id does not match section project_id.",
            target=f"{target}.project_id",
        )

    graph = graph_by_id.get(workspace.graph.id)
    if graph is None:
        return RxnFlowError(
            "invalid_input",
            "Workspace references a missing graph.",
            target="workspaces",
            details={"graph_id": workspace.graph.id},
        )

    if workspace.viewport.zoom <= 0:
        return RxnFlowError(
            "invalid_input",
            "Workspace viewport zoom must be positive.",
            target=f"{target}.viewport.zoom",
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


def _validate_node(
    node: ReactionNode,
    object_ids: set[ID] | frozenset[ID] | None,
    seen_node_ids: set[ID],
    target: str,
) -> RxnFlowError | None:
    if not node.id:
        return RxnFlowError("invalid_input", "Reaction node id is required.", target=f"{target}.id")
    if node.id in seen_node_ids:
        return RxnFlowError("invalid_input", "Reaction node id is duplicated.", target=node.id)
    seen_node_ids.add(node.id)
    if node.kind not in SUPPORTED_NODE_KINDS:
        return RxnFlowError("invalid_input", "Reaction node kind is unsupported.", target=f"{target}.kind")
    for term in node.composition:
        if not term.object_id:
            return RxnFlowError("invalid_input", "Reaction node composition term object_id is required.", target=f"{target}.composition")
        if not isinstance(term.coefficient, (int, float)):
            return RxnFlowError("invalid_input", "Reaction node composition coefficient must be numeric.", target=f"{target}.composition")
        if not math.isfinite(float(term.coefficient)) or float(term.coefficient) == 0:
            return RxnFlowError(
                "invalid_input",
                "Reaction node composition coefficient must be a non-zero finite number.",
                target=f"{target}.composition",
            )
    if node.kind in {"species", "transition_state"} and not node.composition:
        return RxnFlowError(
            "graph_invalid",
            f"Node '{node.id}' must reference at least one chemical object.",
            target=node.id,
        )
    if object_ids is None:
        return None
    for object_id in (term.object_id for term in node.composition):
        if object_id not in object_ids:
            return RxnFlowError(
                "graph_invalid",
                f"Node '{node.id}' references missing chemical object '{object_id}'.",
                target="object_id",
            )
    return None


def _validate_edge(
    edge: ReactionEdge,
    node_ids: set[ID],
    seen_edge_ids: set[ID],
    target: str,
) -> RxnFlowError | None:
    if not edge.id:
        return RxnFlowError("invalid_input", "Reaction edge id is required.", target=f"{target}.id")
    if edge.id in seen_edge_ids:
        return RxnFlowError("invalid_input", "Reaction edge id is duplicated.", target=edge.id)
    seen_edge_ids.add(edge.id)
    if edge.from_node not in node_ids:
        return RxnFlowError(
            "graph_invalid",
            f"Edge '{edge.id}' references missing source node '{edge.from_node}'.",
            target=edge.id,
        )
    if edge.to_node not in node_ids:
        return RxnFlowError(
            "graph_invalid",
            f"Edge '{edge.id}' references missing target node '{edge.to_node}'.",
            target=edge.id,
        )
    return None


def _validate_path(
    path: ReactionPath,
    node_ids: set[ID],
    seen_path_ids: set[ID],
    target: str,
) -> RxnFlowError | None:
    if not path.id:
        return RxnFlowError("invalid_input", "Reaction path id is required.", target=f"{target}.id")
    if path.id in seen_path_ids:
        return RxnFlowError("invalid_input", "Reaction path id is duplicated.", target=path.id)
    seen_path_ids.add(path.id)
    if not path.node_ids:
        return RxnFlowError("graph_invalid", f"Path '{path.id}' must include at least one node.", target=path.id)
    for node_id in path.node_ids:
        if node_id not in node_ids:
            return RxnFlowError(
                "graph_invalid",
                f"Path '{path.id}' references missing node '{node_id}'.",
                target=node_id,
            )
    return None
