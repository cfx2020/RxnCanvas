"""cclib-backed Gaussian and ORCA parser plugins."""

from __future__ import annotations

from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Callable

from rxnflow.constants import EV_TO_HARTREE
from rxnflow.errors import RxnFlowError, RxnFlowWarning
from rxnflow.models import Atom3D, ChemicalObjectDraft, EnergyValue, Provenance
from rxnflow.result import Result, err, ok

from .contracts import ParseOptions, ParseResult, ParserCapability, RawFile, raw_file_suffix
from .io import read_raw_text
from .xyz import PARSER_TIME

CclibBackend = Callable[[RawFile], Any]


class _CclibPlugin:
    version = "0.1.0"

    def __init__(
        self,
        parser_id: str,
        parser_format: str,
        markers: tuple[str, ...],
        suffixes: tuple[str, ...],
        backend: CclibBackend | None = None,
    ) -> None:
        self.id = parser_id
        self._format = parser_format
        self._markers = markers
        self._suffixes = suffixes
        self._backend = backend or _ccread_raw_file

    def can_parse(self, raw_file: RawFile) -> ParserCapability:
        text_result = read_raw_text(raw_file)
        text = text_result.value or "" if text_result.ok else ""
        lowered = text[:8000].lower()
        if any(marker.lower() in lowered for marker in self._markers):
            return ParserCapability(True, self._format, 0.9, "Program marker detected.")
        if raw_file_suffix(raw_file) in self._suffixes:
            return ParserCapability(True, self._format, 0.55, "Known computational output suffix.")
        return ParserCapability(False)

    def parse(
        self,
        raw_file: RawFile,
        options: ParseOptions | None = None,
    ) -> Result[ParseResult]:
        try:
            data = self._backend(raw_file)
        except FileNotFoundError as exc:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message=f"RawFile path does not exist: {exc}.",
                    target=raw_file.target(),
                )
            )
        except Exception as exc:
            return err(
                RxnFlowError(
                    code="parse_failed",
                    message=f"cclib failed to parse output: {exc}.",
                    target=raw_file.target(),
                )
            )
        if data is None:
            return err(
                RxnFlowError(
                    code="parse_failed",
                    message="cclib did not return parsed data.",
                    target=raw_file.target(),
                )
            )

        mapped = _map_cclib_data(raw_file, data)
        if not mapped.ok:
            return mapped
        return ok(
            ParseResult(
                objects=(mapped.value,),
                provenance=Provenance(raw_file.id, self.id, self.version, PARSER_TIME),
            ),
            warnings=mapped.warnings,
        )


class GaussianLogPlugin(_CclibPlugin):
    def __init__(self, backend: CclibBackend | None = None) -> None:
        super().__init__(
            parser_id="gaussian-log-cclib",
            parser_format="gaussian-log",
            markers=("Gaussian", "Entering Gaussian System"),
            suffixes=(".log", ".out"),
            backend=backend,
        )


class OrcaOutputPlugin(_CclibPlugin):
    def __init__(self, backend: CclibBackend | None = None) -> None:
        super().__init__(
            parser_id="orca-output-cclib",
            parser_format="orca-output",
            markers=("O   R   C   A", "ORCA TERMINATED"),
            suffixes=(".out", ".orca"),
            backend=backend,
        )


def _ccread_raw_file(raw_file: RawFile) -> Any:
    import cclib

    if raw_file.path is not None:
        path = Path(raw_file.path)
        if not path.is_file():
            raise FileNotFoundError(path)
        return cclib.io.ccread(str(path))
    text_result = read_raw_text(raw_file)
    if not text_result.ok or text_result.value is None:
        raise ValueError(text_result.error.message if text_result.error else "RawFile has no content.")
    suffix = Path(raw_file.name).suffix or ".out"
    with NamedTemporaryFile("w", encoding="utf-8", suffix=suffix, delete=True) as handle:
        handle.write(text_result.value)
        handle.flush()
        return cclib.io.ccread(handle.name)


def _map_cclib_data(raw_file: RawFile, data: Any) -> Result[ChemicalObjectDraft]:
    warnings: list[RxnFlowWarning] = []
    geometry_result = _geometry_from_cclib(raw_file, data)
    if not geometry_result.ok or geometry_result.value is None:
        return geometry_result

    energies: dict[str, EnergyValue] = {}
    scfenergies = getattr(data, "scfenergies", None)
    if scfenergies is not None and len(scfenergies) > 0:
        energies["electronic"] = EnergyValue(
            float(scfenergies[-1]) * EV_TO_HARTREE,
            "hartree",
            reference="cclib scfenergies converted from eV",
        )
    else:
        warnings.append(
            RxnFlowWarning(
                code="missing_section",
                message="cclib data does not include scfenergies.",
                target=raw_file.target(),
            )
        )

    return ok(
        ChemicalObjectDraft(
            label=raw_file.name,
            charge=_optional_int(getattr(data, "charge", None)),
            spin_multiplicity=_optional_int(getattr(data, "mult", None)),
            method=_method_from_metadata(getattr(data, "metadata", {})),
            geometry=geometry_result.value,
            energies=energies,
        ),
        warnings=tuple(warnings),
    )


def _geometry_from_cclib(raw_file: RawFile, data: Any) -> Result[tuple[Atom3D, ...]]:
    atomcoords = getattr(data, "atomcoords", None)
    atomnos = getattr(data, "atomnos", None)
    if atomcoords is None or atomnos is None:
        return err(
            RxnFlowError(
                code="parse_failed",
                message="cclib data must include atomcoords and atomnos.",
                target=raw_file.target(),
            )
        )
    last_coords = atomcoords[-1]
    if len(last_coords) != len(atomnos):
        return err(
            RxnFlowError(
                code="parse_failed",
                message="cclib atomcoords and atomnos lengths do not match.",
                target=raw_file.target(),
            )
        )
    return ok(
        tuple(
            Atom3D(_symbol_from_atomic_number(int(number)), float(x), float(y), float(z))
            for number, (x, y, z) in zip(atomnos, last_coords)
        )
    )


def _symbol_from_atomic_number(number: int) -> str:
    try:
        import periodictable

        return periodictable.elements[number].symbol
    except Exception:
        if 0 < number < len(_ELEMENTS):
            return _ELEMENTS[number]
        return f"E{number}"


def _method_from_metadata(metadata: Any) -> str | None:
    if not isinstance(metadata, dict):
        return None
    methods = metadata.get("methods")
    if isinstance(methods, (list, tuple)) and methods:
        return str(methods[-1])
    for key in ("functional", "method", "package"):
        if key in metadata:
            return str(metadata[key])
    return None


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


_ELEMENTS = (
    "",
    "H",
    "He",
    "Li",
    "Be",
    "B",
    "C",
    "N",
    "O",
    "F",
    "Ne",
    "Na",
    "Mg",
    "Al",
    "Si",
    "P",
    "S",
    "Cl",
    "Ar",
    "K",
    "Ca",
    "Sc",
    "Ti",
    "V",
    "Cr",
    "Mn",
    "Fe",
    "Co",
    "Ni",
    "Cu",
    "Zn",
    "Ga",
    "Ge",
    "As",
    "Se",
    "Br",
    "Kr",
    "Rb",
    "Sr",
    "Y",
    "Zr",
    "Nb",
    "Mo",
    "Tc",
    "Ru",
    "Rh",
    "Pd",
    "Ag",
    "Cd",
    "In",
    "Sn",
    "Sb",
    "Te",
    "I",
    "Xe",
)
