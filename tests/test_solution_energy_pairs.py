from __future__ import annotations

from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile
import unittest

from rxnflow.energy import EnergyProfileEngine
from rxnflow.export import ExportRequest, ReportExportService, build_energy_table_rows
from rxnflow.models import ChemicalObject, EnergyOptions, ReactionGraph, ReactionNode, ReactionPath
from rxnflow.parsers.cclib_adapter import GaussianLogPlugin
from rxnflow.parsers.contracts import RawFile
from rxnflow.solution_pairs import solution_pair_key, with_paired_solution_free_energies


PROJECT_ID = "project-ir"


class SolutionEnergyPairTest(unittest.TestCase):
    def test_gaussian_fallback_extracts_gas_and_solution_channels(self) -> None:
        gas = _parse_gaussian("sample.log", _gaussian_text(-100.0, -99.9))
        sol = _parse_gaussian("sample-sol.log", _gaussian_text(-100.2, None))

        self.assertEqual(sorted(gas.energies), ["egas", "electronic"])
        self.assertEqual(sorted(gas.thermochemistry), ["ggas", "ggas_1m"])
        self.assertEqual(sorted(sol.energies), ["electronic", "esol"])
        self.assertEqual(sol.thermochemistry, {})
        self.assertEqual(gas.charge, 0)
        self.assertEqual(gas.spin_multiplicity, 1)
        self.assertEqual(gas.method, "B3LYP")
        self.assertEqual(len(gas.geometry), 2)

    def test_solution_pair_derives_gsol_for_energy_switching(self) -> None:
        gas = _chemical("object-sample", _parse_gaussian("sample.log", _gaussian_text(-100.0, -99.9)))
        sol = _chemical("object-sample-sol", _parse_gaussian("sample-sol.log", _gaussian_text(-100.2, None)))

        merged = with_paired_solution_free_energies((gas, sol))

        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0].label, "sample")
        self.assertEqual(sorted(merged[0].energies), ["egas", "electronic", "esol"])
        self.assertEqual(sorted(merged[0].thermochemistry), ["ggas", "ggas_1m", "gsol"])
        expected = (-99.9 + 0.003019 - (-100.0) + (-100.2)) * 627.5094740631
        self.assertAlmostEqual(merged[0].thermochemistry["gsol"].value, expected, places=4)
        self.assertEqual(merged[0].thermochemistry["gsol"].unit, "kcal_mol")

    def test_energy_engine_can_switch_between_egas_ggas_and_gsol(self) -> None:
        sample = _chemical("object-sample", _parse_gaussian("sample.log", _gaussian_text(-100.0, -99.9)))
        sample_sol = _chemical("object-sample-sol", _parse_gaussian("sample-sol.log", _gaussian_text(-100.2, None)))
        product = _chemical("object-product", _parse_gaussian("product.log", _gaussian_text(-99.95, -99.8)))
        product_sol = _chemical("object-product-sol", _parse_gaussian("product-sol.log", _gaussian_text(-100.1, None)))
        objects = with_paired_solution_free_energies((sample, sample_sol, product, product_sol))
        graph = ReactionGraph(
            "graph-ir",
            PROJECT_ID,
            nodes=(
                ReactionNode("node-sample", "species", "sample", ("object-sample",)),
                ReactionNode("node-product", "species", "product", ("object-product",)),
            ),
            paths=(ReactionPath("path-main", "main", ("node-sample", "node-product")),),
        )
        engine = EnergyProfileEngine()

        egas = engine.compute_profile(PROJECT_ID, graph, "path-main", objects, _options("egas", "energies"))
        ggas = engine.compute_profile(PROJECT_ID, graph, "path-main", objects, _options("ggas", "thermochemistry"))
        gsol = engine.compute_profile(PROJECT_ID, graph, "path-main", objects, _options("gsol", "thermochemistry"))

        self.assertTrue(egas.ok, egas.error)
        self.assertTrue(ggas.ok, ggas.error)
        self.assertTrue(gsol.ok, gsol.error)
        self.assertAlmostEqual(egas.value.points[1].relative_energy.value, 31.375473703155)  # type: ignore[union-attr]
        self.assertAlmostEqual(ggas.value.points[1].relative_energy.value, 62.75094740631)  # type: ignore[union-attr]
        self.assertAlmostEqual(gsol.value.points[1].relative_energy.value, 94.126421109465)  # type: ignore[union-attr]

    def test_energy_table_and_export_merge_solution_pair_rows(self) -> None:
        gas = _chemical("object-sample", _parse_gaussian("sample.log", _gaussian_text(-100.0, -99.9)))
        sol = _chemical("object-sample-sol", _parse_gaussian("sample-sol.log", _gaussian_text(-100.2, None)))

        rows = build_energy_table_rows(objects=(gas, sol))

        self.assertEqual([row.structure_name for row in rows], ["sample"])
        self.assertIn("egas_hartree", rows[0].values)
        self.assertIn("esol_hartree", rows[0].values)
        self.assertIn("gsol_kcal_mol", rows[0].values)

        result = ReportExportService().export(
            PROJECT_ID,
            ExportRequest(formats=("csv", "xlsx"), objects=(gas, sol), title="Ir template export"),
        )

        self.assertTrue(result.ok, result.error)
        self.assertEqual([artifact.format for artifact in result.value], ["csv", "xlsx"])  # type: ignore[union-attr]
        for artifact in result.value:  # type: ignore[union-attr]
            self.assertEqual(artifact.metadata["energy_table_row_count"], 1)
        workbook_xml, all_xml = _xlsx_xml(result.value[1].bytes or b"")  # type: ignore[union-attr]
        self.assertIn('name="Shermo_New"', workbook_xml)
        self.assertIn("Gsol", all_xml)
        self.assertIn("H2-C2+N2", all_xml)
        self.assertIn("Gsol uses Ggas+1M - Egas + Esol", all_xml)

    def test_ir_fixture_logs_match_workbook_channels_without_shermo(self) -> None:
        ir_dir = Path("Ir")
        workbook_path = ir_dir / "20260331-Ir-test.xlsx"
        if not ir_dir.is_dir() or not workbook_path.is_file():
            self.skipTest("Ir fixture corpus is not present in this checkout.")

        objects = tuple(_chemical_from_gaussian_path(path) for path in sorted(ir_dir.glob("*.log")))
        paired = with_paired_solution_free_energies(objects)
        rows = {row.structure_name: row for row in build_energy_table_rows(objects=objects)}
        workbook_rows = _ir_workbook_shermo_new_rows(workbook_path)

        self.assertEqual(len(objects), 16)
        self.assertEqual(len(paired), 8)
        self.assertEqual(set(rows), set(workbook_rows))

        for name, workbook_row in workbook_rows.items():
            with self.subTest(structure=name):
                row = rows[name]
                self.assertAlmostEqual(row.values["egas_hartree"], workbook_row["egas_hartree"], places=6)
                self.assertAlmostEqual(row.values["ggas_hartree"], workbook_row["ggas_hartree"], places=6)
                self.assertAlmostEqual(row.values["ggas_1m_hartree"], workbook_row["ggas_1m_hartree"], places=6)
                self.assertAlmostEqual(row.values["esol_hartree"], workbook_row["esol_hartree"], places=6)
                self.assertAlmostEqual(
                    row.values["gsol_kcal_mol"],
                    workbook_row["gsol_1m_kcal_mol"],
                    delta=0.2,
                )


def _parse_gaussian(name: str, content: str):
    def missing_cclib(_: RawFile):
        raise ModuleNotFoundError("cclib")

    result = GaussianLogPlugin(backend=missing_cclib).parse(
        RawFile(id=name, name=name, content=content),
    )
    assert result.ok, result.error
    assert result.value is not None
    return result.value.objects[0]


def _chemical_from_gaussian_path(path: Path) -> ChemicalObject:
    result = GaussianLogPlugin().parse(RawFile(id=path.name, name=path.name, path=path))
    assert result.ok, result.error
    assert result.value is not None
    draft = result.value.objects[0]
    key = solution_pair_key(ChemicalObject(id=path.stem, label=path.name)) or path.stem
    suffix = "-sol" if key != path.stem else ""
    return ChemicalObject(
        id=f"object-{key}{suffix}",
        label=draft.label,
        charge=draft.charge,
        spin_multiplicity=draft.spin_multiplicity,
        method=draft.method,
        geometry=draft.geometry,
        energies=draft.energies,
        thermochemistry=draft.thermochemistry,
        source_file_id=path.name,
    )


def _chemical(object_id: str, draft) -> ChemicalObject:
    return ChemicalObject(
        id=object_id,
        label=draft.label,
        charge=draft.charge,
        spin_multiplicity=draft.spin_multiplicity,
        method=draft.method,
        geometry=draft.geometry,
        energies=draft.energies,
        thermochemistry=draft.thermochemistry,
        source_file_id=f"{object_id}.log",
    )


def _ir_workbook_shermo_new_rows(workbook_path: Path) -> dict[str, dict[str, float]]:
    rows = _xlsx_sheet_rows(workbook_path, "Shermo_New")
    result: dict[str, dict[str, float]] = {}
    for row in rows[1:9]:
        name_value = row[0]
        if name_value is None:
            continue
        name = str(name_value)
        if not name:
            continue
        result[name] = {
            "egas_hartree": float(row[1]),
            "egas_kcal_mol": float(row[2]),
            "ggas_hartree": float(row[4]),
            "ggas_1m_hartree": float(row[6]),
            "ggas_1m_kcal_mol": float(row[7]),
            "esol_hartree": float(row[12]),
            "esol_kcal_mol": float(row[13]),
        }
        result[name]["gsol_1m_kcal_mol"] = (
            result[name]["ggas_1m_kcal_mol"]
            - result[name]["egas_kcal_mol"]
            + result[name]["esol_kcal_mol"]
        )
    return result


def _xlsx_sheet_rows(workbook_path: Path, sheet_name: str) -> list[list[object | None]]:
    with ZipFile(workbook_path) as archive:
        shared_strings = _xlsx_shared_strings(archive)
        sheet_path = _xlsx_sheet_path(archive, sheet_name)
        root = ElementTree.fromstring(archive.read(sheet_path))
        rows: list[list[object | None]] = []
        for row_node in root.findall(".//main:sheetData/main:row", _XLSX_NS):
            values: dict[int, object | None] = {}
            max_column = 0
            for cell in row_node.findall("main:c", _XLSX_NS):
                reference = cell.attrib.get("r", "")
                column = _xlsx_column_index(reference)
                max_column = max(max_column, column)
                values[column] = _xlsx_cell_value(cell, shared_strings)
            rows.append([values.get(column) for column in range(1, max_column + 1)])
    return rows


def _xlsx_xml(workbook: bytes) -> tuple[str, str]:
    with ZipFile(BytesIO(workbook)) as archive:
        workbook_xml = archive.read("xl/workbook.xml").decode("utf-8")
        xml_parts = []
        for name in archive.namelist():
            if name.endswith(".xml"):
                xml_parts.append(archive.read(name).decode("utf-8"))
    return workbook_xml, "\n".join(xml_parts)


_XLSX_NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "officeRel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def _xlsx_shared_strings(archive: ZipFile) -> list[str]:
    try:
        root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    strings: list[str] = []
    for item in root.findall("main:si", _XLSX_NS):
        strings.append("".join(text.text or "" for text in item.findall(".//main:t", _XLSX_NS)))
    return strings


def _xlsx_sheet_path(archive: ZipFile, sheet_name: str) -> str:
    workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    rels = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_target_by_id = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("rel:Relationship", _XLSX_NS)
    }
    for sheet in workbook.findall(".//main:sheets/main:sheet", _XLSX_NS):
        if sheet.attrib.get("name") != sheet_name:
            continue
        rel_id = sheet.attrib[f"{{{_XLSX_NS['officeRel']}}}id"]
        target = rel_target_by_id[rel_id]
        return target.lstrip("/") if target.startswith("xl/") else f"xl/{target.lstrip('/')}"
    raise AssertionError(f"Worksheet not found: {sheet_name}")


def _xlsx_cell_value(cell: ElementTree.Element, shared_strings: list[str]) -> object | None:
    value_node = cell.find("main:v", _XLSX_NS)
    if value_node is None or value_node.text is None:
        return None
    raw = value_node.text
    if cell.attrib.get("t") == "s":
        return shared_strings[int(raw)]
    try:
        number = float(raw)
    except ValueError:
        return raw
    return int(number) if number.is_integer() else number


def _xlsx_column_index(reference: str) -> int:
    letters = "".join(character for character in reference if character.isalpha())
    index = 0
    for character in letters:
        index = index * 26 + ord(character.upper()) - ord("A") + 1
    return index


def _options(key: str, source: str) -> EnergyOptions:
    return EnergyOptions(
        output_unit="kcal_mol",
        include_corrections=False,
        energy_key=key,
        energy_source=source,  # type: ignore[arg-type]
    )


def _gaussian_text(scf: float, ggas: float | None) -> str:
    free_energy_line = (
        f" Sum of electronic and thermal Free Energies=        {ggas:.6f}\n"
        if ggas is not None
        else ""
    )
    return f""" Entering Gaussian System, Link 0=g16
 #p B3LYP/6-31G(d) SP

 Charge =  0 Multiplicity = 1
 Standard orientation:
 ---------------------------------------------------------------------
 Center     Atomic      Atomic             Coordinates (Angstroms)
 Number     Number       Type             X           Y           Z
 ---------------------------------------------------------------------
      1          6           0        0.000000    0.000000    0.000000
      2          1           0        0.000000    0.000000    1.090000
 ---------------------------------------------------------------------
 SCF Done:  E(RB3LYP) =  {scf:.10f}     A.U. after    1 cycles
{free_energy_line} Normal termination of Gaussian 16
"""


if __name__ == "__main__":
    unittest.main()
