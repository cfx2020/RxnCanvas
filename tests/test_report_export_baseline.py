from __future__ import annotations

from io import BytesIO
import builtins
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
    normalize_energy_table_header,
)
from rxnflow.models import (
    ChemicalObject,
    EnergyOptions,
    EnergyPoint,
    EnergyProfile,
    EnergyValue,
    ReactionGraph,
    ReactionNode,
    ReactionPath,
)


PROJECT_ID = "project-a"


class ReportExportBaselineTest(unittest.TestCase):
    def test_export_contracts_and_input_validation(self) -> None:
        self.assertEqual(ALLOWED_EXPORT_FORMATS, frozenset(("png", "cdxml", "xlsx")))
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
        for export_format in ("cdx", "csv"):
            self.assert_error(
                service.export(PROJECT_ID, ExportRequest(formats=(export_format,), profile=_profile())),
                "invalid_input",
                "formats",
            )

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
