"""Energy profile persistence codec for project content sections."""

from __future__ import annotations

from typing import Any

from .energy_channels import validate_energy_source
from .errors import RxnFlowError, RxnFlowWarning
from .models import CorrectionPolicy, EnergyOptions, EnergyPoint, EnergyProfile, EnergyValue, ID, ReactionGraph
from .result import Result, err, ok


ENERGY_PROFILES_SCHEMA_VERSION = "energy-profiles-v1"
SUPPORTED_PROFILE_UNITS = frozenset({"kcal_mol", "kj_mol"})


def energy_profiles_section_to_dict(
    project_id: ID,
    profiles: tuple[EnergyProfile, ...],
    graphs: tuple[ReactionGraph, ...] = (),
) -> Result[dict[str, Any]]:
    if not project_id:
        return err(RxnFlowError("invalid_input", "Energy profile section requires project_id.", target="project_id"))

    graph_by_id = {graph.id: graph for graph in graphs}
    encoded_profiles: list[dict[str, Any]] = []
    seen_profile_ids: set[ID] = set()
    for index, profile in enumerate(profiles):
        target = f"profiles[{index}]"
        validation = _validate_profile(project_id, profile, graph_by_id, seen_profile_ids, target)
        if validation is not None:
            return err(validation)
        encoded = _profile_to_dict(profile, target)
        if not encoded.ok or encoded.value is None:
            assert encoded.error is not None
            return err(encoded.error)
        encoded_profiles.append(encoded.value)

    return ok(
        {
            "schema_version": ENERGY_PROFILES_SCHEMA_VERSION,
            "project_id": project_id,
            "profiles": encoded_profiles,
        }
    )


def energy_profiles_section_from_dict(
    project_id: ID,
    data: dict[str, Any] | None,
    graphs: tuple[ReactionGraph, ...] = (),
) -> Result[tuple[EnergyProfile, ...]]:
    if data is None:
        return ok(())
    if not isinstance(data, dict):
        return err(RxnFlowError("invalid_input", "Energy profile section must be an object.", target="energy_profiles"))
    if data.get("schema_version") != ENERGY_PROFILES_SCHEMA_VERSION:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Unsupported section schema_version '{data.get('schema_version')}'.",
                target="energy_profiles",
            )
        )
    if data.get("project_id") != project_id:
        return err(
            RxnFlowError(
                "invalid_input",
                "Energy profile section project_id does not match index.",
                target="energy_profiles",
            )
        )

    raw_profiles = data.get("profiles", [])
    if not isinstance(raw_profiles, list):
        return err(RxnFlowError("invalid_input", "Energy profile section profiles must be a list.", target="profiles"))

    graph_by_id = {graph.id: graph for graph in graphs}
    profiles: list[EnergyProfile] = []
    seen_profile_ids: set[ID] = set()
    for index, value in enumerate(raw_profiles):
        target = f"profiles[{index}]"
        if not isinstance(value, dict):
            return err(RxnFlowError("invalid_input", "Stored energy profile must be an object.", target=target))
        decoded = _profile_from_dict(value, target)
        if not decoded.ok or decoded.value is None:
            assert decoded.error is not None
            return err(decoded.error)
        validation = _validate_profile(project_id, decoded.value, graph_by_id, seen_profile_ids, target)
        if validation is not None:
            return err(validation)
        profiles.append(decoded.value)

    return ok(tuple(profiles))


def _profile_to_dict(profile: EnergyProfile, target: str) -> Result[dict[str, Any]]:
    options = _options_to_dict(profile.options, f"{target}.options")
    if not options.ok or options.value is None:
        assert options.error is not None
        return err(options.error)

    points = _points_to_list(profile.points, profile.options, f"{target}.points")
    if not points.ok or points.value is None:
        assert points.error is not None
        return err(points.error)

    warnings = _warnings_to_list(profile.warnings, f"{target}.warnings")
    if not warnings.ok or warnings.value is None:
        assert warnings.error is not None
        return err(warnings.error)

    return ok(
        {
            "id": profile.id,
            "graph_id": profile.graph_id,
            "path_id": profile.path_id,
            "options": options.value,
            "points": points.value,
            "warnings": warnings.value,
        }
    )


def _profile_from_dict(data: dict[str, Any], target: str) -> Result[EnergyProfile]:
    options = _options_from_value(data.get("options"), f"{target}.options")
    if not options.ok or options.value is None:
        assert options.error is not None
        return err(options.error)

    points = _points_from_value(data.get("points", []), options.value, f"{target}.points")
    if not points.ok or points.value is None:
        assert points.error is not None
        return err(points.error)

    warnings = _warnings_from_value(data.get("warnings", []), f"{target}.warnings")
    if not warnings.ok or warnings.value is None:
        assert warnings.error is not None
        return err(warnings.error)

    try:
        return ok(
            EnergyProfile(
                id=str(data["id"]),
                graph_id=str(data["graph_id"]),
                path_id=str(data["path_id"]),
                options=options.value,
                points=points.value,
                warnings=warnings.value,
            )
        )
    except KeyError as exc:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Energy profile is missing field '{exc.args[0]}'.",
                target=target,
            )
        )


def _options_to_dict(options: EnergyOptions, target: str) -> Result[dict[str, Any]]:
    error = _validate_options(options, target)
    if error is not None:
        return err(error)
    return ok(
        {
            "output_unit": options.output_unit,
            "include_corrections": options.include_corrections,
            "energy_key": options.energy_key,
            "energy_source": options.energy_source,
            "correction_policy": _correction_policy_to_dict(options.correction_policy),
            "baseline_node_id": options.baseline_node_id,
        }
    )


def _options_from_value(value: Any, target: str) -> Result[EnergyOptions]:
    if not isinstance(value, dict):
        return err(RxnFlowError("invalid_input", "Energy profile options must be an object.", target=target))
    try:
        policy = _correction_policy_from_value(value.get("correction_policy"), f"{target}.correction_policy")
        if not policy.ok:
            assert policy.error is not None
            return err(policy.error)
        options = EnergyOptions(
            output_unit=value["output_unit"],
            include_corrections=value["include_corrections"],
            energy_key=value["energy_key"],
            baseline_node_id=value.get("baseline_node_id"),
            energy_source=value.get("energy_source", "auto"),
            correction_policy=policy.value,
        )
    except KeyError as exc:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Energy profile options are missing field '{exc.args[0]}'.",
                target=target,
            )
        )
    error = _validate_options(options, target)
    if error is not None:
        return err(error)
    return ok(options)


def _correction_policy_to_dict(policy: CorrectionPolicy | None) -> dict[str, Any] | None:
    if policy is None:
        return None
    return {
        "mode": policy.mode,
        "kinds": list(policy.kinds),
        "ids": list(policy.ids),
    }


def _correction_policy_from_value(value: Any, target: str) -> Result[CorrectionPolicy | None]:
    if value is None:
        return ok(None)
    if not isinstance(value, dict):
        return err(RxnFlowError("invalid_input", "Correction policy must be an object.", target=target))
    mode = value.get("mode")
    if mode not in {"none", "all", "kinds", "ids"}:
        return err(RxnFlowError("invalid_input", "Correction policy mode is unsupported.", target=f"{target}.mode"))
    kinds = value.get("kinds", [])
    ids = value.get("ids", [])
    if not isinstance(kinds, list) or not all(isinstance(item, str) for item in kinds):
        return err(RxnFlowError("invalid_input", "Correction policy kinds must be a string list.", target=f"{target}.kinds"))
    if not isinstance(ids, list) or not all(isinstance(item, str) for item in ids):
        return err(RxnFlowError("invalid_input", "Correction policy ids must be a string list.", target=f"{target}.ids"))
    allowed_kinds = {"resonance", "solvation", "manual"}
    if any(kind not in allowed_kinds for kind in kinds):
        return err(RxnFlowError("invalid_input", "Correction policy kind is unsupported.", target=f"{target}.kinds"))
    return ok(CorrectionPolicy(mode=mode, kinds=tuple(kinds), ids=tuple(ids)))  # type: ignore[arg-type]


def _points_to_list(
    points: tuple[EnergyPoint, ...],
    options: EnergyOptions,
    target: str,
) -> Result[list[dict[str, Any]]]:
    encoded: list[dict[str, Any]] = []
    for index, point in enumerate(points):
        value = _point_to_dict(point, options, f"{target}[{index}]")
        if not value.ok or value.value is None:
            assert value.error is not None
            return err(value.error)
        encoded.append(value.value)
    return ok(encoded)


def _points_from_value(
    value: Any,
    options: EnergyOptions,
    target: str,
) -> Result[tuple[EnergyPoint, ...]]:
    if not isinstance(value, list):
        return err(RxnFlowError("invalid_input", "Energy profile points must be a list.", target=target))
    points: list[EnergyPoint] = []
    for index, item in enumerate(value):
        item_target = f"{target}[{index}]"
        if not isinstance(item, dict):
            return err(RxnFlowError("invalid_input", "Energy profile point must be an object.", target=item_target))
        point = _point_from_dict(item, options, item_target)
        if not point.ok or point.value is None:
            assert point.error is not None
            return err(point.error)
        points.append(point.value)
    return ok(tuple(points))


def _point_to_dict(
    point: EnergyPoint,
    options: EnergyOptions,
    target: str,
) -> Result[dict[str, Any]]:
    validation = _validate_point(point, options, target)
    if validation is not None:
        return err(validation)

    absolute = None
    if point.absolute_energy is not None:
        encoded_absolute = _energy_value_to_dict(point.absolute_energy, f"{target}.absolute_energy")
        if not encoded_absolute.ok or encoded_absolute.value is None:
            assert encoded_absolute.error is not None
            return err(encoded_absolute.error)
        absolute = encoded_absolute.value

    relative = None
    if point.relative_energy is not None:
        encoded_relative = _energy_value_to_dict(point.relative_energy, f"{target}.relative_energy")
        if not encoded_relative.ok or encoded_relative.value is None:
            assert encoded_relative.error is not None
            return err(encoded_relative.error)
        relative = encoded_relative.value

    return ok(
        {
            "node_id": point.node_id,
            "label": point.label,
            "absolute_energy": absolute,
            "relative_energy": relative,
            "missing_reason": point.missing_reason,
        }
    )


def _point_from_dict(
    data: dict[str, Any],
    options: EnergyOptions,
    target: str,
) -> Result[EnergyPoint]:
    absolute = _optional_energy_value_from_value(data.get("absolute_energy"), f"{target}.absolute_energy")
    if not absolute.ok:
        assert absolute.error is not None
        return err(absolute.error)

    relative = _optional_energy_value_from_value(data.get("relative_energy"), f"{target}.relative_energy")
    if not relative.ok:
        assert relative.error is not None
        return err(relative.error)

    try:
        point = EnergyPoint(
            node_id=str(data["node_id"]),
            label=data["label"],
            absolute_energy=absolute.value,
            relative_energy=relative.value,
            missing_reason=data.get("missing_reason"),
        )
    except KeyError as exc:
        return err(
            RxnFlowError(
                "invalid_input",
                f"Energy profile point is missing field '{exc.args[0]}'.",
                target=target,
            )
        )
    validation = _validate_point(point, options, target)
    if validation is not None:
        return err(validation)
    return ok(point)


def _energy_value_to_dict(value: EnergyValue, target: str) -> Result[dict[str, Any]]:
    if not isinstance(value, EnergyValue):
        return err(RxnFlowError("invalid_input", "Energy value must include value and unit.", target=target))
    if value.unit not in SUPPORTED_PROFILE_UNITS:
        return err(RxnFlowError("invalid_input", "Energy unit is unsupported.", target=f"{target}.unit"))
    return ok({"value": value.value, "unit": value.unit, "reference": value.reference})


def _optional_energy_value_from_value(value: Any, target: str) -> Result[EnergyValue | None]:
    if value is None:
        return ok(None)
    return _energy_value_from_value(value, target)


def _energy_value_from_value(value: Any, target: str) -> Result[EnergyValue]:
    if not isinstance(value, dict):
        return err(RxnFlowError("invalid_input", "Energy value must include value and unit.", target=target))
    if "value" not in value or "unit" not in value:
        return err(RxnFlowError("invalid_input", "Energy value must include value and unit.", target=target))
    if value["unit"] not in SUPPORTED_PROFILE_UNITS:
        return err(RxnFlowError("invalid_input", "Energy unit is unsupported.", target=f"{target}.unit"))
    try:
        numeric_value = float(value["value"])
    except (TypeError, ValueError) as exc:
        return err(RxnFlowError("invalid_input", f"Energy value is invalid: {exc}.", target=f"{target}.value"))
    return ok(EnergyValue(numeric_value, value["unit"], reference=value.get("reference")))


def _warnings_to_list(warnings: tuple[Any, ...], target: str) -> Result[list[dict[str, Any]]]:
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
        validation = _validate_warning(warning, f"{target}[{index}]")
        if validation is not None:
            return err(validation)
        encoded.append({"code": warning.code, "message": warning.message, "target": warning.target})
    return ok(encoded)


def _warnings_from_value(value: Any, target: str) -> Result[tuple[RxnFlowWarning, ...]]:
    if not isinstance(value, list):
        return err(RxnFlowError("invalid_input", "Warnings must be a list.", target=target))
    warnings: list[RxnFlowWarning] = []
    for index, item in enumerate(value):
        item_target = f"{target}[{index}]"
        if not isinstance(item, dict):
            return err(RxnFlowError("invalid_input", "Warning entry must be an object.", target=item_target))
        if "code" not in item or "message" not in item:
            return err(RxnFlowError("invalid_input", "Warning entry requires code and message.", target=item_target))
        if item.get("target") is not None and not isinstance(item.get("target"), str):
            return err(RxnFlowError("invalid_input", "Warning target must be a string.", target=f"{item_target}.target"))
        warning = RxnFlowWarning(code=str(item["code"]), message=str(item["message"]), target=item.get("target"))
        validation = _validate_warning(warning, item_target)
        if validation is not None:
            return err(validation)
        warnings.append(warning)
    return ok(tuple(warnings))


def _validate_profile(
    project_id: ID,
    profile: EnergyProfile,
    graph_by_id: dict[ID, ReactionGraph],
    seen_profile_ids: set[ID],
    target: str,
) -> RxnFlowError | None:
    if not profile.id:
        return RxnFlowError("invalid_input", "Energy profile id is required.", target=f"{target}.id")
    if profile.id in seen_profile_ids:
        return RxnFlowError("invalid_input", "Energy profile id is duplicated.", target=profile.id)
    seen_profile_ids.add(profile.id)
    if not profile.graph_id:
        return RxnFlowError("invalid_input", "Energy profile graph_id is required.", target=f"{target}.graph_id")
    if not profile.path_id:
        return RxnFlowError("invalid_input", "Energy profile path_id is required.", target=f"{target}.path_id")

    options_error = _validate_options(profile.options, f"{target}.options")
    if options_error is not None:
        return options_error

    for point_index, point in enumerate(profile.points):
        point_error = _validate_point(point, profile.options, f"{target}.points[{point_index}]")
        if point_error is not None:
            return point_error

    for warning_index, warning in enumerate(profile.warnings):
        if not isinstance(warning, RxnFlowWarning):
            return RxnFlowError(
                "invalid_input",
                "Warning entry must be RxnFlowWarning.",
                target=f"{target}.warnings[{warning_index}]",
            )
        warning_error = _validate_warning(warning, f"{target}.warnings[{warning_index}]")
        if warning_error is not None:
            return warning_error

    graph = graph_by_id.get(profile.graph_id)
    if graph is None:
        return RxnFlowError(
            "graph_invalid",
            "Energy profile references a missing reaction graph.",
            target=profile.graph_id,
        )
    if graph.project_id != project_id:
        return RxnFlowError(
            "graph_invalid",
            "Energy profile graph project_id does not match section.",
            target=profile.graph_id,
        )

    path = next((candidate for candidate in graph.paths if candidate.id == profile.path_id), None)
    if path is None:
        return RxnFlowError(
            "graph_invalid",
            "Energy profile references a missing reaction path.",
            target=profile.path_id,
        )

    profile_node_ids = tuple(point.node_id for point in profile.points)
    if profile_node_ids != path.node_ids:
        return RxnFlowError(
            "graph_invalid",
            "Energy profile points do not match reaction path node order.",
            target=profile.path_id,
            details={"expected_node_ids": path.node_ids, "profile_node_ids": profile_node_ids},
        )

    baseline_node_id = profile.options.baseline_node_id
    if baseline_node_id is not None and baseline_node_id not in path.node_ids:
        return RxnFlowError(
            "graph_invalid",
            "Energy profile baseline_node_id is not in reaction path.",
            target=baseline_node_id,
        )
    return None


def _validate_options(options: EnergyOptions, target: str) -> RxnFlowError | None:
    if options.output_unit not in SUPPORTED_PROFILE_UNITS:
        return RxnFlowError("invalid_input", "Energy profile output_unit is unsupported.", target=f"{target}.output_unit")
    if not isinstance(options.include_corrections, bool):
        return RxnFlowError(
            "invalid_input",
            "Energy profile include_corrections must be a boolean.",
            target=f"{target}.include_corrections",
        )
    if not isinstance(options.energy_key, str) or not options.energy_key:
        return RxnFlowError("invalid_input", "Energy profile energy_key is required.", target=f"{target}.energy_key")
    source_error = validate_energy_source(options.energy_source, f"{target}.energy_source")
    if source_error is not None:
        return source_error
    if options.correction_policy is not None:
        policy_error = _validate_correction_policy(options.correction_policy, f"{target}.correction_policy")
        if policy_error is not None:
            return policy_error
    if options.baseline_node_id is not None and (
        not isinstance(options.baseline_node_id, str) or not options.baseline_node_id
    ):
        return RxnFlowError(
            "invalid_input",
            "Energy profile baseline_node_id must be a non-empty string when present.",
            target=f"{target}.baseline_node_id",
        )
    return None


def _validate_correction_policy(policy: CorrectionPolicy, target: str) -> RxnFlowError | None:
    if policy.mode not in {"none", "all", "kinds", "ids"}:
        return RxnFlowError("invalid_input", "Correction policy mode is unsupported.", target=f"{target}.mode")
    allowed_kinds = {"resonance", "solvation", "manual"}
    if any(kind not in allowed_kinds for kind in policy.kinds):
        return RxnFlowError("invalid_input", "Correction policy kind is unsupported.", target=f"{target}.kinds")
    if policy.mode == "kinds" and not policy.kinds:
        return RxnFlowError("invalid_input", "Correction policy kinds are required.", target=f"{target}.kinds")
    if policy.mode == "ids" and not policy.ids:
        return RxnFlowError("invalid_input", "Correction policy ids are required.", target=f"{target}.ids")
    return None


def _validate_point(point: EnergyPoint, options: EnergyOptions, target: str) -> RxnFlowError | None:
    if not point.node_id:
        return RxnFlowError("invalid_input", "Energy profile point node_id is required.", target=f"{target}.node_id")
    if not isinstance(point.label, str):
        return RxnFlowError("invalid_input", "Energy profile point label must be a string.", target=f"{target}.label")
    if point.missing_reason is not None and (not isinstance(point.missing_reason, str) or not point.missing_reason):
        return RxnFlowError(
            "invalid_input",
            "Energy profile point missing_reason must be a non-empty string when present.",
            target=f"{target}.missing_reason",
        )

    has_absolute = point.absolute_energy is not None
    has_relative = point.relative_energy is not None
    if point.missing_reason is not None:
        if has_absolute or has_relative:
            return RxnFlowError(
                "invalid_input",
                "Missing energy profile point cannot include absolute or relative energy.",
                target=target,
            )
        return None

    if not has_absolute or not has_relative:
        return RxnFlowError(
            "invalid_input",
            "Energy profile point requires absolute_energy and relative_energy unless it is missing.",
            target=target,
        )

    if point.absolute_energy is not None and point.absolute_energy.unit != options.output_unit:
        return RxnFlowError(
            "invalid_input",
            "Energy profile absolute_energy unit must match output_unit.",
            target=f"{target}.absolute_energy.unit",
        )
    if point.relative_energy is not None and point.relative_energy.unit != options.output_unit:
        return RxnFlowError(
            "invalid_input",
            "Energy profile relative_energy unit must match output_unit.",
            target=f"{target}.relative_energy.unit",
        )
    return None


def _validate_warning(warning: RxnFlowWarning, target: str) -> RxnFlowError | None:
    if not warning.code:
        return RxnFlowError("invalid_input", "Warning code is required.", target=f"{target}.code")
    if not warning.message:
        return RxnFlowError("invalid_input", "Warning message is required.", target=f"{target}.message")
    if warning.target is not None and not isinstance(warning.target, str):
        return RxnFlowError("invalid_input", "Warning target must be a string.", target=f"{target}.target")
    return None
