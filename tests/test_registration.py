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
from ase.io.trajectory import Trajectory

from rxnflow.cli import main


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class RegistrationTests(unittest.TestCase):
    def test_register_result_from_task_final_creates_node_calculation_and_frozen_copy(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            task_dir = root / "task" / "opt_im1"
            write_raw_optimize_task(task_dir, energy=-1.25)

            self.assertEqual(
                main(["register-result", "--from-task", str(task_dir), "--candidate", "final", "--new-node"]),
                0,
            )

            rows = read_registration_rows(root)
            self.assertEqual(rows["node_count"], 1)
            self.assertEqual(rows["calculation_count"], 1)
            self.assertEqual(rows["energy"], -1.25)
            self.assertEqual(rows["backend_label"], "fake")
            self.assertTrue((root / rows["frozen_structure_path"]).exists())
            self.assertTrue((root / rows["frozen_payload_path"]).exists())

    def test_register_task_reads_ase_raw_trajectory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            task_dir = root / "task" / "opt_raw"
            write_raw_optimize_task(task_dir, energy=-2.5)

            self.assertEqual(
                main(["register-result", "--from-task", str(task_dir), "--candidate", "final", "--new-node"]),
                0,
            )

            rows = read_registration_rows(root)
            self.assertEqual(rows["energy"], -2.5)

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
                            "--parser",
                            "gaussian",
                            "--candidate",
                            "final",
                            "--new-node",
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
                            "--parser",
                            "orca",
                            "--candidate",
                            "final",
                            "--new-node",
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
            trajectory = Trajectory(str(root / "optimize.traj"), "w", atoms)
            try:
                trajectory.write()
            finally:
                trajectory.close()

            self.assertEqual(
                main(
                    [
                        "register-result",
                        "--from-file",
                        str(root / "optimize.traj"),
                        "--parser",
                        "ase",
                        "--candidate",
                        "final",
                        "--new-node",
                        "--project-root",
                        str(root),
                        "--charge",
                        "0",
                        "--multiplicity",
                        "1",
                        "--method-label",
                        "fake-base",
                        "--backend-label",
                        "fake",
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
            select c.energy, c.backend_label, c.frozen_payload_path, n.frozen_structure_path
            from calculation c
            join node n on n.node_id = c.node_id
            """
        ).fetchone()
        assert row is not None
        return {
            "task_count": conn.execute("select count(*) from task_run").fetchone()[0],
            "import_count": conn.execute("select count(*) from import_record").fetchone()[0],
            "node_count": conn.execute("select count(*) from node").fetchone()[0],
            "calculation_count": conn.execute("select count(*) from calculation").fetchone()[0],
            "energy": row[0],
            "backend_label": row[1],
            "frozen_payload_path": row[2],
            "frozen_structure_path": row[3],
        }


def write_raw_optimize_task(task_dir: Path, energy: float) -> None:
    task_dir.mkdir(parents=True)
    (task_dir / "input.xyz").write_text("1\n\nH 0 0 0\n", encoding="utf-8")
    (task_dir / "task.yaml").write_text(
        "\n".join(
            [
                "type: optimize",
                "charge: 0",
                "multiplicity: 1",
                "backend: fake",
                "model: fake-base",
                "device: cpu",
                "steps: 1",
                "",
            ]
        ),
        encoding="utf-8",
    )
    ase_dir = task_dir / "ase"
    ase_dir.mkdir()
    atoms = Atoms("H", positions=[[1.0, 0.0, 0.0]])
    atoms.calc = SinglePointCalculator(atoms, energy=energy, forces=[[0.0, 0.0, 0.0]])
    trajectory = Trajectory(str(ase_dir / "optimize.traj"), "w", atoms)
    try:
        trajectory.write()
    finally:
        trajectory.close()


if __name__ == "__main__":
    unittest.main()
