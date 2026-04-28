from __future__ import annotations

import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ase import Atoms

from rxnflow.results import apply_charge_multiplicity


class ResultAtomInfoTests(unittest.TestCase):
    def test_apply_charge_multiplicity_sets_charge_and_multiplicity_only(self) -> None:
        atoms = Atoms("H")
        apply_charge_multiplicity(atoms, charge=1, multiplicity=2)
        self.assertEqual(atoms.info["charge"], 1)
        self.assertEqual(atoms.info["multiplicity"], 2)
        self.assertNotIn("spin", atoms.info)


if __name__ == "__main__":
    unittest.main()
