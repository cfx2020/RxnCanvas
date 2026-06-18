"""Small engine boundary kept during the desktop canvas rebuild.

The full parser, project persistence, and report export systems were archived
before the rebuild. Reintroduce them through the desktop roadmap instead of
growing this smoke core ad hoc.
"""

from __future__ import annotations

import hashlib
import contextlib
import io
import json
import math
import re
from dataclasses import asdict, dataclass, replace
from collections import Counter
from pathlib import Path
from typing import Any, Literal


NodeKind = Literal["reactant", "transition", "intermediate", "product"]
EnergyUnit = Literal["kcal/mol", "hartree"]
ParseScope = Literal["preview", "full-file"]
ParseConfidence = Literal["high", "medium", "low"]
PARSER_VERSION = "0.2.1"
EV_TO_HARTREE = 0.03674932217565499
ONE_M_STANDARD_STATE_CORRECTION_HARTREE = 0.003019
NUMBER_PATTERN = r"[-+]?\d+(?:\.\d+)?(?:[EeDd][-+]?\d+)?"


GAUSSIAN_SCF_PATTERN = re.compile(rf"SCF Done:\s+E\(([^)]+)\)\s+=\s+({NUMBER_PATTERN})", re.IGNORECASE)
GAUSSIAN_GIBBS_CORRECTION_PATTERN = re.compile(
    rf"Thermal correction to Gibbs Free Energy\s+=\s+({NUMBER_PATTERN})",
    re.IGNORECASE,
)
GAUSSIAN_BASIS_FUNCTION_PATTERN = re.compile(r"\bNBasis=\s*(\d+)", re.IGNORECASE)
ORCA_ENERGY_PATTERN = re.compile(rf"FINAL SINGLE POINT ENERGY\s+({NUMBER_PATTERN})", re.IGNORECASE)
ORCA_TOTAL_ENERGY_PATTERN = re.compile(rf"Total Energy\s*:\s*({NUMBER_PATTERN})(?:\s*Eh)?", re.IGNORECASE)
ORCA_SOLVATION_PATTERN = re.compile(rf"(?:CPCM|SMD|PCM)\s+SOLVATION ENERGY\s+=\s+({NUMBER_PATTERN})", re.IGNORECASE)
ORCA_BASIS_FUNCTION_PATTERN = re.compile(
    r"(?:Number of basis functions|#\s*of\s*contracted\s*basis\s*functions)\s*(?:[:=]|\.\.\.)?\s*(\d+)",
    re.IGNORECASE,
)
ORCA_ROUTE_PATTERN = re.compile(r"^\s*!\s+(.+)$", re.MULTILINE)
ORCA_CHARGE_PATTERN = re.compile(r"Total Charge\s+Charge\s+(?:\.+\s*)?([-+]?\d+)", re.IGNORECASE)
ORCA_MULTIPLICITY_PATTERN = re.compile(r"Multiplicity\s+Mult\s+(?:\.+\s*)?(\d+)", re.IGNORECASE)
ORCA_XYZ_DIRECTIVE_PATTERN = re.compile(r"^\s*\*\s*xyz(?:file)?\s+([-+]?\d+)\s+(\d+)\b", re.IGNORECASE | re.MULTILINE)
MAPLE_POINT_PATTERN = re.compile(r"IRC point\s+\d+\s+energy\s+(-?\d+(?:\.\d+)?)", re.IGNORECASE)
COMMENT_ENERGY_PATTERN = re.compile(
    r"\b(?:energy|E)\s*=\s*([-+]?\d+(?:\.\d+)?(?:[EeDd][-+]?\d+)?)(?:\s*(Hartree|Ha|eV))?",
    re.IGNORECASE,
)
XYZ_FRAME_LABEL_PATTERN = re.compile(
    r"^\s*((?:(?:Iter|Iteration)\s+\d+\s+)?(?:Image|Frame)\s+\d+|Iteration\s+\d+)\b",
    re.IGNORECASE,
)
FORMULA_PATTERN = re.compile(r"\b(?:Formula|Stoichiometry)\s*(?:[:=]\s*)?([A-Z][A-Za-z0-9]*)\b", re.IGNORECASE)
EXTXYZ_METADATA_PATTERN = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)=(\"[^\"]*\"|'[^']*'|\S+)")
EXTXYZ_NUMBER_PATTERN = re.compile(r"[-+]?\d+(?:\.\d+)?(?:[EeDd][-+]?\d+)?")
GAUSSIAN_ROUTE_PATTERN = re.compile(r"^\s*#\s*[PpNnTt]?\s+(.+)$", re.MULTILINE)
GAUSSIAN_CHARGE_MULTIPLICITY_PATTERN = re.compile(r"Charge\s*=\s*([-+]?\d+)\s+Multiplicity\s*=\s*(\d+)")
GAUSSIAN_FREE_ENERGY_PATTERN = re.compile(
    rf"Sum of electronic and thermal Free Energies=\s*({NUMBER_PATTERN})",
    re.IGNORECASE,
)
MAPLE_BANNER_MARKERS = ("M   A   P   L   E", "MAchine-learning Potential for Landscape Exploration")
MAPLE_OUTPUT_ENERGY_PATTERN = re.compile(r"Energy:\s*(-?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?)\s*(Hartree)?", re.IGNORECASE)
MAPLE_TASK_PATTERN = re.compile(r"^\s*Task:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE)
MAPLE_MODEL_PATTERN = re.compile(r"^\s*model\s*:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE)
MAPLE_COORDINATE_PATTERN = re.compile(
    r"^\s*\d+\s+([A-Z][a-z]?)\s+([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s*$"
)
MAPLE_XYZ_COMMENT_PATTERN = re.compile(
    r"^\s*(?:(?:Iter|Iteration)\s+\d+\s+)?(?:Image|Frame)\s+\d+\s+Energy\s*=|^\s*Iteration\s+\d+\s+Energy\s*=",
    re.IGNORECASE,
)
PROJECT_PACKAGE_KIND = "rxnflow-project"
PROJECT_DIRECTORY_EXTENSION = ".rxnflow"
PROJECT_METADATA_DIRECTORY = ".rxnflow"
LEGACY_PROJECT_STATE_FILE = "project.json"
PROJECT_STATE_FILE = Path(PROJECT_METADATA_DIRECTORY) / "project.json"
PROJECT_MANIFEST_FILE = Path(PROJECT_METADATA_DIRECTORY) / "manifest.json"
EXPORT_MANIFEST_PATH = Path("exports") / "manifest.json"
SHA256_CHECKSUM_PATTERN = re.compile(r"^sha256:([a-f0-9]{64})$", re.IGNORECASE)


@dataclass(frozen=True)
class EnergySummary:
    gas: float
    solution: float
    unit: str = "kcal/mol"


@dataclass(frozen=True)
class FlowNode:
    id: str
    label: str
    formula: str
    kind: NodeKind
    energy: EnergySummary
    x: float
    y: float


@dataclass(frozen=True)
class FlowEdge:
    id: str
    source_id: str
    target_id: str
    label: str


@dataclass(frozen=True)
class ReactionFlow:
    id: str
    title: str
    nodes: tuple[FlowNode, ...]
    edges: tuple[FlowEdge, ...]


@dataclass(frozen=True)
class ParsedEnergyTableData:
    egasHartree: float | None = None
    gasBasisFunctions: int | None = None
    ggasHartree: float | None = None
    ggas1mHartree: float | None = None
    ggasShermoHartree: float | None = None
    ggasShermo1mHartree: float | None = None
    esolHartree: float | None = None
    solBasisFunctions: int | None = None
    sgauTran: float | None = None
    swhitTran: float | None = None
    entropyDelta: float | None = None
    entropyCorrectionHartree: float | None = None
    standardStateCorrectionHartree: float | None = None
    gsolHartree: float | None = None


@dataclass(frozen=True)
class SourceParseResult:
    label: str
    sourceKind: str
    formula: str
    kind: NodeKind
    method: str
    solvent: str
    energyGas: float | None
    energySolution: float | None
    energyUnit: EnergyUnit
    parsed: bool
    parserId: str | None = None
    parserVersion: str | None = None
    objectCount: int = 0
    warnings: tuple["ParseWarning", ...] = ()
    candidates: tuple["ParseCandidate", ...] = ()
    coordinatePreview: "CoordinatePreview | None" = None
    energyTable: ParsedEnergyTableData | None = None
    parseScope: ParseScope = "preview"
    confidence: ParseConfidence = "low"


@dataclass(frozen=True)
class ParseWarning:
    code: str
    message: str
    target: str | None = None


@dataclass(frozen=True)
class CoordinateAtom:
    element: str
    x: float
    y: float
    z: float


@dataclass(frozen=True)
class CoordinatePreview:
    atomCount: int
    has3d: bool
    elements: tuple[str, ...]
    atoms: tuple[CoordinateAtom, ...] = ()
    previewKind: str = "text"


@dataclass(frozen=True)
class ParseCandidate:
    candidateId: str
    objectIndex: int
    label: str
    formula: str
    charge: int | None
    spinMultiplicity: int | None
    method: str
    energyGas: float | None
    energySolution: float | None
    energyUnit: EnergyUnit
    coordinatePreview: CoordinatePreview | None
    roleHint: str
    warnings: tuple[ParseWarning, ...] = ()
    energyTable: ParsedEnergyTableData | None = None


@dataclass(frozen=True)
class RegisteredImportObject:
    id: str
    label: str
    formula: str
    kind: NodeKind
    method: str
    solvent: str
    energyGas: float | None
    energySolution: float | None
    energyUnit: EnergyUnit
    sourceStatus: Literal["parsed"] = "parsed"
    sourceFileId: str | None = None
    sourceFileName: str | None = None
    sourceCandidateId: str | None = None
    sourceObjectIndex: int | None = None
    parserId: str | None = None
    parserVersion: str | None = None
    roleHint: str | None = None
    charge: int | None = None
    spinMultiplicity: int | None = None
    coordinatePreview: CoordinatePreview | None = None
    warnings: tuple[ParseWarning, ...] = ()
    energyTable: ParsedEnergyTableData | None = None


@dataclass(frozen=True)
class ProjectValidationIssue:
    severity: Literal["error", "warning"]
    code: str
    message: str


class ImportRegistrationInputError(ValueError):
    def __init__(self, message: str, target: str | None = None) -> None:
        super().__init__(message)
        self.target = target


def demo_flow() -> ReactionFlow:
    """Return a small reaction flow used by smoke tests and future IPC wiring."""

    return ReactionFlow(
        id="demo-diels-alder",
        title="Diels-Alder Study",
        nodes=(
            FlowNode("butadiene", "1,3-Butadiene", "C4H6", "reactant", EnergySummary(-0.88, -1.32), -440, -170),
            FlowNode("maleic", "Maleic Anhydride", "C4H2O3", "reactant", EnergySummary(-29.11, -30.21), -440, 210),
            FlowNode("ts-endo", "TS1 (Endo)", "C10H12", "transition", EnergySummary(18.27, 19.64), 10, -140),
            FlowNode("endo", "Endo Adduct", "C10H16", "product", EnergySummary(-11.02, -12.41), 520, -60),
        ),
        edges=(
            FlowEdge("edge-1", "butadiene", "ts-endo", "+ Diene"),
            FlowEdge("edge-2", "maleic", "ts-endo", "+ Dienophile"),
            FlowEdge("edge-3", "ts-endo", "endo", "-18.53"),
        ),
    )


def export_flow_json(flow: ReactionFlow) -> str:
    """Serialize a flow to stable, human-readable JSON."""

    return json.dumps(asdict(flow), indent=2, sort_keys=True)


def preview_sources(files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Parse Electron import sources.

    Desktop callers should pass sourcePath so the engine reads the complete
    calculation output. The renderer still receives only the preview sample.
    """

    previews: list[dict[str, Any]] = []
    for file in files:
        name = str(file.get("name") or "source")
        preview = str(file.get("preview") or "")
        source_path = optional_string(file.get("sourcePath"))
        previews.append({
            "name": name,
            "parse": asdict(parse_source_file(name, preview, source_path)),
        })
    return previews


def parse_source_file(name: str, preview: str, source_path: str | None = None) -> SourceParseResult:
    if not source_path:
        return parse_source_preview(name, preview, parse_scope="preview", confidence="low")
    try:
        full_text = Path(source_path).expanduser().read_text(encoding="utf8", errors="replace")
    except OSError as exc:
        fallback = parse_source_preview(name, preview, parse_scope="preview", confidence="low")
        return append_parse_warning(
            fallback,
            ParseWarning(
                "full_file_read_failed",
                f"Could not read full source file; parser used the preview sample. {exc}",
                source_path,
            ),
        )
    text_result = parse_source_preview(name, full_text, parse_scope="full-file", confidence="high")
    if not should_try_cclib(name, full_text):
        return text_result
    cclib_result, cclib_warning = parse_cclib_full_file(name, source_path, full_text, text_result)
    if cclib_result is None:
        return append_parse_warning(text_result, cclib_warning) if cclib_warning is not None else text_result
    return merge_cclib_text_result(cclib_result, text_result)


def append_parse_warning(result: SourceParseResult, warning: ParseWarning) -> SourceParseResult:
    return replace(result, warnings=(*result.warnings, warning))


def should_try_cclib(name: str, full_text: str) -> bool:
    """Return True when a full source looks like a cclib-supported output."""

    lower_name = name.lower()
    if not lower_name.endswith((".log", ".out", ".orca")):
        return False
    head = full_text[:12000].lower()
    return any(
        marker in head
        for marker in (
            "entering gaussian system",
            "gaussian",
            "scf done:",
            "o   r   c   a",
            "orca terminated",
            "final single point energy",
        )
    )


def parse_cclib_full_file(
    name: str,
    source_path: str,
    full_text: str,
    text_result: SourceParseResult,
) -> tuple[SourceParseResult | None, ParseWarning | None]:
    """Parse a complete computational output with cclib when available.

    cclib is intentionally used behind the Python engine boundary. The renderer
    still receives structured fields only, and the custom text parser remains
    the fallback/overlay for RxnFlow-specific Gaussian workbook columns.
    """

    try:
        import cclib  # type: ignore[import-not-found]
    except (ImportError, ModuleNotFoundError) as exc:
        return None, ParseWarning(
            "cclib_unavailable",
            f"cclib is not available; parser used RxnFlow text extraction only. {exc}",
            name,
        )

    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            data = cclib.io.ccread(str(Path(source_path).expanduser()))
    except Exception as exc:  # pragma: no cover - cclib exception types vary by version/parser
        return None, ParseWarning(
            "cclib_parse_failed",
            f"cclib could not parse this full output; parser used RxnFlow text extraction only. {exc}",
            name,
        )
    if data is None:
        return None, ParseWarning(
            "cclib_parse_empty",
            "cclib did not return parsed data; parser used RxnFlow text extraction only.",
            name,
        )

    atoms = atoms_from_cclib_data(data)
    formula = formula_from_atoms(atoms) if atoms else text_result.formula
    charge = optional_int_from_any(getattr(data, "charge", None))
    spin = optional_int_from_any(getattr(data, "mult", None))
    method = cclib_method_from_data(data) or text_result.method
    energy_table = cclib_energy_table_from_data(name, data, full_text)
    energy_gas = energy_table.egasHartree if energy_table is not None else None
    if energy_gas is None:
        energy_gas = text_result.energyGas
    energy_solution = (
        energy_table.ggasHartree
        if energy_table is not None and energy_table.ggasHartree is not None
        else text_result.energySolution
    )
    source_kind = text_result.sourceKind if text_result.sourceKind in {"Gaussian", "ORCA"} else cclib_source_kind(name, full_text)
    parser_base = "gaussian-log-cclib" if source_kind == "Gaussian" else "orca-output-cclib"
    candidate = parse_candidate(
        object_index=0,
        label=basename_without_extension(name),
        formula=formula,
        method=method,
        energy_gas=energy_gas,
        energy_solution=energy_solution,
        energy_unit="hartree" if energy_gas is not None or energy_solution is not None else "kcal/mol",
        coordinate_preview=coordinate_preview_from_atoms(atoms) or text_result.coordinatePreview,
        role_hint=role_hint_from_name(name),
        charge=charge,
        spin_multiplicity=spin,
        energy_table=energy_table,
    )
    return source_result_from_candidates(
        label=basename_without_extension(name),
        source_kind=source_kind,
        kind=text_result.kind,
        solvent=text_result.solvent,
        parser_id=parser_id_for_scope(parser_base, "full-file"),
        parser_version=PARSER_VERSION,
        candidates=(candidate,),
        energy_table=energy_table,
        parse_scope="full-file",
        confidence="high",
    ), None


def merge_cclib_text_result(cclib_result: SourceParseResult, text_result: SourceParseResult) -> SourceParseResult:
    """Merge cclib standard fields with RxnFlow-specific text fields.

    cclib is the primary source for standard computational fields such as
    energies, atom-derived formula, method, charge/multiplicity, and
    coordinates. The RxnFlow text parser fills gaps and contributes
    app-specific metadata such as source kind, solvent, role hints, and labels.
    """

    cclib_primary = cclib_result.candidates[0] if cclib_result.candidates else None
    text_primary = text_result.candidates[0] if text_result.candidates else None
    merged_table = merge_energy_tables(cclib_primary.energyTable if cclib_primary else cclib_result.energyTable, text_result.energyTable)
    merged_coordinate_preview = cclib_result.coordinatePreview or text_result.coordinatePreview
    merged_candidate = parse_candidate(
        object_index=0,
        label=text_primary.label if text_primary is not None else cclib_result.label,
        formula=prefer_parsed_text(cclib_result.formula, text_result.formula, "pending"),
        method=prefer_parsed_text(cclib_result.method, text_result.method, "unassigned"),
        energy_gas=coalesce_float(cclib_result.energyGas, text_result.energyGas),
        energy_solution=coalesce_float(cclib_result.energySolution, text_result.energySolution),
        energy_unit="hartree",
        coordinate_preview=merged_coordinate_preview,
        role_hint=text_primary.roleHint if text_primary is not None else (cclib_primary.roleHint if cclib_primary else role_hint_from_name(cclib_result.label)),
        charge=cclib_primary.charge if cclib_primary is not None and cclib_primary.charge is not None else (text_primary.charge if text_primary else None),
        spin_multiplicity=cclib_primary.spinMultiplicity if cclib_primary is not None and cclib_primary.spinMultiplicity is not None else (text_primary.spinMultiplicity if text_primary else None),
        warnings=tuple(sorted((*cclib_result.warnings, *text_result.warnings), key=lambda warning: warning.code)),
        energy_table=merged_table,
    )
    return source_result_from_candidates(
        label=merged_candidate.label,
        source_kind=text_result.sourceKind if text_result.parsed else cclib_result.sourceKind,
        kind=text_result.kind,
        solvent=text_result.solvent,
        parser_id=parser_id_for_scope(
            "gaussian-log-cclib+rxnflow-text" if (text_result.sourceKind if text_result.parsed else cclib_result.sourceKind) == "Gaussian" else "orca-output-cclib+rxnflow-text",
            "full-file",
        ),
        parser_version=PARSER_VERSION,
        candidates=(merged_candidate,),
        warnings=tuple(sorted((*cclib_result.warnings, *text_result.warnings), key=lambda warning: warning.code)),
        energy_table=merged_table,
        parse_scope="full-file",
        confidence="high",
    )


def atoms_from_cclib_data(data: Any) -> list[CoordinateAtom]:
    atom_numbers = getattr(data, "atomnos", None)
    atom_coordinates = getattr(data, "atomcoords", None)
    if atom_numbers is None or atom_coordinates is None or len(atom_coordinates) == 0:
        return []
    latest_coordinates = atom_coordinates[-1]
    atoms: list[CoordinateAtom] = []
    for atomic_number, coordinates in zip(atom_numbers, latest_coordinates):
        try:
            x, y, z = float(coordinates[0]), float(coordinates[1]), float(coordinates[2])
            atoms.append(CoordinateAtom(symbol_from_atomic_number(int(atomic_number)), x, y, z))
        except (TypeError, ValueError, IndexError):
            continue
    return atoms


def cclib_energy_table_from_data(name: str, data: Any, full_text: str) -> ParsedEnergyTableData | None:
    scf_hartree = cclib_last_scf_hartree(data)
    free_energy = cclib_free_energy_hartree(data)
    basis_functions = optional_int_from_any(getattr(data, "nbasis", None))
    is_solution = looks_like_solution_log_name(name)
    table = ParsedEnergyTableData(
        egasHartree=scf_hartree,
        gasBasisFunctions=basis_functions,
        ggasHartree=free_energy,
        ggas1mHartree=free_energy + ONE_M_STANDARD_STATE_CORRECTION_HARTREE if free_energy is not None else None,
        esolHartree=scf_hartree if is_solution else None,
        solBasisFunctions=basis_functions if is_solution else None,
        standardStateCorrectionHartree=ONE_M_STANDARD_STATE_CORRECTION_HARTREE if free_energy is not None else None,
    )
    exact_text_table = gaussian_energy_table(full_text) if "scf done:" in full_text.lower() else orca_energy_table(full_text)
    table = merge_energy_tables(table, exact_text_table)
    if is_solution and table is not None:
        table = replace(
            table,
            esolHartree=table.egasHartree if table.egasHartree is not None else table.esolHartree,
            solBasisFunctions=table.gasBasisFunctions if table.gasBasisFunctions is not None else table.solBasisFunctions,
        )
    return table if energy_table_has_value(table) else None


def cclib_last_scf_hartree(data: Any) -> float | None:
    scfenergies = getattr(data, "scfenergies", None)
    if scfenergies is None or len(scfenergies) == 0:
        return None
    try:
        return float(scfenergies[-1]) * EV_TO_HARTREE
    except (TypeError, ValueError):
        return None


def cclib_free_energy_hartree(data: Any) -> float | None:
    try:
        value = getattr(data, "freeenergy", None)
        if value is None:
            return None
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None


def cclib_source_kind(name: str, full_text: str) -> str:
    lower = f"{name}\n{full_text[:12000]}".lower()
    if "o   r   c   a" in lower or "orca terminated" in lower or name.lower().endswith(".orca"):
        return "ORCA"
    return "Gaussian"


def cclib_method_from_data(data: Any) -> str | None:
    metadata = getattr(data, "metadata", None)
    if not isinstance(metadata, dict):
        return None
    for key in ("methods", "method"):
        value = metadata.get(key)
        if isinstance(value, (list, tuple)) and value:
            return " ".join(str(item) for item in value[:3] if item).strip() or None
        if isinstance(value, str) and value.strip():
            return value.strip()
    functional = metadata.get("functional")
    basis = metadata.get("basis_set") or metadata.get("basis")
    method = " ".join(str(part) for part in (functional, basis) if part)
    return method.strip() or None


def looks_like_solution_log_name(name: str) -> bool:
    stem = basename_without_extension(name).strip().lower()
    return stem.endswith("-sol") or stem.endswith("_sol") or stem.endswith(".sol") or stem.endswith(" sol")


def merge_energy_tables(
    base: ParsedEnergyTableData | None,
    overlay: ParsedEnergyTableData | None,
) -> ParsedEnergyTableData | None:
    merged: dict[str, Any] = {}
    for key in ParsedEnergyTableData.__dataclass_fields__:
        value = getattr(base, key, None) if base is not None else None
        overlay_value = getattr(overlay, key, None) if overlay is not None else None
        merged[key] = value if value is not None else overlay_value
    table = ParsedEnergyTableData(**merged)
    return table if energy_table_has_value(table) else None


def prefer_parsed_text(primary: str | None, fallback: str | None, default: str) -> str:
    ignored = {"", "pending", "unassigned", "unparsed source"}
    if isinstance(primary, str) and primary.strip() and primary.strip().lower() not in ignored:
        return primary.strip()
    if isinstance(fallback, str) and fallback.strip() and fallback.strip().lower() not in ignored:
        return fallback.strip()
    return default


def coalesce_float(*values: float | None) -> float | None:
    for value in values:
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value)):
            return float(value)
    return None


def optional_int_from_any(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    try:
        if float(value) != float(parsed):
            return None
    except (TypeError, ValueError):
        return None
    return parsed


def register_import_candidates(
    files: list[dict[str, Any]],
    selections: list[dict[str, Any]] | None = None,
    register_all: bool = False,
) -> dict[str, Any]:
    """Convert preview candidates into stable imported object summaries.

    This is the lightweight replacement for the archived registry workflow:
    it preserves candidate/provenance semantics without reintroducing the old
    project-wide registry service during the desktop rebuild.
    """

    if not files:
        raise ImportRegistrationInputError("Import registration requires at least one file.", "files")

    file_by_id = {source_file_id(file): file for file in files}
    file_results: list[dict[str, Any]] = []
    registered_objects: list[dict[str, Any]] = []

    if register_all:
        ordered_work = [(source_file_id(file), None) for file in files]
    else:
        if not selections:
            raise ImportRegistrationInputError("Import registration requires at least one selection.", "selections")
        ordered_work = selected_file_indices(selections, file_by_id)

    for file_id, object_indices in ordered_work:
        file = file_by_id[file_id]
        parse_result = source_parse_result_from_file_payload(file)
        candidates = parse_result.candidates
        if not candidates:
            raise ImportRegistrationInputError("Source preview does not contain registerable candidates.", file_id)

        selected_candidates = select_parse_candidates(candidates, object_indices, file_id)
        object_summaries = [
            registered_import_object(file, parse_result, candidate)
            for candidate in selected_candidates
        ]
        registered_objects.extend(asdict(obj) for obj in object_summaries)
        file_results.append({
            "fileId": file_id,
            "sourceName": str(file.get("name") or "source"),
            "parserId": parse_result.parserId,
            "parserVersion": parse_result.parserVersion,
            "registeredObjectIds": [obj.id for obj in object_summaries],
            "objectIndices": [obj.sourceObjectIndex for obj in object_summaries],
        })

    return {
        "registeredObjects": registered_objects,
        "files": file_results,
    }


def selected_file_indices(
    selections: list[dict[str, Any]],
    file_by_id: dict[str, dict[str, Any]],
) -> list[tuple[str, tuple[int, ...]]]:
    selected: list[tuple[str, tuple[int, ...]]] = []
    seen_file_ids: set[str] = set()
    for index, selection in enumerate(selections):
        if not isinstance(selection, dict):
            raise ImportRegistrationInputError("Import selection must be an object.", f"selections[{index}]")
        file_id = str(selection.get("fileId") or "")
        if not file_id:
            raise ImportRegistrationInputError("Import selection requires fileId.", f"selections[{index}].fileId")
        if file_id not in file_by_id:
            raise ImportRegistrationInputError(f"Import selection fileId '{file_id}' does not match an imported file.", file_id)
        if file_id in seen_file_ids:
            raise ImportRegistrationInputError(f"Import selection fileId '{file_id}' is duplicated.", file_id)
        seen_file_ids.add(file_id)

        object_indices = selection.get("objectIndices")
        if not isinstance(object_indices, list) or not object_indices:
            raise ImportRegistrationInputError("Import selection requires at least one object index.", file_id)
        normalized: list[int] = []
        for object_index in object_indices:
            if isinstance(object_index, bool) or not isinstance(object_index, int):
                raise ImportRegistrationInputError("Import object index must be an integer.", file_id)
            normalized.append(object_index)
        selected.append((file_id, tuple(normalized)))
    return selected


def select_parse_candidates(
    candidates: tuple[ParseCandidate, ...],
    object_indices: tuple[int, ...] | None,
    target: str,
) -> tuple[ParseCandidate, ...]:
    if object_indices is None:
        return candidates

    normalized: list[int] = []
    object_count = len(candidates)
    for index in object_indices:
        resolved = index if index >= 0 else object_count + index
        if resolved < 0 or resolved >= object_count:
            raise ImportRegistrationInputError(f"Import object index '{index}' is out of range.", target)
        if resolved in normalized:
            raise ImportRegistrationInputError(f"Import object index '{index}' is duplicated.", target)
        normalized.append(resolved)
    return tuple(candidates[index] for index in normalized)


def source_file_id(file: dict[str, Any]) -> str:
    return str(file.get("id") or safe_identifier(str(file.get("name") or "source")))


def source_parse_result_from_file_payload(file: dict[str, Any]) -> SourceParseResult:
    parse_payload = file.get("parse")
    if isinstance(parse_payload, dict):
        return source_parse_result_from_payload(parse_payload, str(file.get("name") or "source"))
    return parse_source_preview(str(file.get("name") or "source"), str(file.get("preview") or ""))


def source_parse_result_from_payload(payload: dict[str, Any], source_name: str) -> SourceParseResult:
    label = string_or_default(payload.get("label"), basename_without_extension(source_name))
    source_kind = string_or_default(payload.get("sourceKind"), "Raw")
    kind = node_kind_or_default(payload.get("kind"), infer_node_kind(source_name))
    energy_unit = energy_unit_or_default(payload.get("energyUnit"), "kcal/mol")
    warnings = tuple(parse_warning_from_payload(warning) for warning in list_or_empty(payload.get("warnings")))
    candidates = tuple(parse_candidate_from_payload(candidate) for candidate in list_or_empty(payload.get("candidates")))
    energy_table = energy_table_from_payload(payload.get("energyTable"))
    if not candidates and bool(payload.get("parsed")):
        candidates = (
            ParseCandidate(
                candidateId=f"candidate-1-{safe_identifier(label)}",
                objectIndex=0,
                label=label,
                formula=string_or_default(payload.get("formula"), "pending"),
                charge=optional_int(payload.get("charge")),
                spinMultiplicity=optional_int(payload.get("spinMultiplicity")),
                method=string_or_default(payload.get("method"), "unassigned"),
                energyGas=optional_float(payload.get("energyGas")),
                energySolution=optional_float(payload.get("energySolution")),
                energyUnit=energy_unit,
                coordinatePreview=coordinate_preview_from_payload(payload.get("coordinatePreview")),
                roleHint=string_or_default(payload.get("roleHint"), role_hint_from_name(source_name)),
                warnings=warnings,
                energyTable=energy_table,
            ),
        )

    return SourceParseResult(
        label=label,
        sourceKind=source_kind,
        formula=string_or_default(payload.get("formula"), candidates[0].formula if candidates else "pending"),
        kind=kind,
        method=string_or_default(payload.get("method"), candidates[0].method if candidates else "unassigned"),
        solvent=string_or_default(payload.get("solvent"), "unassigned"),
        energyGas=optional_float(payload.get("energyGas")),
        energySolution=optional_float(payload.get("energySolution")),
        energyUnit=energy_unit,
        parsed=bool(payload.get("parsed")) or bool(candidates),
        parserId=optional_string(payload.get("parserId")),
        parserVersion=optional_string(payload.get("parserVersion")),
        objectCount=optional_int(payload.get("objectCount")) or len(candidates),
        warnings=warnings,
        candidates=candidates,
        coordinatePreview=coordinate_preview_from_payload(payload.get("coordinatePreview")),
        energyTable=energy_table or (candidates[0].energyTable if candidates else None),
        parseScope=parse_scope_or_default(payload.get("parseScope"), "preview"),
        confidence=parse_confidence_or_default(payload.get("confidence"), "low"),
    )


def parse_candidate_from_payload(payload: Any) -> ParseCandidate:
    if not isinstance(payload, dict):
        raise ImportRegistrationInputError("Parse candidate must be an object.", "candidate")
    label = string_or_default(payload.get("label"), "Imported object")
    object_index = optional_int(payload.get("objectIndex"))
    if object_index is None:
        raise ImportRegistrationInputError("Parse candidate requires objectIndex.", label)
    energy_unit = energy_unit_or_default(payload.get("energyUnit"), "kcal/mol")
    return ParseCandidate(
        candidateId=string_or_default(payload.get("candidateId"), f"candidate-{object_index + 1}-{safe_identifier(label)}"),
        objectIndex=object_index,
        label=label,
        formula=string_or_default(payload.get("formula"), "pending"),
        charge=optional_int(payload.get("charge")),
        spinMultiplicity=optional_int(payload.get("spinMultiplicity")),
        method=string_or_default(payload.get("method"), "unassigned"),
        energyGas=optional_float(payload.get("energyGas")),
        energySolution=optional_float(payload.get("energySolution")),
        energyUnit=energy_unit,
        coordinatePreview=coordinate_preview_from_payload(payload.get("coordinatePreview")),
        roleHint=string_or_default(payload.get("roleHint"), "unknown"),
        warnings=tuple(parse_warning_from_payload(warning) for warning in list_or_empty(payload.get("warnings"))),
        energyTable=energy_table_from_payload(payload.get("energyTable")),
    )


def parse_warning_from_payload(payload: Any) -> ParseWarning:
    if not isinstance(payload, dict):
        return ParseWarning("warning", str(payload))
    return ParseWarning(
        code=string_or_default(payload.get("code"), "warning"),
        message=string_or_default(payload.get("message"), ""),
        target=optional_string(payload.get("target")),
    )


def coordinate_preview_from_payload(payload: Any) -> CoordinatePreview | None:
    if not isinstance(payload, dict):
        return None
    atom_count = optional_int(payload.get("atomCount"))
    if atom_count is None:
        return None
    atoms = tuple(
        atom
        for atom in (coordinate_atom_from_payload(item) for item in list_or_empty(payload.get("atoms")))
        if atom is not None
    )
    elements = tuple(str(element) for element in list_or_empty(payload.get("elements")) if isinstance(element, str))
    if not elements and atoms:
        elements = tuple(sorted({atom.element for atom in atoms}))
    return CoordinatePreview(
        atomCount=atom_count,
        has3d=bool(payload.get("has3d")) or bool(atoms),
        elements=elements,
        atoms=atoms,
        previewKind=string_or_default(payload.get("previewKind"), "text"),
    )


def coordinate_atom_from_payload(payload: Any) -> CoordinateAtom | None:
    if not isinstance(payload, dict):
        return None
    element = payload.get("element")
    x = optional_float(payload.get("x"))
    y = optional_float(payload.get("y"))
    z = optional_float(payload.get("z"))
    if not isinstance(element, str) or not element or x is None or y is None or z is None:
        return None
    return CoordinateAtom(element=element, x=x, y=y, z=z)


def energy_table_from_payload(payload: Any) -> ParsedEnergyTableData | None:
    if not isinstance(payload, dict):
        return None
    table = ParsedEnergyTableData(
        egasHartree=optional_float(payload.get("egasHartree")),
        gasBasisFunctions=optional_int(payload.get("gasBasisFunctions")),
        ggasHartree=optional_float(payload.get("ggasHartree")),
        ggas1mHartree=optional_float(payload.get("ggas1mHartree")),
        ggasShermoHartree=optional_float(payload.get("ggasShermoHartree")),
        ggasShermo1mHartree=optional_float(payload.get("ggasShermo1mHartree")),
        esolHartree=optional_float(payload.get("esolHartree")),
        solBasisFunctions=optional_int(payload.get("solBasisFunctions")),
        sgauTran=optional_float(payload.get("sgauTran")),
        swhitTran=optional_float(payload.get("swhitTran")),
        entropyDelta=optional_float(payload.get("entropyDelta")),
        entropyCorrectionHartree=optional_float(payload.get("entropyCorrectionHartree")),
        standardStateCorrectionHartree=optional_float(payload.get("standardStateCorrectionHartree")),
        gsolHartree=optional_float(payload.get("gsolHartree")),
    )
    return table if energy_table_has_value(table) else None


def energy_table_has_value(table: ParsedEnergyTableData | None) -> bool:
    if table is None:
        return False
    return any(value is not None for value in asdict(table).values())


def parse_scope_or_default(value: Any, default: ParseScope) -> ParseScope:
    return value if value in {"preview", "full-file"} else default


def parse_confidence_or_default(value: Any, default: ParseConfidence) -> ParseConfidence:
    return value if value in {"high", "medium", "low"} else default


def registered_import_object(file: dict[str, Any], parse_result: SourceParseResult, candidate: ParseCandidate) -> RegisteredImportObject:
    file_id = source_file_id(file)
    return RegisteredImportObject(
        id=f"object-{safe_identifier(file_id)}-{safe_identifier(candidate.candidateId)}",
        label=candidate.label,
        formula=candidate.formula,
        kind=node_kind_from_candidate(candidate, parse_result.kind),
        method=candidate.method or parse_result.method,
        solvent=parse_result.solvent,
        energyGas=candidate.energyGas,
        energySolution=candidate.energySolution,
        energyUnit=candidate.energyUnit,
        sourceFileId=file_id,
        sourceFileName=str(file.get("name") or "source"),
        sourceCandidateId=candidate.candidateId,
        sourceObjectIndex=candidate.objectIndex,
        parserId=parse_result.parserId,
        parserVersion=parse_result.parserVersion,
        roleHint=candidate.roleHint,
        charge=candidate.charge,
        spinMultiplicity=candidate.spinMultiplicity,
        coordinatePreview=candidate.coordinatePreview,
        warnings=candidate.warnings,
        energyTable=candidate.energyTable or parse_result.energyTable,
    )


def node_kind_from_candidate(candidate: ParseCandidate, fallback: NodeKind) -> NodeKind:
    if candidate.roleHint == "transition":
        return "transition"
    if candidate.roleHint == "path-point":
        return "intermediate"
    if candidate.roleHint == "final" and fallback == "intermediate":
        return "product"
    return fallback


def validate_project_content(content: str, project_root: str | Path | None = None) -> dict[str, Any]:
    """Validate the lightweight desktop project package envelope."""

    try:
        package = json.loads(content)
    except json.JSONDecodeError as exc:
        return project_validation_result(None, [
            ProjectValidationIssue("error", "invalid_json", str(exc)),
        ])

    if not isinstance(package, dict):
        return project_validation_result(None, [
            ProjectValidationIssue("error", "invalid_project", "Project content must be a JSON object."),
        ])

    project_root_path = Path(project_root).expanduser() if project_root else None
    issues = validate_project_package(package, project_root_path)
    return project_validation_result(package, issues)


def open_project(project_path: str) -> dict[str, Any]:
    path = Path(project_path).expanduser()
    content_path = resolve_project_state_path(path) if path.is_dir() else path
    if not content_path.exists():
        raise FileNotFoundError(f"RxnFlow project not found: {content_path}")

    content = content_path.read_text(encoding="utf8")
    project_root = project_root_for_content(path, content_path)
    validation = validate_project_content(content, project_root)
    return {
        "projectPath": str(path),
        "contentPath": str(content_path),
        "content": content,
        "validation": validation,
    }


def save_project(project_path: str, content: str) -> dict[str, Any]:
    validation = validate_project_content(content)
    if not validation["valid"]:
        return {
            "saved": False,
            "validation": validation,
        }

    package = sanitize_project_package(json.loads(content))
    target_path = Path(project_path).expanduser()
    if target_path.suffix.lower() == ".json":
        target_path.parent.mkdir(parents=True, exist_ok=True)
        saved_content = stable_project_json(package)
        target_path.write_text(saved_content, encoding="utf8")
        return {
            "saved": True,
            "projectPath": str(target_path),
            "contentPath": str(target_path),
            "content": saved_content,
            "validation": validate_project_content(saved_content),
        }

    project_directory = target_path
    project_directory.mkdir(parents=True, exist_ok=True)
    (project_directory / PROJECT_METADATA_DIRECTORY).mkdir(parents=True, exist_ok=True)
    (project_directory / "sources").mkdir(parents=True, exist_ok=True)
    (project_directory / "exports").mkdir(parents=True, exist_ok=True)
    package = materialize_project_sources(project_directory, package)
    saved_content = stable_project_json(package)
    content_path = project_directory / PROJECT_STATE_FILE
    content_path.write_text(saved_content, encoding="utf8")
    write_project_manifest(project_directory, package)
    ensure_export_manifest(project_directory, package)
    return {
        "saved": True,
        "projectPath": str(project_directory),
        "contentPath": str(content_path),
        "content": saved_content,
        "validation": validate_project_content(saved_content, project_directory),
    }


def resolve_project_state_path(project_directory: Path) -> Path:
    for candidate in (project_directory / PROJECT_STATE_FILE, project_directory / LEGACY_PROJECT_STATE_FILE):
        if candidate.is_file():
            return candidate
    return project_directory / PROJECT_STATE_FILE


def project_root_for_content(requested_path: Path, content_path: Path) -> Path | None:
    if requested_path.is_dir():
        return requested_path
    if content_path.name == "project.json" and content_path.parent.name == PROJECT_METADATA_DIRECTORY:
        return content_path.parent.parent
    if content_path.name == LEGACY_PROJECT_STATE_FILE and content_path.parent.suffix.lower() == PROJECT_DIRECTORY_EXTENSION:
        return content_path.parent
    return None


def validate_project_package(package: dict[str, Any], project_root: Path | None = None) -> list[ProjectValidationIssue]:
    issues: list[ProjectValidationIssue] = []
    if package.get("schemaVersion") not in {1, 2} or package.get("packageKind") != PROJECT_PACKAGE_KIND:
        issues.append(ProjectValidationIssue("error", "invalid_envelope", "Expected schemaVersion 1 or 2 and packageKind rxnflow-project."))

    project = package.get("project")
    if not isinstance(project, dict):
        issues.append(ProjectValidationIssue("error", "invalid_project", "Project metadata is required."))
    elif not project.get("id") or not project.get("label"):
        issues.append(ProjectValidationIssue("warning", "project_metadata_incomplete", "Project id or label is missing."))

    has_canvas_array = isinstance(package.get("canvases"), list)
    for key in ("files", "canvases") if has_canvas_array else ("files", "nodes", "edges"):
        if not isinstance(package.get(key), list):
            issues.append(ProjectValidationIssue("error", f"invalid_{key}", f"{key} must be an array."))
    if not has_canvas_array and package.get("barriers") is not None and not isinstance(package.get("barriers"), list):
        issues.append(ProjectValidationIssue("error", "invalid_barriers", "barriers must be an array when present."))

    if not has_canvas_array:
        viewport = package.get("viewport")
        if not isinstance(viewport, dict) or not is_number(viewport.get("x")) or not is_number(viewport.get("y")) or not is_number(viewport.get("zoom")) or viewport.get("zoom") <= 0:
            issues.append(ProjectValidationIssue("error", "invalid_viewport", "viewport must contain finite x, y and positive zoom."))
    elif not isinstance(package.get("canvases"), list) or len(package.get("canvases")) == 0:
        issues.append(ProjectValidationIssue("error", "invalid_canvases", "canvases must contain at least one canvas."))
    elif not isinstance(package.get("activeCanvasId"), str) or not package.get("activeCanvasId"):
        issues.append(ProjectValidationIssue("error", "invalid_active_canvas", "activeCanvasId is required when canvases are present."))

    files = package.get("files") if isinstance(package.get("files"), list) else []
    flattened = flatten_project_graph(package)
    nodes = flattened["nodes"]
    edges = flattened["edges"]
    barriers = flattened["barriers"]

    file_ids: set[str] = set()
    for index, file in enumerate(files):
        if not isinstance(file, dict):
            issues.append(ProjectValidationIssue("error", "invalid_file", f"files[{index}] must be an object."))
            continue
        file_id = file.get("id")
        if not isinstance(file_id, str) or not file_id:
            issues.append(ProjectValidationIssue("error", "invalid_file_id", f"files[{index}].id is required."))
        elif file_id in file_ids:
            issues.append(ProjectValidationIssue("error", "duplicate_file_id", f"Duplicate file id: {file_id}."))
        else:
            file_ids.add(file_id)
        if not isinstance(file.get("name"), str) or not file.get("name"):
            issues.append(ProjectValidationIssue("warning", "file_metadata_incomplete", f"files[{index}].name is missing."))
        if file.get("status") not in {"ready", "parsed", "staged"}:
            issues.append(ProjectValidationIssue("warning", "unknown_file_status", f"files[{index}].status is not supported."))
        if file.get("size") is not None and optional_file_size(file.get("size")) is None:
            issues.append(ProjectValidationIssue("error", "invalid_file_size", f"files[{index}].size must be a non-negative integer."))

        stored_path = file.get("storedPath")
        if stored_path is not None and not is_safe_project_path(stored_path):
            issues.append(ProjectValidationIssue("error", "unsafe_stored_path", f"files[{index}].storedPath must be project-relative."))
        elif stored_path is not None and project_root is not None:
            issues.extend(validate_stored_source_file(project_root, stored_path, file, index))

    node_ids: set[str] = set()
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            issues.append(ProjectValidationIssue("error", "invalid_node", f"nodes[{index}] must be an object."))
            continue
        node_id = node.get("id")
        if not isinstance(node_id, str) or not node_id:
            issues.append(ProjectValidationIssue("error", "invalid_node_id", f"nodes[{index}].id is required."))
        elif node_id in node_ids:
            issues.append(ProjectValidationIssue("error", "duplicate_node_id", f"Duplicate node id: {node_id}."))
        else:
            node_ids.add(node_id)
        if node.get("kind") not in {"reactant", "transition", "intermediate", "product"}:
            issues.append(ProjectValidationIssue("warning", "unknown_node_kind", f"nodes[{index}].kind is not a supported node kind."))
        if not isinstance(node.get("label"), str) or not node.get("label"):
            issues.append(ProjectValidationIssue("warning", "node_metadata_incomplete", f"nodes[{index}].label is missing."))
        if node.get("energyUnit") not in {"kcal/mol", "hartree"}:
            issues.append(ProjectValidationIssue("error", "invalid_energy_unit", f"nodes[{index}].energyUnit must be kcal/mol or hartree."))
        for field in ("energyGas", "energySolution"):
            value = node.get(field)
            if value is not None and not is_number(value):
                issues.append(ProjectValidationIssue("error", "invalid_node_energy", f"nodes[{index}].{field} must be a finite number or null."))
        coefficient = node.get("coefficient")
        if coefficient is not None and (not is_number(coefficient) or coefficient == 0):
            issues.append(ProjectValidationIssue("error", "invalid_node_coefficient", f"nodes[{index}].coefficient must be a non-zero finite number when present."))
        position = node.get("position")
        if not isinstance(position, dict) or not is_number(position.get("x")) or not is_number(position.get("y")):
            issues.append(ProjectValidationIssue("error", "invalid_node_position", f"nodes[{index}].position must contain finite x and y."))
        source_file_id = node.get("sourceFileId")
        if isinstance(source_file_id, str) and source_file_id and source_file_id not in file_ids:
            issues.append(ProjectValidationIssue("warning", "node_missing_source_file", f"nodes[{index}].sourceFileId references missing file {source_file_id}."))
        if node.get("sourceObjectIndex") is not None:
            source_object_index = optional_int(node.get("sourceObjectIndex"))
            if source_object_index is None or source_object_index < 0:
                issues.append(ProjectValidationIssue("error", "invalid_source_object_index", f"nodes[{index}].sourceObjectIndex must be a non-negative integer."))

    issues.extend(validate_import_ledger(package.get("importLedger"), file_ids, node_ids, nodes))

    edge_ids: set[str] = set()
    for index, edge in enumerate(edges):
        if not isinstance(edge, dict):
            issues.append(ProjectValidationIssue("error", "invalid_edge", f"edges[{index}] must be an object."))
            continue
        edge_id = edge.get("id")
        if not isinstance(edge_id, str) or not edge_id:
            issues.append(ProjectValidationIssue("error", "invalid_edge_id", f"edges[{index}].id is required."))
        elif edge_id in edge_ids:
            issues.append(ProjectValidationIssue("error", "duplicate_edge_id", f"Duplicate edge id: {edge_id}."))
        else:
            edge_ids.add(edge_id)
        for field in ("sourceId", "targetId"):
            node_id = edge.get(field)
            if not isinstance(node_id, str) or not node_id:
                issues.append(ProjectValidationIssue("error", "invalid_edge_endpoint", f"edges[{index}].{field} is required."))
            elif node_id not in node_ids:
                issues.append(ProjectValidationIssue("warning", "edge_missing_node", f"edges[{index}].{field} references missing node {node_id}."))
        if edge.get("sourceId") == edge.get("targetId") and isinstance(edge.get("sourceId"), str) and edge.get("sourceId"):
            issues.append(ProjectValidationIssue("warning", "self_edge", f"edges[{index}] connects a node to itself."))

    barrier_ids: set[str] = set()
    for index, barrier in enumerate(barriers):
        if not isinstance(barrier, dict):
            issues.append(ProjectValidationIssue("error", "invalid_barrier", f"barriers[{index}] must be an object."))
            continue
        barrier_id = barrier.get("id")
        if not isinstance(barrier_id, str) or not barrier_id:
            issues.append(ProjectValidationIssue("error", "invalid_barrier_id", f"barriers[{index}].id is required."))
        elif barrier_id in barrier_ids:
            issues.append(ProjectValidationIssue("error", "duplicate_barrier_id", f"Duplicate barrier id: {barrier_id}."))
        else:
            barrier_ids.add(barrier_id)
        for field in ("sourceId", "targetId"):
            node_id = barrier.get(field)
            if not isinstance(node_id, str) or not node_id:
                issues.append(ProjectValidationIssue("error", "invalid_barrier_endpoint", f"barriers[{index}].{field} is required."))
            elif node_id not in node_ids:
                issues.append(ProjectValidationIssue("warning", "barrier_missing_node", f"barriers[{index}].{field} references missing node {node_id}."))
        label = barrier.get("label")
        if label is not None and not isinstance(label, str):
            issues.append(ProjectValidationIssue("error", "invalid_barrier_label", f"barriers[{index}].label must be a string when present."))

    if project_root is not None:
        issues.extend(validate_export_manifest(project_root))

    return issues


def flatten_project_graph(package: dict[str, Any]) -> dict[str, list[Any]]:
    canvases = package.get("canvases")
    if isinstance(canvases, list):
        valid_canvases = [canvas for canvas in canvases if isinstance(canvas, dict)]
        return {
            "nodes": [node for canvas in valid_canvases for node in (canvas.get("nodes") if isinstance(canvas.get("nodes"), list) else [])],
            "edges": [edge for canvas in valid_canvases for edge in (canvas.get("edges") if isinstance(canvas.get("edges"), list) else [])],
            "barriers": [barrier for canvas in valid_canvases for barrier in (canvas.get("barriers") if isinstance(canvas.get("barriers"), list) else [])],
        }
    return {
        "nodes": package.get("nodes") if isinstance(package.get("nodes"), list) else [],
        "edges": package.get("edges") if isinstance(package.get("edges"), list) else [],
        "barriers": package.get("barriers") if isinstance(package.get("barriers"), list) else [],
    }


def validate_import_ledger(
    ledger: Any,
    file_ids: set[str],
    node_ids: set[str],
    nodes: list[Any],
) -> list[ProjectValidationIssue]:
    if ledger is None:
        return []
    if not isinstance(ledger, dict):
        return [
            ProjectValidationIssue("error", "invalid_import_ledger", "importLedger must be an object when present."),
        ]

    issues: list[ProjectValidationIssue] = []
    if ledger.get("schemaVersion") != 1:
        issues.append(ProjectValidationIssue("error", "invalid_import_ledger_schema", "importLedger.schemaVersion must be 1."))

    entries = ledger.get("entries")
    if not isinstance(entries, list):
        issues.append(ProjectValidationIssue("error", "invalid_import_ledger_entries", "importLedger.entries must be an array."))
        return issues

    entry_ids: set[str] = set()
    covered_node_ids: set[str] = set()
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            issues.append(ProjectValidationIssue("error", "invalid_import_ledger_entry", f"importLedger.entries[{index}] must be an object."))
            continue

        entry_id = entry.get("id")
        if not isinstance(entry_id, str) or not entry_id:
            issues.append(ProjectValidationIssue("error", "invalid_import_ledger_entry_id", f"importLedger.entries[{index}].id is required."))
        elif entry_id in entry_ids:
            issues.append(ProjectValidationIssue("error", "duplicate_import_ledger_entry_id", f"Duplicate import ledger entry id: {entry_id}."))
        else:
            entry_ids.add(entry_id)

        file_id = entry.get("fileId")
        if not isinstance(file_id, str) or not file_id:
            issues.append(ProjectValidationIssue("error", "invalid_import_ledger_file_id", f"importLedger.entries[{index}].fileId is required."))
        elif file_id not in file_ids:
            issues.append(ProjectValidationIssue("warning", "import_ledger_missing_file", f"importLedger.entries[{index}].fileId references missing file {file_id}."))

        if entry.get("status") not in {"registered", "staged", "failed"}:
            issues.append(ProjectValidationIssue("error", "invalid_import_ledger_status", f"importLedger.entries[{index}].status is not supported."))

        if entry.get("candidateId") is not None and not isinstance(entry.get("candidateId"), str):
            issues.append(ProjectValidationIssue("error", "invalid_import_ledger_candidate_id", f"importLedger.entries[{index}].candidateId must be a string when present."))

        if entry.get("objectIndex") is not None:
            object_index = optional_int(entry.get("objectIndex"))
            if object_index is None or object_index < 0:
                issues.append(ProjectValidationIssue("error", "invalid_import_ledger_object_index", f"importLedger.entries[{index}].objectIndex must be a non-negative integer."))

        registered_node_ids = entry.get("registeredNodeIds")
        if not isinstance(registered_node_ids, list):
            issues.append(ProjectValidationIssue("error", "invalid_import_ledger_node_ids", f"importLedger.entries[{index}].registeredNodeIds must be an array."))
            continue
        for node_ref in registered_node_ids:
            if not isinstance(node_ref, str) or not node_ref:
                issues.append(ProjectValidationIssue("error", "invalid_import_ledger_node_id", f"importLedger.entries[{index}].registeredNodeIds contains an invalid node id."))
            elif node_ref not in node_ids:
                issues.append(ProjectValidationIssue("warning", "import_ledger_missing_node", f"importLedger.entries[{index}] references missing node {node_ref}."))
            else:
                covered_node_ids.add(node_ref)

        warning_codes = entry.get("warningCodes")
        if warning_codes is not None and not isinstance(warning_codes, list):
            issues.append(ProjectValidationIssue("error", "invalid_import_ledger_warning_codes", f"importLedger.entries[{index}].warningCodes must be an array when present."))

    if entry_ids:
        for index, node in enumerate(nodes):
            if not isinstance(node, dict):
                continue
            node_id = node.get("id")
            if not isinstance(node_id, str) or node_id not in node_ids:
                continue
            has_import_provenance = bool(node.get("sourceCandidateId")) or node.get("sourceObjectIndex") is not None
            if has_import_provenance and node_id not in covered_node_ids:
                issues.append(ProjectValidationIssue("warning", "node_missing_import_ledger", f"nodes[{index}] has import provenance but is not referenced by importLedger."))

    return issues


def validate_stored_source_file(project_root: Path, stored_path: str, file: dict[str, Any], index: int) -> list[ProjectValidationIssue]:
    issues: list[ProjectValidationIssue] = []
    source_path = project_root / project_relative_path(stored_path)
    if not source_path.is_file():
        return [
            ProjectValidationIssue("warning", "source_missing", f"files[{index}].storedPath does not exist in the workspace folder."),
        ]

    stats = source_path.stat()
    expected_size = optional_file_size(file.get("size"))
    if expected_size is not None and expected_size != stats.st_size:
        issues.append(ProjectValidationIssue(
            "warning",
            "source_size_mismatch",
            f"files[{index}].size is {expected_size} but stored source is {stats.st_size} bytes.",
        ))

    expected_checksum = sha256_checksum_value(file.get("checksum"))
    if expected_checksum and expected_checksum != sha256_file(source_path):
        issues.append(ProjectValidationIssue("warning", "source_checksum_mismatch", f"files[{index}].checksum does not match the stored source."))

    return issues


def validate_export_manifest(project_root: Path) -> list[ProjectValidationIssue]:
    manifest_path = project_root / EXPORT_MANIFEST_PATH
    if not manifest_path.exists():
        return [
            ProjectValidationIssue("warning", "export_manifest_invalid", "exports/manifest.json is missing."),
        ]

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf8"))
    except (json.JSONDecodeError, OSError) as exc:
        return [
            ProjectValidationIssue("warning", "export_manifest_invalid", f"exports/manifest.json could not be read: {exc}"),
        ]

    if not isinstance(manifest, dict) or not isinstance(manifest.get("artifacts"), list):
        return [
            ProjectValidationIssue("warning", "export_manifest_invalid", "exports/manifest.json must contain an artifacts array."),
        ]

    issues: list[ProjectValidationIssue] = []
    for index, artifact in enumerate(manifest["artifacts"]):
        if not isinstance(artifact, dict):
            issues.append(ProjectValidationIssue("warning", "export_manifest_invalid", f"artifacts[{index}] must be an object."))
            continue
        artifact_path = artifact.get("path")
        if not is_safe_project_path(artifact_path):
            issues.append(ProjectValidationIssue("error", "unsafe_artifact_path", f"artifacts[{index}].path must be project-relative."))
            continue

        full_path = project_root / project_relative_path(artifact_path)
        if not full_path.is_file():
            issues.append(ProjectValidationIssue("warning", "artifact_missing", f"artifacts[{index}].path does not exist in the workspace folder."))
            continue

        stats = full_path.stat()
        expected_size = optional_file_size(artifact.get("size"))
        if expected_size is not None and expected_size != stats.st_size:
            issues.append(ProjectValidationIssue(
                "warning",
                "artifact_size_mismatch",
                f"artifacts[{index}].size is {expected_size} but stored artifact is {stats.st_size} bytes.",
            ))

        expected_checksum = sha256_checksum_value(artifact.get("checksum"))
        if expected_checksum and expected_checksum != sha256_file(full_path):
            issues.append(ProjectValidationIssue("warning", "artifact_checksum_mismatch", f"artifacts[{index}].checksum does not match the stored artifact."))

    return issues


def project_validation_result(package: dict[str, Any] | None, issues: list[ProjectValidationIssue]) -> dict[str, Any]:
    return {
        "valid": not any(issue.severity == "error" for issue in issues),
        "summary": project_summary(package),
        "issues": [asdict(issue) for issue in issues],
    }


def project_summary(package: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(package, dict):
        return {
            "projectId": None,
            "projectLabel": None,
            "fileCount": 0,
            "nodeCount": 0,
            "edgeCount": 0,
            "barrierCount": 0,
            "storedSourceCount": 0,
            "importLedgerEntryCount": 0,
        }
    project = package.get("project") if isinstance(package.get("project"), dict) else {}
    files = package.get("files") if isinstance(package.get("files"), list) else []
    flattened = flatten_project_graph(package)
    nodes = flattened["nodes"]
    edges = flattened["edges"]
    barriers = flattened["barriers"]
    import_ledger = package.get("importLedger") if isinstance(package.get("importLedger"), dict) else {}
    import_ledger_entries = import_ledger.get("entries") if isinstance(import_ledger.get("entries"), list) else []
    return {
        "projectId": project.get("id") if isinstance(project, dict) else None,
        "projectLabel": project.get("label") if isinstance(project, dict) else None,
        "fileCount": len(files),
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "barrierCount": len(barriers),
        "storedSourceCount": sum(1 for file in files if isinstance(file, dict) and file.get("storedPath")),
        "importLedgerEntryCount": len(import_ledger_entries),
    }


def sanitize_project_package(package: dict[str, Any]) -> dict[str, Any]:
    files = package.get("files") if isinstance(package.get("files"), list) else []
    return {
        **package,
        "files": [strip_source_path(file) if isinstance(file, dict) else file for file in files],
    }


def strip_source_path(file: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in file.items() if key != "sourcePath"}


def stable_project_json(package: dict[str, Any]) -> str:
    return f"{json.dumps(package, indent=2, sort_keys=True)}\n"


def materialize_project_sources(project_directory: Path, package: dict[str, Any]) -> dict[str, Any]:
    files = package.get("files") if isinstance(package.get("files"), list) else []
    next_files: list[Any] = []
    for file in files:
        if not isinstance(file, dict):
            next_files.append(file)
            continue

        stored_path = file.get("storedPath")
        if not is_safe_project_path(stored_path):
            next_files.append(file)
            continue

        source_path = project_directory / project_relative_path(stored_path)
        if not source_path.exists() and isinstance(file.get("preview"), str):
            source_path.parent.mkdir(parents=True, exist_ok=True)
            source_path.write_text(file["preview"], encoding="utf8")

        if source_path.is_file():
            stats = source_path.stat()
            next_files.append({
                **file,
                "size": stats.st_size,
                "checksum": f"sha256:{sha256_file(source_path)}",
            })
        else:
            next_files.append(file)

    return {
        **package,
        "files": next_files,
    }


def write_project_manifest(project_directory: Path, package: dict[str, Any]) -> None:
    files = package.get("files") if isinstance(package.get("files"), list) else []
    manifest = {
        "schemaVersion": 1,
        "packageKind": "rxnflow-project-directory",
        "project": package.get("project"),
        "savedAt": package.get("savedAt"),
        "stateFile": str(PROJECT_STATE_FILE),
        "sourcesDirectory": "sources",
        "exportsDirectory": "exports",
        "sources": [
            {
                "id": file.get("id"),
                "name": file.get("name"),
                "kind": file.get("kind"),
                "size": file.get("size"),
                "checksum": file.get("checksum"),
                "status": file.get("status"),
                "storedPath": file.get("storedPath"),
            }
            for file in files
            if isinstance(file, dict)
        ],
    }
    (project_directory / PROJECT_MANIFEST_FILE).write_text(stable_project_json(manifest), encoding="utf8")


def ensure_export_manifest(project_directory: Path, package: dict[str, Any]) -> None:
    manifest_path = project_directory / EXPORT_MANIFEST_PATH
    if manifest_path.exists():
        return
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schemaVersion": 1,
        "packageKind": "rxnflow-export-artifacts",
        "project": package.get("project"),
        "artifacts": [],
    }
    manifest_path.write_text(stable_project_json(manifest), encoding="utf8")


def is_safe_project_path(value: Any) -> bool:
    try:
        project_relative_path(value)
    except ValueError:
        return False
    return True


def project_relative_path(value: Any) -> Path:
    if not isinstance(value, str) or not value:
        raise ValueError("Project path must be a non-empty string.")
    normalized = value.replace("\\", "/")
    if "\0" in normalized or normalized.startswith("/") or normalized.startswith("~") or re.match(r"^[A-Za-z]:", normalized):
        raise ValueError("Project path must be relative.")
    parts = normalized.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise ValueError("Project path contains an unsafe segment.")
    return Path(*parts)


def optional_file_size(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 0:
        return value
    if isinstance(value, float) and math.isfinite(value) and value >= 0 and value.is_integer():
        return int(value)
    return None


def sha256_checksum_value(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    match = SHA256_CHECKSUM_PATTERN.fullmatch(value)
    return match.group(1).lower() if match else None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def string_or_default(value: Any, default: str) -> str:
    return value if isinstance(value, str) and value else default


def optional_string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def optional_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return int(value)
    return None


def optional_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return None


def optional_float_from_text(value: str | None) -> float | None:
    if value is None or EXTXYZ_NUMBER_PATTERN.fullmatch(value.strip()) is None:
        return None
    parsed = float(value.strip().replace("D", "E").replace("d", "e"))
    return parsed if math.isfinite(parsed) else None


def optional_int_from_text(value: str | None) -> int | None:
    parsed = optional_float_from_text(value)
    return int(parsed) if parsed is not None and parsed.is_integer() else None


def list_or_empty(value: Any) -> list[Any]:
    return list(value) if isinstance(value, (list, tuple)) else []


def energy_unit_or_default(value: Any, default: EnergyUnit) -> EnergyUnit:
    return value if value in {"kcal/mol", "hartree"} else default


def node_kind_or_default(value: Any, default: NodeKind) -> NodeKind:
    return value if value in {"reactant", "transition", "intermediate", "product"} else default


def parse_source_preview(
    name: str,
    preview: str,
    parse_scope: ParseScope = "preview",
    confidence: ParseConfidence = "low",
) -> SourceParseResult:
    label = basename_without_extension(name)
    guessed_kind = infer_node_kind(name)
    gaussian = parse_gaussian(preview)
    if gaussian:
        energy_gas, energy_solution, method = gaussian
        atoms = gaussian_atoms_from_text(preview)
        formula = infer_formula_from_text(preview) or (formula_from_atoms(atoms) if atoms else "pending")
        charge, spin = gaussian_charge_multiplicity(preview)
        energy_table = gaussian_energy_table(preview)
        return source_result_from_candidates(
            label=label,
            source_kind="Gaussian",
            kind=guessed_kind,
            solvent=infer_solvent(preview),
            parser_id=parser_id_for_scope("gaussian-log-text", parse_scope),
            parser_version=PARSER_VERSION,
            candidates=(
                parse_candidate(
                    object_index=0,
                    label=label,
                    formula=formula,
                    method=method,
                    energy_gas=energy_gas,
                    energy_solution=energy_solution,
                    energy_unit="hartree",
                    coordinate_preview=coordinate_preview_from_atoms(atoms),
                    role_hint=role_hint_from_name(name),
                    charge=charge,
                    spin_multiplicity=spin,
                    energy_table=energy_table,
                ),
            ),
            energy_table=energy_table,
            parse_scope=parse_scope,
            confidence=confidence,
        )

    orca = parse_orca(preview)
    if orca:
        energy_gas, energy_solution = orca
        atoms = orca_atoms_from_text(preview)
        charge, spin = orca_charge_multiplicity(preview)
        energy_table = orca_energy_table(preview)
        return source_result_from_candidates(
            label=label,
            source_kind="ORCA",
            kind=guessed_kind,
            solvent=infer_solvent(preview),
            parser_id=parser_id_for_scope("orca-output-text", parse_scope),
            parser_version=PARSER_VERSION,
            candidates=(
                parse_candidate(
                    object_index=0,
                    label=label,
                    formula=infer_formula_from_text(preview) or (formula_from_atoms(atoms) if atoms else "pending"),
                    method=orca_method_from_text(preview) or "ORCA single point",
                    energy_gas=energy_gas,
                    energy_solution=energy_solution,
                    energy_unit="hartree",
                    coordinate_preview=coordinate_preview_from_atoms(atoms),
                    role_hint=role_hint_from_name(name),
                    charge=charge,
                    spin_multiplicity=spin,
                    energy_table=energy_table,
                ),
            ),
            energy_table=energy_table,
            parse_scope=parse_scope,
            confidence=confidence,
        )

    extxyz = parse_extxyz_preview(name, preview)
    if extxyz is not None:
        return source_result_from_candidates(
            label=label,
            source_kind="extxyz",
            kind=guessed_kind,
            solvent="unassigned",
            parser_id="xyz-ase-text-preview",
            parser_version=PARSER_VERSION,
            candidates=extxyz[0],
            warnings=extxyz[1],
            parse_scope=parse_scope,
            confidence=confidence,
        )

    maple = parse_maple_preview(name, preview)
    if maple is not None:
        return source_result_from_candidates(
            label=label,
            source_kind="MAPLE",
            kind=guessed_kind,
            solvent="unassigned",
            parser_id="maple-output-text-preview",
            parser_version=PARSER_VERSION,
            candidates=maple[0],
            warnings=maple[1],
            parse_scope=parse_scope,
            confidence=confidence,
        )

    xyz = parse_xyz_preview(name, preview)
    if xyz:
        return source_result_from_candidates(
            label=label,
            source_kind="XYZ",
            kind=guessed_kind,
            solvent="unassigned",
            parser_id="xyz-text-preview",
            parser_version=PARSER_VERSION,
            candidates=xyz[0],
            warnings=xyz[1],
            parse_scope=parse_scope,
            confidence=confidence,
        )

    if looks_like_xyz_input(name, preview):
        return failed_source_result(
            label=label,
            source_kind="XYZ",
            kind=guessed_kind,
            parser_id="xyz-text-preview",
            parser_version=PARSER_VERSION,
            warning=ParseWarning("parse_failed", "XYZ atom count does not match the number of coordinate lines.", name),
            parse_scope=parse_scope,
            confidence=confidence,
        )

    return SourceParseResult(
        label=label,
        sourceKind="Raw",
        formula="pending",
        kind=guessed_kind,
        method="unparsed source",
        solvent="unassigned",
        energyGas=None,
        energySolution=None,
        energyUnit="kcal/mol",
        parsed=False,
        parserId=None,
        parserVersion=None,
        objectCount=0,
        warnings=(ParseWarning("unsupported_format", f"No supported parser recognized this source {parse_scope}.", name),),
        candidates=(),
        coordinatePreview=None,
        energyTable=None,
        parseScope=parse_scope,
        confidence=confidence,
    )


def failed_source_result(
    *,
    label: str,
    source_kind: str,
    kind: NodeKind,
    parser_id: str,
    parser_version: str,
    warning: ParseWarning,
    parse_scope: ParseScope = "preview",
    confidence: ParseConfidence = "low",
) -> SourceParseResult:
    return SourceParseResult(
        label=label,
        sourceKind=source_kind,
        formula="pending",
        kind=kind,
        method="unparsed source",
        solvent="unassigned",
        energyGas=None,
        energySolution=None,
        energyUnit="kcal/mol",
        parsed=False,
        parserId=parser_id,
        parserVersion=parser_version,
        objectCount=0,
        warnings=(warning,),
        candidates=(),
        coordinatePreview=None,
        energyTable=None,
        parseScope=parse_scope,
        confidence=confidence,
    )


def source_result_from_candidates(
    *,
    label: str,
    source_kind: str,
    kind: NodeKind,
    solvent: str,
    parser_id: str,
    parser_version: str,
    candidates: tuple[ParseCandidate, ...],
    warnings: tuple[ParseWarning, ...] = (),
    energy_table: ParsedEnergyTableData | None = None,
    parse_scope: ParseScope = "preview",
    confidence: ParseConfidence = "low",
) -> SourceParseResult:
    primary = primary_candidate(candidates)
    result_warnings = tuple(sorted(warnings, key=lambda warning: warning.code))
    if len(candidates) > 1:
        result_warnings = (
            *result_warnings,
            ParseWarning("candidate_selection_available", f"Parser preview produced {len(candidates)} candidates.", label),
        )
    return SourceParseResult(
        label=primary.label,
        sourceKind=source_kind,
        formula=primary.formula,
        kind=kind,
        method=primary.method,
        solvent=solvent,
        energyGas=primary.energyGas,
        energySolution=primary.energySolution,
        energyUnit=primary.energyUnit,
        parsed=True,
        parserId=parser_id,
        parserVersion=parser_version,
        objectCount=len(candidates),
        warnings=result_warnings,
        candidates=candidates,
        coordinatePreview=primary.coordinatePreview,
        energyTable=energy_table or primary.energyTable,
        parseScope=parse_scope,
        confidence=confidence,
    )


def primary_candidate(candidates: tuple[ParseCandidate, ...]) -> ParseCandidate:
    final = next((candidate for candidate in reversed(candidates) if candidate.roleHint == "final"), None)
    return final or candidates[-1]


def parse_candidate(
    *,
    object_index: int,
    label: str,
    formula: str,
    method: str,
    energy_gas: float | None,
    energy_solution: float | None,
    energy_unit: EnergyUnit,
    coordinate_preview: CoordinatePreview | None,
    role_hint: str,
    charge: int | None = None,
    spin_multiplicity: int | None = None,
    warnings: tuple[ParseWarning, ...] = (),
    energy_table: ParsedEnergyTableData | None = None,
) -> ParseCandidate:
    return ParseCandidate(
        candidateId=f"candidate-{object_index + 1}-{safe_identifier(label)}",
        objectIndex=object_index,
        label=label,
        formula=formula,
        charge=charge,
        spinMultiplicity=spin_multiplicity,
        method=method,
        energyGas=energy_gas,
        energySolution=energy_solution,
        energyUnit=energy_unit,
        coordinatePreview=coordinate_preview,
        roleHint=role_hint,
        warnings=warnings,
        energyTable=energy_table,
    )


def parse_extxyz_preview(name: str, preview: str) -> tuple[tuple[ParseCandidate, ...], tuple[ParseWarning, ...]] | None:
    frames = parse_xyz_frames(preview, name)
    if not frames or not any(looks_like_extxyz_comment(comment) for _, comment, _, _ in frames):
        return None

    candidates: list[ParseCandidate] = []
    warnings: list[ParseWarning] = []
    for index, frame in enumerate(frames):
        atoms, comment, _comment_energy, _comment_warnings = frame
        metadata = parse_extxyz_metadata(comment)
        energy_gas, frame_warnings = extxyz_energy_from_metadata(metadata, name)
        warnings.extend(frame_warnings)
        role_hint = "final" if len(frames) > 1 and index == len(frames) - 1 else "path-point" if len(frames) > 1 else role_hint_from_name(name)
        label = metadata.get("label") or (f"{basename_without_extension(name)} frame {index + 1}" if len(frames) > 1 else basename_without_extension(name))
        candidates.append(
            parse_candidate(
                object_index=index,
                label=label[:80],
                formula=formula_from_atoms(atoms),
                method="ASE extxyz",
                energy_gas=energy_gas,
                energy_solution=None,
                energy_unit="hartree" if energy_gas is not None else "kcal/mol",
                coordinate_preview=coordinate_preview_from_atoms(atoms),
                role_hint=role_hint,
                charge=optional_int_from_text(metadata.get("charge")),
                spin_multiplicity=optional_int_from_text(metadata.get("spin_multiplicity") or metadata.get("spin")),
                warnings=tuple(frame_warnings),
            )
        )
    return tuple(candidates), tuple(warnings)


def parse_extxyz_metadata(comment: str) -> dict[str, str]:
    metadata: dict[str, str] = {}
    for match in EXTXYZ_METADATA_PATTERN.finditer(comment):
        raw_value = match.group(2)
        if len(raw_value) >= 2 and raw_value[0] == raw_value[-1] and raw_value[0] in {"'", '"'}:
            raw_value = raw_value[1:-1]
        metadata[match.group(1)] = raw_value
    return metadata


def extxyz_energy_from_metadata(metadata: dict[str, str], target: str) -> tuple[float | None, list[ParseWarning]]:
    raw_energy = metadata.get("energy")
    if raw_energy is None:
        return None, [ParseWarning("missing_section", "extxyz frame does not include energy metadata.", target)]
    energy = optional_float_from_text(raw_energy)
    if energy is None:
        return None, [ParseWarning("ambiguous_value", "extxyz energy metadata is not numeric.", target)]
    return energy * EV_TO_HARTREE, [
        ParseWarning("unit_assumed", "extxyz energy metadata was treated as eV and converted to hartree.", target),
    ]


def parse_maple_preview(name: str, preview: str) -> tuple[tuple[ParseCandidate, ...], tuple[ParseWarning, ...]] | None:
    if looks_like_maple_xyz(preview):
        parsed = parse_xyz_preview(name, preview, source_method="MAPLE trajectory", default_energy_unit="hartree")
        return parsed

    if any(marker in preview[:8000] for marker in MAPLE_BANNER_MARKERS):
        atoms = last_maple_coordinate_block(preview)
        if not atoms:
            return None
        energy = last_maple_output_energy(preview)
        task = first_group(MAPLE_TASK_PATTERN, preview)
        model = first_group(MAPLE_MODEL_PATTERN, preview)
        method = " ".join(part for part in (task, model) if part) or "MAPLE output"
        label = f"MAPLE {task}".strip() if task else basename_without_extension(name)
        warnings: tuple[ParseWarning, ...] = ()
        if energy is None:
            warnings = (ParseWarning("missing_section", "MAPLE output does not contain an electronic energy.", name),)
        return (
            (
                parse_candidate(
                    object_index=0,
                    label=label,
                    formula=formula_from_atoms(atoms),
                    method=method,
                    energy_gas=energy,
                    energy_solution=None,
                    energy_unit="hartree" if energy is not None else "kcal/mol",
                    coordinate_preview=coordinate_preview_from_atoms(atoms),
                    role_hint=role_hint_from_name(name),
                    warnings=warnings,
                ),
            ),
            warnings,
        )

    energy = parse_maple(preview)
    if energy is None:
        return None
    return (
        (
            parse_candidate(
                object_index=0,
                label=basename_without_extension(name),
                formula=infer_formula_from_text(preview) or "pending",
                method="MAPLE IRC",
                energy_gas=energy,
                energy_solution=None,
                energy_unit="hartree",
                coordinate_preview=None,
                role_hint=role_hint_from_name(name),
            ),
        ),
        (),
    )


def parse_xyz_preview(
    name: str,
    preview: str,
    source_method: str = "XYZ geometry",
    default_energy_unit: str | None = None,
) -> tuple[tuple[ParseCandidate, ...], tuple[ParseWarning, ...]] | None:
    frames = parse_xyz_frames(preview, name, default_energy_unit=default_energy_unit)
    if not frames:
        return None
    candidates: list[ParseCandidate] = []
    warnings: list[ParseWarning] = []
    for index, frame in enumerate(frames):
        atoms, comment, energy_gas, energy_warnings = frame
        frame_warnings: tuple[ParseWarning, ...] = energy_warnings
        if energy_gas is None:
            frame_warnings = (*frame_warnings, ParseWarning("missing_section", "XYZ frame does not include an electronic energy.", name))
        if frame_warnings:
            warnings.extend(frame_warnings)
        role_hint = "final" if len(frames) > 1 and index == len(frames) - 1 else "path-point" if len(frames) > 1 else role_hint_from_name(name)
        candidates.append(
            parse_candidate(
                object_index=index,
                label=xyz_frame_label(name, comment, index, len(frames)),
                formula=formula_from_atoms(atoms),
                method=source_method,
                energy_gas=energy_gas,
                energy_solution=None,
                energy_unit="hartree" if energy_gas is not None else "kcal/mol",
                coordinate_preview=coordinate_preview_from_atoms(atoms),
                role_hint=role_hint,
                warnings=frame_warnings,
            )
        )
    return tuple(candidates), tuple(warnings)


def parser_id_for_scope(base_id: str, parse_scope: ParseScope) -> str:
    suffix = "full-file" if parse_scope == "full-file" else "preview"
    return f"{base_id}-{suffix}"


def parse_gaussian(preview: str) -> tuple[float, float | None, str] | None:
    match = last_match(GAUSSIAN_SCF_PATTERN, preview)
    if not match:
        return None
    energy_gas = parse_number(match.group(2))
    if energy_gas is None:
        return None
    free_energy = number_from_match(last_match(GAUSSIAN_FREE_ENERGY_PATTERN, preview))
    correction = number_from_match(last_match(GAUSSIAN_GIBBS_CORRECTION_PATTERN, preview))
    if free_energy is not None:
        energy_solution = free_energy
    else:
        energy_solution = energy_gas + correction if correction is not None else None
    method = gaussian_method_from_text(preview) or match.group(1) or "Gaussian"
    return energy_gas, energy_solution, method


def gaussian_energy_table(preview: str) -> ParsedEnergyTableData | None:
    scf_match = last_match(GAUSSIAN_SCF_PATTERN, preview)
    egas = parse_number(scf_match.group(2)) if scf_match else None
    free_energy = number_from_match(last_match(GAUSSIAN_FREE_ENERGY_PATTERN, preview))
    correction = number_from_match(last_match(GAUSSIAN_GIBBS_CORRECTION_PATTERN, preview))
    ggas = free_energy if free_energy is not None else (egas + correction if egas is not None and correction is not None else None)
    basis = optional_int_from_text(first_group(GAUSSIAN_BASIS_FUNCTION_PATTERN, preview))
    table = ParsedEnergyTableData(
        egasHartree=egas,
        gasBasisFunctions=basis,
        ggasHartree=ggas,
        ggas1mHartree=ggas + ONE_M_STANDARD_STATE_CORRECTION_HARTREE if ggas is not None else None,
        standardStateCorrectionHartree=ONE_M_STANDARD_STATE_CORRECTION_HARTREE if ggas is not None else None,
    )
    return table if energy_table_has_value(table) else None


def parse_orca(preview: str) -> tuple[float, float | None] | None:
    energy_gas = number_from_match(last_match(ORCA_ENERGY_PATTERN, preview))
    if energy_gas is None:
        energy_gas = number_from_match(last_match(ORCA_TOTAL_ENERGY_PATTERN, preview))
    if energy_gas is None:
        return None
    solvation = number_from_match(last_match(ORCA_SOLVATION_PATTERN, preview))
    return energy_gas, energy_gas + solvation if solvation is not None else None


def orca_energy_table(preview: str) -> ParsedEnergyTableData | None:
    egas = number_from_match(last_match(ORCA_ENERGY_PATTERN, preview))
    if egas is None:
        egas = number_from_match(last_match(ORCA_TOTAL_ENERGY_PATTERN, preview))
    basis = optional_int_from_text(first_group(ORCA_BASIS_FUNCTION_PATTERN, preview))
    table = ParsedEnergyTableData(
        egasHartree=egas,
        gasBasisFunctions=basis,
    )
    return table if energy_table_has_value(table) else None


def orca_atoms_from_text(preview: str) -> list[CoordinateAtom]:
    lines = preview.splitlines()
    best_atoms: list[CoordinateAtom] = []
    for index, line in enumerate(lines):
        if "CARTESIAN COORDINATES" not in line.upper():
            continue
        atoms = orca_coordinate_block(lines, index + 1)
        if atoms:
            best_atoms = atoms
    return best_atoms


def orca_coordinate_block(lines: list[str], start: int) -> list[CoordinateAtom]:
    atoms: list[CoordinateAtom] = []
    for line in lines[start:]:
        trimmed = line.strip()
        if not trimmed:
            if atoms:
                break
            continue
        if set(trimmed) == {"-"}:
            continue
        parts = trimmed.split()
        symbol: str | None = None
        if parts and re.fullmatch(r"[A-Z][a-z]?", parts[0]):
            symbol = parts[0]
        elif len(parts) > 1 and parts[0].isdigit() and re.fullmatch(r"[A-Z][a-z]?", parts[1]):
            symbol = parts[1]
        if symbol is None:
            if atoms:
                break
            continue
        coordinates = parts[-3:]
        try:
            if len(coordinates) < 3:
                raise ValueError
            x = float(coordinates[0].replace("D", "E").replace("d", "E"))
            y = float(coordinates[1].replace("D", "E").replace("d", "E"))
            z = float(coordinates[2].replace("D", "E").replace("d", "E"))
        except ValueError:
            if atoms:
                break
            continue
        atoms.append(CoordinateAtom(symbol, x, y, z))
    return atoms


def orca_charge_multiplicity(preview: str) -> tuple[int | None, int | None]:
    xyz_match = ORCA_XYZ_DIRECTIVE_PATTERN.search(preview)
    if xyz_match is not None:
        return int(xyz_match.group(1)), int(xyz_match.group(2))
    charge = optional_int_from_text(first_group(ORCA_CHARGE_PATTERN, preview))
    multiplicity = optional_int_from_text(first_group(ORCA_MULTIPLICITY_PATTERN, preview))
    return charge, multiplicity


def orca_method_from_text(preview: str) -> str | None:
    route = first_group(ORCA_ROUTE_PATTERN, preview)
    if route is None:
        return None
    return " ".join(route.split()[:4])


def parse_maple(preview: str) -> float | None:
    matches = list(MAPLE_POINT_PATTERN.finditer(preview))
    if not matches:
        return None
    return float(matches[-1].group(1))


def parse_xyz(preview: str) -> tuple[str, float | None] | None:
    lines = [line.strip() for line in preview.splitlines()]
    if not lines:
        return None
    try:
      atom_count = int(lines[0])
    except ValueError:
        return None
    if atom_count <= 0 or len(lines) < atom_count + 2:
        return None
    atoms = []
    for line in lines[2:2 + atom_count]:
        symbol = line.split()[0] if line.split() else ""
        if not re.fullmatch(r"[A-Z][a-z]?", symbol):
            return None
        atoms.append(symbol)
    return formula_from_atoms(atoms), number_from_match(COMMENT_ENERGY_PATTERN.search(lines[1] if len(lines) > 1 else ""))


def parse_xyz_frames(
    preview: str,
    target: str = "XYZ frame",
    default_energy_unit: str | None = None,
) -> list[tuple[list[CoordinateAtom], str, float | None, tuple[ParseWarning, ...]]]:
    lines = [line.rstrip() for line in preview.splitlines()]
    frames: list[tuple[list[CoordinateAtom], str, float | None, tuple[ParseWarning, ...]]] = []
    index = 0
    while index < len(lines):
        if not lines[index].strip():
            index += 1
            continue
        try:
            atom_count = int(lines[index].strip())
        except ValueError:
            return []
        comment_index = index + 1
        if atom_count <= 0 or comment_index >= len(lines):
            return []
        atom_lines = lines[comment_index + 1:comment_index + 1 + atom_count]
        if len(atom_lines) != atom_count:
            return []
        atoms: list[CoordinateAtom] = []
        for line in atom_lines:
            parts = line.split()
            if len(parts) < 4 or not re.fullmatch(r"[A-Z][a-z]?", parts[0]):
                return []
            try:
                x = float(parts[1])
                y = float(parts[2])
                z = float(parts[3])
            except ValueError:
                return []
            atoms.append(CoordinateAtom(parts[0], x, y, z))
        comment = lines[comment_index].strip()
        energy_gas, energy_warnings = xyz_energy_from_comment(comment, target, default_energy_unit=default_energy_unit)
        frames.append((atoms, comment, energy_gas, energy_warnings))
        index = comment_index + 1 + atom_count
    return frames


def xyz_energy_from_comment(
    comment: str,
    target: str,
    default_energy_unit: str | None = None,
) -> tuple[float | None, tuple[ParseWarning, ...]]:
    match = COMMENT_ENERGY_PATTERN.search(comment)
    if match is None:
        return None, ()
    value = parse_number(match.group(1))
    if value is None:
        return None, (ParseWarning("ambiguous_value", "XYZ energy comment is not numeric.", target),)
    unit = (match.group(2) or default_energy_unit or "").lower()
    if unit in {"hartree", "ha"}:
        return value, ()
    if unit == "ev":
        return value * EV_TO_HARTREE, ()
    return value, (ParseWarning("unit_assumed", "XYZ energy comment did not include a unit; assumed hartree.", target),)


def xyz_frame_label(name: str, comment: str, index: int, total: int) -> str:
    frame_label = first_group(XYZ_FRAME_LABEL_PATTERN, comment)
    if frame_label:
        return frame_label[:80]
    if comment and not COMMENT_ENERGY_PATTERN.fullmatch(comment):
        return comment[:80]
    if total > 1:
        return f"{basename_without_extension(name)} frame {index + 1}"
    return basename_without_extension(name)


def looks_like_extxyz_comment(comment: str) -> bool:
    return "Properties=" in comment or "Lattice=" in comment


def looks_like_xyz_input(name: str, preview: str) -> bool:
    if not name.lower().endswith(".xyz"):
        return False
    first_line = next((line.strip() for line in preview.splitlines() if line.strip()), "")
    try:
        int(first_line)
    except ValueError:
        return False
    return True


def looks_like_maple_xyz(preview: str) -> bool:
    lines = [line.strip() for line in preview.splitlines() if line.strip()]
    return len(lines) >= 2 and lines[0].isdigit() and MAPLE_XYZ_COMMENT_PATTERN.search(lines[1]) is not None


def last_maple_coordinate_block(preview: str) -> list[CoordinateAtom]:
    blocks: list[list[CoordinateAtom]] = []
    current: list[CoordinateAtom] = []
    for line in preview.splitlines():
        match = MAPLE_COORDINATE_PATTERN.match(line)
        if match is None:
            if current:
                blocks.append(current)
                current = []
            continue
        current.append(CoordinateAtom(match.group(1), float(match.group(2)), float(match.group(3)), float(match.group(4))))
    if current:
        blocks.append(current)
    return blocks[-1] if blocks else []


def last_maple_output_energy(preview: str) -> float | None:
    matches = list(MAPLE_OUTPUT_ENERGY_PATTERN.finditer(preview))
    if not matches:
        return None
    return float(matches[-1].group(1))


def gaussian_atoms_from_text(preview: str) -> list[CoordinateAtom]:
    lines = preview.splitlines()
    best_atoms: list[CoordinateAtom] = []
    for index, line in enumerate(lines):
        if "Standard orientation:" not in line and "Input orientation:" not in line:
            continue
        atoms = gaussian_orientation_block(lines, index + 1)
        if atoms:
            best_atoms = atoms
    return best_atoms


def gaussian_orientation_block(lines: list[str], start: int) -> list[CoordinateAtom]:
    dash_count = 0
    atoms: list[CoordinateAtom] = []
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
            x = float(parts[3])
            y = float(parts[4])
            z = float(parts[5])
        except ValueError:
            continue
        atoms.append(CoordinateAtom(symbol_from_atomic_number(atomic_number), x, y, z))
    return atoms


def gaussian_charge_multiplicity(preview: str) -> tuple[int | None, int | None]:
    matches = GAUSSIAN_CHARGE_MULTIPLICITY_PATTERN.findall(preview)
    if not matches:
        return None, None
    charge, multiplicity = matches[-1]
    return int(charge), int(multiplicity)


def gaussian_method_from_text(preview: str) -> str | None:
    match = GAUSSIAN_ROUTE_PATTERN.search(preview)
    if match is None:
        return None
    route = match.group(1).strip()
    for token in route.split():
        if "/" in token:
            return token.split("/", 1)[0].strip()
    return None


def coordinate_preview_from_atoms(atoms: list[str | CoordinateAtom]) -> CoordinatePreview | None:
    if not atoms:
        return None
    coordinate_atoms: tuple[CoordinateAtom, ...] = tuple(atoms) if all(isinstance(atom, CoordinateAtom) for atom in atoms) else ()
    return CoordinatePreview(
        atomCount=len(atoms),
        has3d=bool(coordinate_atoms),
        elements=tuple(sorted({atom_element(atom) for atom in atoms})),
        atoms=coordinate_atoms,
        previewKind="text",
    )


def role_hint_from_name(name: str) -> str:
    lower = name.lower()
    if re.search(r"\b(final|product|prod|adduct)\b", lower):
        return "final"
    if re.search(r"\b(ts|transition|saddle)\b", lower):
        return "transition"
    if re.search(r"\b(frame|image|irc|path)\b", lower):
        return "path-point"
    return "unknown"


def first_group(pattern: re.Pattern[str], preview: str) -> str | None:
    match = pattern.search(preview)
    return match.group(1).strip() if match else None


def last_match(pattern: re.Pattern[str], preview: str) -> re.Match[str] | None:
    match: re.Match[str] | None = None
    for match in pattern.finditer(preview):
        pass
    return match


def infer_node_kind(name: str) -> NodeKind:
    lower = name.lower()
    if re.search(r"\b(ts|transition|saddle)\b", lower):
        return "transition"
    if re.search(r"\b(product|adduct|prod)\b", lower):
        return "product"
    if re.search(r"\b(reactant|reagent|substrate)\b", lower):
        return "reactant"
    return "intermediate"


def infer_solvent(preview: str) -> str:
    if re.search(r"toluene", preview, re.IGNORECASE):
        return "Toluene"
    if re.search(r"water|h2o", preview, re.IGNORECASE):
        return "Water"
    if re.search(r"acetonitrile|meCN", preview, re.IGNORECASE):
        return "Acetonitrile"
    if re.search(r"(?:SMD|CPCM|PCM)", preview, re.IGNORECASE):
        return "implicit solvent"
    return "unassigned"


def infer_formula_from_text(preview: str) -> str | None:
    match = FORMULA_PATTERN.search(preview)
    return match.group(1) if match else None


def atom_element(atom: str | CoordinateAtom) -> str:
    return atom if isinstance(atom, str) else atom.element


def formula_from_atoms(atoms: list[str | CoordinateAtom]) -> str:
    counts = Counter(atom_element(atom) for atom in atoms)
    ordered = [atom for atom in ("C", "H") if atom in counts]
    ordered.extend(sorted(atom for atom in counts if atom not in {"C", "H"}))
    return "".join(f"{atom}{'' if counts[atom] == 1 else counts[atom]}" for atom in ordered)


def symbol_from_atomic_number(number: int) -> str:
    if 0 < number < len(ELEMENTS):
        return ELEMENTS[number]
    return f"E{number}"


def safe_identifier(value: str) -> str:
    stem = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return stem or "source"


def number_from_match(match: re.Match[str] | None) -> float | None:
    return parse_number(match.group(1)) if match else None


def parse_number(value: str) -> float | None:
    try:
        parsed = float(value.replace("D", "E").replace("d", "E"))
    except ValueError:
        return None
    return parsed if math.isfinite(parsed) else None


def basename_without_extension(name: str) -> str:
    basename = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if "." in basename:
        return basename.rsplit(".", 1)[0] or basename
    return basename or name


ELEMENTS = (
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
    "Cs",
    "Ba",
    "La",
    "Ce",
    "Pr",
    "Nd",
    "Pm",
    "Sm",
    "Eu",
    "Gd",
    "Tb",
    "Dy",
    "Ho",
    "Er",
    "Tm",
    "Yb",
    "Lu",
    "Hf",
    "Ta",
    "W",
    "Re",
    "Os",
    "Ir",
    "Pt",
    "Au",
    "Hg",
    "Tl",
    "Pb",
    "Bi",
    "Po",
    "At",
    "Rn",
)
