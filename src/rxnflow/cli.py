"""CLI entrypoint for the workflow tool."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path

from .config import load_workflow_config
from .database import delete_result
from .errors import WorkflowConfigError
from .execution import run_task_directory, run_workflow
from .paths import database_path
from .reporting import create_report, generate_report, rebind_report_site, render_report, validate_report
from .registration import register_from_file, register_from_task
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

    register_parser = subparsers.add_parser("register-result", help="Register one task or external result")
    source_group = register_parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument("--from-task", dest="from_task", help="Path to task/<task-id> with raw artifacts")
    source_group.add_argument("--from-file", dest="from_file", help="Path to an external Gaussian/ORCA/ASE output file")
    register_parser.add_argument("--parser", choices=["ase", "gaussian", "orca"], help="Parser for --from-file")
    register_parser.add_argument("--candidate", required=True, help="Candidate label, such as final or peak")
    register_parser.add_argument("--charge", type=int, help="Charge for --parser ase when the raw file has no metadata")
    register_parser.add_argument("--multiplicity", type=int, help="Multiplicity for --parser ase when the raw file has no metadata")
    register_parser.add_argument("--method-label", help="Method label for --parser ase")
    register_parser.add_argument("--backend-label", help="Backend label for --parser ase")
    register_parser.add_argument("--images", type=int, help="Number of images in the last ASE NEB band for --candidate peak")
    register_parser.add_argument("--project-root", help="Project root for --from-file registration; default is cwd")
    node_group = register_parser.add_mutually_exclusive_group(required=True)
    node_group.add_argument("--new-node", action="store_true", help="Create a new registered node")
    node_group.add_argument("--attach-node", help="Attach the calculation to an existing node id")

    report_parser = subparsers.add_parser("report", help="Regenerate reports from existing task artifacts")
    report_parser.add_argument("config", help="Path to workflow YAML")
    report_parser.add_argument("--reference", help="Override report zero-point reference id")

    create_report_parser = subparsers.add_parser("create-report", help="Create one report directory")
    create_report_parser.add_argument("report_dir")

    validate_report_parser = subparsers.add_parser("validate-report", help="Validate one report directory")
    validate_report_parser.add_argument("report_dir")

    rebind_report_parser = subparsers.add_parser("rebind-report", help="Bind a report site to a calculation")
    rebind_report_parser.add_argument("report_dir")
    rebind_report_parser.add_argument("--site", required=True)
    rebind_report_parser.add_argument("--calculation", required=True)

    render_report_parser = subparsers.add_parser("render-report", help="Render one report directory")
    render_report_parser.add_argument("report_dir")

    delete_parser = subparsers.add_parser("delete-result", help="Delete one registered result")
    delete_parser.add_argument("project_root")
    delete_parser.add_argument("result_record_id")
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

    if args.command == "register-result":
        try:
            if args.from_task:
                registration = register_from_task(
                    args.from_task,
                    args.candidate,
                    new_node=args.new_node,
                    attach_node=args.attach_node,
                )
            else:
                if args.parser is None:
                    raise WorkflowConfigError("--from-file requires --parser.")
                registration = register_from_file(
                    args.from_file,
                    args.parser,
                    args.candidate,
                    new_node=args.new_node,
                    attach_node=args.attach_node,
                    project_root=args.project_root,
                    charge=args.charge,
                    multiplicity=args.multiplicity,
                    method_label=args.method_label,
                    backend_label=args.backend_label,
                    images=args.images,
                )
        except WorkflowConfigError as exc:
            parser.exit(2, f"Registration error: {exc}\n")
        print(json.dumps(asdict(registration), indent=2))
        return 0

    if args.command == "create-report":
        try:
            report_dir = create_report(args.report_dir)
        except WorkflowConfigError as exc:
            parser.exit(2, f"Report error: {exc}\n")
        print(json.dumps({"report_dir": str(report_dir)}, indent=2))
        return 0

    if args.command == "rebind-report":
        try:
            rebind_report_site(args.report_dir, args.site, args.calculation)
        except WorkflowConfigError as exc:
            parser.exit(2, f"Report error: {exc}\n")
        print(json.dumps({"report_dir": args.report_dir, "site": args.site, "calculation": args.calculation}, indent=2))
        return 0

    if args.command == "validate-report":
        try:
            report_config = validate_report(args.report_dir)
        except WorkflowConfigError as exc:
            parser.exit(2, f"Report error: {exc}\n")
        print(json.dumps({"report_id": report_config.id, "report_dir": str(report_config.directory), "valid": True}, indent=2))
        return 0

    if args.command == "render-report":
        try:
            report_dir = render_report(args.report_dir)
        except WorkflowConfigError as exc:
            parser.exit(2, f"Report error: {exc}\n")
        print(json.dumps({"report_dir": str(report_dir)}, indent=2))
        return 0

    if args.command == "delete-result":
        delete_result(database_path(Path(args.project_root)), args.result_record_id)
        print(json.dumps({"deleted": args.result_record_id}, indent=2))
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
