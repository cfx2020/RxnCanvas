from __future__ import annotations

import csv
import tempfile
import textwrap
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ase import Atoms
from ase.io import write

from rxnflow.cli import main


def write_yaml(tmpdir: Path, content: str) -> Path:
    path = tmpdir / "workflow.yaml"
    path.write_text(textwrap.dedent(content), encoding="utf-8")
    return path


class OptimizeExecutionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir_ctx = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self.tmpdir_ctx.name)
        structures = self.tmpdir / "structures"
        structures.mkdir()
        atoms = Atoms("H2", positions=[[1.5, 0.0, 0.0], [2.0, 0.0, 0.0]])
        write(structures / "im1.xyz", atoms)

    def tearDown(self) -> None:
        self.tmpdir_ctx.cleanup()

    def test_optimize_writes_raw_and_inspection_artifacts(self) -> None:
        config_path = write_yaml(
            self.tmpdir,
            """
            defaults:
              backend: fake
              device: cpu
              fmax: 0.001
              steps: 50
              output_root: .
            nodes:
              - id: im1
                path: ./structures/im1.xyz
                charge: 0
                multiplicity: 1
            tasks:
              - id: opt_im1
                type: optimize
                input: im1
            """,
        )
        exit_code = main(["run", str(config_path)])
        self.assertEqual(exit_code, 0)

        task_dir = self.tmpdir / "runs" / "tasks" / "opt_im1"
        self.assertTrue((task_dir / "task.yaml").exists())
        self.assertTrue((task_dir / "input.xyz").exists())
        self.assertTrue((task_dir / "ase" / "optimize.traj").exists())
        self.assertTrue((task_dir / "ase" / "optimize.log").exists())
        self.assertTrue((task_dir / "inspect" / "final.xyz").exists())
        self.assertTrue((task_dir / "inspect" / "trajectory.xyz").exists())
        self.assertTrue((task_dir / "inspect" / "energies.csv").exists())
        self.assertFalse((task_dir / "metadata.json").exists())

        with (task_dir / "inspect" / "energies.csv").open("r", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        self.assertGreaterEqual(len(rows), 1)
        last_energy = float(rows[-1]["energy"])
        self.assertLess(last_energy, 1e-6)


if __name__ == "__main__":
    unittest.main()
