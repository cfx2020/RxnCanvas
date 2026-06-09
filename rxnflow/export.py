"""Report export contracts and writers for RxnFlow core objects."""

from __future__ import annotations

import csv
from dataclasses import dataclass, field, replace
from io import BytesIO, StringIO
import hashlib
import math
from pathlib import Path
from typing import Any, Literal
from xml.etree import ElementTree

from .constants import HARTREE_TO_KCAL_MOL, KCAL_MOL_TO_KJ_MOL
from .errors import RxnFlowError, RxnFlowWarning
from .models import (
    ChemicalObject,
    EnergyProfile,
    EnergyUnit,
    EnergyValue,
    ReactionEdge,
    ReactionGraph,
    ReactionNode,
    ReactionPath,
)
from .result import Result, err, ok
from .solution_pairs import STANDARD_STATE_1M_HARTREE, structure_display_name, with_paired_solution_free_energies
from .workspace import CanvasViewport, WorkspaceSelection, WorkspaceSnapshot


ExportFormat = Literal["png", "cdxml", "xlsx", "csv", "svg"]
ExportFormatStatus = Literal["supported", "experimental", "unsupported"]

ENERGY_TABLE_SCHEMA_VERSION = "energy-table-v1"
EXPORT_CREATED_AT = "2026-05-05T00:00:00Z"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@dataclass(frozen=True)
class ExportFormatCapability:
    format: str
    extension: str
    mime_type: str
    writer_id: str | None
    artifact_kind: str
    supports_inline_bytes: bool
    supports_browser_persistence: bool
    web_default_enabled: bool
    status: ExportFormatStatus
    unsupported_reason: str | None = None


EXPORT_FORMAT_CAPABILITIES: tuple[ExportFormatCapability, ...] = (
    ExportFormatCapability(
        "png",
        "png",
        "image/png",
        "pillow-energy-plot-v1",
        "energy_diagram",
        True,
        True,
        True,
        "supported",
    ),
    ExportFormatCapability(
        "cdxml",
        "cdxml",
        "chemical/x-cdxml",
        "rxnflow-cdxml-energy-v1",
        "energy_diagram",
        True,
        True,
        True,
        "supported",
    ),
    ExportFormatCapability(
        "xlsx",
        "xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xlsxwriter-energy-workbook-v1",
        "energy_table",
        True,
        True,
        True,
        "supported",
    ),
    ExportFormatCapability(
        "csv",
        "csv",
        "text/csv",
        "python-csv-energy-table-v1",
        "energy_table",
        True,
        True,
        True,
        "supported",
    ),
    ExportFormatCapability(
        "svg",
        "svg",
        "image/svg+xml",
        "python-svg-graph-snapshot-v1",
        "graph_snapshot",
        True,
        True,
        True,
        "supported",
    ),
    ExportFormatCapability(
        "pdf",
        "pdf",
        "application/pdf",
        None,
        "report_document",
        True,
        False,
        False,
        "unsupported",
        "PDF writer dependency and rendering boundary are not decided.",
    ),
    ExportFormatCapability(
        "pptx",
        "pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        None,
        "report_document",
        True,
        False,
        False,
        "unsupported",
        "PPTX writer dependency and slide contract are not decided.",
    ),
    ExportFormatCapability(
        "cdx",
        "cdx",
        "chemical/x-cdx",
        None,
        "external_conversion",
        False,
        False,
        False,
        "unsupported",
        "ChemDraw CDX binary writer/converter is not available.",
    ),
)


def export_format_capabilities_by_format() -> dict[str, ExportFormatCapability]:
    """Return all known report export format capabilities keyed by format id."""

    return {capability.format: capability for capability in EXPORT_FORMAT_CAPABILITIES}


def export_format_capability(format_id: str) -> ExportFormatCapability | None:
    """Return a known export format capability, including unsupported future formats."""

    return export_format_capabilities_by_format().get(format_id)


def supported_export_formats() -> frozenset[str]:
    """Return currently executable report export formats."""

    return frozenset(
        capability.format
        for capability in EXPORT_FORMAT_CAPABILITIES
        if capability.status == "supported"
    )


ALLOWED_EXPORT_FORMATS: frozenset[str] = supported_export_formats()


@dataclass(frozen=True)
class ExportArtifact:
    id: str
    format: ExportFormat
    path: str | None = None
    bytes: bytes | None = None
    created_at: str = EXPORT_CREATED_AT
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ExportArtifactRecord:
    id: str
    format: ExportFormat
    path: str
    checksum: str
    created_at: str = EXPORT_CREATED_AT
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class EnergyTableColumn:
    key: str
    label: str
    unit: str | None = None
    group: str | None = None
    source: str | None = None


@dataclass(frozen=True)
class EnergyTableRow:
    structure_name: str
    values: dict[str, Any] = field(default_factory=dict)
    node_id: str | None = None
    object_id: str | None = None
    missing_reason: str | None = None
    warnings: tuple[RxnFlowWarning, ...] = ()


@dataclass(frozen=True)
class EnergyDiagramState:
    node_id: str
    label: str
    relative_value: float | None
    unit: EnergyUnit
    step_delta_value: float | None = None
    correction_count: int = 0
    missing_reason: str | None = None
    x: float | None = None
    y: float | None = None
    line_start_x: float | None = None
    line_end_x: float | None = None
    label_x: float | None = None
    label_y: float | None = None
    value_x: float | None = None
    value_y: float | None = None


@dataclass(frozen=True)
class EnergyDiagramRoute:
    profile_id: str
    path_id: str
    states: tuple[EnergyDiagramState, ...]
    color: str | None = None
    y_axis_label: str | None = None
    warnings: tuple[RxnFlowWarning, ...] = ()
    min_energy: float = -1.0
    max_energy: float = 1.0
    step_delta_count: int = 0
    correction_marker_count: int = 0
    missing_point_count: int = 0


@dataclass(frozen=True)
class CdxmlDiagramOptions:
    state_line_span: float = 54.0
    show_values: bool = True
    show_labels: bool = True
    show_step_delta: bool = True
    show_correction_markers: bool = True
    show_missing_reason: bool = True
    decimals: int = 2
    y_axis_label: str | None = None
    line_style: str = "solid"


@dataclass(frozen=True)
class ExportRequest:
    formats: tuple[str, ...]
    graph: ReactionGraph | None = None
    workspace: WorkspaceSnapshot | None = None
    profile: EnergyProfile | None = None
    objects: tuple[ChemicalObject, ...] = ()
    table_rows: tuple[EnergyTableRow, ...] = ()
    destination_dir: str | Path | None = None
    basename: str | None = None
    title: str | None = None
    options: dict[str, Any] = field(default_factory=dict)


ENERGY_TABLE_COLUMNS: tuple[EnergyTableColumn, ...] = (
    EnergyTableColumn("structure_name", "Structure", source="row"),
    EnergyTableColumn("egas_hartree", "Egas (Hartree)", "hartree", "Gas", "energies.egas"),
    EnergyTableColumn("egas_kcal_mol", "Egas (kcal/mol)", "kcal/mol", "Gas", "energies.egas"),
    EnergyTableColumn("gas_basis_functions", "Gas basis functions", source="table_rows"),
    EnergyTableColumn("ggas_hartree", "Ggas (Hartree)", "hartree", "Gas", "thermochemistry.ggas"),
    EnergyTableColumn("ggas_kcal_mol", "Ggas (kcal/mol)", "kcal/mol", "Gas", "thermochemistry.ggas"),
    EnergyTableColumn("ggas_1m_hartree", "Ggas+1M (Hartree)", "hartree", "Gas", "thermochemistry.ggas_1m"),
    EnergyTableColumn("ggas_1m_kcal_mol", "Ggas+1M (kcal/mol)", "kcal/mol", "Gas", "thermochemistry.ggas_1m"),
    EnergyTableColumn("ggas_shermo_hartree", "Ggas(shermo) (Hartree)", "hartree", "Gas", "table_rows"),
    EnergyTableColumn("ggas_shermo_kcal_mol", "Ggas(shermo) (kcal/mol)", "kcal/mol", "Gas", "table_rows"),
    EnergyTableColumn("ggas_shermo_1m_hartree", "Ggas(shermo+1M) (Hartree)", "hartree", "Gas", "table_rows"),
    EnergyTableColumn("ggas_shermo_1m_kcal_mol", "Ggas(shermo+1M) (kcal/mol)", "kcal/mol", "Gas", "table_rows"),
    EnergyTableColumn("esol_hartree", "Esol (Hartree)", "hartree", "Solution", "energies.esol"),
    EnergyTableColumn("esol_kcal_mol", "Esol (kcal/mol)", "kcal/mol", "Solution", "energies.esol"),
    EnergyTableColumn("solution_basis_functions", "Solution basis functions", source="table_rows"),
    EnergyTableColumn("gsol_hartree", "Gsol (Hartree)", "hartree", "Solution", "thermochemistry.gsol"),
    EnergyTableColumn("gsol_kcal_mol", "Gsol (kcal/mol)", "kcal/mol", "Solution", "thermochemistry.gsol"),
    EnergyTableColumn("relative_energy", "Relative energy", group="Profile", source="profile"),
    EnergyTableColumn("relative_unit", "Relative unit", group="Profile", source="profile"),
    EnergyTableColumn("missing_reason", "Missing reason", group="Profile", source="profile"),
)


def energy_table_columns_by_key() -> dict[str, EnergyTableColumn]:
    """Return the versioned energy table schema keyed by stable column id."""

    return {column.key: column for column in ENERGY_TABLE_COLUMNS}


def normalize_energy_table_header(header: str, *, context: str | None = None) -> str | None:
    """Map common computational chemistry workbook headers to table column ids."""

    normalized = _normalize_table_header_token(header)
    normalized_context = _normalize_table_header_token(context or "")
    if not normalized:
        return None

    if normalized in {"structure", "structurename", "name", "label"}:
        return "structure_name"
    if normalized in {"egas", "egasenergy"}:
        return _unit_column("egas", normalized_context)
    if normalized in {"ggas", "ggasold"}:
        return _unit_column("ggas", normalized_context)
    if normalized in {"ggas1m", "ggas1mstandardstate"}:
        return _unit_column("ggas_1m", normalized_context)
    if normalized in {"ggasshermo", "ggasshermochemistry"}:
        return _unit_column("ggas_shermo", normalized_context)
    if normalized in {"ggasshermo1m", "ggasshermo1mstandardstate"}:
        return _unit_column("ggas_shermo_1m", normalized_context)
    if normalized in {"esol", "esolenergy"}:
        return _unit_column("esol", normalized_context)
    if normalized in {"gsol", "gsolold"}:
        return _unit_column("gsol", normalized_context)
    if normalized in {"relativeenergy", "relativee", "deltae"}:
        return "relative_energy"
    if normalized in {"relativeunit", "unit"} and "profile" in normalized_context:
        return "relative_unit"
    if normalized in {"missingreason", "missing"}:
        return "missing_reason"
    if normalized in {"basisfunction", "basisfunctions", "basisf"}:
        if "solution" in normalized_context or "sol" in normalized_context:
            return "solution_basis_functions"
        return "gas_basis_functions"
    return None


@dataclass(frozen=True)
class _RenderedArtifact:
    format: ExportFormat
    bytes: bytes
    writer_id: str
    warnings: tuple[RxnFlowWarning, ...]
    metadata: dict[str, Any] = field(default_factory=dict)


class ReportExportService:
    """Export loaded RxnFlow core objects to bytes and optional files."""

    def export(self, project_id: str, request: ExportRequest) -> Result[tuple[ExportArtifact, ...]]:
        validation = _validate_export_request(project_id, request)
        if validation is not None:
            return err(validation)

        basename_result = _resolve_basename(request)
        if not basename_result.ok:
            assert basename_result.error is not None
            return err(basename_result.error)
        basename = basename_result.value
        assert basename is not None

        destination_result = _resolve_destination(request.destination_dir)
        if not destination_result.ok:
            assert destination_result.error is not None
            return err(destination_result.error)
        destination = destination_result.value

        rendered: list[_RenderedArtifact] = []
        collected_warnings: list[RxnFlowWarning] = []
        for export_format in request.formats:
            render_result = _render_format(export_format, request)
            if not render_result.ok:
                assert render_result.error is not None
                return err(render_result.error, tuple(collected_warnings))
            assert render_result.value is not None
            rendered.append(render_result.value)
            collected_warnings.extend(render_result.value.warnings)

        artifacts: list[ExportArtifact] = []
        for rendered_artifact in rendered:
            artifact_path = None
            artifact_bytes = rendered_artifact.bytes
            if destination is not None:
                output_path = destination / f"{basename}.{rendered_artifact.format}"
                try:
                    output_path.write_bytes(artifact_bytes)
                except OSError as exc:
                    return err(
                        RxnFlowError(
                            "export_failed",
                            f"Could not write export artifact: {exc}",
                            target="destination",
                            details={"path": str(output_path)},
                        ),
                        tuple(collected_warnings),
                    )
                artifact_path = str(output_path)

            metadata = _artifact_metadata(
                project_id,
                request,
                rendered_artifact,
                basename,
                len(artifact_bytes),
            )
            artifacts.append(
                ExportArtifact(
                    id=_artifact_id(project_id, request, rendered_artifact.format, basename),
                    format=rendered_artifact.format,
                    path=artifact_path,
                    bytes=artifact_bytes,
                    metadata=metadata,
                )
            )

        return ok(tuple(artifacts), tuple(collected_warnings))


def build_energy_table_rows(
    objects: tuple[ChemicalObject, ...] = (),
    profile: EnergyProfile | None = None,
    table_rows: tuple[EnergyTableRow, ...] = (),
) -> tuple[EnergyTableRow, ...]:
    """Build structure-first energy table rows without recomputing energies."""

    resolved_objects = with_paired_solution_free_energies(objects)
    rows: list[EnergyTableRow] = []
    rows.extend(table_rows)
    rows.extend(_row_from_chemical_object(obj) for obj in resolved_objects)

    if not rows and profile is not None:
        rows.extend(_row_from_energy_point(point) for point in profile.points)
    elif profile is not None:
        rows = [_merge_profile_values(row, profile) for row in rows]

    return tuple(rows)


def build_energy_diagram_route(
    profile: EnergyProfile,
    options: CdxmlDiagramOptions | None = None,
) -> EnergyDiagramRoute:
    """Build a diagram route shared by PNG and CDXML exporters."""

    diagram_options = options or CdxmlDiagramOptions()
    unit = profile.options.output_unit
    warnings = list(_profile_warnings(profile))
    states: list[EnergyDiagramState] = []
    raw_values = [point.relative_energy.value if point.relative_energy is not None else None for point in profile.points]
    min_energy, max_energy = _energy_bounds(raw_values)
    positions = _state_positions(len(profile.points), 150.0, 624.0)
    top = 62.0
    bottom = 338.0
    state_span = diagram_options.state_line_span
    previous_relative_value: float | None = None

    for point, position_x in zip(profile.points, positions):
        relative_value = point.relative_energy.value if point.relative_energy is not None else None
        step_delta_value = (
            relative_value - previous_relative_value
            if relative_value is not None and previous_relative_value is not None
            else None
        )
        correction_count = len(point.expression.corrections) if point.expression is not None else 0
        missing_reason = point.missing_reason
        if relative_value is None and missing_reason is None:
            missing_reason = "missing_relative_energy"
        if missing_reason is not None:
            warnings.append(
                RxnFlowWarning(
                    code="missing_energy_point",
                    message=f"Energy point '{point.label}' has no relative energy.",
                    target=point.node_id,
                )
            )
        state_unit = point.relative_energy.unit if point.relative_energy is not None else unit
        y = _map_energy_to_y(relative_value, min_energy, max_energy, top, bottom) if relative_value is not None else None
        states.append(
            EnergyDiagramState(
                node_id=point.node_id,
                label=point.label,
                relative_value=relative_value,
                unit=state_unit,
                step_delta_value=step_delta_value,
                correction_count=correction_count,
                missing_reason=missing_reason,
                x=position_x,
                y=y,
                line_start_x=position_x - state_span / 2 if y is not None else None,
                line_end_x=position_x + state_span / 2 if y is not None else None,
                label_x=position_x - 26,
                label_y=bottom + 18,
                value_x=position_x - 18 if y is not None else None,
                value_y=y - 16 if y is not None else None,
            )
        )
        previous_relative_value = relative_value

    y_axis_label = diagram_options.y_axis_label or f"Relative energy ({_unit_label(unit)})"
    return EnergyDiagramRoute(
        profile_id=profile.id,
        path_id=profile.path_id,
        states=tuple(states),
        y_axis_label=y_axis_label,
        warnings=tuple(warnings),
        min_energy=min_energy,
        max_energy=max_energy,
        step_delta_count=sum(1 for state in states if state.step_delta_value is not None),
        correction_marker_count=sum(1 for state in states if state.correction_count > 0),
        missing_point_count=sum(1 for state in states if state.missing_reason is not None),
    )


def _validate_export_request(project_id: str, request: ExportRequest) -> RxnFlowError | None:
    if not project_id:
        return RxnFlowError("invalid_input", "Project id is required.", target="project_id")
    if not request.formats:
        return RxnFlowError("invalid_input", "At least one export format is required.", target="formats")

    for export_format in request.formats:
        if export_format not in ALLOWED_EXPORT_FORMATS:
            return RxnFlowError(
                "invalid_input",
                f"Unsupported export format: {export_format}",
                target="formats",
                details={"format": export_format, "supported": sorted(ALLOWED_EXPORT_FORMATS)},
            )
        if export_format in ("png", "cdxml") and request.profile is None:
            return RxnFlowError(
                "invalid_input",
                f"Format '{export_format}' requires an EnergyProfile.",
                target="profile",
            )
        if export_format == "svg" and _graph_snapshot_graph(request) is None:
            return RxnFlowError(
                "invalid_input",
                "SVG graph snapshot export requires a ReactionGraph or WorkspaceSnapshot.",
                target="graph",
            )
        if (
            export_format in ("xlsx", "csv")
            and request.profile is None
            and not request.objects
            and not request.table_rows
        ):
            label = str(export_format).upper()
            return RxnFlowError(
                "invalid_input",
                f"{label} export requires an EnergyProfile, ChemicalObject rows, or table rows.",
                target="request",
            )
    return None


def _resolve_basename(request: ExportRequest) -> Result[str]:
    basename = request.basename or request.title or _source_name(request)
    if basename is None or not basename.strip():
        basename = "rxnflow-export"
    basename = basename.strip()
    if "/" in basename or "\\" in basename or ".." in basename:
        return err(
            RxnFlowError(
                "invalid_input",
                "Export basename must be a file name, not a path.",
                target="basename",
                details={"basename": basename},
            )
        )
    return ok(basename)


def _resolve_destination(destination_dir: str | Path | None) -> Result[Path | None]:
    if destination_dir is None:
        return ok(None)
    destination = Path(destination_dir)
    if not destination.exists() or not destination.is_dir():
        return err(
            RxnFlowError(
                "export_failed",
                "Export destination must be an existing directory.",
                target="destination",
                details={"path": str(destination)},
            )
        )
    return ok(destination)


def _render_format(export_format: str, request: ExportRequest) -> Result[_RenderedArtifact]:
    try:
        if export_format == "png":
            assert request.profile is not None
            route = build_energy_diagram_route(request.profile)
            artifact_bytes = _render_png(route, request.title)
            return ok(_RenderedArtifact("png", artifact_bytes, "pillow-energy-plot-v1", route.warnings))

        if export_format == "cdxml":
            assert request.profile is not None
            options = _cdxml_options(request.options)
            route = build_energy_diagram_route(request.profile, options)
            artifact_bytes = _render_cdxml(route, options, request.title)
            return ok(
                _RenderedArtifact(
                    "cdxml",
                    artifact_bytes,
                    "rxnflow-cdxml-energy-v1",
                    route.warnings,
                    _cdxml_artifact_metadata(route, options),
                )
            )

        if export_format == "xlsx":
            rows = build_energy_table_rows(request.objects, request.profile, request.table_rows)
            artifact_bytes = _render_xlsx(rows, request.profile, request.title)
            warnings = _energy_table_warnings(rows, request.profile)
            return ok(_RenderedArtifact("xlsx", artifact_bytes, "xlsxwriter-energy-workbook-v1", warnings))

        if export_format == "csv":
            rows = build_energy_table_rows(request.objects, request.profile, request.table_rows)
            artifact_bytes = _render_csv(rows)
            warnings = _energy_table_warnings(rows, request.profile)
            return ok(_RenderedArtifact("csv", artifact_bytes, "python-csv-energy-table-v1", warnings))

        if export_format == "svg":
            svg = _render_graph_snapshot_svg(request)
            return ok(
                _RenderedArtifact(
                    "svg",
                    svg.bytes,
                    "python-svg-graph-snapshot-v1",
                    (),
                    svg.metadata,
                )
            )
    except ImportError as exc:
        return err(
            RxnFlowError(
                "export_failed",
                f"Export dependency is not available: {exc.name or exc}",
                target="dependency",
            )
        )
    except Exception as exc:
        return err(
            RxnFlowError(
                "export_failed",
                f"Could not render {export_format} export: {exc}",
                target=str(export_format),
            )
        )

    return err(
        RxnFlowError(
            "invalid_input",
            f"Unsupported export format: {export_format}",
            target="formats",
            details={"format": export_format, "supported": sorted(ALLOWED_EXPORT_FORMATS)},
        )
    )


def _render_xlsx(
    rows: tuple[EnergyTableRow, ...],
    profile: EnergyProfile | None,
    title: str | None,
) -> bytes:
    import xlsxwriter

    output = BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True})

    header_format = workbook.add_format({"bold": True, "bg_color": "#E8EEF5", "border": 1})
    number_format = workbook.add_format({"num_format": "0.000000", "border": 1})
    text_format = workbook.add_format({"border": 1})
    group_format = workbook.add_format({"bold": True, "bg_color": "#D9E6F2", "border": 1, "align": "center"})
    formats = {
        "group": group_format,
        "header": header_format,
        "number": number_format,
        "text": text_format,
    }

    _write_energy_table_sheet(workbook, rows, title, formats)
    _write_shermo_template_sheet(workbook, rows, title, formats)

    if profile is not None:
        _write_energy_profile_sheet(workbook, profile, formats)

    warnings = _energy_table_warnings(rows, profile)
    if warnings:
        _write_warnings_sheet(workbook, warnings, formats)

    _write_export_metadata_sheet(workbook, rows, profile, title, formats)

    workbook.close()
    return output.getvalue()


def _render_csv(rows: tuple[EnergyTableRow, ...]) -> bytes:
    output = StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(tuple(column.label for column in ENERGY_TABLE_COLUMNS))
    for table_row in rows:
        writer.writerow(
            tuple(
                _csv_cell_value(
                    table_row.structure_name
                    if column.key == "structure_name"
                    else table_row.values.get(column.key)
                )
                for column in ENERGY_TABLE_COLUMNS
            )
        )
    return output.getvalue().encode("utf-8")


@dataclass(frozen=True)
class _GraphSnapshotRender:
    bytes: bytes
    metadata: dict[str, Any]


def _render_graph_snapshot_svg(request: ExportRequest) -> _GraphSnapshotRender:
    graph = _graph_snapshot_graph(request)
    assert graph is not None
    workspace = request.workspace
    viewport = _graph_snapshot_viewport(workspace)
    selection = _graph_snapshot_selection(workspace)
    active_path_id = workspace.active_path_id if workspace is not None else _profile_path_id(request)
    width = 720.0
    height = 432.0
    graph_width = 600.0
    graph_height = 360.0
    margin_x = 60.0
    margin_y = 36.0
    node_positions = _graph_snapshot_node_positions(graph)
    selected_nodes = set(selection.node_ids)
    selected_edges = set(selection.edge_ids)
    selected_paths = set(selection.path_ids)
    active_path_nodes = _active_path_node_ids(graph.paths, active_path_id)
    path_edge_ids = _path_edge_ids(graph, active_path_id)

    root = ElementTree.Element(
        "svg",
        {
            "xmlns": "http://www.w3.org/2000/svg",
            "width": _format_svg_number(width),
            "height": _format_svg_number(height),
            "viewBox": f"0 0 {_format_svg_number(width)} {_format_svg_number(height)}",
            "role": "img",
            "data-rxnflow-artifact": "graph-snapshot",
            "data-graph-id": graph.id,
        },
    )
    if workspace is not None:
        root.set("data-workspace-id", workspace.workspace_id)
    if active_path_id is not None:
        root.set("data-active-path-id", active_path_id)
    title = ElementTree.SubElement(root, "title")
    title.text = request.title or f"Graph snapshot {graph.id}"
    description = ElementTree.SubElement(root, "desc")
    description.text = (
        f"{len(graph.nodes)} nodes, {len(graph.edges)} edges, {len(graph.paths)} paths."
    )
    style = ElementTree.SubElement(root, "style")
    style.text = (
        ".graph-snapshot-bg{fill:#f8fafc;}"
        ".graph-snapshot-edge{stroke:#64748b;stroke-width:2;fill:none;}"
        ".graph-snapshot-edge--active{stroke:#2563eb;stroke-width:3;}"
        ".graph-snapshot-edge--selected{stroke:#d97706;stroke-width:4;}"
        ".graph-snapshot-node rect{fill:#ffffff;stroke:#334155;stroke-width:1.5;rx:8;}"
        ".graph-snapshot-node--active rect{stroke:#2563eb;stroke-width:3;}"
        ".graph-snapshot-node--selected rect{stroke:#d97706;stroke-width:3;}"
        ".graph-snapshot-node-label{font-family:Arial,sans-serif;font-size:13px;fill:#0f172a;text-anchor:middle;dominant-baseline:middle;}"
        ".graph-snapshot-edge-label{font-family:Arial,sans-serif;font-size:11px;fill:#334155;text-anchor:middle;}"
        ".graph-snapshot-empty{font-family:Arial,sans-serif;font-size:15px;fill:#475569;text-anchor:middle;dominant-baseline:middle;}"
    )
    metadata_node = ElementTree.SubElement(root, "metadata")
    path_list = ElementTree.SubElement(metadata_node, "graph-snapshot-paths")
    for path in graph.paths:
        ElementTree.SubElement(
            path_list,
            "graph-snapshot-path",
            {
                "data-path-id": path.id,
                "data-path-label": path.label,
                "data-active": "true" if path.id == active_path_id else "false",
                "data-selected": "true" if path.id in selected_paths else "false",
                "data-node-count": str(len(path.node_ids)),
            },
        )
    graph_group = ElementTree.SubElement(
        root,
        "g",
        {
            "class": "graph-snapshot-graph",
            "data-viewport-x": _format_svg_number(viewport.x),
            "data-viewport-y": _format_svg_number(viewport.y),
            "data-viewport-zoom": _format_svg_number(viewport.zoom),
            "transform": (
                f"translate({margin_x} {margin_y}) "
                f"scale({_format_svg_number(viewport.zoom)}) "
                f"translate({_format_svg_number(-viewport.x)} {_format_svg_number(-viewport.y)})"
            ),
        },
    )
    ElementTree.SubElement(
        graph_group,
        "rect",
        {
            "class": "graph-snapshot-bg",
            "x": "0",
            "y": "0",
            "width": _format_svg_number(graph_width),
            "height": _format_svg_number(graph_height),
        },
    )

    if not graph.nodes:
        empty = ElementTree.SubElement(
            graph_group,
            "text",
            {
                "class": "graph-snapshot-empty",
                "x": _format_svg_number(graph_width / 2),
                "y": _format_svg_number(graph_height / 2),
            },
        )
        empty.text = "Empty graph"

    edge_group = ElementTree.SubElement(graph_group, "g", {"class": "graph-snapshot-edges"})
    for edge in graph.edges:
        source = node_positions.get(edge.from_node)
        target = node_positions.get(edge.to_node)
        if source is None or target is None:
            continue
        classes = ["graph-snapshot-edge"]
        if edge.id in path_edge_ids:
            classes.append("graph-snapshot-edge--active")
        if edge.id in selected_edges:
            classes.append("graph-snapshot-edge--selected")
        ElementTree.SubElement(
            edge_group,
            "line",
            {
                "class": " ".join(classes),
                "data-edge-id": edge.id,
                "data-source-node-id": edge.from_node,
                "data-target-node-id": edge.to_node,
                "data-active-path": "true" if edge.id in path_edge_ids else "false",
                "data-selected": "true" if edge.id in selected_edges else "false",
                "x1": _format_svg_number(source[0]),
                "y1": _format_svg_number(source[1]),
                "x2": _format_svg_number(target[0]),
                "y2": _format_svg_number(target[1]),
            },
        )
        if edge.label:
            label = ElementTree.SubElement(
                edge_group,
                "text",
                {
                    "class": "graph-snapshot-edge-label",
                    "data-edge-id": edge.id,
                    "x": _format_svg_number((source[0] + target[0]) / 2),
                    "y": _format_svg_number((source[1] + target[1]) / 2 - 8),
                },
            )
            label.text = edge.label

    node_group = ElementTree.SubElement(graph_group, "g", {"class": "graph-snapshot-nodes"})
    for node in graph.nodes:
        x, y = node_positions[node.id]
        classes = ["graph-snapshot-node"]
        if node.id in active_path_nodes:
            classes.append("graph-snapshot-node--active")
        if node.id in selected_nodes:
            classes.append("graph-snapshot-node--selected")
        item = ElementTree.SubElement(
            node_group,
            "g",
            {
                "class": " ".join(classes),
                "data-node-id": node.id,
                "data-node-kind": node.kind,
                "data-active-path": "true" if node.id in active_path_nodes else "false",
                "data-selected": "true" if node.id in selected_nodes else "false",
                "transform": f"translate({_format_svg_number(x)} {_format_svg_number(y)})",
            },
        )
        ElementTree.SubElement(
            item,
            "rect",
            {
                "x": "-48",
                "y": "-18",
                "width": "96",
                "height": "36",
            },
        )
        label = ElementTree.SubElement(item, "text", {"class": "graph-snapshot-node-label"})
        label.text = node.label

    xml_body = ElementTree.tostring(root, encoding="unicode", short_empty_elements=True)
    metadata = {
        "graph_id": graph.id,
        "workspace_id": workspace.workspace_id if workspace is not None else None,
        "node_count": len(graph.nodes),
        "edge_count": len(graph.edges),
        "path_count": len(graph.paths),
        "active_path_id": active_path_id,
        "selected_node_count": len(selection.node_ids),
        "selected_edge_count": len(selection.edge_ids),
        "selected_path_count": len(selection.path_ids),
        "viewport_x": viewport.x,
        "viewport_y": viewport.y,
        "viewport_zoom": viewport.zoom,
        "svg_width": int(width),
        "svg_height": int(height),
    }
    return _GraphSnapshotRender(
        f'<?xml version="1.0" encoding="UTF-8"?>\n{xml_body}\n'.encode("utf-8"),
        metadata,
    )


def _graph_snapshot_graph(request: ExportRequest) -> ReactionGraph | None:
    if request.workspace is not None:
        return request.workspace.graph
    return request.graph


def _graph_snapshot_viewport(workspace: WorkspaceSnapshot | None) -> CanvasViewport:
    if workspace is None:
        return CanvasViewport()
    viewport = workspace.viewport
    if (
        not math.isfinite(viewport.x)
        or not math.isfinite(viewport.y)
        or not math.isfinite(viewport.zoom)
        or viewport.zoom <= 0
    ):
        return CanvasViewport()
    return viewport


def _graph_snapshot_selection(workspace: WorkspaceSnapshot | None) -> WorkspaceSelection:
    if workspace is None:
        return WorkspaceSelection()
    return workspace.selection


def _graph_snapshot_node_positions(graph: ReactionGraph) -> dict[str, tuple[float, float]]:
    positions: dict[str, tuple[float, float]] = {}
    fallback_positions = _graph_snapshot_fallback_positions(len(graph.nodes))
    for index, node in enumerate(graph.nodes):
        position = _finite_node_position(node)
        positions[node.id] = position if position is not None else fallback_positions[index]
    return positions


def _graph_snapshot_fallback_positions(count: int) -> tuple[tuple[float, float], ...]:
    if count <= 0:
        return ()
    graph_width = 600.0
    graph_height = 360.0
    columns = max(1, min(count, math.ceil(math.sqrt(count * graph_width / graph_height))))
    rows = math.ceil(count / columns)
    x_step = graph_width / (columns + 1)
    y_step = graph_height / (rows + 1)
    positions = []
    for index in range(count):
        column = index % columns
        row = index // columns
        positions.append(((column + 1) * x_step, (row + 1) * y_step))
    return tuple(positions)


def _finite_node_position(node: ReactionNode) -> tuple[float, float] | None:
    if node.position is None or len(node.position) != 2:
        return None
    x = float(node.position[0])
    y = float(node.position[1])
    if not math.isfinite(x) or not math.isfinite(y):
        return None
    return x, y


def _active_path_node_ids(
    paths: tuple[ReactionPath, ...],
    active_path_id: str | None,
) -> set[str]:
    if active_path_id is None:
        return set()
    for path in paths:
        if path.id == active_path_id:
            return set(path.node_ids)
    return set()


def _path_edge_ids(graph: ReactionGraph, active_path_id: str | None) -> set[str]:
    if active_path_id is None:
        return set()
    active_path = next((path for path in graph.paths if path.id == active_path_id), None)
    if active_path is None:
        return set()
    path_pairs = set(zip(active_path.node_ids, active_path.node_ids[1:]))
    return {
        edge.id
        for edge in graph.edges
        if (edge.from_node, edge.to_node) in path_pairs
    }


def _format_svg_number(value: float) -> str:
    number = float(value)
    if not math.isfinite(number):
        number = 0.0
    if abs(number) < 1e-9:
        number = 0.0
    text = f"{number:.6f}".rstrip("0").rstrip(".")
    return text or "0"


def _write_energy_table_sheet(
    workbook: Any,
    rows: tuple[EnergyTableRow, ...],
    title: str | None,
    formats: dict[str, Any],
) -> None:
    table_sheet = workbook.add_worksheet("Energy Table")
    header_format = formats["header"]
    number_format = formats["number"]
    text_format = formats["text"]
    _write_title_row(table_sheet, title, len(ENERGY_TABLE_COLUMNS), header_format)
    group_row = 1 if title else 0
    header_row = group_row + 1
    _write_group_header_row(table_sheet, group_row, ENERGY_TABLE_COLUMNS, formats["group"])
    for column_index, column in enumerate(ENERGY_TABLE_COLUMNS):
        table_sheet.write(header_row, column_index, column.label, header_format)
    for row_index, table_row in enumerate(rows, start=header_row + 1):
        for column_index, column in enumerate(ENERGY_TABLE_COLUMNS):
            value = table_row.structure_name if column.key == "structure_name" else table_row.values.get(column.key)
            _write_cell(table_sheet, row_index, column_index, value, number_format, text_format)
    table_sheet.freeze_panes(header_row + 1, 1)
    last_data_row = max(header_row, header_row + len(rows))
    table_sheet.autofilter(header_row, 0, last_data_row, len(ENERGY_TABLE_COLUMNS) - 1)
    _set_energy_table_column_widths(table_sheet, ENERGY_TABLE_COLUMNS)


def _write_shermo_template_sheet(
    workbook: Any,
    rows: tuple[EnergyTableRow, ...],
    title: str | None,
    formats: dict[str, Any],
) -> None:
    template_sheet = workbook.add_worksheet("Shermo_New")
    header_format = formats["header"]
    number_format = formats["number"]
    text_format = formats["text"]
    formula_format = workbook.add_format({"num_format": "0.000000", "border": 1, "font_color": "#1f4e79"})
    note_format = workbook.add_format({"italic": True, "font_color": "#64748b"})

    headers = (
        None,
        "Egas",
        None,
        "basis function",
        "Ggas",
        None,
        "Ggas+1M",
        None,
        "Ggas(shermo)",
        None,
        "Ggas(shermo+1M)",
        None,
        "Esol",
        None,
        "basis function",
        "Sgau,tran",
        "Swhit,tran",
        "Sgau,tran -Swhit,tran",
        "T*(Sgau,tran -Swhit,tran)/1000",
        "RT*0.239006/1000",
        "Gsol",
    )
    for column_index, header in enumerate(headers):
        if header is None:
            template_sheet.write_blank(0, column_index, None, header_format)
            continue
        template_sheet.write(0, column_index, header, header_format)

    for row_index, table_row in enumerate(rows, start=1):
        _write_shermo_template_data_row(template_sheet, row_index, table_row, number_format, text_format, formula_format)

    if rows:
        delta_header_row = len(rows) + 2
        _write_shermo_template_delta_header(template_sheet, delta_header_row, header_format)
        baseline_values = rows[0].values
        for offset, table_row in enumerate(rows, start=1):
            sheet_row = delta_header_row + offset
            data_row = offset + 1
            _write_shermo_template_delta_row(
                template_sheet,
                sheet_row,
                data_row,
                table_row,
                baseline_values,
                number_format,
                text_format,
                formula_format,
            )
    else:
        template_sheet.write(2, 0, "No energy rows available.", note_format)

    metadata_row = len(rows) * 2 + 5 if rows else 4
    template_sheet.write(metadata_row, 0, "Template note", header_format)
    template_sheet.write(
        metadata_row + 1,
        0,
        "Gsol uses Ggas+1M - Egas + Esol. Shermo and Whitesides correction columns are reserved for a future roadmap item.",
        note_format,
    )
    if title:
        template_sheet.write(metadata_row + 2, 0, "Title", header_format)
        template_sheet.write(metadata_row + 2, 1, title, text_format)

    template_sheet.freeze_panes(1, 1)
    template_sheet.set_column(0, 0, 22)
    template_sheet.set_column(1, 20, 16)


def _write_shermo_template_data_row(
    sheet: Any,
    row: int,
    table_row: EnergyTableRow,
    number_format: Any,
    text_format: Any,
    formula_format: Any,
) -> None:
    values = table_row.values
    sheet.write(row, 0, table_row.structure_name, text_format)
    _write_cell(sheet, row, 1, values.get("egas_hartree"), number_format, text_format)
    _write_formula_if_source_present(sheet, row, 2, f"=B{row + 1}*{HARTREE_TO_KCAL_MOL:.12g}", values.get("egas_kcal_mol"), values.get("egas_hartree"), formula_format, text_format)
    _write_cell(sheet, row, 3, values.get("gas_basis_functions"), number_format, text_format)
    _write_cell(sheet, row, 4, values.get("ggas_hartree"), number_format, text_format)
    _write_formula_if_source_present(sheet, row, 5, f"=E{row + 1}*{HARTREE_TO_KCAL_MOL:.12g}", values.get("ggas_kcal_mol"), values.get("ggas_hartree"), formula_format, text_format)
    _write_formula_if_source_present(sheet, row, 6, f"=E{row + 1}+{STANDARD_STATE_1M_HARTREE:.12g}", values.get("ggas_1m_hartree"), values.get("ggas_hartree"), formula_format, text_format)
    _write_formula_if_source_present(sheet, row, 7, f"=G{row + 1}*{HARTREE_TO_KCAL_MOL:.12g}", values.get("ggas_1m_kcal_mol"), values.get("ggas_1m_hartree"), formula_format, text_format)
    _write_cell(sheet, row, 8, values.get("ggas_shermo_hartree"), number_format, text_format)
    _write_formula_if_source_present(sheet, row, 9, f"=I{row + 1}*{HARTREE_TO_KCAL_MOL:.12g}", values.get("ggas_shermo_kcal_mol"), values.get("ggas_shermo_hartree"), formula_format, text_format)
    _write_formula_if_source_present(sheet, row, 10, f"=I{row + 1}+{STANDARD_STATE_1M_HARTREE:.12g}", values.get("ggas_shermo_1m_hartree"), values.get("ggas_shermo_hartree"), formula_format, text_format)
    _write_formula_if_source_present(sheet, row, 11, f"=K{row + 1}*{HARTREE_TO_KCAL_MOL:.12g}", values.get("ggas_shermo_1m_kcal_mol"), values.get("ggas_shermo_1m_hartree"), formula_format, text_format)
    _write_cell(sheet, row, 12, values.get("esol_hartree"), number_format, text_format)
    _write_formula_if_source_present(sheet, row, 13, f"=M{row + 1}*{HARTREE_TO_KCAL_MOL:.12g}", values.get("esol_kcal_mol"), values.get("esol_hartree"), formula_format, text_format)
    _write_cell(sheet, row, 14, values.get("solution_basis_functions"), number_format, text_format)
    for column in range(15, 20):
        sheet.write_blank(row, column, None, text_format)
    has_solution_formula_inputs = (
        values.get("egas_kcal_mol") is not None
        and values.get("ggas_1m_kcal_mol") is not None
        and values.get("esol_kcal_mol") is not None
    )
    _write_formula_if_source_present(
        sheet,
        row,
        20,
        f"=H{row + 1}-C{row + 1}+N{row + 1}",
        values.get("gsol_kcal_mol"),
        has_solution_formula_inputs,
        formula_format,
        text_format,
    )


def _write_shermo_template_delta_header(sheet: Any, row: int, header_format: Any) -> None:
    headers = (
        None,
        "Delta Egas",
        None,
        "basis function",
        "Delta Ggas",
        None,
        "Delta Ggas+1M",
        None,
        "Delta Ggas(shermo)",
        None,
        "Delta Ggas(shermo)+1M",
        None,
        "Delta Esol",
        None,
        "basis function",
        "Delta Sgau,tran",
        "Delta Swhit,tran",
        "Delta Sgau,tran - Delta Swhit,tran",
        "T*(Delta Sgau,tran - Delta Swhit,tran)/1000",
        "RT*0.239006/1000",
        "Gsol relative to first row",
    )
    for column_index, header in enumerate(headers):
        if header is None:
            sheet.write_blank(row, column_index, None, header_format)
            continue
        sheet.write(row, column_index, header, header_format)


def _write_shermo_template_delta_row(
    sheet: Any,
    row: int,
    data_row: int,
    table_row: EnergyTableRow,
    baseline_values: dict[str, Any],
    number_format: Any,
    text_format: Any,
    formula_format: Any,
) -> None:
    sheet.write(row, 0, table_row.structure_name, text_format)
    data_excel_row = data_row + 1
    for column_index in (1, 2, 4, 5, 6, 7, 12, 13):
        column_letter = _xlsx_column_name(column_index)
        source_key = _shermo_delta_source_key(column_index)
        cached = _numeric_delta(
            table_row.values.get(source_key) if source_key is not None else None,
            baseline_values.get(source_key) if source_key is not None else None,
        )
        formula = f"={column_letter}{data_excel_row}-{column_letter}2"
        if cached is None:
            sheet.write_blank(row, column_index, None, text_format)
        else:
            sheet.write_formula(row, column_index, formula, formula_format, cached)
    for column_index in (3, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 21, 22, 23):
        sheet.write_blank(row, column_index, None, text_format)
    gsol_delta = _numeric_delta(table_row.values.get("gsol_kcal_mol"), baseline_values.get("gsol_kcal_mol"))
    if gsol_delta is None:
        sheet.write_blank(row, 20, None, text_format)
    else:
        sheet.write_formula(row, 20, f"=U{data_excel_row}-U2", formula_format, gsol_delta)


def _shermo_delta_source_key(column_index: int) -> str | None:
    return {
        1: "egas_hartree",
        2: "egas_kcal_mol",
        4: "ggas_hartree",
        5: "ggas_kcal_mol",
        6: "ggas_1m_hartree",
        7: "ggas_1m_kcal_mol",
        12: "esol_hartree",
        13: "esol_kcal_mol",
    }.get(column_index)


def _write_formula_if_source_present(
    sheet: Any,
    row: int,
    column: int,
    formula: str,
    cached_value: Any,
    source_value: Any,
    formula_format: Any,
    text_format: Any,
) -> None:
    if source_value is None or source_value is False:
        sheet.write_blank(row, column, None, text_format)
        return
    if isinstance(cached_value, (int, float)):
        sheet.write_formula(row, column, formula, formula_format, float(cached_value))
        return
    sheet.write_formula(row, column, formula, formula_format)


def _numeric_delta(value: Any, baseline: Any) -> float | None:
    if not isinstance(value, (int, float)) or not isinstance(baseline, (int, float)):
        return None
    return float(value) - float(baseline)


def _xlsx_column_name(index: int) -> str:
    """Return an Excel column name for a zero-based column index."""

    value = index + 1
    letters = ""
    while value:
        value, remainder = divmod(value - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def _write_group_header_row(
    sheet: Any,
    row: int,
    columns: tuple[EnergyTableColumn, ...],
    group_format: Any,
) -> None:
    start = 0
    while start < len(columns):
        group = columns[start].group or columns[start].label
        end = start
        while end + 1 < len(columns) and (columns[end + 1].group or columns[end + 1].label) == group:
            end += 1
        if end > start:
            sheet.merge_range(row, start, row, end, group, group_format)
        else:
            sheet.write(row, start, group, group_format)
        start = end + 1


def _set_energy_table_column_widths(
    sheet: Any,
    columns: tuple[EnergyTableColumn, ...],
) -> None:
    for column_index, column in enumerate(columns):
        width = 18
        if column.key == "structure_name":
            width = 24
        elif column.key.endswith("_basis_functions"):
            width = 22
        elif column.group == "Profile":
            width = 18 if column.key != "missing_reason" else 24
        sheet.set_column(column_index, column_index, width)


def _write_energy_profile_sheet(
    workbook: Any,
    profile: EnergyProfile,
    formats: dict[str, Any],
) -> None:
    profile_sheet = workbook.add_worksheet("Energy Profile")
    profile_headers = (
        "Node ID",
        "Label",
        "Absolute value",
        "Absolute unit",
        "Relative value",
        "Relative unit",
        "Missing reason",
    )
    for column_index, header in enumerate(profile_headers):
        profile_sheet.write(0, column_index, header, formats["header"])
    for row_index, point in enumerate(profile.points, start=1):
        absolute = point.absolute_energy
        relative = point.relative_energy
        profile_sheet.write(row_index, 0, point.node_id, formats["text"])
        profile_sheet.write(row_index, 1, point.label, formats["text"])
        _write_cell(profile_sheet, row_index, 2, absolute.value if absolute else None, formats["number"], formats["text"])
        _write_cell(profile_sheet, row_index, 3, absolute.unit if absolute else None, formats["number"], formats["text"])
        _write_cell(profile_sheet, row_index, 4, relative.value if relative else None, formats["number"], formats["text"])
        _write_cell(profile_sheet, row_index, 5, relative.unit if relative else None, formats["number"], formats["text"])
        _write_cell(profile_sheet, row_index, 6, point.missing_reason, formats["number"], formats["text"])
    profile_sheet.freeze_panes(1, 1)
    profile_sheet.set_column(0, 6, 18)


def _write_warnings_sheet(
    workbook: Any,
    warnings: tuple[RxnFlowWarning, ...],
    formats: dict[str, Any],
) -> None:
    warning_sheet = workbook.add_worksheet("Warnings")
    for column_index, header in enumerate(("Code", "Message", "Target")):
        warning_sheet.write(0, column_index, header, formats["header"])
    for row_index, warning in enumerate(warnings, start=1):
        warning_sheet.write(row_index, 0, warning.code, formats["text"])
        warning_sheet.write(row_index, 1, warning.message, formats["text"])
        warning_sheet.write(row_index, 2, warning.target, formats["text"])
    warning_sheet.set_column(0, 2, 32)


def _write_export_metadata_sheet(
    workbook: Any,
    rows: tuple[EnergyTableRow, ...],
    profile: EnergyProfile | None,
    title: str | None,
    formats: dict[str, Any],
) -> None:
    metadata_sheet = workbook.add_worksheet("Export Metadata")
    metadata = (
        ("energy_table_schema_version", ENERGY_TABLE_SCHEMA_VERSION),
        ("energy_table_column_count", len(ENERGY_TABLE_COLUMNS)),
        ("energy_table_row_count", len(rows)),
        ("title", title or ""),
        ("profile_id", profile.id if profile is not None else ""),
        ("profile_graph_id", profile.graph_id if profile is not None else ""),
        ("profile_path_id", profile.path_id if profile is not None else ""),
    )
    metadata_sheet.write(0, 0, "Key", formats["header"])
    metadata_sheet.write(0, 1, "Value", formats["header"])
    for row_index, (key, value) in enumerate(metadata, start=1):
        metadata_sheet.write(row_index, 0, key, formats["text"])
        _write_cell(metadata_sheet, row_index, 1, value, formats["number"], formats["text"])
    metadata_sheet.freeze_panes(1, 1)
    metadata_sheet.set_column(0, 0, 32)
    metadata_sheet.set_column(1, 1, 28)


def _render_png(route: EnergyDiagramRoute, title: str | None) -> bytes:
    from PIL import Image, ImageDraw

    width = 900
    height = 520
    left = 92
    right = 42
    top = 58
    bottom = 96
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)

    min_y, max_y = route.min_energy, route.max_energy

    draw.line((left, top, left, height - bottom), fill=(28, 43, 58), width=2)
    draw.line((left, height - bottom, width - right, height - bottom), fill=(28, 43, 58), width=2)
    draw.text((left, 22), title or route.y_axis_label or "Relative energy", fill=(20, 32, 44))
    draw.text((18, top), route.y_axis_label or "Relative energy", fill=(20, 32, 44))

    for tick_index in range(5):
        tick_value = min_y + (max_y - min_y) * tick_index / 4
        tick_y = _map_energy_to_y(tick_value, min_y, max_y, top, height - bottom)
        draw.line((left - 5, tick_y, left, tick_y), fill=(28, 43, 58), width=1)
        draw.text((18, tick_y - 7), f"{tick_value:.1f}", fill=(83, 96, 109))
        draw.line((left + 1, tick_y, width - right, tick_y), fill=(230, 235, 240), width=1)

    previous: tuple[float, float] | None = None
    for state in route.states:
        position_x = _scale_diagram_x(state.x, left + 38, width - right - 34)
        label_y = height - bottom + 18
        if state.relative_value is None:
            if position_x is None:
                previous = None
                continue
            draw.text((position_x - 28, label_y), state.label, fill=(118, 128, 138))
            draw.text((position_x - 24, label_y + 18), "missing", fill=(176, 87, 67))
            previous = None
            continue
        if position_x is None:
            previous = None
            continue

        y = _scale_diagram_y(state.y, top, height - bottom)
        start_x = _scale_diagram_x(state.line_start_x, left + 38, width - right - 34)
        end_x = _scale_diagram_x(state.line_end_x, left + 38, width - right - 34)
        if y is None or start_x is None or end_x is None:
            previous = None
            continue
        if previous is not None:
            draw.line((previous[0], previous[1], start_x, y), fill=(72, 102, 140), width=3)
        draw.line((start_x, y, end_x, y), fill=(25, 86, 140), width=5)
        draw.text((position_x - 28, label_y), state.label, fill=(20, 32, 44))
        draw.text((position_x - 22, y - 20), f"{state.relative_value:.2f}", fill=(20, 32, 44))
        previous = (end_x, y)

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _render_cdxml(
    route: EnergyDiagramRoute,
    options: CdxmlDiagramOptions,
    title: str | None,
) -> bytes:
    z_index = 2

    def next_z() -> str:
        nonlocal z_index
        value = str(z_index)
        z_index += 1
        return value

    root = ElementTree.Element(
        "CDXML",
        {
            "CreationProgram": "RxnFlow",
            "Name": "RxnFlow Energy Diagram",
            "BoundingBox": "0 0 720 420",
            "LabelFont": "3",
            "LabelSize": "10",
            "CaptionFont": "3",
            "CaptionSize": "10",
            "LineWidth": "1",
            "BoldWidth": "2",
            "color": "2",
            "bgcolor": "1",
        },
    )
    color_table = ElementTree.SubElement(root, "colortable")
    for color in (
        {"r": "1", "g": "1", "b": "1"},
        {"r": "0", "g": "0", "b": "0"},
        {"r": "0.10", "g": "0.34", "b": "0.55"},
        {"r": "0.70", "g": "0.28", "b": "0.20"},
        {"r": "0.52", "g": "0.57", "b": "0.62"},
    ):
        ElementTree.SubElement(color_table, "color", color)

    font_table = ElementTree.SubElement(root, "fonttable")
    ElementTree.SubElement(font_table, "font", {"id": "3", "charset": "iso-8859-1", "name": "Arial"})

    page = ElementTree.SubElement(
        root,
        "page",
        {"id": "1", "BoundingBox": "0 0 720 420", "HeaderPosition": "36", "FooterPosition": "36"},
    )
    group = ElementTree.SubElement(
        page,
        "group",
        {"id": "2", "Integral": "yes", "BoundingBox": "0 0 720 420", "Z": "1"},
    )
    object_id = 4

    _cdxml_text(group, object_id, next_z(), 90, 22, title or route.y_axis_label or "Relative energy", size="14")
    object_id += 1
    _cdxml_text(group, object_id, next_z(), 20, 74, route.y_axis_label or "Relative energy", size="9")
    object_id += 1

    left = 88.0
    right = 662.0
    top = 62.0
    bottom = 338.0
    min_y, max_y = route.min_energy, route.max_energy

    ElementTree.SubElement(
        group,
        "graphic",
        {
            "id": str(object_id),
            "GraphicType": "Line",
            "LineType": "Solid",
            "BoundingBox": f"{left:.1f} {top:.1f} {left:.1f} {bottom:.1f}",
            "color": "2",
            "LineWidth": "1",
            "Z": next_z(),
        },
    )
    object_id += 1
    ElementTree.SubElement(
        group,
        "graphic",
        {
            "id": str(object_id),
            "GraphicType": "Line",
            "LineType": "Solid",
            "BoundingBox": f"{left:.1f} {bottom:.1f} {right:.1f} {bottom:.1f}",
            "color": "2",
            "LineWidth": "1",
            "Z": next_z(),
        },
    )
    object_id += 1

    previous: tuple[float, float] | None = None
    state_span = options.state_line_span
    for state in route.states:
        position_x = state.x
        if position_x is None:
            previous = None
            continue
        if state.relative_value is None:
            _cdxml_text(
                group,
                object_id,
                next_z(),
                state.label_x or position_x - 28,
                state.label_y or bottom + 18,
                state.label,
                size="9",
                color="5",
            )
            object_id += 1
            _cdxml_text(
                group,
                object_id,
                next_z(),
                state.label_x or position_x - 28,
                (state.label_y or bottom + 18) + 16,
                _format_cdxml_missing_marker(state.missing_reason, options),
                size="8",
                color="4",
            )
            object_id += 1
            previous = None
            continue

        y = state.y
        line_start = state.line_start_x if state.line_start_x is not None else position_x - state_span / 2
        line_end = state.line_end_x if state.line_end_x is not None else position_x + state_span / 2
        if y is None:
            previous = None
            continue
        if previous is not None:
            ElementTree.SubElement(
                group,
                "arrow",
                {
                    "id": str(object_id),
                    "ArrowheadType": "NoHead",
                    "LineType": "Dashed",
                    "Tail3D": f"{previous[0]:.1f} {previous[1]:.1f} 0",
                    "Head3D": f"{line_start:.1f} {y:.1f} 0",
                    "BoundingBox": _cdxml_bbox(previous[0], previous[1], line_start, y),
                    "FillType": "None",
                    "LineWidth": "1",
                    "color": "3",
                    "Z": next_z(),
                },
            )
            object_id += 1
            if options.show_step_delta and state.step_delta_value is not None:
                _cdxml_text(
                    group,
                    object_id,
                    next_z(),
                    (previous[0] + line_start) / 2 - 30,
                    (previous[1] + y) / 2 - 14,
                    _format_cdxml_step_delta(state.step_delta_value, state.unit, options.decimals),
                    size="8",
                    color="3",
                )
                object_id += 1
        ElementTree.SubElement(
            group,
            "graphic",
            {
                "id": str(object_id),
                "GraphicType": "Line",
                "LineType": options.line_style.capitalize(),
                "BoundingBox": f"{line_start:.1f} {y:.1f} {line_end:.1f} {y:.1f}",
                "color": "3",
                "LineWidth": "2",
                "Z": next_z(),
            },
        )
        object_id += 1
        if options.show_labels:
            _cdxml_text(
                group,
                object_id,
                next_z(),
                state.label_x or position_x - 26,
                state.label_y or bottom + 18,
                state.label,
                size="9",
            )
            object_id += 1
        if options.show_values:
            _cdxml_text(
                group,
                object_id,
                next_z(),
                state.value_x or position_x - 18,
                state.value_y or y - 16,
                _format_cdxml_energy_value(state.relative_value, state.unit, options.decimals),
                size="9",
            )
            object_id += 1
        if options.show_correction_markers and state.correction_count > 0:
            _cdxml_text(
                group,
                object_id,
                next_z(),
                state.value_x or position_x - 18,
                (state.value_y or y - 16) + 14,
                f"corr x{state.correction_count}",
                size="8",
                color="4",
            )
            object_id += 1
        previous = (line_end, y)

    xml_body = ElementTree.tostring(root, encoding="unicode", short_empty_elements=True)
    document = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<!DOCTYPE CDXML SYSTEM "http://www.cambridgesoft.com/xml/cdxml.dtd">\n'
        f"{xml_body}\n"
    )
    return document.encode("utf-8")


def _write_title_row(sheet: Any, title: str | None, width: int, header_format: Any) -> None:
    if not title:
        return
    sheet.merge_range(0, 0, 0, width - 1, title, header_format)


def _write_cell(
    sheet: Any,
    row: int,
    column: int,
    value: Any,
    number_format: Any,
    text_format: Any,
) -> None:
    if value is None:
        sheet.write_blank(row, column, None, text_format)
    elif isinstance(value, (int, float)):
        sheet.write_number(row, column, float(value), number_format)
    else:
        sheet.write(row, column, str(value), text_format)


def _csv_cell_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return f"{value:.12g}"
    return str(value)


def _normalize_table_header_token(value: str) -> str:
    replacements = {
        "（": "(",
        "）": ")",
        "+": "",
        "-": "",
        "_": "",
        " ": "",
        "\t": "",
        "/": "",
    }
    normalized = str(value).strip().lower()
    for old, new in replacements.items():
        normalized = normalized.replace(old, new)
    normalized = normalized.replace("(hartree)", "hartree")
    normalized = normalized.replace("(kcalmol)", "kcalmol")
    normalized = normalized.replace("(kcal)", "kcal")
    normalized = normalized.replace("(shermo)", "shermo")
    normalized = normalized.replace("(shermo1m)", "shermo1m")
    normalized = normalized.replace("（", "(").replace("）", ")")
    return normalized


def _unit_column(prefix: str, normalized_context: str) -> str:
    if "kcal" in normalized_context:
        return f"{prefix}_kcal_mol"
    return f"{prefix}_hartree"


def _cdxml_text(
    parent: ElementTree.Element,
    object_id: int,
    z_index: str,
    x: float,
    y: float,
    text: str,
    *,
    size: str = "10",
    color: str = "2",
) -> None:
    text_node = ElementTree.SubElement(
        parent,
        "t",
        {
            "id": str(object_id),
            "p": f"{x:.1f} {y:.1f}",
            "BoundingBox": f"{x:.1f} {y:.1f} {x + 160:.1f} {y + 16:.1f}",
            "CaptionJustification": "Center",
            "Justification": "Center",
            "LineHeight": "auto",
            "Z": z_index,
        },
    )
    string_node = ElementTree.SubElement(
        text_node,
        "s",
        {"font": "3", "size": size, "color": color, "face": "0"},
    )
    string_node.text = text


def _format_cdxml_energy_value(value: float, unit: EnergyUnit, decimals: int) -> str:
    return f"{value:.{decimals}f} {_unit_label(unit)}"


def _format_cdxml_step_delta(value: float, unit: EnergyUnit, decimals: int) -> str:
    return f"Delta E {value:.{decimals}f} {_unit_label(unit)}"


def _format_cdxml_missing_marker(reason: str | None, options: CdxmlDiagramOptions) -> str:
    if options.show_missing_reason and reason:
        return f"missing: {reason}"
    return "missing"


def _cdxml_artifact_metadata(route: EnergyDiagramRoute, options: CdxmlDiagramOptions) -> dict[str, Any]:
    return {
        "cdxml_includes_step_delta": options.show_step_delta,
        "cdxml_includes_correction_markers": options.show_correction_markers,
        "cdxml_includes_missing_reason": options.show_missing_reason,
        "cdxml_step_delta_count": route.step_delta_count if options.show_step_delta else 0,
        "cdxml_correction_marker_count": (
            route.correction_marker_count if options.show_correction_markers else 0
        ),
        "cdxml_missing_point_count": route.missing_point_count,
    }


def _cdxml_bbox(x1: float, y1: float, x2: float, y2: float) -> str:
    left = min(x1, x2)
    top = min(y1, y2)
    right = max(x1, x2)
    bottom = max(y1, y2)
    return f"{left:.1f} {top:.1f} {right:.1f} {bottom:.1f}"


def _row_from_chemical_object(obj: ChemicalObject) -> EnergyTableRow:
    values: dict[str, Any] = {}
    _add_energy_pair(values, "egas", obj.energies.get("egas") or obj.energies.get("electronic"))
    _add_energy_pair(values, "ggas", obj.thermochemistry.get("ggas") or obj.energies.get("ggas"))
    _add_energy_pair(values, "ggas_1m", obj.thermochemistry.get("ggas_1m") or obj.energies.get("ggas_1m"))
    _add_energy_pair(
        values,
        "ggas_shermo",
        obj.thermochemistry.get("ggas_shermo") or obj.energies.get("ggas_shermo"),
    )
    _add_energy_pair(
        values,
        "ggas_shermo_1m",
        obj.thermochemistry.get("ggas_shermo_1m") or obj.energies.get("ggas_shermo_1m"),
    )
    _add_energy_pair(values, "esol", obj.energies.get("esol"))
    _add_energy_pair(values, "gsol", obj.thermochemistry.get("gsol") or obj.energies.get("gsol"))
    return EnergyTableRow(
        structure_name=structure_display_name(obj),
        values=values,
        object_id=obj.id,
    )


def _row_from_energy_point(point: Any) -> EnergyTableRow:
    values: dict[str, Any] = {}
    if point.relative_energy is not None:
        values["relative_energy"] = point.relative_energy.value
        values["relative_unit"] = point.relative_energy.unit
    if point.missing_reason is not None:
        values["missing_reason"] = point.missing_reason
    return EnergyTableRow(
        structure_name=point.label,
        values=values,
        node_id=point.node_id,
        missing_reason=point.missing_reason,
    )


def _merge_profile_values(row: EnergyTableRow, profile: EnergyProfile) -> EnergyTableRow:
    point_by_node = {point.node_id: point for point in profile.points}
    point_by_label = {point.label: point for point in profile.points}
    point = None
    if row.node_id is not None:
        point = point_by_node.get(row.node_id)
    if point is None:
        point = point_by_label.get(row.structure_name)
    if point is None:
        return row

    values = dict(row.values)
    missing_reason = row.missing_reason or point.missing_reason
    if point.relative_energy is not None:
        values.setdefault("relative_energy", point.relative_energy.value)
        values.setdefault("relative_unit", point.relative_energy.unit)
    if missing_reason is not None:
        values.setdefault("missing_reason", missing_reason)
    return replace(row, values=values, node_id=row.node_id or point.node_id, missing_reason=missing_reason)


def _add_energy_pair(values: dict[str, Any], prefix: str, energy: EnergyValue | None) -> None:
    if energy is None:
        return
    hartree = _convert_energy(energy, "hartree")
    kcal_mol = _convert_energy(energy, "kcal_mol")
    if hartree is not None:
        values[f"{prefix}_hartree"] = hartree
    if kcal_mol is not None:
        values[f"{prefix}_kcal_mol"] = kcal_mol


def _convert_energy(energy: EnergyValue, output_unit: EnergyUnit) -> float | None:
    if energy.unit == output_unit:
        return energy.value
    if energy.unit == "hartree" and output_unit == "kcal_mol":
        return energy.value * HARTREE_TO_KCAL_MOL
    if energy.unit == "kcal_mol" and output_unit == "hartree":
        return energy.value / HARTREE_TO_KCAL_MOL
    if energy.unit == "kcal_mol" and output_unit == "kj_mol":
        return energy.value * KCAL_MOL_TO_KJ_MOL
    if energy.unit == "kj_mol" and output_unit == "kcal_mol":
        return energy.value / KCAL_MOL_TO_KJ_MOL
    if energy.unit == "hartree" and output_unit == "kj_mol":
        return energy.value * HARTREE_TO_KCAL_MOL * KCAL_MOL_TO_KJ_MOL
    if energy.unit == "kj_mol" and output_unit == "hartree":
        return energy.value / KCAL_MOL_TO_KJ_MOL / HARTREE_TO_KCAL_MOL
    return None


def _energy_table_warnings(
    rows: tuple[EnergyTableRow, ...],
    profile: EnergyProfile | None,
) -> tuple[RxnFlowWarning, ...]:
    warnings = list(_profile_warnings(profile))
    for row in rows:
        warnings.extend(row.warnings)
        if row.missing_reason is not None:
            warnings.append(
                RxnFlowWarning(
                    code="missing_energy_point",
                    message=f"Energy table row '{row.structure_name}' has missing data.",
                    target=row.node_id or row.object_id,
                )
            )
    return tuple(warnings)


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
        warnings.append(RxnFlowWarning(code=code, message=message, target=target))
    return tuple(warnings)


def _artifact_metadata(
    project_id: str,
    request: ExportRequest,
    rendered: _RenderedArtifact,
    basename: str,
    byte_length: int,
) -> dict[str, Any]:
    capability = export_format_capability(rendered.format)
    graph = _graph_snapshot_graph(request)
    metadata = {
        "project_id": project_id,
        "graph_id": graph.id if graph is not None else _profile_graph_id(request),
        "profile_id": request.profile.id if request.profile is not None else None,
        "path_id": request.profile.path_id if request.profile is not None else None,
        "object_count": len(request.objects),
        "format": rendered.format,
        "bytes_length": byte_length,
        "writer_id": rendered.writer_id,
        "title": request.title,
        "basename": basename,
        "warnings": [warning.code for warning in rendered.warnings],
    }
    if capability is not None:
        metadata.update(
            {
                "extension": capability.extension,
                "mime_type": capability.mime_type,
                "artifact_kind": capability.artifact_kind,
                "format_status": capability.status,
            }
        )
    if rendered.format in ("xlsx", "csv"):
        rows = build_energy_table_rows(request.objects, request.profile, request.table_rows)
        metadata["energy_table_schema_version"] = ENERGY_TABLE_SCHEMA_VERSION
        metadata["energy_table_column_count"] = len(ENERGY_TABLE_COLUMNS)
        metadata["energy_table_row_count"] = len(rows)
    metadata.update(rendered.metadata)
    return metadata


def _artifact_id(
    project_id: str,
    request: ExportRequest,
    export_format: str,
    basename: str,
) -> str:
    graph = _graph_snapshot_graph(request)
    source = "|".join(
        (
            project_id,
            export_format,
            basename,
            graph.id if graph is not None else "",
            request.workspace.workspace_id if request.workspace is not None else "",
            request.workspace.active_path_id if request.workspace is not None and request.workspace.active_path_id is not None else "",
            request.profile.id if request.profile is not None else "",
            request.profile.path_id if request.profile is not None else "",
        )
    )
    digest = hashlib.sha1(source.encode("utf-8")).hexdigest()[:12]
    return f"artifact-{export_format}-{digest}"


def _source_name(request: ExportRequest) -> str | None:
    if request.profile is not None:
        return request.profile.id
    if request.workspace is not None:
        return request.workspace.graph.id
    if request.graph is not None:
        return request.graph.id
    if request.objects:
        return request.objects[0].label or request.objects[0].id
    if request.table_rows:
        return request.table_rows[0].structure_name
    return None


def _profile_graph_id(request: ExportRequest) -> str | None:
    return request.profile.graph_id if request.profile is not None else None


def _profile_path_id(request: ExportRequest) -> str | None:
    return request.profile.path_id if request.profile is not None else None


def _cdxml_options(raw_options: dict[str, Any]) -> CdxmlDiagramOptions:
    cdxml_options = raw_options.get("cdxml") if raw_options else None
    if not isinstance(cdxml_options, dict):
        return CdxmlDiagramOptions()
    return CdxmlDiagramOptions(
        state_line_span=float(cdxml_options.get("state_line_span", 54.0)),
        show_values=bool(cdxml_options.get("show_values", True)),
        show_labels=bool(cdxml_options.get("show_labels", True)),
        show_step_delta=bool(cdxml_options.get("show_step_delta", True)),
        show_correction_markers=bool(cdxml_options.get("show_correction_markers", True)),
        show_missing_reason=bool(cdxml_options.get("show_missing_reason", True)),
        decimals=int(cdxml_options.get("decimals", 2)),
        y_axis_label=cdxml_options.get("y_axis_label"),
        line_style=str(cdxml_options.get("line_style", "solid")),
    )


def _state_positions(count: int, start_x: float, end_x: float) -> tuple[float, ...]:
    if count <= 0:
        return ()
    if count == 1:
        return ((start_x + end_x) / 2,)
    step = (end_x - start_x) / (count - 1)
    return tuple(start_x + step * index for index in range(count))


def _energy_bounds(values: list[float | None]) -> tuple[float, float]:
    valid_values = [value for value in values if value is not None]
    if not valid_values:
        return -1.0, 1.0
    min_y = min(valid_values)
    max_y = max(valid_values)
    if min_y == max_y:
        return min_y - 1.0, max_y + 1.0
    padding = max((max_y - min_y) * 0.18, 1.0)
    return min_y - padding, max_y + padding


def _map_energy_to_y(value: float, min_y: float, max_y: float, top: float, bottom: float) -> float:
    return bottom - ((value - min_y) / (max_y - min_y)) * (bottom - top)


def _scale_diagram_x(value: float | None, output_start: float, output_end: float) -> float | None:
    if value is None:
        return None
    input_start = 150.0
    input_end = 624.0
    if input_start == input_end:
        return (output_start + output_end) / 2
    return output_start + (value - input_start) / (input_end - input_start) * (output_end - output_start)


def _scale_diagram_y(value: float | None, output_top: float, output_bottom: float) -> float | None:
    if value is None:
        return None
    input_top = 62.0
    input_bottom = 338.0
    return output_top + (value - input_top) / (input_bottom - input_top) * (output_bottom - output_top)


def _unit_label(unit: EnergyUnit) -> str:
    if unit == "kcal_mol":
        return "kcal/mol"
    if unit == "kj_mol":
        return "kJ/mol"
    return "Hartree"
