from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ase import Atoms
from ase.constraints import FixAtoms, FixInternals
from ase.io import write

from rxnflow.cli import main
from rxnflow.constraints import build_constraints
from rxnflow.model import ConstraintSpec, ScanCoordinate


class ScanExecutionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir_ctx = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self.tmpdir_ctx.name)
        self.task_dir = self.tmpdir / "task" / "scan_path"
        self.task_dir.mkdir(parents=True)
        atoms = Atoms(
            "H3",
            positions=[
                [0.0, 0.0, 0.0],
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
            ],
        )
        write(self.task_dir / "input.xyz", atoms)
        (self.task_dir / "task.yaml").write_text(
            "\n".join(
                [
                    "type: scan",
                    "charge: 0",
                    "multiplicity: 1",
                    "backend: fake",
                    "model: fake-distance-barrier",
                    "device: cpu",
                    "fmax: 0.001",
                    "steps: 25",
                    "coordinate:",
                    "  type: distance",
                    "  atoms: [1, 2]",
                    "  start: 1.0",
                    "  stop: 3.0",
                    "  steps: 5",
                    "",
                ]
            ),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.tmpdir_ctx.cleanup()

    def test_distance_constraints_use_fix_internals(self) -> None:
        constraints = build_constraints(
            coordinate=ScanCoordinate(type="distance", atoms=[1, 2], start=1.1, stop=1.1, steps=2),
            auxiliary_constraints=[ConstraintSpec(type="freeze_atoms", atoms=[1], value=None)],
        )

        self.assertEqual(len(constraints), 2)
        self.assertIsInstance(constraints[0], FixAtoms)
        self.assertIsInstance(constraints[1], FixInternals)
        self.assertEqual(constraints[1].bonds, [[1.1, [0, 1]]])

    def test_scan_writes_raw_and_inspection_artifacts(self) -> None:
        exit_code = main(["run-task", str(self.task_dir)])
        self.assertEqual(exit_code, 0)

        task_dir = self.task_dir
        self.assertTrue((task_dir / "task.yaml").exists())
        self.assertTrue((task_dir / "input.xyz").exists())
        self.assertTrue((task_dir / "scan_step_000.traj").exists())
        self.assertTrue((task_dir / "scan_step_000.log").exists())
        self.assertTrue((task_dir / "final.xyz").exists())
        self.assertTrue((task_dir / "scan_traj.xyz").exists())
        self.assertTrue((task_dir / "scan_traj.extxyz").exists())
        self.assertTrue((task_dir / "scan_energies.csv").exists())
        self.assertTrue((task_dir / "scan_energy_profile.png").exists())
        self.assertTrue((task_dir / "peak.xyz").exists())
        self.assertFalse((task_dir / "metadata.json").exists())

        with (task_dir / "scan_energies.csv").open("r", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 5)
        energies = [float(row["energy_eV"]) for row in rows]
        peak_index = max(range(len(energies)), key=energies.__getitem__)
        self.assertEqual(peak_index, 2)


if __name__ == "__main__":
    unittest.main()
