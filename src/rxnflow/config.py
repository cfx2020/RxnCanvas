"""Workflow YAML loading and validation."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from .errors import WorkflowConfigError
from .model import (
    VALID_CONSTRAINT_TYPES,
    VALID_SCAN_COORDINATE_TYPES,
    VALID_TASK_TYPES,
    Defaults,
    StructureNode,
    TaskConfig,
    WorkflowConfig,
    ReportConfig,
)


def load_workflow_config(path: str | Path) -> WorkflowConfig:
    source_path = Path(path).expanduser().resolve()
    try:
        with source_path.open("r", encoding="utf-8") as handle:
            raw = yaml.safe_load(handle) or {}
    except OSError as exc:
        raise WorkflowConfigError(f"Unable to read workflow config '{source_path}': {exc}") from exc
    if not isinstance(raw, dict):
        raise WorkflowConfigError("Workflow YAML must contain a top-level mapping.")
    config = WorkflowConfig(
        source_path=source_path,
        defaults=Defaults.from_dict(raw.get("defaults")),
        references=[StructureNode.from_dict(item) for item in raw.get("references", [])],
        nodes=[StructureNode.from_dict(item) for item in raw.get("nodes", [])],
        tasks=[TaskConfig.from_dict(item) for item in raw.get("tasks", [])],
        report=ReportConfig.from_dict(raw.get("report")),
    )
    validate_workflow_config(config)
    return config


def validate_workflow_config(config: WorkflowConfig) -> None:
    _validate_unique_ids(config)
    available_inputs = {item.id for item in config.references + config.nodes}
    completed_tasks: set[str] = set()
    for task in config.tasks:
        _validate_task_shape(task)
        _validate_task_references(task, available_inputs, completed_tasks)
        completed_tasks.add(task.id)
    if config.report.reference and config.report.reference not in available_inputs:
        raise WorkflowConfigError(
            f"Report reference '{config.report.reference}' must reference a declared reference or node."
        )
    _validate_report(config, completed_tasks)


def _validate_unique_ids(config: WorkflowConfig) -> None:
    seen: dict[str, str] = {}
    groups: list[tuple[str, list[Any]]] = [
        ("reference", config.references),
        ("node", config.nodes),
        ("task", config.tasks),
    ]
    for group_name, items in groups:
        for item in items:
            if item.id in seen:
                raise WorkflowConfigError(
                    f"Duplicate id '{item.id}' found in {group_name}; already declared as {seen[item.id]}."
                )
            seen[item.id] = group_name


def _validate_task_shape(task: TaskConfig) -> None:
    if task.type not in VALID_TASK_TYPES:
        raise WorkflowConfigError(f"Task '{task.id}' has unsupported type '{task.type}'.")
    if task.type == "optimize":
        if not task.input:
            raise WorkflowConfigError(f"Task '{task.id}' must declare 'input'.")
        return
    if task.type == "scan":
        if not task.input:
            raise WorkflowConfigError(f"Task '{task.id}' must declare 'input'.")
        if task.coordinate is None:
            raise WorkflowConfigError(f"Task '{task.id}' must declare one main scan coordinate.")
        _validate_scan_coordinate(task)
        _validate_constraints(task)
        return
    if task.type == "neb":
        if not task.initial or not task.final:
            raise WorkflowConfigError(f"Task '{task.id}' must declare both 'initial' and 'final'.")
        if task.images is None or task.images < 1:
            raise WorkflowConfigError(f"Task '{task.id}' must declare a positive 'images' count.")


def _validate_task_references(task: TaskConfig, available_inputs: set[str], completed_tasks: set[str]) -> None:
    allowed = available_inputs | completed_tasks
    if task.type in {"optimize", "scan"} and task.input not in allowed:
        raise WorkflowConfigError(f"Task '{task.id}' input '{task.input}' is unknown or not yet available.")
    if task.type == "neb":
        if task.initial not in allowed:
            raise WorkflowConfigError(
                f"Task '{task.id}' initial endpoint '{task.initial}' is unknown or not yet available."
            )
        if task.final not in allowed:
            raise WorkflowConfigError(
                f"Task '{task.id}' final endpoint '{task.final}' is unknown or not yet available."
            )


def _validate_scan_coordinate(task: TaskConfig) -> None:
    coordinate = task.coordinate
    if coordinate is None:
        return
    if coordinate.type not in VALID_SCAN_COORDINATE_TYPES:
        raise WorkflowConfigError(
            f"Task '{task.id}' scan coordinate type '{coordinate.type}' is unsupported."
        )
    expected_atoms = {"distance": 2, "angle": 3, "dihedral": 4}[coordinate.type]
    if len(coordinate.atoms) != expected_atoms:
        raise WorkflowConfigError(
            f"Task '{task.id}' scan coordinate '{coordinate.type}' expects {expected_atoms} atoms."
        )
    if coordinate.steps < 2:
        raise WorkflowConfigError(f"Task '{task.id}' scan coordinate must use at least 2 steps.")


def _validate_constraints(task: TaskConfig) -> None:
    for index, constraint in enumerate(task.constraints, start=1):
        if constraint.type not in VALID_CONSTRAINT_TYPES:
            raise WorkflowConfigError(
                f"Task '{task.id}' constraint #{index} type '{constraint.type}' is unsupported."
            )
        expected_atoms = {
            "freeze_atoms": None,
            "distance": 2,
            "angle": 3,
            "dihedral": 4,
        }[constraint.type]
        if expected_atoms is not None and len(constraint.atoms) != expected_atoms:
            raise WorkflowConfigError(
                f"Task '{task.id}' constraint #{index} expects {expected_atoms} atoms for type '{constraint.type}'."
            )
        if constraint.type == "freeze_atoms":
            if not constraint.atoms:
                raise WorkflowConfigError(f"Task '{task.id}' constraint #{index} must freeze at least one atom.")
        elif constraint.value is None:
            raise WorkflowConfigError(
                f"Task '{task.id}' constraint #{index} type '{constraint.type}' must declare 'value'."
            )


def _validate_report(config: WorkflowConfig, completed_tasks: set[str]) -> None:
    branch_ids: set[str] = set()
    for branch in config.report.branches:
        if branch.id in branch_ids:
            raise WorkflowConfigError(f"Duplicate report branch id '{branch.id}'.")
        branch_ids.add(branch.id)
        for task_id in branch.tasks:
            if task_id not in completed_tasks:
                raise WorkflowConfigError(
                    f"Report branch '{branch.id}' references unknown task '{task_id}'."
                )
