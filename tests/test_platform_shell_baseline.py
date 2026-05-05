from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

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

    def test_session_import_workspace_energy_and_profile_export(self) -> None:
        service = PlatformShellService(AppKernel())

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


if __name__ == "__main__":
    unittest.main()
