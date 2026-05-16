from __future__ import annotations

from dataclasses import dataclass
import json
import math
from pathlib import Path
from typing import Any

import yaml

from rxnflow.parsers import ParseOptions, ParserRegistry, RawFile
from rxnflow.result import Result

PARSER_FIXTURE_SCHEMA_VERSION = "parser-fixtures-v1"
PARSER_GOLDEN_SCHEMA_VERSION = "parser-golden-v1"
PARSER_SUPPORT_MATRIX_SCHEMA_VERSION = "parser-support-matrix-v1"
SUPPORT_MATRIX_ENTRY_STATUSES = {"supported", "partial", "unsupported", "reference-only"}
SUPPORT_MATRIX_FIELD_STATUSES = {
    "supported",
    "partial",
    "unsupported",
    "not-applicable",
    "reference-only",
}


@dataclass(frozen=True)
class ParserFixtureSource:
    kind: str
    url: str | None
    commit: str | None
    license: str
    redistributable: bool
    redaction: str


@dataclass(frozen=True)
class ParserFixtureTolerances:
    energy_abs: float
    coordinate_abs: float


@dataclass(frozen=True)
class ParserFixture:
    id: str
    program: str
    format: str
    task: str
    parser_id: str
    file: Path
    source: ParserFixtureSource
    parse_options: ParseOptions
    expected_snapshot: Path
    tolerances: ParserFixtureTolerances
    support_status: str
    tags: tuple[str, ...]
    notes: str | None


@dataclass(frozen=True)
class ParserFixtureManifest:
    root: Path
    fixtures: tuple[ParserFixture, ...]

    def executable_fixtures(self) -> tuple[ParserFixture, ...]:
        return tuple(
            fixture
            for fixture in self.fixtures
            if fixture.support_status in {"supported", "partial"}
        )


@dataclass(frozen=True)
class ParserDiagnosticDefinition:
    severity: str
    meaning: str


@dataclass(frozen=True)
class ParserDiagnosticCatalog:
    warning_codes: dict[str, ParserDiagnosticDefinition]
    error_codes: dict[str, ParserDiagnosticDefinition]


@dataclass(frozen=True)
class ParserSupportMatrixEntry:
    id: str
    program: str
    formats: tuple[str, ...]
    tasks: tuple[str, ...]
    versions: tuple[str, ...]
    parser_id: str
    status: str
    fields: dict[str, str]
    fixture_ids: tuple[str, ...]
    observed_warning_codes: tuple[str, ...]
    observed_error_codes: tuple[str, ...]
    known_limits: tuple[str, ...]


@dataclass(frozen=True)
class ParserSupportMatrix:
    root: Path
    diagnostics: ParserDiagnosticCatalog
    entries: tuple[ParserSupportMatrixEntry, ...]

    def covered_fixture_ids(self) -> set[str]:
        return {fixture_id for entry in self.entries for fixture_id in entry.fixture_ids}

    def reference_only_entries(self) -> tuple[ParserSupportMatrixEntry, ...]:
        return tuple(entry for entry in self.entries if entry.status == "reference-only")


def load_parser_fixture_manifest(path: Path) -> ParserFixtureManifest:
    root = path.parent
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise AssertionError("Parser fixture manifest must be a mapping.")
    if payload.get("schema_version") != PARSER_FIXTURE_SCHEMA_VERSION:
        raise AssertionError("Unsupported parser fixture manifest schema_version.")
    raw_fixtures = payload.get("fixtures")
    if not isinstance(raw_fixtures, list):
        raise AssertionError("Parser fixture manifest must contain a fixtures list.")

    seen_ids: set[str] = set()
    fixtures: list[ParserFixture] = []
    for raw_fixture in raw_fixtures:
        if not isinstance(raw_fixture, dict):
            raise AssertionError("Each parser fixture must be a mapping.")
        fixture_id = _required_str(raw_fixture, "id")
        if fixture_id in seen_ids:
            raise AssertionError(f"Duplicate parser fixture id: {fixture_id}")
        seen_ids.add(fixture_id)

        source = _parse_source(raw_fixture.get("source"))
        file_path = _safe_child_path(root, _required_str(raw_fixture, "file"), "file")
        snapshot_path = _safe_child_path(
            root,
            _required_str(raw_fixture, "expected_snapshot"),
            "expected_snapshot",
        )
        if source.redistributable is False:
            raise AssertionError(
                f"Parser fixture {fixture_id} has a local file but is not redistributable."
            )

        fixtures.append(
            ParserFixture(
                id=fixture_id,
                program=_required_str(raw_fixture, "program"),
                format=_required_str(raw_fixture, "format"),
                task=_required_str(raw_fixture, "task"),
                parser_id=_required_str(raw_fixture, "parser_id"),
                file=file_path,
                source=source,
                parse_options=_parse_options(raw_fixture.get("parse_options")),
                expected_snapshot=snapshot_path,
                tolerances=_parse_tolerances(raw_fixture.get("tolerances")),
                support_status=_required_str(raw_fixture, "support_status"),
                tags=tuple(raw_fixture.get("tags") or ()),
                notes=raw_fixture.get("notes"),
            )
        )
    return ParserFixtureManifest(root=root, fixtures=tuple(fixtures))


def load_parser_support_matrix(
    path: Path,
    manifest: ParserFixtureManifest | None = None,
) -> ParserSupportMatrix:
    root = path.parent
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise AssertionError("Parser support matrix must be a mapping.")
    if payload.get("schema_version") != PARSER_SUPPORT_MATRIX_SCHEMA_VERSION:
        raise AssertionError("Unsupported parser support matrix schema_version.")

    diagnostics = _parse_diagnostic_catalog(payload.get("diagnostics"))
    raw_entries = payload.get("entries")
    if not isinstance(raw_entries, list):
        raise AssertionError("Parser support matrix must contain an entries list.")

    manifest_ids = {fixture.id for fixture in manifest.fixtures} if manifest is not None else set()
    entries: list[ParserSupportMatrixEntry] = []
    seen_ids: set[str] = set()
    for raw_entry in raw_entries:
        if not isinstance(raw_entry, dict):
            raise AssertionError("Each parser support matrix entry must be a mapping.")
        entry = _parse_support_matrix_entry(raw_entry, diagnostics, manifest_ids)
        if entry.id in seen_ids:
            raise AssertionError(f"Duplicate parser support matrix entry id: {entry.id}")
        seen_ids.add(entry.id)
        entries.append(entry)

    matrix = ParserSupportMatrix(root=root, diagnostics=diagnostics, entries=tuple(entries))
    if manifest is not None:
        missing = manifest_ids - matrix.covered_fixture_ids()
        if missing:
            raise AssertionError(
                f"Parser support matrix does not cover fixture ids: {sorted(missing)}"
            )
    return matrix


def project_parser_fixture_snapshot(
    registry: ParserRegistry,
    fixture: ParserFixture,
) -> dict[str, Any]:
    raw_file = RawFile(id=fixture.id, name=fixture.file.name, path=fixture.file)
    result = registry.parse(raw_file, fixture.parse_options)
    return _project_parse_result(fixture, result)


def assert_parser_fixture_snapshot(
    registry: ParserRegistry,
    fixture: ParserFixture,
    *,
    update: bool = False,
) -> None:
    actual = project_parser_fixture_snapshot(registry, fixture)
    if update:
        fixture.expected_snapshot.write_text(
            json.dumps(actual, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        return

    expected = json.loads(fixture.expected_snapshot.read_text(encoding="utf-8"))
    _assert_snapshot_equal(
        actual,
        expected,
        fixture=fixture,
        path=(),
    )


def _project_parse_result(fixture: ParserFixture, result: Result[Any]) -> dict[str, Any]:
    if not result.ok or result.value is None:
        error = result.error
        return {
            "schema_version": PARSER_GOLDEN_SCHEMA_VERSION,
            "fixture_id": fixture.id,
            "parser_id": fixture.parser_id,
            "parse_ok": False,
            "error": {
                "code": error.code if error is not None else "internal_error",
                "message": error.message if error is not None else "Parser returned no value.",
                "target": error.target if error is not None else fixture.id,
            },
            "warning_codes": _warning_codes(result),
        }

    parse_result = result.value
    return {
        "schema_version": PARSER_GOLDEN_SCHEMA_VERSION,
        "fixture_id": fixture.id,
        "parser_id": fixture.parser_id,
        "parse_ok": True,
        "object_count": len(parse_result.objects),
        "provenance": {
            "parser_id": parse_result.provenance.parser_id,
            "parser_version": parse_result.provenance.parser_version,
        },
        "objects": [_project_object_draft(obj) for obj in parse_result.objects],
        "warning_codes": _warning_codes(result),
    }


def _project_object_draft(obj: Any) -> dict[str, Any]:
    geometry_sample = []
    if obj.geometry:
        first_atom = obj.geometry[0]
        geometry_sample.append(
            {
                "index": 0,
                "element": first_atom.element,
                "x": first_atom.x,
                "y": first_atom.y,
                "z": first_atom.z,
                "unit": first_atom.unit,
            }
        )
    energy_keys = sorted(obj.energies.keys())
    return {
        "label": obj.label,
        "formula": obj.formula,
        "charge": obj.charge,
        "spin_multiplicity": obj.spin_multiplicity,
        "method": obj.method,
        "atom_count": len(obj.geometry),
        "elements": [atom.element for atom in obj.geometry],
        "geometry_sample": geometry_sample,
        "energy_keys": energy_keys,
        "energies": {
            key: {
                "value": obj.energies[key].value,
                "unit": obj.energies[key].unit,
                "reference": obj.energies[key].reference,
            }
            for key in energy_keys
        },
        "thermochemistry_keys": sorted(obj.thermochemistry.keys()),
        "warning_codes": [],
    }


def _warning_codes(result: Result[Any]) -> list[str]:
    return sorted(warning.code for warning in result.warnings)


def _assert_snapshot_equal(
    actual: Any,
    expected: Any,
    *,
    fixture: ParserFixture,
    path: tuple[str, ...],
) -> None:
    if path == ("provenance", "parser_version"):
        return
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            raise AssertionError(_diff_message(path, actual, expected))
        if set(actual.keys()) != set(expected.keys()):
            raise AssertionError(_diff_message(path + ("keys",), sorted(actual.keys()), sorted(expected.keys())))
        for key in expected:
            _assert_snapshot_equal(actual[key], expected[key], fixture=fixture, path=path + (str(key),))
        return
    if isinstance(expected, list):
        if not isinstance(actual, list) or len(actual) != len(expected):
            raise AssertionError(_diff_message(path, actual, expected))
        for index, expected_item in enumerate(expected):
            _assert_snapshot_equal(actual[index], expected_item, fixture=fixture, path=path + (str(index),))
        return
    if isinstance(expected, float):
        tolerance = _tolerance_for_path(path, fixture)
        if not isinstance(actual, (int, float)) or not math.isclose(
            float(actual),
            expected,
            abs_tol=tolerance,
            rel_tol=0.0,
        ):
            raise AssertionError(_diff_message(path, actual, expected))
        return
    if actual != expected:
        raise AssertionError(_diff_message(path, actual, expected))


def _tolerance_for_path(path: tuple[str, ...], fixture: ParserFixture) -> float:
    if "energies" in path and path[-1] == "value":
        return fixture.tolerances.energy_abs
    if "geometry_sample" in path and path[-1] in {"x", "y", "z"}:
        return fixture.tolerances.coordinate_abs
    return 0.0


def _diff_message(path: tuple[str, ...], actual: Any, expected: Any) -> str:
    location = ".".join(path) if path else "<root>"
    return f"Parser fixture snapshot mismatch at {location}: actual={actual!r}, expected={expected!r}"


def _parse_source(raw_source: Any) -> ParserFixtureSource:
    if not isinstance(raw_source, dict):
        raise AssertionError("Parser fixture source must be a mapping.")
    return ParserFixtureSource(
        kind=_required_str(raw_source, "kind"),
        url=raw_source.get("url"),
        commit=raw_source.get("commit"),
        license=_required_str(raw_source, "license"),
        redistributable=bool(raw_source.get("redistributable")),
        redaction=_required_str(raw_source, "redaction"),
    )


def _parse_options(raw_options: Any) -> ParseOptions:
    if raw_options is None:
        return ParseOptions()
    if not isinstance(raw_options, dict):
        raise AssertionError("Parser fixture parse_options must be a mapping.")
    return ParseOptions(
        expected_format=raw_options.get("expected_format"),
        strict=bool(raw_options.get("strict", False)),
        frame_policy=raw_options.get("frame_policy", "all"),
    )


def _parse_tolerances(raw_tolerances: Any) -> ParserFixtureTolerances:
    if not isinstance(raw_tolerances, dict):
        raise AssertionError("Parser fixture tolerances must be a mapping.")
    return ParserFixtureTolerances(
        energy_abs=float(raw_tolerances.get("energy_abs", 0.0)),
        coordinate_abs=float(raw_tolerances.get("coordinate_abs", 0.0)),
    )


def _parse_diagnostic_catalog(raw_diagnostics: Any) -> ParserDiagnosticCatalog:
    if not isinstance(raw_diagnostics, dict):
        raise AssertionError("Parser support matrix diagnostics must be a mapping.")
    return ParserDiagnosticCatalog(
        warning_codes=_parse_diagnostic_definitions(raw_diagnostics.get("warning_codes"), "warning"),
        error_codes=_parse_diagnostic_definitions(raw_diagnostics.get("error_codes"), "error"),
    )


def _parse_diagnostic_definitions(raw_codes: Any, expected_severity: str) -> dict[str, ParserDiagnosticDefinition]:
    if not isinstance(raw_codes, dict) or not raw_codes:
        raise AssertionError(f"Parser support matrix {expected_severity}_codes must be a non-empty mapping.")
    definitions: dict[str, ParserDiagnosticDefinition] = {}
    for code, raw_definition in raw_codes.items():
        if not isinstance(code, str) or not code:
            raise AssertionError("Parser diagnostic code must be a non-empty string.")
        if not isinstance(raw_definition, dict):
            raise AssertionError(f"Parser diagnostic definition for {code} must be a mapping.")
        severity = _required_str(raw_definition, "severity")
        if severity != expected_severity:
            raise AssertionError(f"Parser diagnostic {code} severity must be {expected_severity}.")
        definitions[code] = ParserDiagnosticDefinition(
            severity=severity,
            meaning=_required_str(raw_definition, "meaning"),
        )
    return definitions


def _parse_support_matrix_entry(
    raw_entry: dict[str, Any],
    diagnostics: ParserDiagnosticCatalog,
    manifest_ids: set[str],
) -> ParserSupportMatrixEntry:
    entry_id = _required_str(raw_entry, "id")
    status = _required_str(raw_entry, "status")
    if status not in SUPPORT_MATRIX_ENTRY_STATUSES:
        raise AssertionError(f"Unsupported parser support matrix entry status: {status}")

    fields = _parse_field_statuses(raw_entry.get("fields"), entry_id)
    fixture_ids = _required_str_tuple(raw_entry, "fixture_ids", allow_empty=True)
    if status in {"supported", "partial"} and not fixture_ids:
        raise AssertionError(f"Parser support matrix entry {entry_id} must reference at least one fixture.")
    if manifest_ids:
        unknown = set(fixture_ids) - manifest_ids
        if unknown:
            raise AssertionError(
                f"Parser support matrix entry {entry_id} references unknown fixture ids: {sorted(unknown)}"
            )

    warning_codes = _required_str_tuple(raw_entry, "observed_warning_codes", allow_empty=True)
    error_codes = _required_str_tuple(raw_entry, "observed_error_codes", allow_empty=True)
    undefined_warnings = set(warning_codes) - set(diagnostics.warning_codes)
    if undefined_warnings:
        raise AssertionError(
            f"Parser support matrix entry {entry_id} references undefined warning codes: {sorted(undefined_warnings)}"
        )
    undefined_errors = set(error_codes) - set(diagnostics.error_codes)
    if undefined_errors:
        raise AssertionError(
            f"Parser support matrix entry {entry_id} references undefined error codes: {sorted(undefined_errors)}"
        )

    known_limits = _required_str_tuple(raw_entry, "known_limits", allow_empty=True)
    if status == "partial" and not known_limits:
        raise AssertionError(f"Parser support matrix partial entry {entry_id} must describe known_limits.")

    return ParserSupportMatrixEntry(
        id=entry_id,
        program=_required_str(raw_entry, "program"),
        formats=_required_str_tuple(raw_entry, "formats"),
        tasks=_required_str_tuple(raw_entry, "tasks"),
        versions=_required_str_tuple(raw_entry, "versions"),
        parser_id=_required_str(raw_entry, "parser_id"),
        status=status,
        fields=fields,
        fixture_ids=fixture_ids,
        observed_warning_codes=warning_codes,
        observed_error_codes=error_codes,
        known_limits=known_limits,
    )


def _parse_field_statuses(raw_fields: Any, entry_id: str) -> dict[str, str]:
    if not isinstance(raw_fields, dict) or not raw_fields:
        raise AssertionError(f"Parser support matrix entry {entry_id} fields must be a non-empty mapping.")
    fields: dict[str, str] = {}
    for field, status in raw_fields.items():
        if not isinstance(field, str) or not field:
            raise AssertionError(f"Parser support matrix entry {entry_id} field names must be non-empty strings.")
        if not isinstance(status, str) or status not in SUPPORT_MATRIX_FIELD_STATUSES:
            raise AssertionError(
                f"Parser support matrix entry {entry_id} field {field} has unsupported status: {status!r}"
            )
        fields[field] = status
    return fields


def _required_str_tuple(
    mapping: dict[str, Any],
    key: str,
    *,
    allow_empty: bool = False,
) -> tuple[str, ...]:
    value = mapping.get(key)
    if not isinstance(value, list):
        raise AssertionError(f"Parser fixture field {key!r} must be a list of strings.")
    if not allow_empty and not value:
        raise AssertionError(f"Parser fixture field {key!r} must not be empty.")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item:
            raise AssertionError(f"Parser fixture field {key!r} must contain only non-empty strings.")
        result.append(item)
    return tuple(result)


def _required_str(mapping: dict[str, Any], key: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value:
        raise AssertionError(f"Parser fixture field {key!r} must be a non-empty string.")
    return value


def _safe_child_path(root: Path, raw_path: str, field: str) -> Path:
    if "\\" in raw_path:
        raise AssertionError(f"Parser fixture {field} must use POSIX separators.")
    path = Path(raw_path)
    if path.is_absolute() or any(part == ".." for part in path.parts):
        raise AssertionError(f"Parser fixture {field} must stay inside the corpus root.")
    return root / path
