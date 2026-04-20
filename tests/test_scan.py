from __future__ import annotations

import csv
import json
import tempfile
import textwrap
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ase import Atoms
from ase.constraints import FixAtoms, FixBondLengths
from ase.io import write

from mlrxn_workflow.cli import main
from mlrxn_workflow.constraints import build_constraints
from mlrxn_workflow.model import ConstraintSpec, ScanCoordinate


def write_yaml(tmpdir: Path, content: str) -> Path:
    path = tmpdir / "workflow.yaml"
    path.write_text(textwrap.dedent(content), encoding="utf-8")
    return path


class ScanExecutionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir_ctx = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self.tmpdir_ctx.name)
        structures = self.tmpdir / "structures"
        structures.mkdir()
        atoms = Atoms("H2", positions=[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]])
        write(structures / "im1.xyz", atoms)

    def tearDown(self) -> None:
        self.tmpdir_ctx.cleanup()

    def test_distance_constraints_raise_fix_bond_lengths_iteration_budget(self) -> None:
        constraints = build_constraints(
            coordinate=ScanCoordinate(type="distance", atoms=[1, 2], start=1.1, stop=1.1, steps=2),
            auxiliary_constraints=[ConstraintSpec(type="freeze_atoms", atoms=[1], value=None)],
        )

        self.assertEqual(len(constraints), 2)
        self.assertIsInstance(constraints[0], FixAtoms)
        self.assertIsInstance(constraints[1], FixBondLengths)
        self.assertEqual(constraints[1].pairs.tolist(), [[0, 1]])
        self.assertEqual(constraints[1].maxiter, 5000)

    def test_scan_writes_trajectory_energy_table_and_ts_like_candidate(self) -> None:
        config_path = write_yaml(
            self.tmpdir,
            """
            defaults:
              backend: fake
              model: fake-distance-barrier
              device: cpu
              fmax: 0.001
              max_steps: 25
              output_root: .
            nodes:
              - id: im1
                path: ./structures/im1.xyz
                charge: 0
                multiplicity: 1
            tasks:
              - id: scan_path
                type: scan
                input: im1
                coordinate:
                  type: distance
                  atoms: [1, 2]
                  start: 1.0
                  stop: 3.0
                  steps: 5
            """,
        )
        exit_code = main(["run", str(config_path)])
        self.assertEqual(exit_code, 0)

        task_dir = self.tmpdir / "runs" / "tasks" / "scan_path"
        self.assertTrue((task_dir / "result.xyz").exists())
        self.assertTrue((task_dir / "trajectory.xyz").exists())
        self.assertTrue((task_dir / "energies.csv").exists())
        self.assertTrue((task_dir / "ts_like.xyz").exists())

        with (task_dir / "energies.csv").open("r", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 5)
        energies = [float(row["energy"]) for row in rows]
        peak_index = max(range(len(energies)), key=energies.__getitem__)
        self.assertEqual(peak_index, 2)

        with (task_dir / "metadata.json").open("r", encoding="utf-8") as handle:
            metadata = json.load(handle)
        self.assertEqual(metadata["summary"]["peak_index"], 2)
        self.assertEqual(metadata["summary"]["peak_coordinate"], 2.0)


if __name__ == "__main__":
    unittest.main()
