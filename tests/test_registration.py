from __future__ import annotations

from contextlib import closing
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ase import Atoms
from ase.calculators.singlepoint import SinglePointCalculator
from ase.io import write

from rxnflow.cli import main


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class RegistrationTests(unittest.TestCase):
    def test_register_gaussian_file_creates_import_record_and_calculation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with changed_cwd(root):
                self.assertEqual(
                    main(
                        [
                            "register-result",
                            "--from-file",
                            str(FIXTURES / "gaussian" / "minimal_opt.log"),
                        ]
                    ),
                    0,
                )

            rows = read_registration_rows(root)
            self.assertEqual(rows["import_count"], 1)
            self.assertEqual(rows["node_count"], 1)
            self.assertEqual(rows["calculation_count"], 1)
            self.assertEqual(rows["energy"], -40.123456)
            self.assertEqual(rows["backend_label"], "gaussian")

    def test_register_orca_file_creates_import_record_and_calculation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with changed_cwd(root):
                self.assertEqual(
                    main(
                        [
                            "register-result",
                            "--from-file",
                            str(FIXTURES / "orca" / "minimal_opt.out"),
                        ]
                    ),
                    0,
                )

            rows = read_registration_rows(root)
            self.assertEqual(rows["import_count"], 1)
            self.assertEqual(rows["node_count"], 1)
            self.assertEqual(rows["calculation_count"], 1)
            self.assertEqual(rows["energy"], -40.223456)
            self.assertEqual(rows["backend_label"], "orca")

    def test_register_ase_file_creates_import_record_and_calculation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            atoms = Atoms("H", positions=[[0.0, 0.0, 0.0]])
            atoms.calc = SinglePointCalculator(atoms, energy=-0.75, forces=[[0.0, 0.0, 0.0]])
            atoms.info["charge"] = 0
            atoms.info["multiplicity"] = 1
            atoms.info["backend"] = "fake"
            atoms.info["model"] = "fake-base"
            write(root / "opt_traj.extxyz", [atoms], format="extxyz")

            self.assertEqual(
                main(
                    [
                        "register",
                        str(root / "opt_traj.extxyz"),
                        "--project-root",
                        str(root),
                    ]
                ),
                0,
            )

            rows = read_registration_rows(root)
            self.assertEqual(rows["import_count"], 1)
            self.assertEqual(rows["node_count"], 1)
            self.assertEqual(rows["calculation_count"], 1)
            self.assertEqual(rows["energy"], -0.75)
            self.assertEqual(rows["backend_label"], "fake")
            self.assertEqual(rows["method_label"], "fake-base")
            self.assertTrue((root / rows["frozen_structure_path"]).exists())
            self.assertTrue((root / rows["frozen_payload_path"]).exists())

    def test_register_from_task_directory_uses_project_database(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            task_dir = root / "task" / "opt_h"
            task_dir.mkdir(parents=True)
            atoms = Atoms("H", positions=[[0.0, 0.0, 0.0]])
            atoms.calc = SinglePointCalculator(atoms, energy=-0.5, forces=[[0.0, 0.0, 0.0]])
            atoms.info["charge"] = 0
            atoms.info["multiplicity"] = 1
            atoms.info["backend"] = "fake"
            atoms.info["model"] = "fake-base"
            write(task_dir / "opt_traj.extxyz", [atoms], format="extxyz")

            with changed_cwd(task_dir):
                self.assertEqual(
                    main(
                        [
                            "register",
                            "opt_traj.extxyz",
                        ]
                    ),
                    0,
                )

            rows = read_registration_rows(root)
            self.assertEqual(rows["calculation_count"], 1)
            self.assertEqual(rows["energy"], -0.5)
            self.assertTrue((root / "database" / "project.sqlite").exists())
            self.assertFalse((task_dir / "database").exists())

    def test_register_neb_final_path_defaults_to_peak(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            task_dir = root / "task" / "neb_h"
            task_dir.mkdir(parents=True)
            frames = []
            for energy, x in [(-1.0, 0.0), (0.25, 1.0), (-0.5, 2.0)]:
                atoms = Atoms("H", positions=[[x, 0.0, 0.0]])
                atoms.calc = SinglePointCalculator(atoms, energy=energy, forces=[[0.0, 0.0, 0.0]])
                atoms.info["charge"] = 0
                atoms.info["multiplicity"] = 1
                atoms.info["backend"] = "fake"
                atoms.info["model"] = "fake-neb"
                frames.append(atoms)
            write(task_dir / "neb_final_path.extxyz", frames, format="extxyz")

            self.assertEqual(main(["register", str(task_dir / "neb_final_path.extxyz")]), 0)

            rows = read_registration_rows(root)
            self.assertEqual(rows["energy"], 0.25)
            self.assertEqual(rows["candidate_label"], "peak")
            self.assertEqual(rows["backend_label"], "fake")
            self.assertEqual(rows["method_label"], "fake-neb")


class changed_cwd:
    def __init__(self, path: Path):
        self.path = path
        self.previous: str | None = None

    def __enter__(self):
        self.previous = os.getcwd()
        os.chdir(self.path)
        return self

    def __exit__(self, exc_type, exc, tb):
        assert self.previous is not None
        os.chdir(self.previous)


def read_registration_rows(root: Path) -> dict:
    db_path = root / "database" / "project.sqlite"
    with closing(sqlite3.connect(db_path)) as conn:
        row = conn.execute(
            """
            select c.energy, c.backend_label, c.method_label, c.frozen_payload_path, n.frozen_structure_path, r.candidate_label
            from calculation c
            join node n on n.node_id = c.node_id
            join result_record r on r.result_record_id = c.result_record_id
            """
        ).fetchone()
        assert row is not None
        return {
            "import_count": conn.execute("select count(*) from import_record").fetchone()[0],
            "node_count": conn.execute("select count(*) from node").fetchone()[0],
            "calculation_count": conn.execute("select count(*) from calculation").fetchone()[0],
            "energy": row[0],
            "backend_label": row[1],
            "method_label": row[2],
            "frozen_payload_path": row[3],
            "frozen_structure_path": row[4],
            "candidate_label": row[5],
        }


if __name__ == "__main__":
    unittest.main()
