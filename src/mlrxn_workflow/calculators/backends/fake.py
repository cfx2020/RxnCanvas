"""Fake backend used by tests."""

from __future__ import annotations

from dataclasses import dataclass

from ..base import CalculatorBackend, CalculatorSettings


@dataclass(slots=True)
class FakeCalculator:
    backend: str
    model: str
    device: str
    task_name: str
    charge: int
    multiplicity: int


class FakeBackend(CalculatorBackend):
    name = "fake"

    def build(self, settings: CalculatorSettings) -> FakeCalculator:
        return FakeCalculator(
            backend=settings.backend,
            model=settings.model,
            device=settings.device,
            task_name=settings.task_name,
            charge=settings.charge,
            multiplicity=settings.multiplicity,
        )
