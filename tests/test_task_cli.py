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
                    model: fake
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
            (task_dir / "input.xyz").write_text(
                "1\nConverted from Gaussian clipboard\nH 1 0 0\n",
                encoding="utf-8",
            )
            (task_dir / "task.yaml").write_text(
                textwrap.dedent(
                    """
                    type: optimize
                    charge: 0
                    multiplicity: 1
                    backend: fake
                    model: fake
                    device: cpu
                    steps: 2
                    """
                ),
                encoding="utf-8",
            )

            self.assertEqual(main(["run-task", str(task_dir)]), 0)
            self.assertTrue((task_dir / "opt.traj").exists())
            self.assertTrue((task_dir / "opt.log").exists())
            self.assertTrue((task_dir / "final.xyz").exists())
            self.assertTrue((task_dir / "opt_traj.xyz").exists())
            self.assertTrue((task_dir / "opt_traj.extxyz").exists())
            self.assertTrue((task_dir / "opt_energies.csv").exists())
            self.assertFalse((task_dir / "metadata.json").exists())
            self.assertFalse((Path(tmp) / "database").exists())
            extxyz_text = (task_dir / "opt_traj.extxyz").read_text(encoding="utf-8")
            self.assertNotIn("Converted", extxyz_text)
            self.assertNotIn("Gaussian", extxyz_text)
            self.assertNotIn("spin=", extxyz_text)
            self.assertIn("backend=fake", extxyz_text)
            self.assertIn("model=fake", extxyz_text)

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
            self.assertTrue((task_dir / "scan_step_000.traj").exists())
            self.assertTrue((task_dir / "scan_step_000.log").exists())
            self.assertTrue((task_dir / "final.xyz").exists())
            self.assertTrue((task_dir / "scan_traj.xyz").exists())
            self.assertTrue((task_dir / "scan_traj.extxyz").exists())
            self.assertTrue((task_dir / "scan_energies.csv").exists())
            self.assertTrue((task_dir / "scan_energy_profile.png").exists())
            self.assertTrue((task_dir / "peak.xyz").exists())
            self.assertFalse((task_dir / "metadata.json").exists())
            self.assertFalse((Path(tmp) / "database").exists())

            with (task_dir / "scan_energies.csv").open("r", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 5)

    def test_run_scan_task_ignores_input_xyz_comment_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            task_dir = Path(tmp) / "task" / "scan_dirty_comment"
            task_dir.mkdir(parents=True)
            (task_dir / "input.xyz").write_text(
                "3\nConverted from Gaussian clipboard\nH 0 0 0\nH 1 0 0\nH 0 1 0\n",
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
                    steps: 2
                    coordinate:
                      type: distance
                      atoms: [1, 2]
                      start: 1.0
                      stop: 1.2
                      steps: 2
                    """
                ),
                encoding="utf-8",
            )

            self.assertEqual(main(["run-task", str(task_dir)]), 0)
            extxyz_text = (task_dir / "scan_traj.extxyz").read_text(encoding="utf-8")
            self.assertNotIn("Converted", extxyz_text)
            self.assertNotIn("Gaussian", extxyz_text)
            self.assertNotIn("spin=", extxyz_text)
            self.assertIn("backend=fake", extxyz_text)
            self.assertIn("model=fake-distance-barrier", extxyz_text)

    def test_run_neb_task_writes_task_local_band_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            task_dir = Path(tmp) / "task" / "neb_h2"
            task_dir.mkdir(parents=True)
            initial_xyz = "2\nConverted from Gaussian clipboard\nH 0 0 0\nH 1 0 0\n"
            final_xyz = "2\nConverted from Gaussian clipboard\nH 0 0 0\nH 3 0 0\n"
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
                    intermediate_images: 3
                    """
                ),
                encoding="utf-8",
            )

            self.assertEqual(main(["run-task", str(task_dir)]), 0)
            self.assertTrue((task_dir / "initial_opt.traj").exists())
            self.assertTrue((task_dir / "initial_opt.log").exists())
            self.assertTrue((task_dir / "initial_opt.xyz").exists())
            self.assertTrue((task_dir / "initial_opt_traj.xyz").exists())
            self.assertTrue((task_dir / "initial_opt_traj.extxyz").exists())
            self.assertTrue((task_dir / "initial_opt_energies.csv").exists())
            self.assertTrue((task_dir / "final_opt.traj").exists())
            self.assertTrue((task_dir / "final_opt.log").exists())
            self.assertTrue((task_dir / "final_opt.xyz").exists())
            self.assertTrue((task_dir / "final_opt_traj.xyz").exists())
            self.assertTrue((task_dir / "final_opt_traj.extxyz").exists())
            self.assertTrue((task_dir / "final_opt_energies.csv").exists())
            self.assertTrue((task_dir / "neb.traj").exists())
            self.assertTrue((task_dir / "neb.log").exists())
            self.assertTrue((task_dir / "image" / "image_01.traj").exists())
            self.assertTrue((task_dir / "neb_initial_path.xyz").exists())
            self.assertTrue((task_dir / "neb_traj.xyz").exists())
            self.assertTrue((task_dir / "neb_traj.extxyz").exists())
            self.assertTrue((task_dir / "neb_final_path.xyz").exists())
            self.assertTrue((task_dir / "neb_final_path.extxyz").exists())
            self.assertTrue((task_dir / "image" / "image_00.xyz").exists())
            self.assertTrue((task_dir / "neb_energies.csv").exists())
            self.assertTrue((task_dir / "neb_energy_profile.png").exists())
            self.assertTrue((task_dir / "peak.xyz").exists())
            self.assertFalse((task_dir / "metadata.json").exists())
            self.assertFalse((Path(tmp) / "database").exists())

            neb_frames = read(task_dir / "neb.traj", index=":")
            self.assertGreaterEqual(len(neb_frames), 5)
            self.assertEqual(len(neb_frames) % 5, 0)

            with (task_dir / "neb_energies.csv").open("r", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 5)
            for filename in [
                "initial_opt_traj.extxyz",
                "final_opt_traj.extxyz",
                "neb_final_path.extxyz",
            ]:
                extxyz_text = (task_dir / filename).read_text(encoding="utf-8")
                self.assertNotIn("Converted", extxyz_text)
                self.assertNotIn("Gaussian", extxyz_text)
                self.assertNotIn("spin=", extxyz_text)
                self.assertIn("backend=fake", extxyz_text)
                self.assertIn("model=fake-distance-barrier", extxyz_text)


if __name__ == "__main__":
    unittest.main()
