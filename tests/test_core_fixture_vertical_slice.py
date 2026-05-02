from __future__ import annotations

import unittest
from dataclasses import replace

from rxnflow import run_core_fixture_vertical_slice
from rxnflow.fixture import default_core_fixture_scenario
from rxnflow.models import EnergyOptions, EnergyValue


class CoreFixtureVerticalSliceTest(unittest.TestCase):
    def test_default_fixture_returns_core_objects(self) -> None:
        result = run_core_fixture_vertical_slice()

        self.assertTrue(result.ok, result.error)
        value = result.value
        self.assertIsNotNone(value)
        assert value is not None

        self.assertEqual(value.project.id, "project-fixture-minimal-reaction")
        self.assertEqual(len(value.objects), 2)
        self.assertEqual(len(value.graph.nodes), 2)
        self.assertEqual(len(value.graph.edges), 1)
        self.assertEqual(len(value.graph.paths), 1)
        self.assertEqual(value.profile.id, "profile-a-b-electronic")

    def test_default_fixture_relative_energy_points(self) -> None:
        result = run_core_fixture_vertical_slice()

        self.assertTrue(result.ok, result.error)
        profile = result.value.profile  # type: ignore[union-attr]

        self.assertEqual(len(profile.points), 2)
        self.assertEqual(profile.points[0].relative_energy, EnergyValue(0, "kcal_mol"))
        self.assertEqual(
            profile.points[1].relative_energy,
            EnergyValue(12.55018948, "kcal_mol"),
        )

    def test_missing_path_node_returns_graph_invalid(self) -> None:
        scenario = default_core_fixture_scenario()
        bad_path = replace(scenario.graph.path, node_ids=("node-a", "node-missing"))
        bad_scenario = replace(scenario, graph=replace(scenario.graph, path=bad_path))

        result = run_core_fixture_vertical_slice(bad_scenario)

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "graph_invalid")
        self.assertEqual(result.error.target, "node-missing")

    def test_missing_energy_key_returns_missing_energy(self) -> None:
        scenario = default_core_fixture_scenario()
        bad_options = replace(scenario.energy_options, energy_key="gibbs")

        result = run_core_fixture_vertical_slice(replace(scenario, energy_options=bad_options))

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "missing_energy")
        self.assertEqual(result.error.target, "node-a")

    def test_fixture_output_is_deterministic(self) -> None:
        first = run_core_fixture_vertical_slice()
        second = run_core_fixture_vertical_slice()

        self.assertTrue(first.ok, first.error)
        self.assertTrue(second.ok, second.error)
        self.assertEqual(first.value, second.value)

    def test_fixture_does_not_emit_export_artifacts(self) -> None:
        result = run_core_fixture_vertical_slice()

        self.assertTrue(result.ok, result.error)
        resource_kinds = {resource.kind for resource in result.value.project.resources}  # type: ignore[union-attr]
        self.assertNotIn("export_artifact", resource_kinds)

    def test_fixture_rejects_corrections(self) -> None:
        scenario = default_core_fixture_scenario()
        bad_options = EnergyOptions(
            baseline_node_id=scenario.energy_options.baseline_node_id,
            output_unit=scenario.energy_options.output_unit,
            include_corrections=True,
            energy_key=scenario.energy_options.energy_key,
        )

        result = run_core_fixture_vertical_slice(replace(scenario, energy_options=bad_options))

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "invalid_input")
        self.assertEqual(result.error.target, "energy_options.include_corrections")


if __name__ == "__main__":
    unittest.main()
