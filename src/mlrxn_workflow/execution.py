"""Workflow task execution."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import asdict
from pathlib import Path

import numpy as np
from ase.calculators.singlepoint import SinglePointCalculator
from ase.io import read
from ase.optimize import LBFGS

from .calculators.base import merge_task_settings
from .calculators.factory import build_calculator
from .constraints import apply_internal_value, build_constraints
from .errors import WorkflowConfigError
from .model import StructureNode, TaskConfig, WorkflowConfig
from .paths import task_dir
from .results import (
    load_atoms_from_node,
    load_atoms_from_task_result,
    resolve_structure_path,
    write_atoms,
    write_energy_table,
    write_metadata,
    write_scan_energy_table,
    write_trajectory_xyz,
)


def run_workflow(config: WorkflowConfig, selected_task_ids: list[str] | None = None) -> list[str]:
    tasks = tasks_to_run(config, selected_task_ids)
    completed: list[str] = []
    for task in tasks:
        dispatch_task(config, task)
        completed.append(task.id)
    return completed


def tasks_to_run(config: WorkflowConfig, selected_task_ids: list[str] | None = None) -> list[TaskConfig]:
    if not selected_task_ids:
        return list(config.tasks)
    task_by_id = {task.id: task for task in config.tasks}
    missing = [task_id for task_id in selected_task_ids if task_id not in task_by_id]
    if missing:
        raise WorkflowConfigError(f"Unknown selected task ids: {', '.join(missing)}")
    needed: set[str] = set()
    stack = list(selected_task_ids)
    while stack:
        task_id = stack.pop()
        if task_id in needed:
            continue
        needed.add(task_id)
        task = task_by_id[task_id]
        for dependency in task_dependencies(task, set(task_by_id)):
            stack.append(dependency)
    return [task for task in config.tasks if task.id in needed]


def task_dependencies(task: TaskConfig, task_ids: set[str]) -> list[str]:
    candidates = [task.input, task.initial, task.final]
    return [candidate for candidate in candidates if candidate in task_ids]


def dispatch_task(config: WorkflowConfig, task: TaskConfig) -> None:
    if task.type == "geomopt":
        run_geomopt(config, task)
        return
    if task.type == "scan":
        run_scan(config, task)
        return
    raise NotImplementedError(f"Task type '{task.type}' is not implemented yet.")


def resolve_input_node(config: WorkflowConfig, input_id: str) -> StructureNode | None:
    for node in config.references + config.nodes:
        if node.id == input_id:
            return node
    return None


def load_task_input_atoms(config: WorkflowConfig, input_id: str):
    node = resolve_input_node(config, input_id)
    if node is not None:
        return load_atoms_from_node(config, node), node
    return load_atoms_from_task_result(config, input_id), None


def run_geomopt(config: WorkflowConfig, task: TaskConfig) -> None:
    atoms, explicit_node = load_task_input_atoms(config, task.input)
    if explicit_node is None:
        # Carry forward the latest charge and multiplicity from the upstream task result.
        explicit_node = StructureNode(
            id=task.input,
            path=str(task_dir(config, task.input) / "result.xyz"),
            charge=int(atoms.info["charge"]),
            multiplicity=int(atoms.info["multiplicity"]),
        )
    settings = merge_task_settings(config.defaults, task, explicit_node)
    atoms.info["charge"] = settings.charge
    atoms.info["multiplicity"] = settings.multiplicity
    atoms.calc = build_calculator(config, task, explicit_node)

    output_dir = task_dir(config, task.id)
    output_dir.mkdir(parents=True, exist_ok=True)
    trajectory_path = output_dir / "trajectory.traj"

    optimizer = LBFGS(atoms, trajectory=str(trajectory_path), logfile=None)
    optimizer.run(fmax=settings.fmax, steps=settings.max_steps)

    frames = list(read(trajectory_path, index=":"))
    if not frames:
        frames = [atoms.copy()]
    energies = [frame.get_potential_energy() for frame in frames]
    final_atoms = frames[-1]

    result_structure = output_dir / "result.xyz"
    trajectory_xyz = output_dir / "trajectory.xyz"
    energy_table = output_dir / "energies.csv"
    metadata_path = output_dir / "metadata.json"

    write_atoms(result_structure, final_atoms)
    write_trajectory_xyz(trajectory_xyz, frames)
    write_energy_table(energy_table, energies)
    write_metadata(
        metadata_path,
        {
            "task": {"id": task.id, "type": task.type, "input": task.input},
            "settings": asdict(settings),
            "source": {
                "input_id": task.input,
                "input_path": str(resolve_structure_path(config, explicit_node)),
            },
            "artifacts": {
                "result_structure": str(result_structure),
                "trajectory": str(trajectory_xyz),
                "energy_table": str(energy_table),
            },
            "summary": {
                "steps": len(energies),
                "final_energy": energies[-1],
            },
        },
    )


def run_scan(config: WorkflowConfig, task: TaskConfig) -> None:
    atoms, explicit_node = load_task_input_atoms(config, task.input)
    if explicit_node is None:
        explicit_node = StructureNode(
            id=task.input,
            path=str(task_dir(config, task.input) / "result.xyz"),
            charge=int(atoms.info["charge"]),
            multiplicity=int(atoms.info["multiplicity"]),
        )
    settings = merge_task_settings(config.defaults, task, explicit_node)

    coordinate = task.coordinate
    assert coordinate is not None
    coordinate_values = np.linspace(coordinate.start, coordinate.stop, coordinate.steps).tolist()

    output_dir = task_dir(config, task.id)
    output_dir.mkdir(parents=True, exist_ok=True)
    scanned_frames = []
    energies = []
    current_atoms = atoms.copy()
    current_atoms.info["charge"] = settings.charge
    current_atoms.info["multiplicity"] = settings.multiplicity

    for value in coordinate_values:
        working_atoms = current_atoms.copy()
        apply_internal_value(working_atoms, coordinate.type, coordinate.atoms, value)
        for constraint in task.constraints:
            if constraint.type != "freeze_atoms":
                apply_internal_value(working_atoms, constraint.type, constraint.atoms, constraint.value)
        working_atoms.set_constraint(
            build_constraints(
                coordinate=type(coordinate)(
                    type=coordinate.type,
                    atoms=coordinate.atoms,
                    start=value,
                    stop=value,
                    steps=coordinate.steps,
                ),
                auxiliary_constraints=task.constraints,
            )
        )
        working_atoms.calc = build_calculator(config, task, explicit_node)
        optimizer = LBFGS(working_atoms, logfile=None)
        optimizer.run(fmax=settings.fmax, steps=settings.max_steps)
        energy = working_atoms.get_potential_energy()
        forces = working_atoms.get_forces()
        snapshot = working_atoms.copy()
        snapshot.calc = SinglePointCalculator(snapshot, energy=energy, forces=forces)
        scanned_frames.append(snapshot)
        energies.append(energy)
        current_atoms = snapshot.copy()

    peak_index = max(range(len(energies)), key=energies.__getitem__)
    final_atoms = scanned_frames[-1]
    ts_like_atoms = scanned_frames[peak_index]

    result_structure = output_dir / "result.xyz"
    trajectory_xyz = output_dir / "trajectory.xyz"
    energy_table = output_dir / "energies.csv"
    metadata_path = output_dir / "metadata.json"
    ts_like_path = output_dir / "ts_like.xyz"

    write_atoms(result_structure, final_atoms)
    write_trajectory_xyz(trajectory_xyz, scanned_frames)
    write_scan_energy_table(energy_table, coordinate_values, energies)
    write_atoms(ts_like_path, ts_like_atoms)
    write_metadata(
        metadata_path,
        {
            "task": {"id": task.id, "type": task.type, "input": task.input},
            "settings": asdict(settings),
            "scan": {
                "coordinate": {
                    "type": coordinate.type,
                    "atoms": coordinate.atoms,
                    "start": coordinate.start,
                    "stop": coordinate.stop,
                    "steps": coordinate.steps,
                },
                "constraints": [
                    {"type": item.type, "atoms": item.atoms, "value": item.value}
                    for item in task.constraints
                ],
            },
            "source": {
                "input_id": task.input,
                "input_path": str(resolve_structure_path(config, explicit_node)),
            },
            "artifacts": {
                "result_structure": str(result_structure),
                "trajectory": str(trajectory_xyz),
                "energy_table": str(energy_table),
                "ts_like_structure": str(ts_like_path),
            },
            "summary": {
                "steps": len(energies),
                "final_energy": energies[-1],
                "peak_index": peak_index,
                "peak_energy": energies[peak_index],
                "peak_coordinate": coordinate_values[peak_index],
            },
        },
    )


def _ordered_unique(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value not in seen:
            ordered.append(value)
            seen.add(value)
    return ordered
