"""Filesystem layout helpers."""

from __future__ import annotations

from pathlib import Path

from .model import WorkflowConfig


def workflow_root(config: WorkflowConfig) -> Path:
    root = Path(config.defaults.output_root)
    if not root.is_absolute():
        root = (config.source_path.parent / root).resolve()
    return root


def runs_root(config: WorkflowConfig) -> Path:
    return workflow_root(config) / "runs" / "tasks"


def reports_root(config: WorkflowConfig) -> Path:
    return workflow_root(config) / "reports"


def task_dir(config: WorkflowConfig, task_id: str) -> Path:
    return runs_root(config) / task_id
