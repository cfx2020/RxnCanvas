"""Fake backend used by tests."""

from __future__ import annotations

import numpy as np
from ase.calculators.calculator import Calculator, all_changes

from ..base import CalculatorBackend, CalculatorSettings


class FakeCalculator(Calculator):
    implemented_properties = ["energy", "forces"]

    def __init__(self, settings: CalculatorSettings, spring_constant: float = 1.0):
        super().__init__()
        self.settings = settings
        self.spring_constant = spring_constant

    def calculate(self, atoms=None, properties=("energy", "forces"), system_changes=all_changes):
        super().calculate(atoms, properties, system_changes)
        positions = self.atoms.get_positions()
        energy = 0.5 * self.spring_constant * float(np.sum(positions**2))
        forces = -self.spring_constant * positions
        self.results["energy"] = energy
        self.results["forces"] = forces


class FakeBackend(CalculatorBackend):
    name = "fake"

    def build(self, settings: CalculatorSettings) -> FakeCalculator:
        return FakeCalculator(settings=settings)
