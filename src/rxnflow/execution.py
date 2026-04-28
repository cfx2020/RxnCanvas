"""Workflow task execution."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from ase.calculators.singlepoint import SinglePointCalculator
from ase.io import read
from ase.io.trajectory import Trajectory
from ase.mep import NEB
from ase.optimize import BFGS, LBFGS

from .calculators.base import CalculatorSettings
from .calculators.factory import build_calculator_from_settings
from .constraints import apply_internal_value, build_constraints
from .errors import RxnFlowError
from .model import DEFAULT_TASK_FMAX, DEFAULT_TASK_OPTIMIZER, DEFAULT_TASK_STEPS, TaskDirectoryConfig
from .results import (
    apply_charge_multiplicity,
    write_atoms,
    write_energy_table,
    write_energy_profile,
    write_path_energy_table,
    write_scan_energy_table,
    write_trajectory_extxyz,
    write_trajectory_xyz,
)


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
    raise RxnFlowError(f"Task '{task.id}' has unsupported type '{task.type}'.")


def run_optimize_directory(task: TaskDirectoryConfig) -> None:
    atoms = read_task_structure(task.input_path)
    settings = task_directory_calculator_settings(task)
    apply_calculator_metadata(atoms, settings)

    output_dir = task.directory
    output_dir.mkdir(parents=True, exist_ok=True)
    frames = optimize_atoms(
        atoms,
        settings=settings,
        optimizer_name=task.optimizer,
        fmax=task.fmax,
        steps=task.steps,
        trajectory_path=output_dir / "opt.traj",
        log_path=output_dir / "opt.log",
        restart_path=output_dir / "opt.pckl",
    )

    energies = [frame.get_potential_energy() for frame in frames]
    final_atoms = frames[-1]

    final_structure = output_dir / "final.xyz"
    trajectory_xyz = output_dir / "opt_traj.xyz"
    trajectory_extxyz = output_dir / "opt_traj.extxyz"
    energy_table = output_dir / "opt_energies.csv"

    write_atoms(final_structure, final_atoms)
    write_trajectory_xyz(trajectory_xyz, frames)
    write_trajectory_extxyz(trajectory_extxyz, frames)
    write_energy_table(energy_table, energies)


def run_scan_directory(task: TaskDirectoryConfig) -> None:
    if task.coordinate is None:
        raise RxnFlowError(f"Task '{task.id}' must declare one main scan coordinate.")
    atoms = read_task_structure(task.input_path)
    settings = task_directory_calculator_settings(task)
    coordinate = task.coordinate
    coordinate_values = np.linspace(coordinate.start, coordinate.stop, coordinate.steps).tolist()

    output_dir = task.directory
    output_dir.mkdir(parents=True, exist_ok=True)
    scanned_frames = []
    energies = []
    current_atoms = atoms.copy()
    apply_calculator_metadata(current_atoms, settings)

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
        step_trajectory = output_dir / f"scan_step_{step_index:03d}.traj"
        step_log = output_dir / f"scan_step_{step_index:03d}.log"
        step_restart = output_dir / f"scan_step_{step_index:03d}.pckl"
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

    final_structure = output_dir / "final.xyz"
    trajectory_xyz = output_dir / "scan_traj.xyz"
    trajectory_extxyz = output_dir / "scan_traj.extxyz"
    energy_table = output_dir / "scan_energies.csv"
    profile_path = output_dir / "scan_energy_profile.png"
    peak_path = output_dir / "peak.xyz"

    write_atoms(final_structure, final_atoms)
    write_trajectory_xyz(trajectory_xyz, scanned_frames)
    write_trajectory_extxyz(trajectory_extxyz, scanned_frames)
    write_scan_energy_table(energy_table, coordinate_values, energies)
    write_energy_profile(
        profile_path,
        coordinate_values,
        energies,
        xlabel=f"{coordinate.type} coordinate",
        title="Scan Energy Profile",
    )
    write_atoms(peak_path, ts_like_atoms)


def run_neb_directory(task: TaskDirectoryConfig) -> None:
    if task.initial_path is None or task.final_path is None:
        raise RxnFlowError(f"Task '{task.id}' must declare initial and final structures.")
    if task.intermediate_images is None or task.intermediate_images < 1:
        raise RxnFlowError(f"Task '{task.id}' must declare a positive intermediate_images count.")

    initial_atoms = read_task_structure(task.initial_path)
    final_atoms = read_task_structure(task.final_path)
    settings = task_directory_calculator_settings(task)
    output_dir = task.directory
    output_dir.mkdir(parents=True, exist_ok=True)
    image_dir = output_dir / "image"
    image_dir.mkdir(parents=True, exist_ok=True)

    apply_calculator_metadata(initial_atoms, settings)
    apply_calculator_metadata(final_atoms, settings)
    initial_optimized = optimize_endpoint_for_neb("initial", initial_atoms, output_dir, settings)
    final_optimized = optimize_endpoint_for_neb("final", final_atoms, output_dir, settings)

    images = [initial_optimized.copy()]
    for _ in range(task.intermediate_images):
        image = initial_optimized.copy()
        apply_calculator_metadata(image, settings)
        images.append(image)
    final_copy = final_optimized.copy()
    apply_calculator_metadata(final_copy, settings)
    images.append(final_copy)

    for image in images:
        image.calc = build_calculator_from_settings(settings)

    band = NEB(images, method="improvedtangent", climb=task.climb)
    band.interpolate()
    initial_band_structure = output_dir / "neb_initial_path.xyz"
    write_trajectory_xyz(initial_band_structure, images)

    neb_trajectory = output_dir / "neb.traj"
    neb_log = output_dir / "neb.log"
    neb_restart = output_dir / "neb.json"
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
            image_trajectory = image_dir / f"image_{image_index:02d}.traj"
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

    neb_frames = read_trajectory_frames(neb_trajectory)
    trajectory_xyz = output_dir / "neb_traj.xyz"
    trajectory_extxyz = output_dir / "neb_traj.extxyz"
    band_structure = output_dir / "neb_final_path.xyz"
    band_extxyz = output_dir / "neb_final_path.extxyz"
    energy_table = output_dir / "neb_energies.csv"
    profile_path = output_dir / "neb_energy_profile.png"
    peak_path = output_dir / "peak.xyz"

    write_trajectory_xyz(trajectory_xyz, neb_frames)
    write_trajectory_extxyz(trajectory_extxyz, neb_frames)
    write_trajectory_xyz(band_structure, snapped_images)
    write_trajectory_extxyz(band_extxyz, snapped_images)
    write_path_energy_table(energy_table, path_positions, energies)
    write_energy_profile(
        profile_path,
        path_positions,
        energies,
        xlabel="Distance along Reaction Path (A)",
        title="NEB Energy Profile",
    )
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


def read_task_structure(path: Path):
    atoms = read(path)
    atoms.info.clear()
    return atoms


def apply_calculator_metadata(atoms, settings: CalculatorSettings):
    apply_charge_multiplicity(atoms, settings.charge, settings.multiplicity)
    atoms.info["backend"] = settings.backend
    atoms.info["model"] = settings.model
    atoms.info["task_name"] = settings.task_name
    if settings.backend == "uma":
        atoms.info["spin"] = int(settings.multiplicity)
    return atoms


def optimize_endpoint_for_neb(prefix: str, atoms, output_dir: Path, settings: CalculatorSettings):
    frames = optimize_atoms(
        atoms,
        settings=settings,
        optimizer_name=DEFAULT_TASK_OPTIMIZER["optimize"],
        fmax=DEFAULT_TASK_FMAX["optimize"],
        steps=DEFAULT_TASK_STEPS["optimize"],
        trajectory_path=output_dir / f"{prefix}_opt.traj",
        log_path=output_dir / f"{prefix}_opt.log",
        restart_path=output_dir / f"{prefix}_opt.pckl",
    )
    energies = [frame.get_potential_energy() for frame in frames]
    final_atoms = frames[-1]
    write_atoms(output_dir / f"{prefix}_opt.xyz", final_atoms)
    write_trajectory_xyz(output_dir / f"{prefix}_opt_traj.xyz", frames)
    write_trajectory_extxyz(output_dir / f"{prefix}_opt_traj.extxyz", frames)
    write_energy_table(output_dir / f"{prefix}_opt_energies.csv", energies)
    return final_atoms


def optimize_atoms(
    atoms,
    *,
    settings: CalculatorSettings,
    optimizer_name: str,
    fmax: float,
    steps: int,
    trajectory_path: Path,
    log_path: Path,
    restart_path: Path,
):
    atoms.calc = build_calculator_from_settings(settings)
    optimizer = build_ase_optimizer(
        optimizer_name,
        atoms,
        trajectory=str(trajectory_path),
        logfile=str(log_path),
        restart=str(restart_path),
    )
    optimizer.run(fmax=fmax, steps=steps)
    return read_trajectory_frames_or_current(trajectory_path, atoms)


def build_ase_optimizer(name: str, atoms, **kwargs):
    optimizer_name = name.lower().replace("_", "")
    if optimizer_name == "bfgs":
        return BFGS(atoms, **kwargs)
    if optimizer_name == "lbfgs":
        return LBFGS(atoms, **kwargs)
    raise RxnFlowError(f"Unsupported ASE optimizer '{name}'. Supported optimizers: BFGS, LBFGS.")


def read_trajectory_frames_or_current(trajectory_path: Path, atoms):
    frames = read_trajectory_frames(trajectory_path)
    if frames:
        return frames
    energy = atoms.get_potential_energy()
    forces = atoms.get_forces()
    snapshot = atoms.copy()
    snapshot.calc = SinglePointCalculator(snapshot, energy=energy, forces=forces)
    return [snapshot]


def read_trajectory_frames(trajectory_path: Path):
    if trajectory_path.exists():
        frames = list(read(trajectory_path, index=":"))
        if frames:
            return frames
    return []


def cumulative_path_positions(images) -> list[float]:
    positions = [0.0]
    for previous, current in zip(images, images[1:], strict=False):
        delta = current.get_positions() - previous.get_positions()
        positions.append(positions[-1] + float(np.linalg.norm(delta)))
    return positions
