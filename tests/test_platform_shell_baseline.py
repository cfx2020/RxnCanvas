from __future__ import annotations

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
                        "export_formats": ("png", "xlsx"),
                        "destination_dir": str(export_dir),
                        "basename": "fixture",
                    },
                )
            )
            self.assertTrue(fixture.ok, fixture.error)
            payload = fixture.to_dict()
            json.dumps(payload)
            self.assertEqual([artifact["format"] for artifact in payload["artifacts"]], ["png", "xlsx"])
            self.assertTrue(Path(payload["artifacts"][0]["path"]).is_file())
            self.assertTrue(Path(payload["artifacts"][1]["path"]).is_file())
            self.assertIsNone(payload["artifacts"][0]["bytes_base64"])
            self.assertEqual(payload["artifacts"][0]["metadata"]["profile_id"], "profile-a-b-electronic")

            inline = service.run(
                ShellCommand(
                    "fixture.run",
                    {"export_formats": ("png",), "include_bytes": True},
                )
            )
            self.assertTrue(inline.ok, inline.error)
            inline_artifact = inline.to_dict()["artifacts"][0]
            self.assertIsNotNone(inline_artifact["bytes_base64"])
            self.assertEqual(inline_artifact["metadata"]["encoding"], "base64")

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
            self.assertEqual(profile_payload["data"]["profile"]["points"][0]["relative_energy"]["value"], 0.0)

            export = service.run(
                ShellCommand(
                    "export.profile",
                    {"session_id": session_id, "formats": ("cdxml",), "include_bytes": True},
                )
            )
            self.assertTrue(export.ok, export.error)
            artifact = export.to_dict()["artifacts"][0]
            self.assertEqual(artifact["format"], "cdxml")
            self.assertIsNotNone(artifact["bytes_base64"])
            self.assertEqual(artifact["metadata"]["encoding"], "base64")

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
            self.assertEqual([item.id for item in state.artifacts], [artifact["id"], outside_export.to_dict()["artifacts"][0]["id"]])
            self.assertEqual([item.id for item in state.export_artifact_records], [persisted_artifact["id"]])

            missing_energy = PlatformShellService(AppKernel()).run(
                ShellCommand("energy.compute", {"session_id": "missing"})
            )
            self.assertFalse(missing_energy.ok)
            self.assertEqual(missing_energy.error["target"], "session_id")  # type: ignore[index]

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
        self.assertNotIn("project.export_bundle", sources)
        self.assertNotIn("project.import_bundle", sources)
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
