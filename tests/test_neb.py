from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ase import Atoms
from ase.io import read, write

from rxnflow.cli import main


class NebExecutionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir_ctx = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self.tmpdir_ctx.name)
        self.task_dir = self.tmpdir / "task" / "neb_path"
        self.task_dir.mkdir(parents=True)
        write(self.task_dir / "initial.xyz", Atoms("H2", positions=[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]]))
        write(self.task_dir / "final.xyz", Atoms("H2", positions=[[0.0, 0.0, 0.0], [3.0, 0.0, 0.0]]))
        (self.task_dir / "task.yaml").write_text(
            "\n".join(
                [
                    "type: neb",
                    "charge: 0",
                    "multiplicity: 1",
                    "backend: fake",
                    "model: fake-distance-barrier",
                    "device: cpu",
                    "fmax: 0.001",
                    "steps: 25",
                    "initial: initial.xyz",
                    "final: final.xyz",
                    "intermediate_images: 3",
                    "",
                ]
            ),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.tmpdir_ctx.cleanup()

    def test_neb_writes_raw_and_inspection_artifacts(self) -> None:
        exit_code = main(["run-task", str(self.task_dir)])
        self.assertEqual(exit_code, 0)

        task_dir = self.task_dir
        self.assertTrue((task_dir / "task.yaml").exists())
        self.assertTrue((task_dir / "initial.xyz").exists())
        self.assertTrue((task_dir / "final.xyz").exists())
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
        self.assertTrue((task_dir / "image" / "image_02.traj").exists())
        self.assertTrue((task_dir / "neb_initial_path.xyz").exists())
        self.assertTrue((task_dir / "neb_traj.xyz").exists())
        self.assertTrue((task_dir / "neb_traj.extxyz").exists())
        self.assertTrue((task_dir / "neb_final_path.xyz").exists())
        self.assertTrue((task_dir / "neb_final_path.extxyz").exists())
        self.assertTrue((task_dir / "image" / "image_02.xyz").exists())
        self.assertTrue((task_dir / "neb_energies.csv").exists())
        self.assertTrue((task_dir / "neb_energy_profile.png").exists())
        self.assertTrue((task_dir / "peak.xyz").exists())
        self.assertFalse((task_dir / "metadata.json").exists())

        neb_frames = read(task_dir / "neb.traj", index=":")
        self.assertGreaterEqual(len(neb_frames), 5)
        self.assertEqual(len(neb_frames) % 5, 0)
        initial_opt_frames = read(task_dir / "initial_opt.traj", index=":")
        final_opt_frames = read(task_dir / "final_opt.traj", index=":")
        self.assertGreaterEqual(len(initial_opt_frames), 1)
        self.assertGreaterEqual(len(final_opt_frames), 1)

        with (task_dir / "neb_energies.csv").open("r", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 5)
        energies = [float(row["energy_eV"]) for row in rows]
        peak_index = max(range(len(energies)), key=energies.__getitem__)
        self.assertEqual(peak_index, 2)


if __name__ == "__main__":
    unittest.main()
