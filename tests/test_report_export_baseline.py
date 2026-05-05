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
        self.assertEqual(ENERGY_TABLE_COLUMNS[0].key, "structure_name")
        self.assertEqual(ENERGY_TABLE_COLUMNS[0].label, "Structure")

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

        workbook_xml, all_xml = _xlsx_xml(artifact.bytes or b"")
        self.assertIn('name="Energy Table"', workbook_xml)
        self.assertIn('name="Energy Profile"', workbook_xml)
        self.assertIn('name="Warnings"', workbook_xml)
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
        ):
            self.assertIn(expected, all_xml)

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
        self.assertIsNotNone(root.find("page"))
        self.assertGreaterEqual(len(root.findall(".//arrow")), 1)

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


def _blocked_import(prefix: str) -> object:
    real_import = builtins.__import__

    def import_hook(name: str, *args: object, **kwargs: object) -> object:
        if name == prefix or name.startswith(f"{prefix}."):
            raise ImportError(f"No module named {prefix}", name=prefix)
        return real_import(name, *args, **kwargs)

    return import_hook


if __name__ == "__main__":
    unittest.main()
