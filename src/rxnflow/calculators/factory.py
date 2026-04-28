"""Backend registry."""

from __future__ import annotations

from ..errors import RxnFlowError
from .base import CalculatorSettings
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
        raise RxnFlowError(f"Unknown calculator backend '{name}'.") from exc


def build_calculator_from_settings(settings: CalculatorSettings):
    backend = get_backend(settings.backend)
    return backend.build(settings)
