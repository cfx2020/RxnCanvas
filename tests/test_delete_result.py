from __future__ import annotations

from contextlib import closing
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.cli import main
from rxnflow.database import connect_project_database


class DeleteResultTests(unittest.TestCase):
    def test_delete_result_removes_calculation_and_validate_report_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report_dir = root / "report" / "main"
            report_dir.mkdir(parents=True)
            (report_dir / "report.yaml").write_text(
                "sites:\n  - id: im1\n    label: IM1\nedges: []\n",
                encoding="utf-8",
            )
            db_path = root / "database" / "project.sqlite"
            with connect_project_database(db_path) as conn:
                conn.execute(
                    "insert into import_record values ('import_1', 'ase', 'raw.extxyz', 'ase', '2026-04-24T00:00:00+00:00')"
                )
                conn.execute(
                    "insert into result_record values ('rr_1', 'import', 'import_1', 'final', '2026-04-24T00:00:00+00:00')"
                )
                conn.execute("insert into node values ('node_1', 0, 1, 'import', 'database/objects/results/rr_1/node.xyz')")
                conn.execute(
                    "insert into calculation values ('calc_1', 'node_1', 'rr_1', 'fake-base', 'fake', -10.0, '{}', 'database/objects/results/rr_1/calculation.json')"
                )
                conn.execute("insert into report values ('main', ?)", (str(report_dir),))
                conn.execute("insert into report_site values ('im1', 'main', 'IM1')")
                conn.execute("insert into report_point_binding values ('bind_1', 'main', 'im1', 'calc_1', 1)")

            self.assertEqual(main(["delete-result", str(root), "rr_1"]), 0)

            with closing(sqlite3.connect(db_path)) as conn:
                calc_count = conn.execute("select count(*) from calculation").fetchone()[0]
                node_count = conn.execute("select count(*) from node").fetchone()[0]
                import_count = conn.execute("select count(*) from import_record").fetchone()[0]
            self.assertEqual(calc_count, 0)
            self.assertEqual(node_count, 0)
            self.assertEqual(import_count, 0)
            with self.assertRaises(SystemExit) as exit_context:
                main(["validate-report", str(report_dir)])
            self.assertEqual(exit_context.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
