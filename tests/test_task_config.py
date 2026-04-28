from __future__ import annotations

import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.errors import RxnFlowError
from rxnflow.paths import database_path, infer_project_root, objects_root, report_root, task_root
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

            with self.assertRaisesRegex(RxnFlowError, "input.xyz"):
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
                    intermediate_images: 3
                    """
                ),
                encoding="utf-8",
            )

            config = load_task_directory(task_dir)

            self.assertIsNone(config.input_path)
            self.assertEqual(config.initial_path, (task_dir / "initial.xyz").resolve())
            self.assertEqual(config.final_path, (task_dir / "final.xyz").resolve())
            self.assertEqual(config.intermediate_images, 3)
            self.assertEqual(config.optimizer, "LBFGS")
            self.assertEqual(config.fmax, 0.025)
            self.assertEqual(config.steps, 2000)

    def test_task_type_defaults_for_optimize_and_scan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            opt_dir = Path(tmp) / "task" / "opt_h"
            opt_dir.mkdir(parents=True)
            (opt_dir / "input.xyz").write_text("1\n\nH 0 0 0\n", encoding="utf-8")
            (opt_dir / "task.yaml").write_text("type: optimize\ncharge: 0\nmultiplicity: 1\n", encoding="utf-8")

            scan_dir = Path(tmp) / "task" / "scan_h"
            scan_dir.mkdir(parents=True)
            (scan_dir / "input.xyz").write_text("2\n\nH 0 0 0\nH 1 0 0\n", encoding="utf-8")
            (scan_dir / "task.yaml").write_text(
                textwrap.dedent(
                    """
                    type: scan
                    charge: 0
                    multiplicity: 1
                    coordinate:
                      type: distance
                      atoms: [1, 2]
                      start: 1.0
                      stop: 2.0
                      steps: 2
                    """
                ),
                encoding="utf-8",
            )

            opt_config = load_task_directory(opt_dir)
            scan_config = load_task_directory(scan_dir)

            self.assertEqual(opt_config.fmax, 0.0025)
            self.assertEqual(opt_config.steps, 2000)
            self.assertEqual(scan_config.fmax, 0.0025)
            self.assertEqual(scan_config.steps, 2000)

    def test_project_layout_paths(self) -> None:
        root = Path("/project")
        self.assertEqual(task_root(root), root / "task")
        self.assertEqual(report_root(root), root / "report")
        self.assertEqual(database_path(root), root / "database" / "project.sqlite")
        self.assertEqual(objects_root(root), root / "database" / "objects")

    def test_infers_project_root_from_task_report_and_database_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(infer_project_root(root / "task" / "neb_1" / "neb_final_path.extxyz"), root)
            self.assertEqual(infer_project_root(root / "report" / "main" / "report.yaml"), root)
            self.assertEqual(infer_project_root(root / "database" / "project.sqlite"), root)


if __name__ == "__main__":
    unittest.main()
