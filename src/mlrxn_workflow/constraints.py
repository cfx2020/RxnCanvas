"""ASE constraint builders for workflow tasks."""

from __future__ import annotations

from ase import Atoms
from ase.constraints import FixAtoms, FixBondLengths, FixInternals

from .model import ConstraintSpec, ScanCoordinate


def one_based_to_zero_based(indices: list[int]) -> list[int]:
    return [index - 1 for index in indices]


def build_constraints(
    coordinate: ScanCoordinate | None = None,
    auxiliary_constraints: list[ConstraintSpec] | None = None,
):
    auxiliary_constraints = auxiliary_constraints or []
    freeze_indices: list[int] = []
    fixed_bonds: list[list[int]] = []
    angles: list[list[object]] = []
    dihedrals: list[list[object]] = []

    if coordinate is not None:
        _append_internal_constraint(
            coordinate.type,
            one_based_to_zero_based(coordinate.atoms),
            coordinate.start,
            fixed_bonds,
            angles,
            dihedrals,
        )

    for constraint in auxiliary_constraints:
        if constraint.type == "freeze_atoms":
            freeze_indices.extend(one_based_to_zero_based(constraint.atoms))
            continue
        _append_internal_constraint(
            constraint.type,
            one_based_to_zero_based(constraint.atoms),
            constraint.value,
            fixed_bonds,
            angles,
            dihedrals,
        )

    constraints = []
    if freeze_indices:
        constraints.append(FixAtoms(indices=sorted(set(freeze_indices))))
    if fixed_bonds:
        bond_constraint = FixBondLengths(fixed_bonds)
        bond_constraint.maxiter = 5000
        constraints.append(bond_constraint)
    if angles or dihedrals:
        constraints.append(
            FixInternals(
                angles_deg=angles or None,
                dihedrals_deg=dihedrals or None,
            )
        )
    return constraints


def apply_internal_value(atoms: Atoms, kind: str, atom_indices: list[int], value: float) -> None:
    indices = one_based_to_zero_based(atom_indices)
    if kind == "distance":
        atoms.set_distance(indices[0], indices[1], float(value), fix=0.5)
        return
    if kind == "angle":
        atoms.set_angle(indices[0], indices[1], indices[2], float(value))
        return
    if kind == "dihedral":
        atoms.set_dihedral(indices[0], indices[1], indices[2], indices[3], float(value))
        return
    raise ValueError(f"Unsupported internal constraint kind '{kind}'.")


def _append_internal_constraint(kind, indices, value, fixed_bonds, angles, dihedrals) -> None:
    entry = [float(value), indices]
    if kind == "distance":
        fixed_bonds.append(indices)
        return
    if kind == "angle":
        angles.append(entry)
        return
    if kind == "dihedral":
        dihedrals.append(entry)
        return
    raise ValueError(f"Unsupported internal constraint kind '{kind}'.")
