from __future__ import annotations

import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ase import Atoms

from rxnflow.calculators.base import CalculatorSettings
from rxnflow.calculators.factory import build_calculator_from_settings, get_backend
from rxnflow.errors import RxnFlowError
from rxnflow.execution import apply_calculator_metadata


class CalculatorTests(unittest.TestCase):
    def test_unknown_backend_fails(self) -> None:
        with self.assertRaisesRegex(RxnFlowError, "Unknown calculator backend 'nope'"):
            get_backend("nope")

    def test_fake_backend_builds_calculator_from_task_settings(self) -> None:
        settings = CalculatorSettings(
            backend="fake",
            model="fake-override",
            device="cpu",
            task_name="omol",
            charge=1,
            multiplicity=4,
        )
        calculator = build_calculator_from_settings(settings)
        self.assertEqual(settings.backend, "fake")
        self.assertEqual(settings.model, "fake-override")
        self.assertEqual(settings.device, "cpu")
        self.assertEqual(settings.charge, 1)
        self.assertEqual(settings.multiplicity, 4)
        self.assertEqual(calculator.settings.backend, "fake")
        self.assertEqual(calculator.settings.model, "fake-override")
        self.assertEqual(calculator.settings.charge, 1)
        self.assertEqual(calculator.settings.multiplicity, 4)

    def test_uma_metadata_sets_fairchem_spin_key(self) -> None:
        atoms = Atoms("H")
        settings = CalculatorSettings(
            backend="uma",
            model="uma-s-1p1",
            device="cpu",
            task_name="omol",
            charge=0,
            multiplicity=2,
        )

        apply_calculator_metadata(atoms, settings)

        self.assertEqual(atoms.info["charge"], 0)
        self.assertEqual(atoms.info["multiplicity"], 2)
        self.assertEqual(atoms.info["backend"], "uma")
        self.assertEqual(atoms.info["model"], "uma-s-1p1")
        self.assertEqual(atoms.info["task_name"], "omol")
        self.assertEqual(atoms.info["spin"], 2)

    def test_non_uma_metadata_does_not_set_spin_key(self) -> None:
        atoms = Atoms("H")
        settings = CalculatorSettings(
            backend="fake",
            model="fake-base",
            device="cpu",
            task_name="omol",
            charge=0,
            multiplicity=2,
        )

        apply_calculator_metadata(atoms, settings)

        self.assertEqual(atoms.info["charge"], 0)
        self.assertEqual(atoms.info["multiplicity"], 2)
        self.assertEqual(atoms.info["backend"], "fake")
        self.assertEqual(atoms.info["model"], "fake-base")
        self.assertEqual(atoms.info["task_name"], "omol")
        self.assertNotIn("spin", atoms.info)


if __name__ == "__main__":
    unittest.main()
