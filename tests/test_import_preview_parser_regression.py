from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from rxnflow.import_workflow import ImportFileRequest, ImportRegistryWorkflow
from rxnflow.parsers import ParserRegistry
from rxnflow.platform import AppKernel, PlatformShellService, ShellCommand
from rxnflow.project import ProjectStore
from rxnflow.registry import ChemicalRegistry

from tests.parser_fixture_harness import load_parser_fixture_manifest


FIXTURE_MANIFEST = Path("tests/fixtures/parsers/manifest.yaml")


class ImportPreviewParserRegressionTest(unittest.TestCase):
    def test_workflow_preview_preserves_parser_fixture_snapshot_fields(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        for fixture in manifest.executable_fixtures():
            with self.subTest(fixture=fixture.id), TemporaryDirectory() as tmp:
                expected = _snapshot(fixture.expected_snapshot)
                registry = ChemicalRegistry()
                workflow = _workflow(registry)
                project_path = _create_project(tmp, fixture.id)

                imported = workflow.import_files(
                    project_path,
                    (ImportFileRequest(fixture.file, fixture.parse_options),),
                )

                self.assertTrue(imported.ok, imported.error)
                batch = imported.value
                assert batch is not None
                item = batch.items[0]
                self.assertEqual(item.status, "needs_confirmation", fixture.id)
                self.assertIsNotNone(item.raw_resource, fixture.id)
                self.assertIsNotNone(item.preview, fixture.id)
                assert item.raw_resource is not None
                assert item.preview is not None
                self.assertTrue((project_path / item.raw_resource.path).is_file())

                self.assertEqual(item.preview.parser_id, expected["provenance"]["parser_id"])
                self.assertEqual(item.preview.parser_version, expected["provenance"]["parser_version"])
                self.assertEqual(item.preview.parser_id, item.preview.parse_result.provenance.parser_id)
                self.assertEqual(
                    item.preview.parser_version,
                    item.preview.parse_result.provenance.parser_version,
                )
                self.assertEqual(item.preview.object_count, expected["object_count"])
                self.assertEqual(item.preview.object_count, len(item.preview.parse_result.objects))
                self.assertEqual(_warning_codes(item.preview.warnings), expected["warning_codes"])
                self.assertEqual(_warning_codes(item.warnings), expected["warning_codes"])
                self.assertEqual(item.preview.raw_resource_id, item.raw_resource.id)
                self.assertEqual(
                    item.preview.parse_result.provenance.source_file_id,
                    item.raw_resource.id,
                )

                objects = registry.list_objects(batch.project_id)
                self.assertTrue(objects.ok, objects.error)
                self.assertEqual(objects.value, ())

    def test_workflow_preview_preserves_expected_parser_failure(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        fixture = _fixture_by_id(manifest, "xyz-bad-atom-count")
        expected = _snapshot(fixture.expected_snapshot)
        registry = ChemicalRegistry()
        workflow = _workflow(registry)

        with TemporaryDirectory() as tmp:
            project_path = _create_project(tmp, fixture.id)

            imported = workflow.import_files(
                project_path,
                (ImportFileRequest(fixture.file, fixture.parse_options),),
            )

            self.assertTrue(imported.ok, imported.error)
            batch = imported.value
            assert batch is not None
            item = batch.items[0]
            self.assertEqual(item.status, "failed")
            self.assertIsNotNone(item.raw_resource)
            assert item.raw_resource is not None
            self.assertTrue((project_path / item.raw_resource.path).is_file())
            self.assertIsNone(item.preview)
            self.assertIsNotNone(item.error)
            assert item.error is not None
            self.assertEqual(item.error.code, expected["error"]["code"])
            self.assertEqual(_warning_codes(item.warnings), expected["warning_codes"])

            objects = registry.list_objects(batch.project_id)
            self.assertTrue(objects.ok, objects.error)
            self.assertEqual(objects.value, ())

    def test_platform_shell_import_preview_projects_executable_fixture_snapshots(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        for fixture in manifest.executable_fixtures():
            with self.subTest(fixture=fixture.id), TemporaryDirectory() as tmp:
                expected = _snapshot(fixture.expected_snapshot)
                kernel = AppKernel(
                    chemical_registry=_PreviewOnlyRegistry(),
                    graph_service=_NoGraphService(),
                    energy_engine=_NoEnergyEngine(),
                    export_service=_NoExportService(),
                    bundle_service=_NoBundleService(),
                )
                service = PlatformShellService(kernel)
                project_path = Path(tmp) / f"{fixture.id}.rxnflow"
                created = service.run(
                    ShellCommand("project.create", {"name": fixture.id, "location": str(project_path)})
                )
                self.assertTrue(created.ok, created.error)
                session_id = created.to_dict()["data"]["session_id"]

                preview = service.run(
                    ShellCommand(
                        "import.preview",
                        {
                            "session_id": session_id,
                            "source_path": str(fixture.file),
                        },
                    )
                )

                self.assertTrue(preview.ok, preview.error)
                payload = preview.to_dict()
                json.dumps(payload)
                items = payload["data"]["batch"]["items"]
                self.assertEqual(len(items), 1)
                item = items[0]
                self.assertEqual(item["status"], "needs_confirmation")
                self.assertIsNone(item["error"])
                self.assertEqual(item["registered_object_ids"], [])

                raw_resource = item["raw_resource"]
                self.assertIsNotNone(raw_resource)
                self.assertEqual(raw_resource["kind"], "raw_file")
                self.assertTrue(raw_resource["path"])
                self.assertTrue(raw_resource["checksum"].startswith("sha256:"))
                self.assertTrue((project_path / raw_resource["path"]).is_file())

                preview_summary = item["preview"]
                self.assertIsNotNone(preview_summary)
                self.assertEqual(preview_summary["raw_resource_id"], raw_resource["id"])
                self.assertEqual(preview_summary["parser_id"], expected["provenance"]["parser_id"])
                self.assertEqual(
                    preview_summary["parser_version"],
                    expected["provenance"]["parser_version"],
                )
                self.assertEqual(preview_summary["object_count"], expected["object_count"])
                self.assertEqual(_payload_warning_codes(preview_summary["warnings"]), expected["warning_codes"])
                self.assertEqual(_payload_warning_codes(item["warnings"]), expected["warning_codes"])

                state = kernel.get_session_state(session_id)
                self.assertIsNotNone(state)
                assert state is not None
                self.assertEqual(state.objects, ())

    def test_platform_shell_import_preview_projects_expected_failure(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        failure = _fixture_by_id(manifest, "xyz-bad-atom-count")
        expected = _snapshot(failure.expected_snapshot)
        kernel = AppKernel(
            chemical_registry=_PreviewOnlyRegistry(),
            graph_service=_NoGraphService(),
            energy_engine=_NoEnergyEngine(),
            export_service=_NoExportService(),
            bundle_service=_NoBundleService(),
        )
        service = PlatformShellService(kernel)

        with TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "shell-preview-failure.rxnflow"
            created = service.run(
                ShellCommand("project.create", {"name": "shell-preview-failure", "location": str(project_path)})
            )
            self.assertTrue(created.ok, created.error)
            session_id = created.to_dict()["data"]["session_id"]

            preview = service.run(
                ShellCommand(
                    "import.preview",
                    {
                        "session_id": session_id,
                        "source_path": str(failure.file),
                    },
                )
            )

            self.assertTrue(preview.ok, preview.error)
            payload = preview.to_dict()
            json.dumps(payload)
            items = payload["data"]["batch"]["items"]
            self.assertEqual(len(items), 1)
            item = items[0]
            self.assertEqual(item["status"], "failed")
            self.assertIsNone(item["preview"])
            self.assertEqual(item["error"]["code"], expected["error"]["code"])
            self.assertEqual(_payload_warning_codes(item["warnings"]), expected["warning_codes"])
            raw_resource = item["raw_resource"]
            self.assertIsNotNone(raw_resource)
            self.assertEqual(raw_resource["kind"], "raw_file")
            self.assertTrue((project_path / raw_resource["path"]).is_file())

            state = kernel.get_session_state(session_id)
            self.assertIsNotNone(state)
            assert state is not None
            self.assertEqual(state.objects, ())

            missing_source = service.run(ShellCommand("import.preview", {"session_id": session_id}))
            self.assertFalse(missing_source.ok)
            self.assertEqual(missing_source.error["code"], "invalid_input")  # type: ignore[index]

            missing_session = service.run(
                ShellCommand("import.preview", {"session_id": "missing", "source_path": str(failure.file)})
            )
            self.assertFalse(missing_session.ok)
            self.assertEqual(missing_session.error["code"], "invalid_input")  # type: ignore[index]

    def test_scope_guard_keeps_regression_preview_only(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        self.assertEqual(
            {fixture.id for fixture in manifest.fixtures},
            {
                "maple-sp-synthetic-minimal",
                "maple-opt-synthetic-minimal",
                "maple-sp-public-shape-synthetic-derived",
                "maple-opt-final-xyz-public-shape-synthetic-derived",
                "maple-irc-path-synthetic-minimal",
                "maple-path-family-synthetic-derived",
                "xyz-water-geometry-missing-energy",
                "extxyz-h2-energy-charge-spin",
                "extxyz-h2-missing-energy",
                "extxyz-multiframe-metadata-calculator-energy",
                "gaussian-sp-water-synthetic-minimal",
                "gaussian-sp-public-shape-synthetic-derived",
                "orca-sp-water-synthetic-minimal",
                "orca-sp-public-shape-synthetic-derived",
                "xyz-bad-atom-count",
            },
        )
        fixture = _fixture_by_id(manifest, "xyz-water-geometry-missing-energy")
        registry = _PreviewOnlyRegistry()
        workflow = _workflow(registry)

        with TemporaryDirectory() as tmp:
            project_path = _create_project(tmp, fixture.id)
            imported = workflow.import_files(
                project_path,
                (ImportFileRequest(fixture.file, fixture.parse_options),),
            )

            self.assertTrue(imported.ok, imported.error)
            batch = imported.value
            assert batch is not None
            objects = registry.list_objects(batch.project_id)
            self.assertTrue(objects.ok, objects.error)
            self.assertEqual(objects.value, ())

        kernel = AppKernel(
            chemical_registry=_PreviewOnlyRegistry(),
            graph_service=_NoGraphService(),
            energy_engine=_NoEnergyEngine(),
            export_service=_NoExportService(),
            bundle_service=_NoBundleService(),
        )
        service = PlatformShellService(kernel)
        with TemporaryDirectory() as tmp:
            project_path = Path(tmp) / "scope-preview.rxnflow"
            created = service.run(
                ShellCommand("project.create", {"name": "scope-preview", "location": str(project_path)})
            )
            self.assertTrue(created.ok, created.error)
            preview = service.run(
                ShellCommand(
                    "import.preview",
                    {
                        "session_id": created.to_dict()["data"]["session_id"],
                        "source_path": str(fixture.file),
                    },
                )
            )
            self.assertTrue(preview.ok, preview.error)


def _workflow(registry: ChemicalRegistry) -> ImportRegistryWorkflow:
    return ImportRegistryWorkflow(
        ProjectStore(),
        ParserRegistry.default(),
        registry,
    )


def _create_project(tmp: str, fixture_id: str) -> Path:
    project_path = Path(tmp) / f"{fixture_id}.rxnflow"
    created = ProjectStore().create_project(fixture_id, project_path)
    assert created.ok
    return project_path


def _snapshot(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _fixture_by_id(manifest: object, fixture_id: str) -> object:
    for fixture in manifest.fixtures:  # type: ignore[attr-defined]
        if fixture.id == fixture_id:
            return fixture
    raise AssertionError(f"Fixture not found: {fixture_id}")


def _warning_codes(warnings: tuple[object, ...]) -> list[str]:
    return sorted(warning.code for warning in warnings)  # type: ignore[attr-defined]


def _payload_warning_codes(warnings: list[dict[str, object]]) -> list[str]:
    return sorted(str(warning["code"]) for warning in warnings)


class _PreviewOnlyRegistry(ChemicalRegistry):
    def register(self, project_id: str, parse_result: object) -> object:
        raise AssertionError("Import preview regression must not register chemical objects.")


class _NoGraphService:
    def __getattr__(self, name: str) -> object:
        raise AssertionError(f"Import preview regression must not use graph service: {name}")


class _NoEnergyEngine:
    def compute_profile(self, *args: object, **kwargs: object) -> object:
        raise AssertionError("Import preview regression must not compute energy profiles.")


class _NoExportService:
    def export(self, *args: object, **kwargs: object) -> object:
        raise AssertionError("Import preview regression must not export reports.")


class _NoBundleService:
    def export_bundle(self, *args: object, **kwargs: object) -> object:
        raise AssertionError("Import preview regression must not export project bundles.")

    def import_bundle(self, *args: object, **kwargs: object) -> object:
        raise AssertionError("Import preview regression must not import project bundles.")


if __name__ == "__main__":
    unittest.main()
