"""Energy profile calculation for fixture graphs."""

from __future__ import annotations

from dataclasses import replace
from typing import TypeVar

from .constants import HARTREE_TO_KCAL_MOL, KCAL_MOL_TO_KJ_MOL
from .energy_channels import resolve_energy_channel, resolve_energy_channel_with_source, validate_energy_source
from .errors import RxnFlowError, RxnFlowWarning
from .models import (
    ChemicalObject,
    Correction,
    CorrectionComponent,
    ID,
    EnergyComponent,
    EnergyExpression,
    EnergyExpressionMissing,
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

        baseline = _node_energy_expression(baseline_node_id, node_by_id, object_by_id, options)
        if not baseline.ok or baseline.value is None:
            assert baseline.error is not None
            return err(baseline.error)
        if baseline.value.total is None:
            missing = baseline.value.missing[0] if baseline.value.missing else None
            return _missing_energy(
                missing.message if missing is not None else "Baseline node is missing energy.",
                baseline_node_id,
                _missing_details(missing),
            )

        points: list[EnergyPoint] = []
        warnings: list[RxnFlowWarning] = []
        for node_id in path.node_ids:
            node = node_by_id.get(node_id)
            if node is None:
                return _graph_invalid(
                    f"Path '{path.id}' references missing node '{node_id}'.",
                    node_id,
                )

            expression = _node_energy_expression(node_id, node_by_id, object_by_id, options)
            if not expression.ok or expression.value is None:
                assert expression.error is not None
                if expression.error.code == "missing_energy" and node_id != baseline_node_id:
                    warning = RxnFlowWarning(
                        code="missing_energy",
                        message=expression.error.message,
                        target=node_id,
                    )
                    warnings.append(warning)
                    points.append(
                        EnergyPoint(
                            node_id=node.id,
                            label=node.label,
                            missing_reason="missing_energy",
                            expression=_missing_expression_from_error(node.id, expression.error),
                        )
                    )
                    continue
                return err(expression.error)

            if expression.value.total is None:
                missing = expression.value.missing[0] if expression.value.missing else None
                if node_id != baseline_node_id:
                    warning = RxnFlowWarning(
                        code=missing.code if missing is not None else "missing_energy",
                        message=missing.message if missing is not None else "Energy is missing.",
                        target=node_id,
                    )
                    warnings.append(warning)
                    points.append(
                        EnergyPoint(
                            node_id=node.id,
                            label=node.label,
                            missing_reason="missing_energy",
                            expression=expression.value,
                        )
                    )
                    continue
                return _missing_energy(
                    missing.message if missing is not None else "Baseline node is missing energy.",
                    node_id,
                    _missing_details(missing),
                )

            relative = round(expression.value.total.value - baseline.value.total.value, 8)
            points.append(
                EnergyPoint(
                    node_id=node.id,
                    label=node.label,
                    absolute_energy=expression.value.total,
                    relative_energy=EnergyValue(relative, options.output_unit),
                    expression=expression.value,
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
        expression = _node_energy_expression(node_id, node_by_id, object_by_id, options)
        if not expression.ok or expression.value is None:
            assert expression.error is not None
            return err(expression.error)
        node = node_by_id[node_id]
        relative = round(energy.value - baseline.value, 8)
        points.append(
            EnergyPoint(
                node_id=node.id,
                label=node.label,
                absolute_energy=EnergyValue(round(energy.value, 8), "kcal_mol"),
                relative_energy=EnergyValue(relative, "kcal_mol"),
                expression=expression.value,
            )
        )

    return ok(
        EnergyProfile(
            id=_profile_id(path.id, options),
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
    energy_result = resolve_energy_channel(obj, options.energy_key, options.energy_source)
    if not energy_result.ok or energy_result.value is None:
        assert energy_result.error is not None
        return err(_node_scoped_energy_error(energy_result.error, node_id))
    energy = energy_result.value
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
    source_error = validate_energy_source(options.energy_source, "energy_options.energy_source")
    if source_error is not None:
        return err(source_error)
    return ok(None)


def _select_path(graph: ReactionGraph, path_id: ID) -> Result[ReactionPath]:
    for path in graph.paths:
        if path.id != path_id:
            continue
        if not path.node_ids:
            return _graph_invalid(f"Path '{path.id}' must include at least one node.", path.id)
        return ok(path)
    return _graph_invalid(f"Reaction path '{path_id}' does not exist.", path_id)


def _node_energy_expression(
    node_id: ID,
    node_by_id: dict[ID, ReactionNode],
    object_by_id: dict[ID, ChemicalObject],
    options: EnergyOptions,
) -> Result[EnergyExpression]:
    node = node_by_id.get(node_id)
    if node is None:
        return _graph_invalid(f"Path references missing node '{node_id}'.", node_id)
    if not node.composition:
        return ok(
            _missing_expression(
                node.id,
                "missing_energy",
                f"Node '{node.id}' does not reference chemical objects for energy calculation.",
            )
        )

    total = 0.0
    terms: list[EnergyComponent] = []
    correction_components: list[CorrectionComponent] = []
    for term in node.composition:
        obj = object_by_id.get(term.object_id)
        if obj is None:
            return _graph_invalid(
                f"Node '{node.id}' references missing chemical object '{term.object_id}'.",
                node.id,
            )
        energy_result = resolve_energy_channel_with_source(obj, options.energy_key, options.energy_source)
        if not energy_result.ok or energy_result.value is None:
            assert energy_result.error is not None
            scoped = _node_scoped_energy_error(energy_result.error, node.id)
            if scoped.code == "missing_energy":
                return ok(_missing_expression_from_error(node.id, scoped))
            return err(scoped)
        energy = energy_result.value.value
        converted = _to_output_unit(energy, options.output_unit, node.id)
        if not converted.ok or converted.value is None:
            assert converted.error is not None
            return err(converted.error)
        contribution = converted.value * term.coefficient
        total += contribution
        terms.append(
            EnergyComponent(
                object_id=obj.id,
                object_label=obj.label,
                coefficient=term.coefficient,
                energy_key=options.energy_key,
                energy_source=energy_result.value.source,
                raw_energy=energy,
                converted_energy=EnergyValue(round(converted.value, 8), options.output_unit, energy.reference),
                contribution=EnergyValue(round(contribution, 8), options.output_unit, energy.reference),
            )
        )

        corrections = _included_corrections(obj.corrections, options)
        if not corrections.ok or corrections.value is None:
            assert corrections.error is not None
            return err(corrections.error)
        for correction in corrections.value:
            correction_energy = _to_output_unit(
                correction.energy,
                options.output_unit,
                correction.id,
            )
            if not correction_energy.ok or correction_energy.value is None:
                assert correction_energy.error is not None
                return err(correction_energy.error)
            correction_contribution = correction_energy.value * term.coefficient
            total += correction_contribution
            correction_components.append(
                CorrectionComponent(
                    object_id=obj.id,
                    correction_id=correction.id,
                    kind=correction.kind,
                    coefficient=term.coefficient,
                    raw_energy=correction.energy,
                    converted_energy=EnergyValue(
                        round(correction_energy.value, 8),
                        options.output_unit,
                        correction.energy.reference,
                    ),
                    contribution=EnergyValue(
                        round(correction_contribution, 8),
                        options.output_unit,
                        correction.energy.reference,
                    ),
                )
            )

    return ok(
        EnergyExpression(
            node_id=node.id,
            terms=tuple(terms),
            corrections=tuple(correction_components),
            total=EnergyValue(round(total, 8), options.output_unit),
        )
    )


def _missing_expression(
    node_id: ID,
    code: str,
    message: str,
    object_id: ID | None = None,
    energy_key: str | None = None,
    energy_source: str | None = None,
) -> EnergyExpression:
    return EnergyExpression(
        node_id=node_id,
        total=None,
        missing=(
            EnergyExpressionMissing(
                code=code,
                message=message,
                object_id=object_id,
                energy_key=energy_key,
                energy_source=energy_source,
            ),
        ),
    )


def _missing_expression_from_error(node_id: ID, error: RxnFlowError) -> EnergyExpression:
    return _missing_expression(
        node_id,
        error.code,
        error.message,
        object_id=_optional_str(error.details.get("object_id")),
        energy_key=_optional_str(error.details.get("energy_key")),
        energy_source=_optional_str(error.details.get("energy_source")),
    )


def _missing_details(missing: EnergyExpressionMissing | None) -> dict[str, object]:
    if missing is None:
        return {}
    details: dict[str, object] = {}
    if missing.object_id is not None:
        details["object_id"] = missing.object_id
    if missing.energy_key is not None:
        details["energy_key"] = missing.energy_key
    if missing.energy_source is not None:
        details["energy_source"] = missing.energy_source
    return details


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    return str(value)


def _included_corrections(
    corrections: tuple[Correction, ...],
    options: EnergyOptions,
) -> Result[tuple[Correction, ...]]:
    policy = options.correction_policy
    if not options.include_corrections:
        if policy is None or policy.mode == "none":
            return ok(())
        return _invalid_input(
            "Correction policy requires include_corrections=True.",
            "energy_options.correction_policy",
        )
    if policy is None:
        return ok(corrections)
    if policy.mode == "none":
        return ok(())
    if policy.mode == "all":
        return ok(corrections)
    if policy.mode == "kinds":
        allowed = set(policy.kinds)
        if not allowed:
            return _invalid_input(
                "Correction policy mode kinds requires at least one kind.",
                "energy_options.correction_policy",
            )
        return ok(tuple(correction for correction in corrections if correction.kind in allowed))
    if policy.mode == "ids":
        allowed = set(policy.ids)
        if not allowed:
            return _invalid_input(
                "Correction policy mode ids requires at least one id.",
                "energy_options.correction_policy",
            )
        return ok(tuple(correction for correction in corrections if correction.id in allowed))
    return _invalid_input(
        "Correction policy mode is not supported.",
        "energy_options.correction_policy",
    )


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


def _profile_id(path_id: str, options: EnergyOptions) -> str:
    path_slug = path_id.removeprefix("path-")
    source_slug = "" if options.energy_source == "auto" else f"-{options.energy_source}"
    return f"profile-{path_slug}-{options.energy_key}{source_slug}"


def _engine_profile_id(path_id: str, options: EnergyOptions) -> str:
    path_slug = path_id.removeprefix("path-")
    correction_slug = "corrected" if options.include_corrections else "raw"
    source_slug = "" if options.energy_source == "auto" else f"-{options.energy_source}"
    return f"profile-{path_slug}-{options.energy_key}{source_slug}-{options.output_unit}-{correction_slug}"


def _node_scoped_energy_error(error: RxnFlowError, node_id: str) -> RxnFlowError:
    if error.code == "ambiguous_energy_channel":
        target = "energy_options.energy_key"
    elif error.code == "invalid_input":
        target = error.target
    else:
        target = node_id
    details = dict(error.details)
    details.setdefault("node_id", node_id)
    return RxnFlowError(
        code=error.code,
        message=error.message,
        target=target,
        details=details,
    )


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
