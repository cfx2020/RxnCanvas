"""Backend registry and task-setting resolution."""

from __future__ import annotations

from ..errors import WorkflowConfigError
from ..model import StructureNode, TaskConfig, WorkflowConfig
from .base import CalculatorSettings, merge_task_settings
from .backends.fake import FakeBackend
from .backends.uma import UmaBackend

BACKENDS = {
    "fake": FakeBackend(),
    "uma": UmaBackend(),
}


def get_backend(name: str):
    try:
        return BACKENDS[name]
    except KeyError as exc:
        raise WorkflowConfigError(f"Unknown calculator backend '{name}'.") from exc


def resolve_task_settings(config: WorkflowConfig, task: TaskConfig, input_node: StructureNode) -> CalculatorSettings:
    resolved = merge_task_settings(config.defaults, task, input_node)
    return CalculatorSettings(
        backend=resolved.backend,
        model=resolved.model,
        device=resolved.device,
        task_name=resolved.task_name,
        charge=resolved.charge,
        multiplicity=resolved.multiplicity,
    )


def build_calculator(config: WorkflowConfig, task: TaskConfig, input_node: StructureNode):
    settings = resolve_task_settings(config, task, input_node)
    backend = get_backend(settings.backend)
    return backend.build(settings)
