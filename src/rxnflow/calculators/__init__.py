"""Calculator abstractions and backend registry."""

from .base import CalculatorBackend, CalculatorSettings
from .factory import build_calculator_from_settings, get_backend

__all__ = [
    "CalculatorBackend",
    "CalculatorSettings",
    "build_calculator_from_settings",
    "get_backend",
]
