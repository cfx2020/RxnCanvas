"""Command-line entry point for the RxnFlow platform shell."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Sequence

from .platform import AppKernel, PlatformShellService, ShellCommand


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return int(exc.code)

    command = _command_from_args(args)
    if command is None:
        parser.print_help(sys.stderr)
        return 2

    response = PlatformShellService(AppKernel()).run(command)
    print(json.dumps(response.to_dict(), ensure_ascii=False, sort_keys=True))
    return 0 if response.ok else 1


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rxnflow")
    subparsers = parser.add_subparsers(dest="command")

    fixture = subparsers.add_parser("fixture", help="Run the built-in fixture workflow.")
    fixture.add_argument("--json", action="store_true", help="Emit JSON output.")
    fixture.add_argument("--export-format", action="append", default=[], choices=("png", "cdxml", "xlsx"))
    fixture.add_argument("--export-dir")
    fixture.add_argument("--basename", default="fixture")
    fixture.add_argument("--include-bytes", action="store_true")

    project = subparsers.add_parser("project", help="Project commands.")
    project_subparsers = project.add_subparsers(dest="project_command")
    project_create = project_subparsers.add_parser("create", help="Create a project directory.")
    project_create.add_argument("--json", action="store_true", help="Emit JSON output.")
    project_create.add_argument("--name", required=True)
    project_create.add_argument("--location", required=True)
    project_load = project_subparsers.add_parser("load", help="Load a project manifest.")
    project_load.add_argument("--json", action="store_true", help="Emit JSON output.")
    project_load.add_argument("--project-path", required=True)
    project_open = project_subparsers.add_parser("open", help="Open a project and restore saved content.")
    project_open.add_argument("--json", action="store_true", help="Emit JSON output.")
    project_open.add_argument("--project-path", required=True)
    project_open.add_argument(
        "--manifest-only",
        action="store_true",
        help="Open only the project manifest without loading saved project content.",
    )

    import_command = subparsers.add_parser("import", help="Import commands.")
    import_subparsers = import_command.add_subparsers(dest="import_command")
    import_preview = import_subparsers.add_parser("preview", help="Preview parser output for a raw file.")
    import_preview.add_argument("--json", action="store_true", help="Emit JSON output.")
    import_preview.add_argument("--project-path", required=True)
    import_preview.add_argument("--source-path", required=True)
    import_preview.add_argument("--expected-format")

    return parser


def _command_from_args(args: argparse.Namespace) -> ShellCommand | None:
    if args.command == "fixture":
        command_args = {
            "export_formats": tuple(args.export_format),
            "basename": args.basename,
            "include_bytes": args.include_bytes,
        }
        if args.export_dir is not None:
            command_args["destination_dir"] = args.export_dir
        return ShellCommand("fixture.run", command_args)

    if args.command == "project" and args.project_command == "create":
        return ShellCommand(
            "project.create",
            {"name": args.name, "location": args.location},
        )

    if args.command == "project" and args.project_command == "load":
        return ShellCommand("project.load", {"project_path": args.project_path})

    if args.command == "project" and args.project_command == "open":
        return ShellCommand(
            "project.open",
            {
                "project_path": args.project_path,
                "load_content": not args.manifest_only,
            },
        )

    if args.command == "import" and args.import_command == "preview":
        command_args = {
            "project_path": args.project_path,
            "source_path": args.source_path,
        }
        if args.expected_format is not None:
            command_args["expected_format"] = args.expected_format
        return ShellCommand("import.preview", command_args)

    return None


if __name__ == "__main__":
    raise SystemExit(main())
