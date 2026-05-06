"""Chemical object persistence codec for project content sections."""

from __future__ import annotations

from typing import Any

from .errors import RxnFlowError
from .models import Atom3D, ChemicalObject, Correction, EnergyValue, Provenance
from .result import Result, err, ok


CHEMICAL_OBJECTS_SCHEMA_VERSION = "chemical-objects-v1"
SUPPORTED_ENERGY_UNITS = frozenset({"hartree", "kcal_mol", "kj_mol"})
SUPPORTED_CORRECTION_KINDS = frozenset({"resonance", "solvation", "manual"})


def chemical_objects_section_to_dict(
    project_id: str,
    objects: tuple[ChemicalObject, ...],
) -> Result[dict[str, Any]]:
    if not project_id:
        return err(RxnFlowError("invalid_input", "Chemical object section requires project_id.", target="project_id"))

    encoded_objects: list[dict[str, Any]] = []
    seen = _SeenObjects()
    for index, obj in enumerate(objects):
        identity_error = seen.check(obj, f"objects[{index}]")
        if identity_error is not None:
            return err(identity_error)
        encoded = _chemical_object_to_dict(obj, f"objects[{index}]")
        if not encoded.ok or encoded.value is None:
            assert encoded.error is not None
            return err(encoded.error)
        encoded_objects.append(encoded.value)

    return ok(
        {
            "schema_version": CHEMICAL_OBJECTS_SCHEMA_VERSION,
            "project_id": project_id,
            "objects": encoded_objects,
        }
    )


def chemical_objects_section_from_dict(
    project_id: str,
    data: dict[str, Any] | None,
) -> Result[tuple[ChemicalObject, ...]]:
    if data is None:
        return ok(())
    if not isinstance(data, dict):
        return err(RxnFlowError("invalid_input", "Chemical object section must be an object.", target="chemical_objects"))
    if data.get("schema_version") != CHEMICAL_OBJECTS_SCHEMA_VERSION:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Unsupported section schema_version '{data.get('schema_version')}'.",
                target="chemical_objects",
            )
        )
    if data.get("project_id") != project_id:
        return err(
            RxnFlowError(
                "invalid_input",
                "Chemical object section project_id does not match index.",
                target="chemical_objects",
            )
        )

    raw_objects = data.get("objects", [])
    if not isinstance(raw_objects, list):
        return err(RxnFlowError("invalid_input", "Chemical object section objects must be a list.", target="objects"))

    objects: list[ChemicalObject] = []
    seen = _SeenObjects()
    for index, value in enumerate(raw_objects):
        if not isinstance(value, dict):
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Stored chemical object must be an object.",
                    target=f"objects[{index}]",
                )
            )
        decoded = _chemical_object_from_dict(value, f"objects[{index}]")
        if not decoded.ok or decoded.value is None:
            assert decoded.error is not None
            return err(decoded.error)
        identity_error = seen.check(decoded.value, f"objects[{index}]")
        if identity_error is not None:
            return err(identity_error)
        objects.append(decoded.value)

    return ok(tuple(objects))


class _SeenObjects:
    def __init__(self) -> None:
        self.object_ids: set[str] = set()
        self.fingerprint_to_object_id: dict[str, str] = {}

    def check(self, obj: ChemicalObject, target: str) -> RxnFlowError | None:
        if not obj.id:
            return RxnFlowError("invalid_input", "Chemical object id is required.", target=f"{target}.id")
        if not obj.source_file_id:
            return RxnFlowError(
                "invalid_input",
                "Chemical object source_file_id is required.",
                target=f"{target}.source_file_id",
            )
        if obj.id in self.object_ids:
            return RxnFlowError("invalid_input", "Chemical object id is duplicated.", target=obj.id)
        self.object_ids.add(obj.id)

        if not obj.registry_fingerprint:
            return None
        existing_id = self.fingerprint_to_object_id.get(obj.registry_fingerprint)
        if existing_id is not None and existing_id != obj.id:
            return RxnFlowError(
                "invalid_input",
                "Registry fingerprint is duplicated for different chemical objects.",
                target="registry_fingerprint",
                details={
                    "registry_fingerprint": obj.registry_fingerprint,
                    "existing_object_id": existing_id,
                    "object_id": obj.id,
                },
            )
        self.fingerprint_to_object_id[obj.registry_fingerprint] = obj.id
        return None


def _chemical_object_to_dict(obj: ChemicalObject, target: str) -> Result[dict[str, Any]]:
    geometry_result = _atoms_to_list(obj.geometry, f"{target}.geometry")
    if not geometry_result.ok or geometry_result.value is None:
        assert geometry_result.error is not None
        return err(geometry_result.error)

    energies_result = _energy_mapping_to_dict(obj.energies, f"{target}.energies")
    if not energies_result.ok or energies_result.value is None:
        assert energies_result.error is not None
        return err(energies_result.error)

    thermochemistry_result = _energy_mapping_to_dict(obj.thermochemistry, f"{target}.thermochemistry")
    if not thermochemistry_result.ok or thermochemistry_result.value is None:
        assert thermochemistry_result.error is not None
        return err(thermochemistry_result.error)

    corrections_result = _corrections_to_list(obj.corrections, f"{target}.corrections")
    if not corrections_result.ok or corrections_result.value is None:
        assert corrections_result.error is not None
        return err(corrections_result.error)

    return ok(
        {
            "id": obj.id,
            "label": obj.label,
            "formula": obj.formula,
            "charge": obj.charge,
            "spin_multiplicity": obj.spin_multiplicity,
            "method": obj.method,
            "geometry": geometry_result.value,
            "energies": energies_result.value,
            "thermochemistry": thermochemistry_result.value,
            "source_file_id": obj.source_file_id,
            "corrections": corrections_result.value,
            "provenance": _provenance_to_dict(obj.provenance) if obj.provenance else None,
            "registry_fingerprint": obj.registry_fingerprint,
        }
    )


def _chemical_object_from_dict(data: dict[str, Any], target: str) -> Result[ChemicalObject]:
    geometry_result = _atoms_from_list(data.get("geometry", []), f"{target}.geometry")
    if not geometry_result.ok or geometry_result.value is None:
        assert geometry_result.error is not None
        return err(geometry_result.error)

    energies_result = _energy_mapping_from_dict(data.get("energies", {}), f"{target}.energies")
    if not energies_result.ok or energies_result.value is None:
        assert energies_result.error is not None
        return err(energies_result.error)

    thermochemistry_result = _energy_mapping_from_dict(
        data.get("thermochemistry", {}),
        f"{target}.thermochemistry",
    )
    if not thermochemistry_result.ok or thermochemistry_result.value is None:
        assert thermochemistry_result.error is not None
        return err(thermochemistry_result.error)

    corrections_result = _corrections_from_list(data.get("corrections", []), f"{target}.corrections")
    if not corrections_result.ok or corrections_result.value is None:
        assert corrections_result.error is not None
        return err(corrections_result.error)

    provenance_result = _provenance_from_value(data.get("provenance"), f"{target}.provenance")
    if not provenance_result.ok:
        assert provenance_result.error is not None
        return err(provenance_result.error)

    return ok(
        ChemicalObject(
            id=str(data.get("id", "")),
            label=data.get("label"),
            formula=data.get("formula"),
            charge=data.get("charge"),
            spin_multiplicity=data.get("spin_multiplicity"),
            method=data.get("method"),
            geometry=geometry_result.value,
            energies=energies_result.value,
            thermochemistry=thermochemistry_result.value,
            source_file_id=str(data.get("source_file_id", "")),
            corrections=corrections_result.value,
            provenance=provenance_result.value,
            registry_fingerprint=data.get("registry_fingerprint"),
        )
    )


def _atoms_to_list(atoms: tuple[Atom3D, ...], target: str) -> Result[list[dict[str, Any]]]:
    encoded: list[dict[str, Any]] = []
    for index, atom in enumerate(atoms):
        if atom.unit != "angstrom":
            return err(RxnFlowError("invalid_input", "Atom unit is unsupported.", target=f"{target}[{index}].unit"))
        encoded.append({"element": atom.element, "x": atom.x, "y": atom.y, "z": atom.z, "unit": atom.unit})
    return ok(encoded)


def _atoms_from_list(value: Any, target: str) -> Result[tuple[Atom3D, ...]]:
    if not isinstance(value, list):
        return err(RxnFlowError("invalid_input", "Chemical object geometry must be a list.", target=target))
    atoms: list[Atom3D] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            return err(RxnFlowError("invalid_input", "Atom entry must be an object.", target=f"{target}[{index}]"))
        unit = item.get("unit", "angstrom")
        if unit != "angstrom":
            return err(RxnFlowError("invalid_input", "Atom unit is unsupported.", target=f"{target}[{index}].unit"))
        try:
            atoms.append(
                Atom3D(
                    element=str(item["element"]),
                    x=float(item["x"]),
                    y=float(item["y"]),
                    z=float(item["z"]),
                    unit="angstrom",
                )
            )
        except (KeyError, TypeError, ValueError) as exc:
            return err(
                RxnFlowError(
                    "invalid_input",
                    f"Atom entry is invalid: {exc}.",
                    target=f"{target}[{index}]",
                )
            )
    return ok(tuple(atoms))


def _energy_mapping_to_dict(values: dict[str, EnergyValue], target: str) -> Result[dict[str, Any]]:
    if not isinstance(values, dict):
        return err(RxnFlowError("invalid_input", "Energy mapping must be an object.", target=target))
    encoded: dict[str, Any] = {}
    for key, value in values.items():
        encoded_value = _energy_value_to_dict(value, f"{target}.{key}")
        if not encoded_value.ok or encoded_value.value is None:
            assert encoded_value.error is not None
            return err(encoded_value.error)
        encoded[str(key)] = encoded_value.value
    return ok(encoded)


def _energy_mapping_from_dict(value: Any, target: str) -> Result[dict[str, EnergyValue]]:
    if not isinstance(value, dict):
        return err(RxnFlowError("invalid_input", "Energy mapping must be an object.", target=target))
    decoded: dict[str, EnergyValue] = {}
    for key, item in value.items():
        decoded_value = _energy_value_from_dict(item, f"{target}.{key}")
        if not decoded_value.ok or decoded_value.value is None:
            assert decoded_value.error is not None
            return err(decoded_value.error)
        decoded[str(key)] = decoded_value.value
    return ok(decoded)


def _energy_value_to_dict(value: EnergyValue, target: str) -> Result[dict[str, Any]]:
    if not isinstance(value, EnergyValue):
        return err(RxnFlowError("invalid_input", "Energy value must include value and unit.", target=target))
    if value.unit not in SUPPORTED_ENERGY_UNITS:
        return err(RxnFlowError("invalid_input", "Energy unit is unsupported.", target=f"{target}.unit"))
    return ok({"value": value.value, "unit": value.unit, "reference": value.reference})


def _energy_value_from_dict(data: Any, target: str) -> Result[EnergyValue]:
    if not isinstance(data, dict):
        return err(RxnFlowError("invalid_input", "Energy value must include value and unit.", target=target))
    if "value" not in data or "unit" not in data:
        return err(RxnFlowError("invalid_input", "Energy value must include value and unit.", target=target))
    if data["unit"] not in SUPPORTED_ENERGY_UNITS:
        return err(RxnFlowError("invalid_input", "Energy unit is unsupported.", target=f"{target}.unit"))
    try:
        numeric_value = float(data["value"])
    except (TypeError, ValueError) as exc:
        return err(RxnFlowError("invalid_input", f"Energy value is invalid: {exc}.", target=f"{target}.value"))
    return ok(EnergyValue(value=numeric_value, unit=data["unit"], reference=data.get("reference")))


def _corrections_to_list(corrections: tuple[Correction, ...], target: str) -> Result[list[dict[str, Any]]]:
    encoded: list[dict[str, Any]] = []
    seen: dict[str, dict[str, Any]] = {}
    for index, correction in enumerate(corrections):
        encoded_correction = _correction_to_dict(correction, f"{target}[{index}]")
        if not encoded_correction.ok or encoded_correction.value is None:
            assert encoded_correction.error is not None
            return err(encoded_correction.error)
        conflict = _correction_id_conflict(seen, encoded_correction.value, f"{target}[{index}].id")
        if conflict is not None:
            return err(conflict)
        encoded.append(encoded_correction.value)
    return ok(encoded)


def _corrections_from_list(value: Any, target: str) -> Result[tuple[Correction, ...]]:
    if not isinstance(value, list):
        return err(RxnFlowError("invalid_input", "Corrections must be a list.", target=target))
    corrections: list[Correction] = []
    seen: dict[str, dict[str, Any]] = {}
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            return err(RxnFlowError("invalid_input", "Correction entry must be an object.", target=f"{target}[{index}]"))
        conflict = _correction_id_conflict(seen, item, f"{target}[{index}].id")
        if conflict is not None:
            return err(conflict)
        correction = _correction_from_dict(item, f"{target}[{index}]")
        if not correction.ok or correction.value is None:
            assert correction.error is not None
            return err(correction.error)
        corrections.append(correction.value)
    return ok(tuple(corrections))


def _correction_id_conflict(
    seen: dict[str, dict[str, Any]],
    value: dict[str, Any],
    target: str,
) -> RxnFlowError | None:
    correction_id = str(value.get("id", ""))
    if not correction_id:
        return RxnFlowError("invalid_input", "Correction id is required.", target=target)
    existing = seen.get(correction_id)
    if existing is not None and existing != value:
        return RxnFlowError(
            "invalid_input",
            "Correction id is duplicated with different content.",
            target=target,
        )
    seen[correction_id] = value
    return None


def _correction_to_dict(correction: Correction, target: str) -> Result[dict[str, Any]]:
    if correction.kind not in SUPPORTED_CORRECTION_KINDS:
        return err(RxnFlowError("invalid_input", "Correction kind is unsupported.", target=f"{target}.kind"))
    energy = _energy_value_to_dict(correction.energy, f"{target}.energy")
    if not energy.ok or energy.value is None:
        assert energy.error is not None
        return err(energy.error)
    return ok(
        {
            "id": correction.id,
            "kind": correction.kind,
            "energy": energy.value,
            "created_at": correction.created_at,
            "note": correction.note,
        }
    )


def _correction_from_dict(data: dict[str, Any], target: str) -> Result[Correction]:
    if data.get("kind") not in SUPPORTED_CORRECTION_KINDS:
        return err(RxnFlowError("invalid_input", "Correction kind is unsupported.", target=f"{target}.kind"))
    energy = _energy_value_from_dict(data.get("energy"), f"{target}.energy")
    if not energy.ok or energy.value is None:
        assert energy.error is not None
        return err(energy.error)
    try:
        return ok(
            Correction(
                id=str(data["id"]),
                kind=data["kind"],
                energy=energy.value,
                created_at=str(data["created_at"]),
                note=data.get("note"),
            )
        )
    except KeyError as exc:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Correction is missing field '{exc.args[0]}'.",
                target=target,
            )
        )


def _provenance_to_dict(provenance: Provenance) -> dict[str, Any]:
    return {
        "source_file_id": provenance.source_file_id,
        "parser_id": provenance.parser_id,
        "parser_version": provenance.parser_version,
        "parsed_at": provenance.parsed_at,
    }


def _provenance_from_value(value: Any, target: str) -> Result[Provenance | None]:
    if value is None:
        return ok(None)
    if not isinstance(value, dict):
        return err(RxnFlowError("invalid_input", "Provenance must be an object.", target=target))
    try:
        return ok(
            Provenance(
                source_file_id=str(value["source_file_id"]),
                parser_id=str(value["parser_id"]),
                parser_version=str(value["parser_version"]),
                parsed_at=str(value["parsed_at"]),
            )
        )
    except KeyError as exc:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Provenance is missing field '{exc.args[0]}'.",
                target=target,
            )
        )
