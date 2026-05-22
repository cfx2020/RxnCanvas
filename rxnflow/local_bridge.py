"""Local HTTP bridge for the RxnFlow platform shell."""

from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from typing import Any, Mapping, Sequence
from urllib.parse import urlparse

from .platform import AppKernel, PlatformShellService, handle_platform_payload


BRIDGE_SERVICE_NAME = "rxnflow-local-shell-bridge"
BRIDGE_VERSION = "local-dev-v1"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024


class LocalShellBridge:
    """Process-local bridge that keeps one PlatformShellService alive."""

    def __init__(
        self,
        service: PlatformShellService | None = None,
        *,
        max_body_bytes: int = DEFAULT_MAX_BODY_BYTES,
    ) -> None:
        self.service = service or PlatformShellService(AppKernel())
        self.max_body_bytes = max_body_bytes

    def health(self) -> dict[str, object]:
        return {
            "ok": True,
            "service": BRIDGE_SERVICE_NAME,
            "version": BRIDGE_VERSION,
        }

    def handle_shell_payload(self, payload: object) -> dict[str, Any]:
        if not isinstance(payload, dict):
            return bridge_error_response(
                "invalid_input",
                "Shell HTTP payload must be a JSON object.",
                target="payload",
            )
        return handle_platform_payload(dict(payload), service=self.service)


def create_local_bridge_server(
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    bridge: LocalShellBridge | None = None,
) -> ThreadingHTTPServer:
    """Create a local HTTP bridge server without starting it."""

    active_bridge = bridge or LocalShellBridge()

    class _LocalBridgeRequestHandler(LocalBridgeRequestHandler):
        bridge = active_bridge

    return ThreadingHTTPServer((host, port), _LocalBridgeRequestHandler)


def serve_local_bridge(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> None:
    server = create_local_bridge_server(host, port)
    try:
        server.serve_forever()
    finally:
        server.server_close()


class LocalBridgeRequestHandler(BaseHTTPRequestHandler):
    bridge: LocalShellBridge
    server_version = f"{BRIDGE_SERVICE_NAME}/{BRIDGE_VERSION}"

    def do_GET(self) -> None:
        if self.path == "/health":
            self._write_json(200, self.bridge.health())
            return
        if self.path == "/api/shell":
            self._write_shell_error(
                405,
                "method_not_allowed",
                "Use POST for /api/shell.",
                target="method",
            )
            return
        self._write_shell_error(404, "not_found", "Local bridge path was not found.", target="path")

    def do_POST(self) -> None:
        if self.path == "/api/shell":
            payload = self._read_json_body()
            if isinstance(payload, _HttpError):
                self._write_shell_error(payload.status, payload.code, payload.message, target=payload.target)
                return
            try:
                self._write_json(200, self.bridge.handle_shell_payload(payload))
            except Exception:
                self._write_shell_error(
                    500,
                    "bridge_internal_error",
                    "Local bridge failed while handling the shell payload.",
                    target="bridge",
                )
            return
        if self.path == "/health":
            self._write_shell_error(
                405,
                "method_not_allowed",
                "Use GET for /health.",
                target="method",
            )
            return
        self._write_shell_error(404, "not_found", "Local bridge path was not found.", target="path")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._write_cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.end_headers()

    def do_PUT(self) -> None:
        self._write_method_not_allowed()

    def do_PATCH(self) -> None:
        self._write_method_not_allowed()

    def do_DELETE(self) -> None:
        self._write_method_not_allowed()

    def do_HEAD(self) -> None:
        self._write_method_not_allowed()

    def log_message(self, format: str, *args: object) -> None:
        return

    def _read_json_body(self) -> object | "_HttpError":
        length_header = self.headers.get("Content-Length")
        if length_header is None:
            return _HttpError(400, "invalid_json", "Request body is required.", "body")
        try:
            length = int(length_header)
        except ValueError:
            return _HttpError(400, "invalid_json", "Content-Length must be an integer.", "content_length")
        if length < 0:
            return _HttpError(400, "invalid_json", "Content-Length must be non-negative.", "content_length")
        if length > self.bridge.max_body_bytes:
            return _HttpError(413, "payload_too_large", "Shell HTTP payload is too large.", "body")

        raw_body = self.rfile.read(length)
        try:
            return json.loads(raw_body.decode("utf-8"))
        except UnicodeDecodeError:
            return _HttpError(400, "invalid_json", "Request body must be UTF-8 JSON.", "body")
        except json.JSONDecodeError as exc:
            return _HttpError(400, "invalid_json", f"Invalid JSON body: {exc.msg}", "body")

    def _write_method_not_allowed(self) -> None:
        self._write_shell_error(
            405,
            "method_not_allowed",
            "HTTP method is not supported by the local bridge.",
            target="method",
        )

    def _write_shell_error(self, status: int, code: str, message: str, *, target: str) -> None:
        self._write_json(status, bridge_error_response(code, message, target=target))

    def _write_json(self, status: int, payload: Mapping[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self._write_cors_headers()
        self.end_headers()
        self.wfile.write(encoded)

    def _write_cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin is not None and _is_local_dev_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")


class _HttpError:
    def __init__(self, status: int, code: str, message: str, target: str) -> None:
        self.status = status
        self.code = code
        self.message = message
        self.target = target


def bridge_error_response(code: str, message: str, *, target: str) -> dict[str, Any]:
    return {
        "ok": False,
        "data": None,
        "error": {
            "code": code,
            "message": message,
            "target": target,
            "details": None,
        },
        "warnings": [],
        "artifacts": [],
    }


def _is_local_dev_origin(origin: str) -> bool:
    parsed = urlparse(origin)
    return parsed.scheme in {"http", "https"} and parsed.hostname in {"localhost", "127.0.0.1", "::1"}


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="rxnflow-local-bridge")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", default=DEFAULT_PORT, type=int)
    args = parser.parse_args(argv)
    serve_local_bridge(args.host, args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
