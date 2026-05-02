"""Result container used at module boundaries."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Generic, TypeVar

from .errors import RxnFlowError, RxnFlowWarning

T = TypeVar("T")


@dataclass(frozen=True)
class Result(Generic[T]):
    ok: bool
    value: T | None = None
    error: RxnFlowError | None = None
    warnings: tuple[RxnFlowWarning, ...] = field(default_factory=tuple)


def ok(value: T, warnings: tuple[RxnFlowWarning, ...] = ()) -> Result[T]:
    return Result(ok=True, value=value, warnings=warnings)


def err(error: RxnFlowError, warnings: tuple[RxnFlowWarning, ...] = ()) -> Result[T]:
    return Result(ok=False, error=error, warnings=warnings)
