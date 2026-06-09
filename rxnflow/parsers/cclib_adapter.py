"""cclib-backed Gaussian and ORCA parser plugins."""

from __future__ import annotations

from pathlib import Path
import re
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
        except (ImportError, ModuleNotFoundError) as exc:
            if self._format == "gaussian-log":
                return _parse_gaussian_text_fallback(raw_file, self.id, self.version, exc)
            return err(
                RxnFlowError(
                    code="parse_failed",
                    message=f"cclib is required to parse this output: {exc}.",
                    target=raw_file.target(),
                )
            )
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
        scf_hartree = float(scfenergies[-1]) * EV_TO_HARTREE
        energies["electronic"] = EnergyValue(
            scf_hartree,
            "hartree",
            reference="cclib scfenergies converted from eV",
        )
        if _looks_like_solution_file(raw_file.name):
            energies["esol"] = EnergyValue(
                scf_hartree,
                "hartree",
                reference="solution electronic energy from cclib scfenergies converted from eV",
            )
        else:
            energies["egas"] = EnergyValue(
                scf_hartree,
                "hartree",
                reference="gas electronic energy from cclib scfenergies converted from eV",
            )
    else:
        warnings.append(
            RxnFlowWarning(
                code="missing_section",
                message="cclib data does not include scfenergies.",
                target=raw_file.target(),
            )
        )

    thermochemistry: dict[str, EnergyValue] = {}
    freeenergy = getattr(data, "freeenergy", None)
    if freeenergy is not None:
        try:
            ggas_hartree = float(freeenergy)
            thermochemistry["ggas"] = EnergyValue(
                ggas_hartree,
                "hartree",
                reference="cclib freeenergy",
            )
            thermochemistry["ggas_1m"] = EnergyValue(
                ggas_hartree + STANDARD_STATE_1M_HARTREE,
                "hartree",
                reference="cclib freeenergy plus 1M standard-state correction",
            )
        except (TypeError, ValueError):
            pass

    _apply_gaussian_text_energy_overrides(raw_file, energies, thermochemistry)

    return ok(
        ChemicalObjectDraft(
            label=raw_file.name,
            charge=_optional_int(getattr(data, "charge", None)),
            spin_multiplicity=_optional_int(getattr(data, "mult", None)),
            method=_method_from_metadata(getattr(data, "metadata", {})),
            geometry=geometry_result.value,
            energies=energies,
            thermochemistry=thermochemistry,
        ),
        warnings=tuple(warnings),
    )


STANDARD_STATE_1M_HARTREE = 0.003019


def _apply_gaussian_text_energy_overrides(
    raw_file: RawFile,
    energies: dict[str, EnergyValue],
    thermochemistry: dict[str, EnergyValue],
) -> None:
    """Prefer exact Gaussian Hartree values over cclib's eV conversion."""

    text_result = read_raw_text(raw_file)
    if not text_result.ok or text_result.value is None:
        return
    text = text_result.value
    scf_hartree = _last_float_match(_SCF_DONE_PATTERN, text)
    if scf_hartree is not None:
        energies["electronic"] = EnergyValue(
            scf_hartree,
            "hartree",
            reference="Gaussian SCF Done energy parsed from raw text",
        )
        if _looks_like_solution_file(raw_file.name):
            energies["esol"] = EnergyValue(
                scf_hartree,
                "hartree",
                reference="solution electronic energy from Gaussian SCF Done parsed from raw text",
            )
            energies.pop("egas", None)
        else:
            energies["egas"] = EnergyValue(
                scf_hartree,
                "hartree",
                reference="gas electronic energy from Gaussian SCF Done parsed from raw text",
            )
            energies.pop("esol", None)

    ggas_hartree = _last_float_match(_GAUSSIAN_FREE_ENERGY_PATTERN, text)
    if ggas_hartree is not None:
        thermochemistry["ggas"] = EnergyValue(
            ggas_hartree,
            "hartree",
            reference="Gaussian Sum of electronic and thermal Free Energies parsed from raw text",
        )
        thermochemistry["ggas_1m"] = EnergyValue(
            ggas_hartree + STANDARD_STATE_1M_HARTREE,
            "hartree",
            reference="Gaussian gas free energy plus 1M standard-state correction",
        )


def _parse_gaussian_text_fallback(
    raw_file: RawFile,
    parser_id: str,
    parser_version: str,
    import_error: BaseException,
) -> Result[ParseResult]:
    text_result = read_raw_text(raw_file)
    if not text_result.ok or text_result.value is None:
        return err(text_result.error or RxnFlowError("invalid_input", "RawFile has no text content.", target=raw_file.target()))
    text = text_result.value
    geometry = _gaussian_geometry_from_text(raw_file, text)
    if not geometry.ok or geometry.value is None:
        return geometry

    warnings = [
        RxnFlowWarning(
            code="parser_fallback",
            message=f"cclib is unavailable; parsed Gaussian text with RxnFlow fallback: {import_error}.",
            target=raw_file.target(),
        )
    ]
    energies: dict[str, EnergyValue] = {}
    scf_hartree = _last_float_match(_SCF_DONE_PATTERN, text)
    if scf_hartree is None:
        warnings.append(
            RxnFlowWarning(
                code="missing_section",
                message="Gaussian text does not include an SCF Done energy.",
                target=raw_file.target(),
            )
        )
    else:
        energies["electronic"] = EnergyValue(
            scf_hartree,
            "hartree",
            reference="Gaussian SCF Done energy parsed by RxnFlow fallback",
        )
        if _looks_like_solution_file(raw_file.name):
            energies["esol"] = EnergyValue(
                scf_hartree,
                "hartree",
                reference="solution electronic energy from Gaussian SCF Done parsed by RxnFlow fallback",
            )
        else:
            energies["egas"] = EnergyValue(
                scf_hartree,
                "hartree",
                reference="gas electronic energy from Gaussian SCF Done parsed by RxnFlow fallback",
            )

    thermochemistry: dict[str, EnergyValue] = {}
    ggas_hartree = _last_float_match(_GAUSSIAN_FREE_ENERGY_PATTERN, text)
    if ggas_hartree is not None:
        thermochemistry["ggas"] = EnergyValue(
            ggas_hartree,
            "hartree",
            reference="Gaussian Sum of electronic and thermal Free Energies parsed by RxnFlow fallback",
        )
        thermochemistry["ggas_1m"] = EnergyValue(
            ggas_hartree + STANDARD_STATE_1M_HARTREE,
            "hartree",
            reference="Gaussian gas free energy plus 1M standard-state correction",
        )

    charge, multiplicity = _gaussian_charge_multiplicity(text)
    return ok(
        ParseResult(
            objects=(
                ChemicalObjectDraft(
                    label=raw_file.name,
                    charge=charge,
                    spin_multiplicity=multiplicity,
                    method=_gaussian_method_from_text(text),
                    geometry=geometry.value,
                    energies=energies,
                    thermochemistry=thermochemistry,
                ),
            ),
            provenance=Provenance(raw_file.id, parser_id, parser_version, PARSER_TIME),
        ),
        warnings=tuple(warnings),
    )


_SCF_DONE_PATTERN = re.compile(r"SCF Done:\s+E\([^)]+\)\s+=\s*([-+]?\d+(?:\.\d+)?(?:[DEde][-+]?\d+)?)")
_GAUSSIAN_FREE_ENERGY_PATTERN = re.compile(
    r"Sum of electronic and thermal Free Energies=\s*([-+]?\d+(?:\.\d+)?(?:[DEde][-+]?\d+)?)"
)
_GAUSSIAN_CHARGE_MULT_PATTERN = re.compile(r"Charge\s*=\s*([-+]?\d+)\s+Multiplicity\s*=\s*(\d+)")
_GAUSSIAN_ROUTE_PATTERN = re.compile(r"^\s*#\s*[PpNnTt]?\s+(.+)$", re.MULTILINE)


def _last_float_match(pattern: re.Pattern[str], text: str) -> float | None:
    matches = pattern.findall(text)
    if not matches:
        return None
    return float(str(matches[-1]).replace("D", "E").replace("d", "e"))


def _gaussian_charge_multiplicity(text: str) -> tuple[int | None, int | None]:
    matches = _GAUSSIAN_CHARGE_MULT_PATTERN.findall(text)
    if not matches:
        return None, None
    charge, multiplicity = matches[-1]
    return int(charge), int(multiplicity)


def _gaussian_method_from_text(text: str) -> str | None:
    match = _GAUSSIAN_ROUTE_PATTERN.search(text)
    if match is None:
        return None
    route = match.group(1).strip()
    for token in route.split():
        if "/" in token:
            method = token.split("/", 1)[0].strip()
            return _KNOWN_DFT_FUNCTIONALS.get(method.upper().replace("_", "-"), method)
    return None


def _gaussian_geometry_from_text(raw_file: RawFile, text: str) -> Result[tuple[Atom3D, ...]]:
    lines = text.splitlines()
    best_atoms: tuple[Atom3D, ...] = ()
    for index, line in enumerate(lines):
        if "Standard orientation:" not in line and "Input orientation:" not in line:
            continue
        atoms = _gaussian_orientation_block(lines, index + 1)
        if atoms:
            best_atoms = atoms
    if best_atoms:
        return ok(best_atoms)
    return err(
        RxnFlowError(
            code="parse_failed",
            message="Gaussian output must include a Standard orientation or Input orientation coordinate block.",
            target=raw_file.target(),
        )
    )


def _gaussian_orientation_block(lines: list[str], start: int) -> tuple[Atom3D, ...]:
    dash_count = 0
    atoms: list[Atom3D] = []
    for line in lines[start:]:
        if set(line.strip()) == {"-"}:
            dash_count += 1
            if dash_count >= 3:
                break
            continue
        if dash_count < 2:
            continue
        parts = line.split()
        if len(parts) < 6:
            continue
        try:
            atomic_number = int(parts[1])
            x, y, z = float(parts[3]), float(parts[4]), float(parts[5])
        except ValueError:
            continue
        atoms.append(Atom3D(_symbol_from_atomic_number(atomic_number), x, y, z))
    return tuple(atoms)


def _looks_like_solution_file(name: str) -> bool:
    stem = Path(name).stem.lower()
    return stem.endswith("-sol") or stem.endswith("_sol") or stem.endswith(".sol") or stem.endswith(" sol")


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
    functional = metadata.get("functional")
    methods = metadata.get("methods")
    if isinstance(methods, (list, tuple)) and methods:
        method = str(methods[-1])
        if method.upper() == "DFT":
            if functional:
                return str(functional)
            keyword_functional = _dft_functional_from_keywords(metadata.get("keywords"))
            if keyword_functional is not None:
                return keyword_functional
        return method
    for key in ("functional", "method", "package"):
        if key in metadata:
            return str(metadata[key])
    return None


def _dft_functional_from_keywords(keywords: Any) -> str | None:
    if not isinstance(keywords, (list, tuple)):
        return None
    for keyword in keywords:
        normalized = str(keyword).strip().upper().replace("_", "-")
        if normalized in _KNOWN_DFT_FUNCTIONALS:
            return _KNOWN_DFT_FUNCTIONALS[normalized]
    return None


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


_KNOWN_DFT_FUNCTIONALS = {
    "B3LYP": "B3LYP",
    "BP86": "BP86",
    "PBE": "PBE",
    "PBE0": "PBE0",
    "TPSSH": "TPSSh",
    "M06": "M06",
    "M06-2X": "M06-2X",
    "WB97X-D3": "wB97X-D3",
}


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
