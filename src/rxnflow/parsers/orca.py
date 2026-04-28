"""Minimal ORCA parser for registered final results."""

from __future__ import annotations

import re
from pathlib import Path

from ..errors import RxnFlowError
from .gaussian import _parse_final_xyz
from .common import ParsedResult


def parse_orca_result(path: str | Path, candidate: str) -> ParsedResult:
    if candidate != "final":
        raise RxnFlowError("ORCA parser currently supports only candidate 'final'.")
    source = Path(path)
    text = source.read_text(encoding="utf-8", errors="replace")
    charge, multiplicity = _parse_charge_multiplicity(text)
    energy = _parse_energy(text)
    return ParsedResult(
        structure_xyz=_parse_final_xyz(text),
        energy=energy,
        charge=charge,
        multiplicity=multiplicity,
        method_label="orca",
        backend_label="orca",
    )


def _parse_charge_multiplicity(text: str) -> tuple[int, int]:
    match = re.search(r"^\*\s+xyz\s+(-?\d+)\s+(\d+)", text, flags=re.MULTILINE | re.IGNORECASE)
    if not match:
        raise RxnFlowError("ORCA result is missing xyz charge/multiplicity.")
    return int(match.group(1)), int(match.group(2))


def _parse_energy(text: str) -> float:
    match = re.search(r"FINAL SINGLE POINT ENERGY\s+(-?\d+(?:\.\d+)?)", text)
    if not match:
        raise RxnFlowError("ORCA result is missing final single point energy.")
    return float(match.group(1))
