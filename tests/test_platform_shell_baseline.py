from __future__ import annotations

import base64
from dataclasses import replace
from hashlib import sha256
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from rxnflow.content_store import (
    CHEMICAL_OBJECTS_PATH,
    PROJECT_CONTENT_INDEX_PATH,
    PROJECT_MANIFEST_PATH,
    ProjectContentSnapshot,
    ProjectContentStore,
    project_content_snapshot_from_fixture,
)
from rxnflow.export import ExportArtifactRecord
from rxnflow.fixture import run_core_fixture_vertical_slice
from rxnflow.graph_workspace_codec import workspace_snapshot_from_graph
from rxnflow.platform import (
    AppKernel,
    PlatformSession,
    PlatformShellService,
    ShellArtifact,
    ShellCommand,
    ShellResponse,
    handle_platform_payload,
)
from rxnflow.models import ChemicalObject, EnergyValue


def _content_files_payload(project_path: Path) -> list[dict[str, object]]:
    paths = [PROJECT_MANIFEST_PATH]
    state_dir = project_path / ".rxnflow" / "state"
    paths.extend(
        path.relative_to(project_path).as_posix()
        for path in sorted(state_dir.glob("*.json"))
    )
    payload: list[dict[str, object]] = []
    for path in paths:
        data = (project_path / path).read_bytes()
        payload.append(
            {
                "path": path,
                "bytes_base64": base64.b64encode(data).decode("ascii"),
                "checksum": f"sha256:{sha256(data).hexdigest()}",
            }
        )
    return payload


class PlatformShellBaselineTest(unittest.TestCase):
    def test_shell_dto_and_unknown_command_are_json_safe(self) -> None:
        session = PlatformSession(
            id="session-a",
            project_path="/tmp/rxnflow",
            project_id="project-a",
            workspace_id="workspace-a",
            graph_id="graph-a",
            profile_id="profile-a",
            object_ids=("object-a",),
            artifact_ids=("artifact-a",),
        )
        artifact = ShellArtifact("artifact-a", "png", path="/tmp/a.png", metadata={"source": session})
        response = ShellResponse(
            ok=True,
            data={"command": "fixture.run", "session": session},
            warnings=({"code": "note", "message": "ok", "target": None},),
            artifacts=(artifact,),
        )

        encoded = json.dumps(response.to_dict(), sort_keys=True)
        self.assertIn("session-a", encoded)
        self.assertIn("artifact-a", encoded)

        service = PlatformShellService()
        empty = service.run(ShellCommand(""))
        self.assertFalse(empty.ok)
        self.assertEqual(empty.error["code"], "invalid_input")  # type: ignore[index]
        self.assertEqual(empty.error["target"], "command")  # type: ignore[index]
        json.dumps(empty.to_dict())

        unknown = service.run(ShellCommand("missing.command"))
        self.assertFalse(unknown.ok)
        self.assertEqual(unknown.error["code"], "invalid_input")  # type: ignore[index]
        self.assertEqual(unknown.error["target"], "command")  # type: ignore[index]
        json.dumps(unknown.to_dict())

    def test_app_kernel_runs_fixture_command_with_session_summary(self) -> None:
        kernel = AppKernel()
        session = kernel.create_session()
        self.assertEqual(session.id, "session-1")

        response = PlatformShellService(kernel).run(ShellCommand("fixture.run"))

        self.assertTrue(response.ok, response.error)
        payload = response.to_dict()
        json.dumps(payload)
        self.assertEqual(payload["data"]["command"], "fixture.run")
        self.assertEqual(payload["data"]["project"]["id"], "project-fixture-minimal-reaction")
        self.assertEqual(payload["data"]["object_count"], 2)
        self.assertEqual(payload["data"]["graph"]["id"], "graph-a-b")
        self.assertEqual(payload["data"]["profile"]["id"], "profile-a-b-electronic")
        self.assertEqual(payload["data"]["profile"]["point_count"], 2)

        state = kernel.get_session_state(payload["data"]["session_id"])
        self.assertIsNotNone(state)
        assert state is not None
        self.assertEqual(state.session.profile_id, "profile-a-b-electronic")
        self.assertEqual(state.session.object_ids, ("object-a", "object-b"))
        self.assertEqual([graph.id for graph in state.reaction_graphs], ["graph-a-b"])
        self.assertEqual([profile.id for profile in state.energy_profiles], ["profile-a-b-electronic"])

        snapshot = PlatformShellService(kernel).run(
            ShellCommand("workbench.snapshot", {"session_id": payload["data"]["session_id"]})
        )
        self.assertTrue(snapshot.ok, snapshot.error)
        snapshot_payload = snapshot.to_dict()
        json.dumps(snapshot_payload)
        self.assertEqual(snapshot_payload["data"]["command"], "workbench.snapshot")
        self.assertEqual(snapshot_payload["data"]["project_id"], "project-fixture-minimal-reaction")
        self.assertEqual(snapshot_payload["data"]["counts"]["objects"], 2)
        self.assertEqual(snapshot_payload["data"]["counts"]["graphs"], 1)
        self.assertEqual(snapshot_payload["data"]["counts"]["profiles"], 1)
        self.assertEqual(snapshot_payload["data"]["active"]["graph_id"], "graph-a-b")
        self.assertEqual(snapshot_payload["data"]["objects"][0]["id"], "object-a")
        self.assertEqual(snapshot_payload["data"]["objects"][0]["energy_channels"][0]["source"], "energies")
        self.assertEqual(snapshot_payload["data"]["profile"]["id"], "profile-a-b-electronic")
        self.assertEqual(snapshot_payload["data"]["profile"]["energy_key"], "electronic")
        self.assertEqual(snapshot_payload["data"]["profile"]["energy_source"], "auto")
        expression = snapshot_payload["data"]["profile"]["points"][0]["expression"]
        self.assertEqual(expression["node_id"], "node-a")
        self.assertEqual(expression["terms"][0]["object_id"], "object-a")
        self.assertEqual(expression["terms"][0]["energy_source"], "energies")
        self.assertEqual(expression["terms"][0]["raw_energy"]["unit"], "hartree")

    def test_project_commands_and_fixture_export_artifacts(self) -> None:
        service = PlatformShellService(AppKernel())

        with tempfile.TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "demo"
            create = service.run(
                ShellCommand(
                    "project.create",
                    {"name": "demo", "location": str(project_path)},
                )
            )
            self.assertTrue(create.ok, create.error)
            self.assertTrue((project_path / ".rxnflow" / "manifest.json").is_file())
            create_payload = create.to_dict()
            json.dumps(create_payload)
            self.assertEqual(create_payload["data"]["project"]["id"], "project-demo")
            self.assertEqual(create_payload["data"]["project"]["name"], "demo")
            self.assertEqual(create_payload["data"]["project"]["schema_version"], "project-v1")

            load = service.run(ShellCommand("project.load", {"project_path": str(project_path)}))
            self.assertTrue(load.ok, load.error)
            self.assertEqual(load.to_dict()["data"]["project"]["resource_count"], 0)

            opened = service.run(
                ShellCommand(
                    "project.open",
                    {"project_path": str(project_path), "load_content": False},
                )
            )
            self.assertTrue(opened.ok, opened.error)
            opened_payload = opened.to_dict()
            self.assertEqual(opened_payload["data"]["command"], "project.open")
            self.assertEqual(opened_payload["data"]["project"]["id"], "project-demo")
            self.assertFalse(opened_payload["data"]["load_content"])
            self.assertEqual(opened_payload["data"]["object_count"], 0)
            self.assertEqual(opened_payload["data"]["graph_count"], 0)
            self.assertEqual(opened_payload["data"]["workspace_count"], 0)
            self.assertEqual(opened_payload["data"]["profile_count"], 0)
            self.assertEqual(opened_payload["data"]["artifact_count"], 0)

        with tempfile.TemporaryDirectory() as tmp:
            export_dir = Path(tmp)
            fixture = service.run(
                ShellCommand(
                    "fixture.run",
                    {
                        "export_formats": ("png", "xlsx", "csv", "svg"),
                        "destination_dir": str(export_dir),
                        "basename": "fixture",
                    },
                )
            )
            self.assertTrue(fixture.ok, fixture.error)
            payload = fixture.to_dict()
            json.dumps(payload)
            self.assertEqual([artifact["format"] for artifact in payload["artifacts"]], ["png", "xlsx", "csv", "svg"])
            self.assertTrue(Path(payload["artifacts"][0]["path"]).is_file())
            self.assertTrue(Path(payload["artifacts"][1]["path"]).is_file())
            self.assertTrue(Path(payload["artifacts"][2]["path"]).is_file())
            self.assertTrue(Path(payload["artifacts"][3]["path"]).is_file())
            self.assertIsNone(payload["artifacts"][0]["bytes_base64"])
            self.assertEqual(payload["artifacts"][0]["metadata"]["profile_id"], "profile-a-b-electronic")
            self.assertEqual(payload["artifacts"][2]["metadata"]["writer_id"], "python-csv-energy-table-v1")
            self.assertEqual(payload["artifacts"][2]["metadata"]["mime_type"], "text/csv")
            self.assertEqual(payload["artifacts"][2]["metadata"]["extension"], "csv")
            self.assertEqual(payload["artifacts"][3]["metadata"]["writer_id"], "python-svg-graph-snapshot-v1")
            self.assertEqual(payload["artifacts"][3]["metadata"]["mime_type"], "image/svg+xml")
            self.assertEqual(payload["artifacts"][3]["metadata"]["extension"], "svg")

            inline = service.run(
                ShellCommand(
                    "fixture.run",
                    {"export_formats": ("csv", "svg"), "include_bytes": True},
                )
            )
            self.assertTrue(inline.ok, inline.error)
            inline_artifacts = inline.to_dict()["artifacts"]
            inline_artifact = inline_artifacts[0]
            self.assertEqual(inline_artifact["format"], "csv")
            self.assertIsNotNone(inline_artifact["bytes_base64"])
            self.assertIn("Structure", base64.b64decode(inline_artifact["bytes_base64"]).decode("utf-8"))
            self.assertEqual(inline_artifact["metadata"]["writer_id"], "python-csv-energy-table-v1")
            self.assertEqual(inline_artifact["metadata"]["mime_type"], "text/csv")
            self.assertEqual(inline_artifact["metadata"]["encoding"], "base64")
            svg_artifact = inline_artifacts[1]
            self.assertEqual(svg_artifact["format"], "svg")
            self.assertIsNotNone(svg_artifact["bytes_base64"])
            self.assertIn("<svg", base64.b64decode(svg_artifact["bytes_base64"]).decode("utf-8"))
            self.assertEqual(svg_artifact["metadata"]["writer_id"], "python-svg-graph-snapshot-v1")
            self.assertEqual(svg_artifact["metadata"]["mime_type"], "image/svg+xml")
            self.assertEqual(svg_artifact["metadata"]["extension"], "svg")
            self.assertEqual(svg_artifact["metadata"]["artifact_kind"], "graph_snapshot")
            self.assertEqual(svg_artifact["metadata"]["encoding"], "base64")

    def test_import_preview_accepts_inline_bytes_source(self) -> None:
        service = PlatformShellService(AppKernel())
        inline_payload = base64.b64encode(
            b"2\nEnergy = -1.5 Hartree\nH 0 0 0\nH 0 0 0.74\n"
        ).decode("ascii")

        with tempfile.TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "inline-demo"
            created = service.run(
                ShellCommand("project.create", {"name": "inline-demo", "location": str(project_path)})
            )
            self.assertTrue(created.ok, created.error)
            preview = service.run(
                ShellCommand(
                    "import.preview",
                    {
                        "session_id": created.to_dict()["data"]["session_id"],
                        "source": {
                            "kind": "inline_bytes",
                            "filename": "h2.xyz",
                            "bytes_base64": inline_payload,
                            "mime_type": "chemical/x-xyz",
                        },
                    },
                )
            )

        self.assertTrue(preview.ok, preview.error)
        item = preview.to_dict()["data"]["batch"]["items"][0]
        self.assertEqual(item["source_path"].split("/")[-1], "h2.xyz")
        self.assertEqual(item["status"], "needs_confirmation")
        self.assertEqual(item["preview"]["parser_id"], "xyz-ase")
        self.assertEqual(item["preview"]["object_count"], 1)
        self.assertEqual(item["preview"]["candidates"][0]["object_index"], 0)
        self.assertEqual(item["preview"]["candidates"][0]["coordinate_preview"]["atom_count"], 2)
        self.assertEqual(item["preview"]["candidates"][0]["display_energy"]["unit"], "hartree")

    def test_import_register_selection_confirms_selected_object_indices(self) -> None:
        service = PlatformShellService(AppKernel())
        inline_payload = base64.b64encode(
            b"2\nFrame 1 energy=-1.5 Hartree\nH 0 0 0\nH 0 0 0.74\n"
            b"2\nFrame 2 energy=-1.4 Hartree\nH 0 0 0\nH 0 0 0.78\n"
        ).decode("ascii")

        with tempfile.TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "selection-demo"
            created = service.run(
                ShellCommand("project.create", {"name": "selection-demo", "location": str(project_path)})
            )
            self.assertTrue(created.ok, created.error)
            session_id = created.to_dict()["data"]["session_id"]
            preview = service.run(
                ShellCommand(
                    "import.preview",
                    {
                        "session_id": session_id,
                        "source": {
                            "kind": "inline_bytes",
                            "filename": "frames.xyz",
                            "bytes_base64": inline_payload,
                            "mime_type": "chemical/x-xyz",
                        },
                    },
                )
            )
            self.assertTrue(preview.ok, preview.error)
            preview_item = preview.to_dict()["data"]["batch"]["items"][0]
            self.assertEqual(preview_item["preview"]["object_count"], 2)
            self.assertEqual(len(preview_item["preview"]["candidates"]), 2)

            invalid = service.run(
                ShellCommand(
                    "import.register_selection",
                    {
                        "session_id": session_id,
                        "batch_id": preview.to_dict()["data"]["batch"]["id"],
                        "item_id": preview_item["id"],
                        "object_indices": [3],
                    },
                )
            )
            self.assertFalse(invalid.ok)
            self.assertEqual(invalid.to_dict()["error"]["target"], "object_indices")

            empty_selection = service.run(
                ShellCommand(
                    "import.register_selection",
                    {
                        "session_id": session_id,
                        "batch_id": preview.to_dict()["data"]["batch"]["id"],
                        "item_id": preview_item["id"],
                        "object_indices": [],
                    },
                )
            )
            self.assertFalse(empty_selection.ok)
            self.assertEqual(empty_selection.to_dict()["error"]["target"], "object_indices")

            unknown_item = service.run(
                ShellCommand(
                    "import.register_selection",
                    {
                        "session_id": session_id,
                        "batch_id": preview.to_dict()["data"]["batch"]["id"],
                        "item_id": "missing-item",
                        "object_indices": [0],
                    },
                )
            )
            self.assertFalse(unknown_item.ok)
            self.assertEqual(unknown_item.to_dict()["error"]["target"], "item_id")

            selected = service.run(
                ShellCommand(
                    "import.register_selection",
                    {
                        "session_id": session_id,
                        "batch_id": preview.to_dict()["data"]["batch"]["id"],
                        "item_id": preview_item["id"],
                        "object_indices": [1],
                    },
                )
            )

        self.assertTrue(selected.ok, selected.error)
        payload = selected.to_dict()["data"]
        self.assertEqual(payload["command"], "import.register_selection")
        self.assertEqual(len(payload["registered_object_ids"]), 1)
        self.assertEqual(payload["objects"][0]["label"], "Frame 2")
        self.assertEqual(payload["objects"][0]["coordinate_preview"]["atom_count"], 2)
        self.assertEqual(payload["objects"][0]["display_energy"]["value"], -1.4)

    def test_workspace_select_command_projects_selection_and_errors(self) -> None:
        service = PlatformShellService(AppKernel())
        fixture = service.run(ShellCommand("fixture.run"))
        self.assertTrue(fixture.ok, fixture.error)
        session_id = fixture.to_dict()["data"]["session_id"]
        opened = service.run(ShellCommand("workspace.open", {"session_id": session_id}))
        self.assertTrue(opened.ok, opened.error)
        first = service.run(
            ShellCommand(
                "workspace.add_node",
                {
                    "session_id": session_id,
                    "kind": "species",
                    "label": "Object A",
                    "chemical_object_ids": ["object-a"],
                },
            )
        )
        self.assertTrue(first.ok, first.error)
        first_id = first.to_dict()["data"]["workspace"]["graph"]["nodes"][0]["id"]
        second = service.run(
            ShellCommand(
                "workspace.add_node",
                {
                    "session_id": session_id,
                    "kind": "species",
                    "label": "Object B",
                    "chemical_object_ids": ["object-b"],
                },
            )
        )
        self.assertTrue(second.ok, second.error)
        second_id = second.to_dict()["data"]["workspace"]["graph"]["nodes"][1]["id"]
        connected = service.run(
            ShellCommand(
                "workspace.connect",
                {
                    "session_id": session_id,
                    "from_node_id": first_id,
                    "to_node_id": second_id,
                },
            )
        )
        self.assertTrue(connected.ok, connected.error)
        edge_id = connected.to_dict()["data"]["workspace"]["graph"]["edges"][0]["id"]
        path = service.run(
            ShellCommand(
                "workspace.set_path",
                {
                    "session_id": session_id,
                    "path_id": "path-main",
                    "node_ids": [first_id, second_id],
                },
            )
        )
        self.assertTrue(path.ok, path.error)

        selected = service.run(
            ShellCommand(
                "workspace.select",
                {
                    "session_id": session_id,
                    "selection": {
                        "node_ids": [first_id],
                        "edge_ids": [edge_id],
                        "path_ids": ["path-main"],
                    },
                },
            )
        )
        self.assertTrue(selected.ok, selected.error)
        payload = selected.to_dict()
        json.dumps(payload)
        self.assertEqual(payload["data"]["command"], "workspace.select")
        self.assertEqual(payload["data"]["workspace"]["selection"]["node_ids"], [first_id])
        self.assertEqual(payload["data"]["workspace"]["selection"]["edge_ids"], [edge_id])
        self.assertEqual(payload["data"]["workspace"]["selection"]["path_ids"], ["path-main"])

        cleared = service.run(
            ShellCommand(
                "workspace.select",
                {"session_id": session_id, "selection": {}},
            )
        )
        self.assertTrue(cleared.ok, cleared.error)
        self.assertEqual(cleared.to_dict()["data"]["workspace"]["selection"]["node_ids"], [])

        missing = service.run(
            ShellCommand(
                "workspace.select",
                {"session_id": session_id, "selection": {"node_ids": ["node-missing"]}},
            )
        )
        self.assertFalse(missing.ok)
        self.assertEqual(missing.error["code"], "graph_invalid")  # type: ignore[index]
        self.assertEqual(missing.error["target"], "node_id")  # type: ignore[index]

    def test_import_preview_creates_temporary_project_for_inline_session_without_project_path(self) -> None:
        kernel = AppKernel()
        service = PlatformShellService(kernel)
        inline_payload = base64.b64encode(
            b"2\nEnergy = -1.5 Hartree\nH 0 0 0\nH 0 0 0.74\n"
        ).decode("ascii")
        try:
            fixture = service.run(ShellCommand("fixture.run", {}))
            self.assertTrue(fixture.ok, fixture.error)
            session_id = fixture.to_dict()["data"]["session_id"]

            preview = service.run(
                ShellCommand(
                    "import.preview",
                    {
                        "session_id": session_id,
                        "source": {
                            "kind": "inline_bytes",
                            "filename": "h2.xyz",
                            "bytes_base64": inline_payload,
                        },
                    },
                )
            )
            snapshot = service.run(ShellCommand("workbench.snapshot", {"session_id": session_id}))

            self.assertTrue(preview.ok, preview.error)
            item = preview.to_dict()["data"]["batch"]["items"][0]
            self.assertEqual(item["status"], "needs_confirmation")
            self.assertEqual(item["preview"]["parser_id"], "xyz-ase")
            self.assertTrue(snapshot.ok, snapshot.error)
            self.assertEqual(snapshot.to_dict()["data"]["project"]["id"], "project-web-inline-preview")
            self.assertEqual(snapshot.to_dict()["data"]["counts"]["imports"], 1)
        finally:
            kernel.cleanup()

    def test_import_preview_accepts_multiple_inline_byte_sources(self) -> None:
        service = PlatformShellService(AppKernel())
        water_payload = base64.b64encode(
            b"3\nEnergy = -76.0 Hartree\nO 0 0 0\nH 0 0 0.95\nH 0.9 0 0\n"
        ).decode("ascii")
        h2_payload = base64.b64encode(
            b"2\nEnergy = -1.5 Hartree\nH 0 0 0\nH 0 0 0.74\n"
        ).decode("ascii")

        with tempfile.TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "multi-inline-demo"
            created = service.run(
                ShellCommand("project.create", {"name": "multi-inline-demo", "location": str(project_path)})
            )
            self.assertTrue(created.ok, created.error)
            preview = service.run(
                ShellCommand(
                    "import.preview",
                    {
                        "session_id": created.to_dict()["data"]["session_id"],
                        "sources": [
                            {
                                "kind": "inline_bytes",
                                "filename": "water.xyz",
                                "bytes_base64": water_payload,
                            },
                            {
                                "kind": "inline_bytes",
                                "filename": "h2.xyz",
                                "bytes_base64": h2_payload,
                            },
                        ],
                    },
                )
            )

        self.assertTrue(preview.ok, preview.error)
        items = preview.to_dict()["data"]["batch"]["items"]
        self.assertEqual(len(items), 2)
        self.assertEqual([item["preview"]["parser_id"] for item in items], ["xyz-ase", "xyz-ase"])

    def test_import_preview_rejects_inline_payload_errors(self) -> None:
        service = PlatformShellService(AppKernel())

        with tempfile.TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "inline-errors"
            created = service.run(
                ShellCommand("project.create", {"name": "inline-errors", "location": str(project_path)})
            )
            self.assertTrue(created.ok, created.error)
            session_id = created.to_dict()["data"]["session_id"]

            too_large = service.run(
                ShellCommand(
                    "import.preview",
                    {
                        "session_id": session_id,
                        "source": {
                            "kind": "inline_bytes",
                            "filename": "large.xyz",
                            "bytes_base64": base64.b64encode(b"x" * (1024 * 1024 + 1)).decode("ascii"),
                        },
                    },
                )
            )
            invalid_base64 = service.run(
                ShellCommand(
                    "import.preview",
                    {
                        "session_id": session_id,
                        "source": {
                            "kind": "inline_bytes",
                            "filename": "bad.xyz",
                            "bytes_base64": "not-base64!",
                        },
                    },
                )
            )
            missing_field = service.run(
                ShellCommand(
                    "import.preview",
                    {"session_id": session_id, "source": {"kind": "inline_bytes", "filename": "bad.xyz"}},
                )
            )
            browser_storage = service.run(
                ShellCommand(
                    "import.preview",
                    {
                        "session_id": session_id,
                        "source": {
                            "kind": "browser_storage",
                            "project_ref": "browser-project-a",
                            "storage_path": "inbox/water.xyz",
                        },
                    },
                )
            )

        self.assertFalse(too_large.ok)
        self.assertEqual(too_large.error["code"], "payload_too_large")  # type: ignore[index]
        self.assertEqual(too_large.error["target"], "bytes_base64")  # type: ignore[index]
        self.assertFalse(invalid_base64.ok)
        self.assertEqual(invalid_base64.error["code"], "invalid_input")  # type: ignore[index]
        self.assertEqual(invalid_base64.error["target"], "bytes_base64")  # type: ignore[index]
        self.assertFalse(missing_field.ok)
        self.assertEqual(missing_field.error["target"], "source")  # type: ignore[index]
        self.assertFalse(browser_storage.ok)
        self.assertEqual(browser_storage.error["code"], "storage_object_missing")  # type: ignore[index]
        self.assertEqual(browser_storage.error["target"], "storage_path")  # type: ignore[index]

    def test_project_open_restores_saved_project_content(self) -> None:
        fixture = run_core_fixture_vertical_slice()
        self.assertTrue(fixture.ok, fixture.error)
        assert fixture.value is not None
        snapshot = project_content_snapshot_from_fixture(fixture.value)
        copied_graph = replace(snapshot.reaction_graphs[0], id="graph-a-b-copy")
        copied_workspace = workspace_snapshot_from_graph(
            snapshot.project_id,
            copied_graph,
            snapshot.chemical_objects,
            copied_graph.paths[0].id,
            workspace_id="workspace-graph-a-b-copy",
        )
        copied_profile = replace(
            snapshot.energy_profiles[0],
            id="profile-a-b-copy",
            graph_id=copied_graph.id,
        )
        artifact_payload = b"artifact"
        artifact_record = ExportArtifactRecord(
            id="artifact-profile",
            format="png",
            path="exports/profile.png",
            checksum=f"sha256:{sha256(artifact_payload).hexdigest()}",
            metadata={"profile_id": snapshot.energy_profiles[0].id},
        )
        snapshot = replace(
            snapshot,
            reaction_graphs=snapshot.reaction_graphs + (copied_graph,),
            workspaces=snapshot.workspaces + (copied_workspace,),
            energy_profiles=snapshot.energy_profiles + (copied_profile,),
            export_artifacts=(artifact_record,),
        )

        with tempfile.TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "fixture"
            store = ProjectContentStore()
            manifest = AppKernel().project_store.create_project("fixture-minimal-reaction", project_path)
            self.assertTrue(manifest.ok, manifest.error)
            saved = store.save_snapshot(project_path, snapshot)
            self.assertTrue(saved.ok, saved.error)
            (project_path / "exports").mkdir()
            (project_path / artifact_record.path).write_bytes(artifact_payload)

            kernel = AppKernel()
            response = PlatformShellService(kernel).run(
                ShellCommand("project.open", {"project_path": str(project_path)})
            )

            self.assertTrue(response.ok, response.error)
            payload = response.to_dict()
            self.assertEqual(payload["data"]["command"], "project.open")
            self.assertEqual(payload["data"]["project_id"], "project-fixture-minimal-reaction")
            self.assertTrue(payload["data"]["load_content"])
            self.assertEqual(payload["data"]["object_count"], 2)
            self.assertEqual(payload["data"]["graph_count"], 2)
            self.assertEqual(payload["data"]["workspace_count"], 2)
            self.assertEqual(payload["data"]["profile_count"], 2)
            self.assertEqual(payload["data"]["artifact_count"], 1)
            self.assertEqual(payload["data"]["active_graph_id"], "graph-a-b")
            self.assertEqual(payload["data"]["active_workspace_id"], "workspace-graph-a-b")
            self.assertEqual(payload["data"]["active_profile_id"], "profile-a-b-electronic")

            state = kernel.get_session_state(payload["data"]["session_id"])
            self.assertIsNotNone(state)
            assert state is not None
            self.assertEqual(state.session.project_path, str(project_path))
            self.assertEqual(state.session.object_ids, ("object-a", "object-b"))
            self.assertEqual(state.import_batch_ids, ())
            self.assertEqual([graph.id for graph in state.reaction_graphs], ["graph-a-b", "graph-a-b-copy"])
            self.assertEqual(
                [workspace.workspace_id for workspace in state.workspaces],
                ["workspace-graph-a-b", "workspace-graph-a-b-copy"],
            )
            self.assertEqual(
                [profile.id for profile in state.energy_profiles],
                ["profile-a-b-electronic", "profile-a-b-copy"],
            )
            self.assertEqual([artifact.id for artifact in state.export_artifact_records], ["artifact-profile"])
            objects = kernel.chemical_registry.list_objects("project-fixture-minimal-reaction")
            graphs = kernel.graph_service.list_graphs("project-fixture-minimal-reaction")
            workspaces = kernel.workspace_service.list_workspaces("project-fixture-minimal-reaction")
            batches = kernel.import_workflow.list_batches("project-fixture-minimal-reaction")
            self.assertTrue(objects.ok, objects.error)
            self.assertTrue(graphs.ok, graphs.error)
            self.assertTrue(workspaces.ok, workspaces.error)
            self.assertTrue(batches.ok, batches.error)
            self.assertEqual(len(objects.value), 2)  # type: ignore[arg-type]
            self.assertEqual(len(graphs.value), 2)  # type: ignore[arg-type]
            self.assertEqual(len(workspaces.value), 2)  # type: ignore[arg-type]
            self.assertEqual(batches.value, ())

            snapshot_response = PlatformShellService(kernel).run(
                ShellCommand("workbench.snapshot", {"session_id": payload["data"]["session_id"]})
            )
            self.assertTrue(snapshot_response.ok, snapshot_response.error)
            snapshot_payload = snapshot_response.to_dict()
            json.dumps(snapshot_payload)
            self.assertEqual(snapshot_payload["data"]["project"]["name"], "fixture-minimal-reaction")
            self.assertEqual(snapshot_payload["data"]["counts"]["objects"], 2)
            self.assertEqual(snapshot_payload["data"]["counts"]["graphs"], 2)
            self.assertEqual(snapshot_payload["data"]["counts"]["workspaces"], 2)
            self.assertEqual(snapshot_payload["data"]["counts"]["profiles"], 2)
            self.assertEqual(snapshot_payload["data"]["counts"]["artifacts"], 1)
            self.assertEqual(snapshot_payload["data"]["active"]["workspace_id"], "workspace-graph-a-b")
            self.assertEqual(snapshot_payload["data"]["artifacts"][0]["persisted"], True)

            saved_content = PlatformShellService(kernel).run(
                ShellCommand("project.save_content", {"session_id": payload["data"]["session_id"]})
            )
            self.assertTrue(saved_content.ok, saved_content.error)
            saved_payload = saved_content.to_dict()
            self.assertEqual(saved_payload["data"]["command"], "project.save_content")
            self.assertEqual(saved_payload["data"]["object_count"], 2)
            self.assertEqual(saved_payload["data"]["graph_count"], 2)
            self.assertEqual(saved_payload["data"]["workspace_count"], 2)
            self.assertEqual(saved_payload["data"]["profile_count"], 2)
            self.assertEqual(saved_payload["data"]["artifact_count"], 1)
            self.assertEqual(saved_payload["data"]["import_batch_count"], 0)
            self.assertEqual(saved_payload["data"]["saved"]["file_count"], 6)

            reloaded = kernel.content_store.load_snapshot(project_path)
            self.assertTrue(reloaded.ok, reloaded.error)
            assert reloaded.value is not None
            self.assertEqual([graph.id for graph in reloaded.value.reaction_graphs], ["graph-a-b", "graph-a-b-copy"])
            self.assertEqual(
                [workspace.workspace_id for workspace in reloaded.value.workspaces],
                ["workspace-graph-a-b", "workspace-graph-a-b-copy"],
            )
            self.assertEqual(
                [profile.id for profile in reloaded.value.energy_profiles],
                ["profile-a-b-electronic", "profile-a-b-copy"],
            )
            self.assertEqual([artifact.id for artifact in reloaded.value.export_artifacts], ["artifact-profile"])

    def test_project_open_validation_failure_does_not_restore_content(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "demo"
            kernel = AppKernel()
            created = kernel.project_store.create_project("demo", project_path)
            self.assertTrue(created.ok, created.error)
            saved = kernel.content_store.save_snapshot(
                project_path,
                ProjectContentSnapshot(project_id="project-demo"),
            )
            self.assertTrue(saved.ok, saved.error)
            (project_path / CHEMICAL_OBJECTS_PATH).write_text("{bad json\n", encoding="utf-8")

            response = PlatformShellService(kernel).run(
                ShellCommand("project.open", {"project_path": str(project_path)})
            )

            self.assertFalse(response.ok)
            payload = response.to_dict()
            self.assertEqual(payload["error"]["code"], "project_content_invalid")
            self.assertEqual(payload["error"]["target"], "project_content")
            self.assertGreaterEqual(payload["error"]["details"]["summary"]["errors"], 1)
            objects = kernel.chemical_registry.list_objects("project-demo")
            self.assertTrue(objects.ok, objects.error)
            self.assertEqual(objects.value, ())

    def test_project_open_accepts_inline_project_content_files(self) -> None:
        fixture = run_core_fixture_vertical_slice()
        self.assertTrue(fixture.ok, fixture.error)
        assert fixture.value is not None
        snapshot = project_content_snapshot_from_fixture(fixture.value)

        with tempfile.TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "fixture"
            created = AppKernel().project_store.create_project("fixture-minimal-reaction", project_path)
            self.assertTrue(created.ok, created.error)
            saved = ProjectContentStore().save_snapshot(project_path, snapshot)
            self.assertTrue(saved.ok, saved.error)
            content_files = _content_files_payload(project_path)

        kernel = AppKernel()
        service = PlatformShellService(kernel)
        opened = service.run(
            ShellCommand(
                "project.open",
                {
                    "content_files": content_files,
                    "load_content": True,
                },
            )
        )

        self.assertTrue(opened.ok, opened.error)
        payload = opened.to_dict()
        self.assertEqual(payload["data"]["project"]["id"], "project-fixture-minimal-reaction")
        self.assertEqual(payload["data"]["object_count"], 2)
        self.assertEqual(payload["data"]["graph_count"], 1)
        self.assertEqual(payload["data"]["workspace_count"], 1)
        self.assertEqual(payload["data"]["profile_count"], 1)
        session_id = payload["data"]["session_id"]
        state = kernel.get_session_state(session_id)
        self.assertIsNotNone(state)
        assert state is not None
        self.assertIsNotNone(state.session.project_path)
        self.assertTrue(Path(state.session.project_path or "").is_dir())

        snapshot_response = service.run(ShellCommand("workbench.snapshot", {"session_id": session_id}))
        self.assertTrue(snapshot_response.ok, snapshot_response.error)
        snapshot_payload = snapshot_response.to_dict()
        self.assertEqual(snapshot_payload["data"]["counts"]["objects"], 2)
        self.assertEqual(snapshot_payload["data"]["active"]["workspace_id"], "workspace-graph-a-b")
        kernel.cleanup()

    def test_project_open_inline_content_files_manifest_only_and_errors(self) -> None:
        fixture = run_core_fixture_vertical_slice()
        self.assertTrue(fixture.ok, fixture.error)
        assert fixture.value is not None

        with tempfile.TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "fixture"
            created = AppKernel().project_store.create_project("fixture-minimal-reaction", project_path)
            self.assertTrue(created.ok, created.error)
            saved = ProjectContentStore().save_snapshot(
                project_path,
                project_content_snapshot_from_fixture(fixture.value),
            )
            self.assertTrue(saved.ok, saved.error)
            content_files = _content_files_payload(project_path)

        service = PlatformShellService(AppKernel())
        manifest_only = service.run(
            ShellCommand(
                "project.open",
                {"content_files": content_files, "load_content": False},
            )
        )
        self.assertTrue(manifest_only.ok, manifest_only.error)
        self.assertFalse(manifest_only.to_dict()["data"]["load_content"])
        self.assertEqual(manifest_only.to_dict()["data"]["object_count"], 0)

        missing_manifest = service.run(
            ShellCommand(
                "project.open",
                {
                    "content_files": [
                        item
                        for item in content_files
                        if item["path"] != PROJECT_MANIFEST_PATH
                    ],
                },
            )
        )
        self.assertFalse(missing_manifest.ok)
        self.assertEqual(missing_manifest.error["target"], "content_files")  # type: ignore[index]

        invalid_base64 = service.run(
            ShellCommand(
                "project.open",
                {
                    "content_files": [
                        {
                            "path": PROJECT_MANIFEST_PATH,
                            "bytes_base64": "not-base64!",
                        }
                    ],
                },
            )
        )
        self.assertFalse(invalid_base64.ok)
        self.assertEqual(invalid_base64.error["target"], "bytes_base64")  # type: ignore[index]

        unsafe_path = service.run(
            ShellCommand(
                "project.open",
                {
                    "content_files": [
                        {
                            "path": "../manifest.json",
                            "bytes_base64": content_files[0]["bytes_base64"],
                        }
                    ],
                },
            )
        )
        self.assertFalse(unsafe_path.ok)
        self.assertEqual(unsafe_path.error["target"], "path")  # type: ignore[index]

        checksum_mismatch = service.run(
            ShellCommand(
                "project.open",
                {
                    "content_files": [
                        {
                            **dict(content_files[0]),
                            "checksum": "sha256:" + "0" * 64,
                        }
                    ],
                },
            )
        )
        self.assertFalse(checksum_mismatch.ok)
        self.assertEqual(checksum_mismatch.error["code"], "checksum_mismatch")  # type: ignore[index]

    def test_project_save_content_can_return_inline_project_content_files(self) -> None:
        kernel = AppKernel()
        service = PlatformShellService(kernel)

        with tempfile.TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "demo"
            created = service.run(
                ShellCommand("project.create", {"name": "demo", "location": str(project_path)})
            )
            self.assertTrue(created.ok, created.error)
            session_id = created.to_dict()["data"]["session_id"]

            saved_content = service.run(
                ShellCommand(
                    "project.save_content",
                    {
                        "session_id": session_id,
                        "include_content_files": True,
                    },
                )
            )

            self.assertTrue(saved_content.ok, saved_content.error)
            payload = saved_content.to_dict()["data"]
            files = payload["content_files"]
            paths = {file["path"] for file in files}
            self.assertIn(PROJECT_MANIFEST_PATH, paths)
            self.assertIn(PROJECT_CONTENT_INDEX_PATH, paths)
            self.assertIn(CHEMICAL_OBJECTS_PATH, paths)
            self.assertEqual(payload["saved"]["file_count"], 6)
            self.assertGreaterEqual(len(files), 8)
            for file in files:
                decoded = base64.b64decode(file["bytes_base64"])
                self.assertEqual(file["checksum"], f"sha256:{sha256(decoded).hexdigest()}")
                self.assertEqual(file["byte_size"], len(decoded))

    def test_project_save_content_requires_session_and_project_path(self) -> None:
        kernel = AppKernel()
        service = PlatformShellService(kernel)

        missing_session = service.run(ShellCommand("project.save_content", {"session_id": "missing"}))
        self.assertFalse(missing_session.ok)
        self.assertEqual(missing_session.error["target"], "session_id")  # type: ignore[index]

        fixture = service.run(ShellCommand("fixture.run"))
        self.assertTrue(fixture.ok, fixture.error)
        session_id = fixture.to_dict()["data"]["session_id"]
        missing_path = service.run(ShellCommand("project.save_content", {"session_id": session_id}))
        self.assertFalse(missing_path.ok)
        self.assertEqual(missing_path.error["target"], "project_path")  # type: ignore[index]

    def test_workbench_snapshot_missing_session_and_manifest_only_session(self) -> None:
        kernel = AppKernel()
        service = PlatformShellService(kernel)

        missing_arg = service.run(ShellCommand("workbench.snapshot"))
        self.assertFalse(missing_arg.ok)
        self.assertEqual(missing_arg.error["code"], "invalid_input")  # type: ignore[index]
        self.assertEqual(missing_arg.error["target"], "session_id")  # type: ignore[index]
        self.assertEqual(kernel._sessions, {})  # pylint: disable=protected-access

        missing_session = service.run(
            ShellCommand("workbench.snapshot", {"session_id": "missing-session"})
        )
        self.assertFalse(missing_session.ok)
        self.assertEqual(missing_session.error["code"], "invalid_input")  # type: ignore[index]
        self.assertEqual(missing_session.error["target"], "session_id")  # type: ignore[index]
        self.assertEqual(kernel._sessions, {})  # pylint: disable=protected-access

        with tempfile.TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "demo"
            created = service.run(
                ShellCommand("project.create", {"name": "demo", "location": str(project_path)})
            )
            self.assertTrue(created.ok, created.error)
            session_id = created.to_dict()["data"]["session_id"]

            snapshot = service.run(ShellCommand("workbench.snapshot", {"session_id": session_id}))
            self.assertTrue(snapshot.ok, snapshot.error)
            payload = snapshot.to_dict()
            json.dumps(payload)
            self.assertEqual(payload["data"]["project"]["name"], "demo")
            self.assertEqual(payload["data"]["project_path"], str(project_path))
            self.assertEqual(payload["data"]["counts"]["objects"], 0)
            self.assertEqual(payload["data"]["counts"]["imports"], 0)
            self.assertEqual(payload["data"]["counts"]["graphs"], 0)
            self.assertEqual(payload["data"]["counts"]["workspaces"], 0)
            self.assertEqual(payload["data"]["counts"]["profiles"], 0)
            self.assertEqual(payload["data"]["counts"]["artifacts"], 0)
            self.assertIsNone(payload["data"]["active"]["workspace_id"])
            self.assertIsNone(payload["data"]["workspace"])
            self.assertIsNone(payload["data"]["profile"])

    def test_project_open_and_save_do_not_recompute_or_reexport(self) -> None:
        fixture = run_core_fixture_vertical_slice()
        self.assertTrue(fixture.ok, fixture.error)
        assert fixture.value is not None
        snapshot = project_content_snapshot_from_fixture(fixture.value)

        with tempfile.TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "fixture"
            manifest = AppKernel().project_store.create_project("fixture-minimal-reaction", project_path)
            self.assertTrue(manifest.ok, manifest.error)
            saved = ProjectContentStore().save_snapshot(project_path, snapshot)
            self.assertTrue(saved.ok, saved.error)

            kernel = AppKernel(
                parser_registry=_NoParserRegistry(),
                energy_engine=_NoEnergyEngine(),
                export_service=_NoExportService(),
            )
            kernel.import_workflow = _RestoreOnlyImportWorkflow(kernel.import_workflow)  # type: ignore[assignment]
            service = PlatformShellService(kernel)

            opened = service.run(ShellCommand("project.open", {"project_path": str(project_path)}))
            self.assertTrue(opened.ok, opened.error)
            snapshot = service.run(
                ShellCommand("workbench.snapshot", {"session_id": opened.to_dict()["data"]["session_id"]})
            )
            self.assertTrue(snapshot.ok, snapshot.error)
            save = service.run(
                ShellCommand("project.save_content", {"session_id": opened.to_dict()["data"]["session_id"]})
            )
            self.assertTrue(save.ok, save.error)

    def test_session_import_workspace_energy_and_profile_export(self) -> None:
        kernel = AppKernel()
        service = PlatformShellService(kernel)

        with tempfile.TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "demo"
            source_path = Path(tmp) / "h2.xyz"
            source_path.write_text(
                "2\nEnergy = -1.5 Hartree\nH 0 0 0\nH 0 0 0.74\n",
                encoding="utf-8",
            )
            created = service.run(
                ShellCommand("project.create", {"name": "demo", "location": str(project_path)})
            )
            self.assertTrue(created.ok, created.error)
            session_id = created.to_dict()["data"]["session_id"]

            preview = service.run(
                ShellCommand(
                    "import.preview",
                    {"session_id": session_id, "source_path": str(source_path)},
                )
            )
            self.assertTrue(preview.ok, preview.error)
            preview_payload = preview.to_dict()
            json.dumps(preview_payload)
            batch = preview_payload["data"]["batch"]
            self.assertEqual(batch["items"][0]["status"], "needs_confirmation")
            self.assertEqual(batch["items"][0]["preview"]["parser_id"], "xyz-ase")
            self.assertEqual(batch["items"][0]["preview"]["object_count"], 1)

            registered = service.run(
                ShellCommand(
                    "import.register_all",
                    {"session_id": session_id, "batch_id": batch["id"]},
                )
            )
            self.assertTrue(registered.ok, registered.error)
            object_ids = tuple(registered.to_dict()["data"]["registered_object_ids"])
            self.assertEqual(len(object_ids), 1)

            repeated = service.run(
                ShellCommand(
                    "import.register_all",
                    {"session_id": session_id, "batch_id": batch["id"]},
                )
            )
            self.assertTrue(repeated.ok, repeated.error)
            self.assertEqual(tuple(repeated.to_dict()["data"]["registered_object_ids"]), object_ids)

            workspace = service.run(ShellCommand("workspace.open", {"session_id": session_id}))
            self.assertTrue(workspace.ok, workspace.error)
            workspace_payload = workspace.to_dict()
            self.assertEqual(len(workspace_payload["data"]["workspace"]["palette"]), 1)

            first = service.run(
                ShellCommand(
                    "workspace.add_node",
                    {
                        "session_id": session_id,
                        "kind": "species",
                        "label": "A",
                        "chemical_object_ids": object_ids,
                    },
                )
            )
            second = service.run(
                ShellCommand(
                    "workspace.add_node",
                    {
                        "session_id": session_id,
                        "kind": "species",
                        "label": "B",
                        "chemical_object_ids": object_ids,
                    },
                )
            )
            self.assertTrue(first.ok, first.error)
            self.assertTrue(second.ok, second.error)
            nodes = second.to_dict()["data"]["workspace"]["graph"]["nodes"]
            node_ids = (nodes[0]["id"], nodes[1]["id"])

            connected = service.run(
                ShellCommand(
                    "workspace.connect",
                    {"session_id": session_id, "from_node_id": node_ids[0], "to_node_id": node_ids[1]},
                )
            )
            self.assertTrue(connected.ok, connected.error)
            moved = service.run(
                ShellCommand(
                    "workspace.move_node",
                    {"session_id": session_id, "node_id": node_ids[1], "position": [240, 180]},
                )
            )
            self.assertTrue(moved.ok, moved.error)
            moved_payload = moved.to_dict()
            moved_nodes = moved_payload["data"]["workspace"]["graph"]["nodes"]
            self.assertEqual(moved_payload["data"]["command"], "workspace.move_node")
            self.assertEqual(moved_nodes[1]["position"], [240.0, 180.0])
            edge_id = connected.to_dict()["data"]["workspace"]["graph"]["edges"][0]["id"]

            selected_edge = service.run(
                ShellCommand(
                    "workspace.select",
                    {"session_id": session_id, "selection": {"edge_ids": [edge_id]}},
                )
            )
            self.assertTrue(selected_edge.ok, selected_edge.error)
            updated_edge = service.run(
                ShellCommand(
                    "workspace.update_edge",
                    {"session_id": session_id, "edge_id": edge_id, "label": "TS search"},
                )
            )
            self.assertTrue(updated_edge.ok, updated_edge.error)
            updated_edge_payload = updated_edge.to_dict()
            json.dumps(updated_edge_payload)
            self.assertEqual(updated_edge_payload["data"]["command"], "workspace.update_edge")
            edge = updated_edge_payload["data"]["workspace"]["graph"]["edges"][0]
            self.assertEqual(edge["label"], "TS search")
            self.assertEqual(edge["from_node"], node_ids[0])
            self.assertEqual(edge["to_node"], node_ids[1])
            self.assertEqual(updated_edge_payload["data"]["workspace"]["selection"]["edge_ids"], [edge_id])

            cleared_edge = service.run(
                ShellCommand(
                    "workspace.update_edge",
                    {"session_id": session_id, "edge_id": edge_id, "label": "   "},
                )
            )
            self.assertTrue(cleared_edge.ok, cleared_edge.error)
            self.assertIsNone(cleared_edge.to_dict()["data"]["workspace"]["graph"]["edges"][0]["label"])

            missing_edge_update = service.run(
                ShellCommand(
                    "workspace.update_edge",
                    {"session_id": session_id, "edge_id": "edge-missing", "label": "missing"},
                )
            )
            self.assertFalse(missing_edge_update.ok)
            self.assertEqual(missing_edge_update.error["code"], "graph_invalid")  # type: ignore[index]
            self.assertEqual(missing_edge_update.error["target"], "edge_id")  # type: ignore[index]

            missing_edge_id_update = service.run(
                ShellCommand("workspace.update_edge", {"session_id": session_id, "label": "missing id"})
            )
            self.assertFalse(missing_edge_id_update.ok)
            self.assertEqual(missing_edge_id_update.error["target"], "edge_id")  # type: ignore[index]

            invalid_label_update = service.run(
                ShellCommand(
                    "workspace.update_edge",
                    {"session_id": session_id, "edge_id": edge_id, "label": 42},
                )
            )
            self.assertFalse(invalid_label_update.ok)
            self.assertEqual(invalid_label_update.error["target"], "edge_label")  # type: ignore[index]

            removed_edge = service.run(
                ShellCommand(
                    "workspace.remove",
                    {"session_id": session_id, "edge_ids": [edge_id]},
                )
            )
            self.assertTrue(removed_edge.ok, removed_edge.error)
            removed_edge_payload = removed_edge.to_dict()
            self.assertEqual(removed_edge_payload["data"]["command"], "workspace.remove")
            self.assertEqual(removed_edge_payload["data"]["workspace"]["graph"]["edge_count"], 0)
            self.assertEqual(
                removed_edge_payload["data"]["workspace"]["preview"]["disconnected_node_ids"],
                [node_ids[0], node_ids[1]],
            )

            reconnected = service.run(
                ShellCommand(
                    "workspace.connect",
                    {"session_id": session_id, "from_node_id": node_ids[0], "to_node_id": node_ids[1]},
                )
            )
            self.assertTrue(reconnected.ok, reconnected.error)

            extra = service.run(
                ShellCommand(
                    "workspace.add_node",
                    {
                        "session_id": session_id,
                        "kind": "species",
                        "label": "Extra",
                        "chemical_object_ids": object_ids,
                    },
                )
            )
            self.assertTrue(extra.ok, extra.error)
            extra_node_id = extra.to_dict()["data"]["workspace"]["graph"]["nodes"][2]["id"]
            path_before_remove = service.run(
                ShellCommand(
                    "workspace.set_path",
                    {"session_id": session_id, "path_id": "path-extra", "node_ids": (node_ids[0], extra_node_id)},
                )
            )
            self.assertTrue(path_before_remove.ok, path_before_remove.error)
            selected_path = service.run(
                ShellCommand(
                    "workspace.select",
                    {"session_id": session_id, "selection": {"path_ids": ["path-extra"]}},
                )
            )
            self.assertTrue(selected_path.ok, selected_path.error)
            removed_path = service.run(
                ShellCommand(
                    "workspace.remove",
                    {"session_id": session_id, "path_ids": ["path-extra"]},
                )
            )
            self.assertTrue(removed_path.ok, removed_path.error)
            removed_path_payload = removed_path.to_dict()
            self.assertEqual(removed_path_payload["data"]["command"], "workspace.remove")
            self.assertEqual(removed_path_payload["data"]["workspace"]["graph"]["node_count"], 3)
            self.assertEqual(removed_path_payload["data"]["workspace"]["graph"]["edge_count"], 1)
            self.assertNotIn(
                "path-extra",
                [path["id"] for path in removed_path_payload["data"]["workspace"]["graph"]["paths"]],
            )
            self.assertIsNone(removed_path_payload["data"]["workspace"]["active_path_id"])
            self.assertEqual(removed_path_payload["data"]["workspace"]["selection"]["path_ids"], [])

            path_before_remove = service.run(
                ShellCommand(
                    "workspace.set_path",
                    {"session_id": session_id, "path_id": "path-extra", "node_ids": (node_ids[0], extra_node_id)},
                )
            )
            self.assertTrue(path_before_remove.ok, path_before_remove.error)
            removed_node = service.run(
                ShellCommand(
                    "workspace.remove",
                    {"session_id": session_id, "node_ids": [extra_node_id]},
                )
            )
            self.assertTrue(removed_node.ok, removed_node.error)
            removed_node_payload = removed_node.to_dict()
            self.assertEqual(removed_node_payload["data"]["workspace"]["graph"]["node_count"], 2)
            self.assertEqual(removed_node_payload["data"]["workspace"]["graph"]["edge_count"], 1)
            self.assertNotIn(
                "path-extra",
                [path["id"] for path in removed_node_payload["data"]["workspace"]["graph"]["paths"]],
            )

            empty_remove = service.run(ShellCommand("workspace.remove", {"session_id": session_id}))
            self.assertFalse(empty_remove.ok)
            self.assertEqual(empty_remove.error["target"], "selection")  # type: ignore[index]
            missing_path_remove = service.run(
                ShellCommand("workspace.remove", {"session_id": session_id, "path_ids": ["path-missing"]})
            )
            self.assertFalse(missing_path_remove.ok)
            self.assertEqual(missing_path_remove.error["code"], "graph_invalid")  # type: ignore[index]
            self.assertEqual(missing_path_remove.error["target"], "path_id")  # type: ignore[index]

            bad_move = service.run(
                ShellCommand(
                    "workspace.move_node",
                    {"session_id": session_id, "node_id": "missing-node", "position": [240, 180]},
                )
            )
            self.assertFalse(bad_move.ok)
            self.assertEqual(bad_move.error["code"], "graph_invalid")  # type: ignore[index]

            bad_position = service.run(
                ShellCommand(
                    "workspace.move_node",
                    {"session_id": session_id, "node_id": node_ids[1], "position": ["bad", 180]},
                )
            )
            self.assertFalse(bad_position.ok)
            self.assertEqual(bad_position.error["target"], "position")  # type: ignore[index]

            bad_connect = service.run(
                ShellCommand(
                    "workspace.connect",
                    {"session_id": session_id, "from_node_id": node_ids[0], "to_node_id": "missing-node"},
                )
            )
            self.assertFalse(bad_connect.ok)
            self.assertEqual(bad_connect.error["code"], "graph_invalid")  # type: ignore[index]

            path = service.run(
                ShellCommand(
                    "workspace.set_path",
                    {"session_id": session_id, "path_id": "path-main", "node_ids": node_ids},
                )
            )
            self.assertTrue(path.ok, path.error)

            profile = service.run(ShellCommand("energy.compute", {"session_id": session_id}))
            self.assertTrue(profile.ok, profile.error)
            profile_payload = profile.to_dict()
            self.assertEqual(profile_payload["data"]["profile"]["point_count"], 2)
            self.assertEqual(profile_payload["data"]["profile"]["energy_source"], "auto")
            self.assertEqual(profile_payload["data"]["profile"]["points"][0]["relative_energy"]["value"], 0.0)

            export = service.run(
                ShellCommand(
                    "export.profile",
                    {"session_id": session_id, "formats": ("cdxml", "csv", "svg"), "include_bytes": True},
                )
            )
            self.assertTrue(export.ok, export.error)
            export_artifacts = export.to_dict()["artifacts"]
            artifact = export_artifacts[0]
            self.assertEqual(artifact["format"], "cdxml")
            self.assertIsNotNone(artifact["bytes_base64"])
            self.assertEqual(artifact["metadata"]["encoding"], "base64")
            csv_artifact = export_artifacts[1]
            self.assertEqual(csv_artifact["format"], "csv")
            self.assertIsNotNone(csv_artifact["bytes_base64"])
            self.assertIn("Structure", base64.b64decode(csv_artifact["bytes_base64"]).decode("utf-8"))
            self.assertEqual(csv_artifact["metadata"]["writer_id"], "python-csv-energy-table-v1")
            self.assertEqual(csv_artifact["metadata"]["mime_type"], "text/csv")
            self.assertEqual(csv_artifact["metadata"]["extension"], "csv")
            self.assertEqual(csv_artifact["metadata"]["encoding"], "base64")
            svg_artifact = export_artifacts[2]
            self.assertEqual(svg_artifact["format"], "svg")
            self.assertIsNotNone(svg_artifact["bytes_base64"])
            self.assertIn("<svg", base64.b64decode(svg_artifact["bytes_base64"]).decode("utf-8"))
            self.assertEqual(svg_artifact["metadata"]["writer_id"], "python-svg-graph-snapshot-v1")
            self.assertEqual(svg_artifact["metadata"]["mime_type"], "image/svg+xml")
            self.assertEqual(svg_artifact["metadata"]["extension"], "svg")
            self.assertEqual(svg_artifact["metadata"]["artifact_kind"], "graph_snapshot")
            export_state = kernel.get_session_state(session_id)
            self.assertIsNotNone(export_state)
            assert export_state is not None
            self.assertEqual(svg_artifact["metadata"]["graph_id"], export_state.graph.id)
            self.assertEqual(svg_artifact["metadata"]["workspace_id"], export_state.workspace.workspace_id)
            self.assertEqual(svg_artifact["metadata"]["encoding"], "base64")

            project_exports = project_path / "exports"
            project_exports.mkdir()
            persisted_export = service.run(
                ShellCommand(
                    "export.profile",
                    {
                        "session_id": session_id,
                        "formats": ("png",),
                        "destination_dir": str(project_exports),
                        "basename": "persisted-profile",
                    },
                )
            )
            self.assertTrue(persisted_export.ok, persisted_export.error)
            persisted_artifact = persisted_export.to_dict()["artifacts"][0]
            self.assertEqual(persisted_artifact["path"], str(project_exports / "persisted-profile.png"))

            outside_exports = Path(tmp) / "outside-exports"
            outside_exports.mkdir()
            outside_export = service.run(
                ShellCommand(
                    "export.profile",
                    {
                        "session_id": session_id,
                        "formats": ("xlsx",),
                        "destination_dir": str(outside_exports),
                        "basename": "external-profile",
                    },
                )
            )
            self.assertTrue(outside_export.ok, outside_export.error)

            snapshot = service.run(ShellCommand("workbench.snapshot", {"session_id": session_id}))
            self.assertTrue(snapshot.ok, snapshot.error)
            snapshot_payload = snapshot.to_dict()
            json.dumps(snapshot_payload)
            self.assertEqual(snapshot_payload["data"]["project"]["name"], "demo")
            self.assertEqual(snapshot_payload["data"]["counts"]["objects"], 1)
            self.assertEqual(snapshot_payload["data"]["counts"]["imports"], 1)
            self.assertEqual(snapshot_payload["data"]["counts"]["graphs"], 1)
            self.assertEqual(snapshot_payload["data"]["counts"]["workspaces"], 1)
            self.assertEqual(snapshot_payload["data"]["counts"]["profiles"], 1)
            self.assertEqual(snapshot_payload["data"]["counts"]["artifacts"], 5)
            self.assertEqual(len(snapshot_payload["data"]["imports"]), 1)
            self.assertEqual(len(snapshot_payload["data"]["workspace"]["graph"]["nodes"]), 2)
            self.assertEqual(snapshot_payload["data"]["profile"]["point_count"], 2)
            self.assertEqual(
                [artifact["format"] for artifact in snapshot_payload["data"]["artifacts"]],
                ["cdxml", "csv", "svg", "png", "xlsx"],
            )
            self.assertFalse(snapshot_payload["data"]["artifacts"][0]["persisted"])

            saved_content = service.run(ShellCommand("project.save_content", {"session_id": session_id}))
            self.assertTrue(saved_content.ok, saved_content.error)
            save_payload = saved_content.to_dict()
            self.assertEqual(save_payload["data"]["artifact_count"], 1)
            warning_reasons = {warning["details"]["reason"] for warning in save_payload["warnings"]}
            self.assertEqual(warning_reasons, {"missing_path", "outside_project"})
            saved_snapshot = kernel.content_store.load_snapshot(project_path)
            self.assertTrue(saved_snapshot.ok, saved_snapshot.error)
            assert saved_snapshot.value is not None
            self.assertEqual(len(saved_snapshot.value.export_artifacts), 1)
            record = saved_snapshot.value.export_artifacts[0]
            self.assertEqual(record.id, persisted_artifact["id"])
            self.assertEqual(record.path, "exports/persisted-profile.png")
            self.assertEqual(record.format, "png")
            self.assertTrue(record.checksum.startswith("sha256:"))

            state = kernel.get_session_state(session_id)
            self.assertIsNotNone(state)
            assert state is not None
            self.assertEqual([batch.id for batch in state.import_batches], [batch["id"]])
            self.assertEqual([graph.id for graph in state.reaction_graphs], [state.session.graph_id])
            self.assertEqual([workspace.workspace_id for workspace in state.workspaces], [state.session.workspace_id])
            self.assertEqual([profile.id for profile in state.energy_profiles], [state.session.profile_id])
            self.assertEqual(
                [item.id for item in state.artifacts],
                [artifact["id"], csv_artifact["id"], svg_artifact["id"], outside_export.to_dict()["artifacts"][0]["id"]],
            )
            self.assertEqual([item.id for item in state.export_artifact_records], [persisted_artifact["id"]])

            missing_energy = PlatformShellService(AppKernel()).run(
                ShellCommand("energy.compute", {"session_id": "missing"})
            )
            self.assertFalse(missing_energy.ok)
            self.assertEqual(missing_energy.error["target"], "session_id")  # type: ignore[index]

    def test_object_projection_lists_energy_channels_and_profile_source(self) -> None:
        kernel = AppKernel()
        service = PlatformShellService(kernel)
        session = kernel.create_session(project_id="project-a")
        obj_a = ChemicalObject(
            id="object-a",
            label="A",
            energies={"electronic": EnergyValue(-100.0, "hartree")},
            thermochemistry={"gibbs": EnergyValue(-99.9, "hartree")},
            source_file_id="raw-a",
            registry_fingerprint="object-a",
        )
        obj_b = ChemicalObject(
            id="object-b",
            label="B",
            energies={"electronic": EnergyValue(-99.98, "hartree")},
            thermochemistry={"gibbs": EnergyValue(-99.88, "hartree")},
            source_file_id="raw-b",
            registry_fingerprint="object-b",
        )
        restored = kernel.chemical_registry.restore_objects("project-a", (obj_a, obj_b), replace=True)
        self.assertTrue(restored.ok, restored.error)
        state = kernel.get_session_state(session.id)
        assert state is not None
        kernel.put_session_state(replace(state, objects=(obj_a, obj_b)))

        snapshot = service.run(ShellCommand("workbench.snapshot", {"session_id": session.id}))

        self.assertTrue(snapshot.ok, snapshot.error)
        payload = snapshot.to_dict()
        self.assertEqual(payload["data"]["objects"][0]["energy_keys"], ["electronic"])
        self.assertEqual(payload["data"]["objects"][0]["thermochemistry_keys"], ["gibbs"])
        self.assertEqual(
            [(item["key"], item["source"]) for item in payload["data"]["objects"][0]["energy_channels"]],
            [("electronic", "energies"), ("gibbs", "thermochemistry")],
        )

    def test_registry_apply_correction_updates_session_snapshot_and_energy_compute(self) -> None:
        kernel = AppKernel()
        service = PlatformShellService(kernel)
        fixture = service.run(ShellCommand("fixture.run"))
        self.assertTrue(fixture.ok, fixture.error)
        session_id = fixture.to_dict()["data"]["session_id"]

        applied = service.run(
            ShellCommand(
                "registry.apply_correction",
                {
                    "session_id": session_id,
                    "object_id": "object-b",
                    "correction": {
                        "kind": "manual",
                        "energy": {"value": 1.0, "unit": "kcal_mol", "reference": "manual-test"},
                        "note": "test correction",
                    },
                },
            )
        )

        self.assertTrue(applied.ok, applied.error)
        applied_payload = applied.to_dict()
        correction = applied_payload["data"]["object"]["corrections"][0]
        self.assertTrue(correction["id"].startswith("corr-object-b-manual-"))
        self.assertEqual(correction["kind"], "manual")
        self.assertEqual(correction["energy"], {"value": 1.0, "unit": "kcal_mol", "reference": "manual-test"})
        self.assertEqual(applied_payload["data"]["object"]["correction_count"], 1)

        repeated = service.run(
            ShellCommand(
                "registry.apply_correction",
                {
                    "session_id": session_id,
                    "object_id": "object-b",
                    "correction": {
                        "kind": "manual",
                        "energy": {"value": 1.0, "unit": "kcal_mol", "reference": "manual-test"},
                        "note": "test correction",
                    },
                },
            )
        )
        self.assertTrue(repeated.ok, repeated.error)
        self.assertEqual(repeated.to_dict()["data"]["object"]["correction_count"], 1)

        snapshot = service.run(ShellCommand("workbench.snapshot", {"session_id": session_id}))
        self.assertTrue(snapshot.ok, snapshot.error)
        object_b = next(item for item in snapshot.to_dict()["data"]["objects"] if item["id"] == "object-b")
        self.assertEqual(object_b["correction_count"], 1)
        self.assertEqual(object_b["corrections"][0]["id"], correction["id"])

        raw_profile = service.run(
            ShellCommand(
                "energy.compute",
                {"session_id": session_id, "include_corrections": False},
            )
        )
        corrected_profile = service.run(
            ShellCommand(
                "energy.compute",
                {"session_id": session_id, "include_corrections": True},
            )
        )
        self.assertTrue(raw_profile.ok, raw_profile.error)
        self.assertTrue(corrected_profile.ok, corrected_profile.error)
        raw_energy = raw_profile.to_dict()["data"]["profile"]["points"][1]["relative_energy"]["value"]
        corrected_energy = corrected_profile.to_dict()["data"]["profile"]["points"][1]["relative_energy"]["value"]
        self.assertAlmostEqual(corrected_energy - raw_energy, 1.0, places=6)

    def test_registry_apply_correction_rejects_invalid_payload_without_state_change(self) -> None:
        kernel = AppKernel()
        service = PlatformShellService(kernel)
        fixture = service.run(ShellCommand("fixture.run"))
        self.assertTrue(fixture.ok, fixture.error)
        session_id = fixture.to_dict()["data"]["session_id"]

        first = service.run(
            ShellCommand(
                "registry.apply_correction",
                {
                    "session_id": session_id,
                    "object_id": "object-a",
                    "correction": {
                        "id": "corr-fixed",
                        "kind": "solvation",
                        "energy": {"value": -2.0, "unit": "kcal_mol"},
                    },
                },
            )
        )
        self.assertTrue(first.ok, first.error)

        invalid_cases = (
            (
                {"object_id": "object-a", "correction": {"kind": "bad", "energy": {"value": 1, "unit": "kcal_mol"}}},
                "correction.kind",
            ),
            (
                {"object_id": "object-a", "correction": {"kind": "manual", "energy": {"value": 1, "unit": "eV"}}},
                "correction.energy.unit",
            ),
            (
                {"object_id": "object-a", "correction": {"kind": "manual", "energy": {"value": float("nan"), "unit": "kcal_mol"}}},
                "correction.energy.value",
            ),
            (
                {"object_id": "object-missing", "correction": {"kind": "manual", "energy": {"value": 1, "unit": "kcal_mol"}}},
                "object_id",
            ),
            (
                {"object_id": "object-a", "correction": {"id": "corr-fixed", "kind": "solvation", "energy": {"value": -1.0, "unit": "kcal_mol"}}},
                "correction.id",
            ),
        )
        for args, target in invalid_cases:
            result = service.run(ShellCommand("registry.apply_correction", {"session_id": session_id, **args}))
            self.assertFalse(result.ok)
            self.assertEqual(result.error["code"], "invalid_input")  # type: ignore[index]
            self.assertEqual(result.error["target"], target)  # type: ignore[index]

        snapshot = service.run(ShellCommand("workbench.snapshot", {"session_id": session_id}))
        self.assertTrue(snapshot.ok, snapshot.error)
        object_a = next(item for item in snapshot.to_dict()["data"]["objects"] if item["id"] == "object-a")
        self.assertEqual(object_a["correction_count"], 1)
        self.assertEqual(object_a["corrections"][0]["id"], "corr-fixed")

    def test_workspace_set_node_composition_updates_projection_and_preserves_state_on_error(self) -> None:
        kernel = AppKernel()
        service = PlatformShellService(kernel)
        fixture = service.run(ShellCommand("fixture.run"))
        self.assertTrue(fixture.ok, fixture.error)
        session_id = fixture.to_dict()["data"]["session_id"]
        opened = service.run(ShellCommand("workspace.open", {"session_id": session_id}))
        self.assertTrue(opened.ok, opened.error)
        added = service.run(
            ShellCommand(
                "workspace.add_node",
                {
                    "session_id": session_id,
                    "kind": "species",
                    "label": "Combo",
                    "chemical_object_ids": ("object-a",),
                },
            )
        )
        self.assertTrue(added.ok, added.error)
        node_id = added.to_dict()["data"]["workspace"]["graph"]["nodes"][-1]["id"]

        updated = service.run(
            ShellCommand(
                "workspace.set_node_composition",
                {
                    "session_id": session_id,
                    "node_id": node_id,
                    "composition": [
                        {"object_id": "object-a", "coefficient": 1},
                        {"object_id": "object-b", "coefficient": 2, "role": "reagent"},
                    ],
                },
            )
        )

        self.assertTrue(updated.ok, updated.error)
        graph_node = updated.to_dict()["data"]["workspace"]["graph"]["nodes"][-1]
        self.assertEqual(graph_node["chemical_object_ids"], ["object-a", "object-b"])
        self.assertEqual(graph_node["composition"][1]["coefficient"], 2.0)
        self.assertEqual(graph_node["composition"][1]["role"], "reagent")

        bad = service.run(
            ShellCommand(
                "workspace.set_node_composition",
                {
                    "session_id": session_id,
                    "node_id": node_id,
                    "composition": [{"object_id": "object-a", "coefficient": 0}],
                },
            )
        )
        self.assertFalse(bad.ok)
        self.assertEqual(bad.error["target"], "composition")  # type: ignore[index]
        snapshot = service.run(ShellCommand("workbench.snapshot", {"session_id": session_id}))
        self.assertTrue(snapshot.ok, snapshot.error)
        self.assertEqual(
            snapshot.to_dict()["data"]["workspace"]["graph"]["nodes"][-1]["chemical_object_ids"],
            ["object-a", "object-b"],
        )

        bad_add = service.run(
            ShellCommand(
                "workspace.add_node",
                {
                    "session_id": session_id,
                    "kind": "species",
                    "label": "Bad composition",
                    "composition": [{"object_id": "object-a", "coefficient": 0}],
                },
            )
        )
        self.assertFalse(bad_add.ok)
        self.assertEqual(bad_add.error["target"], "composition")  # type: ignore[index]

    def test_workspace_set_viewport_updates_only_workspace_viewport(self) -> None:
        service = PlatformShellService(AppKernel())
        fixture = service.run(ShellCommand("fixture.run"))
        self.assertTrue(fixture.ok, fixture.error)
        session_id = fixture.to_dict()["data"]["session_id"]

        opened = service.run(ShellCommand("workspace.open", {"session_id": session_id}))
        self.assertTrue(opened.ok, opened.error)
        first = service.run(
            ShellCommand(
                "workspace.add_node",
                {
                    "session_id": session_id,
                    "kind": "species",
                    "label": "Object A",
                    "chemical_object_ids": ("object-a",),
                    "position": (120, 160),
                },
            )
        )
        self.assertTrue(first.ok, first.error)
        second = service.run(
            ShellCommand(
                "workspace.add_node",
                {
                    "session_id": session_id,
                    "kind": "species",
                    "label": "Object B",
                    "chemical_object_ids": ("object-b",),
                    "position": (360, 160),
                },
            )
        )
        self.assertTrue(second.ok, second.error)
        node_ids = tuple(node["id"] for node in second.to_dict()["data"]["workspace"]["graph"]["nodes"])
        connected = service.run(
            ShellCommand(
                "workspace.connect",
                {"session_id": session_id, "from_node_id": node_ids[0], "to_node_id": node_ids[1]},
            )
        )
        self.assertTrue(connected.ok, connected.error)
        path = service.run(
            ShellCommand(
                "workspace.set_path",
                {"session_id": session_id, "path_id": "path-main", "node_ids": node_ids},
            )
        )
        self.assertTrue(path.ok, path.error)
        before_workspace = path.to_dict()["data"]["workspace"]
        before_graph = before_workspace["graph"]

        updated = service.run(
            ShellCommand(
                "workspace.set_viewport",
                {
                    "session_id": session_id,
                    "viewport": {"x": 12, "y": -8, "zoom": 1.5},
                },
            )
        )
        self.assertTrue(updated.ok, updated.error)
        updated_payload = updated.to_dict()
        json.dumps(updated_payload)
        self.assertEqual(updated_payload["data"]["command"], "workspace.set_viewport")
        self.assertEqual(updated_payload["data"]["workspace"]["viewport"], {"x": 12.0, "y": -8.0, "zoom": 1.5})
        self.assertEqual(updated_payload["data"]["workspace"]["graph"], before_graph)

        invalid_cases = (
            ({}, "viewport"),
            ({"viewport": {"x": float("nan"), "y": 0, "zoom": 1}}, "viewport"),
            ({"viewport": {"x": 0, "y": float("inf"), "zoom": 1}}, "viewport"),
            ({"viewport": {"x": 0, "y": 0, "zoom": 0}}, "viewport.zoom"),
            ({"viewport": {"x": 0, "y": 0, "zoom": -1}}, "viewport.zoom"),
        )
        for args, target in invalid_cases:
            invalid = service.run(
                ShellCommand(
                    "workspace.set_viewport",
                    {"session_id": session_id, **args},
                )
            )
            self.assertFalse(invalid.ok)
            self.assertEqual(invalid.error["code"], "invalid_input")  # type: ignore[index]
            self.assertEqual(invalid.error["target"], target)  # type: ignore[index]
            snapshot = service.run(ShellCommand("workbench.snapshot", {"session_id": session_id}))
            self.assertTrue(snapshot.ok, snapshot.error)
            workspace = snapshot.to_dict()["data"]["workspace"]
            self.assertEqual(workspace["viewport"], {"x": 12.0, "y": -8.0, "zoom": 1.5})
            self.assertEqual(workspace["graph"], before_graph)

    def test_cli_fixture_project_and_import_preview(self) -> None:
        fixture = subprocess.run(
            [sys.executable, "-m", "rxnflow.cli", "fixture", "--json"],
            cwd=Path.cwd(),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(fixture.returncode, 0, fixture.stderr)
        fixture_payload = json.loads(fixture.stdout)
        self.assertTrue(fixture_payload["ok"])
        self.assertEqual(fixture_payload["data"]["profile"]["id"], "profile-a-b-electronic")

        with tempfile.TemporaryDirectory() as tmp:
            export_dir = Path(tmp) / "exports"
            export_dir.mkdir()
            exported = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "rxnflow.cli",
                    "fixture",
                    "--json",
                    "--export-format",
                    "png",
                    "--export-dir",
                    str(export_dir),
                ],
                cwd=Path.cwd(),
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(exported.returncode, 0, exported.stderr)
            export_payload = json.loads(exported.stdout)
            artifact_path = Path(export_payload["artifacts"][0]["path"])
            self.assertTrue(artifact_path.is_file())

            project_path = Path(tmp) / "demo"
            created = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "rxnflow.cli",
                    "project",
                    "create",
                    "--json",
                    "--name",
                    "demo",
                    "--location",
                    str(project_path),
                ],
                cwd=Path.cwd(),
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(created.returncode, 0, created.stderr)
            self.assertTrue((project_path / ".rxnflow" / "manifest.json").is_file())

            manifest_open = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "rxnflow.cli",
                    "project",
                    "open",
                    "--json",
                    "--project-path",
                    str(project_path),
                    "--manifest-only",
                ],
                cwd=Path.cwd(),
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(manifest_open.returncode, 0, manifest_open.stderr)
            manifest_open_payload = json.loads(manifest_open.stdout)
            self.assertTrue(manifest_open_payload["ok"])
            self.assertFalse(manifest_open_payload["data"]["load_content"])
            self.assertEqual(manifest_open_payload["data"]["object_count"], 0)

            saved_snapshot = ProjectContentStore().save_snapshot(
                project_path,
                ProjectContentSnapshot(project_id="project-demo"),
            )
            self.assertTrue(saved_snapshot.ok, saved_snapshot.error)
            restored_open = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "rxnflow.cli",
                    "project",
                    "open",
                    "--json",
                    "--project-path",
                    str(project_path),
                ],
                cwd=Path.cwd(),
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(restored_open.returncode, 0, restored_open.stderr)
            restored_open_payload = json.loads(restored_open.stdout)
            self.assertTrue(restored_open_payload["ok"])
            self.assertTrue(restored_open_payload["data"]["load_content"])
            self.assertEqual(restored_open_payload["data"]["command"], "project.open")
            self.assertEqual(restored_open_payload["data"]["project_id"], "project-demo")
            self.assertEqual(restored_open_payload["data"]["graph_count"], 0)

            source_path = Path(tmp) / "h2.xyz"
            source_path.write_text(
                "2\nEnergy = -1.5 Hartree\nH 0 0 0\nH 0 0 0.74\n",
                encoding="utf-8",
            )
            preview = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "rxnflow.cli",
                    "import",
                    "preview",
                    "--json",
                    "--project-path",
                    str(project_path),
                    "--source-path",
                    str(source_path),
                ],
                cwd=Path.cwd(),
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(preview.returncode, 0, preview.stderr)
            preview_payload = json.loads(preview.stdout)
            self.assertEqual(preview_payload["data"]["batch"]["items"][0]["preview"]["parser_id"], "xyz-ase")

        missing = subprocess.run(
            [sys.executable, "-m", "rxnflow.cli", "project", "create", "--json"],
            cwd=Path.cwd(),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("required", missing.stderr)

    def test_web_payload_adapter_and_scope_guard(self) -> None:
        response = handle_platform_payload({"command": "fixture.run", "args": {}})
        json.dumps(response)
        self.assertTrue(response["ok"])
        self.assertEqual(response["data"]["profile"]["id"], "profile-a-b-electronic")

        bad_args = handle_platform_payload({"command": "fixture.run", "args": []})  # type: ignore[arg-type]
        self.assertFalse(bad_args["ok"])
        self.assertEqual(bad_args["error"]["target"], "args")

        sources = "\n".join(
            Path(path).read_text(encoding="utf-8")
            for path in ("rxnflow/platform.py", "rxnflow/cli.py")
        ).lower()
        for forbidden in (
            "next.js",
            "react-dom",
            "from react",
            "vercel",
            "fastapi",
            "flask",
            "django",
            "electron-builder",
            "from electron",
            "import electron",
            "tauri",
            "swiftui",
            "qt",
            "sqlite",
            "sqlalchemy",
            "auth",
            "subprocess",
        ):
            self.assertNotIn(forbidden, sources)
        self.assertNotIn("ProjectResource(", sources)
        self.assertNotIn("GraphPatch", sources)
        self.assertNotIn("CSV", sources.upper())
        cli_source = Path("rxnflow/cli.py").read_text(encoding="utf-8").lower()
        self.assertNotIn("save-content", cli_source)
        self.assertNotIn("save_content", cli_source)


class _NoParserRegistry:
    def parse(self, *_args: object, **_kwargs: object) -> object:
        raise AssertionError("project.open/save_content must not parse raw files")


class _NoEnergyEngine:
    def compute_profile(self, *_args: object, **_kwargs: object) -> object:
        raise AssertionError("project.open/save_content must not recompute energy profiles")


class _NoExportService:
    def export(self, *_args: object, **_kwargs: object) -> object:
        raise AssertionError("project.open/save_content must not export reports")


class _RestoreOnlyImportWorkflow:
    def __init__(self, wrapped: object) -> None:
        self._wrapped = wrapped

    def restore_batches(self, *args: object, **kwargs: object) -> object:
        return self._wrapped.restore_batches(*args, **kwargs)  # type: ignore[attr-defined]

    def list_batches(self, *args: object, **kwargs: object) -> object:
        return self._wrapped.list_batches(*args, **kwargs)  # type: ignore[attr-defined]

    def get_batch(self, *args: object, **kwargs: object) -> object:
        return self._wrapped.get_batch(*args, **kwargs)  # type: ignore[attr-defined]

    def import_files(self, *_args: object, **_kwargs: object) -> object:
        raise AssertionError("project.open/save_content must not import raw files")

    def confirm_import(self, *_args: object, **_kwargs: object) -> object:
        raise AssertionError("project.open/save_content must not confirm imports")


if __name__ == "__main__":
    unittest.main()
