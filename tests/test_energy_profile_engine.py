from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import cast
import unittest

from rxnflow import run_core_fixture_vertical_slice
from rxnflow.constants import HARTREE_TO_KCAL_MOL, KCAL_MOL_TO_KJ_MOL
from rxnflow.energy import EnergyProfileEngine
from rxnflow.models import (
    ChemicalObject,
    Correction,
    EnergyOptions,
    EnergyUnit,
    EnergyValue,
    Provenance,
    ReactionGraph,
    ReactionNode,
    ReactionPath,
)


PROJECT_ID = "project-a"


class EnergyProfileEngineTest(unittest.TestCase):
    def test_compute_profile_matches_fixture_relative_energy(self) -> None:
        graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            ReactionNode("node-b", "species", "B", ("object-b",)),
            path=("node-a", "node-b"),
        )

        result = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (_object("object-a", -100.0), _object("object-b", -99.98)),
            _options(),
        )

        self.assertTrue(result.ok, result.error)
        profile = result.value
        assert profile is not None
        self.assertEqual(profile.graph_id, "graph-main")
        self.assertEqual(profile.path_id, "path-main")
        self.assertEqual(profile.options.baseline_node_id, "node-a")
        self.assertEqual(profile.points[0].relative_energy, EnergyValue(0.0, "kcal_mol"))
        self.assertEqual(profile.points[1].relative_energy, EnergyValue(12.55018948, "kcal_mol"))
        self.assertEqual(profile.points[0].absolute_energy, EnergyValue(-62750.9474, "kcal_mol"))

    def test_kj_mol_output_converts_absolute_and_relative_energy(self) -> None:
        graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            ReactionNode("node-b", "species", "B", ("object-b",)),
            path=("node-a", "node-b"),
        )

        result = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (_object("object-a", -100.0), _object("object-b", -99.98)),
            replace(_options(), output_unit="kj_mol"),
        )

        self.assertTrue(result.ok, result.error)
        profile = result.value
        assert profile is not None
        self.assertEqual(profile.points[0].absolute_energy.unit, "kj_mol")
        self.assertAlmostEqual(
            profile.points[1].relative_energy.value,  # type: ignore[union-attr]
            0.02 * HARTREE_TO_KCAL_MOL * KCAL_MOL_TO_KJ_MOL,
            places=6,
        )

    def test_explicit_baseline_node_offsets_path(self) -> None:
        graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            ReactionNode("node-ts", "transition_state", "TS", ("object-ts",)),
            ReactionNode("node-b", "species", "B", ("object-b",)),
            path=("node-a", "node-ts", "node-b"),
        )

        result = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (
                _object("object-a", -100.00),
                _object("object-ts", -99.99),
                _object("object-b", -99.98),
            ),
            replace(_options(), baseline_node_id="node-ts"),
        )

        self.assertTrue(result.ok, result.error)
        profile = result.value
        assert profile is not None
        self.assertEqual(profile.points[1].relative_energy, EnergyValue(0.0, "kcal_mol"))
        self.assertEqual(profile.points[0].relative_energy, EnergyValue(-6.27509474, "kcal_mol"))
        self.assertEqual(profile.points[2].relative_energy, EnergyValue(6.27509474, "kcal_mol"))

    def test_graph_reference_errors_return_graph_invalid(self) -> None:
        base_graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            ReactionNode("node-b", "species", "B", ("object-b",)),
            path=("node-a", "node-b"),
        )

        missing_path = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            base_graph,
            "path-missing",
            (_object("object-a", -100.0), _object("object-b", -99.98)),
            _options(),
        )
        baseline_outside_path = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            base_graph,
            "path-main",
            (_object("object-a", -100.0), _object("object-b", -99.98)),
            replace(_options(), baseline_node_id="node-missing"),
        )
        path_missing_node = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            replace(base_graph, paths=(ReactionPath("path-main", "main", ("node-a", "node-missing")),)),
            "path-main",
            (_object("object-a", -100.0), _object("object-b", -99.98)),
            _options(),
        )
        missing_object = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            base_graph,
            "path-main",
            (_object("object-a", -100.0),),
            _options(),
        )

        for result in (missing_path, baseline_outside_path, path_missing_node, missing_object):
            self.assertFalse(result.ok)
            self.assertIsNotNone(result.error)
            assert result.error is not None
            self.assertEqual(result.error.code, "graph_invalid")

    def test_baseline_missing_energy_returns_missing_energy(self) -> None:
        graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            ReactionNode("node-b", "species", "B", ("object-b",)),
            path=("node-a", "node-b"),
        )

        result = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (_object_without_energy("object-a"), _object("object-b", -99.98)),
            _options(),
        )

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "missing_energy")
        self.assertEqual(result.error.target, "node-a")

    def test_non_baseline_missing_energy_returns_missing_point_and_warning(self) -> None:
        graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            ReactionNode("node-b", "species", "B", ("object-b",)),
            path=("node-a", "node-b"),
        )

        result = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (_object("object-a", -100.0), _object_without_energy("object-b")),
            _options(),
        )

        self.assertTrue(result.ok, result.error)
        profile = result.value
        assert profile is not None
        self.assertEqual(profile.points[1].missing_reason, "missing_energy")
        self.assertIsNone(profile.points[1].absolute_energy)
        self.assertIsNone(profile.points[1].relative_energy)
        self.assertEqual(profile.warnings[0].code, "missing_energy")
        self.assertEqual(result.warnings[0].target, "node-b")

    def test_multi_object_node_and_corrections_are_additive_when_enabled(self) -> None:
        graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            ReactionNode("node-combo", "species", "Combo", ("object-b", "object-c")),
            path=("node-a", "node-combo"),
        )
        object_b = _object(
            "object-b",
            1.0,
            unit="kcal_mol",
            corrections=(_correction("corr-b", EnergyValue(-0.5, "kcal_mol")),),
        )
        object_c = _object(
            "object-c",
            2.0,
            unit="kcal_mol",
            corrections=(_correction("corr-c", EnergyValue(0.001, "hartree")),),
        )

        raw = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (_object("object-a", 0.0, unit="kcal_mol"), object_b, object_c),
            _options(),
        )
        corrected = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (_object("object-a", 0.0, unit="kcal_mol"), object_b, object_c),
            replace(_options(), include_corrections=True),
        )

        self.assertTrue(raw.ok, raw.error)
        self.assertTrue(corrected.ok, corrected.error)
        self.assertEqual(raw.value.points[1].relative_energy, EnergyValue(3.0, "kcal_mol"))  # type: ignore[union-attr]
        self.assertEqual(
            corrected.value.points[1].relative_energy,  # type: ignore[union-attr]
            EnergyValue(3.12750947, "kcal_mol"),
        )
        self.assertEqual(object_b.energies["electronic"], EnergyValue(1.0, "kcal_mol"))

    def test_annotation_and_group_nodes_are_missing_energy_points(self) -> None:
        annotation_graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            ReactionNode("node-note", "annotation", "Note"),
            path=("node-a", "node-note"),
        )
        baseline_group_graph = _graph(
            ReactionNode("node-group", "group", "Group"),
            ReactionNode("node-a", "species", "A", ("object-a",)),
            path=("node-group", "node-a"),
        )

        annotation = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            annotation_graph,
            "path-main",
            (_object("object-a", -100.0),),
            _options(),
        )
        baseline_group = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            baseline_group_graph,
            "path-main",
            (_object("object-a", -100.0),),
            _options(),
        )

        self.assertTrue(annotation.ok, annotation.error)
        self.assertEqual(annotation.value.points[1].missing_reason, "missing_energy")  # type: ignore[union-attr]
        self.assertFalse(baseline_group.ok)
        self.assertIsNotNone(baseline_group.error)
        assert baseline_group.error is not None
        self.assertEqual(baseline_group.error.code, "missing_energy")

    def test_unsupported_units_return_invalid_input(self) -> None:
        graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            path=("node-a",),
        )

        bad_input_unit = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (_object("object-a", 1.0, unit=cast(EnergyUnit, "ev")),),
            _options(),
        )
        bad_output_unit = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (_object("object-a", 1.0),),
            replace(_options(), output_unit=cast("kcal_mol", "hartree")),
        )

        for result in (bad_input_unit, bad_output_unit):
            self.assertFalse(result.ok)
            self.assertIsNotNone(result.error)
            assert result.error is not None
            self.assertEqual(result.error.code, "invalid_input")

    def test_core_fixture_vertical_slice_still_passes(self) -> None:
        result = run_core_fixture_vertical_slice()

        self.assertTrue(result.ok, result.error)
        self.assertEqual(result.value.profile.id, "profile-a-b-electronic")  # type: ignore[union-attr]
        self.assertEqual(
            result.value.profile.points[1].relative_energy,  # type: ignore[union-attr]
            EnergyValue(12.55018948, "kcal_mol"),
        )

    def test_energy_engine_scope_guard(self) -> None:
        source = Path("rxnflow/energy.py").read_text(encoding="utf-8")

        self.assertNotIn("ProjectStore", source)
        self.assertNotIn(".rxnflow", source)
        self.assertNotIn("ParserRegistry", source)
        self.assertNotIn("GaussianLogPlugin", source)
        self.assertNotIn("OrcaOutputPlugin", source)
        self.assertNotIn("XyzPlugin", source)
        self.assertNotIn("MapleOutputPlugin", source)
        self.assertNotIn("apply_correction", source)
        self.assertNotIn("ReactionGraphService", source)
        self.assertNotIn("ExportArtifact", source)


def _graph(*nodes: ReactionNode, path: tuple[str, ...]) -> ReactionGraph:
    return ReactionGraph(
        id="graph-main",
        project_id=PROJECT_ID,
        nodes=nodes,
        paths=(ReactionPath("path-main", "main", path),),
    )


def _object(
    object_id: str,
    energy: float,
    unit: EnergyUnit = "hartree",
    corrections: tuple[Correction, ...] = (),
) -> ChemicalObject:
    return ChemicalObject(
        id=object_id,
        label=object_id,
        energies={"electronic": EnergyValue(energy, unit)},
        source_file_id="raw-a",
        corrections=corrections,
        provenance=_provenance(),
    )


def _object_without_energy(object_id: str) -> ChemicalObject:
    return ChemicalObject(
        id=object_id,
        label=object_id,
        source_file_id="raw-a",
        provenance=_provenance(),
    )


def _correction(correction_id: str, energy: EnergyValue) -> Correction:
    return Correction(
        id=correction_id,
        kind="manual",
        energy=energy,
        created_at="2026-05-04T00:00:00Z",
    )


def _options() -> EnergyOptions:
    return EnergyOptions(
        output_unit="kcal_mol",
        include_corrections=False,
        energy_key="electronic",
    )


def _provenance() -> Provenance:
    return Provenance(
        source_file_id="raw-a",
        parser_id="test",
        parser_version="0.1.0",
        parsed_at="2026-05-04T00:00:00Z",
    )


if __name__ == "__main__":
    unittest.main()
