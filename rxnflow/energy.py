"""Energy profile calculation for fixture graphs."""

from __future__ import annotations

from dataclasses import replace
from typing import TypeVar

from .constants import HARTREE_TO_KCAL_MOL, KCAL_MOL_TO_KJ_MOL
from .errors import RxnFlowError, RxnFlowWarning
from .models import (
    ChemicalObject,
    ID,
    EnergyOptions,
    EnergyPoint,
    EnergyProfile,
    EnergyValue,
    ReactionGraph,
    ReactionNode,
)
from .result import Result, err, ok


T = TypeVar("T")


class EnergyProfileEngine:
    """Compute curve-ready energy profiles from loaded graph and object state."""

    def compute_profile(
        self,
        project_id: ID,
        graph: ReactionGraph,
        path_id: ID,
        objects: tuple[ChemicalObject, ...],
        options: EnergyOptions,
    ) -> Result[EnergyProfile]:
        options_result = _validate_profile_inputs(project_id, graph, options)
        if not options_result.ok:
            return options_result

        path_result = _select_path(graph, path_id)
        if not path_result.ok or path_result.value is None:
            return path_result
        path = path_result.value

        node_by_id = {node.id: node for node in graph.nodes}
        object_by_id = {obj.id: obj for obj in objects}
        baseline_node_id = options.baseline_node_id or path.node_ids[0]
        if baseline_node_id not in path.node_ids:
            return _graph_invalid(
                f"Baseline node '{baseline_node_id}' is not in path '{path.id}'.",
                baseline_node_id,
            )

        baseline = _node_total_energy(baseline_node_id, node_by_id, object_by_id, options)
        if not baseline.ok or baseline.value is None:
            assert baseline.error is not None
            return err(baseline.error)

        points: list[EnergyPoint] = []
        warnings: list[RxnFlowWarning] = []
        for node_id in path.node_ids:
            node = node_by_id.get(node_id)
            if node is None:
                return _graph_invalid(
                    f"Path '{path.id}' references missing node '{node_id}'.",
                    node_id,
                )

            total = _node_total_energy(node_id, node_by_id, object_by_id, options)
            if not total.ok or total.value is None:
                assert total.error is not None
                if total.error.code == "missing_energy" and node_id != baseline_node_id:
                    warning = RxnFlowWarning(
                        code="missing_energy",
                        message=total.error.message,
                        target=node_id,
                    )
                    warnings.append(warning)
                    points.append(
                        EnergyPoint(
                            node_id=node.id,
                            label=node.label,
                            missing_reason="missing_energy",
                        )
                    )
                    continue
                return err(total.error)

            relative = round(total.value.value - baseline.value.value, 8)
            points.append(
                EnergyPoint(
                    node_id=node.id,
                    label=node.label,
                    absolute_energy=total.value,
                    relative_energy=EnergyValue(relative, options.output_unit),
                )
            )

        resolved_options = replace(options, baseline_node_id=baseline_node_id)
        profile = EnergyProfile(
            id=_engine_profile_id(path.id, options),
            graph_id=graph.id,
            path_id=path.id,
            options=resolved_options,
            points=tuple(points),
            warnings=tuple(warnings),
        )
        return ok(profile, warnings=tuple(warnings))


def compute_fixture_profile(
    graph: ReactionGraph,
    objects: tuple[ChemicalObject, ...],
    options: EnergyOptions,
) -> Result[EnergyProfile]:
    if options.output_unit != "kcal_mol":
        return err(
            RxnFlowError(
                code="invalid_input",
                message="The core fixture only supports kcal_mol output.",
                target="energy_options.output_unit",
            )
        )
    if options.include_corrections:
        return err(
            RxnFlowError(
                code="invalid_input",
                message="The core fixture does not support correction terms.",
                target="energy_options.include_corrections",
            )
        )
    if not graph.paths:
        return err(
            RxnFlowError(
                code="graph_invalid",
                message="Reaction graph must include a path.",
                target=graph.id,
            )
        )

    path = graph.paths[0]
    node_by_id = {node.id: node for node in graph.nodes}
    object_by_id = {obj.id: obj for obj in objects}
    baseline_node_id = options.baseline_node_id or path.node_ids[0]

    baseline = _node_energy_kcal(baseline_node_id, node_by_id, object_by_id, options)
    if not baseline.ok or baseline.value is None:
        return baseline

    points: list[EnergyPoint] = []
    for node_id in path.node_ids:
        energy = _node_energy_kcal(node_id, node_by_id, object_by_id, options)
        if not energy.ok or energy.value is None:
            return energy
        node = node_by_id[node_id]
        relative = round(energy.value - baseline.value, 8)
        points.append(
            EnergyPoint(
                node_id=node.id,
                label=node.label,
                absolute_energy=EnergyValue(round(energy.value, 8), "kcal_mol"),
                relative_energy=EnergyValue(relative, "kcal_mol"),
            )
        )

    return ok(
        EnergyProfile(
            id=_profile_id(path.id, options.energy_key),
            graph_id=graph.id,
            path_id=path.id,
            options=options,
            points=tuple(points),
        )
    )


def _node_energy_kcal(
    node_id: str,
    node_by_id: dict[str, ReactionNode],
    object_by_id: dict[str, ChemicalObject],
    options: EnergyOptions,
) -> Result[float]:
    node = node_by_id.get(node_id)
    if node is None:
        return err(
            RxnFlowError(
                code="graph_invalid",
                message=f"Path references missing node '{node_id}'.",
                target=node_id,
            )
        )

    if len(node.chemical_object_ids) != 1:
        return err(
            RxnFlowError(
                code="invalid_input",
                message="The core fixture supports exactly one chemical object per node.",
                target=node_id,
            )
        )
    object_id = node.chemical_object_ids[0]
    obj = object_by_id.get(object_id)
    if obj is None:
        return err(
            RxnFlowError(
                code="graph_invalid",
                message=f"Node '{node_id}' references missing chemical object '{object_id}'.",
                target=node_id,
            )
        )
    energy = obj.energies.get(options.energy_key)
    if energy is None:
        return err(
            RxnFlowError(
                code="missing_energy",
                message=f"Energy key '{options.energy_key}' is missing for {node_id}.",
                target=node_id,
            )
        )
    return _to_kcal_mol(energy, node_id)


def _validate_profile_inputs(
    project_id: ID,
    graph: ReactionGraph,
    options: EnergyOptions,
) -> Result[None]:
    if not project_id:
        return _invalid_input("Project id is required to compute an energy profile.", "project_id")
    if graph.project_id != project_id:
        return _graph_invalid(
            f"Reaction graph '{graph.id}' does not belong to project '{project_id}'.",
            graph.id,
        )
    if options.output_unit not in {"kcal_mol", "kj_mol"}:
        return _invalid_input(
            f"Energy output unit '{options.output_unit}' is not supported.",
            "energy_options.output_unit",
        )
    if not options.energy_key:
        return _invalid_input("Energy key is required.", "energy_options.energy_key")
    return ok(None)


def _select_path(graph: ReactionGraph, path_id: ID) -> Result[ReactionPath]:
    for path in graph.paths:
        if path.id != path_id:
            continue
        if not path.node_ids:
            return _graph_invalid(f"Path '{path.id}' must include at least one node.", path.id)
        return ok(path)
    return _graph_invalid(f"Reaction path '{path_id}' does not exist.", path_id)


def _node_total_energy(
    node_id: ID,
    node_by_id: dict[ID, ReactionNode],
    object_by_id: dict[ID, ChemicalObject],
    options: EnergyOptions,
) -> Result[EnergyValue]:
    node = node_by_id.get(node_id)
    if node is None:
        return _graph_invalid(f"Path references missing node '{node_id}'.", node_id)
    if not node.chemical_object_ids:
        return _missing_energy(
            f"Node '{node.id}' does not reference chemical objects for energy calculation.",
            node.id,
        )

    total = 0.0
    for object_id in node.chemical_object_ids:
        obj = object_by_id.get(object_id)
        if obj is None:
            return _graph_invalid(
                f"Node '{node.id}' references missing chemical object '{object_id}'.",
                node.id,
            )
        energy = obj.energies.get(options.energy_key)
        if energy is None:
            return _missing_energy(
                f"Energy key '{options.energy_key}' is missing for {node.id}.",
                node.id,
                {"object_id": object_id, "energy_key": options.energy_key},
            )
        converted = _to_output_unit(energy, options.output_unit, node.id)
        if not converted.ok or converted.value is None:
            assert converted.error is not None
            return err(converted.error)
        total += converted.value

        if options.include_corrections:
            for correction in obj.corrections:
                correction_energy = _to_output_unit(
                    correction.energy,
                    options.output_unit,
                    correction.id,
                )
                if not correction_energy.ok or correction_energy.value is None:
                    assert correction_energy.error is not None
                    return err(correction_energy.error)
                total += correction_energy.value

    return ok(EnergyValue(round(total, 8), options.output_unit))


def _to_output_unit(
    energy: EnergyValue,
    output_unit: str,
    target: str,
) -> Result[float]:
    kcal = _to_kcal_mol(energy, target)
    if not kcal.ok or kcal.value is None:
        return kcal
    if output_unit == "kcal_mol":
        return ok(kcal.value)
    if output_unit == "kj_mol":
        return ok(kcal.value * KCAL_MOL_TO_KJ_MOL)
    return _invalid_input(f"Energy output unit '{output_unit}' is not supported.", target)


def _to_kcal_mol(energy: EnergyValue, target: str) -> Result[float]:
    if energy.unit == "hartree":
        return ok(energy.value * HARTREE_TO_KCAL_MOL)
    if energy.unit == "kcal_mol":
        return ok(energy.value)
    if energy.unit == "kj_mol":
        return ok(energy.value / KCAL_MOL_TO_KJ_MOL)
    return err(
        RxnFlowError(
            code="invalid_input",
            message=f"Energy unit '{energy.unit}' is not supported.",
            target=target,
        )
    )


def _profile_id(path_id: str, energy_key: str) -> str:
    path_slug = path_id.removeprefix("path-")
    return f"profile-{path_slug}-{energy_key}"


def _engine_profile_id(path_id: str, options: EnergyOptions) -> str:
    path_slug = path_id.removeprefix("path-")
    correction_slug = "corrected" if options.include_corrections else "raw"
    return f"profile-{path_slug}-{options.energy_key}-{options.output_unit}-{correction_slug}"


def _invalid_input(message: str, target: str) -> Result[T]:
    return err(RxnFlowError(code="invalid_input", message=message, target=target))


def _graph_invalid(message: str, target: str) -> Result[T]:
    return err(RxnFlowError(code="graph_invalid", message=message, target=target))


def _missing_energy(
    message: str,
    target: str,
    details: dict[str, object] | None = None,
) -> Result[EnergyValue]:
    return err(
        RxnFlowError(
            code="missing_energy",
            message=message,
            target=target,
            details=details or {},
        )
    )
