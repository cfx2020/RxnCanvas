"""Helpers for reading and writing task artifacts."""

from __future__ import annotations

import csv
import json
from pathlib import Path
import shutil

from ase import Atoms
from ase.io import read, write

from .model import StructureNode, WorkflowConfig
from .paths import inputs_root, task_dir


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


def load_input_metadata(config: WorkflowConfig, node_id: str) -> dict:
    metadata_path = inputs_root(config) / node_id / "metadata.json"
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


def copy_structure(src: str | Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
