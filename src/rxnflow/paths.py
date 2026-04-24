"""Filesystem layout helpers."""

from __future__ import annotations

from pathlib import Path

from .model import WorkflowConfig


def project_root_from_task_dir(task_dir: Path) -> Path:
    task_dir = Path(task_dir).absolute()
    if task_dir.parent.name == "task":
        return task_dir.parent.parent
    return task_dir.parent


def task_root(project_root: Path) -> Path:
    return Path(project_root) / "task"


def report_root(project_root: Path) -> Path:
    return Path(project_root) / "report"


def database_root(project_root: Path) -> Path:
    return Path(project_root) / "database"


def database_path(project_root: Path) -> Path:
    return database_root(project_root) / "project.sqlite"


def objects_root(project_root: Path) -> Path:
    return database_root(project_root) / "objects"


def workflow_root(config: WorkflowConfig) -> Path:
    root = Path(config.defaults.output_root)
    if not root.is_absolute():
        root = (config.source_path.parent / root).resolve()
    return root


def runs_root(config: WorkflowConfig) -> Path:
    return workflow_root(config) / "runs"


def tasks_root(config: WorkflowConfig) -> Path:
    return runs_root(config) / "tasks"


def inputs_root(config: WorkflowConfig) -> Path:
    return runs_root(config) / "inputs"


def reports_root(config: WorkflowConfig) -> Path:
    return workflow_root(config) / "reports"


def task_dir(config: WorkflowConfig, task_id: str) -> Path:
    return tasks_root(config) / task_id
