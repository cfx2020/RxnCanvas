from __future__ import annotations

import csv
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ase.io import read

from rxnflow.cli import main


class TaskCliTests(unittest.TestCase):
    def test_validate_task_accepts_task_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            task_dir = Path(tmp) / "task" / "opt_h"
            task_dir.mkdir(parents=True)
            (task_dir / "input.xyz").write_text("1\n\nH 0 0 0\n", encoding="utf-8")
            (task_dir / "task.yaml").write_text(
                textwrap.dedent(
                    """
                    type: optimize
                    charge: 0
                    multiplicity: 1
                    backend: fake
                    device: cpu
                    steps: 2
                    """
                ),
                encoding="utf-8",
            )

            self.assertEqual(main(["validate-task", str(task_dir)]), 0)

    def test_run_task_writes_only_task_local_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            task_dir = Path(tmp) / "task" / "opt_h"
            task_dir.mkdir(parents=True)
            (task_dir / "input.xyz").write_text("1\n\nH 1 0 0\n", encoding="utf-8")
            (task_dir / "task.yaml").write_text(
                textwrap.dedent(
                    """
                    type: optimize
                    charge: 0
                    multiplicity: 1
                    backend: fake
                    device: cpu
                    steps: 2
                    """
                ),
                encoding="utf-8",
            )

            self.assertEqual(main(["run-task", str(task_dir)]), 0)
            self.assertTrue((task_dir / "ase" / "optimize.traj").exists())
            self.assertTrue((task_dir / "ase" / "optimize.log").exists())
            self.assertTrue((task_dir / "inspect" / "final.xyz").exists())
            self.assertTrue((task_dir / "inspect" / "trajectory.xyz").exists())
            self.assertTrue((task_dir / "inspect" / "energies.csv").exists())
            self.assertFalse((task_dir / "metadata.json").exists())
            self.assertFalse((Path(tmp) / "database").exists())

    def test_run_scan_task_writes_task_local_candidate_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            task_dir = Path(tmp) / "task" / "scan_h3"
            task_dir.mkdir(parents=True)
            (task_dir / "input.xyz").write_text(
                "3\n\nH 0 0 0\nH 1 0 0\nH 0 1 0\n",
                encoding="utf-8",
            )
            (task_dir / "task.yaml").write_text(
                textwrap.dedent(
                    """
                    type: scan
                    charge: 0
                    multiplicity: 1
                    backend: fake
                    model: fake-distance-barrier
                    device: cpu
                    fmax: 0.001
                    steps: 25
                    coordinate:
                      type: distance
                      atoms: [1, 2]
                      start: 1.0
                      stop: 3.0
                      steps: 5
                    """
                ),
                encoding="utf-8",
            )

            self.assertEqual(main(["run-task", str(task_dir)]), 0)
            self.assertTrue((task_dir / "ase" / "scan_step_000.traj").exists())
            self.assertTrue((task_dir / "ase" / "scan_step_000.log").exists())
            self.assertTrue((task_dir / "inspect" / "final.xyz").exists())
            self.assertTrue((task_dir / "inspect" / "trajectory.xyz").exists())
            self.assertTrue((task_dir / "inspect" / "energies.csv").exists())
            self.assertTrue((task_dir / "inspect" / "peak.xyz").exists())
            self.assertFalse((task_dir / "metadata.json").exists())
            self.assertFalse((Path(tmp) / "database").exists())

            with (task_dir / "inspect" / "energies.csv").open("r", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 5)

    def test_run_neb_task_writes_task_local_band_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            task_dir = Path(tmp) / "task" / "neb_h2"
            task_dir.mkdir(parents=True)
            initial_xyz = "2\n\nH 0 0 0\nH 1 0 0\n"
            final_xyz = "2\n\nH 0 0 0\nH 3 0 0\n"
            (task_dir / "initial.xyz").write_text(initial_xyz, encoding="utf-8")
            (task_dir / "final.xyz").write_text(final_xyz, encoding="utf-8")
            (task_dir / "task.yaml").write_text(
                textwrap.dedent(
                    """
                    type: neb
                    charge: 0
                    multiplicity: 1
                    backend: fake
                    model: fake-distance-barrier
                    device: cpu
                    fmax: 0.001
                    steps: 25
                    initial: initial.xyz
                    final: final.xyz
                    images: 3
                    """
                ),
                encoding="utf-8",
            )

            self.assertEqual(main(["run-task", str(task_dir)]), 0)
            self.assertTrue((task_dir / "ase" / "neb.traj").exists())
            self.assertTrue((task_dir / "ase" / "neb.log").exists())
            self.assertTrue((task_dir / "ase" / "image_01.traj").exists())
            self.assertTrue((task_dir / "inspect" / "initial_band.xyz").exists())
            self.assertTrue((task_dir / "inspect" / "band.xyz").exists())
            self.assertTrue((task_dir / "inspect" / "images" / "image_00.xyz").exists())
            self.assertTrue((task_dir / "inspect" / "energies.csv").exists())
            self.assertTrue((task_dir / "inspect" / "peak.xyz").exists())
            self.assertFalse((task_dir / "metadata.json").exists())
            self.assertFalse((Path(tmp) / "database").exists())

            neb_frames = read(task_dir / "ase" / "neb.traj", index=":")
            self.assertGreaterEqual(len(neb_frames), 5)
            self.assertEqual(len(neb_frames) % 5, 0)

            with (task_dir / "inspect" / "energies.csv").open("r", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 5)


if __name__ == "__main__":
    unittest.main()
