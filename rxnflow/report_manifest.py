"""JSON-safe report manifest contracts for composed RxnFlow reports."""

from __future__ import annotations

from dataclasses import dataclass, field
import math
from typing import Any, Literal, TypeAlias, cast

from .errors import RxnFlowError, RxnFlowWarning
from .export import (
    ENERGY_TABLE_COLUMNS,
    ENERGY_TABLE_SCHEMA_VERSION,
    EXPORT_CREATED_AT,
    EnergyTableRow,
    ExportArtifact,
    ExportArtifactRecord,
    export_format_capability,
)
from .models import EnergyProfile, EnergyValue
from .result import Result, err, ok


JsonValue: TypeAlias = (
    str
    | int
    | float
    | bool
    | None
    | list["JsonValue"]
    | dict[str, "JsonValue"]
)
ReportSectionKind = Literal[
    "summary",
    "graph",
    "energy_profile",
    "energy_table",
    "artifacts",
    "warnings",
]

REPORT_DOCUMENT_SCHEMA_VERSION = "report-document-v1"
REPORT_SECTION_ORDER: tuple[ReportSectionKind, ...] = (
    "summary",
    "graph",
    "energy_profile",
    "energy_table",
    "artifacts",
    "warnings",
)


@dataclass(frozen=True)
class ReportAsset:
    id: str
    kind: str
    format: str
    source_artifact_id: str
    path: str | None = None
    checksum: str | None = None
    metadata: dict[str, JsonValue] = field(default_factory=dict)


@dataclass(frozen=True)
class ReportSection:
    id: str
    title: str
    kind: ReportSectionKind
    asset_ids: tuple[str, ...] = ()
    data: dict[str, JsonValue] = field(default_factory=dict)


@dataclass(frozen=True)
class ReportDocument:
    id: str
    project_id: str
    title: str
    created_at: str
    sections: tuple[ReportSection, ...]
    assets: tuple[ReportAsset, ...]
    metadata: dict[str, JsonValue] = field(default_factory=dict)
    warnings: tuple[RxnFlowWarning, ...] = ()


@dataclass(frozen=True)
class ReportComposerRequest:
    project_id: str
    title: str | None = None
    profile: EnergyProfile | None = None
    table_rows: tuple[EnergyTableRow, ...] = ()
    artifacts: tuple[ExportArtifact, ...] = ()
    artifact_records: tuple[ExportArtifactRecord, ...] = ()
    metadata: dict[str, JsonValue] = field(default_factory=dict)


class ReportComposerService:
    """Compose existing report export artifacts into a JSON-safe manifest."""

    def compose(self, request: ReportComposerRequest) -> Result[ReportDocument]:
        validation = _validate_request(request)
        if validation is not None:
            return err(validation)

        assets_result = _build_assets(request)
        if not assets_result.ok or assets_result.value is None:
            assert assets_result.error is not None
            return err(assets_result.error)

        assets, asset_warnings = assets_result.value
        sections, section_warnings = _build_sections(request, assets)
        warnings = _deduplicate_warnings(
            _profile_warnings(request.profile)
            + asset_warnings
            + section_warnings
        )
        document = ReportDocument(
            id=_document_id(request.project_id),
            project_id=request.project_id,
            title=request.title or "RxnFlow report",
            created_at=EXPORT_CREATED_AT,
            sections=sections,
            assets=assets,
            metadata={
                **request.metadata,
                "schema_version": REPORT_DOCUMENT_SCHEMA_VERSION,
                "project_id": request.project_id,
            },
            warnings=warnings,
        )

        encoded = report_document_to_dict(document)
        if not encoded.ok:
            assert encoded.error is not None
            return err(encoded.error)
        return ok(document, warnings)


def report_document_to_dict(document: ReportDocument) -> Result[dict[str, JsonValue]]:
    """Encode a report document manifest as a JSON-safe dictionary."""

    metadata_error = _validate_json_safe_value(document.metadata, "metadata")
    if metadata_error is not None:
        return err(metadata_error)

    section_values: list[JsonValue] = []
    for index, section in enumerate(document.sections):
        target = f"sections[{index}].data"
        data_error = _validate_json_safe_value(section.data, target)
        if data_error is not None:
            return err(data_error)
        section_values.append(
            {
                "id": section.id,
                "title": section.title,
                "kind": section.kind,
                "asset_ids": list(section.asset_ids),
                "data": section.data,
            }
        )

    asset_values: list[JsonValue] = []
    for index, asset in enumerate(document.assets):
        target = f"assets[{index}].metadata"
        metadata_error = _validate_json_safe_value(asset.metadata, target)
        if metadata_error is not None:
            return err(metadata_error)
        asset_values.append(
            {
                "id": asset.id,
                "kind": asset.kind,
                "format": asset.format,
                "source_artifact_id": asset.source_artifact_id,
                "path": asset.path,
                "checksum": asset.checksum,
                "metadata": asset.metadata,
            }
        )

    return ok(
        {
            "schema_version": REPORT_DOCUMENT_SCHEMA_VERSION,
            "id": document.id,
            "project_id": document.project_id,
            "title": document.title,
            "created_at": document.created_at,
            "sections": section_values,
            "assets": asset_values,
            "metadata": document.metadata,
            "warnings": [
                {"code": warning.code, "message": warning.message, "target": warning.target}
                for warning in document.warnings
            ],
        }
    )


def _validate_request(request: ReportComposerRequest) -> RxnFlowError | None:
    if not request.project_id:
        return RxnFlowError("invalid_input", "Report composer requires project_id.", target="project_id")
    return _validate_json_safe_value(request.metadata, "metadata")


def _build_assets(
    request: ReportComposerRequest,
) -> Result[tuple[tuple[ReportAsset, ...], tuple[RxnFlowWarning, ...]]]:
    records_by_id: dict[str, ExportArtifactRecord] = {}
    warnings: list[RxnFlowWarning] = []
    for record in request.artifact_records:
        if record.id in records_by_id:
            warnings.append(
                RxnFlowWarning(
                    "duplicate_report_artifact_record",
                    f"Export artifact record '{record.id}' is duplicated; using the first record.",
                    record.id,
                )
            )
            continue
        records_by_id[record.id] = record

    assets: list[ReportAsset] = []
    seen_artifact_ids: set[str] = set()
    for artifact in request.artifacts:
        if artifact.id in seen_artifact_ids:
            warnings.append(
                RxnFlowWarning(
                    "duplicate_report_artifact",
                    f"Export artifact '{artifact.id}' is duplicated; using the first artifact.",
                    artifact.id,
                )
            )
            continue
        seen_artifact_ids.add(artifact.id)
        record = records_by_id.get(artifact.id)
        asset = _asset_from_artifact(artifact, record)
        validation = _validate_report_asset(asset, f"artifacts[{len(assets)}]")
        if validation is not None:
            return err(validation)
        assets.append(asset)
        warnings.extend(_warnings_from_metadata(asset.metadata, artifact.id))

    for record in request.artifact_records:
        if record.id in seen_artifact_ids:
            continue
        asset = _asset_from_record(record)
        validation = _validate_report_asset(asset, f"artifact_records[{len(assets)}]")
        if validation is not None:
            return err(validation)
        assets.append(asset)
        seen_artifact_ids.add(record.id)
        warnings.extend(_warnings_from_metadata(asset.metadata, record.id))

    return ok((tuple(assets), tuple(warnings)))


def _asset_from_artifact(
    artifact: ExportArtifact,
    record: ExportArtifactRecord | None,
) -> ReportAsset:
    metadata: dict[str, JsonValue] = _json_safe_mapping(
        {
            **artifact.metadata,
            **(record.metadata if record is not None else {}),
        }
    )
    kind = _asset_kind(artifact.format, metadata)
    return ReportAsset(
        id=_asset_id(artifact.id),
        kind=kind,
        format=artifact.format,
        source_artifact_id=artifact.id,
        path=record.path if record is not None else artifact.path,
        checksum=record.checksum if record is not None else _metadata_string(metadata, "checksum"),
        metadata=metadata,
    )


def _asset_from_record(record: ExportArtifactRecord) -> ReportAsset:
    metadata = _json_safe_mapping(record.metadata)
    return ReportAsset(
        id=_asset_id(record.id),
        kind=_asset_kind(record.format, metadata),
        format=record.format,
        source_artifact_id=record.id,
        path=record.path,
        checksum=record.checksum,
        metadata=metadata,
    )


def _validate_report_asset(asset: ReportAsset, target: str) -> RxnFlowError | None:
    return _validate_json_safe_value(asset.metadata, f"{target}.metadata")


def _build_sections(
    request: ReportComposerRequest,
    assets: tuple[ReportAsset, ...],
) -> tuple[tuple[ReportSection, ...], tuple[RxnFlowWarning, ...]]:
    warnings: list[RxnFlowWarning] = []
    graph_assets = _assets_by_kind(assets, "graph_snapshot")
    energy_diagram_assets = _assets_by_kind(assets, "energy_diagram")
    energy_table_assets = _assets_by_kind(assets, "energy_table")

    summary_section = ReportSection(
        id="section-summary",
        title="Summary",
        kind="summary",
        data={
            "status": "ready",
            "project_id": request.project_id,
            "profile_id": request.profile.id if request.profile is not None else None,
            "asset_count": len(assets),
        },
    )
    graph_section, graph_warnings = _graph_section(request.profile, graph_assets)
    warnings.extend(graph_warnings)
    profile_section, profile_warnings = _energy_profile_section(request.profile, energy_diagram_assets)
    warnings.extend(profile_warnings)
    table_section, table_warnings = _energy_table_section(request.table_rows, energy_table_assets)
    warnings.extend(table_warnings)
    artifact_section = ReportSection(
        id="section-artifacts",
        title="Artifacts",
        kind="artifacts",
        asset_ids=tuple(asset.id for asset in assets),
        data={
            "status": "ready" if assets else "unavailable",
            "asset_count": len(assets),
            "formats": [asset.format for asset in assets],
        },
    )
    warning_section = ReportSection(
        id="section-warnings",
        title="Warnings",
        kind="warnings",
        data={
            "status": "ready" if warnings else "ready",
            "warning_count": len(warnings),
            "warning_codes": [warning.code for warning in warnings],
        },
    )
    return (
        (
            summary_section,
            graph_section,
            profile_section,
            table_section,
            artifact_section,
            warning_section,
        ),
        tuple(warnings),
    )


def _graph_section(
    profile: EnergyProfile | None,
    graph_assets: tuple[ReportAsset, ...],
) -> tuple[ReportSection, tuple[RxnFlowWarning, ...]]:
    data: dict[str, JsonValue] = {
        "status": "ready" if graph_assets else "unavailable",
        "graph_id": _first_metadata_value(graph_assets, "graph_id") or (profile.graph_id if profile else None),
        "path_id": profile.path_id if profile is not None else None,
        "snapshot_asset_count": len(graph_assets),
    }
    if graph_assets:
        data.update(_prefixed_asset_metadata(graph_assets[0], ("node_count", "edge_count", "path_count")))
        return (
            ReportSection(
                id="section-graph",
                title="Graph",
                kind="graph",
                asset_ids=tuple(asset.id for asset in graph_assets),
                data=data,
            ),
            (),
        )
    return (
        ReportSection(id="section-graph", title="Graph", kind="graph", data=data),
        (
            RxnFlowWarning(
                "missing_report_graph_snapshot",
                "Report document has no graph snapshot asset.",
                "graph",
            ),
        ),
    )


def _energy_profile_section(
    profile: EnergyProfile | None,
    energy_diagram_assets: tuple[ReportAsset, ...],
) -> tuple[ReportSection, tuple[RxnFlowWarning, ...]]:
    if profile is None:
        return (
            ReportSection(
                id="section-energy-profile",
                title="Energy Profile",
                kind="energy_profile",
                asset_ids=tuple(asset.id for asset in energy_diagram_assets),
                data={"status": "unavailable", "point_count": 0},
            ),
            (RxnFlowWarning("missing_report_profile", "Report document has no energy profile.", "profile"),),
        )

    points = [_energy_point_to_dict(point) for point in profile.points]
    data: dict[str, JsonValue] = {
        "status": "ready",
        "profile_id": profile.id,
        "graph_id": profile.graph_id,
        "path_id": profile.path_id,
        "output_unit": profile.options.output_unit,
        "point_count": len(profile.points),
        "missing_point_count": sum(1 for point in profile.points if point.relative_energy is None),
        "points": points,
    }
    return (
        ReportSection(
            id="section-energy-profile",
            title="Energy Profile",
            kind="energy_profile",
            asset_ids=tuple(asset.id for asset in energy_diagram_assets),
            data=data,
        ),
        (),
    )


def _energy_table_section(
    table_rows: tuple[EnergyTableRow, ...],
    energy_table_assets: tuple[ReportAsset, ...],
) -> tuple[ReportSection, tuple[RxnFlowWarning, ...]]:
    row_values: list[JsonValue] = []
    for row in table_rows:
        row_values.append(
            {
                "structure_name": row.structure_name,
                "node_id": row.node_id,
                "object_id": row.object_id,
                "missing_reason": row.missing_reason,
                "values": _json_safe_mapping(row.values),
            }
        )
    data: dict[str, JsonValue] = {
        "status": "ready" if table_rows or energy_table_assets else "unavailable",
        "schema_version": ENERGY_TABLE_SCHEMA_VERSION,
        "column_count": len(ENERGY_TABLE_COLUMNS),
        "row_count": len(table_rows) if table_rows else _first_int_metadata_value(energy_table_assets, "energy_table_row_count"),
        "rows": row_values,
    }
    if table_rows or energy_table_assets:
        return (
            ReportSection(
                id="section-energy-table",
                title="Energy Table",
                kind="energy_table",
                asset_ids=tuple(asset.id for asset in energy_table_assets),
                data=data,
            ),
            (),
        )
    return (
        ReportSection(id="section-energy-table", title="Energy Table", kind="energy_table", data=data),
        (
            RxnFlowWarning(
                "missing_report_energy_table",
                "Report document has no energy table rows or artifact.",
                "energy_table",
            ),
        ),
    )


def _energy_point_to_dict(point: Any) -> dict[str, JsonValue]:
    return {
        "node_id": point.node_id,
        "label": point.label,
        "absolute_energy": _energy_value_to_dict(point.absolute_energy),
        "relative_energy": _energy_value_to_dict(point.relative_energy),
        "missing_reason": point.missing_reason,
    }


def _energy_value_to_dict(value: EnergyValue | None) -> dict[str, JsonValue] | None:
    if value is None:
        return None
    return {"value": value.value, "unit": value.unit, "reference": value.reference}


def _assets_by_kind(assets: tuple[ReportAsset, ...], kind: str) -> tuple[ReportAsset, ...]:
    return tuple(asset for asset in assets if asset.kind == kind)


def _asset_kind(format_id: str, metadata: dict[str, JsonValue]) -> str:
    artifact_kind = metadata.get("artifact_kind")
    if isinstance(artifact_kind, str) and artifact_kind:
        return artifact_kind
    capability = export_format_capability(format_id)
    if capability is not None:
        return capability.artifact_kind
    return "artifact"


def _asset_id(source_artifact_id: str) -> str:
    return f"asset-{source_artifact_id}"


def _document_id(project_id: str) -> str:
    return f"report-{project_id}"


def _metadata_string(metadata: dict[str, JsonValue], key: str) -> str | None:
    value = metadata.get(key)
    return value if isinstance(value, str) else None


def _first_metadata_value(assets: tuple[ReportAsset, ...], key: str) -> JsonValue:
    for asset in assets:
        value = asset.metadata.get(key)
        if value is not None:
            return value
    return None


def _first_int_metadata_value(assets: tuple[ReportAsset, ...], key: str) -> int | None:
    value = _first_metadata_value(assets, key)
    return value if isinstance(value, int) else None


def _prefixed_asset_metadata(asset: ReportAsset, keys: tuple[str, ...]) -> dict[str, JsonValue]:
    return {key: asset.metadata[key] for key in keys if key in asset.metadata}


def _profile_warnings(profile: EnergyProfile | None) -> tuple[RxnFlowWarning, ...]:
    if profile is None:
        return ()
    warnings: list[RxnFlowWarning] = []
    for raw_warning in profile.warnings:
        if isinstance(raw_warning, RxnFlowWarning):
            warnings.append(raw_warning)
            continue
        code = getattr(raw_warning, "code", "warning")
        message = getattr(raw_warning, "message", str(raw_warning))
        target = getattr(raw_warning, "target", None)
        warnings.append(RxnFlowWarning(str(code), str(message), target))
    return tuple(warnings)


def _warnings_from_metadata(metadata: dict[str, JsonValue], artifact_id: str) -> tuple[RxnFlowWarning, ...]:
    raw_warnings = metadata.get("warnings")
    if not isinstance(raw_warnings, list):
        return ()
    warnings: list[RxnFlowWarning] = []
    for item in raw_warnings:
        if isinstance(item, str):
            warnings.append(
                RxnFlowWarning(
                    item,
                    f"Artifact '{artifact_id}' reported warning '{item}'.",
                    artifact_id,
                )
            )
        elif isinstance(item, dict) and isinstance(item.get("code"), str) and isinstance(item.get("message"), str):
            target = item.get("target")
            warnings.append(
                RxnFlowWarning(
                    item["code"],
                    item["message"],
                    target if isinstance(target, str) or target is None else artifact_id,
                )
            )
    return tuple(warnings)


def _deduplicate_warnings(warnings: tuple[RxnFlowWarning, ...]) -> tuple[RxnFlowWarning, ...]:
    seen: set[tuple[str, str, str | None]] = set()
    deduplicated: list[RxnFlowWarning] = []
    for warning in warnings:
        key = (warning.code, warning.message, warning.target)
        if key in seen:
            continue
        seen.add(key)
        deduplicated.append(warning)
    return tuple(deduplicated)


def _json_safe_mapping(raw: dict[str, Any]) -> dict[str, JsonValue]:
    return cast(dict[str, JsonValue], _json_safe_copy(raw))


def _json_safe_copy(value: Any) -> JsonValue:
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value
    if isinstance(value, (list, tuple)):
        return [_json_safe_copy(item) for item in value]
    if isinstance(value, dict):
        return cast(JsonValue, {key: _json_safe_copy(item) for key, item in value.items()})
    return cast(JsonValue, value)


def _validate_json_safe_value(value: Any, target: str) -> RxnFlowError | None:
    if value is None or isinstance(value, (str, bool, int)):
        return None
    if isinstance(value, float):
        if not math.isfinite(value):
            return RxnFlowError("invalid_input", "Report manifest number must be finite.", target=target)
        return None
    if isinstance(value, list):
        for index, item in enumerate(value):
            error = _validate_json_safe_value(item, f"{target}[{index}]")
            if error is not None:
                return error
        return None
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                return RxnFlowError("invalid_input", "Report manifest metadata keys must be strings.", target=target)
            error = _validate_json_safe_value(item, f"{target}.{key}")
            if error is not None:
                return error
        return None
    return RxnFlowError("invalid_input", "Report manifest metadata must be JSON-safe.", target=target)
