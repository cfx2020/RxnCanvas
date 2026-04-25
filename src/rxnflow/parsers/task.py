"""Parse task-directory raw artifacts into registration candidates."""

from __future__ import annotations

from dataclasses import dataclass
from io import StringIO
from pathlib import Path

from ase import Atoms
from ase.io import read, write

from ..errors import WorkflowConfigError
from ..task_config import load_task_directory


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
    task = load_task_directory(task_dir)
    if task.type == "optimize":
        atoms = _select_optimize_candidate(task.directory, candidate)
    elif task.type == "scan":
        atoms = _select_scan_candidate(task.directory, candidate)
    elif task.type == "neb":
        atoms = _select_neb_candidate(task.directory, candidate, task.images)
    else:
        raise WorkflowConfigError(f"Unsupported task type '{task.type}'.")
    return ParsedResult(
        structure_xyz=_atoms_to_xyz(atoms),
        energy=_potential_energy(atoms),
        charge=task.charge,
        multiplicity=task.multiplicity,
        method_label=task.model,
        backend_label=task.backend,
        source_task_type=task.type,
    )


def _select_optimize_candidate(task_dir: Path, candidate: str) -> Atoms:
    if candidate != "final":
        raise WorkflowConfigError("Optimize task exposes only candidate 'final'.")
    return _read_last_frame(task_dir / "ase" / "optimize.traj")


def _select_scan_candidate(task_dir: Path, candidate: str) -> Atoms:
    step_trajectories = sorted((task_dir / "ase").glob("scan_step_*.traj"))
    if not step_trajectories:
        raise WorkflowConfigError(f"Scan task '{task_dir}' has no ASE scan step trajectories.")
    frames = [_read_last_frame(path) for path in step_trajectories]
    if candidate == "final":
        return frames[-1]
    if candidate == "peak":
        return max(frames, key=_potential_energy)
    raise WorkflowConfigError(f"Scan task candidate '{candidate}' is not available.")


def _select_neb_candidate(task_dir: Path, candidate: str, interior_images: int | None) -> Atoms:
    if interior_images is None:
        raise WorkflowConfigError("NEB task.yaml must declare images.")
    image_count = interior_images + 2
    frames = _read_frames(task_dir / "ase" / "neb.traj")
    if len(frames) < image_count:
        raise WorkflowConfigError(
            f"NEB trajectory has {len(frames)} frames, fewer than expected image count {image_count}."
        )
    band = frames[-image_count:]
    if candidate == "final":
        return band[-1]
    if candidate == "peak":
        return max(band, key=_potential_energy)
    raise WorkflowConfigError(f"NEB task candidate '{candidate}' is not available.")


def _read_last_frame(path: Path) -> Atoms:
    return _read_frames(path)[-1]


def _read_frames(path: Path) -> list[Atoms]:
    if not path.exists():
        raise WorkflowConfigError(f"ASE artifact '{path}' does not exist.")
    try:
        frames = list(read(path, index=":"))
    except Exception as exc:
        raise WorkflowConfigError(f"Unable to read ASE artifact '{path}': {exc}") from exc
    if not frames:
        raise WorkflowConfigError(f"ASE artifact '{path}' contains no frames.")
    return frames


def _potential_energy(atoms: Atoms) -> float:
    try:
        return float(atoms.get_potential_energy())
    except Exception as exc:
        raise WorkflowConfigError("ASE artifact is missing potential energy.") from exc


def _atoms_to_xyz(atoms: Atoms) -> str:
    handle = StringIO()
    write(handle, atoms, format="xyz")
    return handle.getvalue()
