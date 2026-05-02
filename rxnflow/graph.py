"""Reaction graph construction for fixture data."""

from __future__ import annotations

from .errors import RxnFlowError
from .models import ChemicalObject, FixtureGraph, ReactionGraph
from .result import Result, err, ok


def build_fixture_graph(
    project_id: str,
    fixture_graph: FixtureGraph,
    objects: tuple[ChemicalObject, ...],
) -> Result[ReactionGraph]:
    node_ids = {node.id for node in fixture_graph.nodes}
    object_ids = {obj.id for obj in objects}

    for node in fixture_graph.nodes:
        for object_id in node.chemical_object_ids:
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
