"""Helpers for reading and writing task artifacts."""

from __future__ import annotations

import csv
import json
from pathlib import Path

from ase import Atoms
from ase.io import read, write

from .model import StructureNode, WorkflowConfig


def resolve_structure_path(config: WorkflowConfig, node: StructureNode) -> Path:
    path = Path(node.path)
    if not path.is_absolute():
        path = (config.source_path.parent / path).resolve()
    return path


def apply_charge_multiplicity(atoms: Atoms, charge: int, multiplicity: int) -> Atoms:
    atoms.info["charge"] = int(charge)
    atoms.info["multiplicity"] = int(multiplicity)
    atoms.info["spin"] = int(multiplicity)
    return atoms


def load_atoms_from_node(config: WorkflowConfig, node: StructureNode) -> Atoms:
    atoms = read(resolve_structure_path(config, node))
    return apply_charge_multiplicity(atoms, node.charge, node.multiplicity)


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


def write_scan_energy_table(path: Path, coordinates: list[float], energies: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["step", "coordinate_value", "energy"])
        for index, (coordinate_value, energy) in enumerate(zip(coordinates, energies, strict=True)):
            writer.writerow([index, f"{coordinate_value:.16f}", f"{energy:.16f}"])


def write_path_energy_table(path: Path, path_positions: list[float], energies: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["image_index", "path_position", "energy"])
        for index, (position, energy) in enumerate(zip(path_positions, energies, strict=True)):
            writer.writerow([index, f"{position:.16f}", f"{energy:.16f}"])


def write_metadata(path: Path, metadata: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2, sort_keys=True)
