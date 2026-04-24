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
        if self.settings.model == "fake-distance-barrier":
            energy, forces = _distance_barrier_energy_and_forces(positions)
        else:
            energy = 0.5 * self.spring_constant * float(np.sum(positions**2))
            forces = -self.spring_constant * positions
        self.results["energy"] = energy
        self.results["forces"] = forces


class FakeBackend(CalculatorBackend):
    name = "fake"

    def build(self, settings: CalculatorSettings) -> FakeCalculator:
        return FakeCalculator(settings=settings)


def _distance_barrier_energy_and_forces(positions):
    if len(positions) < 2:
        energy = 0.0
        forces = np.zeros_like(positions)
        return energy, forces

    vector = positions[1] - positions[0]
    distance = float(np.linalg.norm(vector))
    if distance == 0.0:
        direction = np.zeros(3)
    else:
        direction = vector / distance

    energy = (distance - 1.0) ** 2 * (distance - 3.0) ** 2
    derivative = 2.0 * (distance - 1.0) * (distance - 3.0) * (2.0 * distance - 4.0)
    pair_force = -derivative * direction

    forces = np.zeros_like(positions)
    forces[0] = -pair_force
    forces[1] = pair_force
    return float(energy), forces
