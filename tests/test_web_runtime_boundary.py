import json
import unittest
from pathlib import Path

from rxnflow.platform import handle_platform_payload


class WebRuntimeBoundaryTests(unittest.TestCase):
    def test_fixture_payload_returns_json_safe_shell_response(self) -> None:
        response = handle_platform_payload({"command": "fixture.run", "args": {}})

        json.dumps(response)
        self.assertTrue(response["ok"])
        self.assertEqual(response["data"]["command"], "fixture.run")
        self.assertEqual(response["data"]["profile"]["id"], "profile-a-b-electronic")
        self.assertIn("session_id", response["data"])

    def test_unknown_command_returns_invalid_input_response(self) -> None:
        response = handle_platform_payload({"command": "missing.command", "args": {}})

        json.dumps(response)
        self.assertFalse(response["ok"])
        self.assertEqual(response["error"]["code"], "invalid_input")
        self.assertEqual(response["error"]["target"], "command")

    def test_runtime_boundary_doc_records_local_first_stateless_contract(self) -> None:
        doc = Path("docs/dev/web-runtime-boundary.md").read_text(encoding="utf-8")

        self.assertIn("local-first browser workbench", doc)
        self.assertIn("serverless filesystem", doc)
        self.assertIn("长期项目存储", doc)
        self.assertIn("Browser Project Repository", doc)
        self.assertIn("React + TypeScript + Vite + npm", doc)
        self.assertIn("https://vercel.com/docs/functions/runtimes/python", doc)
        self.assertIn("https://vercel.com/docs/functions", doc)
        self.assertIn("https://nextjs.org/docs/app", doc)


if __name__ == "__main__":
    unittest.main()
