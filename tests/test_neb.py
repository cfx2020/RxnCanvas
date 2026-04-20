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
from ase.io import write

from mlrxn_workflow.cli import main


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

    def test_neb_writes_band_energy_table_and_ts_like_candidate(self) -> None:
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
        self.assertEqual(metadata["summary"]["images"], 5)


if __name__ == "__main__":
    unittest.main()
