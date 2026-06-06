from __future__ import annotations

import inspect
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from rxnflow.import_workflow import ImportFileRequest, ImportRegistryWorkflow
from rxnflow.parsers import ParserRegistry
from rxnflow.platform import AppKernel, PlatformShellService, ShellCommand
from rxnflow.project import ProjectStore
from rxnflow.registry import ChemicalRegistry

from tests.parser_fixture_harness import (
    load_parser_fixture_manifest,
    load_parser_public_fixture_decisions,
    load_parser_source_inventory,
    load_parser_support_matrix,
    summarize_parser_public_fixture_promotion,
)


FIXTURE_MANIFEST = Path("tests/fixtures/parsers/manifest.yaml")
PUBLIC_FIXTURE_DECISIONS = Path("tests/fixtures/parsers/public-fixture-decisions.yaml")
SOURCE_INVENTORY = Path("tests/fixtures/parsers/sources.yaml")
SUPPORT_MATRIX = Path("tests/fixtures/parsers/support-matrix.yaml")


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
                    (ImportFileRequest(fixture.file, fixture.parse_options, retain_raw=True),),
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
                (ImportFileRequest(fixture.file, fixture.parse_options, retain_raw=True),),
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
                            "retain_raw": True,
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
                        "retain_raw": True,
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

    def test_promoted_preview_fixtures_are_selected_from_promotion_adapter(self) -> None:
        helper_source = inspect.getsource(_promoted_preview_fixtures)
        self.assertIn("summarize_parser_public_fixture_promotion", helper_source)
        self.assertNotIn("extxyz-h2-energy-charge-spin", helper_source)

        fixtures = _promoted_preview_fixtures()
        self.assertEqual(
            {fixture.id for fixture in fixtures},
            {
                "extxyz-h2-energy-charge-spin",
                "extxyz-h2-missing-energy",
                "extxyz-multiframe-metadata-calculator-energy",
                "extxyz-lattice-forces-stress",
            },
        )

        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        summary = _promotion_summary(manifest)
        self.assertEqual(summary.unresolved_decision_ids, ())
        self.assertEqual(summary.unresolved_fixture_ids, ())

    def test_workflow_preview_preserves_promoted_public_fixture_projection(self) -> None:
        for fixture in _promoted_preview_fixtures():
            with self.subTest(fixture=fixture.id):
                _assert_workflow_preview_projection(self, fixture)

    def test_platform_shell_import_preview_projects_promoted_public_fixtures(self) -> None:
        for fixture in _promoted_preview_fixtures():
            with self.subTest(fixture=fixture.id):
                _assert_shell_preview_projection(self, fixture)

    def test_promoted_preview_regression_excludes_blocked_and_reference_only_sources(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        summary = _promotion_summary(manifest)
        promoted_fixture_ids = set(summary.covered_fixture_ids)

        self.assertEqual(promoted_fixture_ids, {fixture.id for fixture in _promoted_preview_fixtures()})
        self.assertEqual(summary.source_gated_fixture_ids, ())

        non_executable_file_ids: set[str] = set()
        for source_id in ("maple-dev-example", "cclib-data-gaussian-orca"):
            source = inventory.source_by_id(source_id)
            non_executable_file_ids.update(file.id for file in source.files_by_policy("candidate"))
            non_executable_file_ids.update(file.id for file in source.files_by_policy("reference-only"))

        self.assertTrue(non_executable_file_ids)
        self.assertTrue(non_executable_file_ids.isdisjoint(promoted_fixture_ids))

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
                "extxyz-lattice-forces-stress",
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
                (ImportFileRequest(fixture.file, fixture.parse_options, retain_raw=True),),
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
                        "retain_raw": True,
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


def _promotion_summary(manifest: object) -> object:
    inventory = load_parser_source_inventory(SOURCE_INVENTORY)
    ledger = load_parser_public_fixture_decisions(
        PUBLIC_FIXTURE_DECISIONS,
        source_inventory=inventory,
        manifest=manifest,  # type: ignore[arg-type]
    )
    matrix = load_parser_support_matrix(
        SUPPORT_MATRIX,
        manifest,  # type: ignore[arg-type]
        source_inventory=inventory,
    )
    return summarize_parser_public_fixture_promotion(inventory, ledger, manifest, matrix)  # type: ignore[arg-type]


def _promoted_preview_fixtures() -> tuple[object, ...]:
    manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
    inventory = load_parser_source_inventory(SOURCE_INVENTORY)
    ledger = load_parser_public_fixture_decisions(
        PUBLIC_FIXTURE_DECISIONS,
        source_inventory=inventory,
        manifest=manifest,
    )
    matrix = load_parser_support_matrix(
        SUPPORT_MATRIX,
        manifest,
        source_inventory=inventory,
    )
    summary = summarize_parser_public_fixture_promotion(inventory, ledger, manifest, matrix)
    assert summary.unresolved_decision_ids == ()
    assert summary.unresolved_fixture_ids == ()
    fixture_by_id = {fixture.id: fixture for fixture in manifest.fixtures}
    return tuple(fixture_by_id[fixture_id] for fixture_id in summary.covered_fixture_ids)


def _assert_workflow_preview_projection(test_case: unittest.TestCase, fixture: object) -> None:
    expected = _snapshot(fixture.expected_snapshot)  # type: ignore[attr-defined]
    registry = ChemicalRegistry()
    workflow = _workflow(registry)
    with TemporaryDirectory() as tmp:
        project_path = _create_project(tmp, fixture.id)  # type: ignore[attr-defined]
        imported = workflow.import_files(
            project_path,
            (ImportFileRequest(fixture.file, fixture.parse_options, retain_raw=True),),  # type: ignore[attr-defined]
        )

        test_case.assertTrue(imported.ok, imported.error)
        batch = imported.value
        assert batch is not None
        item = batch.items[0]
        test_case.assertEqual(item.status, "needs_confirmation", fixture.id)  # type: ignore[attr-defined]
        test_case.assertIsNotNone(item.raw_resource, fixture.id)  # type: ignore[attr-defined]
        test_case.assertIsNotNone(item.preview, fixture.id)  # type: ignore[attr-defined]
        assert item.raw_resource is not None
        assert item.preview is not None
        test_case.assertTrue((project_path / item.raw_resource.path).is_file())
        test_case.assertEqual(item.preview.parser_id, expected["provenance"]["parser_id"])  # type: ignore[index]
        test_case.assertEqual(item.preview.parser_version, expected["provenance"]["parser_version"])  # type: ignore[index]
        test_case.assertEqual(item.preview.object_count, expected["object_count"])
        test_case.assertEqual(_warning_codes(item.preview.warnings), expected["warning_codes"])
        test_case.assertEqual(_warning_codes(item.warnings), expected["warning_codes"])
        test_case.assertEqual(item.preview.raw_resource_id, item.raw_resource.id)
        test_case.assertEqual(item.preview.parse_result.provenance.source_file_id, item.raw_resource.id)
        objects = registry.list_objects(batch.project_id)
        test_case.assertTrue(objects.ok, objects.error)
        test_case.assertEqual(objects.value, ())


def _assert_shell_preview_projection(test_case: unittest.TestCase, fixture: object) -> None:
    expected = _snapshot(fixture.expected_snapshot)  # type: ignore[attr-defined]
    kernel = AppKernel(
        chemical_registry=_PreviewOnlyRegistry(),
        graph_service=_NoGraphService(),
        energy_engine=_NoEnergyEngine(),
        export_service=_NoExportService(),
        bundle_service=_NoBundleService(),
    )
    service = PlatformShellService(kernel)
    with TemporaryDirectory() as tmp:
        project_path = Path(tmp) / f"{fixture.id}.rxnflow"  # type: ignore[attr-defined]
        created = service.run(
            ShellCommand("project.create", {"name": fixture.id, "location": str(project_path)})  # type: ignore[attr-defined]
        )
        test_case.assertTrue(created.ok, created.error)
        preview = service.run(
            ShellCommand(
                "import.preview",
                {
                    "session_id": created.to_dict()["data"]["session_id"],
                    "source_path": str(fixture.file),  # type: ignore[attr-defined]
                    "retain_raw": True,
                },
            )
        )

        test_case.assertTrue(preview.ok, preview.error)
        payload = preview.to_dict()
        json.dumps(payload)
        item = payload["data"]["batch"]["items"][0]
        test_case.assertEqual(item["status"], "needs_confirmation")
        test_case.assertIsNone(item["error"])
        test_case.assertEqual(item["registered_object_ids"], [])
        raw_resource = item["raw_resource"]
        test_case.assertIsNotNone(raw_resource)
        test_case.assertEqual(raw_resource["kind"], "raw_file")
        test_case.assertTrue(raw_resource["checksum"].startswith("sha256:"))
        test_case.assertTrue((project_path / raw_resource["path"]).is_file())
        preview_summary = item["preview"]
        test_case.assertIsNotNone(preview_summary)
        test_case.assertEqual(preview_summary["raw_resource_id"], raw_resource["id"])
        test_case.assertEqual(preview_summary["parser_id"], expected["provenance"]["parser_id"])  # type: ignore[index]
        test_case.assertEqual(preview_summary["parser_version"], expected["provenance"]["parser_version"])  # type: ignore[index]
        test_case.assertEqual(preview_summary["object_count"], expected["object_count"])
        test_case.assertEqual(_payload_warning_codes(preview_summary["warnings"]), expected["warning_codes"])
        test_case.assertEqual(_payload_warning_codes(item["warnings"]), expected["warning_codes"])
        state = kernel.get_session_state(created.to_dict()["data"]["session_id"])
        test_case.assertIsNotNone(state)
        assert state is not None
        test_case.assertEqual(state.objects, ())


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
