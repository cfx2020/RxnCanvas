"""Energy channel catalog and source resolution helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TypeVar

from .errors import RxnFlowError
from .models import ChemicalObject, EnergyChannel, EnergyChannelSelectionSource, EnergyChannelSource, EnergyValue
from .result import Result, err, ok


T = TypeVar("T")


@dataclass(frozen=True)
class ResolvedEnergyChannel:
    value: EnergyValue
    source: EnergyChannelSource


def energy_channel_catalog(objects: tuple[ChemicalObject, ...]) -> tuple[EnergyChannel, ...]:
    """Project ChemicalObject energy fields into stable selectable channels."""
    channels: list[EnergyChannel] = []
    for source, values_by_object in (
        ("energies", tuple((obj, obj.energies) for obj in objects)),
        ("thermochemistry", tuple((obj, obj.thermochemistry) for obj in objects)),
    ):
        grouped: dict[str, list[ChemicalObject]] = {}
        energy_by_key: dict[str, EnergyValue] = {}
        for obj, values in values_by_object:
            for key in sorted(values):
                grouped.setdefault(key, []).append(obj)
                energy_by_key.setdefault(key, values[key])
        for key in sorted(grouped):
            energy = energy_by_key[key]
            channels.append(
                EnergyChannel(
                    key=key,
                    source=source,  # type: ignore[arg-type]
                    label=f"{key} ({source})",
                    unit=energy.unit,
                    reference=energy.reference,
                    object_ids=tuple(obj.id for obj in grouped[key]),
                )
            )
    return tuple(channels)


def resolve_energy_channel(
    obj: ChemicalObject,
    energy_key: str,
    energy_source: EnergyChannelSelectionSource,
) -> Result[EnergyValue]:
    """Resolve an object's selected energy value with compatibility auto rules."""
    resolved = resolve_energy_channel_with_source(obj, energy_key, energy_source)
    if not resolved.ok or resolved.value is None:
        assert resolved.error is not None
        return err(resolved.error)
    return ok(resolved.value.value)


def resolve_energy_channel_with_source(
    obj: ChemicalObject,
    energy_key: str,
    energy_source: EnergyChannelSelectionSource,
) -> Result[ResolvedEnergyChannel]:
    """Resolve selected energy and expose the concrete source used."""
    source_validation = validate_energy_source(energy_source, "energy_options.energy_source")
    if source_validation is not None:
        return err(source_validation)

    has_energy = energy_key in obj.energies
    has_thermochemistry = energy_key in obj.thermochemistry
    if energy_source == "auto":
        if has_energy and has_thermochemistry:
            return err(
                RxnFlowError(
                    code="ambiguous_energy_channel",
                    message=(
                        f"Energy key '{energy_key}' exists in both energies and "
                        f"thermochemistry for object '{obj.id}'."
                    ),
                    target="energy_options.energy_key",
                    details={
                        "object_id": obj.id,
                        "energy_key": energy_key,
                        "energy_source": "auto",
                        "sources": ("energies", "thermochemistry"),
                    },
                )
            )
        if has_energy:
            return ok(ResolvedEnergyChannel(obj.energies[energy_key], "energies"))
        if has_thermochemistry:
            return ok(ResolvedEnergyChannel(obj.thermochemistry[energy_key], "thermochemistry"))
        return _missing_energy(obj.id, energy_key, energy_source)

    values = obj.energies if energy_source == "energies" else obj.thermochemistry
    energy = values.get(energy_key)
    if energy is None:
        return _missing_energy(obj.id, energy_key, energy_source)
    return ok(ResolvedEnergyChannel(energy, energy_source))


def validate_energy_source(
    value: object,
    target: str,
) -> RxnFlowError | None:
    if value not in {"energies", "thermochemistry", "auto"}:
        return RxnFlowError(
            code="invalid_input",
            message="Energy source must be energies, thermochemistry, or auto.",
            target=target,
        )
    return None


def _missing_energy(
    object_id: str,
    energy_key: str,
    energy_source: EnergyChannelSelectionSource,
) -> Result[T]:
    return err(
        RxnFlowError(
            code="missing_energy",
            message=(
                f"Energy key '{energy_key}' with source '{energy_source}' "
                f"is missing for object '{object_id}'."
            ),
            target=object_id,
            details={
                "object_id": object_id,
                "energy_key": energy_key,
                "energy_source": energy_source,
            },
        )
    )
