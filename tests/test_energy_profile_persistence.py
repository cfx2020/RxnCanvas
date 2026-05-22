from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from rxnflow.content_store import (
    ENERGY_PROFILES_PATH,
    ProjectContentSnapshot,
    ProjectContentStore,
)
from rxnflow.energy import EnergyProfileEngine
from rxnflow.energy_profile_codec import (
    ENERGY_PROFILES_SCHEMA_VERSION,
    energy_profiles_section_from_dict,
    energy_profiles_section_to_dict,
)
from rxnflow.models import ChemicalObject, CorrectionPolicy, EnergyOptions, EnergyValue, ReactionGraph, ReactionNode, ReactionPath


PROJECT_ID = "project-a"


class EnergyProfilePersistenceTest(unittest.TestCase):
    def test_engine_profile_with_missing_point_and_warning_round_trips(self) -> None:
        graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            ReactionNode("node-b", "species", "B", ("object-b",)),
            path=("node-a", "node-b"),
        )
        profile = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (_object("object-a", -100.0), _object_without_energy("object-b")),
            _options(),
        ).value
        assert profile is not None

        section = energy_profiles_section_to_dict(PROJECT_ID, (profile,), graphs=(graph,))

        self.assertTrue(section.ok, section.error)
        payload = section.value
        assert payload is not None
        self.assertEqual(payload["schema_version"], ENERGY_PROFILES_SCHEMA_VERSION)
        self.assertEqual(payload["profiles"][0]["options"]["energy_source"], "auto")
        self.assertIsNone(payload["profiles"][0]["options"]["correction_policy"])
        self.assertEqual(payload["profiles"][0]["points"][1]["missing_reason"], "missing_energy")
        self.assertIsNone(payload["profiles"][0]["points"][1]["absolute_energy"])
        self.assertIsNone(payload["profiles"][0]["points"][1]["expression"]["total"])
        self.assertEqual(payload["profiles"][0]["points"][1]["expression"]["missing"][0]["object_id"], "object-b")
        self.assertEqual(payload["profiles"][0]["warnings"][0]["target"], "node-b")

        restored = energy_profiles_section_from_dict(PROJECT_ID, payload, graphs=(graph,))

        self.assertTrue(restored.ok, restored.error)
        restored_profile = restored.value[0]  # type: ignore[index]
        self.assertEqual(restored_profile.options.baseline_node_id, "node-a")
        self.assertEqual(restored_profile.options.energy_source, "auto")
        self.assertEqual(restored_profile.points[1].missing_reason, "missing_energy")
        self.assertIsNone(restored_profile.points[1].relative_energy)
        self.assertIsNone(restored_profile.points[1].expression.total)  # type: ignore[union-attr]
        self.assertEqual(restored_profile.warnings[0].code, "missing_energy")

    def test_content_store_persists_energy_profiles_with_stable_checksum(self) -> None:
        graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            ReactionNode("node-b", "species", "B", ("object-b",)),
            path=("node-a", "node-b"),
        )
        objects = (_object("object-a", -100.0), _object("object-b", -99.98))
        profile = EnergyProfileEngine().compute_profile(PROJECT_ID, graph, "path-main", objects, _options()).value
        assert profile is not None
        snapshot = ProjectContentSnapshot(
            project_id=PROJECT_ID,
            chemical_objects=objects,
            reaction_graphs=(graph,),
            energy_profiles=(profile,),
        )

        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            store = ProjectContentStore()
            saved = store.save_snapshot(root, snapshot)
            repeated = store.save_snapshot(root, snapshot)

            self.assertTrue(saved.ok, saved.error)
            self.assertTrue(repeated.ok, repeated.error)
            energy_file = next(file for file in saved.value.files if file.kind == "energy_profiles")  # type: ignore[union-attr]
            repeated_file = next(file for file in repeated.value.files if file.kind == "energy_profiles")  # type: ignore[union-attr]
            self.assertEqual(energy_file.path, ENERGY_PROFILES_PATH)
            self.assertEqual(energy_file.checksum, repeated_file.checksum)

            section = json.loads((root / ENERGY_PROFILES_PATH).read_text(encoding="utf-8"))
            self.assertEqual(section["profiles"][0]["points"][0]["absolute_energy"]["unit"], "kcal_mol")
            self.assertEqual(section["profiles"][0]["points"][0]["expression"]["terms"][0]["raw_energy"]["unit"], "hartree")
            loaded = store.load_snapshot(root)

            self.assertTrue(loaded.ok, loaded.error)
            restored_profile = loaded.value.energy_profiles[0]  # type: ignore[union-attr]
            self.assertEqual(restored_profile.id, profile.id)
            self.assertEqual(restored_profile.points[1].relative_energy, EnergyValue(12.55018948, "kcal_mol"))

    def test_section_validation_errors_are_structured(self) -> None:
        graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            ReactionNode("node-b", "species", "B", ("object-b",)),
            path=("node-a", "node-b"),
        )
        profile = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (_object("object-a", -100.0), _object_without_energy("object-b")),
            _options(),
        ).value
        assert profile is not None
        valid = energy_profiles_section_to_dict(PROJECT_ID, (profile,), graphs=(graph,)).value
        assert valid is not None

        cases = (
            ({**valid, "schema_version": "energy-profiles-v2"}, (graph,), "invalid_input", "energy_profiles"),
            ({**valid, "project_id": "project-b"}, (graph,), "invalid_input", "energy_profiles"),
            ({**valid, "profiles": [valid["profiles"][0], valid["profiles"][0]]}, (graph,), "invalid_input", profile.id),
            (_with_profile_patch(valid, {"options": {**valid["profiles"][0]["options"], "output_unit": "hartree"}}), (graph,), "invalid_input", "profiles[0].options.output_unit"),
            (_with_profile_patch(valid, {"options": {**valid["profiles"][0]["options"], "energy_key": ""}}), (graph,), "invalid_input", "profiles[0].options.energy_key"),
            (_with_profile_patch(valid, {"options": {**valid["profiles"][0]["options"], "energy_source": "bad-source"}}), (graph,), "invalid_input", "profiles[0].options.energy_source"),
            (_with_profile_patch(valid, {"options": {**valid["profiles"][0]["options"], "correction_policy": {"mode": "bad"}}}), (graph,), "invalid_input", "profiles[0].options.correction_policy.mode"),
            (_with_point_patch(valid, 0, {"absolute_energy": -62750.9474}), (graph,), "invalid_input", "profiles[0].points[0].absolute_energy"),
            (_with_point_patch(valid, 0, {"absolute_energy": {"value": 1, "unit": "hartree", "reference": None}}), (graph,), "invalid_input", "profiles[0].points[0].absolute_energy.unit"),
            (_with_point_patch(valid, 0, {"relative_energy": None}), (graph,), "invalid_input", "profiles[0].points[0]"),
            (
                _with_point_patch(
                    valid,
                    1,
                    {"absolute_energy": {"value": 1, "unit": "kcal_mol", "reference": None}},
                ),
                (graph,),
                "invalid_input",
                "profiles[0].points[1]",
            ),
            (_with_profile_patch(valid, {"warnings": [{"code": "missing_message"}]}), (graph,), "invalid_input", "profiles[0].warnings[0]"),
            (valid, (), "graph_invalid", "graph-main"),
            (valid, (replace(graph, paths=(ReactionPath("path-other", "other", ("node-a", "node-b")),)),), "graph_invalid", "path-main"),
            (_with_points(valid, list(reversed(valid["profiles"][0]["points"]))), (graph,), "graph_invalid", "path-main"),
            (_with_profile_patch(valid, {"options": {**valid["profiles"][0]["options"], "baseline_node_id": "node-missing"}}), (graph,), "graph_invalid", "node-missing"),
        )

        for section, graphs, code, target in cases:
            with self.subTest(target=target):
                result = energy_profiles_section_from_dict(PROJECT_ID, section, graphs=graphs)
                self.assert_error(result, code, target)

    def test_non_structured_warning_is_rejected_instead_of_dropped(self) -> None:
        graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            path=("node-a",),
        )
        profile = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (_object("object-a", -100.0),),
            _options(),
        ).value
        assert profile is not None
        invalid_profile = replace(profile, warnings=("not-structured",))

        result = energy_profiles_section_to_dict(PROJECT_ID, (invalid_profile,), graphs=(graph,))

        self.assert_error(result, "invalid_input", "profiles[0].warnings[0]")

    def test_energy_source_round_trips_and_legacy_options_default_to_auto(self) -> None:
        graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            ReactionNode("node-b", "species", "B", ("object-b",)),
            path=("node-a", "node-b"),
        )
        profile = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (
                _object("object-a", -100.0, thermochemistry={"gibbs": EnergyValue(-99.90, "hartree")}),
                _object("object-b", -100.0, thermochemistry={"gibbs": EnergyValue(-99.88, "hartree")}),
            ),
            replace(_options(), energy_key="gibbs", energy_source="thermochemistry"),
        ).value
        assert profile is not None

        section = energy_profiles_section_to_dict(PROJECT_ID, (profile,), graphs=(graph,)).value
        assert section is not None
        self.assertEqual(section["profiles"][0]["options"]["energy_source"], "thermochemistry")

        restored = energy_profiles_section_from_dict(PROJECT_ID, section, graphs=(graph,))
        self.assertTrue(restored.ok, restored.error)
        self.assertEqual(restored.value[0].options.energy_source, "thermochemistry")  # type: ignore[index]

        legacy = deepcopy(section)
        del legacy["profiles"][0]["options"]["energy_source"]  # type: ignore[index]
        restored_legacy = energy_profiles_section_from_dict(PROJECT_ID, legacy, graphs=(graph,))
        self.assertTrue(restored_legacy.ok, restored_legacy.error)
        self.assertEqual(restored_legacy.value[0].options.energy_source, "auto")  # type: ignore[index]

    def test_correction_policy_round_trips_and_legacy_options_default_to_none(self) -> None:
        graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            path=("node-a",),
        )
        profile = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (_object("object-a", -100.0),),
            replace(
                _options(),
                include_corrections=True,
                correction_policy=CorrectionPolicy(mode="kinds", kinds=("solvation",)),
            ),
        ).value
        assert profile is not None

        section = energy_profiles_section_to_dict(PROJECT_ID, (profile,), graphs=(graph,)).value
        assert section is not None
        self.assertEqual(section["profiles"][0]["options"]["correction_policy"]["mode"], "kinds")
        self.assertEqual(section["profiles"][0]["options"]["correction_policy"]["kinds"], ["solvation"])

        restored = energy_profiles_section_from_dict(PROJECT_ID, section, graphs=(graph,))
        self.assertTrue(restored.ok, restored.error)
        policy = restored.value[0].options.correction_policy  # type: ignore[index]
        assert policy is not None
        self.assertEqual(policy.mode, "kinds")
        self.assertEqual(policy.kinds, ("solvation",))

        legacy = deepcopy(section)
        del legacy["profiles"][0]["options"]["correction_policy"]  # type: ignore[index]
        restored_legacy = energy_profiles_section_from_dict(PROJECT_ID, legacy, graphs=(graph,))
        self.assertTrue(restored_legacy.ok, restored_legacy.error)
        self.assertIsNone(restored_legacy.value[0].options.correction_policy)  # type: ignore[index]

    def test_legacy_points_without_expression_load_as_none(self) -> None:
        graph = _graph(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            path=("node-a",),
        )
        profile = EnergyProfileEngine().compute_profile(
            PROJECT_ID,
            graph,
            "path-main",
            (_object("object-a", -100.0),),
            _options(),
        ).value
        assert profile is not None
        section = energy_profiles_section_to_dict(PROJECT_ID, (profile,), graphs=(graph,)).value
        assert section is not None
        del section["profiles"][0]["points"][0]["expression"]  # type: ignore[index]

        restored = energy_profiles_section_from_dict(PROJECT_ID, section, graphs=(graph,))

        self.assertTrue(restored.ok, restored.error)
        self.assertIsNone(restored.value[0].points[0].expression)  # type: ignore[index]

    def test_scope_guard_does_not_recompute_or_touch_other_domains(self) -> None:
        sources = (
            Path("rxnflow/content_store.py").read_text(encoding="utf-8"),
            Path("rxnflow/energy_profile_codec.py").read_text(encoding="utf-8"),
        )
        forbidden = (
            "EnergyProfileEngine",
            "compute_profile",
            "ParserRegistry",
            "ImportRegistryWorkflow",
            "ChemicalRegistry",
            "ReactionGraphService",
            "apply_patch",
            "ReportExportService",
            "ProjectResource(",
            "inputs/raw",
        )

        for source in sources:
            for value in forbidden:
                self.assertNotIn(value, source)

    def assert_error(self, result: object, code: str, target: str) -> None:
        self.assertFalse(result.ok)  # type: ignore[attr-defined]
        self.assertIsNotNone(result.error)  # type: ignore[attr-defined]
        self.assertEqual(result.error.code, code)  # type: ignore[attr-defined]
        self.assertEqual(result.error.target, target)  # type: ignore[attr-defined]


def _options() -> EnergyOptions:
    return EnergyOptions(output_unit="kcal_mol", include_corrections=False, energy_key="electronic")


def _graph(*nodes: ReactionNode, path: tuple[str, ...]) -> ReactionGraph:
    return ReactionGraph(
        id="graph-main",
        project_id=PROJECT_ID,
        nodes=nodes,
        paths=(ReactionPath("path-main", "main", path),),
    )


def _object(
    object_id: str,
    electronic: float,
    thermochemistry: dict[str, EnergyValue] | None = None,
) -> ChemicalObject:
    return ChemicalObject(
        id=object_id,
        label=object_id,
        energies={"electronic": EnergyValue(electronic, "hartree")},
        thermochemistry=thermochemistry or {},
        registry_fingerprint=object_id,
    )


def _object_without_energy(object_id: str) -> ChemicalObject:
    return ChemicalObject(id=object_id, label=object_id, registry_fingerprint=object_id)


def _with_profile_patch(section: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    updated = deepcopy(section)
    updated["profiles"][0].update(patch)  # type: ignore[index,union-attr]
    return updated


def _with_point_patch(section: dict[str, object], index: int, patch: dict[str, object]) -> dict[str, object]:
    updated = deepcopy(section)
    updated["profiles"][0]["points"][index].update(patch)  # type: ignore[index,union-attr]
    return updated


def _with_points(section: dict[str, object], points: list[object]) -> dict[str, object]:
    return _with_profile_patch(section, {"points": points})


if __name__ == "__main__":
    unittest.main()
