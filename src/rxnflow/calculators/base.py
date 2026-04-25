"""Calculator base classes."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from ..model import Defaults, StructureNode, TaskConfig


@dataclass(slots=True)
class ResolvedTaskSettings:
    backend: str
    model: str
    device: str
    task_name: str
    optimizer: str
    fmax: float
    steps: int
    charge: int
    multiplicity: int


@dataclass(slots=True)
class CalculatorSettings:
    backend: str
    model: str
    device: str
    task_name: str
    charge: int
    multiplicity: int
    service_profile: str = "win11local-uma"
    service_mode: str = "machine"
    service_host: str = "127.0.0.1"
    service_port: int = 8765


class CalculatorBackend(ABC):
    """Backend that can build an ASE-compatible calculator object."""

    name: str

    @abstractmethod
    def build(self, settings: CalculatorSettings):
        """Create a calculator object for the given task settings."""


def merge_task_settings(defaults: Defaults, task: TaskConfig, input_node: StructureNode) -> ResolvedTaskSettings:
    return ResolvedTaskSettings(
        backend=task.backend or defaults.backend,
        model=task.model or defaults.model,
        device=task.device or defaults.device,
        task_name=task.task_name or defaults.task_name,
        optimizer=task.optimizer or defaults.optimizer,
        fmax=task.fmax if task.fmax is not None else defaults.fmax,
        steps=task.steps if task.steps is not None else defaults.steps,
        charge=task.charge if task.charge is not None else input_node.charge,
        multiplicity=task.multiplicity if task.multiplicity is not None else input_node.multiplicity,
    )
