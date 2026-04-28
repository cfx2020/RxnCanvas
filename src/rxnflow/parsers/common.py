"""Shared parser result models."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class ParsedResult:
    structure_xyz: str
    energy: float
    charge: int
    multiplicity: int
    method_label: str
    backend_label: str
    frequency_summary_json: str = "{}"
