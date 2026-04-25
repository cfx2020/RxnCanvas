from __future__ import annotations

import csv
import tempfile
import textwrap
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ase import Atoms
from ase.io import read, write

from rxnflow.cli import main


def write_yaml(tmpdir: Path, content: str) -> Path:
    path = tmpdir / "workflow.yaml"
    path.write_text(textwrap.dedent(content), encoding="utf-8")
    return path


class NebExecutionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir_ctx = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self.tmpdir_ctx.name)
        structures = self.tmpdir / "structures"
        structures.mkdir()
        write(structures / "initial.xyz", Atoms("H2", positions=[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]]))
        write(structures / "final.xyz", Atoms("H2", positions=[[0.0, 0.0, 0.0], [3.0, 0.0, 0.0]]))

    def tearDown(self) -> None:
        self.tmpdir_ctx.cleanup()

    def test_neb_writes_raw_and_inspection_artifacts(self) -> None:
        config_path = write_yaml(
            self.tmpdir,
            """
            defaults:
              backend: fake
              model: fake-distance-barrier
              device: cpu
              fmax: 0.001
              steps: 25
              output_root: .
            nodes:
              - id: initial
                path: ./structures/initial.xyz
                charge: 0
                multiplicity: 1
              - id: final
                path: ./structures/final.xyz
                charge: 0
                multiplicity: 1
            tasks:
              - id: neb_path
                type: neb
                initial: initial
                final: final
                images: 3
            """,
        )
        exit_code = main(["run", str(config_path)])
        self.assertEqual(exit_code, 0)

        task_dir = self.tmpdir / "runs" / "tasks" / "neb_path"
        self.assertTrue((task_dir / "task.yaml").exists())
        self.assertTrue((task_dir / "initial.xyz").exists())
        self.assertTrue((task_dir / "final.xyz").exists())
        self.assertTrue((task_dir / "ase" / "neb.traj").exists())
        self.assertTrue((task_dir / "ase" / "neb.log").exists())
        self.assertTrue((task_dir / "ase" / "image_02.traj").exists())
        self.assertTrue((task_dir / "inspect" / "initial_band.xyz").exists())
        self.assertTrue((task_dir / "inspect" / "band.xyz").exists())
        self.assertTrue((task_dir / "inspect" / "images" / "image_02.xyz").exists())
        self.assertTrue((task_dir / "inspect" / "energies.csv").exists())
        self.assertTrue((task_dir / "inspect" / "peak.xyz").exists())
        self.assertFalse((task_dir / "metadata.json").exists())

        neb_frames = read(task_dir / "ase" / "neb.traj", index=":")
        self.assertGreaterEqual(len(neb_frames), 5)
        self.assertEqual(len(neb_frames) % 5, 0)

        with (task_dir / "inspect" / "energies.csv").open("r", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 5)
        energies = [float(row["energy"]) for row in rows]
        peak_index = max(range(len(energies)), key=energies.__getitem__)
        self.assertEqual(peak_index, 2)


if __name__ == "__main__":
    unittest.main()
