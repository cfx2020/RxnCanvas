"""Calculator base classes."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


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
