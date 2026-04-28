from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ase import Atoms
from ase.io import write

from rxnflow.cli import main


class OptimizeExecutionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir_ctx = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self.tmpdir_ctx.name)
        self.task_dir = self.tmpdir / "task" / "opt_im1"
        self.task_dir.mkdir(parents=True)
        atoms = Atoms("H2", positions=[[1.5, 0.0, 0.0], [2.0, 0.0, 0.0]])
        write(self.task_dir / "input.xyz", atoms)
        (self.task_dir / "task.yaml").write_text(
            "\n".join(
                [
                    "type: optimize",
                    "charge: 0",
                    "multiplicity: 1",
                    "backend: fake",
                    "device: cpu",
                    "fmax: 0.001",
                    "steps: 50",
                    "",
                ]
            ),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.tmpdir_ctx.cleanup()

    def test_optimize_writes_raw_and_inspection_artifacts(self) -> None:
        exit_code = main(["run-task", str(self.task_dir)])
        self.assertEqual(exit_code, 0)

        task_dir = self.task_dir
        self.assertTrue((task_dir / "task.yaml").exists())
        self.assertTrue((task_dir / "input.xyz").exists())
        self.assertTrue((task_dir / "opt.traj").exists())
        self.assertTrue((task_dir / "opt.log").exists())
        self.assertTrue((task_dir / "final.xyz").exists())
        self.assertTrue((task_dir / "opt_traj.xyz").exists())
        self.assertTrue((task_dir / "opt_traj.extxyz").exists())
        self.assertTrue((task_dir / "opt_energies.csv").exists())
        self.assertFalse((task_dir / "metadata.json").exists())

        with (task_dir / "opt_energies.csv").open("r", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        self.assertGreaterEqual(len(rows), 1)
        last_energy = float(rows[-1]["energy_eV"])
        self.assertLess(last_energy, 1e-6)


if __name__ == "__main__":
    unittest.main()
