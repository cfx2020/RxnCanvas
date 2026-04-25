"""Typed workflow config models."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


VALID_SCAN_COORDINATE_TYPES = {"distance", "angle", "dihedral"}
VALID_CONSTRAINT_TYPES = {"freeze_atoms", "distance", "angle", "dihedral"}
VALID_TASK_TYPES = {"optimize", "geomopt", "scan", "neb"}


@dataclass(slots=True)
class Defaults:
    backend: str = "uma"
    model: str = "uma-s-1p1"
    device: str = "cuda"
    task_name: str = "omol"
    optimizer: str = "LBFGS"
    fmax: float = 0.05
    max_steps: int = 200
    output_root: str = "."

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "Defaults":
        data = data or {}
        return cls(
            backend=data.get("backend", "uma"),
            model=data.get("model", "uma-s-1p1"),
            device=data.get("device", "cuda"),
            task_name=data.get("task_name", "omol"),
            optimizer=data.get("optimizer", "LBFGS"),
            fmax=float(data.get("fmax", 0.05)),
            max_steps=int(data.get("steps", data.get("max_steps", 200))),
            output_root=data.get("output_root", "."),
        )


@dataclass(slots=True)
class StructureNode:
    id: str
    path: str
    charge: int
    multiplicity: int
    tags: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "StructureNode":
        return cls(
            id=data["id"],
            path=data["path"],
            charge=int(data["charge"]),
            multiplicity=int(data["multiplicity"]),
            tags=list(data.get("tags", [])),
        )


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
class TaskConfig:
    id: str
    type: str
    input: str | None = None
    initial: str | None = None
    final: str | None = None
    images: int | None = None
    coordinate: ScanCoordinate | None = None
    constraints: list[ConstraintSpec] = field(default_factory=list)
    charge: int | None = None
    multiplicity: int | None = None
    backend: str | None = None
    model: str | None = None
    device: str | None = None
    task_name: str | None = None
    optimizer: str | None = None
    fmax: float | None = None
    max_steps: int | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TaskConfig":
        coordinate = None
        if "coordinate" in data and data["coordinate"] is not None:
            coordinate = ScanCoordinate.from_dict(data["coordinate"])
        constraints = [ConstraintSpec.from_dict(item) for item in data.get("constraints", [])]
        return cls(
            id=data["id"],
            type=data["type"],
            input=data.get("input"),
            initial=data.get("initial"),
            final=data.get("final"),
            images=None if "images" not in data else int(data["images"]),
            coordinate=coordinate,
            constraints=constraints,
            charge=None if "charge" not in data else int(data["charge"]),
            multiplicity=None if "multiplicity" not in data else int(data["multiplicity"]),
            backend=data.get("backend"),
            model=data.get("model"),
            device=data.get("device"),
            task_name=data.get("task_name"),
            optimizer=data.get("optimizer"),
            fmax=None if "fmax" not in data else float(data["fmax"]),
            max_steps=None if "steps" not in data and "max_steps" not in data else int(data.get("steps", data.get("max_steps"))),
        )


@dataclass(slots=True)
class BranchSpec:
    id: str
    tasks: list[str]
    label: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BranchSpec":
        return cls(id=data["id"], tasks=list(data.get("tasks", [])), label=data.get("label"))


@dataclass(slots=True)
class ReportConfig:
    id: str = "main"
    reference: str | None = None
    branches: list[BranchSpec] = field(default_factory=list)
    export_gaussian: bool = False

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "ReportConfig":
        data = data or {}
        return cls(
            id=data.get("id", "main"),
            reference=data.get("reference"),
            branches=[BranchSpec.from_dict(item) for item in data.get("branches", [])],
            export_gaussian=bool(data.get("export_gaussian", False)),
        )


@dataclass(slots=True)
class WorkflowConfig:
    source_path: Path
    defaults: Defaults
    references: list[StructureNode]
    nodes: list[StructureNode]
    tasks: list[TaskConfig]
    report: ReportConfig


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
    fmax: float = 0.05
    max_steps: int = 200
    coordinate: ScanCoordinate | None = None
    constraints: list[ConstraintSpec] = field(default_factory=list)
    initial_path: Path | None = None
    final_path: Path | None = None
    images: int | None = None
