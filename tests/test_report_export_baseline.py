from __future__ import annotations

from io import BytesIO, StringIO
import builtins
import csv
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree
from zipfile import ZipFile

from rxnflow import run_core_fixture_vertical_slice
from rxnflow.errors import RxnFlowWarning
from rxnflow.export import (
    ALLOWED_EXPORT_FORMATS,
    EXPORT_FORMAT_CAPABILITIES,
    ENERGY_TABLE_COLUMNS,
    ENERGY_TABLE_SCHEMA_VERSION,
    PNG_SIGNATURE,
    CdxmlDiagramOptions,
    EnergyDiagramRoute,
    EnergyDiagramState,
    EnergyTableRow,
    ExportArtifact,
    ExportRequest,
    ReportExportService,
    build_energy_diagram_route,
    build_energy_table_rows,
    energy_table_columns_by_key,
    export_format_capabilities_by_format,
    export_format_capability,
    normalize_energy_table_header,
    supported_export_formats,
)
from rxnflow.models import (
    ChemicalObject,
    CorrectionComponent,
    EnergyExpression,
    EnergyOptions,
    EnergyPoint,
    EnergyProfile,
    EnergyValue,
    ReactionEdge,
    ReactionGraph,
    ReactionNode,
    ReactionPath,
)
from rxnflow.workspace import CanvasViewport, NetworkPreview, WorkspaceSelection, WorkspaceSnapshot


PROJECT_ID = "project-a"


class ReportExportBaselineTest(unittest.TestCase):
    def test_export_contracts_and_input_validation(self) -> None:
        self.assertEqual(ALLOWED_EXPORT_FORMATS, frozenset(("png", "cdxml", "xlsx", "csv", "svg")))
        self.assertEqual(supported_export_formats(), ALLOWED_EXPORT_FORMATS)
        self.assertEqual(ENERGY_TABLE_SCHEMA_VERSION, "energy-table-v1")
        self.assertEqual(ENERGY_TABLE_COLUMNS[0].key, "structure_name")
        self.assertEqual(ENERGY_TABLE_COLUMNS[0].label, "Structure")
        self.assertEqual(
            len({column.key for column in ENERGY_TABLE_COLUMNS}),
            len(ENERGY_TABLE_COLUMNS),
        )
        columns = energy_table_columns_by_key()
        self.assertEqual(columns["egas_hartree"].unit, "hartree")
        self.assertEqual(columns["egas_hartree"].source, "energies.egas")

        request = ExportRequest(formats=("png",), profile=_profile())
        artifact = ExportArtifact("artifact-a", "png", bytes=PNG_SIGNATURE, metadata={"format": "png"})
        state = EnergyDiagramState("node-a", "A", 0.0, "kcal_mol")
        route = EnergyDiagramRoute("profile-main", "path-main", (state,))
        self.assertEqual(request.formats, ("png",))
        self.assertEqual(artifact.metadata["format"], "png")
        self.assertEqual(route.states[0].label, "A")
        self.assertEqual(CdxmlDiagramOptions().state_line_span, 54.0)

        capabilities = export_format_capabilities_by_format()
        self.assertEqual(
            set(capabilities),
            {"png", "cdxml", "xlsx", "csv", "svg", "pdf", "pptx", "cdx"},
        )
        self.assertEqual([capability.format for capability in EXPORT_FORMAT_CAPABILITIES], [
            "png",
            "cdxml",
            "xlsx",
            "csv",
            "svg",
            "pdf",
            "pptx",
            "cdx",
        ])
        self.assertEqual(capabilities["png"].mime_type, "image/png")
        self.assertEqual(capabilities["cdxml"].extension, "cdxml")
        self.assertEqual(capabilities["xlsx"].artifact_kind, "energy_table")
        self.assertTrue(capabilities["xlsx"].supports_browser_persistence)
        self.assertEqual(capabilities["csv"].status, "supported")
        self.assertTrue(capabilities["csv"].supports_browser_persistence)
        self.assertTrue(capabilities["csv"].web_default_enabled)
        self.assertEqual(capabilities["csv"].writer_id, "python-csv-energy-table-v1")
        self.assertEqual(capabilities["svg"].status, "supported")
        self.assertEqual(capabilities["svg"].writer_id, "python-svg-graph-snapshot-v1")
        self.assertTrue(capabilities["svg"].supports_browser_persistence)
        self.assertTrue(capabilities["svg"].web_default_enabled)
        for future_format in ("pdf", "pptx", "cdx"):
            capability = capabilities[future_format]
            self.assertEqual(capability.status, "unsupported")
            self.assertIsNone(capability.writer_id)
            self.assertFalse(capability.supports_browser_persistence)
            self.assertFalse(capability.web_default_enabled)
            self.assertIsNotNone(capability.unsupported_reason)
        self.assertEqual(capabilities["pdf"].artifact_kind, "report_document")
        self.assertEqual(capabilities["pptx"].artifact_kind, "report_document")
        self.assertEqual(capabilities["cdx"].artifact_kind, "external_conversion")
        self.assertIn("dependency", capabilities["pdf"].unsupported_reason or "")
        self.assertIn("slide contract", capabilities["pptx"].unsupported_reason or "")
        self.assertEqual(capabilities["cdx"].unsupported_reason, "ChemDraw CDX binary writer/converter is not available.")
        self.assertIs(export_format_capability("missing"), None)

        service = ReportExportService()
        self.assert_error(service.export("", request), "invalid_input", "project_id")
        self.assert_error(
            service.export(PROJECT_ID, ExportRequest(formats=())),
            "invalid_input",
            "formats",
        )
        self.assert_error(
            service.export(PROJECT_ID, ExportRequest(formats=("png",))),
            "invalid_input",
            "profile",
        )
        self.assert_error(
            service.export(PROJECT_ID, ExportRequest(formats=("cdxml",))),
            "invalid_input",
            "profile",
        )
        self.assert_error(
            service.export(PROJECT_ID, ExportRequest(formats=("xlsx",))),
            "invalid_input",
            "request",
        )
        self.assert_error(
            service.export(PROJECT_ID, ExportRequest(formats=("svg",))),
            "invalid_input",
            "graph",
        )
        for export_format in ("cdx", "pdf", "pptx"):
            unsupported_result = service.export(
                PROJECT_ID,
                ExportRequest(formats=(export_format,), profile=_profile()),
            )
            self.assert_error(unsupported_result, "invalid_input", "formats")
            self.assertEqual(unsupported_result.error.details["format"], export_format)  # type: ignore[union-attr]
            self.assertEqual(unsupported_result.error.details["supported"], sorted(ALLOWED_EXPORT_FORMATS))  # type: ignore[union-attr]

        self.assert_error(
            service.export(PROJECT_ID, ExportRequest(formats=("csv",))),
            "invalid_input",
            "request",
        )

    def test_svg_graph_snapshot_exports_valid_xml_and_metadata(self) -> None:
        service = ReportExportService()
        graph = _graph_with_projection()
        workspace = _workspace(graph)
        result = service.export(
            PROJECT_ID,
            ExportRequest(
                formats=("svg",),
                graph=ReactionGraph("ignored-graph", PROJECT_ID),
                workspace=workspace,
                profile=_profile(),
                basename="graph-snapshot",
                title="Graph Snapshot",
            ),
        )

        self.assertTrue(result.ok, result.error)
        artifact = result.value[0]  # type: ignore[index]
        self.assertEqual(artifact.format, "svg")
        self.assertTrue((artifact.bytes or b"").startswith(b'<?xml version="1.0" encoding="UTF-8"?>'))
        self.assertEqual(artifact.metadata["writer_id"], "python-svg-graph-snapshot-v1")
        self.assertEqual(artifact.metadata["extension"], "svg")
        self.assertEqual(artifact.metadata["mime_type"], "image/svg+xml")
        self.assertEqual(artifact.metadata["artifact_kind"], "graph_snapshot")
        self.assertEqual(artifact.metadata["format_status"], "supported")
        self.assertEqual(artifact.metadata["graph_id"], "graph-main")
        self.assertEqual(artifact.metadata["workspace_id"], "workspace-main")
        self.assertEqual(artifact.metadata["node_count"], 3)
        self.assertEqual(artifact.metadata["edge_count"], 2)
        self.assertEqual(artifact.metadata["path_count"], 1)
        self.assertEqual(artifact.metadata["active_path_id"], "path-main")
        self.assertEqual(artifact.metadata["selected_node_count"], 1)
        self.assertEqual(artifact.metadata["selected_edge_count"], 1)
        self.assertEqual(artifact.metadata["selected_path_count"], 1)
        self.assertEqual(artifact.metadata["viewport_x"], 24.0)
        self.assertEqual(artifact.metadata["viewport_y"], 12.0)
        self.assertEqual(artifact.metadata["viewport_zoom"], 1.25)
        self.assertEqual(artifact.metadata["svg_width"], 720)
        self.assertEqual(artifact.metadata["svg_height"], 432)

        xml_text = (artifact.bytes or b"").decode("utf-8")
        for forbidden in ("<script", "<foreignObject", "xlink:href", ' href="', "https://"):
            self.assertNotIn(forbidden, xml_text)
        root = ElementTree.fromstring(xml_text)
        self.assertTrue(root.tag.endswith("svg"))
        self.assertEqual(root.attrib["data-rxnflow-artifact"], "graph-snapshot")
        self.assertEqual(root.attrib["data-graph-id"], "graph-main")
        self.assertEqual(root.attrib["data-workspace-id"], "workspace-main")
        self.assertEqual(root.attrib["data-active-path-id"], "path-main")
        self.assertEqual(root.attrib["viewBox"], "0 0 720 432")

        graph_group = _svg_element_by_class(root, "graph-snapshot-graph")
        self.assertIsNotNone(graph_group)
        assert graph_group is not None
        self.assertEqual(graph_group.attrib["data-viewport-x"], "24")
        self.assertEqual(graph_group.attrib["data-viewport-y"], "12")
        self.assertEqual(graph_group.attrib["data-viewport-zoom"], "1.25")

        selected_node = _svg_element_by_attr(root, "data-node-id", "node-ts")
        self.assertIsNotNone(selected_node)
        assert selected_node is not None
        self.assertIn("graph-snapshot-node--active", selected_node.attrib["class"])
        self.assertIn("graph-snapshot-node--selected", selected_node.attrib["class"])
        self.assertEqual(selected_node.attrib["data-active-path"], "true")
        self.assertEqual(selected_node.attrib["data-selected"], "true")

        selected_edge = _svg_element_by_attr(root, "data-edge-id", "edge-a-ts")
        self.assertIsNotNone(selected_edge)
        assert selected_edge is not None
        self.assertIn("graph-snapshot-edge--active", selected_edge.attrib["class"])
        self.assertIn("graph-snapshot-edge--selected", selected_edge.attrib["class"])
        self.assertEqual(selected_edge.attrib["data-active-path"], "true")
        self.assertEqual(selected_edge.attrib["data-selected"], "true")

        text_values = [element.text for element in root.iter() if element.text]
        self.assertIn("TS <A & B>", text_values)
        self.assertIn("R & TS <A>", text_values)

    def test_svg_graph_snapshot_handles_empty_graph_and_fallback_positions(self) -> None:
        service = ReportExportService()
        empty_result = service.export(
            PROJECT_ID,
            ExportRequest(formats=("svg",), graph=ReactionGraph("graph-empty", PROJECT_ID)),
        )

        self.assertTrue(empty_result.ok, empty_result.error)
        empty_artifact = empty_result.value[0]  # type: ignore[index]
        empty_root = ElementTree.fromstring(empty_artifact.bytes or b"")
        self.assertEqual(empty_artifact.metadata["graph_id"], "graph-empty")
        self.assertEqual(empty_artifact.metadata["node_count"], 0)
        self.assertEqual(empty_artifact.metadata["edge_count"], 0)
        self.assertEqual(empty_artifact.metadata["path_count"], 0)
        self.assertIn("Empty graph", [element.text for element in empty_root.iter() if element.text])

        fallback_graph = ReactionGraph(
            id="graph-fallback",
            project_id=PROJECT_ID,
            nodes=(
                ReactionNode("node-a", "species", "A"),
                ReactionNode("node-b", "species", "B"),
                ReactionNode("node-c", "species", "C"),
            ),
            edges=(ReactionEdge("edge-a-b", "node-a", "node-b"),),
        )
        first = service.export(PROJECT_ID, ExportRequest(formats=("svg",), graph=fallback_graph))
        second = service.export(PROJECT_ID, ExportRequest(formats=("svg",), graph=fallback_graph))

        self.assertTrue(first.ok, first.error)
        self.assertTrue(second.ok, second.error)
        first_artifact = first.value[0]  # type: ignore[index]
        second_artifact = second.value[0]  # type: ignore[index]
        self.assertEqual(first_artifact.bytes, second_artifact.bytes)
        root = ElementTree.fromstring(first_artifact.bytes or b"")
        transforms = [
            element.attrib["transform"]
            for element in root.iter()
            if element.attrib.get("data-node-id") in {"node-a", "node-b", "node-c"}
        ]
        self.assertEqual(len(transforms), 3)
        self.assertTrue(all("translate(" in transform for transform in transforms))

    def test_energy_table_header_mapping_covers_user_workbook_headers(self) -> None:
        self.assertEqual(normalize_energy_table_header("Egas", context="hartree"), "egas_hartree")
        self.assertEqual(normalize_energy_table_header("Egas", context="kcal/mol"), "egas_kcal_mol")
        self.assertEqual(normalize_energy_table_header("basis function", context="gas"), "gas_basis_functions")
        self.assertEqual(normalize_energy_table_header("basis f", context="solution"), "solution_basis_functions")
        self.assertEqual(normalize_energy_table_header("Ggas+1M", context="hartree"), "ggas_1m_hartree")
        self.assertEqual(normalize_energy_table_header("Ggas（shermo）", context="kcal/mol"), "ggas_shermo_kcal_mol")
        self.assertEqual(
            normalize_energy_table_header("Ggas（shermo+1M）", context="hartree"),
            "ggas_shermo_1m_hartree",
        )
        self.assertEqual(normalize_energy_table_header("Esol", context="hartree"), "esol_hartree")
        self.assertEqual(normalize_energy_table_header("Gsol", context="kcal/mol"), "gsol_kcal_mol")
        self.assertEqual(normalize_energy_table_header("Relative energy"), "relative_energy")

        for entropy_header in (
            "Sgau,tran",
            "Swhit,tran",
            "Sgau,tran -Swhit,tran",
            "T*(Sgau,tran -Swhit,tran)/1000",
            "RT*0.239006/1000",
        ):
            self.assertIsNone(normalize_energy_table_header(entropy_header))

    def test_artifacts_keep_format_order_metadata_and_destination_paths(self) -> None:
        service = ReportExportService()
        profile = _profile()
        graph = _graph()

        with tempfile.TemporaryDirectory() as temp_dir:
            result = service.export(
                PROJECT_ID,
                ExportRequest(
                    formats=("png", "cdxml"),
                    graph=graph,
                    profile=profile,
                    destination_dir=temp_dir,
                    basename="main-route",
                    title="Main route",
                ),
            )

            self.assertTrue(result.ok, result.error)
            artifacts = result.value
            assert artifacts is not None
            self.assertEqual([artifact.format for artifact in artifacts], ["png", "cdxml"])
            self.assertEqual(artifacts[0].bytes[:8], PNG_SIGNATURE)
            self.assertTrue(Path(temp_dir, "main-route.png").exists())
            self.assertTrue(Path(temp_dir, "main-route.cdxml").exists())
            for artifact in artifacts:
                self.assertIsNotNone(artifact.bytes)
                self.assertIsNotNone(artifact.path)
                self.assertEqual(artifact.metadata["graph_id"], "graph-main")
                self.assertEqual(artifact.metadata["profile_id"], "profile-main")
                self.assertEqual(artifact.metadata["path_id"], "path-main")
                self.assertEqual(artifact.metadata["title"], "Main route")
                self.assertEqual(artifact.metadata["object_count"], 0)
                self.assertEqual(artifact.metadata["format"], artifact.format)
                self.assertEqual(artifact.metadata["bytes_length"], len(artifact.bytes or b""))
                self.assertIn("writer_id", artifact.metadata)
                self.assertEqual(artifact.metadata["extension"], artifact.format)
                self.assertEqual(artifact.metadata["artifact_kind"], "energy_diagram")
                self.assertEqual(artifact.metadata["format_status"], "supported")
                if artifact.format == "png":
                    self.assertEqual(artifact.metadata["mime_type"], "image/png")
                if artifact.format == "cdxml":
                    self.assertEqual(artifact.metadata["mime_type"], "chemical/x-cdxml")

        with tempfile.TemporaryDirectory() as temp_dir:
            bad_basename = service.export(
                PROJECT_ID,
                ExportRequest(
                    formats=("png",),
                    profile=profile,
                    destination_dir=temp_dir,
                    basename="../main-route",
                ),
            )
            self.assert_error(bad_basename, "invalid_input", "basename")
            self.assertEqual(list(Path(temp_dir).iterdir()), [])

        missing_destination = service.export(
            PROJECT_ID,
            ExportRequest(
                formats=("png",),
                profile=profile,
                destination_dir="/tmp/rxnflow-export-does-not-exist",
                basename="main-route",
            ),
        )
        self.assert_error(missing_destination, "export_failed", "destination")

    def test_energy_diagram_route_derives_step_delta_and_correction_counts(self) -> None:
        profile = _profile_with_points((
            EnergyPoint("node-a", "A", relative_energy=EnergyValue(0.0, "kcal_mol")),
            EnergyPoint(
                "node-ts",
                "TS",
                relative_energy=EnergyValue(12.5, "kcal_mol"),
                expression=_expression_with_corrections("node-ts", 2),
            ),
            EnergyPoint("node-missing", "Missing", relative_energy=None, missing_reason="missing_energy"),
            EnergyPoint("node-b", "B", relative_energy=EnergyValue(4.2, "kcal_mol")),
        ))

        route = build_energy_diagram_route(profile)

        self.assertEqual([state.label for state in route.states], ["A", "TS", "Missing", "B"])
        self.assertEqual([state.step_delta_value for state in route.states], [None, 12.5, None, None])
        self.assertEqual([state.correction_count for state in route.states], [0, 2, 0, 0])
        self.assertEqual(route.step_delta_count, 1)
        self.assertEqual(route.correction_marker_count, 1)
        self.assertEqual(route.missing_point_count, 1)
        self.assertEqual(route.states[2].missing_reason, "missing_energy")
        self.assertIsNone(route.states[3].step_delta_value)

    def test_cdxml_export_includes_energy_delta_and_correction_markers(self) -> None:
        service = ReportExportService()
        profile = _profile_with_points((
            EnergyPoint("node-a", "A", relative_energy=EnergyValue(0.0, "kcal_mol")),
            EnergyPoint(
                "node-ts",
                "TS <A & B>",
                relative_energy=EnergyValue(12.5, "kcal_mol"),
                expression=_expression_with_corrections("node-ts", 2),
            ),
            EnergyPoint("node-b", "B", relative_energy=EnergyValue(4.2, "kcal_mol")),
        ))

        result = service.export(PROJECT_ID, ExportRequest(formats=("cdxml",), profile=profile))

        self.assertTrue(result.ok, result.error)
        artifact = result.value[0]  # type: ignore[index]
        root = ElementTree.fromstring(artifact.bytes or b"")
        text_values = _xml_text_values(root)
        self.assertIn("A", text_values)
        self.assertIn("TS <A & B>", text_values)
        self.assertIn("B", text_values)
        self.assertIn("0.00 kcal/mol", text_values)
        self.assertIn("12.50 kcal/mol", text_values)
        self.assertIn("4.20 kcal/mol", text_values)
        self.assertIn("Delta E 12.50 kcal/mol", text_values)
        self.assertIn("Delta E -8.30 kcal/mol", text_values)
        self.assertIn("corr x2", text_values)
        self.assertGreaterEqual((artifact.bytes or b"").decode("utf-8").count('LineType="Dashed"'), 2)
        self.assertEqual(artifact.metadata["cdxml_includes_step_delta"], True)
        self.assertEqual(artifact.metadata["cdxml_step_delta_count"], 2)
        self.assertEqual(artifact.metadata["cdxml_correction_marker_count"], 1)
        self.assertEqual(artifact.metadata["cdxml_missing_point_count"], 0)

    def test_cdxml_export_marks_missing_without_fake_lines_or_delta(self) -> None:
        service = ReportExportService()

        result = service.export(PROJECT_ID, ExportRequest(formats=("cdxml",), profile=_profile(missing=True)))

        self.assertTrue(result.ok, result.error)
        artifact = result.value[0]  # type: ignore[index]
        root = ElementTree.fromstring(artifact.bytes or b"")
        text_values = _xml_text_values(root)
        self.assertIn("missing: missing_energy", text_values)
        self.assertNotIn("Delta E 6.25 kcal/mol", text_values)
        self.assertEqual(artifact.metadata["cdxml_step_delta_count"], 0)
        self.assertEqual(artifact.metadata["cdxml_missing_point_count"], 1)

        energy_state_lines = [
            element
            for element in root.iter("graphic")
            if element.attrib.get("color") == "3" and element.attrib.get("LineWidth") == "2"
        ]
        connectors = list(root.iter("arrow"))
        self.assertEqual(len(energy_state_lines), 2)
        self.assertEqual(connectors, [])

    def test_energy_table_rows_are_structure_first_and_do_not_invent_missing_values(self) -> None:
        profile = _profile(missing=True)
        rows = build_energy_table_rows(
            objects=(
                _object("object-a", "A", electronic=EnergyValue(-100.0, "hartree")),
                _object(
                    "object-ts",
                    "TS",
                    electronic=EnergyValue(-99.98, "hartree"),
                    thermochemistry={"ggas": EnergyValue(-99.97, "hartree")},
                    energies={"esol": EnergyValue(-99.95, "hartree")},
                ),
            ),
            profile=profile,
        )

        self.assertEqual([row.structure_name for row in rows], ["A", "TS"])
        self.assertEqual(rows[0].values["egas_hartree"], -100.0)
        self.assertAlmostEqual(rows[0].values["egas_kcal_mol"], -62750.9474, places=4)
        self.assertNotIn("ggas_1m_hartree", rows[0].values)
        self.assertNotIn("gas_basis_functions", rows[0].values)
        self.assertEqual(rows[1].values["missing_reason"], "missing_energy")
        self.assertEqual(rows[1].missing_reason, "missing_energy")

        table_row = EnergyTableRow(
            "custom-ts",
            {"gas_basis_functions": 124, "ggas_shermo_hartree": -200.0},
            warnings=(RxnFlowWarning("manual_table_row", "Manual row", "custom-ts"),),
        )
        custom_rows = build_energy_table_rows(table_rows=(table_row,))
        self.assertEqual(custom_rows[0].values["gas_basis_functions"], 124)
        self.assertEqual(custom_rows[0].values["ggas_shermo_hartree"], -200.0)

    def test_energy_table_row_merge_keeps_manual_values_and_profile_only_rows(self) -> None:
        profile = _profile(missing=True)
        manual_row = EnergyTableRow(
            "TS",
            {"relative_energy": 99.0, "relative_unit": "kcal_mol"},
            node_id="node-ts",
            missing_reason="manual_review",
        )

        rows = build_energy_table_rows(profile=profile, table_rows=(manual_row,))

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].values["relative_energy"], 99.0)
        self.assertEqual(rows[0].values["relative_unit"], "kcal_mol")
        self.assertEqual(rows[0].values["missing_reason"], "manual_review")
        self.assertEqual(rows[0].missing_reason, "manual_review")

        profile_only_rows = build_energy_table_rows(profile=profile)
        self.assertEqual([row.structure_name for row in profile_only_rows], ["A", "TS", "B"])
        self.assertEqual(profile_only_rows[1].node_id, "node-ts")
        self.assertEqual(profile_only_rows[1].missing_reason, "missing_energy")
        self.assertEqual(profile_only_rows[1].values["missing_reason"], "missing_energy")
        self.assertNotIn("relative_energy", profile_only_rows[1].values)
        self.assertNotIn("gas_basis_functions", profile_only_rows[1].values)

    def test_xlsx_writer_outputs_energy_profile_and_warning_sheets(self) -> None:
        service = ReportExportService()
        profile = _profile(warnings=(RxnFlowWarning("manual_warning", "Check TS entropy", "node-ts"),))
        result = service.export(
            PROJECT_ID,
            ExportRequest(
                formats=("xlsx",),
                objects=(
                    _object("object-a", "A", electronic=EnergyValue(-100.0, "hartree")),
                    _object("object-b", "B", electronic=EnergyValue(-99.98, "hartree")),
                ),
                table_rows=(
                    EnergyTableRow(
                        "template-row",
                        {"gas_basis_functions": 256, "solution_basis_functions": 512},
                    ),
                ),
                profile=profile,
                title="Energy workbook",
            ),
        )

        self.assertTrue(result.ok, result.error)
        artifact = result.value[0]  # type: ignore[index]
        self.assertEqual(artifact.format, "xlsx")
        self.assertEqual(artifact.bytes[:2], b"PK")  # type: ignore[index]
        self.assertEqual(artifact.metadata["writer_id"], "xlsxwriter-energy-workbook-v1")
        self.assertEqual(artifact.metadata["extension"], "xlsx")
        self.assertEqual(artifact.metadata["mime_type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.assertEqual(artifact.metadata["artifact_kind"], "energy_table")
        self.assertEqual(artifact.metadata["format_status"], "supported")
        self.assertEqual(artifact.metadata["energy_table_schema_version"], ENERGY_TABLE_SCHEMA_VERSION)
        self.assertEqual(artifact.metadata["energy_table_column_count"], len(ENERGY_TABLE_COLUMNS))

        workbook_xml, all_xml = _xlsx_xml(artifact.bytes or b"")
        self.assertIn('name="Energy Table"', workbook_xml)
        self.assertIn('name="Energy Profile"', workbook_xml)
        self.assertIn('name="Warnings"', workbook_xml)
        self.assertIn('name="Export Metadata"', workbook_xml)
        for expected in (
            "Structure",
            "Egas (Hartree)",
            "Gas basis functions",
            "template-row",
            "A",
            "B",
            "Relative energy",
            "Check TS entropy",
            "Energy workbook",
            "energy_table_schema_version",
            "energy-table-v1",
            "energy_table_column_count",
            "energy_table_row_count",
            "profile-main",
            "path-main",
        ):
            self.assertIn(expected, all_xml)

    def test_xlsx_energy_table_layout_has_group_headers_filter_and_freeze_pane(self) -> None:
        service = ReportExportService()
        result = service.export(
            PROJECT_ID,
            ExportRequest(
                formats=("xlsx",),
                objects=(_object("object-a", "A", electronic=EnergyValue(-100.0, "hartree")),),
                profile=_profile(),
                title="Energy workbook",
            ),
        )

        self.assertTrue(result.ok, result.error)
        artifact = result.value[0]  # type: ignore[index]
        sheet_xml = _xlsx_sheet_xml(artifact.bytes or b"", "sheet1.xml")

        self.assertIn("<mergeCells", sheet_xml)
        self.assertIn("<autoFilter", sheet_xml)
        self.assertIn("<pane", sheet_xml)
        self.assertIn('state="frozen"', sheet_xml)
        self.assertIn("<cols>", sheet_xml)

    def test_csv_writer_outputs_energy_table_contract_without_inventing_values(self) -> None:
        service = ReportExportService()
        profile = _profile(missing=True)
        table_row = EnergyTableRow(
            "manual, row",
            {
                "gas_basis_functions": 256,
                "ggas_shermo_hartree": -200.123456789012,
                "relative_unit": "kcal_mol",
                "missing_reason": None,
            },
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            result = service.export(
                PROJECT_ID,
                ExportRequest(
                    formats=("csv",),
                    table_rows=(table_row,),
                    profile=profile,
                    destination_dir=temp_dir,
                    basename="main-route",
                    title="Energy CSV",
                ),
            )

            self.assertTrue(result.ok, result.error)
            artifact = result.value[0]  # type: ignore[index]
            self.assertEqual(artifact.format, "csv")
            self.assertEqual(artifact.path, str(Path(temp_dir, "main-route.csv")))
            self.assertTrue(Path(temp_dir, "main-route.csv").is_file())
            self.assertEqual(artifact.metadata["writer_id"], "python-csv-energy-table-v1")
            self.assertEqual(artifact.metadata["extension"], "csv")
            self.assertEqual(artifact.metadata["mime_type"], "text/csv")
            self.assertEqual(artifact.metadata["artifact_kind"], "energy_table")
            self.assertEqual(artifact.metadata["format_status"], "supported")
            self.assertEqual(artifact.metadata["energy_table_schema_version"], ENERGY_TABLE_SCHEMA_VERSION)
            self.assertEqual(artifact.metadata["energy_table_column_count"], len(ENERGY_TABLE_COLUMNS))
            self.assertEqual(artifact.metadata["energy_table_row_count"], 1)

            decoded = (artifact.bytes or b"").decode("utf-8")
            parsed = list(csv.reader(StringIO(decoded)))
            self.assertEqual(parsed[0], [column.label for column in ENERGY_TABLE_COLUMNS])
            self.assertEqual(parsed[1][0], "manual, row")
            self.assertEqual(parsed[1][3], "256")
            self.assertEqual(parsed[1][8], "-200.123456789")
            self.assertEqual(parsed[1][18], "kcal_mol")
            self.assertEqual(parsed[1][19], "")
            self.assertNotIn("NA", decoded)

    def test_csv_and_xlsx_share_energy_table_metadata_and_request_order(self) -> None:
        service = ReportExportService()
        result = service.export(
            PROJECT_ID,
            ExportRequest(
                formats=("csv", "xlsx"),
                objects=(
                    _object("object-a", "A", electronic=EnergyValue(-100.0, "hartree")),
                    _object("object-b", "B", electronic=EnergyValue(-99.98, "hartree")),
                ),
                table_rows=(EnergyTableRow("template-row", {"gas_basis_functions": 256}),),
                profile=_profile(),
                basename="energy-table",
            ),
        )

        self.assertTrue(result.ok, result.error)
        artifacts = result.value
        assert artifacts is not None
        self.assertEqual([artifact.format for artifact in artifacts], ["csv", "xlsx"])
        for artifact in artifacts:
            self.assertEqual(artifact.metadata["energy_table_schema_version"], ENERGY_TABLE_SCHEMA_VERSION)
            self.assertEqual(artifact.metadata["energy_table_column_count"], len(ENERGY_TABLE_COLUMNS))
            self.assertEqual(artifact.metadata["energy_table_row_count"], 3)

    def test_xlsx_warning_sheet_is_omitted_without_warnings(self) -> None:
        service = ReportExportService()
        result = service.export(
            PROJECT_ID,
            ExportRequest(
                formats=("xlsx",),
                objects=(_object("object-a", "A", electronic=EnergyValue(-100.0, "hartree")),),
                title="No warnings",
            ),
        )

        self.assertTrue(result.ok, result.error)
        workbook_xml, all_xml = _xlsx_xml(result.value[0].bytes or b"")  # type: ignore[index]
        self.assertIn('name="Energy Table"', workbook_xml)
        self.assertIn('name="Export Metadata"', workbook_xml)
        self.assertNotIn('name="Warnings"', workbook_xml)
        self.assertIn("energy_table_schema_version", all_xml)

    def test_png_writer_outputs_nonblank_image_and_preserves_missing_warnings(self) -> None:
        service = ReportExportService()
        result = service.export(
            PROJECT_ID,
            ExportRequest(formats=("png",), profile=_profile(missing=True), title="Route with missing point"),
        )

        self.assertTrue(result.ok, result.error)
        artifact = result.value[0]  # type: ignore[index]
        self.assertEqual(artifact.bytes[:8], PNG_SIGNATURE)  # type: ignore[index]
        self.assertEqual(artifact.metadata["profile_id"], "profile-main")
        self.assertIsInstance(artifact.metadata["warnings"], list)
        self.assertIn("missing_energy_point", artifact.metadata["warnings"])
        self.assertIn("missing_energy_point", [warning.code for warning in result.warnings])

        width, height = struct.unpack(">II", artifact.bytes[16:24])  # type: ignore[index]
        self.assertEqual((width, height), (900, 520))
        from PIL import Image

        image = Image.open(BytesIO(artifact.bytes or b""))
        colors = image.convert("RGB").getcolors(maxcolors=1_000_000)
        assert colors is not None
        self.assertGreater(len(colors), 1)

    def test_energy_diagram_route_includes_shared_layout_anchors(self) -> None:
        route = build_energy_diagram_route(_profile(missing=True))

        self.assertLess(route.min_energy, route.max_energy)
        self.assertEqual([state.x for state in route.states], sorted(state.x for state in route.states if state.x))
        self.assertIsNotNone(route.states[0].y)
        self.assertIsNotNone(route.states[0].line_start_x)
        self.assertIsNotNone(route.states[0].line_end_x)
        self.assertIsNotNone(route.states[0].value_x)
        self.assertIsNone(route.states[1].y)
        self.assertIsNone(route.states[1].line_start_x)
        self.assertIsNone(route.states[1].line_end_x)
        self.assertIsNone(route.states[1].value_x)
        self.assertIsNotNone(route.states[1].label_x)
        self.assertIn("missing_energy_point", [warning.code for warning in route.warnings])

    def test_energy_diagram_route_handles_same_energy_and_all_missing_profiles(self) -> None:
        same_route = build_energy_diagram_route(
            _profile_with_points(
                (
                    EnergyPoint("node-a", "A", relative_energy=EnergyValue(0.0, "kcal_mol")),
                    EnergyPoint("node-b", "B", relative_energy=EnergyValue(0.0, "kcal_mol")),
                )
            )
        )
        self.assertLess(same_route.min_energy, same_route.max_energy)
        self.assertTrue(all(state.y is not None for state in same_route.states))

        missing_profile = _profile_with_points(
            (
                EnergyPoint("node-a", "A", missing_reason="missing_energy"),
                EnergyPoint("node-b", "B", missing_reason="missing_energy"),
            )
        )
        missing_route = build_energy_diagram_route(missing_profile)
        self.assertEqual((missing_route.min_energy, missing_route.max_energy), (-1.0, 1.0))
        self.assertTrue(all(state.y is None for state in missing_route.states))

        service = ReportExportService()
        png = service.export(PROJECT_ID, ExportRequest(formats=("png",), profile=missing_profile))
        cdxml = service.export(PROJECT_ID, ExportRequest(formats=("cdxml",), profile=missing_profile))
        self.assertTrue(png.ok, png.error)
        self.assertTrue(cdxml.ok, cdxml.error)

    def test_cdxml_writer_outputs_editable_energy_diagram_objects(self) -> None:
        service = ReportExportService()
        result = service.export(PROJECT_ID, ExportRequest(formats=("cdxml",), profile=_profile()))

        self.assertTrue(result.ok, result.error)
        artifact = result.value[0]  # type: ignore[index]
        xml_text = (artifact.bytes or b"").decode("utf-8")
        self.assertIn("<CDXML", xml_text)
        self.assertIn("<page", xml_text)
        self.assertIn("<colortable", xml_text)
        self.assertIn("<fonttable", xml_text)
        self.assertIn("<arrow", xml_text)
        self.assertIn("A", xml_text)
        self.assertIn("TS", xml_text)
        self.assertIn("12.50", xml_text)
        self.assertIn("Relative energy", xml_text)

        root = ElementTree.fromstring(xml_text)
        self.assertEqual(root.tag, "CDXML")
        ids = [element.attrib["id"] for element in root.findall(".//*[@id]")]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(root.attrib["CreationProgram"], "RxnFlow")
        for attribute in ("LabelFont", "LabelSize", "CaptionFont", "CaptionSize", "LineWidth", "BoldWidth", "color", "bgcolor"):
            self.assertIn(attribute, root.attrib)
        page = root.find("page")
        self.assertIsNotNone(page)
        assert page is not None
        self.assertEqual(page.attrib["BoundingBox"], "0 0 720 420")
        self.assertIn("HeaderPosition", page.attrib)
        self.assertIn("FooterPosition", page.attrib)
        group = page.find("group")
        self.assertIsNotNone(group)
        assert group is not None
        self.assertEqual(group.attrib["Integral"], "yes")
        self.assertEqual(group.attrib["BoundingBox"], "0 0 720 420")
        self.assertIn("Z", group.attrib)
        for element in root.findall(".//*[@id]"):
            if element.tag in {"graphic", "arrow", "t", "group"}:
                self.assertIn("Z", element.attrib)
        text_nodes = root.findall(".//t")
        self.assertGreaterEqual(len(text_nodes), 1)
        for text_node in text_nodes:
            self.assertIn("p", text_node.attrib)
            self.assertIn("BoundingBox", text_node.attrib)
            self.assertEqual(text_node.attrib["CaptionJustification"], "Center")
            self.assertEqual(text_node.attrib["Justification"], "Center")
            self.assertEqual(text_node.attrib["LineHeight"], "auto")
            string_node = text_node.find("s")
            self.assertIsNotNone(string_node)
            assert string_node is not None
            for attribute in ("font", "size", "color", "face"):
                self.assertIn(attribute, string_node.attrib)
        for arrow in root.findall(".//arrow"):
            for attribute in ("Tail3D", "Head3D", "BoundingBox", "FillType", "LineWidth", "Z"):
                self.assertIn(attribute, arrow.attrib)
            self.assertEqual(arrow.attrib["FillType"], "None")
        state_lines = [
            node
            for node in root.findall(".//graphic")
            if node.attrib.get("GraphicType") == "Line" and node.attrib.get("LineWidth") == "2"
        ]
        self.assertGreaterEqual(len(state_lines), 1)
        for state_line in state_lines:
            self.assertIn("BoundingBox", state_line.attrib)
            self.assertIn("Z", state_line.attrib)
        self.assertGreaterEqual(len(root.findall(".//arrow")), 1)

        cdx_result = service.export(PROJECT_ID, ExportRequest(formats=("cdx",), profile=_profile()))
        self.assert_error(cdx_result, "invalid_input", "formats")

    def test_cdxml_missing_point_does_not_create_fake_state_line(self) -> None:
        service = ReportExportService()
        result = service.export(PROJECT_ID, ExportRequest(formats=("cdxml",), profile=_profile(missing=True)))

        self.assertTrue(result.ok, result.error)
        artifact = result.value[0]  # type: ignore[index]
        xml_text = (artifact.bytes or b"").decode("utf-8")
        root = ElementTree.fromstring(xml_text)
        state_lines = [
            node
            for node in root.findall(".//graphic")
            if node.attrib.get("GraphicType") == "Line" and node.attrib.get("LineWidth") == "2"
        ]
        self.assertEqual(len(state_lines), 2)
        for state_line in state_lines:
            coordinates = [float(value) for value in state_line.attrib["BoundingBox"].split()]
            self.assertAlmostEqual(coordinates[1], coordinates[3])
        self.assertIn("missing", xml_text)
        self.assertIn("missing_energy_point", artifact.metadata["warnings"])

    def test_writer_dependency_failures_return_export_failed_without_import_breakage(self) -> None:
        service = ReportExportService()
        self.assertIsNotNone(ReportExportService)

        with patch("builtins.__import__", side_effect=_blocked_import("PIL")):
            png_result = service.export(PROJECT_ID, ExportRequest(formats=("png",), profile=_profile()))
        self.assert_error(png_result, "export_failed", "dependency")

        with patch("builtins.__import__", side_effect=_blocked_import("xlsxwriter")):
            xlsx_result = service.export(
                PROJECT_ID,
                ExportRequest(formats=("xlsx",), objects=(_object("object-a", "A"),)),
            )
        self.assert_error(xlsx_result, "export_failed", "dependency")

    def test_export_scope_guard_and_existing_core_fixture_still_passes(self) -> None:
        result = run_core_fixture_vertical_slice()
        self.assertTrue(result.ok, result.error)

        source = Path("rxnflow/export.py").read_text(encoding="utf-8")
        self.assertNotIn("ProjectStore", source)
        self.assertNotIn(".rxnflow", source)
        self.assertNotIn("ParserRegistry", source)
        self.assertNotIn("ProjectStore.add_raw_file", source)
        self.assertNotIn("ImportRegistryWorkflow", source)
        self.assertNotIn("ChemicalRegistry", source)
        self.assertNotIn("GraphPatch", source)
        self.assertNotIn("EnergyProfileEngine", source)
        self.assertNotIn("fastapi", source.lower())
        self.assertNotIn("click", source.lower())
        self.assertNotIn("typer", source.lower())

    def assert_error(self, result: object, code: str, target: str) -> None:
        self.assertFalse(result.ok)  # type: ignore[attr-defined]
        self.assertIsNotNone(result.error)  # type: ignore[attr-defined]
        self.assertEqual(result.error.code, code)  # type: ignore[attr-defined]
        self.assertEqual(result.error.target, target)  # type: ignore[attr-defined]


def _profile(
    *,
    missing: bool = False,
    warnings: tuple[RxnFlowWarning, ...] = (),
) -> EnergyProfile:
    points = (
        EnergyPoint(
            "node-a",
            "A",
            absolute_energy=EnergyValue(-100.0, "hartree"),
            relative_energy=EnergyValue(0.0, "kcal_mol"),
        ),
        EnergyPoint(
            "node-ts",
            "TS",
            absolute_energy=None if missing else EnergyValue(-99.98, "hartree"),
            relative_energy=None if missing else EnergyValue(12.5, "kcal_mol"),
            missing_reason="missing_energy" if missing else None,
        ),
        EnergyPoint(
            "node-b",
            "B",
            absolute_energy=EnergyValue(-99.99, "hartree"),
            relative_energy=EnergyValue(6.25, "kcal_mol"),
        ),
    )
    return EnergyProfile(
        id="profile-main",
        graph_id="graph-main",
        path_id="path-main",
        options=EnergyOptions(output_unit="kcal_mol", include_corrections=False, energy_key="electronic"),
        points=points,
        warnings=warnings,
    )


def _profile_with_points(points: tuple[EnergyPoint, ...]) -> EnergyProfile:
    return EnergyProfile(
        id="profile-custom",
        graph_id="graph-main",
        path_id="path-main",
        options=EnergyOptions(output_unit="kcal_mol", include_corrections=False, energy_key="electronic"),
        points=points,
    )


def _expression_with_corrections(node_id: str, count: int) -> EnergyExpression:
    corrections = tuple(
        CorrectionComponent(
            object_id=f"object-{index}",
            correction_id=f"correction-{index}",
            kind="manual",
            coefficient=1.0,
            raw_energy=EnergyValue(0.1, "kcal_mol"),
            converted_energy=EnergyValue(0.1, "kcal_mol"),
            contribution=EnergyValue(0.1, "kcal_mol"),
        )
        for index in range(count)
    )
    return EnergyExpression(node_id=node_id, corrections=corrections, total=EnergyValue(12.5, "kcal_mol"))


def _object(
    object_id: str,
    label: str,
    *,
    electronic: EnergyValue | None = None,
    energies: dict[str, EnergyValue] | None = None,
    thermochemistry: dict[str, EnergyValue] | None = None,
) -> ChemicalObject:
    energy_values = dict(energies or {})
    if electronic is not None:
        energy_values["electronic"] = electronic
    return ChemicalObject(
        id=object_id,
        label=label,
        source_file_id="raw-a",
        energies=energy_values,
        thermochemistry=dict(thermochemistry or {}),
    )


def _graph() -> ReactionGraph:
    return ReactionGraph(
        id="graph-main",
        project_id=PROJECT_ID,
        nodes=(
            ReactionNode("node-a", "species", "A", ("object-a",)),
            ReactionNode("node-ts", "transition_state", "TS", ("object-ts",)),
            ReactionNode("node-b", "species", "B", ("object-b",)),
        ),
        paths=(ReactionPath("path-main", "main", ("node-a", "node-ts", "node-b")),),
    )


def _graph_with_projection() -> ReactionGraph:
    return ReactionGraph(
        id="graph-main",
        project_id=PROJECT_ID,
        nodes=(
            ReactionNode("node-a", "species", "A", ("object-a",), position=(120.0, 160.0)),
            ReactionNode("node-ts", "transition_state", "TS <A & B>", ("object-ts",), position=(300.0, 120.0)),
            ReactionNode("node-b", "species", "B", ("object-b",), position=(480.0, 180.0)),
        ),
        edges=(
            ReactionEdge("edge-a-ts", "node-a", "node-ts", "R & TS <A>"),
            ReactionEdge("edge-ts-b", "node-ts", "node-b", "TS > P"),
        ),
        paths=(ReactionPath("path-main", "Main <path>", ("node-a", "node-ts", "node-b")),),
    )


def _workspace(graph: ReactionGraph) -> WorkspaceSnapshot:
    return WorkspaceSnapshot(
        workspace_id="workspace-main",
        project_id=PROJECT_ID,
        graph=graph,
        palette=(),
        selection=WorkspaceSelection(
            node_ids=("node-ts",),
            edge_ids=("edge-a-ts",),
            path_ids=("path-main",),
        ),
        viewport=CanvasViewport(24.0, 12.0, 1.25),
        active_path_id="path-main",
        preview=NetworkPreview(
            graph_id=graph.id,
            active_path_id="path-main",
            nodes=graph.nodes,
            edges=graph.edges,
            paths=graph.paths,
        ),
    )


def _svg_element_by_class(root: ElementTree.Element, class_name: str) -> ElementTree.Element | None:
    for element in root.iter():
        if class_name in element.attrib.get("class", "").split():
            return element
    return None


def _svg_element_by_attr(root: ElementTree.Element, key: str, value: str) -> ElementTree.Element | None:
    for element in root.iter():
        if element.attrib.get(key) == value:
            return element
    return None


def _xml_text_values(root: ElementTree.Element) -> list[str]:
    return [element.text for element in root.iter() if element.text]


def _xlsx_xml(workbook: bytes) -> tuple[str, str]:
    with ZipFile(BytesIO(workbook)) as archive:
        workbook_xml = archive.read("xl/workbook.xml").decode("utf-8")
        xml_parts = []
        for name in archive.namelist():
            if name.endswith(".xml"):
                xml_parts.append(archive.read(name).decode("utf-8"))
    return workbook_xml, "\n".join(xml_parts)


def _xlsx_sheet_xml(workbook: bytes, sheet_name: str) -> str:
    with ZipFile(BytesIO(workbook)) as archive:
        return archive.read(f"xl/worksheets/{sheet_name}").decode("utf-8")


def _blocked_import(prefix: str) -> object:
    real_import = builtins.__import__

    def import_hook(name: str, *args: object, **kwargs: object) -> object:
        if name == prefix or name.startswith(f"{prefix}."):
            raise ImportError(f"No module named {prefix}", name=prefix)
        return real_import(name, *args, **kwargs)

    return import_hook


if __name__ == "__main__":
    unittest.main()
