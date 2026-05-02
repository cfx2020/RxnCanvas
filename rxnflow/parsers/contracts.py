"""Shared contracts for parser plugins."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol

from rxnflow.models import ChemicalObjectDraft, Provenance
from rxnflow.result import Result


ParserFormat = Literal[
    "gaussian-log",
    "orca-output",
    "xyz",
    "extxyz",
    "maple-output",
    "maple-xyz",
    "unknown",
]

FramePolicy = Literal["all", "first", "last"]


@dataclass(frozen=True)
class RawFile:
    id: str
    name: str
    path: str | os.PathLike[str] | None = None
    content: str | bytes | None = None
    mime_type: str | None = None
    size: int | None = None

    def target(self) -> str:
        if self.path is not None:
            return str(self.path)
        return self.id


@dataclass(frozen=True)
class ParserCapability:
    supported: bool
    format: ParserFormat = "unknown"
    confidence: float = 0.0
    reason: str | None = None


@dataclass(frozen=True)
class ParseOptions:
    expected_format: ParserFormat | None = None
    strict: bool = False
    frame_policy: FramePolicy = "all"


@dataclass(frozen=True)
class ParseResult:
    objects: tuple[ChemicalObjectDraft, ...]
    provenance: Provenance


class ParserPlugin(Protocol):
    id: str
    version: str

    def can_parse(self, raw_file: RawFile) -> ParserCapability:
        ...

    def parse(
        self,
        raw_file: RawFile,
        options: ParseOptions | None = None,
    ) -> Result[ParseResult]:
        ...


def raw_file_suffix(raw_file: RawFile) -> str:
    return Path(raw_file.name).suffix.lower()
