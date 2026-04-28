"""Typed task config models."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


VALID_SCAN_COORDINATE_TYPES = {"distance", "angle", "dihedral"}
VALID_CONSTRAINT_TYPES = {"freeze_atoms", "distance", "angle", "dihedral"}
VALID_TASK_TYPES = {"optimize", "scan", "neb"}
DEFAULT_TASK_OPTIMIZER = {"optimize": "LBFGS", "scan": "LBFGS", "neb": "LBFGS"}
DEFAULT_TASK_FMAX = {"optimize": 0.0025, "scan": 0.0025, "neb": 0.025}
DEFAULT_TASK_STEPS = {"optimize": 2000, "scan": 2000, "neb": 2000}


@dataclass(slots=True)
class ScanCoordinate:
    type: str
    atoms: list[int]
    start: float
    stop: float
    steps: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ScanCoordinate":
        return cls(
            type=data["type"],
            atoms=[int(atom) for atom in data["atoms"]],
            start=float(data["start"]),
            stop=float(data["stop"]),
            steps=int(data["steps"]),
        )


@dataclass(slots=True)
class ConstraintSpec:
    type: str
    atoms: list[int]
    value: float | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ConstraintSpec":
        return cls(
            type=data["type"],
            atoms=[int(atom) for atom in data["atoms"]],
            value=None if "value" not in data else float(data["value"]),
        )


@dataclass(slots=True)
class TaskDirectoryConfig:
    id: str
    directory: Path
    input_path: Path | None
    type: str
    charge: int
    multiplicity: int
    backend: str = "uma"
    model: str = "uma-s-1p1"
    device: str = "cuda"
    task_name: str = "omol"
    optimizer: str = "LBFGS"
    fmax: float = DEFAULT_TASK_FMAX["optimize"]
    steps: int = DEFAULT_TASK_STEPS["optimize"]
    coordinate: ScanCoordinate | None = None
    constraints: list[ConstraintSpec] = field(default_factory=list)
    initial_path: Path | None = None
    final_path: Path | None = None
    intermediate_images: int | None = None
    climb: bool = False
