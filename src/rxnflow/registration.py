"""Register parsed chemistry results into the RxnFlow database."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import uuid

from .database import connect_project_database
from .errors import RxnFlowError
from .parsers.ase import parse_ase_result
from .parsers.common import ParsedResult
from .parsers.gaussian import parse_gaussian_result
from .parsers.orca import parse_orca_result
from .paths import database_path, infer_project_root, objects_root


@dataclass(slots=True)
class RegistrationResult:
    result_record_id: str
    node_id: str
    calculation_id: str


def register_from_file(
    source_path: str | Path,
    parser_name: str | None = None,
    candidate: str | None = None,
    new_node: bool | None = None,
    attach_node: str | None = None,
    project_root: str | Path | None = None,
    charge: int | None = None,
    multiplicity: int | None = None,
    method_label: str | None = None,
    backend_label: str | None = None,
    images: int | None = None,
) -> RegistrationResult:
    source = Path(source_path).expanduser().absolute()
    root = infer_project_root(source) if project_root is None else Path(project_root).expanduser().absolute()
    parser_name = parser_name or infer_parser_name(source)
    candidate = candidate or infer_candidate(source, parser_name)
    create_node = attach_node is None if new_node is None else new_node
    if not create_node and attach_node is None:
        raise RxnFlowError("register requires --attach-node when new_node is false.")
    parsed = parse_external_result(
        source,
        parser_name,
        candidate,
        charge=charge,
        multiplicity=multiplicity,
        method_label=method_label,
        backend_label=backend_label,
        images=images,
    )
    return _insert_registration(
        project_root=root,
        source_path=source,
        source_program=parser_name,
        parser_name=parser_name,
        candidate=candidate,
        parsed=parsed,
        new_node=create_node,
        attach_node=attach_node,
    )


def parse_external_result(
    source_path: Path,
    parser_name: str,
    candidate: str,
    *,
    charge: int | None = None,
    multiplicity: int | None = None,
    method_label: str | None = None,
    backend_label: str | None = None,
    images: int | None = None,
) -> ParsedResult:
    if parser_name == "ase":
        return parse_ase_result(
            source_path,
            candidate,
            charge=charge,
            multiplicity=multiplicity,
            method_label=method_label,
            backend_label=backend_label,
            images=images,
        )
    if parser_name == "gaussian":
        return parse_gaussian_result(source_path, candidate)
    if parser_name == "orca":
        return parse_orca_result(source_path, candidate)
    raise RxnFlowError(f"Unsupported result parser '{parser_name}'.")


def infer_parser_name(source_path: str | Path) -> str:
    source = Path(source_path)
    suffix = source.suffix.lower()
    if suffix in {".extxyz", ".traj", ".xyz"}:
        return "ase"
    if suffix == ".log":
        return "gaussian"
    if suffix == ".out":
        return "orca"
    raise RxnFlowError(
        f"Cannot infer parser for '{source}'. Use --parser ase, --parser gaussian, or --parser orca."
    )


def infer_candidate(source_path: str | Path, parser_name: str) -> str:
    if parser_name != "ase":
        return "final"
    stem = Path(source_path).stem.lower()
    if stem == "neb_final_path" or stem == "scan_traj" or "peak" in stem:
        return "peak"
    return "final"


def _insert_registration(
    project_root: Path,
    source_path: Path,
    source_program: str,
    parser_name: str,
    candidate: str,
    parsed: ParsedResult,
    new_node: bool,
    attach_node: str | None,
) -> RegistrationResult:
    project_root = project_root.absolute()
    result_record_id = f"rr_{uuid.uuid4().hex[:12]}"
    node_id = f"node_{uuid.uuid4().hex[:12]}" if new_node else str(attach_node)
    calculation_id = f"calc_{uuid.uuid4().hex[:12]}"
    frozen_dir = objects_root(project_root) / "results" / result_record_id
    frozen_dir.mkdir(parents=True, exist_ok=True)
    frozen_structure = frozen_dir / "node.xyz"
    frozen_payload = frozen_dir / "calculation.json"
    frozen_structure.write_text(parsed.structure_xyz, encoding="utf-8")
    frozen_payload.write_text(
        json.dumps(
            {
                "source_kind": "import",
                "source_path": str(source_path),
                "candidate": candidate,
                "energy": parsed.energy,
                "method_label": parsed.method_label,
                "backend_label": parsed.backend_label,
            },
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    now = datetime.now(timezone.utc).isoformat()
    with connect_project_database(database_path(project_root)) as conn:
        import_record_id = f"import_{uuid.uuid4().hex[:12]}"
        conn.execute(
            "insert into import_record(import_record_id, source_program, source_path, parser_name, imported_at) values (?, ?, ?, ?, ?)",
            (import_record_id, source_program, str(source_path), parser_name, now),
        )
        conn.execute(
            "insert into result_record(result_record_id, source_kind, import_record_id, candidate_label, registered_at) values (?, ?, ?, ?, ?)",
            (result_record_id, "import", import_record_id, candidate, now),
        )
        if new_node:
            conn.execute(
                "insert into node(node_id, charge, multiplicity, origin_kind, frozen_structure_path) values (?, ?, ?, ?, ?)",
                (node_id, parsed.charge, parsed.multiplicity, "import", _relative_path(project_root, frozen_structure)),
            )
        else:
            row = conn.execute("select node_id from node where node_id = ?", (attach_node,)).fetchone()
            if row is None:
                raise RxnFlowError(f"Cannot attach calculation to unknown node '{attach_node}'.")
        conn.execute(
            "insert into calculation(calculation_id, node_id, result_record_id, method_label, backend_label, energy, frequency_summary_json, frozen_payload_path) values (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                calculation_id,
                node_id,
                result_record_id,
                parsed.method_label,
                parsed.backend_label,
                parsed.energy,
                parsed.frequency_summary_json,
                _relative_path(project_root, frozen_payload),
            ),
        )
    return RegistrationResult(result_record_id=result_record_id, node_id=node_id, calculation_id=calculation_id)


def _relative_path(project_root: Path, path: Path) -> str:
    try:
        return str(path.relative_to(project_root))
    except ValueError:
        return str(path)
