"""Minimal Gaussian parser for registered final results."""

from __future__ import annotations

import re
from pathlib import Path

from ..errors import RxnFlowError
from .common import ParsedResult


def parse_gaussian_result(path: str | Path, candidate: str) -> ParsedResult:
    if candidate != "final":
        raise RxnFlowError("Gaussian parser currently supports only candidate 'final'.")
    source = Path(path)
    text = source.read_text(encoding="utf-8", errors="replace")
    charge, multiplicity = _parse_charge_multiplicity(text)
    energy = _parse_energy(text)
    return ParsedResult(
        structure_xyz=_parse_final_xyz(text),
        energy=energy,
        charge=charge,
        multiplicity=multiplicity,
        method_label="gaussian",
        backend_label="gaussian",
    )


def _parse_charge_multiplicity(text: str) -> tuple[int, int]:
    match = re.search(r"Charge\s*=\s*(-?\d+)\s+Multiplicity\s*=\s*(\d+)", text)
    if not match:
        raise RxnFlowError("Gaussian result is missing charge/multiplicity.")
    return int(match.group(1)), int(match.group(2))


def _parse_energy(text: str) -> float:
    match = re.search(r"SCF Done:\s+E\([^)]+\)\s*=\s*(-?\d+(?:\.\d+)?)", text)
    if not match:
        raise RxnFlowError("Gaussian result is missing final SCF energy.")
    return float(match.group(1))


def _parse_final_xyz(text: str) -> str:
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if line.strip() == "Final XYZ:":
            try:
                atom_count = int(lines[index + 1].strip())
            except (IndexError, ValueError) as exc:
                raise RxnFlowError("Gaussian final XYZ block is malformed.") from exc
            block = lines[index + 1 : index + 3 + atom_count]
            if len(block) != atom_count + 2:
                raise RxnFlowError("Gaussian final XYZ block is incomplete.")
            return "\n".join(block) + "\n"
    raise RxnFlowError("Gaussian result is missing a Final XYZ block.")
