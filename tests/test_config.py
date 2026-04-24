from __future__ import annotations

import tempfile
import textwrap
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.config import load_workflow_config
from rxnflow.errors import WorkflowConfigError


def write_yaml(tmpdir: Path, content: str) -> Path:
    path = tmpdir / "workflow.yaml"
    path.write_text(textwrap.dedent(content), encoding="utf-8")
    return path


class WorkflowConfigTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir_ctx = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self.tmpdir_ctx.name)

    def tearDown(self) -> None:
        self.tmpdir_ctx.cleanup()

    def test_valid_config_loads(self) -> None:
        path = write_yaml(
            self.tmpdir,
            """
            defaults:
              backend: uma
            references:
              - id: ref0
                path: ./structures/ref0.xyz
                charge: 0
                multiplicity: 1
            nodes:
              - id: im1
                path: ./structures/im1.xyz
                charge: 0
                multiplicity: 1
            tasks:
              - id: opt_im1
                type: geomopt
                input: im1
              - id: scan_main
                type: scan
                input: opt_im1
                coordinate:
                  type: distance
                  atoms: [1, 2]
                  start: 2.5
                  stop: 1.9
                  steps: 8
                constraints:
                  - type: freeze_atoms
                    atoms: [5, 6, 7]
              - id: neb_followup
                type: neb
                initial: opt_im1
                final: ref0
                images: 5
            report:
              reference: ref0
              branches:
                - id: branch_a
                  tasks: [scan_main, neb_followup]
            """,
        )
        config = load_workflow_config(path)
        self.assertEqual(config.tasks[1].coordinate.type, "distance")
        self.assertEqual(config.report.reference, "ref0")

    def test_duplicate_ids_fail(self) -> None:
        path = write_yaml(
            self.tmpdir,
            """
            references:
              - id: same
                path: ./ref.xyz
                charge: 0
                multiplicity: 1
            nodes:
              - id: same
                path: ./node.xyz
                charge: 0
                multiplicity: 1
            tasks: []
            """,
        )
        with self.assertRaisesRegex(WorkflowConfigError, "Duplicate id 'same'"):
            load_workflow_config(path)

    def test_unknown_task_input_fails(self) -> None:
        path = write_yaml(
            self.tmpdir,
            """
            references: []
            nodes: []
            tasks:
              - id: missing_input
                type: geomopt
                input: does_not_exist
            """,
        )
        with self.assertRaisesRegex(WorkflowConfigError, "input 'does_not_exist'"):
            load_workflow_config(path)

    def test_invalid_scan_coordinate_fails(self) -> None:
        path = write_yaml(
            self.tmpdir,
            """
            references: []
            nodes:
              - id: im1
                path: ./im1.xyz
                charge: 0
                multiplicity: 1
            tasks:
              - id: scan_main
                type: scan
                input: im1
                coordinate:
                  type: distance
                  atoms: [1, 2, 3]
                  start: 2.5
                  stop: 1.9
                  steps: 8
            """,
        )
        with self.assertRaisesRegex(WorkflowConfigError, "expects 2 atoms"):
            load_workflow_config(path)

    def test_malformed_constraint_fails(self) -> None:
        path = write_yaml(
            self.tmpdir,
            """
            nodes:
              - id: im1
                path: ./im1.xyz
                charge: 0
                multiplicity: 1
            tasks:
              - id: scan_main
                type: scan
                input: im1
                coordinate:
                  type: angle
                  atoms: [1, 2, 3]
                  start: 90
                  stop: 120
                  steps: 5
                constraints:
                  - type: angle
                    atoms: [1, 2, 3]
            """,
        )
        with self.assertRaisesRegex(WorkflowConfigError, "must declare 'value'"):
            load_workflow_config(path)

    def test_neb_requires_both_endpoints(self) -> None:
        path = write_yaml(
            self.tmpdir,
            """
            nodes:
              - id: im1
                path: ./im1.xyz
                charge: 0
                multiplicity: 1
            tasks:
              - id: neb_main
                type: neb
                initial: im1
                images: 7
            """,
        )
        with self.assertRaisesRegex(WorkflowConfigError, "declare both 'initial' and 'final'"):
            load_workflow_config(path)

    def test_report_unknown_task_fails(self) -> None:
        path = write_yaml(
            self.tmpdir,
            """
            nodes:
              - id: im1
                path: ./im1.xyz
                charge: 0
                multiplicity: 1
            tasks:
              - id: opt_im1
                type: geomopt
                input: im1
            report:
              branches:
                - id: branch_a
                  tasks: [opt_im1, missing]
            """,
        )
        with self.assertRaisesRegex(WorkflowConfigError, "references unknown task 'missing'"):
            load_workflow_config(path)


if __name__ == "__main__":
    unittest.main()
