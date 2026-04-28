"""CLI entrypoint for RxnFlow."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path

from .database import delete_result
from .errors import RxnFlowError
from .execution import run_task_directory
from .paths import database_path
from .reporting import create_report, rebind_report_site, render_report, validate_report
from .registration import register_from_file
from .task_config import load_task_directory


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rxnflow", description="RxnFlow task and result CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_task_parser = subparsers.add_parser("validate-task", help="Validate one task directory")
    validate_task_parser.add_argument("task_dir", help="Path to task/<task-id>")

    run_task_parser = subparsers.add_parser("run-task", help="Run one task directory")
    run_task_parser.add_argument("task_dir", help="Path to task/<task-id>")

    register_parser = subparsers.add_parser("register-result", help="Register one raw result file")
    _add_register_arguments(register_parser, positional_source=False)

    register_short_parser = subparsers.add_parser("register", help="Register one raw result file")
    _add_register_arguments(register_short_parser, positional_source=True)

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
        except RxnFlowError as exc:
            parser.exit(2, f"Task configuration error: {exc}\n")
        print(json.dumps({"task_id": task_config.id, "task_dir": str(task_config.directory), "valid": True}, indent=2))
        return 0

    if args.command == "run-task":
        try:
            task_config = load_task_directory(args.task_dir)
            run_task_directory(task_config)
        except RxnFlowError as exc:
            parser.exit(2, f"Task execution error: {exc}\n")
        print(json.dumps({"task_id": task_config.id, "task_dir": str(task_config.directory)}, indent=2))
        return 0

    if args.command in {"register-result", "register"}:
        try:
            registration = register_from_file(
                args.source,
                parser_name=args.parser,
                candidate=args.candidate,
                new_node=args.new_node or args.attach_node is None,
                attach_node=args.attach_node,
                project_root=args.project_root,
                charge=args.charge,
                multiplicity=args.multiplicity,
                method_label=args.method_label,
                backend_label=args.backend_label,
                images=args.images,
            )
        except RxnFlowError as exc:
            parser.exit(2, f"Registration error: {exc}\n")
        print(json.dumps(asdict(registration), indent=2))
        return 0

    if args.command == "create-report":
        try:
            report_dir = create_report(args.report_dir)
        except RxnFlowError as exc:
            parser.exit(2, f"Report error: {exc}\n")
        print(json.dumps({"report_dir": str(report_dir)}, indent=2))
        return 0

    if args.command == "rebind-report":
        try:
            rebind_report_site(args.report_dir, args.site, args.calculation)
        except RxnFlowError as exc:
            parser.exit(2, f"Report error: {exc}\n")
        print(json.dumps({"report_dir": args.report_dir, "site": args.site, "calculation": args.calculation}, indent=2))
        return 0

    if args.command == "validate-report":
        try:
            report_config = validate_report(args.report_dir)
        except RxnFlowError as exc:
            parser.exit(2, f"Report error: {exc}\n")
        print(json.dumps({"report_id": report_config.id, "report_dir": str(report_config.directory), "valid": True}, indent=2))
        return 0

    if args.command == "render-report":
        try:
            report_dir = render_report(args.report_dir)
        except RxnFlowError as exc:
            parser.exit(2, f"Report error: {exc}\n")
        print(json.dumps({"report_dir": str(report_dir)}, indent=2))
        return 0

    if args.command == "delete-result":
        delete_result(database_path(Path(args.project_root)), args.result_record_id)
        print(json.dumps({"deleted": args.result_record_id}, indent=2))
        return 0

    parser.error(f"Unknown command: {args.command}")
    return 2


def _add_register_arguments(register_parser: argparse.ArgumentParser, *, positional_source: bool) -> None:
    if positional_source:
        register_parser.add_argument("source", help="Path to an ASE, Gaussian, or ORCA output file")
    else:
        register_parser.add_argument(
            "--from-file",
            dest="source",
            required=True,
            help="Path to an ASE, Gaussian, or ORCA output file",
        )
    register_parser.add_argument(
        "--parser",
        choices=["ase", "gaussian", "orca"],
        help="Parser for the source file; defaults to extension-based inference",
    )
    candidate_group = register_parser.add_mutually_exclusive_group()
    candidate_group.add_argument("--candidate", choices=["final", "peak"], help="Candidate label")
    candidate_group.add_argument("--final", dest="candidate", action="store_const", const="final", help="Register final frame")
    candidate_group.add_argument(
        "--peak",
        dest="candidate",
        action="store_const",
        const="peak",
        help="Register the highest-energy frame",
    )
    register_parser.add_argument("--charge", type=int, help="Charge override for ASE files missing metadata")
    register_parser.add_argument("--multiplicity", type=int, help="Multiplicity override for ASE files missing metadata")
    register_parser.add_argument("--method-label", help="Method label override for ASE files missing metadata")
    register_parser.add_argument("--backend-label", help="Backend label override for ASE files missing metadata")
    register_parser.add_argument(
        "--images",
        type=int,
        help="Tail frame count for selecting peak from a multi-step ASE NEB trajectory",
    )
    register_parser.add_argument("--project-root", help="Project root for registration; default is inferred from source or cwd")
    node_group = register_parser.add_mutually_exclusive_group()
    node_group.add_argument("--new-node", action="store_true", help="Create a new registered node; this is the default")
    node_group.add_argument("--attach-node", help="Attach the calculation to an existing node id")
