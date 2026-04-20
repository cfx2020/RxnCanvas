"""Calculator abstractions and backend registry."""

from .base import CalculatorBackend, CalculatorSettings, ResolvedTaskSettings
from .factory import build_calculator, get_backend, resolve_task_settings

__all__ = [
    "CalculatorBackend",
    "CalculatorSettings",
    "ResolvedTaskSettings",
    "build_calculator",
    "get_backend",
    "resolve_task_settings",
]
