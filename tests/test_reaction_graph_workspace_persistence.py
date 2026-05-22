from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from rxnflow.content_store import (
    LocalProjectStorageBackend,
    ProjectContentSnapshot,
    ProjectContentStore,
    REACTION_GRAPHS_PATH,
    WORKSPACES_PATH,
)
from rxnflow.graph_workspace_codec import (
    REACTION_GRAPHS_SCHEMA_VERSION,
    WORKSPACES_SCHEMA_VERSION,
    reaction_graphs_section_from_dict,
    reaction_graphs_section_to_dict,
    workspaces_section_from_dict,
    workspaces_section_to_dict,
)
from rxnflow.graph import ReactionGraphService
from rxnflow.models import (
    ChemicalObject,
    EnergyValue,
    GraphPatch,
    ReactionEdge,
    ReactionGraph,
    ReactionNode,
    ReactionNodeCompositionTerm,
    ReactionPath,
)
from rxnflow.project import ProjectStore
from rxnflow.workspace import (
    CanvasViewport,
    GraphEditorWorkspaceService,
    NetworkPreview,
    NodePlacement,
    WorkspaceSelection,
    WorkspaceSnapshot,
)


class ReactionGraphWorkspacePersistenceTest(unittest.TestCase):
    def test_reaction_graph_section_round_trips_real_graph_state(self) -> None:
        graph = _graph()

        encoded = reaction_graphs_section_to_dict("project-a", (graph,), object_ids=_object_ids())

        self.assertTrue(encoded.ok, encoded.error)
        section = encoded.value
        assert section is not None
        self.assertEqual(section["schema_version"], REACTION_GRAPHS_SCHEMA_VERSION)
        self.assertEqual(section["project_id"], "project-a")
        self.assertEqual(section["graphs"][0]["nodes"][0]["position"], [12.5, -4.0])
        self.assertEqual(section["graphs"][0]["nodes"][0]["chemical_object_ids"], ["object-a"])
        self.assertEqual(
            section["graphs"][0]["nodes"][0]["composition"],
            [
                {
                    "object_id": "object-a",
                    "coefficient": 1.0,
                    "role": None,
                    "label": None,
                    "metadata": {},
                }
            ],
        )
        self.assertEqual(section["graphs"][0]["edges"][0]["from_node"], "node-a")
        self.assertEqual(section["graphs"][0]["paths"][0]["node_ids"], ["node-a", "node-b"])

        decoded = reaction_graphs_section_from_dict("project-a", section, object_ids=_object_ids())

        self.assertTrue(decoded.ok, decoded.error)
        self.assertEqual(decoded.value, (graph,))

    def test_reaction_graph_section_loads_legacy_nodes_without_composition(self) -> None:
        section = reaction_graphs_section_to_dict("project-a", (_graph(),), object_ids=_object_ids()).value
        assert section is not None
        del section["graphs"][0]["nodes"][0]["composition"]

        decoded = reaction_graphs_section_from_dict("project-a", section, object_ids=_object_ids())

        self.assertTrue(decoded.ok, decoded.error)
        node = decoded.value[0].nodes[0]  # type: ignore[index]
        self.assertEqual(node.chemical_object_ids, ("object-a",))
        self.assertEqual(node.composition, (ReactionNodeCompositionTerm("object-a"),))

    def test_reaction_graph_section_round_trips_explicit_composition(self) -> None:
        graph = _graph_with_patch(
            _graph(),
            nodes=(
                ReactionNode(
                    id="node-combo",
                    kind="species",
                    label="A + 2B",
                    composition=(
                        ReactionNodeCompositionTerm("object-a", 1.0),
                        ReactionNodeCompositionTerm("object-b", 2.0, role="reagent", label="B"),
                    ),
                    position=(1.0, 2.0),
                ),
            ),
            edges=(),
            paths=(),
        )

        encoded = reaction_graphs_section_to_dict("project-a", (graph,), object_ids=_object_ids())
        self.assertTrue(encoded.ok, encoded.error)
        stored = encoded.value["graphs"][0]["nodes"][0]  # type: ignore[index]
        self.assertEqual(stored["chemical_object_ids"], ["object-a", "object-b"])
        self.assertEqual(stored["composition"][1]["coefficient"], 2.0)
        self.assertEqual(stored["composition"][1]["role"], "reagent")

        decoded = reaction_graphs_section_from_dict("project-a", encoded.value, object_ids=_object_ids())  # type: ignore[arg-type]
        self.assertTrue(decoded.ok, decoded.error)
        self.assertEqual(decoded.value, (graph,))

    def test_reaction_graph_section_validation_errors_are_structured(self) -> None:
        valid_section = reaction_graphs_section_to_dict("project-a", (_graph(),), object_ids=_object_ids()).value
        assert valid_section is not None
        valid_graph = valid_section["graphs"][0]

        cases = (
            (
                {**valid_section, "schema_version": "reaction-graphs-v2"},
                "invalid_input",
                "reaction_graphs",
            ),
            (
                {**valid_section, "project_id": "project-b"},
                "invalid_input",
                "reaction_graphs",
            ),
            (
                {**valid_section, "graphs": valid_section["graphs"][0]},
                "invalid_input",
                "graphs",
            ),
            (
                {**valid_section, "graphs": [valid_graph, valid_graph]},
                "invalid_input",
                "graph-main",
            ),
            (
                _section_with_graph_patch(valid_graph, {"project_id": "project-b"}),
                "invalid_input",
                "graphs[0].project_id",
            ),
            (
                _section_with_nodes_patch(valid_graph, [{"id": "", "kind": "annotation", "label": "note"}]),
                "invalid_input",
                "graphs[0].nodes[0].id",
            ),
            (
                _section_with_nodes_patch(
                    valid_graph,
                    [
                        {
                            **valid_graph["nodes"][0],
                            "chemical_object_ids": ["object-missing"],
                            "composition": [{"object_id": "object-missing", "coefficient": 1.0}],
                        }
                    ],
                ),
                "graph_invalid",
                "object_id",
            ),
            (
                _section_with_nodes_patch(
                    valid_graph,
                    [{**valid_graph["nodes"][0], "chemical_object_ids": [], "composition": []}],
                ),
                "graph_invalid",
                "node-a",
            ),
            (
                _section_with_nodes_patch(
                    valid_graph,
                    [
                        {
                            **valid_graph["nodes"][0],
                            "composition": [{"object_id": "object-a", "coefficient": 0}],
                        }
                    ],
                ),
                "invalid_input",
                "graphs[0].nodes[0].composition",
            ),
            (
                _section_with_nodes_patch(
                    valid_graph,
                    [
                        valid_graph["nodes"][0],
                        {**valid_graph["nodes"][1], "id": "node-a"},
                    ],
                ),
                "invalid_input",
                "node-a",
            ),
            (
                _section_with_graph_patch(
                    valid_graph,
                    {"edges": [{**valid_graph["edges"][0], "from_node": "node-missing"}]},
                ),
                "graph_invalid",
                "edge-a-b",
            ),
            (
                _section_with_graph_patch(
                    valid_graph,
                    {"edges": [valid_graph["edges"][0], valid_graph["edges"][0]]},
                ),
                "invalid_input",
                "edge-a-b",
            ),
            (
                _section_with_graph_patch(
                    valid_graph,
                    {"paths": [{**valid_graph["paths"][0], "node_ids": []}]},
                ),
                "graph_invalid",
                "path-main",
            ),
            (
                _section_with_graph_patch(
                    valid_graph,
                    {"paths": [{**valid_graph["paths"][0], "node_ids": ["node-missing"]}]},
                ),
                "graph_invalid",
                "node-missing",
            ),
            (
                _section_with_graph_patch(
                    valid_graph,
                    {"paths": [valid_graph["paths"][0], valid_graph["paths"][0]]},
                ),
                "invalid_input",
                "path-main",
            ),
            (
                _section_with_nodes_patch(
                    valid_graph,
                    [{**valid_graph["nodes"][0], "position": ["bad", 0]}],
                ),
                "invalid_input",
                "graphs[0].nodes[0].position",
            ),
        )

        for section, code, target in cases:
            with self.subTest(target=target):
                result = reaction_graphs_section_from_dict("project-a", section, object_ids=_object_ids())
                self.assertFalse(result.ok)
                self.assertEqual(result.error.code, code)  # type: ignore[union-attr]
                self.assertEqual(result.error.target, target)  # type: ignore[union-attr]

    def test_workspace_section_round_trips_only_workspace_state_and_derives_snapshot(self) -> None:
        graph = _graph()
        workspace = _workspace(graph)

        encoded = workspaces_section_to_dict("project-a", (workspace,), graphs=(graph,))

        self.assertTrue(encoded.ok, encoded.error)
        section = encoded.value
        assert section is not None
        stored = section["workspaces"][0]
        self.assertEqual(section["schema_version"], WORKSPACES_SCHEMA_VERSION)
        self.assertEqual(stored["workspace_id"], "workspace-main")
        self.assertEqual(stored["project_id"], "project-a")
        self.assertEqual(stored["graph_id"], "graph-main")
        self.assertEqual(stored["selection"]["node_ids"], ["node-a"])
        self.assertEqual(stored["viewport"]["zoom"], 1.25)
        self.assertEqual(stored["active_path_id"], "path-main")
        self.assertEqual(stored["updated_at"], "2026-05-06T00:00:00Z")
        self.assertNotIn("palette", stored)
        self.assertNotIn("preview", stored)
        self.assertNotIn("nodes", stored)

        decoded = workspaces_section_from_dict("project-a", section, (graph,), _objects())

        self.assertTrue(decoded.ok, decoded.error)
        restored = decoded.value[0]  # type: ignore[index]
        self.assertEqual(restored.workspace_id, "workspace-main")
        self.assertEqual(restored.graph, graph)
        self.assertEqual(restored.selection, workspace.selection)
        self.assertEqual(restored.viewport, workspace.viewport)
        self.assertEqual(restored.active_path_id, "path-main")
        self.assertEqual(restored.updated_at, "2026-05-06T00:00:00Z")
        self.assertEqual([item.object_id for item in restored.palette], ["object-a", "object-b"])
        self.assertEqual(restored.preview.graph_id, "graph-main")
        self.assertEqual(restored.preview.nodes, graph.nodes)

    def test_workspace_section_validation_errors_are_structured(self) -> None:
        graph = _graph()
        workspace = _workspace(graph)
        valid_section = workspaces_section_to_dict("project-a", (workspace,), graphs=(graph,)).value
        assert valid_section is not None
        valid_workspace = valid_section["workspaces"][0]

        cases = (
            (
                {**valid_section, "schema_version": "workspaces-v2"},
                (graph,),
                "invalid_input",
                "workspaces",
            ),
            (
                {**valid_section, "project_id": "project-b"},
                (graph,),
                "invalid_input",
                "workspaces",
            ),
            (
                {**valid_section, "workspaces": valid_section["workspaces"][0]},
                (graph,),
                "invalid_input",
                "workspaces",
            ),
            (
                {**valid_section, "workspaces": [valid_workspace, valid_workspace]},
                (graph,),
                "invalid_input",
                "workspace-main",
            ),
            (
                valid_section,
                (),
                "invalid_input",
                "workspaces",
            ),
            (
                _workspace_section_with_patch(valid_workspace, {"workspace_id": ""}),
                (graph,),
                "invalid_input",
                "workspaces[0].workspace_id",
            ),
            (
                _workspace_section_with_patch(valid_workspace, {"project_id": "project-b"}),
                (graph,),
                "invalid_input",
                "workspaces[0].project_id",
            ),
            (
                _workspace_section_with_patch(
                    valid_workspace,
                    {"selection": {"node_ids": ["node-missing"], "edge_ids": [], "path_ids": []}},
                ),
                (graph,),
                "invalid_input",
                "node-missing",
            ),
            (
                _workspace_section_with_patch(
                    valid_workspace,
                    {"selection": {"node_ids": [], "edge_ids": ["edge-missing"], "path_ids": []}},
                ),
                (graph,),
                "invalid_input",
                "edge-missing",
            ),
            (
                _workspace_section_with_patch(
                    valid_workspace,
                    {"selection": {"node_ids": [], "edge_ids": [], "path_ids": ["path-missing"]}},
                ),
                (graph,),
                "invalid_input",
                "path-missing",
            ),
            (
                _workspace_section_with_patch(valid_workspace, {"active_path_id": "path-missing"}),
                (graph,),
                "invalid_input",
                "path-missing",
            ),
            (
                _workspace_section_with_patch(valid_workspace, {"viewport": {"x": 0, "y": 0, "zoom": 0}}),
                (graph,),
                "invalid_input",
                "workspaces[0].viewport.zoom",
            ),
            (
                _workspace_section_with_patch(valid_workspace, {"viewport": {"x": "bad", "y": 0, "zoom": 1}}),
                (graph,),
                "invalid_input",
                "workspaces[0].viewport",
            ),
        )

        for section, graphs, code, target in cases:
            with self.subTest(target=target):
                result = workspaces_section_from_dict("project-a", section, graphs, _objects())
                self.assertFalse(result.ok)
                self.assertEqual(result.error.code, code)  # type: ignore[union-attr]
                self.assertEqual(result.error.target, target)  # type: ignore[union-attr]

    def test_reaction_graph_service_restores_graphs_and_continues_patch_workflow(self) -> None:
        service = ReactionGraphService()
        graph = _graph()

        self.assertEqual(service.list_graphs("project-a").value, ())
        restored = service.restore_graphs("project-a", (graph,), object_ids=_object_ids())

        self.assertTrue(restored.ok, restored.error)
        self.assertEqual(restored.value, (graph,))
        self.assertEqual(service.list_graphs("project-a").value, (graph,))
        self.assertEqual(service.list_paths("project-a", "graph-main").value, graph.paths)

        repeated = service.restore_graphs("project-a", (graph,), object_ids=_object_ids())
        self.assertTrue(repeated.ok, repeated.error)
        self.assertEqual(repeated.value, (graph,))

        patched = service.apply_patch(
            "project-a",
            "graph-main",
            (GraphPatch("add_node", node=ReactionNode(id="node-extra", kind="annotation", label="extra")),),
            object_ids=_object_ids(),
        )

        self.assertTrue(patched.ok, patched.error)
        self.assertEqual([node.id for node in patched.value.nodes][-1], "node-extra")  # type: ignore[union-attr]

    def test_reaction_graph_service_restore_errors_are_structured(self) -> None:
        service = ReactionGraphService()
        graph = _graph()

        cases = (
            ((graph, graph), "invalid_input", "graph-main"),
            ((_graph_with_patch(graph, project_id="project-b"),), "invalid_input", "project_id"),
            ((_graph_with_patch(graph, nodes=(graph.nodes[0], graph.nodes[0])),), "invalid_input", "node-a"),
            (
                (_graph_with_patch(graph, nodes=(ReactionNode(id="node-bad", kind="species", label="bad"),)),),
                "graph_invalid",
                "node-bad",
            ),
            (
                (_graph_with_patch(graph, edges=(ReactionEdge(id="edge-bad", from_node="missing", to_node="node-a"),)),),
                "graph_invalid",
                "edge-bad",
            ),
            (
                (_graph_with_patch(graph, paths=(ReactionPath(id="path-bad", label="bad", node_ids=()),)),),
                "graph_invalid",
                "path-bad",
            ),
        )

        for graphs, code, target in cases:
            with self.subTest(target=target):
                result = service.restore_graphs("project-a", graphs, object_ids=_object_ids(), replace=True)
                self.assertFalse(result.ok)
                self.assertEqual(result.error.code, code)  # type: ignore[union-attr]
                self.assertEqual(result.error.target, target)  # type: ignore[union-attr]

    def test_workspace_service_restores_workspaces_and_continues_edit_workflow(self) -> None:
        graph = _graph()
        graph_service = ReactionGraphService()
        graph_service.restore_graphs("project-a", (graph,), object_ids=_object_ids())
        workspace_service = GraphEditorWorkspaceService(graph_service)
        workspace = _workspace(graph)

        self.assertEqual(workspace_service.list_workspaces("project-a").value, ())
        restored = workspace_service.restore_workspaces("project-a", (workspace,), objects=_objects())

        self.assertTrue(restored.ok, restored.error)
        self.assertEqual(len(restored.value), 1)  # type: ignore[arg-type]
        snapshot = workspace_service.snapshot("project-a", "workspace-main")
        self.assertTrue(snapshot.ok, snapshot.error)
        self.assertEqual(snapshot.value.selection, workspace.selection)  # type: ignore[union-attr]
        self.assertEqual(snapshot.value.viewport, workspace.viewport)  # type: ignore[union-attr]
        self.assertEqual(snapshot.value.active_path_id, "path-main")  # type: ignore[union-attr]
        self.assertEqual(snapshot.value.updated_at, "2026-05-06T00:00:00Z")  # type: ignore[union-attr]
        self.assertEqual([item.object_id for item in snapshot.value.palette], ["object-a", "object-b"])  # type: ignore[union-attr]
        self.assertEqual(snapshot.value.preview.graph_id, "graph-main")  # type: ignore[union-attr]

        repeated = workspace_service.restore_workspaces("project-a", (workspace,), objects=_objects())
        self.assertTrue(repeated.ok, repeated.error)
        self.assertEqual(len(repeated.value), 1)  # type: ignore[arg-type]

        selected = workspace_service.select(
            "project-a",
            "workspace-main",
            WorkspaceSelection(node_ids=("node-b",)),
        )
        moved = workspace_service.set_viewport(
            "project-a",
            "workspace-main",
            CanvasViewport(x=1.0, y=2.0, zoom=2.0),
        )
        added = workspace_service.add_node(
            "project-a",
            "workspace-main",
            NodePlacement(kind="annotation", label="extra", position=(1.0, 1.0)),
        )

        self.assertTrue(selected.ok, selected.error)
        self.assertTrue(moved.ok, moved.error)
        self.assertTrue(added.ok, added.error)
        self.assertEqual(moved.value.viewport.zoom, 2.0)  # type: ignore[union-attr]
        self.assertIn("extra", [node.label for node in added.value.graph.nodes])  # type: ignore[union-attr]

    def test_workspace_service_restore_errors_are_structured(self) -> None:
        graph = _graph()
        workspace = _workspace(graph)
        graph_service = ReactionGraphService()
        graph_service.restore_graphs("project-a", (graph,), object_ids=_object_ids())

        cases = (
            ((workspace, workspace), "invalid_input", "workspace-main"),
            ((_workspace_with_patch(workspace, project_id="project-b"),), "invalid_input", "project_id"),
            (
                (_workspace_with_patch(workspace, selection=WorkspaceSelection(node_ids=("node-missing",))),),
                "invalid_input",
                "node-missing",
            ),
            (
                (_workspace_with_patch(workspace, selection=WorkspaceSelection(edge_ids=("edge-missing",))),),
                "invalid_input",
                "edge-missing",
            ),
            (
                (_workspace_with_patch(workspace, selection=WorkspaceSelection(path_ids=("path-missing",))),),
                "invalid_input",
                "path-missing",
            ),
            ((_workspace_with_patch(workspace, active_path_id="path-missing"),), "invalid_input", "path-missing"),
            (
                (_workspace_with_patch(workspace, viewport=CanvasViewport(x=0, y=0, zoom=0)),),
                "invalid_input",
                "viewport.zoom",
            ),
        )

        for workspaces, code, target in cases:
            with self.subTest(target=target):
                service = GraphEditorWorkspaceService(graph_service)
                result = service.restore_workspaces("project-a", workspaces, objects=_objects(), replace=True)
                self.assertFalse(result.ok)
                self.assertEqual(result.error.code, code)  # type: ignore[union-attr]
                self.assertEqual(result.error.target, target)  # type: ignore[union-attr]

        missing_graph_service = GraphEditorWorkspaceService(ReactionGraphService())
        missing_graph = missing_graph_service.restore_workspaces("project-a", (workspace,), objects=_objects())
        self.assertFalse(missing_graph.ok)
        self.assertEqual(missing_graph.error.code, "invalid_input")  # type: ignore[union-attr]
        self.assertEqual(missing_graph.error.target, "graph-main")  # type: ignore[union-attr]

    def test_project_content_store_uses_graph_workspace_codecs(self) -> None:
        graph = _graph()
        workspace = _workspace(graph)
        snapshot = ProjectContentSnapshot(
            project_id="project-a",
            chemical_objects=_objects(),
            reaction_graphs=(graph,),
            workspaces=(workspace,),
        )

        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            created = ProjectStore().create_project("demo", root)
            self.assertTrue(created.ok, created.error)
            manifest_before = (root / ".rxnflow" / "manifest.json").read_text(encoding="utf-8")

            store = ProjectContentStore(LocalProjectStorageBackend())
            saved = store.save_snapshot(root, snapshot)

            self.assertTrue(saved.ok, saved.error)
            graph_section = json.loads((root / REACTION_GRAPHS_PATH).read_text(encoding="utf-8"))
            workspace_section = json.loads((root / WORKSPACES_PATH).read_text(encoding="utf-8"))
            stored_workspace = workspace_section["workspaces"][0]
            self.assertEqual(graph_section["graphs"][0]["nodes"][0]["chemical_object_ids"], ["object-a"])
            self.assertEqual(graph_section["graphs"][0]["edges"][0]["from_node"], "node-a")
            self.assertEqual(graph_section["graphs"][0]["paths"][0]["node_ids"], ["node-a", "node-b"])
            self.assertEqual(stored_workspace["selection"]["edge_ids"], ["edge-a-b"])
            self.assertEqual(stored_workspace["viewport"]["zoom"], 1.25)
            self.assertEqual(stored_workspace["active_path_id"], "path-main")
            self.assertNotIn("palette", stored_workspace)
            self.assertNotIn("preview", stored_workspace)
            self.assertNotIn("nodes", stored_workspace)

            loaded = store.load_snapshot(root)

            self.assertTrue(loaded.ok, loaded.error)
            restored = loaded.value
            assert restored is not None
            self.assertEqual(restored.reaction_graphs, (graph,))
            self.assertEqual(restored.workspaces[0].selection, workspace.selection)
            self.assertEqual(restored.workspaces[0].viewport, workspace.viewport)
            self.assertEqual(restored.workspaces[0].updated_at, "2026-05-06T00:00:00Z")
            self.assertEqual([item.object_id for item in restored.workspaces[0].palette], ["object-a", "object-b"])
            self.assertEqual(restored.workspaces[0].preview.graph_id, "graph-main")
            self.assertEqual((root / ".rxnflow" / "manifest.json").read_text(encoding="utf-8"), manifest_before)
            self.assertEqual(ProjectStore().load_project(root).value.resources, ())  # type: ignore[union-attr]

    def test_scope_guard_does_not_add_platform_or_energy_work(self) -> None:
        source = "\n".join(
            (
                Path("rxnflow/content_store.py").read_text(encoding="utf-8"),
                Path("rxnflow/graph_workspace_codec.py").read_text(encoding="utf-8"),
            )
        )

        for forbidden in (
            "ParserRegistry",
            "ImportRegistryWorkflow.confirm_import",
            "EnergyProfileEngine",
            "ReportExportService",
            "GraphPatch",
            "CRDT",
            "undo",
            "redo",
            "IndexedDB",
            "OPFS",
            "Vercel Blob",
            "Supabase",
            "argparse",
        ):
            self.assertNotIn(forbidden, source)


def _object_ids() -> frozenset[str]:
    return frozenset(obj.id for obj in _objects())


def _objects() -> tuple[ChemicalObject, ...]:
    return (
        ChemicalObject(
            id="object-a",
            label="A",
            formula="H2",
            source_file_id="source-a",
            energies={"electronic": EnergyValue(-1.0, "hartree")},
        ),
        ChemicalObject(
            id="object-b",
            label="B",
            formula="H2",
            source_file_id="source-b",
            energies={"electronic": EnergyValue(-0.9, "hartree")},
        ),
    )


def _graph() -> ReactionGraph:
    return ReactionGraph(
        id="graph-main",
        project_id="project-a",
        nodes=(
            ReactionNode(
                id="node-a",
                kind="species",
                label="A",
                chemical_object_ids=("object-a",),
                position=(12.5, -4.0),
                metadata={"role": "reactant"},
            ),
            ReactionNode(
                id="node-b",
                kind="transition_state",
                label="B",
                chemical_object_ids=("object-b",),
                position=(25.0, 10.0),
            ),
            ReactionNode(id="node-note", kind="annotation", label="note"),
        ),
        edges=(
            ReactionEdge(
                id="edge-a-b",
                from_node="node-a",
                to_node="node-b",
                label="step",
                metadata={"order": 1},
            ),
        ),
        paths=(ReactionPath(id="path-main", label="main", node_ids=("node-a", "node-b")),),
    )


def _workspace(graph: ReactionGraph) -> WorkspaceSnapshot:
    return WorkspaceSnapshot(
        workspace_id="workspace-main",
        project_id="project-a",
        graph=graph,
        palette=(),
        selection=WorkspaceSelection(node_ids=("node-a",), edge_ids=("edge-a-b",), path_ids=("path-main",)),
        viewport=CanvasViewport(x=5.0, y=-3.0, zoom=1.25),
        active_path_id="path-main",
        preview=NetworkPreview(
            graph_id=graph.id,
            active_path_id="path-main",
            nodes=graph.nodes,
            edges=graph.edges,
            paths=graph.paths,
        ),
        updated_at="2026-05-06T00:00:00Z",
    )


def _graph_with_patch(
    graph: ReactionGraph,
    *,
    project_id: str | None = None,
    nodes: tuple[ReactionNode, ...] | None = None,
    edges: tuple[ReactionEdge, ...] | None = None,
    paths: tuple[ReactionPath, ...] | None = None,
) -> ReactionGraph:
    return ReactionGraph(
        id=graph.id,
        project_id=project_id or graph.project_id,
        nodes=nodes if nodes is not None else graph.nodes,
        edges=edges if edges is not None else graph.edges,
        paths=paths if paths is not None else graph.paths,
    )


def _workspace_with_patch(
    workspace: WorkspaceSnapshot,
    *,
    project_id: str | None = None,
    selection: WorkspaceSelection | None = None,
    viewport: CanvasViewport | None = None,
    active_path_id: str | None = None,
) -> WorkspaceSnapshot:
    return WorkspaceSnapshot(
        workspace_id=workspace.workspace_id,
        project_id=project_id or workspace.project_id,
        graph=workspace.graph,
        palette=workspace.palette,
        selection=selection if selection is not None else workspace.selection,
        viewport=viewport if viewport is not None else workspace.viewport,
        active_path_id=active_path_id if active_path_id is not None else workspace.active_path_id,
        preview=workspace.preview,
        updated_at=workspace.updated_at,
    )


def _section_with_graph_patch(graph: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    return {
        "schema_version": REACTION_GRAPHS_SCHEMA_VERSION,
        "project_id": "project-a",
        "graphs": [{**graph, **patch}],
    }


def _section_with_nodes_patch(graph: dict[str, object], nodes: list[dict[str, object]]) -> dict[str, object]:
    return _section_with_graph_patch(graph, {"nodes": nodes})


def _workspace_section_with_patch(workspace: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    return {
        "schema_version": WORKSPACES_SCHEMA_VERSION,
        "project_id": "project-a",
        "workspaces": [{**workspace, **patch}],
    }
