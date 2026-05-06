from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from rxnflow.chemical_object_codec import chemical_objects_section_from_dict
from rxnflow.content_store import (
    CHEMICAL_OBJECTS_PATH,
    PROJECT_CONTENT_INDEX_PATH,
    PROJECT_CONTENT_SCHEMA_VERSION,
    LocalProjectStorageBackend,
    ProjectContentSnapshot,
    ProjectContentStore,
    StorageObject,
)
from rxnflow.models import Atom3D, ChemicalObjectDraft, Correction, EnergyValue, Provenance
from rxnflow.parsers import ParseResult
from rxnflow.project import ProjectStore
from rxnflow.registry import ChemicalRegistry


class ChemicalObjectPersistenceTest(unittest.TestCase):
    def test_project_content_store_persists_registered_objects_and_restores_registry(self) -> None:
        registry = ChemicalRegistry()
        parse_result = _parse_result(_draft(label="reactant", formula="H2"))
        registered = registry.register("project-a", parse_result)
        self.assertTrue(registered.ok, registered.error)
        obj = registered.value[0]  # type: ignore[index]
        corrected = registry.apply_correction(
            "project-a",
            obj.id,
            _correction("corr-solv", "solvation", EnergyValue(-2.5, "kcal_mol", reference="SMD")),
        )
        self.assertTrue(corrected.ok, corrected.error)

        objects = registry.list_objects("project-a").value  # type: ignore[assignment, union-attr]
        self.assertEqual(objects[0].registry_fingerprint, obj.registry_fingerprint)
        self.assertEqual([correction.id for correction in objects[0].corrections], ["corr-solv"])

        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            created = ProjectStore().create_project("demo", root)
            self.assertTrue(created.ok, created.error)
            manifest_before = (root / ".rxnflow" / "manifest.json").read_text(encoding="utf-8")

            store = ProjectContentStore(LocalProjectStorageBackend())
            snapshot = ProjectContentSnapshot(project_id="project-a", chemical_objects=objects)
            saved = store.save_snapshot(root, snapshot)

            self.assertTrue(saved.ok, saved.error)
            index = saved.value
            assert index is not None
            chemical_file = next(file for file in index.files if file.kind == "chemical_objects")
            section = json.loads((root / CHEMICAL_OBJECTS_PATH).read_text(encoding="utf-8"))
            self.assertEqual(section["objects"][0]["registry_fingerprint"], obj.registry_fingerprint)
            self.assertEqual(section["objects"][0]["provenance"]["parser_id"], "fake-parser")
            self.assertEqual(section["objects"][0]["corrections"][0]["energy"]["unit"], "kcal_mol")

            repeated = store.save_snapshot(root, snapshot)
            self.assertTrue(repeated.ok, repeated.error)
            repeated_chemical_file = next(file for file in repeated.value.files if file.kind == "chemical_objects")  # type: ignore[union-attr]
            self.assertEqual(repeated_chemical_file.path, chemical_file.path)
            self.assertEqual(repeated_chemical_file.checksum, chemical_file.checksum)

            loaded = store.load_snapshot(root)
            self.assertTrue(loaded.ok, loaded.error)
            loaded_object = loaded.value.chemical_objects[0]  # type: ignore[union-attr]
            self.assertEqual(loaded_object, objects[0])
            self.assertEqual(loaded_object.energies["electronic"].unit, "hartree")
            self.assertEqual(loaded_object.thermochemistry["gibbs"].reference, "298K")

            restored_registry = ChemicalRegistry()
            restored = restored_registry.restore_objects("project-a", loaded.value.chemical_objects)  # type: ignore[union-attr]
            self.assertTrue(restored.ok, restored.error)
            self.assertEqual(restored_registry.get_object("project-a", obj.id).value, loaded_object)  # type: ignore[union-attr]

            repeated_register = restored_registry.register("project-a", parse_result)
            self.assertTrue(repeated_register.ok, repeated_register.error)
            self.assertEqual(repeated_register.value, (loaded_object,))
            self.assertEqual(len(restored_registry.list_objects("project-a").value), 1)  # type: ignore[arg-type]

            manifest_after = (root / ".rxnflow" / "manifest.json").read_text(encoding="utf-8")
            self.assertEqual(manifest_after, manifest_before)
            self.assertEqual(ProjectStore().load_project(root).value.resources, ())  # type: ignore[union-attr]

    def test_chemical_object_section_validation_errors_are_structured(self) -> None:
        valid_object = _registered_object()
        valid_section = _section(valid_object)

        cases = (
            (
                {**valid_section, "schema_version": "chemical-objects-v2"},
                "chemical_objects",
            ),
            (
                {**valid_section, "project_id": "project-b"},
                "chemical_objects",
            ),
            (
                _section_with_object_patch(valid_object, {"id": ""}),
                "objects[0].id",
            ),
            (
                _section_with_object_patch(valid_object, {"source_file_id": ""}),
                "objects[0].source_file_id",
            ),
            (
                _section_with_object_patch(valid_object, {"energies": {"electronic": -1.0}}),
                "objects[0].energies.electronic",
            ),
            (
                _section_with_object_patch(valid_object, {"energies": {"electronic": {"value": -1.0}}}),
                "objects[0].energies.electronic",
            ),
            (
                _section_with_object_patch(
                    valid_object,
                    {"energies": {"electronic": {"value": -1.0, "unit": "ev"}}},
                ),
                "objects[0].energies.electronic.unit",
            ),
            (
                {
                    **valid_section,
                    "objects": [
                        valid_section["objects"][0],
                        valid_section["objects"][0],
                    ],
                },
                valid_object.id,
            ),
            (
                {
                    **valid_section,
                    "objects": [
                        valid_section["objects"][0],
                        {
                            **valid_section["objects"][0],
                            "id": "object-other",
                        },
                    ],
                },
                "registry_fingerprint",
            ),
            (
                _section_with_object_patch(
                    valid_object,
                    {
                        "corrections": [
                            {
                                "id": "corr-1",
                                "kind": "manual",
                                "energy": {"value": 1.0, "unit": "kcal_mol", "reference": None},
                                "created_at": "2026-05-05T00:00:00Z",
                                "note": None,
                            },
                            {
                                "id": "corr-1",
                                "kind": "manual",
                                "energy": {"value": 2.0, "unit": "kcal_mol", "reference": None},
                                "created_at": "2026-05-05T00:00:00Z",
                                "note": None,
                            },
                        ]
                    },
                ),
                "objects[0].corrections[1].id",
            ),
        )

        for section, target in cases:
            with self.subTest(target=target):
                result = chemical_objects_section_from_dict("project-a", section)
                self.assertFalse(result.ok)
                self.assertEqual(result.error.code, "invalid_input")  # type: ignore[union-attr]
                self.assertEqual(result.error.target, target)  # type: ignore[union-attr]

    def test_project_content_store_uses_chemical_object_codec_errors(self) -> None:
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
                                    "kind": "chemical_objects",
                                    "path": CHEMICAL_OBJECTS_PATH,
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
                    CHEMICAL_OBJECTS_PATH,
                    _json_bytes(_section_with_object_patch(_registered_object(), {"source_file_id": ""})),
                ),
            )

            loaded = store.load_snapshot(root)

            self.assertFalse(loaded.ok)
            self.assertEqual(loaded.error.code, "invalid_input")  # type: ignore[union-attr]
            self.assertEqual(loaded.error.target, "objects[0].source_file_id")  # type: ignore[union-attr]

    def test_scope_guard_does_not_add_cross_module_or_platform_work(self) -> None:
        content_source = Path("rxnflow/content_store.py").read_text(encoding="utf-8")
        codec_source = Path("rxnflow/chemical_object_codec.py").read_text(encoding="utf-8")
        registry_source = Path("rxnflow/registry.py").read_text(encoding="utf-8")
        combined = "\n".join((content_source, codec_source, registry_source))

        for forbidden in (
            "ParserRegistry",
            "ImportRegistryWorkflow",
            "ReactionGraphService",
            "EnergyProfileEngine",
            "ReportExportService",
            "ProjectResource(",
            "argparse",
            "IndexedDB",
            "OPFS",
            "Vercel Blob",
            "Supabase",
        ):
            self.assertNotIn(forbidden, combined)


def _registered_object():
    registry = ChemicalRegistry()
    obj = registry.register("project-a", _parse_result(_draft())).value[0]  # type: ignore[index, union-attr]
    corrected = registry.apply_correction(
        "project-a",
        obj.id,
        _correction("corr-1", "manual", EnergyValue(1.0, "kcal_mol")),
    )
    return corrected.value  # type: ignore[return-value, union-attr]


def _draft(label: str = "object", formula: str = "H2") -> ChemicalObjectDraft:
    return ChemicalObjectDraft(
        label=label,
        formula=formula,
        charge=0,
        spin_multiplicity=1,
        method="B3LYP",
        geometry=(
            Atom3D("H", 0.0, 0.0, 0.0),
            Atom3D("H", 0.0, 0.0, 0.74),
        ),
        energies={"electronic": EnergyValue(-1.0, "hartree", reference="SCF")},
        thermochemistry={"gibbs": EnergyValue(-0.99, "hartree", reference="298K")},
    )


def _parse_result(*drafts: ChemicalObjectDraft) -> ParseResult:
    return ParseResult(
        objects=tuple(drafts),
        provenance=Provenance(
            source_file_id="raw-a",
            parser_id="fake-parser",
            parser_version="0.1.0",
            parsed_at="2026-05-05T00:00:00Z",
        ),
    )


def _correction(correction_id: str, kind: str, energy: EnergyValue) -> Correction:
    return Correction(
        id=correction_id,
        kind=kind,  # type: ignore[arg-type]
        energy=energy,
        created_at="2026-05-05T00:00:00Z",
        note="test correction",
    )


def _section(obj) -> dict[str, object]:
    from rxnflow.chemical_object_codec import chemical_objects_section_to_dict

    section = chemical_objects_section_to_dict("project-a", (obj,))
    assert section.ok
    return section.value  # type: ignore[return-value]


def _section_with_object_patch(obj, patch: dict[str, object]) -> dict[str, object]:
    section = _section(obj)
    stored = dict(section["objects"][0])  # type: ignore[index]
    stored.update(patch)
    return {**section, "objects": [stored]}


def _json_bytes(data: dict[str, object]) -> bytes:
    return (json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")


if __name__ == "__main__":
    unittest.main()
