from __future__ import annotations

from contextlib import closing
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.database import connect_project_database, initialize_database


class DatabaseTests(unittest.TestCase):
    def test_initialize_database_creates_core_tables(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "database" / "project.sqlite"
            initialize_database(db_path)

            with closing(sqlite3.connect(db_path)) as conn:
                names = {
                    row[0]
                    for row in conn.execute(
                        "select name from sqlite_master where type = 'table'"
                    )
                }

            self.assertEqual(
                {
                    "task_run",
                    "import_record",
                    "result_record",
                    "node",
                    "calculation",
                    "report",
                    "report_site",
                    "report_point_binding",
                    "report_edge",
                },
                names,
            )

    def test_connect_project_database_initializes_parent_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "database" / "project.sqlite"
            with connect_project_database(db_path) as conn:
                count = conn.execute("select count(*) from sqlite_master").fetchone()[0]
            self.assertGreater(count, 0)


if __name__ == "__main__":
    unittest.main()
