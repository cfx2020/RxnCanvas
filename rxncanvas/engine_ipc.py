"""Line-delimited JSON command boundary for the desktop local engine.

This module is intentionally small: Electron can spawn it for smoke-level
health checks without bringing back the archived local HTTP bridge.
"""

from __future__ import annotations

import importlib
import json
import os
import platform
import sys
from dataclasses import asdict
from importlib import metadata
from typing import Any

from .engine import (
    ImportRegistrationInputError,
    demo_flow,
    export_flow_json,
    open_project,
    preview_sources,
    register_import_candidates,
    save_project,
    validate_project_content,
)
from .version import __version__


ENGINE_VERSION = __version__


def handle_request(request: dict[str, Any]) -> dict[str, Any]:
    command = request.get("command")
    if command == "engine.status":
        return {
            "ok": True,
            "data": {
                "status": "ready",
                "engineVersion": ENGINE_VERSION,
                "runtime": runtime_name(),
                "pythonVersion": platform.python_version(),
                "pid": os.getpid(),
                "dependencies": {
                    "cclib": dependency_status("cclib"),
                },
                "capabilities": [
                    "engine.status",
                    "flow.demo",
                    "import.full_file",
                    "import.preview",
                    "import.register_all",
                    "import.register_selection",
                    "project.validate",
                    "project.open",
                    "project.save",
                ],
            },
        }
    if command == "flow.demo":
        flow = demo_flow()
        return {
            "ok": True,
            "data": {
                "flow": asdict(flow),
                "json": export_flow_json(flow),
            },
        }
    if command == "import.preview":
        files = request.get("files")
        if not isinstance(files, list):
            return {
                "ok": False,
                "error": {
                    "code": "invalid_input",
                    "message": "import.preview requires a files array.",
                },
            }
        return {
            "ok": True,
            "data": {
                "files": preview_sources([file for file in files if isinstance(file, dict)]),
            },
        }
    if command in {"import.register_all", "import.register_selection"}:
        files = request.get("files")
        if not isinstance(files, list):
            return invalid_input(f"{command} requires a files array.")
        selections = request.get("selections")
        if command == "import.register_selection" and not isinstance(selections, list):
            return invalid_input("import.register_selection requires a selections array.")
        try:
            return {
                "ok": True,
                "data": register_import_candidates(
                    [file for file in files if isinstance(file, dict)],
                    selections=selections if isinstance(selections, list) else None,
                    register_all=command == "import.register_all",
                ),
            }
        except ImportRegistrationInputError as exc:
            return {
                "ok": False,
                "error": {
                    "code": "invalid_input",
                    "message": str(exc),
                    "target": exc.target,
                },
            }
    if command == "project.validate":
        content = request.get("content")
        if not isinstance(content, str):
            return invalid_input("project.validate requires a content string.")
        project_path = request.get("projectPath")
        return {
            "ok": True,
            "data": validate_project_content(content, project_path if isinstance(project_path, str) and project_path else None),
        }
    if command == "project.open":
        project_path = request.get("projectPath")
        if not isinstance(project_path, str) or not project_path:
            return invalid_input("project.open requires a projectPath string.")
        try:
            return {
                "ok": True,
                "data": open_project(project_path),
            }
        except OSError as exc:
            return {
                "ok": False,
                "error": {
                    "code": "project_open_failed",
                    "message": str(exc),
                },
            }
    if command == "project.save":
        project_path = request.get("projectPath")
        content = request.get("content")
        if not isinstance(project_path, str) or not project_path or not isinstance(content, str):
            return invalid_input("project.save requires projectPath and content strings.")
        try:
            saved = save_project(project_path, content)
        except OSError as exc:
            return {
                "ok": False,
                "error": {
                    "code": "project_save_failed",
                    "message": str(exc),
                },
            }
        if not saved.get("saved"):
            return {
                "ok": False,
                "error": {
                    "code": "project_invalid",
                    "message": "RxnCanvas project content did not pass validation.",
                },
                "data": saved,
            }
        return {
            "ok": True,
            "data": saved,
        }
    return {
        "ok": False,
        "error": {
            "code": "unknown_command",
            "message": f"Unsupported engine command: {command!r}",
        },
    }


def runtime_name() -> str:
    return "bundled-python" if getattr(sys, "frozen", False) else "python"


def dependency_status(package_name: str) -> dict[str, Any]:
    try:
        version = metadata.version(package_name)
    except metadata.PackageNotFoundError:
        try:
            module = importlib.import_module(package_name)
        except (ImportError, ModuleNotFoundError):
            return {
                "available": False,
                "version": None,
            }
        version = getattr(module, "__version__", None)
    return {
        "available": True,
        "version": version,
    }


def invalid_input(message: str) -> dict[str, Any]:
    return {
        "ok": False,
        "error": {
            "code": "invalid_input",
            "message": message,
        },
    }


def parse_request(payload: str) -> tuple[dict[str, Any], int]:
    try:
        request = json.loads(payload)
    except json.JSONDecodeError as exc:
        return {
            "ok": False,
            "error": {
                "code": "invalid_json",
                "message": str(exc),
            },
        }, 2

    response = handle_request(request if isinstance(request, dict) else {})
    return response, 0 if response.get("ok") else 1


def main() -> int:
    exit_code: int | None = None
    received_input = False

    for payload in sys.stdin:
        received_input = True
        response, exit_code = parse_request(payload)
        print(json.dumps(response, sort_keys=True), flush=True)

    if not received_input:
        response, exit_code = parse_request("{}")
        print(json.dumps(response, sort_keys=True), flush=True)

    return exit_code if exit_code is not None else 1


if __name__ == "__main__":
    raise SystemExit(main())
