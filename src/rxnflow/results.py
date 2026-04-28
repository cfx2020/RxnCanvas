"""Helpers for reading and writing task artifacts."""

from __future__ import annotations

import csv
from pathlib import Path

from ase import Atoms
from ase.io import write
from ase.units import kcal, mol

EV_TO_KCAL_PER_MOL = 1.0 / (kcal / mol)


def apply_charge_multiplicity(atoms: Atoms, charge: int, multiplicity: int) -> Atoms:
    atoms.info["charge"] = int(charge)
    atoms.info["multiplicity"] = int(multiplicity)
    return atoms


def write_atoms(path: Path, atoms: Atoms) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write(path, atoms, format="xyz")


def write_trajectory_xyz(path: Path, frames: list[Atoms]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write(path, frames, format="xyz")


def write_trajectory_extxyz(path: Path, frames: list[Atoms]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write(path, [_strip_output_only_info(frame) for frame in frames], format="extxyz")


def write_energy_table(path: Path, energies: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["step", "energy_eV", "relative_kcal_mol"])
        relative = relative_kcal_per_mol(energies)
        for index, energy in enumerate(energies):
            writer.writerow([index, f"{energy:.16f}", f"{relative[index]:.16f}"])


def write_scan_energy_table(path: Path, coordinates: list[float], energies: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["step", "coordinate_value", "energy_eV", "relative_kcal_mol"])
        relative = relative_kcal_per_mol(energies)
        for index, (coordinate_value, energy) in enumerate(zip(coordinates, energies, strict=True)):
            writer.writerow([index, f"{coordinate_value:.16f}", f"{energy:.16f}", f"{relative[index]:.16f}"])


def write_path_energy_table(path: Path, path_positions: list[float], energies: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["image_index", "path_position_A", "energy_eV", "relative_kcal_mol"])
        relative = relative_kcal_per_mol(energies)
        for index, (position, energy) in enumerate(zip(path_positions, energies, strict=True)):
            writer.writerow([index, f"{position:.16f}", f"{energy:.16f}", f"{relative[index]:.16f}"])


def write_energy_profile(
    path: Path,
    x_values: list[float],
    energies: list[float],
    *,
    xlabel: str,
    title: str,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.figure(figsize=(10, 6))
    plt.plot(x_values, relative_kcal_per_mol(energies), marker="o", linestyle="-")
    plt.xlabel(xlabel)
    plt.ylabel("Relative Energy (kcal/mol)")
    plt.title(title)
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(path, dpi=300)
    plt.close()


def relative_kcal_per_mol(energies: list[float]) -> list[float]:
    if not energies:
        return []
    reference = energies[0]
    return [(energy - reference) * EV_TO_KCAL_PER_MOL for energy in energies]


def _strip_output_only_info(atoms: Atoms) -> Atoms:
    clean_atoms = atoms.copy()
    clean_atoms.calc = atoms.calc
    clean_atoms.info.pop("spin", None)
    return clean_atoms
