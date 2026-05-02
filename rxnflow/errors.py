"""Error and warning contracts for RxnFlow core services."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


RxnFlowErrorCode = str


@dataclass(frozen=True)
class RxnFlowError:
    code: RxnFlowErrorCode
    message: str
    target: str | None = None
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RxnFlowWarning:
    code: str
    message: str
    target: str | None = None
