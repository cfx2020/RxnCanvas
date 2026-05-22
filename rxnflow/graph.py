"""Reaction graph construction and patch application services."""

from __future__ import annotations

from dataclasses import replace
import hashlib
import math

from .errors import RxnFlowError
from .models import (
    ChemicalObject,
    FixtureGraph,
    GraphPatch,
    ID,
    ReactionEdge,
    ReactionGraph,
    ReactionNode,
    ReactionPath,
)
from .result import Result, err, ok


class ReactionGraphService:
    """Project-scoped in-memory service for ReactionGraph patch workflows."""

    def __init__(self) -> None:
        self._projects: dict[ID, dict[ID, ReactionGraph]] = {}

    def create_graph(self, project_id: ID, label: str | None = None) -> Result[ReactionGraph]:
        if not project_id:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Project id is required to create a reaction graph.",
                    target="project_id",
                )
            )
        project_graphs = self._projects.setdefault(project_id, {})
        graph_id = _graph_id(project_id, label, len(project_graphs) + 1)
        graph = ReactionGraph(id=graph_id, project_id=project_id)
        project_graphs[graph.id] = graph
        return ok(graph)

    def apply_patch(
        self,
        project_id: ID,
        graph_id: ID,
        patches: tuple[GraphPatch, ...],
        object_ids: set[ID] | frozenset[ID] | None = None,
    ) -> Result[ReactionGraph]:
        graph_result = self._get_graph(project_id, graph_id)
        if not graph_result.ok or graph_result.value is None:
            return graph_result
        graph = graph_result.value

        current = graph
        for graph_patch in patches:
            patch_result = _apply_single_patch(current, graph_patch, object_ids)
            if not patch_result.ok or patch_result.value is None:
                return patch_result
            current = patch_result.value

        self._projects[project_id][graph_id] = current
        return ok(current)

    def list_paths(self, project_id: ID, graph_id: ID) -> Result[tuple[ReactionPath, ...]]:
        graph_result = self._get_graph(project_id, graph_id)
        if not graph_result.ok or graph_result.value is None:
            assert graph_result.error is not None
            return err(graph_result.error)
        return ok(graph_result.value.paths)

    def list_graphs(self, project_id: ID) -> Result[tuple[ReactionGraph, ...]]:
        if not project_id:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Project id is required.",
                    target="project_id",
                )
            )
        return ok(tuple(self._projects.get(project_id, {}).values()))

    def restore_graphs(
        self,
        project_id: ID,
        graphs: tuple[ReactionGraph, ...],
        object_ids: set[ID] | frozenset[ID] | None = None,
        replace: bool = False,
    ) -> Result[tuple[ReactionGraph, ...]]:
        if not project_id:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Project id is required.",
                    target="project_id",
                )
            )

        target_graphs = {} if replace else dict(self._projects.get(project_id, {}))
        seen_graph_ids: set[ID] = set()
        for graph in graphs:
            validation_error = _validate_restore_graph(project_id, graph, object_ids, seen_graph_ids)
            if validation_error is not None:
                return err(validation_error)
            existing = target_graphs.get(graph.id)
            if existing is not None and existing != graph:
                return err(
                    RxnFlowError(
                        code="invalid_input",
                        message="Reaction graph id conflicts with existing graph.",
                        target=graph.id,
                    )
                )
            target_graphs[graph.id] = graph

        self._projects[project_id] = target_graphs
        return ok(tuple(target_graphs.values()))

    def _get_graph(self, project_id: ID, graph_id: ID) -> Result[ReactionGraph]:
        if not project_id:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Project id is required.",
                    target="project_id",
                )
            )
        project_graphs = self._projects.get(project_id)
        if project_graphs is None or graph_id not in project_graphs:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Reaction graph is not registered in this project.",
                    target=graph_id,
                )
            )
        return ok(project_graphs[graph_id])


def build_fixture_graph(
    project_id: str,
    fixture_graph: FixtureGraph,
    objects: tuple[ChemicalObject, ...],
) -> Result[ReactionGraph]:
    node_ids = {node.id for node in fixture_graph.nodes}
    object_ids = {obj.id for obj in objects}

    for node in fixture_graph.nodes:
        for object_id in _composition_object_ids(node):
            if object_id not in object_ids:
                return err(
                    RxnFlowError(
                        code="graph_invalid",
                        message=f"Node '{node.id}' references missing chemical object '{object_id}'.",
                        target=node.id,
                    )
                )

    for edge in fixture_graph.edges:
        if edge.from_node not in node_ids:
            return err(
                RxnFlowError(
                    code="graph_invalid",
                    message=f"Edge '{edge.id}' references missing source node '{edge.from_node}'.",
                    target=edge.id,
                )
            )
        if edge.to_node not in node_ids:
            return err(
                RxnFlowError(
                    code="graph_invalid",
                    message=f"Edge '{edge.id}' references missing target node '{edge.to_node}'.",
                    target=edge.id,
                )
            )

    for node_id in fixture_graph.path.node_ids:
        if node_id not in node_ids:
            return err(
                RxnFlowError(
                    code="graph_invalid",
                    message=f"Path '{fixture_graph.path.id}' references missing node '{node_id}'.",
                    target=node_id,
                )
            )

    return ok(
        ReactionGraph(
            id="graph-a-b",
            project_id=project_id,
            nodes=fixture_graph.nodes,
            edges=fixture_graph.edges,
            paths=(fixture_graph.path,),
        )
    )


def _graph_id(project_id: ID, label: str | None, index: int) -> ID:
    payload = f"{project_id}:{label or 'graph'}:{index}".encode("utf-8")
    return f"graph-{hashlib.sha256(payload).hexdigest()[:16]}"


def _apply_single_patch(
    graph: ReactionGraph,
    graph_patch: GraphPatch,
    object_ids: set[ID] | frozenset[ID] | None,
) -> Result[ReactionGraph]:
    if graph_patch.op == "add_node":
        if graph_patch.node is None:
            return _missing_payload(graph_patch.op, "node")
        return _add_node(graph, graph_patch.node, object_ids)
    if graph_patch.op == "update_node":
        if graph_patch.id is None:
            return _missing_payload(graph_patch.op, "id")
        return _update_node(graph, graph_patch.id, graph_patch.patch, object_ids)
    if graph_patch.op == "add_edge":
        if graph_patch.edge is None:
            return _missing_payload(graph_patch.op, "edge")
        return _add_edge(graph, graph_patch.edge)
    if graph_patch.op == "update_edge":
        if graph_patch.id is None:
            return _missing_payload(graph_patch.op, "id")
        return _update_edge(graph, graph_patch.id, graph_patch.patch)
    if graph_patch.op == "set_path":
        if graph_patch.path is None:
            return _missing_payload(graph_patch.op, "path")
        return _set_path(graph, graph_patch.path)
    if graph_patch.op == "remove":
        if graph_patch.id is None:
            return _missing_payload(graph_patch.op, "id")
        return _remove(graph, graph_patch.id)

    return err(
        RxnFlowError(
            code="invalid_input",
            message=f"Graph patch operation '{graph_patch.op}' is not supported.",
            target=graph_patch.op,
        )
    )


def _add_node(
    graph: ReactionGraph,
    node: ReactionNode,
    object_ids: set[ID] | frozenset[ID] | None,
) -> Result[ReactionGraph]:
    if node.id in {existing.id for existing in graph.nodes}:
        return _graph_invalid(f"Node '{node.id}' already exists.", node.id)
    node_result = _validate_node(node, object_ids)
    if not node_result.ok:
        return node_result
    return ok(replace(graph, nodes=graph.nodes + (node,)))


def _update_node(
    graph: ReactionGraph,
    node_id: ID,
    patch: dict[str, object],
    object_ids: set[ID] | frozenset[ID] | None,
) -> Result[ReactionGraph]:
    nodes = list(graph.nodes)
    for index, node in enumerate(nodes):
        if node.id != node_id:
            continue
        allowed = {"kind", "label", "chemical_object_ids", "composition", "position", "metadata"}
        unknown = set(patch) - allowed
        if unknown:
            return _invalid_input(f"Unsupported node patch field '{sorted(unknown)[0]}'.", node_id)
        updated = replace(node, **patch)
        node_result = _validate_node(updated, object_ids)
        if not node_result.ok:
            return node_result
        nodes[index] = updated
        return ok(replace(graph, nodes=tuple(nodes)))
    return _graph_invalid(f"Node '{node_id}' does not exist.", node_id)


def _add_edge(graph: ReactionGraph, edge: ReactionEdge) -> Result[ReactionGraph]:
    if edge.id in {existing.id for existing in graph.edges}:
        return _graph_invalid(f"Edge '{edge.id}' already exists.", edge.id)
    edge_result = _validate_edge(edge, {node.id for node in graph.nodes})
    if not edge_result.ok:
        return edge_result
    return ok(replace(graph, edges=graph.edges + (edge,)))


def _update_edge(
    graph: ReactionGraph,
    edge_id: ID,
    patch: dict[str, object],
) -> Result[ReactionGraph]:
    edges = list(graph.edges)
    node_ids = {node.id for node in graph.nodes}
    for index, edge in enumerate(edges):
        if edge.id != edge_id:
            continue
        allowed = {"from_node", "to_node", "label", "metadata"}
        unknown = set(patch) - allowed
        if unknown:
            return _invalid_input(f"Unsupported edge patch field '{sorted(unknown)[0]}'.", edge_id)
        updated = replace(edge, **patch)
        edge_result = _validate_edge(updated, node_ids)
        if not edge_result.ok:
            return edge_result
        edges[index] = updated
        return ok(replace(graph, edges=tuple(edges)))
    return _graph_invalid(f"Edge '{edge_id}' does not exist.", edge_id)


def _set_path(graph: ReactionGraph, path: ReactionPath) -> Result[ReactionGraph]:
    path_result = _validate_path(path, {node.id for node in graph.nodes})
    if not path_result.ok:
        return path_result
    paths = tuple(existing for existing in graph.paths if existing.id != path.id)
    return ok(replace(graph, paths=paths + (path,)))


def _remove(graph: ReactionGraph, item_id: ID) -> Result[ReactionGraph]:
    node_ids = {node.id for node in graph.nodes}
    edge_ids = {edge.id for edge in graph.edges}
    path_ids = {path.id for path in graph.paths}

    if item_id in node_ids:
        return ok(
            replace(
                graph,
                nodes=tuple(node for node in graph.nodes if node.id != item_id),
                edges=tuple(
                    edge
                    for edge in graph.edges
                    if edge.from_node != item_id and edge.to_node != item_id
                ),
                paths=tuple(path for path in graph.paths if item_id not in path.node_ids),
            )
        )
    if item_id in edge_ids:
        return ok(replace(graph, edges=tuple(edge for edge in graph.edges if edge.id != item_id)))
    if item_id in path_ids:
        return ok(replace(graph, paths=tuple(path for path in graph.paths if path.id != item_id)))
    return _graph_invalid(f"Graph item '{item_id}' does not exist.", item_id)


def _validate_node(
    node: ReactionNode,
    object_ids: set[ID] | frozenset[ID] | None,
) -> Result[None]:
    composition_result = _validate_composition(node)
    if not composition_result.ok:
        return composition_result
    if node.kind in {"species", "transition_state"} and not node.composition:
        return _graph_invalid(
            f"Node '{node.id}' must reference at least one chemical object.",
            node.id,
        )
    if object_ids is not None:
        for object_id in _composition_object_ids(node):
            if object_id not in object_ids:
                return _graph_invalid(
                    f"Node '{node.id}' references missing chemical object '{object_id}'.",
                    "object_id",
                )
    return ok(None)


def _validate_composition(node: ReactionNode) -> Result[None]:
    for term in node.composition:
        if not term.object_id:
            return _invalid_input("Reaction node composition term object_id is required.", "composition")
        if not isinstance(term.coefficient, (int, float)):
            return _invalid_input("Reaction node composition coefficient must be numeric.", "composition")
        if not math.isfinite(float(term.coefficient)) or float(term.coefficient) == 0:
            return _invalid_input(
                "Reaction node composition coefficient must be a non-zero finite number.",
                "composition",
            )
    return ok(None)


def _composition_object_ids(node: ReactionNode) -> tuple[ID, ...]:
    return tuple(term.object_id for term in node.composition)


def _validate_restore_graph(
    project_id: ID,
    graph: ReactionGraph,
    object_ids: set[ID] | frozenset[ID] | None,
    seen_graph_ids: set[ID],
) -> RxnFlowError | None:
    if not graph.id:
        return RxnFlowError("invalid_input", "Reaction graph id is required.", target="graph_id")
    if graph.id in seen_graph_ids:
        return RxnFlowError("invalid_input", "Reaction graph id is duplicated.", target=graph.id)
    seen_graph_ids.add(graph.id)
    if graph.project_id != project_id:
        return RxnFlowError(
            "invalid_input",
            "Reaction graph project_id does not match restore project_id.",
            target="project_id",
        )

    node_ids: set[ID] = set()
    for node in graph.nodes:
        if node.id in node_ids:
            return RxnFlowError("invalid_input", "Reaction node id is duplicated.", target=node.id)
        node_result = _validate_node(node, object_ids)
        if not node_result.ok:
            assert node_result.error is not None
            return node_result.error
        node_ids.add(node.id)

    edge_ids: set[ID] = set()
    for edge in graph.edges:
        if edge.id in edge_ids:
            return RxnFlowError("invalid_input", "Reaction edge id is duplicated.", target=edge.id)
        edge_result = _validate_edge(edge, node_ids)
        if not edge_result.ok:
            assert edge_result.error is not None
            return edge_result.error
        edge_ids.add(edge.id)

    path_ids: set[ID] = set()
    for path in graph.paths:
        if path.id in path_ids:
            return RxnFlowError("invalid_input", "Reaction path id is duplicated.", target=path.id)
        path_result = _validate_path(path, node_ids)
        if not path_result.ok:
            assert path_result.error is not None
            return path_result.error
        path_ids.add(path.id)

    return None


def _validate_edge(edge: ReactionEdge, node_ids: set[ID]) -> Result[None]:
    if edge.from_node not in node_ids:
        return _graph_invalid(
            f"Edge '{edge.id}' references missing source node '{edge.from_node}'.",
            edge.id,
        )
    if edge.to_node not in node_ids:
        return _graph_invalid(
            f"Edge '{edge.id}' references missing target node '{edge.to_node}'.",
            edge.id,
        )
    return ok(None)


def _validate_path(path: ReactionPath, node_ids: set[ID]) -> Result[None]:
    if not path.node_ids:
        return _graph_invalid(f"Path '{path.id}' must include at least one node.", path.id)
    for node_id in path.node_ids:
        if node_id not in node_ids:
            return _graph_invalid(
                f"Path '{path.id}' references missing node '{node_id}'.",
                node_id,
            )
    return ok(None)


def _missing_payload(op: str, payload: str) -> Result[ReactionGraph]:
    return _invalid_input(f"Graph patch '{op}' must include {payload}.", op)


def _invalid_input(message: str, target: str) -> Result[ReactionGraph]:
    return err(RxnFlowError(code="invalid_input", message=message, target=target))


def _graph_invalid(message: str, target: str) -> Result[ReactionGraph]:
    return err(RxnFlowError(code="graph_invalid", message=message, target=target))
