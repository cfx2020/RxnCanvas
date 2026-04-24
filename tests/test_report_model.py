from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.cli import main
from rxnflow.database import connect_project_database


class ReportModelTests(unittest.TestCase):
    def test_create_rebind_and_render_report_from_database(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path = root / "database" / "project.sqlite"
            with connect_project_database(db_path) as conn:
                conn.execute(
                    "insert into result_record values ('rr_1', 'task', null, null, 'final', '2026-04-24T00:00:00+00:00')"
                )
                conn.execute("insert into node values ('node_1', 0, 1, 'task', 'database/objects/results/rr_1/node.xyz')")
                conn.execute(
                    "insert into calculation values ('calc_1', 'node_1', 'rr_1', 'fake-base', 'fake', -10.0, '{}', 'database/objects/results/rr_1/calculation.json')"
                )

            self.assertEqual(main(["create-report", str(root / "report" / "main")]), 0)
            report_yaml = root / "report" / "main" / "report.yaml"
            report_yaml.write_text("sites:\n  - id: im1\n    label: IM1\nedges: []\n", encoding="utf-8")

            self.assertEqual(
                main(["rebind-report", str(root / "report" / "main"), "--site", "im1", "--calculation", "calc_1"]),
                0,
            )
            self.assertEqual(main(["validate-report", str(root / "report" / "main")]), 0)
            self.assertEqual(main(["render-report", str(root / "report" / "main")]), 0)

            network = json.loads((root / "report" / "main" / "network.json").read_text(encoding="utf-8"))
            self.assertEqual(network["sites"][0]["calculation_id"], "calc_1")
            self.assertEqual(network["sites"][0]["energy"], -10.0)
            self.assertTrue((root / "report" / "main" / "pes.png").exists())
            self.assertTrue((root / "report" / "main" / "pes.cdxml").exists())
            self.assertFalse((root / "task").exists())


if __name__ == "__main__":
    unittest.main()
