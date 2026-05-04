from __future__ import annotations

from pathlib import Path
import unittest

from rxnflow import run_core_fixture_vertical_slice
from rxnflow.graph import ReactionGraphService
from rxnflow.models import GraphPatch, ReactionEdge, ReactionNode, ReactionPath


class ReactionGraphProtocolTest(unittest.TestCase):
    def test_create_graph_returns_empty_graph_and_list_paths(self) -> None:
        service = ReactionGraphService()

        result = service.create_graph("project-a", label="demo")

        self.assertTrue(result.ok, result.error)
        graph = result.value
        self.assertIsNotNone(graph)
        assert graph is not None
        self.assertTrue(graph.id.startswith("graph-"))
        self.assertEqual(graph.project_id, "project-a")
        self.assertEqual(graph.nodes, ())
        self.assertEqual(graph.edges, ())
        self.assertEqual(graph.paths, ())
        self.assertEqual(service.list_paths("project-a", graph.id).value, ())

    def test_add_node_preserves_fields(self) -> None:
        service, graph_id = _service_with_graph()
        node = ReactionNode(
            id="node-r",
            kind="species",
            label="Reactant",
            chemical_object_ids=("object-r",),
            position=(10.0, 20.0),
            metadata={"role": "substrate"},
        )

        result = service.apply_patch(
            "project-a",
            graph_id,
            (GraphPatch("add_node", node=node),),
            object_ids={"object-r"},
        )

        self.assertTrue(result.ok, result.error)
        self.assertEqual(result.value.nodes, (node,))  # type: ignore[union-attr]

    def test_add_edge_set_path_and_list_paths(self) -> None:
        service, graph_id = _service_with_graph()

        result = service.apply_patch(
            "project-a",
            graph_id,
            _main_path_patches(),
            object_ids={"object-r", "object-ts"},
        )

        self.assertTrue(result.ok, result.error)
        graph = result.value  # type: ignore[assignment]
        self.assertEqual([edge.id for edge in graph.edges], ["edge-r-ts"])
        self.assertEqual(service.list_paths("project-a", graph_id).value[0].id, "path-main")  # type: ignore[index, union-attr]

    def test_multiple_paths_express_branches(self) -> None:
        service, graph_id = _service_with_graph()
        patches = _main_path_patches() + (
            GraphPatch("add_node", node=ReactionNode("node-p", "species", "Product", ("object-p",))),
            GraphPatch("add_edge", edge=ReactionEdge("edge-ts-p", "node-ts", "node-p")),
            GraphPatch("set_path", path=ReactionPath("path-product", "product branch", ("node-r", "node-ts", "node-p"))),
        )

        result = service.apply_patch(
            "project-a",
            graph_id,
            patches,
            object_ids={"object-r", "object-ts", "object-p"},
        )

        self.assertTrue(result.ok, result.error)
        self.assertEqual([path.id for path in result.value.paths], ["path-main", "path-product"])  # type: ignore[union-attr]

    def test_update_node_and_edge_preserve_unspecified_fields(self) -> None:
        service, graph_id = _service_with_graph()
        service.apply_patch(
            "project-a",
            graph_id,
            _main_path_patches(),
            object_ids={"object-r", "object-ts"},
        )

        result = service.apply_patch(
            "project-a",
            graph_id,
            (
                GraphPatch("update_node", id="node-r", patch={"label": "Updated R"}),
                GraphPatch("update_edge", id="edge-r-ts", patch={"label": "forward"}),
            ),
            object_ids={"object-r", "object-ts"},
        )

        self.assertTrue(result.ok, result.error)
        graph = result.value  # type: ignore[assignment]
        self.assertEqual(graph.nodes[0].label, "Updated R")
        self.assertEqual(graph.nodes[0].chemical_object_ids, ("object-r",))
        self.assertEqual(graph.edges[0].label, "forward")
        self.assertEqual(graph.edges[0].from_node, "node-r")

    def test_remove_node_cascades_edges_and_paths(self) -> None:
        service, graph_id = _service_with_graph()
        service.apply_patch(
            "project-a",
            graph_id,
            _main_path_patches(),
            object_ids={"object-r", "object-ts"},
        )

        result = service.apply_patch("project-a", graph_id, (GraphPatch("remove", id="node-r"),))

        self.assertTrue(result.ok, result.error)
        graph = result.value  # type: ignore[assignment]
        self.assertEqual([node.id for node in graph.nodes], ["node-ts"])
        self.assertEqual(graph.edges, ())
        self.assertEqual(graph.paths, ())

    def test_invalid_references_return_graph_invalid(self) -> None:
        service, graph_id = _service_with_graph()
        first = service.apply_patch(
            "project-a",
            graph_id,
            (GraphPatch("add_node", node=ReactionNode("node-r", "species", "R", ("object-r",))),),
            object_ids={"object-r"},
        )
        self.assertTrue(first.ok, first.error)

        duplicate = service.apply_patch(
            "project-a",
            graph_id,
            (GraphPatch("add_node", node=ReactionNode("node-r", "species", "R again", ("object-r",))),),
            object_ids={"object-r"},
        )
        missing_edge_node = service.apply_patch(
            "project-a",
            graph_id,
            (GraphPatch("add_edge", edge=ReactionEdge("edge-bad", "node-r", "missing")),),
        )
        missing_path_node = service.apply_patch(
            "project-a",
            graph_id,
            (GraphPatch("set_path", path=ReactionPath("path-bad", "bad", ("missing",))),),
        )

        for result in (duplicate, missing_edge_node, missing_path_node):
            self.assertFalse(result.ok)
            self.assertIsNotNone(result.error)
            assert result.error is not None
            self.assertEqual(result.error.code, "graph_invalid")

    def test_object_id_validation_and_empty_annotation_group_nodes(self) -> None:
        service, graph_id = _service_with_graph()

        missing_object = service.apply_patch(
            "project-a",
            graph_id,
            (GraphPatch("add_node", node=ReactionNode("node-r", "species", "R", ("object-missing",))),),
            object_ids={"object-r"},
        )
        annotation = service.apply_patch(
            "project-a",
            graph_id,
            (
                GraphPatch("add_node", node=ReactionNode("node-note", "annotation", "note")),
                GraphPatch("add_node", node=ReactionNode("node-group", "group", "group")),
            ),
            object_ids=set(),
        )

        self.assertFalse(missing_object.ok)
        self.assertIsNotNone(missing_object.error)
        assert missing_object.error is not None
        self.assertEqual(missing_object.error.code, "graph_invalid")
        self.assertTrue(annotation.ok, annotation.error)
        self.assertEqual([node.kind for node in annotation.value.nodes], ["annotation", "group"])  # type: ignore[union-attr]

    def test_failed_patch_batch_does_not_write_back_state(self) -> None:
        service, graph_id = _service_with_graph()

        result = service.apply_patch(
            "project-a",
            graph_id,
            (
                GraphPatch("add_node", node=ReactionNode("node-r", "species", "R", ("object-r",))),
                GraphPatch("add_edge", edge=ReactionEdge("edge-bad", "node-r", "missing")),
            ),
            object_ids={"object-r"},
        )

        self.assertFalse(result.ok)
        graph = service.apply_patch("project-a", graph_id, ())
        self.assertTrue(graph.ok, graph.error)
        self.assertEqual(graph.value.nodes, ())  # type: ignore[union-attr]

    def test_unknown_graph_or_empty_project_returns_invalid_input(self) -> None:
        service = ReactionGraphService()

        empty_project = service.create_graph("")
        missing_graph = service.apply_patch("project-a", "graph-missing", ())

        for result in (empty_project, missing_graph):
            self.assertFalse(result.ok)
            self.assertIsNotNone(result.error)
            assert result.error is not None
            self.assertEqual(result.error.code, "invalid_input")

    def test_core_fixture_vertical_slice_still_passes(self) -> None:
        result = run_core_fixture_vertical_slice()

        self.assertTrue(result.ok, result.error)
        self.assertEqual(len(result.value.graph.nodes), 2)  # type: ignore[union-attr]

    def test_reaction_graph_service_scope_guard(self) -> None:
        source = Path("rxnflow/graph.py").read_text(encoding="utf-8")

        self.assertNotIn("ProjectStore", source)
        self.assertNotIn(".rxnflow", source)
        self.assertNotIn("ChemicalRegistry", source)
        self.assertNotIn("ParserRegistry", source)
        self.assertNotIn("GaussianLogPlugin", source)
        self.assertNotIn("OrcaOutputPlugin", source)
        self.assertNotIn("XyzPlugin", source)
        self.assertNotIn("MapleOutputPlugin", source)
        self.assertNotIn("compute_fixture_profile", source)
        self.assertNotIn("EnergyProfile", source)
        self.assertNotIn("ExportArtifact", source)
        self.assertNotIn("stoichiometric", source)


def _service_with_graph() -> tuple[ReactionGraphService, str]:
    service = ReactionGraphService()
    graph = service.create_graph("project-a").value
    assert graph is not None
    return service, graph.id


def _main_path_patches() -> tuple[GraphPatch, ...]:
    return (
        GraphPatch("add_node", node=ReactionNode("node-r", "species", "Reactant", ("object-r",))),
        GraphPatch("add_node", node=ReactionNode("node-ts", "transition_state", "TS", ("object-ts",))),
        GraphPatch("add_edge", edge=ReactionEdge("edge-r-ts", "node-r", "node-ts")),
        GraphPatch("set_path", path=ReactionPath("path-main", "main", ("node-r", "node-ts"))),
    )


if __name__ == "__main__":
    unittest.main()
