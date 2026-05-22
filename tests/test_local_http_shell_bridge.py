from __future__ import annotations

import base64
from contextlib import contextmanager
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from rxnflow.local_bridge import LocalShellBridge, create_local_bridge_server


class LocalHttpShellBridgeTest(unittest.TestCase):
    def test_health_payload_is_json_safe(self) -> None:
        bridge = LocalShellBridge()

        payload = bridge.health()

        json.dumps(payload)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["service"], "rxnflow-local-shell-bridge")
        self.assertEqual(payload["version"], "local-dev-v1")

    def test_http_health_returns_json(self) -> None:
        with running_bridge() as base_url:
            status, payload = get_json(f"{base_url}/health")

        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["service"], "rxnflow-local-shell-bridge")

    def test_local_origin_receives_cors_header(self) -> None:
        with running_bridge() as base_url:
            status, payload, headers = request_json_with_headers(
                f"{base_url}/health",
                method="GET",
                headers={"Origin": "http://127.0.0.1:5176"},
            )

        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:5176")
        self.assertEqual(headers.get("Vary"), "Origin")

    def test_remote_origin_does_not_receive_cors_header(self) -> None:
        with running_bridge() as base_url:
            status, payload, headers = request_json_with_headers(
                f"{base_url}/health",
                method="GET",
                headers={"Origin": "https://example.com"},
            )

        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertNotIn("Access-Control-Allow-Origin", headers)

    def test_options_preflight_allows_local_shell_origin(self) -> None:
        with running_bridge() as base_url:
            status, headers = request_headers(
                f"{base_url}/api/shell",
                method="OPTIONS",
                headers={"Origin": "http://localhost:5176"},
            )

        self.assertEqual(status, 204)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "http://localhost:5176")
        self.assertIn("POST", headers.get("Access-Control-Allow-Methods", ""))
        self.assertIn("content-type", headers.get("Access-Control-Allow-Headers", ""))

    def test_shell_post_preserves_session_across_requests(self) -> None:
        with running_bridge() as base_url:
            fixture_status, fixture = post_json(
                f"{base_url}/api/shell",
                {"command": "fixture.run", "args": {}},
            )
            session_id = fixture["data"]["session_id"]
            snapshot_status, snapshot = post_json(
                f"{base_url}/api/shell",
                {"command": "workbench.snapshot", "args": {"session_id": session_id}},
            )

        self.assertEqual(fixture_status, 200)
        self.assertTrue(fixture["ok"], fixture["error"])
        self.assertEqual(fixture["data"]["command"], "fixture.run")
        self.assertIn("session_id", fixture["data"])
        self.assertEqual(snapshot_status, 200)
        self.assertTrue(snapshot["ok"], snapshot["error"])
        self.assertEqual(snapshot["data"]["command"], "workbench.snapshot")
        self.assertEqual(snapshot["data"]["project_id"], "project-fixture-minimal-reaction")
        self.assertEqual(snapshot["data"]["counts"]["objects"], 2)
        self.assertEqual(snapshot["data"]["profile"]["id"], "profile-a-b-electronic")

    def test_shell_post_accepts_inline_import_preview_payload(self) -> None:
        payload = base64.b64encode(
            b"2\nEnergy = -1.5 Hartree\nH 0 0 0\nH 0 0 0.74\n"
        ).decode("ascii")

        with tempfile.TemporaryDirectory() as tmp, running_bridge() as base_url:
            create_status, created = post_json(
                f"{base_url}/api/shell",
                {
                    "command": "project.create",
                    "args": {"name": "inline-http", "location": str(Path(tmp) / "inline-http")},
                },
            )
            preview_status, preview = post_json(
                f"{base_url}/api/shell",
                {
                    "command": "import.preview",
                    "args": {
                        "session_id": created["data"]["session_id"],
                        "source": {
                            "kind": "inline_bytes",
                            "filename": "h2.xyz",
                            "bytes_base64": payload,
                        },
                    },
                },
            )

        self.assertEqual(create_status, 200)
        self.assertTrue(created["ok"], created["error"])
        self.assertEqual(preview_status, 200)
        self.assertTrue(preview["ok"], preview["error"])
        item = preview["data"]["batch"]["items"][0]
        self.assertEqual(item["status"], "needs_confirmation")
        self.assertEqual(item["preview"]["parser_id"], "xyz-ase")

    def test_unknown_shell_command_returns_shell_response(self) -> None:
        with running_bridge() as base_url:
            status, payload = post_json(
                f"{base_url}/api/shell",
                {"command": "missing.command", "args": {}},
            )

        self.assertEqual(status, 200)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], "invalid_input")
        self.assertEqual(payload["error"]["target"], "command")

    def test_invalid_json_returns_json_error_response(self) -> None:
        with running_bridge() as base_url:
            status, payload = request_json(
                f"{base_url}/api/shell",
                method="POST",
                body=b"{",
            )

        self.assertEqual(status, 400)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], "invalid_json")
        self.assertEqual(payload["error"]["target"], "body")

    def test_payload_too_large_returns_shell_response(self) -> None:
        with running_bridge(LocalShellBridge(max_body_bytes=4)) as base_url:
            status, payload = request_json(
                f"{base_url}/api/shell",
                method="POST",
                body=b'{"command":"fixture.run","args":{}}',
            )

        self.assertEqual(status, 413)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], "payload_too_large")
        self.assertEqual(payload["error"]["target"], "body")
        json.dumps(payload)

    def test_unknown_path_returns_json_error_response(self) -> None:
        with running_bridge() as base_url:
            status, payload = get_json(f"{base_url}/missing")

        self.assertEqual(status, 404)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], "not_found")
        self.assertEqual(payload["error"]["target"], "path")

    def test_unsupported_method_returns_json_error_response(self) -> None:
        with running_bridge() as base_url:
            status, payload = request_json(
                f"{base_url}/api/shell",
                method="PUT",
                body=json.dumps({"command": "fixture.run", "args": {}}).encode("utf-8"),
            )

        self.assertEqual(status, 405)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], "method_not_allowed")
        self.assertEqual(payload["error"]["target"], "method")

    def test_internal_bridge_exception_returns_json_error_response(self) -> None:
        with running_bridge(_FailingBridge()) as base_url:
            status, payload = post_json(
                f"{base_url}/api/shell",
                {"command": "fixture.run", "args": {}},
            )

        self.assertEqual(status, 500)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], "bridge_internal_error")
        self.assertEqual(payload["error"]["target"], "bridge")


class _FailingBridge(LocalShellBridge):
    def handle_shell_payload(self, payload: object) -> dict:
        raise RuntimeError("forced failure")


@contextmanager
def running_bridge(bridge: LocalShellBridge | None = None):
    server = create_local_bridge_server(port=0, bridge=bridge)
    host, port = server.server_address
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://{host}:{port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def get_json(url: str) -> tuple[int, dict]:
    return request_json(url, method="GET")


def post_json(url: str, payload: dict) -> tuple[int, dict]:
    return request_json(
        url,
        method="POST",
        body=json.dumps(payload).encode("utf-8"),
    )


def request_json(url: str, *, method: str, body: bytes | None = None) -> tuple[int, dict]:
    status, payload, _headers = request_json_with_headers(url, method=method, body=body)
    return status, payload


def request_json_with_headers(
    url: str,
    *,
    method: str,
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict, dict[str, str]]:
    request = Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urlopen(request, timeout=10) as response:
            return (
                response.status,
                json.loads(response.read().decode("utf-8")),
                dict(response.headers.items()),
            )
    except HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8")), dict(exc.headers.items())


def request_headers(
    url: str,
    *,
    method: str,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str]]:
    request = Request(url, method=method, headers=headers or {})
    try:
        with urlopen(request, timeout=10) as response:
            return response.status, dict(response.headers.items())
    except HTTPError as exc:
        return exc.code, dict(exc.headers.items())


if __name__ == "__main__":
    unittest.main()
