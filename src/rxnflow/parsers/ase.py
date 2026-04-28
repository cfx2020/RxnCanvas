"""ASE raw artifact parser."""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from ase import Atoms
from ase.io import read, write

from ..errors import RxnFlowError
from .common import ParsedResult


def parse_ase_result(
    source_path: str | Path,
    candidate: str,
    *,
    charge: int | None = None,
    multiplicity: int | None = None,
    method_label: str | None = None,
    backend_label: str | None = None,
    images: int | None = None,
) -> ParsedResult:
    source = Path(source_path).expanduser().absolute()
    frames = _read_frames(source)
    atoms = _select_candidate(frames, candidate, images)
    energy = _potential_energy(atoms, source)
    return ParsedResult(
        structure_xyz=_atoms_to_xyz(atoms),
        energy=energy,
        charge=_metadata_int(atoms, "charge", charge, 0),
        multiplicity=_metadata_int(atoms, "multiplicity", multiplicity, 1),
        method_label=method_label or str(atoms.info.get("model", "ase-raw")),
        backend_label=backend_label or str(atoms.info.get("backend", "ase")),
    )


def _read_frames(source: Path) -> list[Atoms]:
    try:
        frames = list(read(source, index=":"))
    except Exception as exc:
        raise RxnFlowError(f"Unable to read ASE artifact '{source}': {exc}") from exc
    if not frames:
        raise RxnFlowError(f"ASE artifact '{source}' contains no frames.")
    return frames


def _select_candidate(frames: list[Atoms], candidate: str, images: int | None) -> Atoms:
    if candidate == "final":
        return frames[-1]
    if candidate == "peak":
        candidates = frames
        if images is not None:
            if images < 1:
                raise RxnFlowError("--images must be a positive count.")
            if len(frames) < images:
                raise RxnFlowError(
                    f"ASE artifact contains {len(frames)} frames, fewer than --images {images}."
                )
            candidates = frames[-images:]
        return max(candidates, key=lambda atoms: _potential_energy(atoms, Path("<ase-artifact>")))
    raise RxnFlowError(f"ASE candidate '{candidate}' is not available.")


def _potential_energy(atoms: Atoms, source: Path) -> float:
    try:
        return float(atoms.get_potential_energy())
    except Exception as exc:
        raise RxnFlowError(
            f"ASE artifact '{source}' is missing potential energy for the requested candidate."
        ) from exc


def _atoms_to_xyz(atoms: Atoms) -> str:
    handle = StringIO()
    write(handle, atoms, format="xyz")
    return handle.getvalue()


def _metadata_int(atoms: Atoms, key: str, override: int | None, default: int) -> int:
    if override is not None:
        return int(override)
    if key in atoms.info:
        return int(atoms.info[key])
    return default
