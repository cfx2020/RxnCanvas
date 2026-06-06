from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from rxnflow import run_core_fixture_vertical_slice
from rxnflow.energy import EnergyProfileEngine
from rxnflow.graph import ReactionGraphService
from rxnflow.import_workflow import ImportFileRequest, ImportRegistryWorkflow, ImportSelection
from rxnflow.models import (
    ChemicalObject,
    EnergyValue,
    GraphPatch,
    Provenance,
    ReactionNodeCompositionTerm,
)
from rxnflow.parsers import ParserRegistry
from rxnflow.project import ProjectStore
from rxnflow.registry import ChemicalRegistry
from rxnflow.workspace import (
    CanvasViewport,
    GraphEditorWorkspaceService,
    NodePlacement,
    WorkspaceSelection,
)


PROJECT_ID = "project-a"


class GraphEditorWorkspaceTest(unittest.TestCase):
    def test_open_workspace_creates_empty_graph_snapshot_and_defaults(self) -> None:
        service = GraphEditorWorkspaceService(ReactionGraphService())

        opened = service.open_workspace(PROJECT_ID, label="main route")

        self.assertTrue(opened.ok, opened.error)
        snapshot = opened.value
        assert snapshot is not None
        self.assertTrue(snapshot.workspace_id.startswith("workspace-"))
        self.assertEqual(snapshot.project_id, PROJECT_ID)
        self.assertEqual(snapshot.graph.project_id, PROJECT_ID)
        self.assertEqual(snapshot.graph.nodes, ())
        self.assertEqual(snapshot.palette, ())
        self.assertEqual(snapshot.selection, WorkspaceSelection())
        self.assertEqual(snapshot.viewport, CanvasViewport())
        self.assertIsNone(snapshot.active_path_id)
        self.assertEqual(snapshot.preview.nodes, ())

    def test_open_workspace_binds_existing_graph_without_creating_duplicate(self) -> None:
        graph_service = ReactionGraphService()
        existing = graph_service.create_graph(PROJECT_ID, label="existing").value
        assert existing is not None
        workspace = GraphEditorWorkspaceService(graph_service)

        opened = workspace.open_workspace(PROJECT_ID, graph_id=existing.id)

        self.assertTrue(opened.ok, opened.error)
        self.assertEqual(opened.value.graph.id, existing.id)  # type: ignore[union-attr]
        self.assertEqual(len(graph_service._projects[PROJECT_ID]), 1)

    def test_palette_uses_confirmed_import_objects_and_filters_pending_or_failed_items(self) -> None:
        with TemporaryDirectory() as tmp:
            root = _create_project(tmp)
            registry = ChemicalRegistry()
            import_workflow = ImportRegistryWorkflow(
                ProjectStore(),
                ParserRegistry.default(),
                registry,
            )
            confirmed_source = _write_xyz(tmp, "confirmed.xyz", "confirmed", energy=-1.0)
            pending_source = _write_xyz(tmp, "pending.xyz", "pending", energy=-2.0)
            unsupported = Path(tmp) / "note.txt"
            unsupported.write_text("not a chemistry output", encoding="utf-8")

            confirmed_batch = import_workflow.import_files(
                root,
                (ImportFileRequest(confirmed_source),),
            ).value
            assert confirmed_batch is not None
            confirmed_item = confirmed_batch.items[0]
            confirmed = import_workflow.confirm_import(
                confirmed_batch.project_id,
                confirmed_batch.id,
                (ImportSelection(confirmed_item.id),),
            ).value
            assert confirmed is not None
            confirmed_object_id = confirmed.items[0].registered_object_ids[0]
            import_workflow.import_files(
                root,
                (ImportFileRequest(pending_source), ImportFileRequest(unsupported)),
            )
            workspace = GraphEditorWorkspaceService(
                ReactionGraphService(),
                import_workflow,
                registry,
            )

            opened = workspace.open_workspace(confirmed_batch.project_id)

            self.assertTrue(opened.ok, opened.error)
            palette = opened.value.palette  # type: ignore[union-attr]
            self.assertEqual([item.object_id for item in palette], [confirmed_object_id])
            self.assertEqual(palette[0].label, "confirmed Energy = -1.0 Hartree")
            assert confirmed.items[0].preview is not None
            self.assertEqual(palette[0].source_file_id, confirmed.items[0].preview.raw_resource_id)
            self.assertEqual(palette[0].energy_keys, ("electronic",))

    def test_add_node_preserves_object_position_and_metadata(self) -> None:
        obj = _object("object-r", label="Reactant")
        workspace, workspace_id = _workspace_with_objects(obj)

        added = workspace.add_node(
            PROJECT_ID,
            workspace_id,
            NodePlacement(
                kind="species",
                label="Reactant",
                chemical_object_ids=(obj.id,),
                position=(120.0, 80.0),
                metadata={"role": "substrate"},
            ),
        )

        self.assertTrue(added.ok, added.error)
        node = added.value.graph.nodes[0]  # type: ignore[union-attr]
        self.assertEqual(node.kind, "species")
        self.assertEqual(node.label, "Reactant")
        self.assertEqual(node.chemical_object_ids, (obj.id,))
        self.assertEqual(node.composition, (ReactionNodeCompositionTerm(obj.id),))
        self.assertEqual(node.position, (120.0, 80.0))
        self.assertEqual(node.metadata, {"role": "substrate"})

    def test_set_node_composition_updates_existing_node_and_preserves_projection(self) -> None:
        workspace, workspace_id = _workspace_with_objects(
            _object("object-a", label="A"),
            _object("object-b", label="B"),
        )
        node = _add_species(workspace, workspace_id, "Combo", "object-a")

        updated = workspace.set_node_composition(
            PROJECT_ID,
            workspace_id,
            node.id,
            (
                ReactionNodeCompositionTerm("object-a", 1.0),
                ReactionNodeCompositionTerm("object-b", 2.0, role="reagent"),
            ),
        )

        self.assertTrue(updated.ok, updated.error)
        stored = updated.value.graph.nodes[0]  # type: ignore[union-attr]
        self.assertEqual(stored.chemical_object_ids, ("object-a", "object-b"))
        self.assertEqual([term.coefficient for term in stored.composition], [1.0, 2.0])
        self.assertEqual(stored.composition[1].role, "reagent")

    def test_set_node_composition_errors_do_not_change_state(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-a"))
        node = _add_species(workspace, workspace_id, "A", "object-a")
        before = workspace.snapshot(PROJECT_ID, workspace_id).value.graph

        bad_coefficient = workspace.set_node_composition(
            PROJECT_ID,
            workspace_id,
            node.id,
            (ReactionNodeCompositionTerm("object-a", 0.0),),
        )
        missing_object = workspace.set_node_composition(
            PROJECT_ID,
            workspace_id,
            node.id,
            (ReactionNodeCompositionTerm("object-missing", 1.0),),
        )
        after = workspace.snapshot(PROJECT_ID, workspace_id).value.graph

        self.assertFalse(bad_coefficient.ok)
        self.assertEqual(bad_coefficient.error.code, "invalid_input")  # type: ignore[union-attr]
        self.assertFalse(missing_object.ok)
        self.assertEqual(missing_object.error.code, "graph_invalid")  # type: ignore[union-attr]
        self.assertEqual(after, before)

    def test_add_annotation_and_group_nodes_without_objects(self) -> None:
        workspace, workspace_id = _workspace_with_objects()

        annotation = workspace.add_node(
            PROJECT_ID,
            workspace_id,
            NodePlacement(kind="annotation", label="note"),
        )
        group = workspace.add_node(
            PROJECT_ID,
            workspace_id,
            NodePlacement(kind="group", label="branch"),
        )

        self.assertTrue(annotation.ok, annotation.error)
        self.assertTrue(group.ok, group.error)
        self.assertEqual([node.kind for node in group.value.graph.nodes], ["annotation", "group"])  # type: ignore[union-attr]

    def test_add_node_with_missing_object_returns_graph_invalid_without_state_change(self) -> None:
        workspace, workspace_id = _workspace_with_objects()
        before = workspace.snapshot(PROJECT_ID, workspace_id).value.graph

        result = workspace.add_node(
            PROJECT_ID,
            workspace_id,
            NodePlacement(
                kind="species",
                label="missing",
                chemical_object_ids=("object-missing",),
            ),
        )
        after = workspace.snapshot(PROJECT_ID, workspace_id).value.graph

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "graph_invalid")
        self.assertEqual(after, before)

    def test_connect_nodes_and_set_active_path_update_preview(self) -> None:
        workspace, workspace_id = _workspace_with_objects(
            _object("object-r"),
            _object("object-ts", label="TS"),
        )
        first = _add_species(workspace, workspace_id, "R", "object-r")
        second = _add_species(workspace, workspace_id, "TS", "object-ts")

        connected = workspace.connect_nodes(PROJECT_ID, workspace_id, first.id, second.id)
        active = workspace.set_active_path(
            PROJECT_ID,
            workspace_id,
            "path-main",
            (first.id, second.id),
            label="main",
        )

        self.assertTrue(connected.ok, connected.error)
        self.assertTrue(active.ok, active.error)
        snapshot = active.value
        assert snapshot is not None
        self.assertEqual(len(snapshot.graph.edges), 1)
        self.assertEqual(snapshot.active_path_id, "path-main")
        self.assertEqual(snapshot.preview.edges, snapshot.graph.edges)
        self.assertEqual(snapshot.preview.paths[0].id, "path-main")

    def test_connect_missing_node_returns_graph_invalid_without_state_change(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-r"))
        node = _add_species(workspace, workspace_id, "R", "object-r")
        before = workspace.snapshot(PROJECT_ID, workspace_id).value.graph

        result = workspace.connect_nodes(PROJECT_ID, workspace_id, node.id, "node-missing")
        after = workspace.snapshot(PROJECT_ID, workspace_id).value.graph

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "graph_invalid")
        self.assertEqual(after, before)

    def test_update_edge_label_preserves_endpoints_and_selection(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-r"), _object("object-p"))
        reactant = _add_species(workspace, workspace_id, "R", "object-r")
        product = _add_species(workspace, workspace_id, "P", "object-p")
        connected = workspace.connect_nodes(PROJECT_ID, workspace_id, reactant.id, product.id)
        self.assertTrue(connected.ok, connected.error)
        edge_id = connected.value.graph.edges[0].id  # type: ignore[union-attr]
        workspace.select(PROJECT_ID, workspace_id, WorkspaceSelection(edge_ids=(edge_id,)))

        updated = workspace.update_edge(
            PROJECT_ID,
            workspace_id,
            edge_id,
            label="TS search",
            metadata={"condition": "screening"},
        )

        self.assertTrue(updated.ok, updated.error)
        snapshot = updated.value
        assert snapshot is not None
        edge = snapshot.graph.edges[0]
        self.assertEqual(edge.id, edge_id)
        self.assertEqual(edge.from_node, reactant.id)
        self.assertEqual(edge.to_node, product.id)
        self.assertEqual(edge.label, "TS search")
        self.assertEqual(edge.metadata, {"condition": "screening"})
        self.assertEqual(snapshot.selection.edge_ids, (edge_id,))

    def test_update_edge_label_can_clear_label(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-r"), _object("object-p"))
        reactant = _add_species(workspace, workspace_id, "R", "object-r")
        product = _add_species(workspace, workspace_id, "P", "object-p")
        connected = workspace.connect_nodes(
            PROJECT_ID,
            workspace_id,
            reactant.id,
            product.id,
            label="forward",
        )
        self.assertTrue(connected.ok, connected.error)
        edge_id = connected.value.graph.edges[0].id  # type: ignore[union-attr]

        cleared = workspace.update_edge(PROJECT_ID, workspace_id, edge_id, label=None)

        self.assertTrue(cleared.ok, cleared.error)
        edge = cleared.value.graph.edges[0]  # type: ignore[union-attr]
        self.assertIsNone(edge.label)
        self.assertEqual(edge.from_node, reactant.id)
        self.assertEqual(edge.to_node, product.id)

    def test_update_missing_edge_returns_graph_invalid_without_state_change(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-r"), _object("object-p"))
        reactant = _add_species(workspace, workspace_id, "R", "object-r")
        product = _add_species(workspace, workspace_id, "P", "object-p")
        workspace.connect_nodes(PROJECT_ID, workspace_id, reactant.id, product.id)
        before = workspace.snapshot(PROJECT_ID, workspace_id).value.graph

        updated = workspace.update_edge(PROJECT_ID, workspace_id, "edge-missing", label="missing")
        after = workspace.snapshot(PROJECT_ID, workspace_id).value.graph

        self.assertFalse(updated.ok)
        self.assertIsNotNone(updated.error)
        assert updated.error is not None
        self.assertEqual(updated.error.code, "graph_invalid")
        self.assertEqual(updated.error.target, "edge-missing")
        self.assertEqual(after, before)

    def test_multiple_active_paths_are_kept_for_branch_preview(self) -> None:
        workspace, workspace_id = _workspace_with_objects(
            _object("object-r"),
            _object("object-ts"),
            _object("object-p"),
        )
        reactant = _add_species(workspace, workspace_id, "R", "object-r")
        transition = _add_species(workspace, workspace_id, "TS", "object-ts")
        product = _add_species(workspace, workspace_id, "P", "object-p")

        workspace.set_active_path(PROJECT_ID, workspace_id, "path-main", (reactant.id, transition.id))
        branch = workspace.set_active_path(
            PROJECT_ID,
            workspace_id,
            "path-product",
            (reactant.id, transition.id, product.id),
        )

        self.assertTrue(branch.ok, branch.error)
        snapshot = branch.value
        assert snapshot is not None
        self.assertEqual([path.id for path in snapshot.graph.paths], ["path-main", "path-product"])
        self.assertEqual([path.id for path in snapshot.preview.paths], ["path-main", "path-product"])
        self.assertEqual(snapshot.active_path_id, "path-product")

    def test_move_node_updates_position_without_changing_edges_or_paths(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-r"), _object("object-p"))
        reactant = _add_species(workspace, workspace_id, "R", "object-r")
        product = _add_species(workspace, workspace_id, "P", "object-p")
        workspace.connect_nodes(PROJECT_ID, workspace_id, reactant.id, product.id)
        workspace.set_active_path(PROJECT_ID, workspace_id, "path-main", (reactant.id, product.id))

        moved = workspace.move_node(PROJECT_ID, workspace_id, product.id, (240.0, 180.0))

        self.assertTrue(moved.ok, moved.error)
        snapshot = moved.value
        assert snapshot is not None
        moved_node = next(node for node in snapshot.graph.nodes if node.id == product.id)
        self.assertEqual(moved_node.position, (240.0, 180.0))
        self.assertEqual(
            [(edge.from_node, edge.to_node) for edge in snapshot.graph.edges],
            [(reactant.id, product.id)],
        )
        self.assertEqual(snapshot.graph.paths[0].node_ids, (reactant.id, product.id))
        self.assertEqual(snapshot.preview.disconnected_node_ids, ())

    def test_move_missing_node_returns_graph_invalid_without_state_change(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-r"))
        _add_species(workspace, workspace_id, "R", "object-r")
        before = workspace.snapshot(PROJECT_ID, workspace_id).value.graph

        moved = workspace.move_node(PROJECT_ID, workspace_id, "node-missing", (240.0, 180.0))
        after = workspace.snapshot(PROJECT_ID, workspace_id).value.graph

        self.assertFalse(moved.ok)
        self.assertIsNotNone(moved.error)
        assert moved.error is not None
        self.assertEqual(moved.error.code, "graph_invalid")
        self.assertEqual(after, before)

    def test_selection_and_viewport_do_not_change_graph(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-r"))
        node = _add_species(workspace, workspace_id, "R", "object-r")
        before = workspace.snapshot(PROJECT_ID, workspace_id).value.graph

        selected = workspace.select(
            PROJECT_ID,
            workspace_id,
            WorkspaceSelection(node_ids=(node.id,)),
        )
        moved = workspace.set_viewport(
            PROJECT_ID,
            workspace_id,
            CanvasViewport(x=10.0, y=-4.0, zoom=1.5),
        )

        self.assertTrue(selected.ok, selected.error)
        self.assertTrue(moved.ok, moved.error)
        self.assertEqual(moved.value.graph, before)  # type: ignore[union-attr]
        self.assertEqual(moved.value.selection.node_ids, (node.id,))  # type: ignore[union-attr]
        self.assertEqual(moved.value.viewport, CanvasViewport(x=10.0, y=-4.0, zoom=1.5))  # type: ignore[union-attr]

    def test_select_rejects_missing_graph_item_without_state_change(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-r"))
        _add_species(workspace, workspace_id, "R", "object-r")
        before = workspace.snapshot(PROJECT_ID, workspace_id).value

        selected = workspace.select(
            PROJECT_ID,
            workspace_id,
            WorkspaceSelection(node_ids=("node-missing",)),
        )
        after = workspace.snapshot(PROJECT_ID, workspace_id).value

        self.assertFalse(selected.ok)
        self.assertIsNotNone(selected.error)
        assert selected.error is not None
        self.assertEqual(selected.error.code, "graph_invalid")
        self.assertEqual(selected.error.target, "node_id")
        self.assertEqual(after.selection, before.selection)

    def test_remove_node_updates_preview_after_graph_service_cascade(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-r"), _object("object-p"))
        reactant = _add_species(workspace, workspace_id, "R", "object-r")
        product = _add_species(workspace, workspace_id, "P", "object-p")
        workspace.connect_nodes(PROJECT_ID, workspace_id, reactant.id, product.id)
        workspace.set_active_path(PROJECT_ID, workspace_id, "path-main", (reactant.id, product.id))
        workspace.select(PROJECT_ID, workspace_id, WorkspaceSelection(node_ids=(reactant.id,)))

        removed = workspace.remove_items(
            PROJECT_ID,
            workspace_id,
            node_ids=(reactant.id,),
        )

        self.assertTrue(removed.ok, removed.error)
        snapshot = removed.value
        assert snapshot is not None
        self.assertEqual(snapshot.graph.edges, ())
        self.assertEqual(snapshot.graph.paths, ())
        self.assertIsNone(snapshot.active_path_id)
        self.assertEqual(snapshot.selection, WorkspaceSelection())
        self.assertEqual(snapshot.preview.edges, ())
        self.assertEqual(snapshot.preview.paths, ())
        self.assertEqual(snapshot.preview.disconnected_node_ids, (product.id,))

    def test_remove_edge_keeps_nodes_and_updates_preview(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-r"), _object("object-p"))
        reactant = _add_species(workspace, workspace_id, "R", "object-r")
        product = _add_species(workspace, workspace_id, "P", "object-p")
        connected = workspace.connect_nodes(PROJECT_ID, workspace_id, reactant.id, product.id)
        self.assertTrue(connected.ok, connected.error)
        edge_id = connected.value.graph.edges[0].id  # type: ignore[union-attr]

        removed = workspace.remove_items(PROJECT_ID, workspace_id, edge_ids=(edge_id,))

        self.assertTrue(removed.ok, removed.error)
        snapshot = removed.value
        assert snapshot is not None
        self.assertEqual([node.id for node in snapshot.graph.nodes], [reactant.id, product.id])
        self.assertEqual(snapshot.graph.edges, ())
        self.assertEqual(snapshot.preview.disconnected_node_ids, (reactant.id, product.id))

    def test_remove_path_keeps_nodes_edges_and_prunes_active_selection(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-r"), _object("object-p"))
        reactant = _add_species(workspace, workspace_id, "R", "object-r")
        product = _add_species(workspace, workspace_id, "P", "object-p")
        connected = workspace.connect_nodes(PROJECT_ID, workspace_id, reactant.id, product.id)
        self.assertTrue(connected.ok, connected.error)
        workspace.set_active_path(PROJECT_ID, workspace_id, "path-main", (reactant.id, product.id))
        workspace.select(PROJECT_ID, workspace_id, WorkspaceSelection(path_ids=("path-main",)))

        removed = workspace.remove_items(PROJECT_ID, workspace_id, path_ids=("path-main",))

        self.assertTrue(removed.ok, removed.error)
        snapshot = removed.value
        assert snapshot is not None
        self.assertEqual([node.id for node in snapshot.graph.nodes], [reactant.id, product.id])
        self.assertEqual(len(snapshot.graph.edges), 1)
        self.assertEqual(snapshot.graph.paths, ())
        self.assertIsNone(snapshot.active_path_id)
        self.assertEqual(snapshot.selection, WorkspaceSelection())
        self.assertEqual(snapshot.preview.paths, ())

    def test_remove_non_active_path_keeps_active_path(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-r"), _object("object-p"))
        reactant = _add_species(workspace, workspace_id, "R", "object-r")
        product = _add_species(workspace, workspace_id, "P", "object-p")
        workspace.set_active_path(PROJECT_ID, workspace_id, "path-main", (reactant.id, product.id))
        workspace.set_active_path(PROJECT_ID, workspace_id, "path-branch", (product.id,))
        workspace.set_active_path(PROJECT_ID, workspace_id, "path-main", (reactant.id, product.id))

        removed = workspace.remove_items(PROJECT_ID, workspace_id, path_ids=("path-branch",))

        self.assertTrue(removed.ok, removed.error)
        snapshot = removed.value
        assert snapshot is not None
        self.assertEqual(snapshot.active_path_id, "path-main")
        self.assertEqual([path.id for path in snapshot.graph.paths], ["path-main"])

    def test_remove_node_and_its_path_once_when_path_is_also_selected(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-r"), _object("object-p"))
        reactant = _add_species(workspace, workspace_id, "R", "object-r")
        product = _add_species(workspace, workspace_id, "P", "object-p")
        workspace.set_active_path(PROJECT_ID, workspace_id, "path-main", (reactant.id, product.id))

        removed = workspace.remove_items(
            PROJECT_ID,
            workspace_id,
            node_ids=(reactant.id,),
            path_ids=("path-main",),
        )

        self.assertTrue(removed.ok, removed.error)
        snapshot = removed.value
        assert snapshot is not None
        self.assertEqual([node.id for node in snapshot.graph.nodes], [product.id])
        self.assertEqual(snapshot.graph.paths, ())

    def test_remove_items_rejects_empty_and_missing_selection_without_state_change(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-r"))
        _add_species(workspace, workspace_id, "R", "object-r")
        before = workspace.snapshot(PROJECT_ID, workspace_id).value.graph

        empty = workspace.remove_items(PROJECT_ID, workspace_id)
        missing = workspace.remove_items(PROJECT_ID, workspace_id, edge_ids=("edge-missing",))
        missing_path = workspace.remove_items(PROJECT_ID, workspace_id, path_ids=("path-missing",))
        after = workspace.snapshot(PROJECT_ID, workspace_id).value.graph

        self.assertFalse(empty.ok)
        self.assertEqual(empty.error.code, "invalid_input")  # type: ignore[union-attr]
        self.assertEqual(empty.error.target, "selection")  # type: ignore[union-attr]
        self.assertFalse(missing.ok)
        self.assertEqual(missing.error.code, "graph_invalid")  # type: ignore[union-attr]
        self.assertFalse(missing_path.ok)
        self.assertEqual(missing_path.error.code, "graph_invalid")  # type: ignore[union-attr]
        self.assertEqual(missing_path.error.target, "path-missing")  # type: ignore[union-attr]
        self.assertEqual(after, before)

    def test_network_preview_reports_disconnected_nodes(self) -> None:
        workspace, workspace_id = _workspace_with_objects(_object("object-a"), _object("object-b"))
        first = _add_species(workspace, workspace_id, "A", "object-a")
        second = _add_species(workspace, workspace_id, "B", "object-b")

        snapshot = workspace.snapshot(PROJECT_ID, workspace_id).value

        self.assertEqual(snapshot.preview.disconnected_node_ids, (first.id, second.id))
        self.assertEqual(snapshot.preview.warnings[0].code, "disconnected_nodes")

    def test_existing_core_services_still_pass(self) -> None:
        self.assertTrue(run_core_fixture_vertical_slice().ok)
        self.assertIsNotNone(EnergyProfileEngine)

    def test_workspace_scope_guard(self) -> None:
        source = Path("rxnflow/workspace.py").read_text(encoding="utf-8")

        self.assertNotIn("ParserRegistry", source)
        self.assertNotIn("ProjectStore", source)
        self.assertNotIn("add_raw_file", source)
        self.assertNotIn("import_files(", source)
        self.assertNotIn("confirm_import(", source)
        self.assertNotIn("EnergyProfileEngine", source)
        self.assertNotIn("EnergyProfile", source)
        self.assertNotIn("ExportArtifact", source)
        self.assertNotIn("PNG", source)
        self.assertNotIn("CDXML", source)
        self.assertNotIn("Excel", source)
        self.assertNotIn("FastAPI", source)
        self.assertNotIn("click", source)
        self.assertNotIn("Next.js", source)
        self.assertNotIn("next/", source)
        self.assertNotIn("Electron", source)
        self.assertNotIn("Tauri", source)
        self.assertNotIn("SwiftUI", source)
        self.assertNotIn("Three", source)


def _workspace_with_objects(
    *objects: ChemicalObject,
) -> tuple[GraphEditorWorkspaceService, str]:
    workspace = GraphEditorWorkspaceService(ReactionGraphService())
    opened = workspace.open_workspace(PROJECT_ID, objects=objects)
    assert opened.ok
    assert opened.value is not None
    return workspace, opened.value.workspace_id


def _add_species(
    workspace: GraphEditorWorkspaceService,
    workspace_id: str,
    label: str,
    object_id: str,
):
    result = workspace.add_node(
        PROJECT_ID,
        workspace_id,
        NodePlacement(
            kind="species",
            label=label,
            chemical_object_ids=(object_id,),
        ),
    )
    assert result.ok
    assert result.value is not None
    return result.value.graph.nodes[-1]


def _object(object_id: str, label: str | None = None) -> ChemicalObject:
    return ChemicalObject(
        id=object_id,
        label=label or object_id,
        formula="H2",
        charge=0,
        spin_multiplicity=1,
        method="B3LYP",
        energies={"electronic": EnergyValue(-1.0, "hartree")},
        source_file_id="raw-a",
        provenance=Provenance("raw-a", "fake-parser", "0.1.0", "2026-05-05T00:00:00Z"),
    )


def _create_project(tmp: str) -> Path:
    root = Path(tmp) / "demo.rxnflow"
    result = ProjectStore().create_project("demo", root)
    assert result.ok
    return root


def _write_xyz(tmp: str, name: str, label: str, energy: float) -> Path:
    source = Path(tmp) / name
    source.write_text(
        f"3\n{label} Energy = {energy} Hartree\nO 0 0 0\nH 0 0 0.96\nH 0.92 0 0\n",
        encoding="utf-8",
    )
    return source


if __name__ == "__main__":
    unittest.main()
