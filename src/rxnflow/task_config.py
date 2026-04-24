"""Task-directory config loading."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from .errors import WorkflowConfigError
from .model import ConstraintSpec, ScanCoordinate, TaskDirectoryConfig


def load_task_directory(task_dir: str | Path) -> TaskDirectoryConfig:
    directory = Path(task_dir).expanduser().absolute()
    task_yaml = directory / "task.yaml"
    input_path = directory / "input.xyz"
    if not task_yaml.exists():
        raise WorkflowConfigError(f"Task directory '{directory}' is missing task.yaml.")
    if not input_path.exists():
        raise WorkflowConfigError(f"Task directory '{directory}' is missing input.xyz.")
    data = _read_task_yaml(task_yaml)
    coordinate = None
    if data.get("coordinate") is not None:
        coordinate = ScanCoordinate.from_dict(data["coordinate"])
    constraints = [ConstraintSpec.from_dict(item) for item in data.get("constraints", [])]
    return TaskDirectoryConfig(
        id=directory.name,
        directory=directory,
        input_path=input_path,
        type=str(data["type"]),
        charge=int(data["charge"]),
        multiplicity=int(data["multiplicity"]),
        backend=str(data.get("backend", "uma")),
        model=str(data.get("model", "uma-s-1p1")),
        device=str(data.get("device", "cuda")),
        task_name=str(data.get("task_name", "omol")),
        optimizer=str(data.get("optimizer", "lbfgs")),
        fmax=float(data.get("fmax", 0.05)),
        max_steps=int(data.get("max_steps", 200)),
        coordinate=coordinate,
        constraints=constraints,
        initial_path=None if data.get("initial") is None else (directory / str(data["initial"])).resolve(),
        final_path=None if data.get("final") is None else (directory / str(data["final"])).resolve(),
        images=None if data.get("images") is None else int(data["images"]),
    )


def _read_task_yaml(path: Path) -> dict[str, Any]:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except OSError as exc:
        raise WorkflowConfigError(f"Unable to read task config '{path}': {exc}") from exc
    if not isinstance(raw, dict):
        raise WorkflowConfigError("task.yaml must contain a mapping.")
    for key in ["type", "charge", "multiplicity"]:
        if key not in raw:
            raise WorkflowConfigError(f"task.yaml must declare '{key}'.")
    return raw
