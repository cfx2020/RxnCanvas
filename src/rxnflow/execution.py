"""Workflow task execution."""

from __future__ import annotations

from io import StringIO
from pathlib import Path

import numpy as np
import yaml
from ase.calculators.singlepoint import SinglePointCalculator
from ase.io import read
from ase.io.trajectory import Trajectory
from ase.mep import NEB
from ase.optimize import BFGS, LBFGS

from .calculators.base import CalculatorSettings, merge_task_settings
from .calculators.factory import build_calculator_from_settings
from .constraints import apply_internal_value, build_constraints
from .errors import WorkflowConfigError
from .model import StructureNode, TaskConfig, TaskDirectoryConfig, WorkflowConfig
from .paths import task_dir
from .parsers.task import parse_task_candidate
from .results import (
    apply_charge_multiplicity,
    load_atoms_from_node,
    write_atoms,
    write_energy_table,
    write_path_energy_table,
    write_scan_energy_table,
    write_trajectory_xyz,
)
from .task_config import load_task_directory


def run_workflow(config: WorkflowConfig, selected_task_ids: list[str] | None = None) -> list[str]:
    tasks = tasks_to_run(config, selected_task_ids)
    completed: list[str] = []
    for task in tasks:
        dispatch_task(config, task)
        completed.append(task.id)
    return completed


def run_task_directory(task: TaskDirectoryConfig) -> None:
    if task.type == "optimize":
        run_optimize_directory(task)
        return
    if task.type == "scan":
        run_scan_directory(task)
        return
    if task.type == "neb":
        run_neb_directory(task)
        return
    raise WorkflowConfigError(f"Task '{task.id}' has unsupported type '{task.type}'.")


def run_optimize_directory(task: TaskDirectoryConfig) -> None:
    atoms = read(task.input_path)
    settings = task_directory_calculator_settings(task)
    apply_charge_multiplicity(atoms, settings.charge, settings.multiplicity)
    atoms.calc = build_calculator_from_settings(settings)

    output_dir = task.directory
    output_dir.mkdir(parents=True, exist_ok=True)
    ase_dir = output_dir / "ase"
    inspect_dir = output_dir / "inspect"
    ase_dir.mkdir(parents=True, exist_ok=True)
    inspect_dir.mkdir(parents=True, exist_ok=True)
    trajectory_path = ase_dir / "optimize.traj"
    log_path = ase_dir / "optimize.log"
    restart_path = ase_dir / "optimize.pckl"

    optimizer = build_ase_optimizer(
        task.optimizer,
        atoms,
        trajectory=str(trajectory_path),
        logfile=str(log_path),
        restart=str(restart_path),
    )
    optimizer.run(fmax=task.fmax, steps=task.steps)

    frames = read_trajectory_frames_or_current(trajectory_path, atoms)
    energies = [frame.get_potential_energy() for frame in frames]
    final_atoms = frames[-1]

    final_structure = inspect_dir / "final.xyz"
    trajectory_xyz = inspect_dir / "trajectory.xyz"
    energy_table = inspect_dir / "energies.csv"

    write_atoms(final_structure, final_atoms)
    write_trajectory_xyz(trajectory_xyz, frames)
    write_energy_table(energy_table, energies)


def run_scan_directory(task: TaskDirectoryConfig) -> None:
    if task.coordinate is None:
        raise WorkflowConfigError(f"Task '{task.id}' must declare one main scan coordinate.")
    atoms = read(task.input_path)
    settings = task_directory_calculator_settings(task)
    coordinate = task.coordinate
    coordinate_values = np.linspace(coordinate.start, coordinate.stop, coordinate.steps).tolist()

    output_dir = task.directory
    output_dir.mkdir(parents=True, exist_ok=True)
    ase_dir = output_dir / "ase"
    inspect_dir = output_dir / "inspect"
    ase_dir.mkdir(parents=True, exist_ok=True)
    inspect_dir.mkdir(parents=True, exist_ok=True)
    scanned_frames = []
    energies = []
    current_atoms = atoms.copy()
    apply_charge_multiplicity(current_atoms, settings.charge, settings.multiplicity)

    for step_index, value in enumerate(coordinate_values):
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
        working_atoms.calc = build_calculator_from_settings(settings)
        step_trajectory = ase_dir / f"scan_step_{step_index:03d}.traj"
        step_log = ase_dir / f"scan_step_{step_index:03d}.log"
        step_restart = ase_dir / f"scan_step_{step_index:03d}.pckl"
        optimizer = build_ase_optimizer(
            task.optimizer,
            working_atoms,
            trajectory=str(step_trajectory),
            logfile=str(step_log),
            restart=str(step_restart),
        )
        optimizer.run(fmax=task.fmax, steps=task.steps)
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

    final_structure = inspect_dir / "final.xyz"
    trajectory_xyz = inspect_dir / "trajectory.xyz"
    energy_table = inspect_dir / "energies.csv"
    peak_path = inspect_dir / "peak.xyz"

    write_atoms(final_structure, final_atoms)
    write_trajectory_xyz(trajectory_xyz, scanned_frames)
    write_scan_energy_table(energy_table, coordinate_values, energies)
    write_atoms(peak_path, ts_like_atoms)


def run_neb_directory(task: TaskDirectoryConfig) -> None:
    if task.initial_path is None or task.final_path is None:
        raise WorkflowConfigError(f"Task '{task.id}' must declare initial and final structures.")
    if task.images is None or task.images < 1:
        raise WorkflowConfigError(f"Task '{task.id}' must declare a positive images count.")

    initial_atoms = read(task.initial_path)
    final_atoms = read(task.final_path)
    settings = task_directory_calculator_settings(task)
    output_dir = task.directory
    output_dir.mkdir(parents=True, exist_ok=True)
    ase_dir = output_dir / "ase"
    inspect_dir = output_dir / "inspect"
    image_dir = inspect_dir / "images"
    ase_dir.mkdir(parents=True, exist_ok=True)
    inspect_dir.mkdir(parents=True, exist_ok=True)
    image_dir.mkdir(parents=True, exist_ok=True)

    apply_charge_multiplicity(initial_atoms, settings.charge, settings.multiplicity)
    apply_charge_multiplicity(final_atoms, settings.charge, settings.multiplicity)
    images = [initial_atoms.copy()]
    for _ in range(task.images):
        image = initial_atoms.copy()
        apply_charge_multiplicity(image, settings.charge, settings.multiplicity)
        images.append(image)
    final_copy = final_atoms.copy()
    apply_charge_multiplicity(final_copy, settings.charge, settings.multiplicity)
    images.append(final_copy)

    for image in images:
        image.calc = build_calculator_from_settings(settings)

    band = NEB(images, method="improvedtangent")
    band.interpolate()
    initial_band_structure = inspect_dir / "initial_band.xyz"
    write_trajectory_xyz(initial_band_structure, images)

    neb_trajectory = ase_dir / "neb.traj"
    neb_log = ase_dir / "neb.log"
    neb_restart = ase_dir / "neb.json"
    open_trajectories = []
    optimizer = build_ase_optimizer(
        task.optimizer,
        band,
        trajectory=str(neb_trajectory),
        logfile=str(neb_log),
        restart=str(neb_restart),
    )
    try:
        for image_index, image in enumerate(images):
            image_trajectory = ase_dir / f"image_{image_index:02d}.traj"
            trajectory = Trajectory(str(image_trajectory), "w", image)
            optimizer.attach(trajectory.write)
            open_trajectories.append(trajectory)
        optimizer.run(fmax=task.fmax, steps=task.steps)
    finally:
        for trajectory in open_trajectories:
            trajectory.close()

    snapped_images = []
    energies = []
    for image in images:
        energy = image.get_potential_energy()
        forces = image.get_forces()
        snapshot = image.copy()
        snapshot.calc = SinglePointCalculator(snapshot, energy=energy, forces=forces)
        snapped_images.append(snapshot)
        energies.append(energy)

    path_positions = cumulative_path_positions(snapped_images)
    peak_index = max(range(len(energies)), key=energies.__getitem__)
    ts_like_atoms = snapped_images[peak_index]

    band_structure = inspect_dir / "band.xyz"
    energy_table = inspect_dir / "energies.csv"
    peak_path = inspect_dir / "peak.xyz"

    write_trajectory_xyz(band_structure, snapped_images)
    write_path_energy_table(energy_table, path_positions, energies)
    write_atoms(peak_path, ts_like_atoms)
    for image_index, image in enumerate(snapped_images):
        image_structure = image_dir / f"image_{image_index:02d}.xyz"
        write_atoms(image_structure, image)


def task_directory_calculator_settings(task: TaskDirectoryConfig) -> CalculatorSettings:
    return CalculatorSettings(
        backend=task.backend,
        model=task.model,
        device=task.device,
        task_name=task.task_name,
        charge=task.charge,
        multiplicity=task.multiplicity,
    )


def build_ase_optimizer(name: str, atoms, **kwargs):
    optimizer_name = name.lower().replace("_", "")
    if optimizer_name == "bfgs":
        return BFGS(atoms, **kwargs)
    if optimizer_name == "lbfgs":
        return LBFGS(atoms, **kwargs)
    raise WorkflowConfigError(f"Unsupported ASE optimizer '{name}'. Supported optimizers: BFGS, LBFGS.")


def read_trajectory_frames_or_current(trajectory_path: Path, atoms):
    if trajectory_path.exists():
        frames = list(read(trajectory_path, index=":"))
        if frames:
            return frames
    energy = atoms.get_potential_energy()
    forces = atoms.get_forces()
    snapshot = atoms.copy()
    snapshot.calc = SinglePointCalculator(snapshot, energy=energy, forces=forces)
    return [snapshot]


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
    if task.type == "optimize":
        run_optimize(config, task)
        return
    if task.type == "scan":
        run_scan(config, task)
        return
    if task.type == "neb":
        run_neb(config, task)
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
    parsed = parse_task_candidate(task_dir(config, input_id), "final")
    atoms = read(StringIO(parsed.structure_xyz), format="xyz")
    apply_charge_multiplicity(atoms, parsed.charge, parsed.multiplicity)
    return atoms, StructureNode(
        id=input_id,
        path="",
        charge=parsed.charge,
        multiplicity=parsed.multiplicity,
    )


def run_optimize(config: WorkflowConfig, task: TaskConfig) -> None:
    atoms, input_node = load_task_input_atoms(config, task.input)
    settings = merge_task_settings(config.defaults, task, input_node)
    output_dir = task_dir(config, task.id)
    output_dir.mkdir(parents=True, exist_ok=True)
    write_atoms(output_dir / "input.xyz", atoms)
    write_task_yaml(
        output_dir,
        {
            **task_settings_yaml(settings),
            "type": "optimize",
        },
    )
    run_task_directory(load_task_directory(output_dir))


def run_scan(config: WorkflowConfig, task: TaskConfig) -> None:
    atoms, input_node = load_task_input_atoms(config, task.input)
    settings = merge_task_settings(config.defaults, task, input_node)
    output_dir = task_dir(config, task.id)
    output_dir.mkdir(parents=True, exist_ok=True)
    write_atoms(output_dir / "input.xyz", atoms)
    assert task.coordinate is not None
    write_task_yaml(
        output_dir,
        {
            **task_settings_yaml(settings),
            "type": "scan",
            "coordinate": {
                "type": task.coordinate.type,
                "atoms": task.coordinate.atoms,
                "start": task.coordinate.start,
                "stop": task.coordinate.stop,
                "steps": task.coordinate.steps,
            },
            "constraints": [
                {"type": item.type, "atoms": item.atoms, "value": item.value}
                for item in task.constraints
            ],
        },
    )
    run_task_directory(load_task_directory(output_dir))


def run_neb(config: WorkflowConfig, task: TaskConfig) -> None:
    initial_atoms, initial_node = load_task_input_atoms(config, task.initial)
    final_atoms, _ = load_task_input_atoms(config, task.final)
    settings = merge_task_settings(config.defaults, task, initial_node)
    output_dir = task_dir(config, task.id)
    output_dir.mkdir(parents=True, exist_ok=True)
    write_atoms(output_dir / "initial.xyz", initial_atoms)
    write_atoms(output_dir / "final.xyz", final_atoms)
    write_task_yaml(
        output_dir,
        {
            **task_settings_yaml(settings),
            "type": "neb",
            "initial": "initial.xyz",
            "final": "final.xyz",
            "images": task.images,
        },
    )
    run_task_directory(load_task_directory(output_dir))


def task_settings_yaml(settings) -> dict:
    return {
        "charge": settings.charge,
        "multiplicity": settings.multiplicity,
        "backend": settings.backend,
        "model": settings.model,
        "device": settings.device,
        "task_name": settings.task_name,
        "optimizer": settings.optimizer,
        "fmax": settings.fmax,
        "steps": settings.steps,
    }


def write_task_yaml(directory: Path, payload: dict) -> None:
    (directory / "task.yaml").write_text(yaml.safe_dump(payload, sort_keys=False), encoding="utf-8")


def cumulative_path_positions(images) -> list[float]:
    positions = [0.0]
    for previous, current in zip(images, images[1:], strict=False):
        delta = current.get_positions() - previous.get_positions()
        positions.append(positions[-1] + float(np.linalg.norm(delta)))
    return positions
