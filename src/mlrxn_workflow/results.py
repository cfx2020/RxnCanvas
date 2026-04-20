"""Helpers for reading and writing task artifacts."""

from __future__ import annotations

import csv
import json
from pathlib import Path

from ase import Atoms
from ase.io import read, write

from .model import StructureNode, WorkflowConfig
from .paths import task_dir


def resolve_structure_path(config: WorkflowConfig, node: StructureNode) -> Path:
    path = Path(node.path)
    if not path.is_absolute():
        path = (config.source_path.parent / path).resolve()
    return path


def load_atoms_from_node(config: WorkflowConfig, node: StructureNode) -> Atoms:
    atoms = read(resolve_structure_path(config, node))
    atoms.info["charge"] = node.charge
    atoms.info["multiplicity"] = node.multiplicity
    return atoms


def load_atoms_from_task_result(config: WorkflowConfig, task_id: str) -> Atoms:
    metadata = load_task_metadata(config, task_id)
    result_path = Path(metadata["artifacts"]["result_structure"])
    atoms = read(result_path)
    atoms.info["charge"] = metadata["settings"]["charge"]
    atoms.info["multiplicity"] = metadata["settings"]["multiplicity"]
    return atoms


def load_task_metadata(config: WorkflowConfig, task_id: str) -> dict:
    metadata_path = task_dir(config, task_id) / "metadata.json"
    with metadata_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_atoms(path: Path, atoms: Atoms) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write(path, atoms)


def write_trajectory_xyz(path: Path, frames: list[Atoms]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write(path, frames)


def write_energy_table(path: Path, energies: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["step", "energy"])
        for index, energy in enumerate(energies):
            writer.writerow([index, f"{energy:.16f}"])


def write_metadata(path: Path, metadata: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2, sort_keys=True)
