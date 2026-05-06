from __future__ import annotations

from pathlib import Path
import unittest

from rxnflow import run_core_fixture_vertical_slice
from rxnflow.models import Atom3D, ChemicalObjectDraft, Correction, EnergyValue, Provenance
from rxnflow.parsers import ParseResult
from rxnflow.registry import ChemicalRegistry


class ChemicalRegistryCorrectionsTest(unittest.TestCase):
    def test_register_single_draft_preserves_fields_and_provenance(self) -> None:
        registry = ChemicalRegistry()
        parse_result = _parse_result(_draft(label="water", formula="H2O"))

        result = registry.register("project-a", parse_result)

        self.assertTrue(result.ok, result.error)
        obj = result.value[0]  # type: ignore[index]
        self.assertEqual(obj.label, "water")
        self.assertEqual(obj.formula, "H2O")
        self.assertEqual(obj.source_file_id, "raw-a")
        self.assertEqual(obj.provenance, parse_result.provenance)
        self.assertEqual(obj.corrections, ())
        self.assertIsNotNone(obj.registry_fingerprint)

        lookup = registry.get_object("project-a", obj.id)
        self.assertTrue(lookup.ok, lookup.error)
        self.assertEqual(lookup.value, obj)

    def test_register_multiple_drafts_returns_stable_distinct_ids(self) -> None:
        registry = ChemicalRegistry()
        parse_result = _parse_result(
            _draft(label="reactant", formula="H2"),
            _draft(label="product", formula="H2"),
        )

        result = registry.register("project-a", parse_result)

        self.assertTrue(result.ok, result.error)
        objects = result.value  # type: ignore[assignment]
        self.assertEqual([obj.label for obj in objects], ["reactant", "product"])
        self.assertNotEqual(objects[0].id, objects[1].id)

        repeated = registry.register("project-a", parse_result)
        self.assertTrue(repeated.ok, repeated.error)
        self.assertEqual([obj.id for obj in repeated.value], [obj.id for obj in objects])  # type: ignore[union-attr]

    def test_repeated_register_in_same_project_is_idempotent(self) -> None:
        registry = ChemicalRegistry()
        parse_result = _parse_result(_draft())

        first = registry.register("project-a", parse_result)
        second = registry.register("project-a", parse_result)

        self.assertTrue(first.ok, first.error)
        self.assertTrue(second.ok, second.error)
        self.assertEqual(second.value, first.value)
        self.assertEqual(len(registry._projects["project-a"].objects), 1)

    def test_same_parse_result_in_different_projects_has_separate_state(self) -> None:
        registry = ChemicalRegistry()
        parse_result = _parse_result(_draft())

        project_a = registry.register("project-a", parse_result).value[0]  # type: ignore[index, union-attr]
        project_b = registry.register("project-b", parse_result).value[0]  # type: ignore[index, union-attr]

        self.assertNotEqual(project_a.id, project_b.id)

        correction = _correction("corr-a", "manual", EnergyValue(1.0, "kcal_mol"))
        corrected_a = registry.apply_correction("project-a", project_a.id, correction)

        self.assertTrue(corrected_a.ok, corrected_a.error)
        self.assertEqual(len(corrected_a.value.corrections), 1)  # type: ignore[union-attr]
        self.assertEqual(registry.get_object("project-b", project_b.id).value.corrections, ())  # type: ignore[union-attr]

    def test_same_formula_from_different_sources_is_not_auto_merged(self) -> None:
        registry = ChemicalRegistry()

        first = registry.register(
            "project-a",
            _parse_result(_draft(label="from-gaussian", formula="H2O"), source_file_id="raw-a"),
        )
        second = registry.register(
            "project-a",
            _parse_result(_draft(label="from-orca", formula="H2O"), source_file_id="raw-b"),
        )

        self.assertTrue(first.ok, first.error)
        self.assertTrue(second.ok, second.error)
        self.assertNotEqual(first.value[0].id, second.value[0].id)  # type: ignore[index]
        self.assertEqual(len(registry._projects["project-a"].objects), 2)

    def test_get_missing_object_returns_invalid_input(self) -> None:
        result = ChemicalRegistry().get_object("project-a", "object-missing")

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "invalid_input")
        self.assertEqual(result.error.target, "object-missing")

    def test_list_and_restore_objects_rebuilds_registry_state(self) -> None:
        registry = ChemicalRegistry()
        parse_result = _parse_result(_draft())
        obj = registry.register("project-a", parse_result).value[0]  # type: ignore[index, union-attr]

        listed = registry.list_objects("project-a")
        self.assertTrue(listed.ok, listed.error)
        self.assertEqual(listed.value, (obj,))
        self.assertEqual(ChemicalRegistry().list_objects("project-a").value, ())  # type: ignore[union-attr]

        restored_registry = ChemicalRegistry()
        restored = restored_registry.restore_objects("project-a", listed.value)  # type: ignore[arg-type]
        self.assertTrue(restored.ok, restored.error)
        self.assertEqual(restored_registry.get_object("project-a", obj.id).value, obj)  # type: ignore[union-attr]

        repeated_restore = restored_registry.restore_objects("project-a", listed.value)  # type: ignore[arg-type]
        self.assertTrue(repeated_restore.ok, repeated_restore.error)
        self.assertEqual(len(restored_registry.list_objects("project-a").value), 1)  # type: ignore[arg-type]

        repeated_register = restored_registry.register("project-a", parse_result)
        self.assertTrue(repeated_register.ok, repeated_register.error)
        self.assertEqual(repeated_register.value, (obj,))
        self.assertEqual(len(restored_registry.list_objects("project-a").value), 1)  # type: ignore[arg-type]

    def test_restore_objects_rejects_duplicate_ids_and_fingerprint_conflicts(self) -> None:
        registry = ChemicalRegistry()
        parse_result = _parse_result(_draft(label="a"), _draft(label="b"))
        objects = registry.register("project-a", parse_result).value  # type: ignore[assignment, union-attr]

        duplicate_id = ChemicalRegistry().restore_objects("project-a", (objects[0], objects[0]))
        self.assertFalse(duplicate_id.ok)
        self.assertEqual(duplicate_id.error.code, "invalid_input")  # type: ignore[union-attr]

        conflict = ChemicalRegistry().restore_objects(
            "project-a",
            (
                objects[0],
                ChemicalObjectForTest.with_fingerprint(objects[1], objects[0].registry_fingerprint),
            ),
        )
        self.assertFalse(conflict.ok)
        self.assertEqual(conflict.error.code, "invalid_input")  # type: ignore[union-attr]
        self.assertEqual(conflict.error.target, "registry_fingerprint")  # type: ignore[union-attr]

    def test_apply_all_correction_kinds_appends_without_rewriting_energy(self) -> None:
        registry = ChemicalRegistry()
        obj = registry.register("project-a", _parse_result(_draft())).value[0]  # type: ignore[index, union-attr]
        original_energy = obj.energies["electronic"]

        for correction in (
            _correction("corr-res", "resonance", EnergyValue(-0.5, "kcal_mol")),
            _correction("corr-solv", "solvation", EnergyValue(-2.0, "kcal_mol")),
            _correction("corr-manual", "manual", EnergyValue(0.001, "hartree")),
        ):
            result = registry.apply_correction("project-a", obj.id, correction)
            self.assertTrue(result.ok, result.error)

        updated = registry.get_object("project-a", obj.id).value  # type: ignore[union-attr]
        self.assertEqual([correction.kind for correction in updated.corrections], ["resonance", "solvation", "manual"])
        self.assertEqual(updated.energies["electronic"], original_energy)

    def test_duplicate_same_correction_is_idempotent(self) -> None:
        registry = ChemicalRegistry()
        obj = registry.register("project-a", _parse_result(_draft())).value[0]  # type: ignore[index, union-attr]
        correction = _correction("corr-1", "manual", EnergyValue(1.0, "kcal_mol"))

        first = registry.apply_correction("project-a", obj.id, correction)
        second = registry.apply_correction("project-a", obj.id, correction)

        self.assertTrue(first.ok, first.error)
        self.assertTrue(second.ok, second.error)
        self.assertEqual(first.value, second.value)
        self.assertEqual(len(second.value.corrections), 1)  # type: ignore[union-attr]

    def test_duplicate_correction_id_with_different_payload_returns_invalid_input(self) -> None:
        registry = ChemicalRegistry()
        obj = registry.register("project-a", _parse_result(_draft())).value[0]  # type: ignore[index, union-attr]
        registry.apply_correction(
            "project-a",
            obj.id,
            _correction("corr-1", "manual", EnergyValue(1.0, "kcal_mol")),
        )

        result = registry.apply_correction(
            "project-a",
            obj.id,
            _correction("corr-1", "manual", EnergyValue(2.0, "kcal_mol")),
        )

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "invalid_input")
        self.assertEqual(result.error.target, "corr-1")

    def test_empty_parse_result_returns_invalid_input_without_project_state(self) -> None:
        registry = ChemicalRegistry()
        result = registry.register("project-a", _parse_result())

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "invalid_input")
        self.assertEqual(result.error.target, "parse_result.objects")
        self.assertNotIn("project-a", registry._projects)

    def test_core_fixture_vertical_slice_still_passes(self) -> None:
        result = run_core_fixture_vertical_slice()

        self.assertTrue(result.ok, result.error)
        self.assertEqual(len(result.value.objects), 2)  # type: ignore[union-attr]

    def test_registry_does_not_call_parsers_project_store_graph_or_energy(self) -> None:
        source = Path("rxnflow/registry.py").read_text(encoding="utf-8")

        self.assertNotIn("GaussianLogPlugin", source)
        self.assertNotIn("OrcaOutputPlugin", source)
        self.assertNotIn("XyzPlugin", source)
        self.assertNotIn("MapleOutputPlugin", source)
        self.assertNotIn("ProjectStore", source)
        self.assertNotIn("save_project", source)
        self.assertNotIn(".rxnflow", source)
        self.assertNotIn("ReactionGraph", source)
        self.assertNotIn("EnergyProfile", source)
        self.assertNotIn("export_artifact", source)


def _draft(
    label: str = "object",
    formula: str = "H2",
    energy: float = -1.0,
) -> ChemicalObjectDraft:
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
        energies={"electronic": EnergyValue(energy, "hartree")},
    )


def _parse_result(
    *drafts: ChemicalObjectDraft,
    source_file_id: str = "raw-a",
    parser_id: str = "fake-parser",
) -> ParseResult:
    return ParseResult(
        objects=tuple(drafts),
        provenance=Provenance(
            source_file_id=source_file_id,
            parser_id=parser_id,
            parser_version="0.1.0",
            parsed_at="2026-05-02T00:00:00Z",
        ),
    )


def _correction(
    correction_id: str,
    kind: str,
    energy: EnergyValue,
) -> Correction:
    return Correction(
        id=correction_id,
        kind=kind,  # type: ignore[arg-type]
        energy=energy,
        created_at="2026-05-02T00:00:00Z",
        note="test correction",
    )


class ChemicalObjectForTest:
    @staticmethod
    def with_fingerprint(obj, registry_fingerprint):
        from dataclasses import replace

        return replace(obj, registry_fingerprint=registry_fingerprint)


if __name__ == "__main__":
    unittest.main()
