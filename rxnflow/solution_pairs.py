"""Pair gas-phase and solution single-point objects into derived energy channels."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Iterable

from .constants import HARTREE_TO_KCAL_MOL, KCAL_MOL_TO_KJ_MOL
from .models import ChemicalObject, EnergyUnit, EnergyValue


STANDARD_STATE_1M_HARTREE = 0.003019


def with_paired_solution_free_energies(
    objects: Iterable[ChemicalObject],
) -> tuple[ChemicalObject, ...]:
    """Return objects with gas/solution log pairs folded into gas objects.

    The Ir workbook template uses one gas-phase frequency/optimization log and
    one solution single-point log per structure. The displayed solution free
    energy follows the workbook formula:

    Gsol = Ggas(1M) - Egas + Esol

    where all three terms are evaluated in kcal/mol.
    """

    object_list = tuple(objects)
    solution_by_key: dict[str, ChemicalObject] = {}
    for obj in object_list:
        key = solution_pair_key(obj)
        if key is not None and _is_solution_object(obj):
            solution_by_key.setdefault(key, obj)

    enriched: list[ChemicalObject] = []
    paired_solution_ids: set[str] = set()
    for obj in object_list:
        key = solution_pair_key(obj)
        if key is None or _is_solution_object(obj):
            continue
        solution = solution_by_key.get(key)
        if solution is None:
            enriched.append(obj)
            continue
        paired_solution_ids.add(solution.id)
        enriched.append(_with_solution_free_energy(obj, solution, key))

    for obj in object_list:
        if obj.id in paired_solution_ids:
            continue
        if any(existing.id == obj.id for existing in enriched):
            continue
        enriched.append(obj)

    return tuple(enriched)


def solution_pair_key(obj: ChemicalObject) -> str | None:
    """Return the normalized structure key used to pair gas and solvation logs."""

    name = obj.label or obj.id
    if not name:
        return None
    stem = Path(str(name)).stem.strip()
    lowered = stem.lower()
    for suffix in ("-sol", "_sol", ".sol", " sol"):
        if lowered.endswith(suffix):
            stem = stem[: -len(suffix)]
            break
    return stem.strip() or None


def structure_display_name(obj: ChemicalObject) -> str:
    """Return a compact structure name for table/export display."""

    return solution_pair_key(obj) or obj.label or obj.id


def _with_solution_free_energy(gas: ChemicalObject, solution: ChemicalObject, key: str) -> ChemicalObject:
    energies = dict(gas.energies)
    thermochemistry = dict(gas.thermochemistry)

    egas = energies.get("egas") or energies.get("electronic")
    ggas = thermochemistry.get("ggas_1m") or thermochemistry.get("ggas") or energies.get("ggas_1m") or energies.get("ggas")
    esol = solution.energies.get("esol") or solution.energies.get("electronic")
    if esol is not None:
        energies.setdefault(
            "esol",
            EnergyValue(
                esol.value,
                esol.unit,
                esol.reference or f"solution electronic energy from paired object {solution.id}",
            ),
        )
    if egas is not None:
        energies.setdefault(
            "egas",
            EnergyValue(
                egas.value,
                egas.unit,
                egas.reference or f"gas electronic energy from paired object {gas.id}",
            ),
        )
    if "ggas_1m" not in thermochemistry and "ggas" in thermochemistry:
        ggas_raw = thermochemistry["ggas"]
        thermochemistry["ggas_1m"] = EnergyValue(
            ggas_raw.value + _convert_energy_value(EnergyValue(STANDARD_STATE_1M_HARTREE, "hartree"), ggas_raw.unit),
            ggas_raw.unit,
            "gas free energy plus 1M standard-state correction",
        )
        ggas = thermochemistry["ggas_1m"]

    if egas is not None and ggas is not None and esol is not None:
        gsol_kcal = (
            _convert_energy_value(ggas, "kcal_mol")
            - _convert_energy_value(egas, "kcal_mol")
            + _convert_energy_value(esol, "kcal_mol")
        )
        thermochemistry["gsol"] = EnergyValue(
            gsol_kcal,
            "kcal_mol",
            f"Gsol = Ggas(1M) - Egas + Esol from paired solution log {solution.id}",
        )

    return replace(
        gas,
        label=structure_display_name(gas) or key,
        energies=energies,
        thermochemistry=thermochemistry,
    )


def _is_solution_object(obj: ChemicalObject) -> bool:
    name = obj.label or obj.id
    stem = Path(str(name)).stem.lower()
    return stem.endswith("-sol") or stem.endswith("_sol") or stem.endswith(".sol") or stem.endswith(" sol")


def _convert_energy_value(energy: EnergyValue, output_unit: EnergyUnit) -> float:
    if energy.unit == output_unit:
        return energy.value
    if energy.unit == "hartree" and output_unit == "kcal_mol":
        return energy.value * HARTREE_TO_KCAL_MOL
    if energy.unit == "kcal_mol" and output_unit == "hartree":
        return energy.value / HARTREE_TO_KCAL_MOL
    if energy.unit == "kcal_mol" and output_unit == "kj_mol":
        return energy.value * KCAL_MOL_TO_KJ_MOL
    if energy.unit == "kj_mol" and output_unit == "kcal_mol":
        return energy.value / KCAL_MOL_TO_KJ_MOL
    if energy.unit == "hartree" and output_unit == "kj_mol":
        return energy.value * HARTREE_TO_KCAL_MOL * KCAL_MOL_TO_KJ_MOL
    if energy.unit == "kj_mol" and output_unit == "hartree":
        return energy.value / KCAL_MOL_TO_KJ_MOL / HARTREE_TO_KCAL_MOL
    raise ValueError(f"Unsupported energy unit conversion: {energy.unit} -> {output_unit}")
