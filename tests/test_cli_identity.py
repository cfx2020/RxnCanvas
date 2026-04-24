from __future__ import annotations

import sys
import tomllib
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.cli import build_parser


class CliIdentityTests(unittest.TestCase):
    def test_parser_uses_rxnflow_program_name(self) -> None:
        parser = build_parser()
        self.assertEqual(parser.prog, "rxnflow")

    def test_pyproject_exposes_rxnflow_command(self) -> None:
        pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
        data = tomllib.loads(pyproject.read_text(encoding="utf-8"))
        self.assertEqual(data["project"]["name"], "rxnflow")
        self.assertEqual(data["project"]["scripts"]["rxnflow"], "rxnflow.cli:main")


if __name__ == "__main__":
    unittest.main()
