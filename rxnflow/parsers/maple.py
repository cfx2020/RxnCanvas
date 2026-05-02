"""Parser plugin for MAPLE output files and MAPLE-style XYZ trajectories."""

from __future__ import annotations

import re

from rxnflow.errors import RxnFlowError, RxnFlowWarning
from rxnflow.models import Atom3D, ChemicalObjectDraft, EnergyValue, Provenance
from rxnflow.result import Result, err, ok

from .contracts import ParseOptions, ParseResult, ParserCapability, RawFile, raw_file_suffix
from .io import read_raw_text
from .xyz import PARSER_TIME, parse_xyz_frames

MAPLE_BANNER_MARKERS = ("M   A   P   L   E", "MAchine-learning Potential for Landscape Exploration")
MAPLE_XYZ_COMMENT_RE = re.compile(r"^\s*(Image|Frame)\s+\d+\s+Energy\s*=", re.IGNORECASE)
MAPLE_ENERGY_RE = re.compile(
    r"Energy:\s*([-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?)\s*(Hartree)?",
    re.IGNORECASE,
)
MAPLE_MODEL_RE = re.compile(r"^\s*model\s*:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE)
MAPLE_TASK_RE = re.compile(r"^\s*Task:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE)
MAPLE_COORD_RE = re.compile(
    r"^\s*\d+\s+([A-Z][a-z]?)\s+([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s*$"
)


class MapleOutputPlugin:
    id = "maple-output"
    version = "0.1.0"

    def can_parse(self, raw_file: RawFile) -> ParserCapability:
        text_result = read_raw_text(raw_file)
        text = text_result.value if text_result.ok and text_result.value is not None else ""
        head = text[:4000]
        if any(marker in head for marker in MAPLE_BANNER_MARKERS):
            return ParserCapability(True, "maple-output", 0.98, "MAPLE banner detected.")
        if raw_file_suffix(raw_file) == ".xyz" and _looks_like_maple_xyz(text):
            return ParserCapability(True, "maple-xyz", 0.96, "MAPLE Image/Frame energy comments detected.")
        return ParserCapability(False)

    def parse(
        self,
        raw_file: RawFile,
        options: ParseOptions | None = None,
    ) -> Result[ParseResult]:
        text_result = read_raw_text(raw_file)
        if not text_result.ok or text_result.value is None:
            return text_result
        text = text_result.value
        if _looks_like_maple_xyz(text):
            return parse_xyz_frames(
                raw_file,
                text,
                parser_id="maple-output",
                parser_version=self.version,
                default_energy_unit="hartree",
            )
        return _parse_maple_out(raw_file, text, self.version)


def _parse_maple_out(raw_file: RawFile, text: str, parser_version: str) -> Result[ParseResult]:
    if not any(marker in text[:8000] for marker in MAPLE_BANNER_MARKERS):
        return err(
            RxnFlowError(
                code="parse_failed",
                message="MAPLE output banner was not found.",
                target=raw_file.target(),
            )
        )
    geometry = _last_coordinate_block(text)
    if not geometry:
        return err(
            RxnFlowError(
                code="parse_failed",
                message="MAPLE output does not contain a coordinate block.",
                target=raw_file.target(),
            )
        )

    warnings: list[RxnFlowWarning] = []
    energy = _last_maple_energy(text, raw_file.target(), warnings)
    energies = {"electronic": energy} if energy is not None else {}
    if energy is None:
        warnings.append(
            RxnFlowWarning(
                code="missing_section",
                message="MAPLE output does not contain an electronic energy.",
                target=raw_file.target(),
            )
        )

    task = _first_group(MAPLE_TASK_RE, text)
    model = _first_group(MAPLE_MODEL_RE, text)
    label = f"MAPLE {task}".strip() if task else raw_file.name
    method = " ".join(part for part in (task, model) if part) or None
    return ok(
        ParseResult(
            objects=(
                ChemicalObjectDraft(
                    label=label,
                    method=method,
                    geometry=tuple(geometry),
                    energies=energies,
                ),
            ),
            provenance=Provenance(raw_file.id, "maple-output", parser_version, PARSER_TIME),
        ),
        warnings=tuple(warnings),
    )


def _last_coordinate_block(text: str) -> list[Atom3D]:
    blocks: list[list[Atom3D]] = []
    current: list[Atom3D] = []
    for line in text.splitlines():
        match = MAPLE_COORD_RE.match(line)
        if match is None:
            if current:
                blocks.append(current)
                current = []
            continue
        current.append(
            Atom3D(
                match.group(1),
                float(match.group(2)),
                float(match.group(3)),
                float(match.group(4)),
            )
        )
    if current:
        blocks.append(current)
    return blocks[-1] if blocks else []


def _last_maple_energy(
    text: str,
    target: str,
    warnings: list[RxnFlowWarning],
) -> EnergyValue | None:
    matches = list(MAPLE_ENERGY_RE.finditer(text))
    if not matches:
        return None
    match = matches[-1]
    value = float(match.group(1))
    unit = match.group(2)
    if unit is None:
        warnings.append(
            RxnFlowWarning(
                code="unit_assumed",
                message="MAPLE energy line did not include a unit; assumed hartree.",
                target=target,
            )
        )
    return EnergyValue(value, "hartree", reference=match.group(0).strip())


def _looks_like_maple_xyz(text: str) -> bool:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return len(lines) >= 2 and lines[0].isdigit() and MAPLE_XYZ_COMMENT_RE.search(lines[1]) is not None


def _first_group(pattern: re.Pattern[str], text: str) -> str | None:
    match = pattern.search(text)
    if match is None:
        return None
    return match.group(1).strip()
