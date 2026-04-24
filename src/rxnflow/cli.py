"""CLI entrypoint for the workflow tool."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict

from .config import load_workflow_config
from .errors import WorkflowConfigError
from .execution import run_task_directory, run_workflow
from .reporting import generate_report
from .task_config import load_task_directory


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rxnflow", description="RxnFlow workflow CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate", help="Validate a workflow YAML file")
    validate_parser.add_argument("config", help="Path to workflow YAML")
    validate_parser.add_argument("--json", action="store_true", help="Emit parsed config as JSON")

    validate_task_parser = subparsers.add_parser("validate-task", help="Validate one task directory")
    validate_task_parser.add_argument("task_dir", help="Path to task/<task-id>")

    run_parser = subparsers.add_parser("run", help="Run workflow tasks from a YAML file")
    run_parser.add_argument("config", help="Path to workflow YAML")
    run_parser.add_argument("--tasks", nargs="*", help="Optional subset of task ids to run")

    run_task_parser = subparsers.add_parser("run-task", help="Run one task directory")
    run_task_parser.add_argument("task_dir", help="Path to task/<task-id>")

    report_parser = subparsers.add_parser("report", help="Regenerate reports from existing task artifacts")
    report_parser.add_argument("config", help="Path to workflow YAML")
    report_parser.add_argument("--reference", help="Override report zero-point reference id")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "validate-task":
        try:
            task_config = load_task_directory(args.task_dir)
        except WorkflowConfigError as exc:
            parser.exit(2, f"Task configuration error: {exc}\n")
        print(json.dumps({"task_id": task_config.id, "task_dir": str(task_config.directory), "valid": True}, indent=2))
        return 0

    if args.command == "run-task":
        try:
            task_config = load_task_directory(args.task_dir)
            run_task_directory(task_config)
        except WorkflowConfigError as exc:
            parser.exit(2, f"Task execution error: {exc}\n")
        print(json.dumps({"task_id": task_config.id, "task_dir": str(task_config.directory)}, indent=2))
        return 0

    try:
        config = load_workflow_config(args.config)
    except WorkflowConfigError as exc:
        parser.exit(2, f"Configuration error: {exc}\n")

    if args.command == "validate":
        if args.json:
            print(json.dumps(asdict(config), indent=2, default=str))
        else:
            print(f"Configuration valid: {config.source_path}")
        return 0

    if args.command == "run":
        completed = run_workflow(config, selected_task_ids=args.tasks)
        print(json.dumps({"completed_tasks": completed}, indent=2))
        return 0

    if args.command == "report":
        report_dir = generate_report(config, reference_override=args.reference)
        print(json.dumps({"report_dir": str(report_dir)}, indent=2))
        return 0

    parser.error(f"Unknown command: {args.command}")
    return 2
