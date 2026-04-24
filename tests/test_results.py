from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ase import Atoms
from ase.io import write

from rxnflow.model import StructureNode, WorkflowConfig, Defaults, ReportConfig
from rxnflow.results import apply_charge_multiplicity, load_atoms_from_node


class ResultMetadataTests(unittest.TestCase):
    def test_apply_charge_multiplicity_sets_spin_alias(self) -> None:
        atoms = Atoms("H")
        apply_charge_multiplicity(atoms, charge=1, multiplicity=2)
        self.assertEqual(atoms.info["charge"], 1)
        self.assertEqual(atoms.info["multiplicity"], 2)
        self.assertEqual(atoms.info["spin"], 2)

    def test_load_atoms_from_node_sets_spin_alias(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            structure_path = tmpdir / "node.xyz"
            write(structure_path, Atoms("H2", positions=[[0, 0, 0], [0.7, 0, 0]]))

            config = WorkflowConfig(
                source_path=tmpdir / "workflow.yaml",
                defaults=Defaults(),
                references=[],
                nodes=[],
                tasks=[],
                report=ReportConfig(),
            )
            node = StructureNode(id="n1", path=str(structure_path), charge=0, multiplicity=3)
            atoms = load_atoms_from_node(config, node)

            self.assertEqual(atoms.info["charge"], 0)
            self.assertEqual(atoms.info["multiplicity"], 3)
            self.assertEqual(atoms.info["spin"], 3)


if __name__ == "__main__":
    unittest.main()
