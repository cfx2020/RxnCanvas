"""Parse raw task outputs into registration candidates."""

from __future__ import annotations

from dataclasses import dataclass
from io import StringIO
import json
from pathlib import Path

from ase import Atoms
from ase.io import read, write

from ..errors import WorkflowConfigError


@dataclass(slots=True)
class ParsedResult:
    structure_xyz: str
    energy: float
    charge: int
    multiplicity: int
    method_label: str
    backend_label: str
    frequency_summary_json: str = "{}"
    source_task_type: str = "unknown"


def parse_task_candidate(task_dir: Path, candidate: str) -> ParsedResult:
    metadata_path = task_dir / "metadata.json"
    if not metadata_path.exists():
        raise WorkflowConfigError(f"Task directory '{task_dir}' is missing metadata.json.")
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    artifact_key, energy_key = _candidate_keys(candidate)
    artifacts = metadata["artifacts"]
    summary = metadata["summary"]
    parsed_from_raw = _parse_ase_raw_candidate(task_dir, metadata, candidate)
    if parsed_from_raw is not None:
        return parsed_from_raw
    structure_path = Path(artifacts[artifact_key])
    if not structure_path.is_absolute():
        structure_path = task_dir / structure_path
    if not structure_path.exists():
        raise WorkflowConfigError(f"Task candidate structure '{structure_path}' does not exist.")
    settings = metadata["settings"]
    return ParsedResult(
        structure_xyz=structure_path.read_text(encoding="utf-8"),
        energy=float(summary[energy_key]),
        charge=int(settings["charge"]),
        multiplicity=int(settings["multiplicity"]),
        method_label=str(settings.get("model", "unknown-model")),
        backend_label=str(settings.get("backend", "unknown-backend")),
        source_task_type=str(metadata.get("task", {}).get("type", "unknown")),
    )


def _parse_ase_raw_candidate(task_dir: Path, metadata: dict, candidate: str) -> ParsedResult | None:
    task_type = str(metadata.get("task", {}).get("type", "unknown"))
    artifacts = metadata.get("artifacts", {})
    summary = metadata.get("summary", {})
    settings = metadata.get("settings", {})
    atoms = None
    if task_type in {"optimize", "geomopt"} and candidate == "final":
        atoms = _read_last_frame(task_dir, artifacts.get("ase_trajectory"))
    elif task_type == "scan":
        trajectories = artifacts.get("ase_step_trajectories") or []
        if trajectories:
            step_index = -1 if candidate == "final" else int(summary["peak_index"])
            atoms = _read_last_frame(task_dir, trajectories[step_index])
    elif task_type == "neb" and artifacts.get("ase_neb_trajectory"):
        frames = _read_frames(task_dir, artifacts["ase_neb_trajectory"])
        image_count = int(summary.get("images", metadata.get("neb", {}).get("images", 0) + 2))
        band = frames[-image_count:] if image_count > 0 and len(frames) >= image_count else frames
        if candidate == "peak":
            atoms = max(band, key=_potential_energy)
        elif candidate == "final":
            atoms = band[-1]
    if atoms is None:
        return None
    return ParsedResult(
        structure_xyz=_atoms_to_xyz(atoms),
        energy=_potential_energy(atoms),
        charge=int(settings["charge"]),
        multiplicity=int(settings["multiplicity"]),
        method_label=str(settings.get("model", "unknown-model")),
        backend_label=str(settings.get("backend", "unknown-backend")),
        source_task_type=task_type,
    )


def _read_last_frame(task_dir: Path, artifact_path: str | None) -> Atoms | None:
    if artifact_path is None:
        return None
    frames = _read_frames(task_dir, artifact_path)
    return frames[-1]


def _read_frames(task_dir: Path, artifact_path: str) -> list[Atoms]:
    path = Path(artifact_path)
    if not path.is_absolute():
        path = task_dir / path
    if not path.exists():
        raise WorkflowConfigError(f"Task ASE artifact '{path}' does not exist.")
    try:
        frames = list(read(path, index=":"))
    except Exception as exc:
        raise WorkflowConfigError(f"Unable to read task ASE artifact '{path}': {exc}") from exc
    if not frames:
        raise WorkflowConfigError(f"Task ASE artifact '{path}' contains no frames.")
    return frames


def _potential_energy(atoms: Atoms) -> float:
    try:
        return float(atoms.get_potential_energy())
    except Exception as exc:
        raise WorkflowConfigError("Task ASE artifact is missing potential energy.") from exc


def _atoms_to_xyz(atoms: Atoms) -> str:
    handle = StringIO()
    write(handle, atoms, format="xyz")
    return handle.getvalue()


def _candidate_keys(candidate: str) -> tuple[str, str]:
    if candidate == "final":
        return "result_structure", "final_energy"
    if candidate == "peak":
        return "ts_like_structure", "peak_energy"
    raise WorkflowConfigError(f"Task candidate '{candidate}' is not available.")
