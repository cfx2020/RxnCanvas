"""Standard XYZ and ASE extended XYZ parser plugin."""

from __future__ import annotations

from io import StringIO
import re
from typing import Any

from rxnflow.constants import EV_TO_HARTREE
from rxnflow.errors import RxnFlowError, RxnFlowWarning
from rxnflow.models import Atom3D, ChemicalObjectDraft, EnergyValue, Provenance
from rxnflow.result import Result, err, ok

from .contracts import ParseOptions, ParseResult, ParserCapability, RawFile, raw_file_suffix
from .io import read_raw_text

PARSER_TIME = "2026-05-02T00:00:00Z"
ENERGY_RE = re.compile(
    r"\bEnergy\s*=\s*([-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?)\s*(Hartree|Ha|eV)?",
    re.IGNORECASE,
)


class XyzPlugin:
    id = "xyz-ase"
    version = "0.1.0"

    def can_parse(self, raw_file: RawFile) -> ParserCapability:
        text_result = read_raw_text(raw_file)
        text = text_result.value if text_result.ok else ""
        first_lines = _first_nonempty_lines(text, 2)
        has_atom_count = bool(first_lines and first_lines[0].isdigit())
        is_xyz_name = raw_file_suffix(raw_file) == ".xyz"
        if len(first_lines) > 1 and _looks_like_extxyz_comment(first_lines[1]):
            return ParserCapability(True, "extxyz", 0.95, "Extended XYZ comment metadata detected.")
        if is_xyz_name and has_atom_count:
            return ParserCapability(True, "xyz", 0.85, "XYZ suffix and atom count detected.")
        if has_atom_count:
            return ParserCapability(True, "xyz", 0.65, "Atom count detected.")
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
        lines = _first_nonempty_lines(text, 2)
        if len(lines) > 1 and _looks_like_extxyz_comment(lines[1]):
            return _parse_extxyz(raw_file, text)
        return _parse_plain_xyz(raw_file, text, parser_id=self.id, parser_version=self.version)


def parse_xyz_frames(
    raw_file: RawFile,
    text: str,
    parser_id: str,
    parser_version: str,
    default_energy_unit: str | None = None,
) -> Result[ParseResult]:
    return _parse_plain_xyz(raw_file, text, parser_id, parser_version, default_energy_unit)


def _parse_plain_xyz(
    raw_file: RawFile,
    text: str,
    parser_id: str,
    parser_version: str,
    default_energy_unit: str | None = None,
) -> Result[ParseResult]:
    lines = [line.rstrip() for line in text.splitlines()]
    index = 0
    objects: list[ChemicalObjectDraft] = []
    warnings: list[RxnFlowWarning] = []
    while index < len(lines):
        if not lines[index].strip():
            index += 1
            continue
        try:
            atom_count = int(lines[index].strip())
        except ValueError:
            return err(
                RxnFlowError(
                    code="parse_failed",
                    message="XYZ frame must start with an atom count.",
                    target=raw_file.target(),
                )
            )
        comment_index = index + 1
        if comment_index >= len(lines):
            return _xyz_count_error(raw_file)
        comment = lines[comment_index].strip()
        atom_lines = lines[comment_index + 1 : comment_index + 1 + atom_count]
        if len(atom_lines) != atom_count or any(not line.strip() for line in atom_lines):
            return _xyz_count_error(raw_file)
        geometry_result = _parse_atom_lines(raw_file, atom_lines)
        if not geometry_result.ok or geometry_result.value is None:
            return geometry_result
        energy, energy_warning = _energy_from_comment(comment, raw_file.target(), default_energy_unit)
        if energy_warning is not None:
            warnings.append(energy_warning)
        energies = {"electronic": energy} if energy is not None else {}
        if energy is None:
            warnings.append(
                RxnFlowWarning(
                    code="missing_section",
                    message="XYZ frame does not include an electronic energy.",
                    target=raw_file.target(),
                )
            )
        objects.append(
            ChemicalObjectDraft(
                label=_label_from_comment(comment) or raw_file.name,
                geometry=geometry_result.value,
                energies=energies,
            )
        )
        index = comment_index + 1 + atom_count

    if not objects:
        return err(
            RxnFlowError(
                code="parse_failed",
                message="XYZ input does not contain any frames.",
                target=raw_file.target(),
            )
        )
    return ok(
        ParseResult(
            objects=tuple(objects),
            provenance=Provenance(raw_file.id, parser_id, parser_version, PARSER_TIME),
        ),
        warnings=tuple(warnings),
    )


def _parse_extxyz(raw_file: RawFile, text: str) -> Result[ParseResult]:
    try:
        from ase.io import read
    except ImportError as exc:
        return err(
            RxnFlowError(
                code="internal_error",
                message=f"ASE is required to parse extxyz files: {exc}.",
                target=raw_file.target(),
            )
        )
    try:
        frames = read(StringIO(text), format="extxyz", index=":")
    except Exception as exc:  # ASE raises several parser-specific exception types.
        return err(
            RxnFlowError(
                code="parse_failed",
                message=f"ASE failed to parse extxyz content: {exc}.",
                target=raw_file.target(),
            )
        )
    if not isinstance(frames, list):
        frames = [frames]
    objects: list[ChemicalObjectDraft] = []
    warnings: list[RxnFlowWarning] = []
    for frame_index, atoms in enumerate(frames):
        geometry = tuple(
            Atom3D(symbol, float(x), float(y), float(z))
            for symbol, (x, y, z) in zip(atoms.get_chemical_symbols(), atoms.get_positions())
        )
        info = dict(atoms.info)
        energy = _extxyz_energy(atoms, info, raw_file.target(), warnings)
        energies = {"electronic": energy} if energy is not None else {}
        objects.append(
            ChemicalObjectDraft(
                label=str(info.get("label") or f"{raw_file.name}: frame {frame_index}"),
                charge=_optional_int(info.get("charge")),
                spin_multiplicity=_optional_int(
                    info.get("spin_multiplicity", info.get("spin"))
                ),
                geometry=geometry,
                energies=energies,
            )
        )
    return ok(
        ParseResult(
            objects=tuple(objects),
            provenance=Provenance(raw_file.id, "xyz-ase", "0.1.0", PARSER_TIME),
        ),
        warnings=tuple(warnings),
    )


def _parse_atom_lines(raw_file: RawFile, atom_lines: list[str]) -> Result[tuple[Atom3D, ...]]:
    atoms: list[Atom3D] = []
    for offset, line in enumerate(atom_lines):
        parts = line.split()
        if len(parts) < 4:
            return err(
                RxnFlowError(
                    code="parse_failed",
                    message="XYZ atom line must contain element and x/y/z coordinates.",
                    target=f"{raw_file.target()}:{offset + 1}",
                )
            )
        try:
            atoms.append(Atom3D(parts[0], float(parts[1]), float(parts[2]), float(parts[3])))
        except ValueError as exc:
            return err(
                RxnFlowError(
                    code="parse_failed",
                    message=f"XYZ coordinate is not numeric: {exc}.",
                    target=f"{raw_file.target()}:{offset + 1}",
                )
            )
    return ok(tuple(atoms))


def _energy_from_comment(
    comment: str,
    target: str,
    default_energy_unit: str | None = None,
) -> tuple[EnergyValue | None, RxnFlowWarning | None]:
    match = ENERGY_RE.search(comment)
    if match is None:
        return None, None
    value = float(match.group(1))
    unit = (match.group(2) or default_energy_unit or "").lower()
    if unit in {"hartree", "ha"}:
        return EnergyValue(value, "hartree", reference=comment), None
    if unit == "ev":
        return EnergyValue(value * EV_TO_HARTREE, "hartree", reference="converted from eV"), None
    warning = RxnFlowWarning(
        code="unit_assumed",
        message="XYZ energy comment did not include a unit; assumed hartree.",
        target=target,
    )
    return EnergyValue(value, "hartree", reference=comment), warning


def _extxyz_energy(
    atoms: Any,
    info: dict[str, Any],
    target: str,
    warnings: list[RxnFlowWarning],
) -> EnergyValue | None:
    raw_energy = info.get("energy")
    calc = getattr(atoms, "calc", None)
    results = getattr(calc, "results", None)
    if raw_energy is None and isinstance(results, dict):
        raw_energy = results.get("energy")
    if raw_energy is None:
        warnings.append(
            RxnFlowWarning(
                code="missing_section",
                message="extxyz frame does not include energy metadata.",
                target=target,
            )
        )
        return None
    try:
        energy_ev = float(raw_energy)
    except (TypeError, ValueError):
        warnings.append(
            RxnFlowWarning(
                code="ambiguous_value",
                message="extxyz energy metadata is not numeric.",
                target=target,
            )
        )
        return None
    warnings.append(
        RxnFlowWarning(
            code="unit_assumed",
            message="extxyz energy metadata was treated as eV and converted to hartree.",
            target=target,
        )
    )
    return EnergyValue(energy_ev * EV_TO_HARTREE, "hartree", reference="extxyz energy converted from eV")


def _first_nonempty_lines(text: str, count: int) -> list[str]:
    lines: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            lines.append(stripped)
        if len(lines) == count:
            break
    return lines


def _looks_like_extxyz_comment(comment: str) -> bool:
    return "Properties=" in comment or "Lattice=" in comment


def _label_from_comment(comment: str) -> str:
    match = re.match(
        r"^\s*((?:(?:Iter|Iteration)\s+\d+\s+)?(?:Image|Frame)\s+\d+|Iteration\s+\d+)\b",
        comment,
        re.IGNORECASE,
    )
    if match is not None:
        return match.group(1)
    return comment


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _xyz_count_error(raw_file: RawFile) -> Result[ParseResult]:
    return err(
        RxnFlowError(
            code="parse_failed",
            message="XYZ atom count does not match the number of coordinate lines.",
            target=raw_file.target(),
        )
    )
