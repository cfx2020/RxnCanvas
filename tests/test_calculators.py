from __future__ import annotations

import tempfile
import textwrap
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from mlrxn_workflow.calculators.factory import build_calculator, get_backend, resolve_task_settings
from mlrxn_workflow.config import load_workflow_config
from mlrxn_workflow.errors import WorkflowConfigError


def write_yaml(tmpdir: Path, content: str) -> Path:
    path = tmpdir / "workflow.yaml"
    path.write_text(textwrap.dedent(content), encoding="utf-8")
    return path


class CalculatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir_ctx = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self.tmpdir_ctx.name)

    def tearDown(self) -> None:
        self.tmpdir_ctx.cleanup()

    def test_unknown_backend_fails(self) -> None:
        with self.assertRaisesRegex(WorkflowConfigError, "Unknown calculator backend 'nope'"):
            get_backend("nope")

    def test_task_settings_merge_defaults_and_overrides(self) -> None:
        config = load_workflow_config(
            write_yaml(
                self.tmpdir,
                """
                defaults:
                  backend: fake
                  model: fake-base
                  device: cpu
                  task_name: omol
                nodes:
                  - id: im1
                    path: ./im1.xyz
                    charge: 1
                    multiplicity: 2
                tasks:
                  - id: opt_im1
                    type: geomopt
                    input: im1
                    model: fake-override
                    multiplicity: 4
                """,
            )
        )
        task = config.tasks[0]
        node = config.nodes[0]
        settings = resolve_task_settings(config, task, node)
        self.assertEqual(settings.backend, "fake")
        self.assertEqual(settings.model, "fake-override")
        self.assertEqual(settings.device, "cpu")
        self.assertEqual(settings.charge, 1)
        self.assertEqual(settings.multiplicity, 4)

    def test_fake_backend_builds_calculator(self) -> None:
        config = load_workflow_config(
            write_yaml(
                self.tmpdir,
                """
                defaults:
                  backend: fake
                nodes:
                  - id: im1
                    path: ./im1.xyz
                    charge: 0
                    multiplicity: 1
                tasks:
                  - id: opt_im1
                    type: geomopt
                    input: im1
                """,
            )
        )
        calculator = build_calculator(config, config.tasks[0], config.nodes[0])
        self.assertEqual(calculator.backend, "fake")
        self.assertEqual(calculator.model, "uma-s-1p1")
        self.assertEqual(calculator.charge, 0)
        self.assertEqual(calculator.multiplicity, 1)


if __name__ == "__main__":
    unittest.main()
