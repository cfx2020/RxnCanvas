from __future__ import annotations

import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.errors import WorkflowConfigError
from rxnflow.paths import database_path, objects_root, report_root, task_root
from rxnflow.task_config import load_task_directory


class TaskDirectoryConfigTests(unittest.TestCase):
    def test_loads_task_yaml_and_input_xyz_from_task_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            task_dir = Path(tmp) / "task" / "opt_im1"
            task_dir.mkdir(parents=True)
            (task_dir / "input.xyz").write_text("1\n\nH 0 0 0\n", encoding="utf-8")
            (task_dir / "task.yaml").write_text(
                textwrap.dedent(
                    """
                    type: optimize
                    charge: 0
                    multiplicity: 1
                    backend: fake
                    model: fake-base
                    device: cpu
                    task_name: omol
                    fmax: 0.01
                    steps: 5
                    """
                ),
                encoding="utf-8",
            )

            config = load_task_directory(task_dir)

            self.assertEqual(config.id, "opt_im1")
            self.assertEqual(config.type, "optimize")
            self.assertEqual(config.input_path, task_dir / "input.xyz")
            self.assertEqual(config.charge, 0)
            self.assertEqual(config.multiplicity, 1)

    def test_missing_input_xyz_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            task_dir = Path(tmp) / "task" / "bad"
            task_dir.mkdir(parents=True)
            (task_dir / "task.yaml").write_text("type: optimize\ncharge: 0\nmultiplicity: 1\n", encoding="utf-8")

            with self.assertRaisesRegex(WorkflowConfigError, "input.xyz"):
                load_task_directory(task_dir)

    def test_neb_loads_endpoints_without_input_xyz(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            task_dir = Path(tmp) / "task" / "neb_h2"
            task_dir.mkdir(parents=True)
            (task_dir / "initial.xyz").write_text("2\n\nH 0 0 0\nH 1 0 0\n", encoding="utf-8")
            (task_dir / "final.xyz").write_text("2\n\nH 0 0 0\nH 3 0 0\n", encoding="utf-8")
            (task_dir / "task.yaml").write_text(
                textwrap.dedent(
                    """
                    type: neb
                    charge: 0
                    multiplicity: 1
                    backend: fake
                    model: fake-distance-barrier
                    initial: initial.xyz
                    final: final.xyz
                    images: 3
                    """
                ),
                encoding="utf-8",
            )

            config = load_task_directory(task_dir)

            self.assertIsNone(config.input_path)
            self.assertEqual(config.initial_path, (task_dir / "initial.xyz").resolve())
            self.assertEqual(config.final_path, (task_dir / "final.xyz").resolve())
            self.assertEqual(config.images, 3)

    def test_project_layout_paths(self) -> None:
        root = Path("/project")
        self.assertEqual(task_root(root), root / "task")
        self.assertEqual(report_root(root), root / "report")
        self.assertEqual(database_path(root), root / "database" / "project.sqlite")
        self.assertEqual(objects_root(root), root / "database" / "objects")


if __name__ == "__main__":
    unittest.main()
