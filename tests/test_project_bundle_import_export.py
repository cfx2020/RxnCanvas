from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
import zipfile

from rxnflow.content_store import CHEMICAL_OBJECTS_PATH, ProjectContentStore, project_content_snapshot_from_fixture
from rxnflow.fixture import run_core_fixture_vertical_slice
from rxnflow.platform import PlatformShellService, ShellCommand
from rxnflow.project import ProjectStore
from rxnflow.project_bundle import BUNDLE_SUFFIX, ProjectBundleService


class ProjectBundleImportExportTest(unittest.TestCase):
    def test_export_import_roundtrip_restores_project_content(self) -> None:
        with TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            project = workspace / "fixture-minimal-reaction.rxnflow"
            bundle = workspace / f"fixture-minimal-reaction{BUNDLE_SUFFIX}"
            imported_parent = workspace / "imported"
            imported_parent.mkdir()
            self._create_fixture_project(project)
            (project / "exports").mkdir()
            (project / "exports" / "plot.png").write_bytes(b"png")
            (project / "notes.txt").write_text("not part of bundle", encoding="utf-8")
            (project / ".DS_Store").write_bytes(b"mac metadata")
            (project / "inputs" / "raw" / ".DS_Store").write_bytes(b"mac metadata")

            service = ProjectBundleService()
            exported = service.export_bundle(project, bundle)

            self.assertTrue(exported.ok, exported.error)
            assert exported.value is not None
            self.assertEqual(exported.value.project_path, str(project))
            self.assertEqual(exported.value.root_name, project.name)
            self.assertTrue(exported.value.checksum.startswith("sha256:"))
            self.assertEqual(exported.value.validation_summary["checked"], True)
            self.assertEqual({warning.code for warning in exported.warnings}, {"source_file_missing"})
            with zipfile.ZipFile(bundle) as archive:
                names = set(archive.namelist())
            self.assertIn(f"{project.name}/.rxnflow/manifest.json", names)
            self.assertIn(f"{project.name}/.rxnflow/state/project-content.json", names)
            self.assertIn(f"{project.name}/exports/plot.png", names)
            self.assertNotIn(f"{project.name}/notes.txt", names)
            self.assertNotIn(f"{project.name}/.DS_Store", names)
            self.assertNotIn(f"{project.name}/inputs/raw/.DS_Store", names)
            self.assertTrue(all(name.startswith(f"{project.name}/") for name in names))

            imported = service.import_bundle(bundle, imported_parent)

            self.assertTrue(imported.ok, imported.error)
            assert imported.value is not None
            imported_project = imported_parent / project.name
            self.assertEqual(imported.value.project_path, str(imported_project))
            self.assertEqual(imported.value.project_id, "project-fixture-minimal-reaction")
            self.assertTrue((imported_project / ".rxnflow" / "manifest.json").is_file())
            self.assertTrue((imported_project / "exports" / "plot.png").is_file())
            loaded = ProjectStore().load_project(imported_project)
            snapshot = ProjectContentStore().load_snapshot(imported_project)
            self.assertTrue(loaded.ok, loaded.error)
            self.assertTrue(snapshot.ok, snapshot.error)
            assert snapshot.value is not None
            self.assertEqual(snapshot.value.project_id, "project-fixture-minimal-reaction")
            self.assertEqual(len(snapshot.value.chemical_objects), 2)
            self.assertEqual(len(snapshot.value.reaction_graphs), 1)
            self.assertEqual(len(snapshot.value.workspaces), 1)
            self.assertEqual(len(snapshot.value.energy_profiles), 1)

    def test_manifest_only_project_can_export_import_without_content_validation(self) -> None:
        with TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            project = workspace / "demo.rxnflow"
            bundle = workspace / f"demo{BUNDLE_SUFFIX}"
            imported_parent = workspace / "imported"
            imported_parent.mkdir()
            self.assertTrue(ProjectStore().create_project("demo", project).ok)

            service = ProjectBundleService()
            exported = service.export_bundle(project, bundle)
            imported = service.import_bundle(bundle, imported_parent)

            self.assertTrue(exported.ok, exported.error)
            assert exported.value is not None
            self.assertEqual(exported.value.validation_summary["checked"], False)
            self.assertTrue(imported.ok, imported.error)
            assert imported.value is not None
            self.assertEqual(imported.value.validation_summary["checked"], False)
            self.assertTrue((imported_parent / project.name / ".rxnflow" / "manifest.json").is_file())

    def test_export_is_stable_for_same_project_bytes(self) -> None:
        with TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            project = workspace / "demo.rxnflow"
            first = workspace / f"first{BUNDLE_SUFFIX}"
            second = workspace / f"second{BUNDLE_SUFFIX}"
            self.assertTrue(ProjectStore().create_project("demo", project).ok)
            (project / "exports").mkdir()
            (project / "exports" / "report.txt").write_text("report", encoding="utf-8")

            service = ProjectBundleService()
            first_result = service.export_bundle(project, first)
            second_result = service.export_bundle(project, second)

            self.assertTrue(first_result.ok, first_result.error)
            self.assertTrue(second_result.ok, second_result.error)
            assert first_result.value is not None
            assert second_result.value is not None
            self.assertEqual(first_result.value.checksum, second_result.value.checksum)
            self.assertEqual(first.read_bytes(), second.read_bytes())

    def test_export_rejects_invalid_project_content_without_final_bundle(self) -> None:
        with TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            project = workspace / "demo.rxnflow"
            bundle = workspace / f"demo{BUNDLE_SUFFIX}"
            self.assertTrue(ProjectStore().create_project("demo", project).ok)
            saved = ProjectContentStore().save_snapshot(project, project_content_snapshot_from_fixture(run_core_fixture_vertical_slice().value))  # type: ignore[arg-type]
            self.assertTrue(saved.ok, saved.error)
            (project / CHEMICAL_OBJECTS_PATH).unlink()

            exported = ProjectBundleService().export_bundle(project, bundle)

            self.assertFalse(exported.ok)
            self.assertIsNotNone(exported.error)
            assert exported.error is not None
            self.assertEqual(exported.error.code, "project_content_invalid")
            self.assertFalse(bundle.exists())

    def test_import_rejects_unsafe_bundle_paths_without_writing_project(self) -> None:
        unsafe_entries = {
            "traversal": ("demo/.rxnflow/manifest.json", "../escape.txt"),
            "absolute": ("demo/.rxnflow/manifest.json", "/absolute.txt"),
            "backslash": ("demo/.rxnflow/manifest.json", "demo\\evil.txt"),
            "multi_root": ("demo/.rxnflow/manifest.json", "other/.rxnflow/manifest.json"),
            "macosx": ("__MACOSX/._manifest",),
            "root_file": ("demo",),
            "outside_allowed_roots": ("demo/.rxnflow/manifest.json", "demo/notes.txt"),
        }

        for name, entries in unsafe_entries.items():
            with self.subTest(name=name), TemporaryDirectory() as tmp:
                workspace = Path(tmp)
                bundle = workspace / f"bad{BUNDLE_SUFFIX}"
                destination = workspace / "imported"
                destination.mkdir()
                self._write_bundle(bundle, {entry: b"bad" for entry in entries})

                imported = ProjectBundleService().import_bundle(bundle, destination)

                self.assertFalse(imported.ok)
                self.assertIsNotNone(imported.error)
                assert imported.error is not None
                self.assertEqual(imported.error.code, "invalid_bundle")
                self.assertEqual(list(destination.iterdir()), [])

    def test_import_rejects_missing_manifest_existing_destination_and_policy(self) -> None:
        with TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            bundle = workspace / f"demo{BUNDLE_SUFFIX}"
            destination = workspace / "imported"
            destination.mkdir()
            self._write_bundle(bundle, {"demo/exports/report.txt": b"report"})

            missing_manifest = ProjectBundleService().import_bundle(bundle, destination)

            self.assertFalse(missing_manifest.ok)
            self.assertIsNotNone(missing_manifest.error)
            assert missing_manifest.error is not None
            self.assertEqual(missing_manifest.error.code, "invalid_bundle")

        with TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            project = workspace / "demo.rxnflow"
            bundle = workspace / f"demo{BUNDLE_SUFFIX}"
            destination = workspace / "imported"
            destination.mkdir()
            self.assertTrue(ProjectStore().create_project("demo", project).ok)
            self.assertTrue(ProjectBundleService().export_bundle(project, bundle).ok)
            (destination / project.name).mkdir()

            conflict = ProjectBundleService().import_bundle(bundle, destination)
            unsupported_policy = ProjectBundleService().import_bundle(bundle, destination, "overwrite")

            self.assertFalse(conflict.ok)
            assert conflict.error is not None
            self.assertEqual(conflict.error.code, "invalid_input")
            self.assertFalse(unsupported_policy.ok)
            assert unsupported_policy.error is not None
            self.assertEqual(unsupported_policy.error.target, "conflict_policy")

    def test_import_rejects_content_validation_errors_and_cleans_temp_project(self) -> None:
        with TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            project = workspace / "demo.rxnflow"
            bundle = workspace / f"demo{BUNDLE_SUFFIX}"
            destination = workspace / "imported"
            destination.mkdir()
            self.assertTrue(ProjectStore().create_project("demo", project).ok)
            saved = ProjectContentStore().save_snapshot(project, project_content_snapshot_from_fixture(run_core_fixture_vertical_slice().value))  # type: ignore[arg-type]
            self.assertTrue(saved.ok, saved.error)
            chemical_path = project / CHEMICAL_OBJECTS_PATH
            payload = json.loads(chemical_path.read_text(encoding="utf-8"))
            payload["objects"] = "bad"
            chemical_path.write_text(json.dumps(payload), encoding="utf-8")
            self._zip_project(project, bundle)

            imported = ProjectBundleService().import_bundle(bundle, destination)

            self.assertFalse(imported.ok)
            self.assertIsNotNone(imported.error)
            assert imported.error is not None
            self.assertEqual(imported.error.code, "project_content_invalid")
            self.assertFalse((destination / project.name).exists())

    def test_platform_shell_project_bundle_commands_are_json_safe(self) -> None:
        with TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            project = workspace / "demo.rxnflow"
            bundle = workspace / f"demo{BUNDLE_SUFFIX}"
            imported_parent = workspace / "imported"
            imported_parent.mkdir()
            self.assertTrue(ProjectStore().create_project("demo", project).ok)
            service = PlatformShellService()

            exported = service.run(
                ShellCommand(
                    "project.export_bundle",
                    {"project_path": str(project), "destination_path": str(bundle)},
                )
            )
            imported = service.run(
                ShellCommand(
                    "project.import_bundle",
                    {"bundle_path": str(bundle), "destination_dir": str(imported_parent)},
                )
            )
            missing = service.run(ShellCommand("project.export_bundle", {"project_path": str(project)}))

            exported_payload = exported.to_dict()
            imported_payload = imported.to_dict()
            json.dumps(exported_payload)
            json.dumps(imported_payload)
            self.assertTrue(exported.ok, exported.error)
            self.assertEqual(exported_payload["data"]["command"], "project.export_bundle")
            self.assertEqual(exported_payload["data"]["bundle"]["project_id"], "project-demo")
            self.assertTrue(imported.ok, imported.error)
            self.assertEqual(imported_payload["data"]["command"], "project.import_bundle")
            self.assertEqual(imported_payload["data"]["bundle"]["project_path"], str(imported_parent / project.name))
            self.assertFalse(missing.ok)
            self.assertEqual(missing.error["target"], "destination_path")

    def test_cli_project_bundle_commands_emit_json_and_exit_codes(self) -> None:
        with TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            project = workspace / "demo.rxnflow"
            bundle = workspace / f"demo{BUNDLE_SUFFIX}"
            imported_parent = workspace / "imported"
            imported_parent.mkdir()
            self.assertTrue(ProjectStore().create_project("demo", project).ok)

            exported = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "rxnflow.cli",
                    "project",
                    "export-bundle",
                    "--json",
                    "--project-path",
                    str(project),
                    "--destination-path",
                    str(bundle),
                ],
                cwd=Path.cwd(),
                text=True,
                capture_output=True,
                check=False,
            )
            imported = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "rxnflow.cli",
                    "project",
                    "import-bundle",
                    "--json",
                    "--bundle-path",
                    str(bundle),
                    "--destination-dir",
                    str(imported_parent),
                ],
                cwd=Path.cwd(),
                text=True,
                capture_output=True,
                check=False,
            )
            conflict = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "rxnflow.cli",
                    "project",
                    "import-bundle",
                    "--json",
                    "--bundle-path",
                    str(bundle),
                    "--destination-dir",
                    str(imported_parent),
                ],
                cwd=Path.cwd(),
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(exported.returncode, 0, exported.stderr)
            exported_payload = json.loads(exported.stdout)
            self.assertEqual(exported_payload["data"]["command"], "project.export_bundle")
            self.assertEqual(exported_payload["data"]["bundle"]["project_id"], "project-demo")
            self.assertEqual(imported.returncode, 0, imported.stderr)
            imported_payload = json.loads(imported.stdout)
            self.assertEqual(imported_payload["data"]["command"], "project.import_bundle")
            self.assertTrue((imported_parent / project.name / ".rxnflow" / "manifest.json").is_file())
            self.assertNotEqual(conflict.returncode, 0)
            conflict_payload = json.loads(conflict.stdout)
            self.assertFalse(conflict_payload["ok"])
            self.assertEqual(conflict_payload["error"]["target"], "destination_dir")

    def _create_fixture_project(self, project: Path) -> None:
        fixture = run_core_fixture_vertical_slice()
        self.assertTrue(fixture.ok, fixture.error)
        assert fixture.value is not None
        created = ProjectStore().create_project("fixture-minimal-reaction", project)
        self.assertTrue(created.ok, created.error)
        saved = ProjectContentStore().save_snapshot(project, project_content_snapshot_from_fixture(fixture.value))
        self.assertTrue(saved.ok, saved.error)

    def _write_bundle(self, bundle: Path, entries: dict[str, bytes]) -> None:
        with zipfile.ZipFile(bundle, "w") as archive:
            for name, payload in entries.items():
                archive.writestr(name, payload)

    def _zip_project(self, project: Path, bundle: Path) -> None:
        with zipfile.ZipFile(bundle, "w") as archive:
            for path in sorted(item for item in project.rglob("*") if item.is_file()):
                archive.write(path, f"{project.name}/{path.relative_to(project).as_posix()}")


if __name__ == "__main__":
    unittest.main()
