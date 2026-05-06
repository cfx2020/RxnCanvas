from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from rxnflow.content_store import (
    IMPORT_LEDGER_PATH,
    PROJECT_CONTENT_INDEX_PATH,
    PROJECT_CONTENT_SCHEMA_VERSION,
    LocalProjectStorageBackend,
    ProjectContentSnapshot,
    ProjectContentStore,
    StorageObject,
)
from rxnflow.errors import RxnFlowError, RxnFlowWarning
from rxnflow.import_ledger_codec import (
    IMPORT_LEDGER_SCHEMA_VERSION,
    import_ledger_section_from_dict,
    import_ledger_section_to_dict,
)
from rxnflow.import_workflow import (
    ImportBatch,
    ImportFileRequest,
    ImportItem,
    ImportRegistryWorkflow,
    ImportSelection,
    ParsePreview,
)
from rxnflow.models import Atom3D, ChemicalObjectDraft, EnergyValue, ProjectResource, Provenance
from rxnflow.parsers import ParseResult, ParserRegistry
from rxnflow.project import ProjectStore
from rxnflow.registry import ChemicalRegistry


class ImportLedgerPersistenceTest(unittest.TestCase):
    def test_pending_preview_round_trips_and_can_confirm_after_restore(self) -> None:
        with TemporaryDirectory() as tmp:
            root, source = _project_with_xyz(tmp)
            workflow = _workflow()
            imported = workflow.import_files(root, (ImportFileRequest(source),))
            self.assertTrue(imported.ok, imported.error)
            batch = imported.value
            assert batch is not None

            saved = ProjectContentStore().save_snapshot(
                root,
                ProjectContentSnapshot(project_id=batch.project_id, import_batches=(batch,)),
            )
            self.assertTrue(saved.ok, saved.error)

            section = json.loads((root / IMPORT_LEDGER_PATH).read_text(encoding="utf-8"))
            item_section = section["batches"][0]["items"][0]
            self.assertEqual(section["schema_version"], IMPORT_LEDGER_SCHEMA_VERSION)
            self.assertEqual(item_section["source_path_display"], source.name)
            self.assertFalse(Path(item_section["source_path_display"]).is_absolute())
            self.assertEqual(item_section["preview"]["object_count"], 1)
            self.assertEqual(item_section["preview"]["object_drafts"][0]["label"], "water")

            loaded = ProjectContentStore().load_snapshot(root)
            self.assertTrue(loaded.ok, loaded.error)
            restored_batch = loaded.value.import_batches[0]  # type: ignore[union-attr]
            restored_item = restored_batch.items[0]
            assert restored_item.preview is not None
            self.assertEqual(restored_item.status, "needs_confirmation")
            self.assertEqual(restored_item.preview.parse_result.objects[0].label, "water")
            self.assertEqual(restored_item.preview.parse_result.provenance.parser_id, "xyz-ase")

            registry = ChemicalRegistry()
            restored_workflow = _workflow(registry)
            restored = restored_workflow.restore_batches(restored_batch.project_id, (restored_batch,))
            self.assertTrue(restored.ok, restored.error)
            restored_lookup = restored_workflow.get_batch(restored_batch.project_id, restored_batch.id)
            self.assertEqual(restored_lookup.value, restored_batch)

            confirmed = restored_workflow.confirm_import(
                restored_batch.project_id,
                restored_batch.id,
                (ImportSelection(restored_item.id),),
            )

            self.assertTrue(confirmed.ok, confirmed.error)
            registered_item = confirmed.value.items[0]  # type: ignore[union-attr]
            self.assertEqual(registered_item.status, "registered")
            self.assertEqual(len(registered_item.registered_object_ids), 1)
            registered = registry.get_object(restored_batch.project_id, registered_item.registered_object_ids[0])
            self.assertTrue(registered.ok, registered.error)
            self.assertEqual(registered.value.label, "water")  # type: ignore[union-attr]

    def test_failed_item_preserves_error_and_warnings(self) -> None:
        with TemporaryDirectory() as tmp:
            root, good = _project_with_xyz(tmp)
            bad = Path(tmp) / "note.txt"
            bad.write_text("not a chemistry output", encoding="utf-8")
            workflow = _workflow()
            batch = workflow.import_files(root, (ImportFileRequest(good), ImportFileRequest(bad))).value
            assert batch is not None

            saved = ProjectContentStore().save_snapshot(
                root,
                ProjectContentSnapshot(project_id=batch.project_id, import_batches=(batch,)),
            )
            self.assertTrue(saved.ok, saved.error)
            loaded = ProjectContentStore().load_snapshot(root)
            self.assertTrue(loaded.ok, loaded.error)

            failed = loaded.value.import_batches[0].items[1]  # type: ignore[union-attr]
            self.assertEqual(failed.status, "failed")
            self.assertIsNone(failed.preview)
            self.assertIsNotNone(failed.error)
            assert failed.error is not None
            self.assertEqual(failed.error.code, "unsupported_format")
            self.assertEqual(failed.error.message, "No parser plugin supports this RawFile.")

    def test_registered_item_preserves_ids_and_validates_loaded_objects(self) -> None:
        with TemporaryDirectory() as tmp:
            root, source = _project_with_xyz(tmp)
            registry = ChemicalRegistry()
            workflow = _workflow(registry)
            batch = workflow.import_files(root, (ImportFileRequest(source),)).value
            assert batch is not None
            confirmed = workflow.confirm_import(batch.project_id, batch.id, (ImportSelection(batch.items[0].id),))
            self.assertTrue(confirmed.ok, confirmed.error)
            objects = registry.list_objects(batch.project_id).value
            assert objects is not None

            saved = ProjectContentStore().save_snapshot(
                root,
                ProjectContentSnapshot(
                    project_id=batch.project_id,
                    chemical_objects=objects,
                    import_batches=workflow.list_batches(batch.project_id).value,  # type: ignore[arg-type]
                ),
            )
            self.assertTrue(saved.ok, saved.error)

            loaded = ProjectContentStore().load_snapshot(root)
            self.assertTrue(loaded.ok, loaded.error)
            loaded_batch = loaded.value.import_batches[0]  # type: ignore[union-attr]
            loaded_item = loaded_batch.items[0]
            self.assertEqual(loaded_item.status, "registered")
            self.assertEqual(loaded_item.registered_object_ids, (objects[0].id,))

            restored_workflow = _workflow()
            restored = restored_workflow.restore_batches(
                loaded_batch.project_id,
                (loaded_batch,),
                object_ids={obj.id for obj in loaded.value.chemical_objects},  # type: ignore[union-attr]
            )
            self.assertTrue(restored.ok, restored.error)
            repeated = restored_workflow.restore_batches(
                loaded_batch.project_id,
                (loaded_batch,),
                object_ids={obj.id for obj in loaded.value.chemical_objects},  # type: ignore[union-attr]
            )
            self.assertTrue(repeated.ok, repeated.error)
            self.assertEqual(len(repeated.value), 1)  # type: ignore[arg-type]

    def test_import_ledger_section_validation_errors_are_structured(self) -> None:
        valid = import_ledger_section_to_dict("project-a", (_pending_batch(),)).value
        assert valid is not None

        cases = (
            ({**valid, "schema_version": "import-ledger-v2"}, "import_ledger", None),
            ({**valid, "project_id": "project-b"}, "import_ledger", None),
            ({**valid, "batches": [valid["batches"][0], valid["batches"][0]]}, "batch-a", None),
            (_with_item_patch(valid, {"status": "unknown"}), "batches[0].items[0].status", None),
            (
                _with_item_patch(valid, {"warnings": [{"code": "missing_message"}]}),
                "batches[0].items[0].warnings[0]",
                None,
            ),
            (_with_preview_patch(valid, {"object_count": 2}), "batches[0].items[0].preview.object_count", None),
            (
                _with_preview_patch(
                    valid,
                    {"provenance": {**valid["batches"][0]["items"][0]["preview"]["provenance"], "parser_id": "other"}},
                ),
                "batches[0].items[0].preview.provenance",
                None,
            ),
            (
                {
                    **valid,
                    "batches": [
                        {
                            **valid["batches"][0],
                            "items": [valid["batches"][0]["items"][0], valid["batches"][0]["items"][0]],
                        }
                    ],
                },
                "item-a",
                None,
            ),
            (
                import_ledger_section_to_dict("project-a", (_registered_batch(),)).value,
                "batches[0].items[0].registered_object_ids",
                set(),
            ),
            (
                import_ledger_section_to_dict("project-a", (_failed_batch(),)).value,
                "batches[0].items[0].error",
                None,
            ),
        )

        for section, target, object_ids in cases:
            assert section is not None
            if target == "batches[0].items[0].error":
                section = deepcopy(section)
                section["batches"][0]["items"][0]["error"] = {"code": "parse_failed"}
            with self.subTest(target=target):
                result = import_ledger_section_from_dict("project-a", section, object_ids=object_ids)
                self.assertFalse(result.ok)
                self.assertEqual(result.error.code, "invalid_input")  # type: ignore[union-attr]
                self.assertEqual(result.error.target, target)  # type: ignore[union-attr]

    def test_project_content_store_uses_import_ledger_errors(self) -> None:
        backend = LocalProjectStorageBackend()
        store = ProjectContentStore(backend)
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            backend.write_object(
                root,
                StorageObject(
                    PROJECT_CONTENT_INDEX_PATH,
                    _json_bytes(
                        {
                            "schema_version": PROJECT_CONTENT_SCHEMA_VERSION,
                            "project_id": "project-a",
                            "updated_at": "2026-05-05T00:00:00Z",
                            "files": [
                                {
                                    "kind": "import_ledger",
                                    "path": IMPORT_LEDGER_PATH,
                                    "checksum": "sha256:test",
                                    "updated_at": "2026-05-05T00:00:00Z",
                                }
                            ],
                        }
                    ),
                ),
            )
            backend.write_object(
                root,
                StorageObject(
                    IMPORT_LEDGER_PATH,
                    _json_bytes({"schema_version": "import-ledger-v2", "project_id": "project-a", "batches": []}),
                ),
            )

            loaded = store.load_snapshot(root)

            self.assertFalse(loaded.ok)
            self.assertEqual(loaded.error.code, "invalid_input")  # type: ignore[union-attr]
            self.assertEqual(loaded.error.target, "import_ledger")  # type: ignore[union-attr]

    def test_scope_guard_does_not_parse_register_or_touch_unrelated_domains(self) -> None:
        content_source = Path("rxnflow/content_store.py").read_text(encoding="utf-8")
        codec_source = Path("rxnflow/import_ledger_codec.py").read_text(encoding="utf-8")
        combined = "\n".join((content_source, codec_source))

        for forbidden in (
            "ParserRegistry",
            "ProjectStore.add_raw_file",
            "ChemicalRegistry.register",
            "ReactionGraphService",
            "EnergyProfileEngine",
            "ReportExportService",
            "FastAPI",
            "IndexedDB",
            "OPFS",
            "Vercel Blob",
            "Supabase",
        ):
            self.assertNotIn(forbidden, combined)


def _workflow(registry: ChemicalRegistry | None = None) -> ImportRegistryWorkflow:
    return ImportRegistryWorkflow(
        ProjectStore(),
        ParserRegistry.default(),
        registry or ChemicalRegistry(),
    )


def _project_with_xyz(tmp: str) -> tuple[Path, Path]:
    root = Path(tmp) / "demo.rxnflow"
    result = ProjectStore().create_project("demo", root)
    assert result.ok
    source = Path(tmp) / "water.xyz"
    source.write_text(_xyz_content("water"), encoding="utf-8")
    return root, source


def _xyz_content(label: str) -> str:
    return f"3\n{label}\nO 0 0 0\nH 0 0 0.96\nH 0.92 0 0\n"


def _pending_batch() -> ImportBatch:
    preview = _preview()
    return ImportBatch(
        id="batch-a",
        project_id="project-a",
        items=(
            ImportItem(
                id="item-a",
                source_path="/tmp/water.xyz",
                status="needs_confirmation",
                raw_resource=ProjectResource("raw-a", "raw_file"),
                preview=preview,
                warnings=(RxnFlowWarning("missing_section", "Missing energy.", "water.xyz"),),
            ),
        ),
    )


def _registered_batch() -> ImportBatch:
    return ImportBatch(
        id="batch-registered",
        project_id="project-a",
        items=(
            ImportItem(
                id="item-registered",
                source_path="water.xyz",
                status="registered",
                raw_resource=ProjectResource("raw-a", "raw_file"),
                preview=_preview(),
                registered_object_ids=("object-a",),
            ),
        ),
    )


def _failed_batch() -> ImportBatch:
    return ImportBatch(
        id="batch-failed",
        project_id="project-a",
        items=(
            ImportItem(
                id="item-failed",
                source_path="note.txt",
                status="failed",
                raw_resource=ProjectResource("raw-b", "raw_file"),
                error=RxnFlowError("unsupported_format", "No parser matched.", "note.txt", {"confidence": 0.0}),
                warnings=(RxnFlowWarning("ambiguous_format", "Ambiguous.", "note.txt"),),
            ),
        ),
    )


def _preview() -> ParsePreview:
    provenance = Provenance("raw-a", "fake-parser", "0.1.0", "2026-05-06T00:00:00Z")
    parse_result = ParseResult(
        objects=(
            ChemicalObjectDraft(
                label="water",
                formula="H2O",
                charge=0,
                spin_multiplicity=1,
                method="B3LYP",
                geometry=(
                    Atom3D("O", 0.0, 0.0, 0.0),
                    Atom3D("H", 0.0, 0.0, 0.96),
                    Atom3D("H", 0.92, 0.0, 0.0),
                ),
                energies={"electronic": EnergyValue(-76.0, "hartree", "SCF")},
                thermochemistry={"gibbs": EnergyValue(-75.9, "hartree", "298K")},
            ),
        ),
        provenance=provenance,
    )
    return ParsePreview(
        raw_resource_id="raw-a",
        parser_id="fake-parser",
        parser_version="0.1.0",
        object_count=1,
        warnings=(RxnFlowWarning("missing_section", "Missing energy.", "water.xyz"),),
        parse_result=parse_result,
    )


def _with_item_patch(section: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    copied = deepcopy(section)
    copied["batches"][0]["items"][0].update(patch)  # type: ignore[index, union-attr]
    return copied


def _with_preview_patch(section: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    copied = deepcopy(section)
    copied["batches"][0]["items"][0]["preview"].update(patch)  # type: ignore[index, union-attr]
    return copied


def _json_bytes(data: dict[str, object]) -> bytes:
    return (json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")


if __name__ == "__main__":
    unittest.main()
