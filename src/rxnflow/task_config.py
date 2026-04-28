"""Task-directory config loading."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from .errors import RxnFlowError
from .model import (
    DEFAULT_TASK_FMAX,
    DEFAULT_TASK_OPTIMIZER,
    DEFAULT_TASK_STEPS,
    VALID_TASK_TYPES,
    ConstraintSpec,
    ScanCoordinate,
    TaskDirectoryConfig,
)


def load_task_directory(task_dir: str | Path) -> TaskDirectoryConfig:
    directory = Path(task_dir).expanduser().absolute()
    task_yaml = directory / "task.yaml"
    if not task_yaml.exists():
        raise RxnFlowError(f"Task directory '{directory}' is missing task.yaml.")
    data = _read_task_yaml(task_yaml)
    task_type = str(data["type"])
    if task_type not in VALID_TASK_TYPES:
        raise RxnFlowError(f"Task directory '{directory}' has unsupported type '{task_type}'.")
    input_path = _resolve_required_input(directory, task_type)
    initial_path = None if data.get("initial") is None else (directory / str(data["initial"])).resolve()
    final_path = None if data.get("final") is None else (directory / str(data["final"])).resolve()
    if task_type == "neb":
        if initial_path is None or final_path is None:
            raise RxnFlowError(f"Task directory '{directory}' must declare initial and final structures.")
        if not initial_path.exists():
            raise RxnFlowError(f"Task directory '{directory}' is missing initial structure '{initial_path.name}'.")
        if not final_path.exists():
            raise RxnFlowError(f"Task directory '{directory}' is missing final structure '{final_path.name}'.")
        intermediate_images = (
            None if data.get("intermediate_images") is None else int(data["intermediate_images"])
        )
        if intermediate_images is None or intermediate_images < 1:
            raise RxnFlowError(
                f"Task directory '{directory}' must declare a positive intermediate_images count."
            )
    else:
        intermediate_images = None
    coordinate = None
    if data.get("coordinate") is not None:
        coordinate = ScanCoordinate.from_dict(data["coordinate"])
    constraints = [ConstraintSpec.from_dict(item) for item in data.get("constraints", [])]
    return TaskDirectoryConfig(
        id=directory.name,
        directory=directory,
        input_path=input_path,
        type=task_type,
        charge=int(data["charge"]),
        multiplicity=int(data["multiplicity"]),
        backend=str(data.get("backend", "uma")),
        model=str(data.get("model", "uma-s-1p1")),
        device=str(data.get("device", "cuda")),
        task_name=str(data.get("task_name", "omol")),
        optimizer=str(data.get("optimizer", DEFAULT_TASK_OPTIMIZER[task_type])),
        fmax=float(data.get("fmax", DEFAULT_TASK_FMAX[task_type])),
        steps=int(data.get("steps", DEFAULT_TASK_STEPS[task_type])),
        coordinate=coordinate,
        constraints=constraints,
        initial_path=initial_path,
        final_path=final_path,
        intermediate_images=intermediate_images,
        climb=bool(data.get("climb", False)),
    )


def _resolve_required_input(directory: Path, task_type: str) -> Path | None:
    if task_type == "neb":
        return None
    input_path = directory / "input.xyz"
    if not input_path.exists():
        raise RxnFlowError(f"Task directory '{directory}' is missing input.xyz.")
    return input_path


def _read_task_yaml(path: Path) -> dict[str, Any]:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except OSError as exc:
        raise RxnFlowError(f"Unable to read task config '{path}': {exc}") from exc
    if not isinstance(raw, dict):
        raise RxnFlowError("task.yaml must contain a mapping.")
    for key in ["type", "charge", "multiplicity"]:
        if key not in raw:
            raise RxnFlowError(f"task.yaml must declare '{key}'.")
    return raw
