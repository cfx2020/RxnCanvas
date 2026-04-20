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


class ReportingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir_ctx = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self.tmpdir_ctx.name)
        structures = self.tmpdir / "structures"
        structures.mkdir()
        ref0 = Atoms("H3", positions=[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]])
        ref_alt = Atoms("H3", positions=[[0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [0.0, 1.0, 0.0]])
        initial = Atoms("H3", positions=[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]])
        write(structures / "ref0.xyz", ref0)
        write(structures / "ref_alt.xyz", ref_alt)
        write(structures / "initial.xyz", initial)

    def tearDown(self) -> None:
        self.tmpdir_ctx.cleanup()

    def test_report_rezero_and_branch_merge(self) -> None:
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
            references:
              - id: ref0
                path: ./structures/ref0.xyz
                charge: 0
                multiplicity: 1
              - id: ref_alt
                path: ./structures/ref_alt.xyz
                charge: 0
                multiplicity: 1
            nodes:
              - id: initial
                path: ./structures/initial.xyz
                charge: 0
                multiplicity: 1
            tasks:
              - id: opt_shared
                type: geomopt
                input: initial
              - id: scan_a
                type: scan
                input: opt_shared
                coordinate:
                  type: distance
                  atoms: [1, 2]
                  start: 1.0
                  stop: 3.0
                  steps: 5
              - id: scan_b
                type: scan
                input: opt_shared
                coordinate:
                  type: distance
                  atoms: [1, 2]
                  start: 1.0
                  stop: 2.0
                  steps: 3
            report:
              id: branch_report
              reference: ref0
              branches:
                - id: branch_a
                  tasks: [opt_shared, scan_a]
                - id: branch_b
                  tasks: [opt_shared, scan_b]
            """,
        )

        self.assertEqual(main(["run", str(config_path)]), 0)

        task_metadata = self.tmpdir / "runs" / "tasks" / "opt_shared" / "metadata.json"
        metadata_mtime_before = task_metadata.stat().st_mtime

        self.assertEqual(main(["report", str(config_path)]), 0)
        report_dir = self.tmpdir / "reports" / "branch_report"
        self.assertTrue((report_dir / "relative_energies.csv").exists())
        self.assertTrue((report_dir / "branch_comparison.png").exists())
        self.assertTrue((report_dir / "structures" / "branch_a" / "scan_a__peak.xyz").exists())

        with (report_dir / "relative_energies.csv").open("r", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        shared_rows = [row for row in rows if row["task_id"] == "opt_shared"]
        self.assertEqual({row["branch_id"] for row in shared_rows}, {"branch_a", "branch_b"})

        first_relative = float(rows[0]["relative_energy"])
        self.assertEqual(main(["report", str(config_path), "--reference", "ref_alt"]), 0)
        with (report_dir / "summary.json").open("r", encoding="utf-8") as handle:
            summary = json.load(handle)
        self.assertEqual(summary["reference_id"], "ref_alt")
        with (report_dir / "relative_energies.csv").open("r", encoding="utf-8") as handle:
            rezero_rows = list(csv.DictReader(handle))
        second_relative = float(rezero_rows[0]["relative_energy"])
        self.assertNotEqual(first_relative, second_relative)

        metadata_mtime_after = task_metadata.stat().st_mtime
        self.assertEqual(metadata_mtime_before, metadata_mtime_after)


if __name__ == "__main__":
    unittest.main()
