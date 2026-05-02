"""Energy profile calculation for fixture graphs."""

from __future__ import annotations

from .constants import HARTREE_TO_KCAL_MOL
from .errors import RxnFlowError
from .models import (
    ChemicalObject,
    EnergyOptions,
    EnergyPoint,
    EnergyProfile,
    EnergyValue,
    ReactionGraph,
    ReactionNode,
)
from .result import Result, err, ok


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
                absolute_energy=_node_absolute_energy(node.id, node_by_id, object_by_id, options),
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


def _node_absolute_energy(
    node_id: str,
    node_by_id: dict[str, ReactionNode],
    object_by_id: dict[str, ChemicalObject],
    options: EnergyOptions,
) -> EnergyValue:
    node = node_by_id[node_id]
    obj = object_by_id[node.chemical_object_ids[0]]
    return obj.energies[options.energy_key]


def _to_kcal_mol(energy: EnergyValue, target: str) -> Result[float]:
    if energy.unit == "hartree":
        return ok(energy.value * HARTREE_TO_KCAL_MOL)
    if energy.unit == "kcal_mol":
        return ok(energy.value)
    return err(
        RxnFlowError(
            code="invalid_input",
            message=f"The core fixture does not support energy unit '{energy.unit}'.",
            target=target,
        )
    )


def _profile_id(path_id: str, energy_key: str) -> str:
    path_slug = path_id.removeprefix("path-")
    return f"profile-{path_slug}-{energy_key}"
