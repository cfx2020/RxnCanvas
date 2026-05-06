"""Import ledger persistence codec for project content sections."""

from __future__ import annotations

from pathlib import PurePath
from typing import Any, Iterable, cast

from .errors import RxnFlowError, RxnFlowWarning
from .import_workflow import ImportBatch, ImportItem, ImportItemStatus, ParsePreview
from .models import Atom3D, ChemicalObjectDraft, EnergyValue, ID, ProjectResource, Provenance
from .parsers.contracts import ParseResult
from .result import Result, err, ok


IMPORT_LEDGER_SCHEMA_VERSION = "import-ledger-v1"
IMPORT_ITEM_STATUSES = frozenset({"raw_added", "parsed", "needs_confirmation", "registered", "failed"})
SUPPORTED_ENERGY_UNITS = frozenset({"hartree", "kcal_mol", "kj_mol"})


def import_ledger_section_to_dict(
    project_id: ID,
    batches: tuple[ImportBatch, ...],
    object_ids: Iterable[ID] | None = None,
) -> Result[dict[str, Any]]:
    if not project_id:
        return err(RxnFlowError("invalid_input", "Import ledger section requires project_id.", target="project_id"))

    object_id_set = set(object_ids) if object_ids is not None else None
    encoded_batches: list[dict[str, Any]] = []
    seen_batches: set[ID] = set()
    for batch_index, batch in enumerate(batches):
        target = f"batches[{batch_index}]"
        if not batch.id:
            return err(RxnFlowError("invalid_input", "Import batch id is required.", target=f"{target}.id"))
        if batch.id in seen_batches:
            return err(RxnFlowError("invalid_input", "Import batch id is duplicated.", target=batch.id))
        if batch.project_id != project_id:
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Import batch project_id does not match section.",
                    target=f"{target}.project_id",
                )
            )
        seen_batches.add(batch.id)

        encoded_items: list[dict[str, Any]] = []
        seen_items: set[ID] = set()
        for item_index, item in enumerate(batch.items):
            item_target = f"{target}.items[{item_index}]"
            if not item.id:
                return err(RxnFlowError("invalid_input", "Import item id is required.", target=f"{item_target}.id"))
            if item.id in seen_items:
                return err(RxnFlowError("invalid_input", "Import item id is duplicated.", target=item.id))
            seen_items.add(item.id)
            encoded_item = _item_to_dict(item, item_target, object_id_set)
            if not encoded_item.ok or encoded_item.value is None:
                assert encoded_item.error is not None
                return err(encoded_item.error)
            encoded_items.append(encoded_item.value)

        encoded_batches.append(
            {
                "id": batch.id,
                "project_id": batch.project_id,
                "items": encoded_items,
            }
        )

    return ok(
        {
            "schema_version": IMPORT_LEDGER_SCHEMA_VERSION,
            "project_id": project_id,
            "batches": encoded_batches,
        }
    )


def import_ledger_section_from_dict(
    project_id: ID,
    data: dict[str, Any] | None,
    object_ids: Iterable[ID] | None = None,
) -> Result[tuple[ImportBatch, ...]]:
    if data is None:
        return ok(())
    if not isinstance(data, dict):
        return err(RxnFlowError("invalid_input", "Import ledger section must be an object.", target="import_ledger"))
    if data.get("schema_version") != IMPORT_LEDGER_SCHEMA_VERSION:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Unsupported section schema_version '{data.get('schema_version')}'.",
                target="import_ledger",
            )
        )
    if data.get("project_id") != project_id:
        return err(
            RxnFlowError(
                "invalid_input",
                "Import ledger section project_id does not match index.",
                target="import_ledger",
            )
        )

    raw_batches = data.get("batches", [])
    if not isinstance(raw_batches, list):
        return err(RxnFlowError("invalid_input", "Import ledger batches must be a list.", target="batches"))

    object_id_set = set(object_ids) if object_ids is not None else None
    batches: list[ImportBatch] = []
    seen_batches: set[ID] = set()
    for batch_index, value in enumerate(raw_batches):
        target = f"batches[{batch_index}]"
        if not isinstance(value, dict):
            return err(RxnFlowError("invalid_input", "Stored import batch must be an object.", target=target))
        batch_id = str(value.get("id", ""))
        if not batch_id:
            return err(RxnFlowError("invalid_input", "Import batch id is required.", target=f"{target}.id"))
        if batch_id in seen_batches:
            return err(RxnFlowError("invalid_input", "Import batch id is duplicated.", target=batch_id))
        if value.get("project_id") != project_id:
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Import batch project_id does not match section.",
                    target=f"{target}.project_id",
                )
            )
        seen_batches.add(batch_id)

        raw_items = value.get("items", [])
        if not isinstance(raw_items, list):
            return err(RxnFlowError("invalid_input", "Import batch items must be a list.", target=f"{target}.items"))
        items: list[ImportItem] = []
        seen_items: set[ID] = set()
        for item_index, item_value in enumerate(raw_items):
            item_target = f"{target}.items[{item_index}]"
            if not isinstance(item_value, dict):
                return err(RxnFlowError("invalid_input", "Stored import item must be an object.", target=item_target))
            item = _item_from_dict(item_value, item_target, object_id_set)
            if not item.ok or item.value is None:
                assert item.error is not None
                return err(item.error)
            if item.value.id in seen_items:
                return err(RxnFlowError("invalid_input", "Import item id is duplicated.", target=item.value.id))
            seen_items.add(item.value.id)
            items.append(item.value)

        batches.append(ImportBatch(id=batch_id, project_id=project_id, items=tuple(items)))

    return ok(tuple(batches))


def _item_to_dict(
    item: ImportItem,
    target: str,
    object_ids: set[ID] | None,
) -> Result[dict[str, Any]]:
    if item.status not in IMPORT_ITEM_STATUSES:
        return err(RxnFlowError("invalid_input", "Import item status is unsupported.", target=f"{target}.status"))

    raw_resource_id = item.raw_resource.id if item.raw_resource is not None else None
    preview = _preview_to_dict(item.preview, f"{target}.preview")
    if not preview.ok:
        assert preview.error is not None
        return err(preview.error)
    preview_value = preview.value

    if preview_value is not None:
        preview_raw_resource_id = str(preview_value["raw_resource_id"])
        if raw_resource_id is not None and raw_resource_id != preview_raw_resource_id:
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Import item raw_resource_id does not match preview.",
                    target=f"{target}.raw_resource_id",
                )
            )
        raw_resource_id = raw_resource_id or preview_raw_resource_id

    status_error = _item_status_error(item.status, item.preview, item.registered_object_ids, item.error, target)
    if status_error is not None:
        return err(status_error)

    registered_ids = _registered_object_ids_to_list(item.registered_object_ids, f"{target}.registered_object_ids")
    if not registered_ids.ok or registered_ids.value is None:
        assert registered_ids.error is not None
        return err(registered_ids.error)
    ref_error = _registered_object_ref_error(registered_ids.value, object_ids, f"{target}.registered_object_ids")
    if ref_error is not None:
        return err(ref_error)

    warnings = _warnings_to_list(item.warnings, f"{target}.warnings")
    if not warnings.ok or warnings.value is None:
        assert warnings.error is not None
        return err(warnings.error)

    error = _error_to_dict(item.error, f"{target}.error")
    if not error.ok:
        assert error.error is not None
        return err(error.error)

    return ok(
        {
            "id": item.id,
            "source_path_display": _source_path_display(item.source_path),
            "status": item.status,
            "raw_resource_id": raw_resource_id,
            "preview": preview_value,
            "registered_object_ids": registered_ids.value,
            "warnings": warnings.value,
            "error": error.value,
        }
    )


def _item_from_dict(
    data: dict[str, Any],
    target: str,
    object_ids: set[ID] | None,
) -> Result[ImportItem]:
    item_id = str(data.get("id", ""))
    if not item_id:
        return err(RxnFlowError("invalid_input", "Import item id is required.", target=f"{target}.id"))

    status = data.get("status")
    if status not in IMPORT_ITEM_STATUSES:
        return err(RxnFlowError("invalid_input", "Import item status is unsupported.", target=f"{target}.status"))

    raw_resource_id = data.get("raw_resource_id")
    if raw_resource_id is not None:
        if not isinstance(raw_resource_id, str) or not raw_resource_id:
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Import item raw_resource_id must be a non-empty string when present.",
                    target=f"{target}.raw_resource_id",
                )
            )

    preview = _preview_from_value(data.get("preview"), f"{target}.preview")
    if not preview.ok:
        assert preview.error is not None
        return err(preview.error)
    preview_value = preview.value
    if preview_value is not None:
        if raw_resource_id is not None and raw_resource_id != preview_value.raw_resource_id:
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Import item raw_resource_id does not match preview.",
                    target=f"{target}.raw_resource_id",
                )
            )
        raw_resource_id = raw_resource_id or preview_value.raw_resource_id

    registered_ids = _registered_object_ids_from_value(
        data.get("registered_object_ids", []),
        f"{target}.registered_object_ids",
    )
    if not registered_ids.ok or registered_ids.value is None:
        assert registered_ids.error is not None
        return err(registered_ids.error)
    ref_error = _registered_object_ref_error(registered_ids.value, object_ids, f"{target}.registered_object_ids")
    if ref_error is not None:
        return err(ref_error)

    warnings = _warnings_from_value(data.get("warnings", []), f"{target}.warnings")
    if not warnings.ok or warnings.value is None:
        assert warnings.error is not None
        return err(warnings.error)

    item_error = _error_from_value(data.get("error"), f"{target}.error")
    if not item_error.ok:
        assert item_error.error is not None
        return err(item_error.error)

    status_error = _item_status_error(
        cast(ImportItemStatus, status),
        preview_value,
        tuple(registered_ids.value),
        item_error.value,
        target,
    )
    if status_error is not None:
        return err(status_error)

    raw_resource = ProjectResource(id=raw_resource_id, kind="raw_file") if raw_resource_id else None
    source_path = data.get("source_path_display", "")
    if source_path is None:
        source_path = ""
    if not isinstance(source_path, str):
        return err(
            RxnFlowError(
                "invalid_input",
                "Import item source_path_display must be a string.",
                target=f"{target}.source_path_display",
            )
        )

    return ok(
        ImportItem(
            id=item_id,
            source_path=source_path,
            status=cast(ImportItemStatus, status),
            raw_resource=raw_resource,
            preview=preview_value,
            registered_object_ids=tuple(registered_ids.value),
            error=item_error.value,
            warnings=warnings.value,
        )
    )


def _preview_to_dict(preview: ParsePreview | None, target: str) -> Result[dict[str, Any] | None]:
    if preview is None:
        return ok(None)
    if preview.object_count != len(preview.parse_result.objects):
        return err(
            RxnFlowError(
                "invalid_input",
                "Parse preview object_count does not match object_drafts.",
                target=f"{target}.object_count",
            )
        )
    provenance = preview.parse_result.provenance
    if preview.parser_id != provenance.parser_id or preview.parser_version != provenance.parser_version:
        return err(
            RxnFlowError(
                "invalid_input",
                "Parse preview parser metadata does not match provenance.",
                target=f"{target}.provenance",
            )
        )
    if preview.raw_resource_id != provenance.source_file_id:
        return err(
            RxnFlowError(
                "invalid_input",
                "Parse preview raw_resource_id does not match provenance source_file_id.",
                target=f"{target}.raw_resource_id",
            )
        )

    object_drafts = _drafts_to_list(preview.parse_result.objects, f"{target}.object_drafts")
    if not object_drafts.ok or object_drafts.value is None:
        assert object_drafts.error is not None
        return err(object_drafts.error)
    warnings = _warnings_to_list(preview.warnings, f"{target}.warnings")
    if not warnings.ok or warnings.value is None:
        assert warnings.error is not None
        return err(warnings.error)

    return ok(
        {
            "raw_resource_id": preview.raw_resource_id,
            "parser_id": preview.parser_id,
            "parser_version": preview.parser_version,
            "object_count": preview.object_count,
            "object_drafts": object_drafts.value,
            "provenance": _provenance_to_dict(provenance),
            "warnings": warnings.value,
        }
    )


def _preview_from_value(value: Any, target: str) -> Result[ParsePreview | None]:
    if value is None:
        return ok(None)
    if not isinstance(value, dict):
        return err(RxnFlowError("invalid_input", "Parse preview must be an object.", target=target))

    raw_resource_id = str(value.get("raw_resource_id", ""))
    parser_id = str(value.get("parser_id", ""))
    parser_version = str(value.get("parser_version", ""))
    if not raw_resource_id:
        return err(
            RxnFlowError(
                "invalid_input",
                "Parse preview raw_resource_id is required.",
                target=f"{target}.raw_resource_id",
            )
        )
    if not parser_id:
        return err(RxnFlowError("invalid_input", "Parse preview parser_id is required.", target=f"{target}.parser_id"))
    if not parser_version:
        return err(
            RxnFlowError(
                "invalid_input",
                "Parse preview parser_version is required.",
                target=f"{target}.parser_version",
            )
        )
    try:
        object_count = int(value["object_count"])
    except (KeyError, TypeError, ValueError) as exc:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Parse preview object_count is invalid: {exc}.",
                target=f"{target}.object_count",
            )
        )
    if object_count < 0:
        return err(
            RxnFlowError(
                "invalid_input",
                "Parse preview object_count must be non-negative.",
                target=f"{target}.object_count",
            )
        )

    object_drafts = _drafts_from_value(value.get("object_drafts"), f"{target}.object_drafts")
    if not object_drafts.ok or object_drafts.value is None:
        assert object_drafts.error is not None
        return err(object_drafts.error)
    if object_count != len(object_drafts.value):
        return err(
            RxnFlowError(
                "invalid_input",
                "Parse preview object_count does not match object_drafts.",
                target=f"{target}.object_count",
            )
        )

    provenance = _provenance_from_value(value.get("provenance"), f"{target}.provenance")
    if not provenance.ok or provenance.value is None:
        assert provenance.error is not None
        return err(provenance.error)
    if parser_id != provenance.value.parser_id or parser_version != provenance.value.parser_version:
        return err(
            RxnFlowError(
                "invalid_input",
                "Parse preview parser metadata does not match provenance.",
                target=f"{target}.provenance",
            )
        )
    if raw_resource_id != provenance.value.source_file_id:
        return err(
            RxnFlowError(
                "invalid_input",
                "Parse preview raw_resource_id does not match provenance source_file_id.",
                target=f"{target}.raw_resource_id",
            )
        )

    warnings = _warnings_from_value(value.get("warnings", []), f"{target}.warnings")
    if not warnings.ok or warnings.value is None:
        assert warnings.error is not None
        return err(warnings.error)

    return ok(
        ParsePreview(
            raw_resource_id=raw_resource_id,
            parser_id=parser_id,
            parser_version=parser_version,
            object_count=object_count,
            warnings=warnings.value,
            parse_result=ParseResult(objects=object_drafts.value, provenance=provenance.value),
        )
    )


def _drafts_to_list(drafts: tuple[ChemicalObjectDraft, ...], target: str) -> Result[list[dict[str, Any]]]:
    encoded: list[dict[str, Any]] = []
    for index, draft in enumerate(drafts):
        value = _draft_to_dict(draft, f"{target}[{index}]")
        if not value.ok or value.value is None:
            assert value.error is not None
            return err(value.error)
        encoded.append(value.value)
    return ok(encoded)


def _drafts_from_value(value: Any, target: str) -> Result[tuple[ChemicalObjectDraft, ...]]:
    if not isinstance(value, list):
        return err(RxnFlowError("invalid_input", "Parse preview object_drafts must be a list.", target=target))
    drafts: list[ChemicalObjectDraft] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Chemical object draft must be an object.",
                    target=f"{target}[{index}]",
                )
            )
        draft = _draft_from_dict(item, f"{target}[{index}]")
        if not draft.ok or draft.value is None:
            assert draft.error is not None
            return err(draft.error)
        drafts.append(draft.value)
    return ok(tuple(drafts))


def _draft_to_dict(draft: ChemicalObjectDraft, target: str) -> Result[dict[str, Any]]:
    geometry = _atoms_to_list(draft.geometry, f"{target}.geometry")
    if not geometry.ok or geometry.value is None:
        assert geometry.error is not None
        return err(geometry.error)
    energies = _energy_mapping_to_dict(draft.energies, f"{target}.energies")
    if not energies.ok or energies.value is None:
        assert energies.error is not None
        return err(energies.error)
    thermochemistry = _energy_mapping_to_dict(draft.thermochemistry, f"{target}.thermochemistry")
    if not thermochemistry.ok or thermochemistry.value is None:
        assert thermochemistry.error is not None
        return err(thermochemistry.error)
    return ok(
        {
            "label": draft.label,
            "formula": draft.formula,
            "charge": draft.charge,
            "spin_multiplicity": draft.spin_multiplicity,
            "method": draft.method,
            "geometry": geometry.value,
            "energies": energies.value,
            "thermochemistry": thermochemistry.value,
        }
    )


def _draft_from_dict(data: dict[str, Any], target: str) -> Result[ChemicalObjectDraft]:
    label = _optional_string(data.get("label"), f"{target}.label")
    if label.ok is False:
        assert label.error is not None
        return err(label.error)
    formula = _optional_string(data.get("formula"), f"{target}.formula")
    if formula.ok is False:
        assert formula.error is not None
        return err(formula.error)
    charge = _optional_int(data.get("charge"), f"{target}.charge")
    if charge.ok is False:
        assert charge.error is not None
        return err(charge.error)
    spin_multiplicity = _optional_int(data.get("spin_multiplicity"), f"{target}.spin_multiplicity")
    if spin_multiplicity.ok is False:
        assert spin_multiplicity.error is not None
        return err(spin_multiplicity.error)
    method = _optional_string(data.get("method"), f"{target}.method")
    if method.ok is False:
        assert method.error is not None
        return err(method.error)

    geometry = _atoms_from_value(data.get("geometry", []), f"{target}.geometry")
    if not geometry.ok or geometry.value is None:
        assert geometry.error is not None
        return err(geometry.error)
    energies = _energy_mapping_from_value(data.get("energies", {}), f"{target}.energies")
    if not energies.ok or energies.value is None:
        assert energies.error is not None
        return err(energies.error)
    thermochemistry = _energy_mapping_from_value(data.get("thermochemistry", {}), f"{target}.thermochemistry")
    if not thermochemistry.ok or thermochemistry.value is None:
        assert thermochemistry.error is not None
        return err(thermochemistry.error)

    return ok(
        ChemicalObjectDraft(
            label=label.value,
            formula=formula.value,
            charge=charge.value,
            spin_multiplicity=spin_multiplicity.value,
            method=method.value,
            geometry=geometry.value,
            energies=energies.value,
            thermochemistry=thermochemistry.value,
        )
    )


def _atoms_to_list(atoms: tuple[Atom3D, ...], target: str) -> Result[list[dict[str, Any]]]:
    encoded: list[dict[str, Any]] = []
    for index, atom in enumerate(atoms):
        if atom.unit != "angstrom":
            return err(RxnFlowError("invalid_input", "Atom unit is unsupported.", target=f"{target}[{index}].unit"))
        encoded.append({"element": atom.element, "x": atom.x, "y": atom.y, "z": atom.z, "unit": atom.unit})
    return ok(encoded)


def _atoms_from_value(value: Any, target: str) -> Result[tuple[Atom3D, ...]]:
    if not isinstance(value, list):
        return err(RxnFlowError("invalid_input", "Chemical object draft geometry must be a list.", target=target))
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
        energy = _energy_value_to_dict(value, f"{target}.{key}")
        if not energy.ok or energy.value is None:
            assert energy.error is not None
            return err(energy.error)
        encoded[str(key)] = energy.value
    return ok(encoded)


def _energy_mapping_from_value(value: Any, target: str) -> Result[dict[str, EnergyValue]]:
    if not isinstance(value, dict):
        return err(RxnFlowError("invalid_input", "Energy mapping must be an object.", target=target))
    decoded: dict[str, EnergyValue] = {}
    for key, item in value.items():
        energy = _energy_value_from_value(item, f"{target}.{key}")
        if not energy.ok or energy.value is None:
            assert energy.error is not None
            return err(energy.error)
        decoded[str(key)] = energy.value
    return ok(decoded)


def _energy_value_to_dict(value: EnergyValue, target: str) -> Result[dict[str, Any]]:
    if not isinstance(value, EnergyValue):
        return err(RxnFlowError("invalid_input", "Energy value must include value and unit.", target=target))
    if value.unit not in SUPPORTED_ENERGY_UNITS:
        return err(RxnFlowError("invalid_input", "Energy unit is unsupported.", target=f"{target}.unit"))
    return ok({"value": value.value, "unit": value.unit, "reference": value.reference})


def _energy_value_from_value(value: Any, target: str) -> Result[EnergyValue]:
    if not isinstance(value, dict):
        return err(RxnFlowError("invalid_input", "Energy value must include value and unit.", target=target))
    if "value" not in value or "unit" not in value:
        return err(RxnFlowError("invalid_input", "Energy value must include value and unit.", target=target))
    if value["unit"] not in SUPPORTED_ENERGY_UNITS:
        return err(RxnFlowError("invalid_input", "Energy unit is unsupported.", target=f"{target}.unit"))
    try:
        numeric_value = float(value["value"])
    except (TypeError, ValueError) as exc:
        return err(RxnFlowError("invalid_input", f"Energy value is invalid: {exc}.", target=f"{target}.value"))
    return ok(EnergyValue(numeric_value, value["unit"], reference=value.get("reference")))


def _provenance_to_dict(provenance: Provenance) -> dict[str, Any]:
    return {
        "source_file_id": provenance.source_file_id,
        "parser_id": provenance.parser_id,
        "parser_version": provenance.parser_version,
        "parsed_at": provenance.parsed_at,
    }


def _provenance_from_value(value: Any, target: str) -> Result[Provenance]:
    if not isinstance(value, dict):
        return err(RxnFlowError("invalid_input", "Provenance must be an object.", target=target))
    try:
        provenance = Provenance(
            source_file_id=str(value["source_file_id"]),
            parser_id=str(value["parser_id"]),
            parser_version=str(value["parser_version"]),
            parsed_at=str(value["parsed_at"]),
        )
    except KeyError as exc:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Provenance is missing field '{exc.args[0]}'.",
                target=target,
            )
        )
    if not provenance.source_file_id:
        return err(
            RxnFlowError(
                "invalid_input",
                "Provenance source_file_id is required.",
                target=f"{target}.source_file_id",
            )
        )
    if not provenance.parser_id:
        return err(RxnFlowError("invalid_input", "Provenance parser_id is required.", target=f"{target}.parser_id"))
    if not provenance.parser_version:
        return err(
            RxnFlowError(
                "invalid_input",
                "Provenance parser_version is required.",
                target=f"{target}.parser_version",
            )
        )
    return ok(provenance)


def _warnings_to_list(warnings: tuple[RxnFlowWarning, ...], target: str) -> Result[list[dict[str, Any]]]:
    encoded: list[dict[str, Any]] = []
    for index, warning in enumerate(warnings):
        if not isinstance(warning, RxnFlowWarning):
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Warning entry must be RxnFlowWarning.",
                    target=f"{target}[{index}]",
                )
            )
        encoded.append({"code": warning.code, "message": warning.message, "target": warning.target})
    return ok(encoded)


def _warnings_from_value(value: Any, target: str) -> Result[tuple[RxnFlowWarning, ...]]:
    if not isinstance(value, list):
        return err(RxnFlowError("invalid_input", "Warnings must be a list.", target=target))
    warnings: list[RxnFlowWarning] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            return err(RxnFlowError("invalid_input", "Warning entry must be an object.", target=f"{target}[{index}]"))
        if "code" not in item or "message" not in item:
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Warning entry requires code and message.",
                    target=f"{target}[{index}]",
                )
            )
        if item.get("target") is not None and not isinstance(item.get("target"), str):
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Warning target must be a string.",
                    target=f"{target}[{index}].target",
                )
            )
        warnings.append(RxnFlowWarning(code=str(item["code"]), message=str(item["message"]), target=item.get("target")))
    return ok(tuple(warnings))


def _error_to_dict(error: RxnFlowError | None, target: str) -> Result[dict[str, Any] | None]:
    if error is None:
        return ok(None)
    if not isinstance(error.details, dict):
        return err(RxnFlowError("invalid_input", "Error details must be an object.", target=f"{target}.details"))
    return ok({"code": error.code, "message": error.message, "target": error.target, "details": error.details})


def _error_from_value(value: Any, target: str) -> Result[RxnFlowError | None]:
    if value is None:
        return ok(None)
    if not isinstance(value, dict):
        return err(RxnFlowError("invalid_input", "Error entry must be an object.", target=target))
    if "code" not in value or "message" not in value:
        return err(RxnFlowError("invalid_input", "Error entry requires code and message.", target=target))
    details = value.get("details", {})
    if not isinstance(details, dict):
        return err(RxnFlowError("invalid_input", "Error details must be an object.", target=f"{target}.details"))
    if value.get("target") is not None and not isinstance(value.get("target"), str):
        return err(RxnFlowError("invalid_input", "Error target must be a string.", target=f"{target}.target"))
    return ok(
        RxnFlowError(
            code=str(value["code"]),
            message=str(value["message"]),
            target=value.get("target"),
            details=details,
        )
    )


def _registered_object_ids_to_list(ids: tuple[ID, ...], target: str) -> Result[list[ID]]:
    encoded: list[ID] = []
    for index, object_id in enumerate(ids):
        if not isinstance(object_id, str) or not object_id:
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Registered object id must be a non-empty string.",
                    target=f"{target}[{index}]",
                )
            )
        encoded.append(object_id)
    return ok(encoded)


def _registered_object_ids_from_value(value: Any, target: str) -> Result[list[ID]]:
    if not isinstance(value, list):
        return err(RxnFlowError("invalid_input", "Registered object ids must be a list.", target=target))
    ids: list[ID] = []
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item:
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Registered object id must be a non-empty string.",
                    target=f"{target}[{index}]",
                )
            )
        ids.append(item)
    return ok(ids)


def _registered_object_ref_error(
    registered_object_ids: list[ID],
    object_ids: set[ID] | None,
    target: str,
) -> RxnFlowError | None:
    if object_ids is None:
        return None
    for object_id in registered_object_ids:
        if object_id not in object_ids:
            return RxnFlowError(
                "invalid_input",
                "Registered object id is missing from loaded ChemicalObject ids.",
                target=target,
                details={"object_id": object_id},
            )
    return None


def _item_status_error(
    status: ImportItemStatus | str,
    preview: ParsePreview | None,
    registered_object_ids: tuple[ID, ...],
    error: RxnFlowError | None,
    target: str,
) -> RxnFlowError | None:
    if status == "needs_confirmation" and preview is None:
        return RxnFlowError(
            "invalid_input",
            "needs_confirmation import item requires a parse preview.",
            target=f"{target}.preview",
        )
    if status == "registered" and not registered_object_ids:
        return RxnFlowError(
            "invalid_input",
            "registered import item requires registered_object_ids.",
            target=f"{target}.registered_object_ids",
        )
    if status == "failed" and error is None:
        return RxnFlowError("invalid_input", "failed import item requires an error.", target=f"{target}.error")
    return None


def _optional_string(value: Any, target: str) -> Result[str | None]:
    if value is None:
        return ok(None)
    if not isinstance(value, str):
        return err(RxnFlowError("invalid_input", "Value must be a string.", target=target))
    return ok(value)


def _optional_int(value: Any, target: str) -> Result[int | None]:
    if value is None:
        return ok(None)
    if isinstance(value, bool) or not isinstance(value, int):
        return err(RxnFlowError("invalid_input", "Value must be an integer.", target=target))
    return ok(value)


def _source_path_display(source_path: str) -> str:
    normalized = source_path.replace("\\", "/")
    name = PurePath(normalized).name
    return name or normalized
