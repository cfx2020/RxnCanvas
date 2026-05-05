"""Report export contracts and writers for RxnFlow core objects."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from io import BytesIO
import hashlib
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
    ReactionGraph,
)
from .result import Result, err, ok


ExportFormat = Literal["png", "cdxml", "xlsx"]

ALLOWED_EXPORT_FORMATS: frozenset[str] = frozenset(("png", "cdxml", "xlsx"))
EXPORT_CREATED_AT = "2026-05-05T00:00:00Z"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@dataclass(frozen=True)
class ExportArtifact:
    id: str
    format: ExportFormat
    path: str | None = None
    bytes: bytes | None = None
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
    missing_reason: str | None = None


@dataclass(frozen=True)
class EnergyDiagramRoute:
    profile_id: str
    path_id: str
    states: tuple[EnergyDiagramState, ...]
    color: str | None = None
    y_axis_label: str | None = None
    warnings: tuple[RxnFlowWarning, ...] = ()


@dataclass(frozen=True)
class CdxmlDiagramOptions:
    state_line_span: float = 54.0
    show_values: bool = True
    show_labels: bool = True
    decimals: int = 2
    y_axis_label: str | None = None
    line_style: str = "solid"


@dataclass(frozen=True)
class ExportRequest:
    formats: tuple[str, ...]
    graph: ReactionGraph | None = None
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


@dataclass(frozen=True)
class _RenderedArtifact:
    format: ExportFormat
    bytes: bytes
    writer_id: str
    warnings: tuple[RxnFlowWarning, ...]


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

    rows: list[EnergyTableRow] = []
    rows.extend(table_rows)
    rows.extend(_row_from_chemical_object(obj) for obj in objects)

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

    for point in profile.points:
        relative_value = point.relative_energy.value if point.relative_energy is not None else None
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
        states.append(
            EnergyDiagramState(
                node_id=point.node_id,
                label=point.label,
                relative_value=relative_value,
                unit=state_unit,
                missing_reason=missing_reason,
            )
        )

    y_axis_label = diagram_options.y_axis_label or f"Relative energy ({_unit_label(unit)})"
    return EnergyDiagramRoute(
        profile_id=profile.id,
        path_id=profile.path_id,
        states=tuple(states),
        y_axis_label=y_axis_label,
        warnings=tuple(warnings),
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
        if (
            export_format == "xlsx"
            and request.profile is None
            and not request.objects
            and not request.table_rows
        ):
            return RxnFlowError(
                "invalid_input",
                "XLSX export requires an EnergyProfile, ChemicalObject rows, or table rows.",
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
            return ok(_RenderedArtifact("cdxml", artifact_bytes, "rxnflow-cdxml-energy-v1", route.warnings))

        if export_format == "xlsx":
            rows = build_energy_table_rows(request.objects, request.profile, request.table_rows)
            artifact_bytes = _render_xlsx(rows, request.profile, request.title)
            warnings = _energy_table_warnings(rows, request.profile)
            return ok(_RenderedArtifact("xlsx", artifact_bytes, "xlsxwriter-energy-workbook-v1", warnings))
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

    table_sheet = workbook.add_worksheet("Energy Table")
    _write_title_row(table_sheet, title, len(ENERGY_TABLE_COLUMNS), header_format)
    header_row = 1 if title else 0
    for column_index, column in enumerate(ENERGY_TABLE_COLUMNS):
        table_sheet.write(header_row, column_index, column.label, header_format)
    for row_index, table_row in enumerate(rows, start=header_row + 1):
        for column_index, column in enumerate(ENERGY_TABLE_COLUMNS):
            value = table_row.structure_name if column.key == "structure_name" else table_row.values.get(column.key)
            _write_cell(table_sheet, row_index, column_index, value, number_format, text_format)
    table_sheet.freeze_panes(header_row + 1, 1)
    table_sheet.set_column(0, 0, 24)
    table_sheet.set_column(1, len(ENERGY_TABLE_COLUMNS) - 1, 18)

    if profile is not None:
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
            profile_sheet.write(0, column_index, header, header_format)
        for row_index, point in enumerate(profile.points, start=1):
            absolute = point.absolute_energy
            relative = point.relative_energy
            profile_sheet.write(row_index, 0, point.node_id, text_format)
            profile_sheet.write(row_index, 1, point.label, text_format)
            _write_cell(profile_sheet, row_index, 2, absolute.value if absolute else None, number_format, text_format)
            _write_cell(profile_sheet, row_index, 3, absolute.unit if absolute else None, number_format, text_format)
            _write_cell(profile_sheet, row_index, 4, relative.value if relative else None, number_format, text_format)
            _write_cell(profile_sheet, row_index, 5, relative.unit if relative else None, number_format, text_format)
            _write_cell(profile_sheet, row_index, 6, point.missing_reason, number_format, text_format)
        profile_sheet.freeze_panes(1, 1)
        profile_sheet.set_column(0, 6, 18)

    warnings = _energy_table_warnings(rows, profile)
    if warnings:
        warning_sheet = workbook.add_worksheet("Warnings")
        for column_index, header in enumerate(("Code", "Message", "Target")):
            warning_sheet.write(0, column_index, header, header_format)
        for row_index, warning in enumerate(warnings, start=1):
            warning_sheet.write(row_index, 0, warning.code, text_format)
            warning_sheet.write(row_index, 1, warning.message, text_format)
            warning_sheet.write(row_index, 2, warning.target, text_format)
        warning_sheet.set_column(0, 2, 32)

    workbook.close()
    return output.getvalue()


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

    valid_values = [state.relative_value for state in route.states if state.relative_value is not None]
    min_y, max_y = _energy_bounds(valid_values)
    positions = _state_positions(len(route.states), left + 38, width - right - 34)

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
    for position_x, state in zip(positions, route.states):
        label_y = height - bottom + 18
        if state.relative_value is None:
            draw.text((position_x - 28, label_y), state.label, fill=(118, 128, 138))
            draw.text((position_x - 24, label_y + 18), "missing", fill=(176, 87, 67))
            previous = None
            continue

        y = _map_energy_to_y(state.relative_value, min_y, max_y, top, height - bottom)
        start_x = position_x - 34
        end_x = position_x + 34
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
    root = ElementTree.Element(
        "CDXML",
        {
            "CreationProgram": "RxnFlow",
            "Name": "RxnFlow Energy Diagram",
            "BoundingBox": "0 0 720 420",
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

    page = ElementTree.SubElement(root, "page", {"id": "1", "BoundingBox": "0 0 720 420"})
    group = ElementTree.SubElement(page, "group", {"id": "2", "Integral": "yes"})
    object_id = 3

    _cdxml_text(group, object_id, 90, 22, title or route.y_axis_label or "Relative energy", size="14")
    object_id += 1
    _cdxml_text(group, object_id, 20, 74, route.y_axis_label or "Relative energy", size="9")
    object_id += 1

    left = 88.0
    right = 662.0
    top = 62.0
    bottom = 338.0
    valid_values = [state.relative_value for state in route.states if state.relative_value is not None]
    min_y, max_y = _energy_bounds(valid_values)

    ElementTree.SubElement(
        group,
        "graphic",
        {
            "id": str(object_id),
            "GraphicType": "Line",
            "LineType": "Solid",
            "BoundingBox": f"{left:.1f} {top:.1f} {left:.1f} {bottom:.1f}",
            "color": "2",
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
        },
    )
    object_id += 1

    positions = _state_positions(len(route.states), left + 62, right - 38)
    previous: tuple[float, float] | None = None
    state_span = options.state_line_span
    for position_x, state in zip(positions, route.states):
        if state.relative_value is None:
            _cdxml_text(group, object_id, position_x - 28, bottom + 18, state.label, size="9", color="5")
            object_id += 1
            _cdxml_text(group, object_id, position_x - 28, bottom + 34, "missing", size="8", color="4")
            object_id += 1
            previous = None
            continue

        y = _map_energy_to_y(state.relative_value, min_y, max_y, top, bottom)
        line_start = position_x - state_span / 2
        line_end = position_x + state_span / 2
        if previous is not None:
            ElementTree.SubElement(
                group,
                "arrow",
                {
                    "id": str(object_id),
                    "ArrowheadType": "Solid",
                    "Tail3D": f"{previous[0]:.1f} {previous[1]:.1f} 0",
                    "Head3D": f"{line_start:.1f} {y:.1f} 0",
                    "color": "3",
                },
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
            },
        )
        object_id += 1
        if options.show_labels:
            _cdxml_text(group, object_id, position_x - 26, bottom + 18, state.label, size="9")
            object_id += 1
        if options.show_values:
            _cdxml_text(
                group,
                object_id,
                position_x - 18,
                y - 16,
                f"{state.relative_value:.{options.decimals}f}",
                size="9",
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


def _cdxml_text(
    parent: ElementTree.Element,
    object_id: int,
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
        },
    )
    string_node = ElementTree.SubElement(
        text_node,
        "s",
        {"font": "3", "size": size, "color": color, "face": "0"},
    )
    string_node.text = text


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
        structure_name=obj.label or obj.id,
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
    return {
        "project_id": project_id,
        "graph_id": request.graph.id if request.graph is not None else _profile_graph_id(request),
        "profile_id": request.profile.id if request.profile is not None else None,
        "path_id": request.profile.path_id if request.profile is not None else None,
        "object_count": len(request.objects),
        "format": rendered.format,
        "bytes_length": byte_length,
        "writer_id": rendered.writer_id,
        "title": request.title,
        "basename": basename,
        "warnings": tuple(warning.code for warning in rendered.warnings),
    }


def _artifact_id(
    project_id: str,
    request: ExportRequest,
    export_format: str,
    basename: str,
) -> str:
    source = "|".join(
        (
            project_id,
            export_format,
            basename,
            request.graph.id if request.graph is not None else "",
            request.profile.id if request.profile is not None else "",
            request.profile.path_id if request.profile is not None else "",
        )
    )
    digest = hashlib.sha1(source.encode("utf-8")).hexdigest()[:12]
    return f"artifact-{export_format}-{digest}"


def _source_name(request: ExportRequest) -> str | None:
    if request.profile is not None:
        return request.profile.id
    if request.graph is not None:
        return request.graph.id
    if request.objects:
        return request.objects[0].label or request.objects[0].id
    if request.table_rows:
        return request.table_rows[0].structure_name
    return None


def _profile_graph_id(request: ExportRequest) -> str | None:
    return request.profile.graph_id if request.profile is not None else None


def _cdxml_options(raw_options: dict[str, Any]) -> CdxmlDiagramOptions:
    cdxml_options = raw_options.get("cdxml") if raw_options else None
    if not isinstance(cdxml_options, dict):
        return CdxmlDiagramOptions()
    return CdxmlDiagramOptions(
        state_line_span=float(cdxml_options.get("state_line_span", 54.0)),
        show_values=bool(cdxml_options.get("show_values", True)),
        show_labels=bool(cdxml_options.get("show_labels", True)),
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


def _unit_label(unit: EnergyUnit) -> str:
    if unit == "kcal_mol":
        return "kcal/mol"
    if unit == "kj_mol":
        return "kJ/mol"
    return "Hartree"
