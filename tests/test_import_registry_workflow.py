from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from rxnflow import run_core_fixture_vertical_slice
from rxnflow.energy import EnergyProfileEngine
from rxnflow.import_workflow import (
    ImportFileRequest,
    ImportRegistryWorkflow,
    ImportSelection,
)
from rxnflow.parsers import ParserRegistry
from rxnflow.project import ProjectStore
from rxnflow.registry import ChemicalRegistry


class ImportRegistryWorkflowTest(unittest.TestCase):
    def test_import_single_file_creates_parse_preview_and_confirm_registers_object(self) -> None:
        with TemporaryDirectory() as tmp:
            root, source = _project_with_xyz(tmp)
            registry = ChemicalRegistry()
            workflow = _workflow(registry)

            batch = workflow.import_files(root, (ImportFileRequest(source),))

            self.assertTrue(batch.ok, batch.error)
            imported = batch.value
            assert imported is not None
            item = imported.items[0]
            self.assertEqual(item.status, "needs_confirmation")
            self.assertIsNotNone(item.raw_resource)
            self.assertIsNotNone(item.preview)
            assert item.preview is not None
            self.assertEqual(item.preview.object_count, 1)
            self.assertEqual(item.preview.parser_id, "xyz-ase")
            self.assertIn("missing_section", {warning.code for warning in item.warnings})
            self.assertTrue((root / item.raw_resource.path).is_file())  # type: ignore[union-attr]

            confirmed = workflow.confirm_import(
                imported.project_id,
                imported.id,
                (ImportSelection(item.id),),
            )

            self.assertTrue(confirmed.ok, confirmed.error)
            registered_item = confirmed.value.items[0]  # type: ignore[union-attr]
            self.assertEqual(registered_item.status, "registered")
            self.assertEqual(len(registered_item.registered_object_ids), 1)
            lookup = registry.get_object(imported.project_id, registered_item.registered_object_ids[0])
            self.assertTrue(lookup.ok, lookup.error)
            self.assertEqual(lookup.value.label, "water")

    def test_batch_import_allows_partial_parse_failure(self) -> None:
        with TemporaryDirectory() as tmp:
            root, good = _project_with_xyz(tmp)
            bad = Path(tmp) / "note.txt"
            bad.write_text("not a chemistry output", encoding="utf-8")
            workflow = _workflow()

            batch = workflow.import_files(root, (ImportFileRequest(good), ImportFileRequest(bad)))

            self.assertTrue(batch.ok, batch.error)
            items = batch.value.items  # type: ignore[union-attr]
            self.assertEqual([item.status for item in items], ["needs_confirmation", "failed"])
            self.assertIsNotNone(items[1].error)
            assert items[1].error is not None
            self.assertEqual(items[1].error.code, "unsupported_format")
            self.assertIsNotNone(items[1].raw_resource)

    def test_missing_source_file_fails_item_and_continues_batch(self) -> None:
        with TemporaryDirectory() as tmp:
            root, good = _project_with_xyz(tmp)
            missing = Path(tmp) / "missing.xyz"
            workflow = _workflow()

            batch = workflow.import_files(root, (ImportFileRequest(missing), ImportFileRequest(good)))

            self.assertTrue(batch.ok, batch.error)
            items = batch.value.items  # type: ignore[union-attr]
            self.assertEqual([item.status for item in items], ["failed", "needs_confirmation"])
            self.assertIsNotNone(items[0].error)
            assert items[0].error is not None
            self.assertEqual(items[0].error.code, "invalid_input")

    def test_invalid_project_path_returns_invalid_input_without_batch(self) -> None:
        with TemporaryDirectory() as tmp:
            workflow = _workflow()
            source = Path(tmp) / "water.xyz"
            source.write_text(_xyz_content("water"), encoding="utf-8")

            result = workflow.import_files(
                Path(tmp) / "not-a-project",
                (ImportFileRequest(source),),
            )

            self.assertFalse(result.ok)
            self.assertIsNotNone(result.error)
            assert result.error is not None
            self.assertEqual(result.error.code, "invalid_input")
            self.assertEqual(workflow.list_batches("project-demo").value, ())

    def test_repeated_raw_file_import_reuses_resource_without_manifest_duplicate(self) -> None:
        with TemporaryDirectory() as tmp:
            root, source = _project_with_xyz(tmp)
            workflow = _workflow()

            first = workflow.import_files(root, (ImportFileRequest(source),))
            second = workflow.import_files(root, (ImportFileRequest(source),))
            loaded = ProjectStore().load_project(root)

            self.assertTrue(first.ok, first.error)
            self.assertTrue(second.ok, second.error)
            first_resource = first.value.items[0].raw_resource  # type: ignore[union-attr]
            second_resource = second.value.items[0].raw_resource  # type: ignore[union-attr]
            self.assertEqual(first_resource, second_resource)
            self.assertEqual(len(loaded.value.resources), 1)  # type: ignore[union-attr]

    def test_confirm_import_can_select_subset_of_parsed_objects(self) -> None:
        with TemporaryDirectory() as tmp:
            root = _create_project(tmp)
            source = Path(tmp) / "frames.xyz"
            source.write_text(
                _xyz_content("frame-0") + _xyz_content("frame-1"),
                encoding="utf-8",
            )
            registry = ChemicalRegistry()
            workflow = _workflow(registry)
            batch = workflow.import_files(root, (ImportFileRequest(source),)).value
            assert batch is not None
            item = batch.items[0]

            confirmed = workflow.confirm_import(
                batch.project_id,
                batch.id,
                (ImportSelection(item.id, object_indices=(1,)),),
            )

            self.assertTrue(confirmed.ok, confirmed.error)
            registered_ids = confirmed.value.items[0].registered_object_ids  # type: ignore[union-attr]
            self.assertEqual(len(registered_ids), 1)
            registered = registry.get_object(batch.project_id, registered_ids[0]).value
            self.assertEqual(registered.label, "frame-1")  # type: ignore[union-attr]

    def test_repeated_confirm_does_not_register_duplicate_objects(self) -> None:
        with TemporaryDirectory() as tmp:
            root, source = _project_with_xyz(tmp)
            registry = ChemicalRegistry()
            workflow = _workflow(registry)
            batch = workflow.import_files(root, (ImportFileRequest(source),)).value
            assert batch is not None
            item = batch.items[0]

            first = workflow.confirm_import(batch.project_id, batch.id, (ImportSelection(item.id),))
            second = workflow.confirm_import(batch.project_id, batch.id, (ImportSelection(item.id),))

            self.assertTrue(first.ok, first.error)
            self.assertTrue(second.ok, second.error)
            self.assertEqual(
                first.value.items[0].registered_object_ids,  # type: ignore[union-attr]
                second.value.items[0].registered_object_ids,  # type: ignore[union-attr]
            )
            self.assertEqual(len(registry._projects[batch.project_id].objects), 1)

    def test_confirm_invalid_selection_returns_invalid_input(self) -> None:
        with TemporaryDirectory() as tmp:
            root, source = _project_with_xyz(tmp)
            workflow = _workflow()
            batch = workflow.import_files(root, (ImportFileRequest(source),)).value
            assert batch is not None
            failed_item = workflow.import_files(
                root,
                (ImportFileRequest(Path(tmp) / "missing.xyz"),),
            ).value.items[0]

            missing_item = workflow.confirm_import(
                batch.project_id,
                batch.id,
                (ImportSelection("missing-item"),),
            )
            failed_selection = workflow.confirm_import(
                batch.project_id,
                workflow.list_batches(batch.project_id).value[1].id,  # type: ignore[index, union-attr]
                (ImportSelection(failed_item.id),),
            )
            bad_index = workflow.confirm_import(
                batch.project_id,
                batch.id,
                (ImportSelection(batch.items[0].id, object_indices=(5,)),),
            )

            for result in (missing_item, failed_selection, bad_index):
                self.assertFalse(result.ok)
                self.assertIsNotNone(result.error)
                assert result.error is not None
                self.assertEqual(result.error.code, "invalid_input")

    def test_existing_core_services_still_pass(self) -> None:
        self.assertTrue(run_core_fixture_vertical_slice().ok)

        with TemporaryDirectory() as tmp:
            root, source = _project_with_xyz(tmp)
            registry = ChemicalRegistry()
            workflow = _workflow(registry)
            batch = workflow.import_files(root, (ImportFileRequest(source),)).value
            assert batch is not None
            confirmed = workflow.confirm_import(
                batch.project_id,
                batch.id,
                (ImportSelection(batch.items[0].id),),
            )
            self.assertTrue(confirmed.ok, confirmed.error)
            item = confirmed.value.items[0]  # type: ignore[union-attr]
            graph_like_object = registry.get_object(batch.project_id, item.registered_object_ids[0])
            self.assertTrue(graph_like_object.ok, graph_like_object.error)
            self.assertIsNotNone(EnergyProfileEngine)

    def test_import_workflow_scope_guard(self) -> None:
        source = Path("rxnflow/import_workflow.py").read_text(encoding="utf-8")

        self.assertNotIn("ReactionGraphService", source)
        self.assertNotIn("EnergyProfileEngine", source)
        self.assertNotIn("ExportArtifact", source)
        self.assertNotIn("PNG", source)
        self.assertNotIn("CDXML", source)
        self.assertNotIn("Excel", source)
        self.assertNotIn("click", source)
        self.assertNotIn("FastAPI", source)

        parser_sources = "\n".join(
            path.read_text(encoding="utf-8")
            for path in Path("rxnflow/parsers").glob("*.py")
        )
        self.assertNotIn("ImportRegistryWorkflow", parser_sources)


def _workflow(registry: ChemicalRegistry | None = None) -> ImportRegistryWorkflow:
    return ImportRegistryWorkflow(
        ProjectStore(),
        ParserRegistry.default(),
        registry or ChemicalRegistry(),
    )


def _project_with_xyz(tmp: str) -> tuple[Path, Path]:
    root = _create_project(tmp)
    source = Path(tmp) / "water.xyz"
    source.write_text(_xyz_content("water"), encoding="utf-8")
    return root, source


def _create_project(tmp: str) -> Path:
    root = Path(tmp) / "demo.rxnflow"
    result = ProjectStore().create_project("demo", root)
    assert result.ok
    return root


def _xyz_content(label: str) -> str:
    return f"3\n{label}\nO 0 0 0\nH 0 0 0.96\nH 0.92 0 0\n"


if __name__ == "__main__":
    unittest.main()
