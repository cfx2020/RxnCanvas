from __future__ import annotations

import json
import csv
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

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
                    type: geomopt
                    charge: 0
                    multiplicity: 1
                    backend: fake
                    device: cpu
                    max_steps: 2
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
                    type: geomopt
                    charge: 0
                    multiplicity: 1
                    backend: fake
                    device: cpu
                    max_steps: 2
                    """
                ),
                encoding="utf-8",
            )

            self.assertEqual(main(["run-task", str(task_dir)]), 0)
            self.assertTrue((task_dir / "result.xyz").exists())
            self.assertTrue((task_dir / "trajectory.xyz").exists())
            self.assertTrue((task_dir / "energies.csv").exists())
            self.assertTrue((task_dir / "metadata.json").exists())
            self.assertFalse((Path(tmp) / "database").exists())

            metadata = json.loads((task_dir / "metadata.json").read_text(encoding="utf-8"))
            self.assertEqual(metadata["task"]["id"], "opt_h")
            self.assertEqual(metadata["task"]["type"], "geomopt")
            self.assertEqual(metadata["artifacts"]["result_structure"], "result.xyz")

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
                    max_steps: 25
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
            self.assertTrue((task_dir / "result.xyz").exists())
            self.assertTrue((task_dir / "trajectory.xyz").exists())
            self.assertTrue((task_dir / "energies.csv").exists())
            self.assertTrue((task_dir / "ts_like.xyz").exists())
            self.assertFalse((Path(tmp) / "database").exists())

            with (task_dir / "energies.csv").open("r", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 5)

            metadata = json.loads((task_dir / "metadata.json").read_text(encoding="utf-8"))
            self.assertEqual(metadata["summary"]["peak_index"], 2)
            self.assertEqual(metadata["artifacts"]["ts_like_structure"], "ts_like.xyz")

    def test_run_neb_task_writes_task_local_band_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            task_dir = Path(tmp) / "task" / "neb_h2"
            task_dir.mkdir(parents=True)
            initial_xyz = "2\n\nH 0 0 0\nH 1 0 0\n"
            final_xyz = "2\n\nH 0 0 0\nH 3 0 0\n"
            (task_dir / "input.xyz").write_text(initial_xyz, encoding="utf-8")
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
                    max_steps: 25
                    initial: initial.xyz
                    final: final.xyz
                    images: 3
                    """
                ),
                encoding="utf-8",
            )

            self.assertEqual(main(["run-task", str(task_dir)]), 0)
            self.assertTrue((task_dir / "result.xyz").exists())
            self.assertTrue((task_dir / "trajectory.xyz").exists())
            self.assertTrue((task_dir / "energies.csv").exists())
            self.assertTrue((task_dir / "ts_like.xyz").exists())
            self.assertFalse((Path(tmp) / "database").exists())

            with (task_dir / "energies.csv").open("r", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 5)

            metadata = json.loads((task_dir / "metadata.json").read_text(encoding="utf-8"))
            self.assertEqual(metadata["summary"]["peak_index"], 2)
            self.assertEqual(metadata["summary"]["images"], 5)


if __name__ == "__main__":
    unittest.main()
