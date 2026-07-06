from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from rxnflow import demo_flow, export_flow_json
from rxnflow.engine import EV_TO_HARTREE, parse_source_file, parse_source_preview, validate_project_content
from rxnflow.engine_ipc import ENGINE_VERSION, handle_request


def fake_cclib_module(data: SimpleNamespace, parser_name: str = "Gaussian") -> SimpleNamespace:
    parser_type = type(parser_name, (), {"parse": lambda self: data})
    return SimpleNamespace(io=SimpleNamespace(ccopen=lambda _path, quiet=True: parser_type()))


class EngineSmokeTest(unittest.TestCase):
    def test_demo_flow_exports_to_json(self) -> None:
        flow = demo_flow()
        payload = json.loads(export_flow_json(flow))

        self.assertEqual(payload["id"], "demo-diels-alder")
        self.assertGreaterEqual(len(payload["nodes"]), 3)
        self.assertEqual(payload["nodes"][2]["kind"], "transition")
        self.assertEqual(payload["nodes"][2]["energy"]["unit"], "kcal/mol")

    def test_engine_ipc_status_and_demo_flow(self) -> None:
        status = handle_request({"command": "engine.status"})
        self.assertTrue(status["ok"])
        self.assertEqual(status["data"]["status"], "ready")
        self.assertEqual(status["data"]["engineVersion"], ENGINE_VERSION)
        self.assertIn(status["data"]["runtime"], {"python", "bundled-python"})
        self.assertIn("cclib", status["data"]["dependencies"])
        self.assertIn("available", status["data"]["dependencies"]["cclib"])
        self.assertIn("flow.demo", status["data"]["capabilities"])
        self.assertIn("import.preview", status["data"]["capabilities"])
        self.assertIn("import.register_all", status["data"]["capabilities"])
        self.assertIn("import.register_selection", status["data"]["capabilities"])
        self.assertIn("project.validate", status["data"]["capabilities"])
        self.assertIn("project.open", status["data"]["capabilities"])
        self.assertIn("project.save", status["data"]["capabilities"])

        demo = handle_request({"command": "flow.demo"})
        self.assertTrue(demo["ok"])
        self.assertEqual(demo["data"]["flow"]["id"], "demo-diels-alder")
        self.assertIn('"title": "Diels-Alder Study"', demo["data"]["json"])

        missing = handle_request({"command": "missing"})
        self.assertFalse(missing["ok"])
        self.assertEqual(missing["error"]["code"], "unknown_command")

    def test_engine_import_preview_parses_calculation_sources(self) -> None:
        gaussian = parse_source_preview(
            "ts-endo.log",
            "\n".join([
                "Stoichiometry C10H12",
                "SCF Done: E(RwB97XD) = -232.487921 A.U.",
                "Thermal correction to Gibbs Free Energy = 0.209114",
            ]),
        )

        self.assertTrue(gaussian.parsed)
        self.assertEqual(gaussian.sourceKind, "Gaussian")
        self.assertEqual(gaussian.formula, "C10H12")
        self.assertEqual(gaussian.kind, "intermediate")
        self.assertEqual(gaussian.candidates[0].roleHint, "unknown")
        self.assertEqual(gaussian.energyUnit, "hartree")
        self.assertEqual(gaussian.parserId, "gaussian-log-text-preview")
        self.assertEqual(gaussian.parseScope, "preview")
        self.assertEqual(gaussian.confidence, "low")
        self.assertEqual(gaussian.objectCount, 1)
        self.assertEqual(gaussian.candidates[0].formula, "C10H12")
        self.assertAlmostEqual(gaussian.energyGas or 0, -232.487921)
        self.assertAlmostEqual(gaussian.energySolution or 0, -232.278807)
        self.assertAlmostEqual(gaussian.energyTable.egasHartree if gaussian.energyTable else 0, -232.487921)
        self.assertAlmostEqual(gaussian.energyTable.ggas1mHartree if gaussian.energyTable else 0, -232.275788)

        gaussian_ts = parse_source_preview(
            "generic.log",
            "\n".join([
                "#p wb97xd/genecp opt=(ts,calcfc) freq",
                "Stoichiometry C10H12",
                "SCF Done: E(RwB97XD) = -232.487921 A.U.",
            ]),
        )
        self.assertEqual(gaussian_ts.kind, "transition")
        self.assertEqual(gaussian_ts.candidates[0].roleHint, "transition")

        orca = parse_source_preview(
            "adduct.out",
            "\n".join([
                "FINAL SINGLE POINT ENERGY     -231.884002",
                "CPCM SOLVATION ENERGY = -0.010241",
            ]),
        )
        self.assertEqual(orca.sourceKind, "ORCA")
        self.assertEqual(orca.kind, "product")
        self.assertAlmostEqual(orca.energySolution or 0, -231.894243)

        orca_ts = parse_source_preview(
            "generic.out",
            "\n".join([
                "! wB97X-D3 def2-TZVP OptTS Freq",
                "FINAL SINGLE POINT ENERGY     -231.884002",
            ]),
        )
        self.assertEqual(orca_ts.kind, "transition")
        self.assertEqual(orca_ts.candidates[0].roleHint, "transition")

        xyz = parse_source_preview(
            "water.xyz",
            "\n".join([
                "3",
                "energy=-76.431",
                "O 0.0 0.0 0.0",
                "H 0.0 0.0 1.0",
                "H 1.0 0.0 0.0",
            ]),
        )
        self.assertEqual(xyz.sourceKind, "XYZ")
        self.assertEqual(xyz.formula, "H2O")
        self.assertEqual(xyz.objectCount, 1)
        self.assertEqual(xyz.coordinatePreview.atomCount if xyz.coordinatePreview else 0, 3)
        self.assertAlmostEqual(xyz.energyGas or 0, -76.431)

    def test_engine_import_preview_reads_full_source_path_for_late_energy(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "late-gaussian.log"
            source_path.write_text(
                ("Preview filler without final energy.\n" * 4096)
                + "\n".join([
                    "Stoichiometry H2O",
                    "NBasis=    42 RedAO= T",
                    "SCF Done: E(RB3LYP) = -75.0 A.U.",
                    "SCF Done: E(RB3LYP) = -76.431 A.U.",
                    "Sum of electronic and thermal Free Energies= -76.400000",
                ]),
                encoding="utf8",
            )

            response = handle_request({
                "command": "import.preview",
                "files": [{
                    "name": "late-gaussian.log",
                    "size": source_path.stat().st_size,
                    "preview": "No final energy in this preview.",
                    "sourcePath": str(source_path),
                }],
            })

        self.assertTrue(response["ok"])
        parse = response["data"]["files"][0]["parse"]
        self.assertTrue(parse["parsed"])
        self.assertEqual(parse["parseScope"], "full-file")
        self.assertEqual(parse["confidence"], "high")
        self.assertEqual(parse["parserId"], "gaussian-log-text-full-file")
        self.assertAlmostEqual(parse["energyGas"], -76.431)
        self.assertEqual(parse["energyTable"]["gasBasisFunctions"], 42)
        self.assertAlmostEqual(parse["energyTable"]["ggasHartree"], -76.4)
        self.assertAlmostEqual(parse["energyTable"]["ggas1mHartree"], -76.396981)

    def test_engine_import_preview_does_not_mark_intermediate_gaussian_normal_as_final(self) -> None:
        parsed = parse_source_preview(
            "opt-freq.log",
            "\n".join([
                "Entering Gaussian System",
                "Stoichiometry H2O",
                "SCF Done: E(RB3LYP) = -76.431 A.U.",
                "Normal termination of Gaussian 16 at Tue Jun 23 10:00:00 2026.",
                "Link1:",
                "#p rb3lyp/6-31g(d) freq",
                "Charge = 0 Multiplicity = 1",
                "SCF Done: E(RB3LYP) = -76.432 A.U.",
            ]),
        )

        self.assertTrue(parsed.parsed)
        self.assertEqual(parsed.terminationStatus, "running")
        self.assertEqual(parsed.terminationLabel, "running")

    def test_engine_import_preview_extracts_gaussian_vibration_modes(self) -> None:
        parsed = parse_source_preview(
            "ts-vibration.log",
            "\n".join([
                "Stoichiometry H2O",
                "                          Standard orientation:",
                " ---------------------------------------------------------------------",
                " Center     Atomic      Atomic             Coordinates (Angstroms)",
                " Number     Number       Type             X           Y           Z",
                " ---------------------------------------------------------------------",
                "      1          8           0        0.000000    0.000000    0.000000",
                "      2          1           0        0.000000    0.000000    0.960000",
                "      3          1           0        0.920000    0.000000   -0.240000",
                " ---------------------------------------------------------------------",
                " SCF Done:  E(RB3LYP) =  -76.431000     A.U.",
                " Frequencies --   -423.1200    1580.5000    3650.1000",
                " Red. masses --      1.2345       1.1111       1.2222",
                " Frc consts  --      0.1234       0.2222       0.3333",
                " IR Inten    --     12.3000       2.0000       3.0000",
                " Atom  AN      X      Y      Z        X      Y      Z        X      Y      Z",
                "   1   8     0.010  0.000  0.000    0.000  0.020  0.000    0.000  0.000  0.030",
                "   2   1    -0.010  0.000  0.000    0.000 -0.020  0.000    0.000  0.000 -0.030",
                "   3   1     0.000  0.010  0.000    0.000  0.000  0.020    0.030  0.000  0.000",
            ]),
        )

        modes = parsed.coordinatePreview.vibrationModes if parsed.coordinatePreview else ()
        self.assertEqual(len(modes), 3)
        self.assertEqual(modes[0].kind, "imaginary")
        self.assertEqual(modes[0].source, "rxnflow-text")
        self.assertAlmostEqual(modes[0].frequencyCm1, -423.12)
        self.assertEqual(len(modes[0].displacements), 3)
        self.assertEqual(modes[0].displacements[0].atomIndex, 0)

    def test_engine_import_preview_uses_cclib_standard_fields(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "cclib-gaussian.log"
            source_path.write_text(
                "\n".join([
                    "Entering Gaussian System",
                    "Stoichiometry H2O",
                    "NBasis=    7 RedAO= T",
                    "Charge = 0 Multiplicity = 1",
                    "SCF Done: E(RB3LYP) = -76.431000 A.U.",
                    "Sum of electronic and thermal Free Energies= -76.400000",
                ]),
                encoding="utf8",
            )
            fake_data = SimpleNamespace(
                atomnos=[8, 1, 1],
                atomcoords=[[
                    [0.0, 0.0, 0.0],
                    [0.0, 0.0, 0.96],
                    [0.92, 0.0, -0.24],
                ]],
                scfenergies=[-76.5 / EV_TO_HARTREE],
                freeenergy=-76.39,
                vibfreqs=[-123.4],
                vibdisps=[[
                    [0.01, 0.0, 0.0],
                    [-0.01, 0.0, 0.0],
                    [0.0, 0.01, 0.0],
                ]],
                vibirs=[5.0],
                charge=0,
                mult=1,
                nbasis=7,
                metadata={"methods": ["B3LYP"]},
            )
            fake_cclib = fake_cclib_module(fake_data)
            sentinel = object()
            previous = sys.modules.get("cclib", sentinel)
            sys.modules["cclib"] = fake_cclib
            try:
                parsed = parse_source_file("cclib-gaussian.log", "", str(source_path))
            finally:
                if previous is sentinel:
                    sys.modules.pop("cclib", None)
                else:
                    sys.modules["cclib"] = previous

        self.assertTrue(parsed.parsed)
        self.assertEqual(parsed.parserId, "gaussian-log-cclib+rxnflow-text-full-file")
        self.assertEqual(parsed.sourceKind, "Gaussian")
        self.assertEqual(parsed.kind, "transition")
        self.assertEqual(parsed.candidates[0].roleHint, "transition")
        self.assertEqual(parsed.formula, "H2O")
        self.assertEqual(parsed.candidates[0].charge, 0)
        self.assertEqual(parsed.candidates[0].spinMultiplicity, 1)
        self.assertEqual(parsed.coordinatePreview.atomCount if parsed.coordinatePreview else 0, 3)
        self.assertEqual(len(parsed.coordinatePreview.vibrationModes if parsed.coordinatePreview else ()), 1)
        self.assertEqual(parsed.coordinatePreview.vibrationModes[0].source if parsed.coordinatePreview else "", "cclib")
        self.assertAlmostEqual(parsed.energyTable.egasHartree if parsed.energyTable else 0, -76.5)
        self.assertAlmostEqual(parsed.energyTable.ggasHartree if parsed.energyTable else 0, -76.39)

    def test_cclib_full_file_uses_gaussian_route_for_method_basis_label(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "generic-dft.log"
            source_path.write_text(
                "\n".join([
                    "Entering Gaussian System",
                    "#p wb97xd/genecp opt freq scrf=(smd,solvent=water)",
                    "Stoichiometry H2O",
                    "NBasis=    3957 RedAO= T",
                    "Charge = 0 Multiplicity = 1",
                    "SCF Done: E(RwB97XD) = -76.431000 A.U.",
                ]),
                encoding="utf8",
            )
            fake_data = SimpleNamespace(
                atomnos=[8, 1, 1],
                atomcoords=[[
                    [0.0, 0.0, 0.0],
                    [0.0, 0.0, 0.96],
                    [0.92, 0.0, -0.24],
                ]],
                scfenergies=[-76.5 / EV_TO_HARTREE],
                charge=0,
                mult=1,
                nbasis=3957,
                metadata={"methods": ["DFT", "DFT", "DFT"]},
            )
            fake_cclib = fake_cclib_module(fake_data)
            sentinel = object()
            previous = sys.modules.get("cclib", sentinel)
            sys.modules["cclib"] = fake_cclib
            try:
                parsed = parse_source_file("generic-dft.log", "", str(source_path))
            finally:
                if previous is sentinel:
                    sys.modules.pop("cclib", None)
                else:
                    sys.modules["cclib"] = previous

        self.assertTrue(parsed.parsed)
        self.assertEqual(parsed.method, "wb97xd/genecp")
        self.assertEqual(parsed.candidates[0].method, "wb97xd/genecp")
        self.assertEqual(parsed.energyTable.gasBasisFunctions if parsed.energyTable else None, 3957)

    def test_engine_import_preview_does_not_fill_cclib_standard_fields_from_text(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "cclib-missing-energy.log"
            source_path.write_text(
                "\n".join([
                    "Entering Gaussian System",
                    "Stoichiometry H2O",
                    "NBasis=    7 RedAO= T",
                    "SCF Done: E(RB3LYP) = -76.431000 A.U.",
                    "Sum of electronic and thermal Free Energies= -76.400000",
                ]),
                encoding="utf8",
            )
            fake_data = SimpleNamespace(
                atomnos=[8, 1, 1],
                atomcoords=[[
                    [0.0, 0.0, 0.0],
                    [0.0, 0.0, 0.96],
                    [0.92, 0.0, -0.24],
                ]],
                charge=0,
                mult=1,
                metadata={"methods": ["B3LYP"]},
            )
            fake_cclib = fake_cclib_module(fake_data)
            sentinel = object()
            previous = sys.modules.get("cclib", sentinel)
            sys.modules["cclib"] = fake_cclib
            try:
                parsed = parse_source_file("cclib-missing-energy.log", "", str(source_path))
            finally:
                if previous is sentinel:
                    sys.modules.pop("cclib", None)
                else:
                    sys.modules["cclib"] = previous

        self.assertTrue(parsed.parsed)
        self.assertEqual(parsed.sourceKind, "Gaussian")
        self.assertIsNone(parsed.energyGas)
        self.assertIsNone(parsed.energySolution)
        self.assertIsNone(parsed.energyTable)
        self.assertIsNone(parsed.candidates[0].energyGas)
        self.assertIsNone(parsed.candidates[0].energySolution)

    def test_engine_import_preview_does_not_fill_cclib_coordinates_from_text(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "cclib-missing-coordinates.log"
            source_path.write_text(
                "\n".join([
                    "Entering Gaussian System",
                    "Stoichiometry H2O",
                    "Standard orientation:",
                    " ---------------------------------------------------------------------",
                    " Center     Atomic      Atomic             Coordinates (Angstroms)",
                    " Number     Number       Type             X           Y           Z",
                    " ---------------------------------------------------------------------",
                    "      1          8           0        0.000000    0.000000    0.000000",
                    "      2          1           0        0.000000    0.000000    0.960000",
                    "      3          1           0        0.920000    0.000000   -0.240000",
                    " ---------------------------------------------------------------------",
                    "SCF Done: E(RB3LYP) = -76.431000 A.U.",
                    "Sum of electronic and thermal Free Energies= -76.400000",
                ]),
                encoding="utf8",
            )
            fake_data = SimpleNamespace(
                scfenergies=[-76.5 / EV_TO_HARTREE],
                freeenergy=-76.39,
                nbasis=7,
                metadata={"methods": ["B3LYP"]},
            )
            fake_cclib = fake_cclib_module(fake_data)
            sentinel = object()
            previous = sys.modules.get("cclib", sentinel)
            sys.modules["cclib"] = fake_cclib
            try:
                parsed = parse_source_file("cclib-missing-coordinates.log", "", str(source_path))
            finally:
                if previous is sentinel:
                    sys.modules.pop("cclib", None)
                else:
                    sys.modules["cclib"] = previous

        self.assertTrue(parsed.parsed)
        self.assertEqual(parsed.sourceKind, "Gaussian")
        self.assertIsNone(parsed.coordinatePreview)
        self.assertIsNone(parsed.candidates[0].coordinatePreview)
        self.assertAlmostEqual(parsed.energyGas or 0, -76.5)

    def test_engine_import_preview_does_not_use_text_source_kind_when_cclib_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "failed-gaussian.log"
            source_path.write_text(
                "\n".join([
                    "Entering Gaussian System",
                    "SCF Done: E(RB3LYP) = -76.431000 A.U.",
                ]),
                encoding="utf8",
            )
            fake_cclib = SimpleNamespace(io=SimpleNamespace(ccopen=lambda _path, quiet=True: None))
            sentinel = object()
            previous = sys.modules.get("cclib", sentinel)
            sys.modules["cclib"] = fake_cclib
            try:
                parsed = parse_source_file("failed-gaussian.log", "", str(source_path))
            finally:
                if previous is sentinel:
                    sys.modules.pop("cclib", None)
                else:
                    sys.modules["cclib"] = previous

        self.assertFalse(parsed.parsed)
        self.assertEqual(parsed.sourceKind, "Computational")
        self.assertEqual(parsed.parserId, "computational-output-cclib-full-file")
        self.assertIsNone(parsed.energyGas)
        self.assertIsNone(parsed.energySolution)
        self.assertIsNone(parsed.energyTable)
        self.assertEqual([warning.code for warning in parsed.warnings], ["cclib_parse_empty"])

    def test_engine_import_preview_converts_explicit_xyz_energy_units(self) -> None:
        ev_xyz = parse_source_preview(
            "h2.xyz",
            "\n".join([
                "2",
                "energy=-1.5 eV",
                "H 0.0 0.0 0.0",
                "H 0.0 0.0 0.74",
            ]),
        )
        hartree_xyz = parse_source_preview(
            "water.xyz",
            "\n".join([
                "3",
                "E=-76.431 Ha",
                "O 0.0 0.0 0.0",
                "H 0.0 0.0 1.0",
                "H 1.0 0.0 0.0",
            ]),
        )

        self.assertEqual(ev_xyz.sourceKind, "XYZ")
        self.assertAlmostEqual(ev_xyz.energyGas or 0, -0.05512398326348249)
        self.assertNotIn("unit_assumed", {warning.code for warning in ev_xyz.warnings})
        self.assertAlmostEqual(hartree_xyz.energyGas or 0, -76.431)
        self.assertEqual(hartree_xyz.energyUnit, "hartree")

    def test_engine_import_preview_projects_bad_xyz_as_parse_failed(self) -> None:
        parsed = parse_source_preview(
            "xyz-bad-atom-count.xyz",
            "\n".join([
                "3",
                "bad atom count",
                "H 0.0 0.0 0.0",
            ]),
        )

        self.assertFalse(parsed.parsed)
        self.assertEqual(parsed.sourceKind, "XYZ")
        self.assertEqual(parsed.parserId, "xyz-text-preview")
        self.assertEqual(parsed.objectCount, 0)
        self.assertEqual([warning.code for warning in parsed.warnings], ["parse_failed"])
        self.assertIn("atom count", parsed.warnings[0].message)

    def test_engine_import_preview_extracts_orca_geometry_summary(self) -> None:
        orca = parse_source_preview(
            "water.out",
            "\n".join([
                "! B3LYP def2-SVP Opt",
                "* xyz 0 1",
                "O 0.0 0.0 0.0",
                "H 0.0 0.0 0.96",
                "H 0.92 0.0 -0.24",
                "*",
                "CARTESIAN COORDINATES (ANGSTROEM)",
                "---------------------------------",
                "O      0.000000    0.000000    0.000000",
                "H      0.000000    0.000000    0.960000",
                "H      0.920000    0.000000   -0.240000",
                "---------------------------------",
                "FINAL SINGLE POINT ENERGY     -76.431",
                "CPCM SOLVATION ENERGY = -0.001",
            ]),
        )

        self.assertTrue(orca.parsed)
        self.assertEqual(orca.sourceKind, "ORCA")
        self.assertEqual(orca.formula, "H2O")
        self.assertEqual(orca.method, "B3LYP def2-SVP Opt")
        self.assertAlmostEqual(orca.energyGas or 0, -76.431)
        self.assertAlmostEqual(orca.energySolution or 0, -76.432)
        self.assertEqual(orca.coordinatePreview.atomCount if orca.coordinatePreview else 0, 3)
        self.assertEqual(orca.candidates[0].charge, 0)
        self.assertEqual(orca.candidates[0].spinMultiplicity, 1)

    def test_engine_import_preview_parses_orca_total_scf_energy_shape(self) -> None:
        orca = parse_source_preview(
            "orca-sp-water-synthetic-minimal.out",
            "\n".join([
                "                              O   R   C   A",
                "|  1> ! B3LYP def2-SVP SP",
                "|  2> * xyz 0 1",
                "CARTESIAN COORDINATES (ANGSTROEM)",
                "---------------------------------",
                "  O      0.000000    0.000000    0.000000",
                "  H      0.000000    0.000000    0.957200",
                "  H      0.926600    0.000000   -0.239600",
                "",
                "General Settings:",
                " Total Charge           Charge          ....    0",
                " Multiplicity           Mult            ....    1",
                "----------------",
                "TOTAL SCF ENERGY",
                "----------------",
                "Total Energy       :          -76.34567890 Eh           -2077.47334 eV",
            ]),
        )

        self.assertTrue(orca.parsed)
        self.assertEqual(orca.sourceKind, "ORCA")
        self.assertEqual(orca.formula, "H2O")
        self.assertAlmostEqual(orca.energyGas or 0, -76.34567890)
        self.assertEqual(orca.coordinatePreview.atomCount if orca.coordinatePreview else 0, 3)
        self.assertEqual(orca.candidates[0].charge, 0)
        self.assertEqual(orca.candidates[0].spinMultiplicity, 1)

    def test_engine_import_preview_preserves_coordinate_atoms_for_2d_depiction(self) -> None:
        gaussian = parse_source_preview(
            "ir-complex.log",
            "\n".join([
                " Charge =  1 Multiplicity = 1",
                " Stoichiometry    C2H6IrN(1+)",
                "                          Input orientation:",
                " ---------------------------------------------------------------------",
                " Center     Atomic      Atomic             Coordinates (Angstroms)",
                " Number     Number       Type             X           Y           Z",
                " ---------------------------------------------------------------------",
                "      1         77           0        0.000000    0.000000    0.000000",
                "      2          6           0        1.900000    0.000000    0.000000",
                "      3          7           0       -1.800000    0.000000    0.000000",
                " ---------------------------------------------------------------------",
                " SCF Done:  E(RwB97XD) =  -4749.26415609     A.U. after   20 cycles",
            ]),
        )

        self.assertEqual(gaussian.coordinatePreview.atomCount if gaussian.coordinatePreview else 0, 3)
        self.assertEqual(gaussian.coordinatePreview.elements if gaussian.coordinatePreview else (), ("C", "Ir", "N"))
        self.assertEqual(gaussian.coordinatePreview.atoms[0].element if gaussian.coordinatePreview else "", "Ir")
        self.assertAlmostEqual(gaussian.coordinatePreview.atoms[1].x if gaussian.coordinatePreview else 0, 1.9)

    def test_engine_import_preview_parses_extxyz_metadata(self) -> None:
        extxyz = parse_source_preview(
            "h2.xyz",
            "\n".join([
                "2",
                'Properties=species:S:1:pos:R:3 energy=-1.5 charge=0 spin_multiplicity=1 label="h2-extxyz" pbc="F F F"',
                "H 0.0 0.0 0.0",
                "H 0.0 0.0 0.74",
            ]),
        )

        self.assertTrue(extxyz.parsed)
        self.assertEqual(extxyz.sourceKind, "extxyz")
        self.assertEqual(extxyz.parserId, "xyz-ase-text-preview")
        self.assertEqual(extxyz.label, "h2-extxyz")
        self.assertEqual(extxyz.formula, "H2")
        self.assertEqual(extxyz.method, "ASE extxyz")
        self.assertEqual(extxyz.energyUnit, "hartree")
        self.assertAlmostEqual(extxyz.energyGas or 0, -0.05512398326348249)
        self.assertEqual(extxyz.candidates[0].charge, 0)
        self.assertEqual(extxyz.candidates[0].spinMultiplicity, 1)
        self.assertEqual(extxyz.coordinatePreview.atomCount if extxyz.coordinatePreview else 0, 2)
        self.assertIn("unit_assumed", {warning.code for warning in extxyz.warnings})

    def test_engine_import_preview_parses_multiframe_extxyz_candidates(self) -> None:
        extxyz = parse_source_preview(
            "path.xyz",
            "\n".join([
                "2",
                "Properties=species:S:1:pos:R:3 label=co-calc-energy charge=0 spin_multiplicity=1 energy=-14.25",
                "C 0.0 0.0 0.0",
                "O 0.0 0.0 1.13",
                "1",
                "Properties=species:S:1:pos:R:3 label=he-missing-energy charge=0 spin_multiplicity=1",
                "He 0.0 0.0 0.0",
            ]),
        )

        self.assertTrue(extxyz.parsed)
        self.assertEqual(extxyz.sourceKind, "extxyz")
        self.assertEqual(extxyz.objectCount, 2)
        self.assertEqual([candidate.label for candidate in extxyz.candidates], ["co-calc-energy", "he-missing-energy"])
        self.assertEqual([candidate.roleHint for candidate in extxyz.candidates], ["path-point", "final"])
        self.assertAlmostEqual(extxyz.candidates[0].energyGas or 0, -0.5236778410030837)
        self.assertIsNone(extxyz.candidates[1].energyGas)
        self.assertEqual(
            [warning.code for warning in extxyz.warnings],
            ["missing_section", "unit_assumed", "candidate_selection_available"],
        )

    def test_engine_import_preview_returns_multiframe_candidates(self) -> None:
        maple_xyz = parse_source_preview(
            "path.xyz",
            "\n".join([
                "2",
                "Image 1 Energy=-10.0",
                "H 0.0 0.0 0.0",
                "H 0.0 0.0 0.7",
                "2",
                "Image 2 Energy=-11.0",
                "H 0.0 0.0 0.0",
                "H 0.0 0.0 0.8",
            ]),
        )

        self.assertTrue(maple_xyz.parsed)
        self.assertEqual(maple_xyz.sourceKind, "MAPLE")
        self.assertEqual(maple_xyz.objectCount, 2)
        self.assertEqual(maple_xyz.energyGas, -11.0)
        self.assertEqual([candidate.label for candidate in maple_xyz.candidates], ["Image 1", "Image 2"])
        self.assertEqual(maple_xyz.candidates[0].roleHint, "path-point")
        self.assertEqual(maple_xyz.candidates[1].roleHint, "final")
        warning_codes = {warning.code for warning in maple_xyz.warnings}
        self.assertIn("candidate_selection_available", warning_codes)
        self.assertNotIn("unit_assumed", warning_codes)

    def test_engine_import_preview_extracts_gaussian_geometry_summary(self) -> None:
        gaussian = parse_source_preview(
            "water.log",
            "\n".join([
                "#p wb97xd/def2svp opt",
                "Charge = 0 Multiplicity = 1",
                "Standard orientation:",
                " ---------------------------------------------------------------------",
                " Center     Atomic      Atomic             Coordinates (Angstroms)",
                " Number     Number       Type             X           Y           Z",
                " ---------------------------------------------------------------------",
                "      1          8           0        0.000000    0.000000    0.000000",
                "      2          1           0        0.000000    0.000000    0.960000",
                "      3          1           0        0.920000    0.000000   -0.240000",
                " ---------------------------------------------------------------------",
                "SCF Done: E(RwB97XD) = -76.431 A.U.",
            ]),
        )

        self.assertTrue(gaussian.parsed)
        self.assertEqual(gaussian.formula, "H2O")
        self.assertEqual(gaussian.method, "wb97xd")
        self.assertEqual(gaussian.candidates[0].charge, 0)
        self.assertEqual(gaussian.candidates[0].spinMultiplicity, 1)
        self.assertEqual(gaussian.coordinatePreview.atomCount if gaussian.coordinatePreview else 0, 3)

    def test_engine_ipc_import_preview(self) -> None:
        preview = handle_request({
            "command": "import.preview",
            "files": [{
                "name": "desktop.log",
                "preview": "SCF Done: E(RwB97XD) = -100.0",
            }],
        })
        self.assertTrue(preview["ok"])
        self.assertEqual(preview["data"]["files"][0]["parse"]["sourceKind"], "Gaussian")
        self.assertEqual(preview["data"]["files"][0]["parse"]["energyGas"], -100.0)

        invalid = handle_request({"command": "import.preview"})
        self.assertFalse(invalid["ok"])
        self.assertEqual(invalid["error"]["code"], "invalid_input")

    def test_engine_ipc_import_register_selection_and_all(self) -> None:
        source_file = {
            "id": "file-path",
            "name": "path.xyz",
            "preview": "\n".join([
                "2",
                "Image 1 Energy=-10.0",
                "H 0.0 0.0 0.0",
                "H 0.0 0.0 0.7",
                "2",
                "Image 2 Energy=-11.0",
                "H 0.0 0.0 0.0",
                "H 0.0 0.0 0.8",
            ]),
        }
        preview = handle_request({"command": "import.preview", "files": [source_file]})
        self.assertTrue(preview["ok"])
        source_with_parse = {
            **source_file,
            "parse": preview["data"]["files"][0]["parse"],
        }

        selected = handle_request({
            "command": "import.register_selection",
            "files": [source_with_parse],
            "selections": [{
                "fileId": "file-path",
                "objectIndices": [1],
            }],
        })
        self.assertTrue(selected["ok"])
        self.assertEqual(len(selected["data"]["registeredObjects"]), 1)
        selected_object = selected["data"]["registeredObjects"][0]
        self.assertEqual(selected_object["id"], "object-file-path-candidate-2-image-2")
        self.assertEqual(selected_object["label"], "Image 2")
        self.assertEqual(selected_object["kind"], "product")
        self.assertEqual(selected_object["sourceObjectIndex"], 1)
        self.assertEqual(selected_object["parserId"], "maple-output-text-preview")
        self.assertEqual(selected["data"]["files"][0]["registeredObjectIds"], [selected_object["id"]])

        negative_index = handle_request({
            "command": "import.register_selection",
            "files": [source_with_parse],
            "selections": [{
                "fileId": "file-path",
                "objectIndices": [-1],
            }],
        })
        self.assertTrue(negative_index["ok"])
        self.assertEqual(negative_index["data"]["registeredObjects"][0]["sourceObjectIndex"], 1)

        registered_all = handle_request({
            "command": "import.register_all",
            "files": [source_with_parse],
        })
        self.assertTrue(registered_all["ok"])
        self.assertEqual(
            [obj["sourceObjectIndex"] for obj in registered_all["data"]["registeredObjects"]],
            [0, 1],
        )

        duplicate = handle_request({
            "command": "import.register_selection",
            "files": [source_with_parse],
            "selections": [{
                "fileId": "file-path",
                "objectIndices": [0, 0],
            }],
        })
        self.assertFalse(duplicate["ok"])
        self.assertEqual(duplicate["error"]["code"], "invalid_input")
        self.assertIn("duplicated", duplicate["error"]["message"])

        out_of_range = handle_request({
            "command": "import.register_selection",
            "files": [source_with_parse],
            "selections": [{
                "fileId": "file-path",
                "objectIndices": [2],
            }],
        })
        self.assertFalse(out_of_range["ok"])
        self.assertEqual(out_of_range["error"]["code"], "invalid_input")
        self.assertIn("out of range", out_of_range["error"]["message"])

    def test_project_validation_reports_summary_and_path_errors(self) -> None:
        content = json.dumps(sample_project_content({
            "files": [{
                "id": "file-1",
                "name": "gaussian.log",
                "kind": "Gaussian",
                "size": 31,
                "status": "parsed",
                "preview": "SCF Done: E(RwB97XD) = -100.0",
                "storedPath": "/tmp/leak.log",
            }],
        }))

        validation = validate_project_content(content)

        self.assertFalse(validation["valid"])
        self.assertEqual(validation["summary"]["projectId"], "alpha-study")
        self.assertEqual(validation["summary"]["fileCount"], 1)
        self.assertEqual(validation["summary"]["barrierCount"], 0)
        self.assertIn("unsafe_stored_path", {issue["code"] for issue in validation["issues"]})

        bad_viewport = json.dumps(sample_project_content({
            "viewport": {"x": 0, "y": 0, "zoom": float("nan")},
        }))
        viewport_validation = validate_project_content(bad_viewport)
        self.assertFalse(viewport_validation["valid"])
        self.assertIn("invalid_viewport", {issue["code"] for issue in viewport_validation["issues"]})

    def test_project_validation_checks_graph_and_source_references(self) -> None:
        project = sample_project_content({
            "files": [
                {
                    "id": "file-1",
                    "name": "gaussian.log",
                    "kind": "Gaussian",
                    "size": 31,
                    "status": "parsed",
                    "preview": "SCF Done: E(RwB97XD) = -100.0",
                },
                {
                    "id": "file-1",
                    "name": "duplicate.log",
                    "kind": "Gaussian",
                    "size": -1,
                    "status": "archived",
                    "preview": "",
                },
            ],
            "nodes": [
                {
                    "id": "node-1",
                    "label": "TS1",
                    "formula": "C2H4",
                    "kind": "transition",
                    "method": "wB97X-D",
                    "solvent": "Toluene",
                    "energyGas": "not-a-number",
                    "energySolution": -99.8,
                    "energyUnit": "eV",
                    "coefficient": 0,
                    "sourceStatus": "parsed",
                    "sourceFileId": "missing-file",
                    "sourceObjectIndex": -1,
                    "position": {"x": 10, "y": float("nan")},
                },
                {
                    "id": "node-1",
                    "label": "Duplicate",
                    "formula": "C2H4",
                    "kind": "intermediate",
                    "method": "wB97X-D",
                    "solvent": "Toluene",
                    "energyGas": -100.0,
                    "energySolution": -99.8,
                    "energyUnit": "hartree",
                    "position": {"x": 10, "y": 20},
                },
            ],
            "edges": [
                {
                    "id": "edge-1",
                    "sourceId": "node-1",
                    "targetId": "ghost-node",
                    "label": "step",
                },
                {
                    "id": "edge-1",
                    "sourceId": "",
                    "targetId": "node-1",
                    "label": "broken",
                },
                {
                    "id": "edge-self",
                    "sourceId": "node-1",
                    "targetId": "node-1",
                    "label": "loop",
                },
            ],
            "barriers": [
                {
                    "id": "barrier-1",
                    "sourceId": "node-1",
                    "targetId": "ghost-node",
                    "label": 42,
                },
                {
                    "id": "barrier-1",
                    "sourceId": "",
                    "targetId": "node-1",
                },
            ],
        })

        validation = validate_project_content(json.dumps(project))
        codes = {issue["code"] for issue in validation["issues"]}

        self.assertFalse(validation["valid"])
        self.assertIn("duplicate_file_id", codes)
        self.assertIn("invalid_file_size", codes)
        self.assertIn("unknown_file_status", codes)
        self.assertIn("invalid_energy_unit", codes)
        self.assertIn("invalid_node_energy", codes)
        self.assertIn("invalid_node_coefficient", codes)
        self.assertIn("invalid_node_position", codes)
        self.assertIn("node_missing_source_file", codes)
        self.assertIn("invalid_source_object_index", codes)
        self.assertIn("duplicate_node_id", codes)
        self.assertIn("edge_missing_node", codes)
        self.assertIn("duplicate_edge_id", codes)
        self.assertIn("invalid_edge_endpoint", codes)
        self.assertIn("self_edge", codes)
        self.assertIn("barrier_missing_node", codes)
        self.assertIn("duplicate_barrier_id", codes)
        self.assertIn("invalid_barrier_endpoint", codes)
        self.assertIn("invalid_barrier_label", codes)

    def test_project_validation_checks_import_ledger_references(self) -> None:
        project = sample_project_content({
            "files": [{
                "id": "file-1",
                "name": "gaussian.log",
                "kind": "Gaussian",
                "size": 31,
                "status": "parsed",
                "preview": "SCF Done: E(RwB97XD) = -100.0",
            }],
            "nodes": [{
                "id": "node-1",
                "label": "TS1",
                "formula": "C2H4",
                "kind": "transition",
                "method": "wB97X-D",
                "solvent": "Toluene",
                "energyGas": -100.0,
                "energySolution": -99.8,
                "energyUnit": "hartree",
                "sourceStatus": "parsed",
                "sourceFileId": "file-1",
                "sourceCandidateId": "candidate-1-ts1",
                "sourceObjectIndex": 0,
                "position": {"x": 10, "y": 20},
            }],
            "importLedger": {
                "schemaVersion": 1,
                "entries": [
                    {
                        "id": "entry-1",
                        "fileId": "missing-file",
                        "sourceName": "missing.log",
                        "sourceKind": "Gaussian",
                        "status": "registered",
                        "candidateId": 123,
                        "objectIndex": -1,
                        "registeredNodeIds": ["ghost-node"],
                        "warningCodes": "candidate_selection_available",
                    },
                    {
                        "id": "entry-1",
                        "fileId": "",
                        "sourceName": "gaussian.log",
                        "sourceKind": "Gaussian",
                        "status": "done",
                        "registeredNodeIds": "node-1",
                    },
                ],
            },
        })

        validation = validate_project_content(json.dumps(project))
        codes = {issue["code"] for issue in validation["issues"]}

        self.assertFalse(validation["valid"])
        self.assertIn("import_ledger_missing_file", codes)
        self.assertIn("invalid_import_ledger_candidate_id", codes)
        self.assertIn("invalid_import_ledger_object_index", codes)
        self.assertIn("import_ledger_missing_node", codes)
        self.assertIn("invalid_import_ledger_warning_codes", codes)
        self.assertIn("duplicate_import_ledger_entry_id", codes)
        self.assertIn("invalid_import_ledger_file_id", codes)
        self.assertIn("invalid_import_ledger_status", codes)
        self.assertIn("invalid_import_ledger_node_ids", codes)
        self.assertIn("node_missing_import_ledger", codes)

    def test_project_validation_checks_stored_sources_in_project_directory(self) -> None:
        raw_source = b"SCF Done: E(RwB97XD) = -100.0"
        source_checksum = f"sha256:{hashlib.sha256(raw_source).hexdigest()}"
        project = sample_project_content({
            "files": [{
                "id": "file-1",
                "name": "desktop.log",
                "kind": "Gaussian",
                "size": len(raw_source),
                "checksum": source_checksum,
                "status": "parsed",
                "preview": raw_source.decode("utf8"),
                "storedPath": "sources/01-file-1-desktop.log",
            }],
        })
        content = json.dumps(project)

        with tempfile.TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir) / "Alpha Study"
            source_path = project_root / "sources" / "01-file-1-desktop.log"
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(raw_source)
            (project_root / "exports").mkdir()
            (project_root / "exports" / "manifest.json").write_text(json.dumps({
                "schemaVersion": 1,
                "packageKind": "rxnflow-export-artifacts",
                "artifacts": [],
            }), encoding="utf8")

            validation = validate_project_content(content, project_root)
            self.assertTrue(validation["valid"])
            self.assertEqual([], validation["issues"])

            source_path.write_text("changed", encoding="utf8")
            changed = validate_project_content(content, project_root)
            changed_codes = {issue["code"] for issue in changed["issues"]}
            self.assertTrue(changed["valid"])
            self.assertIn("source_size_mismatch", changed_codes)
            self.assertIn("source_checksum_mismatch", changed_codes)

            source_path.unlink()
            missing = validate_project_content(content, project_root)
            self.assertTrue(missing["valid"])
            self.assertIn("source_missing", {issue["code"] for issue in missing["issues"]})

    def test_project_validation_checks_export_artifact_manifest(self) -> None:
        artifact_bytes = b"png-bytes"
        project = sample_project_content()

        with tempfile.TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir) / "Alpha Study"
            export_path = project_root / "exports" / "rxnflow-profile.png"
            export_path.parent.mkdir(parents=True)
            export_path.write_bytes(artifact_bytes)
            (project_root / "exports" / "manifest.json").write_text(json.dumps({
                "schemaVersion": 1,
                "packageKind": "rxnflow-export-artifacts",
                "artifacts": [{
                    "id": "artifact-rxnflow-profile",
                    "fileName": "rxnflow-profile.png",
                    "path": "exports/rxnflow-profile.png",
                    "mimeType": "image/png",
                    "size": len(artifact_bytes),
                    "checksum": f"sha256:{'0' * 64}",
                }],
            }), encoding="utf8")

            validation = validate_project_content(json.dumps(project), project_root)
            self.assertTrue(validation["valid"])
            self.assertIn("artifact_checksum_mismatch", {issue["code"] for issue in validation["issues"]})

    def test_engine_project_validate_save_and_open(self) -> None:
        project = sample_project_content({
            "files": [{
                "id": "file-1",
                "name": "desktop.log",
                "kind": "Gaussian",
                "size": 31,
                "status": "parsed",
                "preview": "SCF Done: E(RwB97XD) = -100.0",
                "sourcePath": "/tmp/session-only.log",
                "storedPath": "sources/01-file-1-desktop.log",
            }],
            "nodes": [{
                "id": "node-1",
                "label": "TS1",
                "formula": "C2H4",
                "kind": "transition",
                "method": "wB97X-D",
                "solvent": "Toluene",
                "energyGas": -100.0,
                "energySolution": -99.8,
                "energyUnit": "hartree",
                "sourceStatus": "parsed",
                "sourceFileId": "file-1",
                "sourceCandidateId": "candidate-1-ts1",
                "sourceObjectIndex": 0,
                "position": {"x": 10, "y": 20},
            }],
            "importLedger": {
                "schemaVersion": 1,
                "entries": [{
                    "id": "import-file-1-candidate-1-ts1",
                    "fileId": "file-1",
                    "sourceName": "desktop.log",
                    "sourceKind": "Gaussian",
                    "status": "registered",
                    "parserId": "gaussian-log-text-preview",
                    "parserVersion": "0.2.1",
                    "candidateId": "candidate-1-ts1",
                    "objectIndex": 0,
                    "registeredNodeIds": ["node-1"],
                    "warningCodes": [],
                }],
            },
        })
        content = json.dumps(project)

        valid = handle_request({"command": "project.validate", "content": content})
        self.assertTrue(valid["ok"])
        self.assertTrue(valid["data"]["valid"])
        self.assertEqual(valid["data"]["summary"]["storedSourceCount"], 1)
        self.assertEqual(valid["data"]["summary"]["importLedgerEntryCount"], 1)

        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = str(Path(temp_dir) / "Alpha Study")
            saved = handle_request({
                "command": "project.save",
                "projectPath": project_path,
                "content": content,
            })
            self.assertTrue(saved["ok"])
            self.assertEqual(saved["data"]["projectPath"], project_path)
            self.assertTrue(Path(saved["data"]["contentPath"]).exists())
            self.assertTrue((Path(project_path) / ".rxnflow" / "manifest.json").exists())
            self.assertTrue((Path(project_path) / "exports" / "manifest.json").exists())
            self.assertNotIn("sourcePath", saved["data"]["content"])
            self.assertTrue(json.loads(saved["data"]["content"])["files"][0]["checksum"].startswith("sha256:"))
            self.assertEqual(json.loads(saved["data"]["content"])["importLedger"]["entries"][0]["registeredNodeIds"], ["node-1"])

            opened = handle_request({"command": "project.open", "projectPath": project_path})
            self.assertTrue(opened["ok"])
            self.assertTrue(opened["data"]["validation"]["valid"])
            self.assertEqual(opened["data"]["validation"]["summary"]["nodeCount"], 1)

        invalid = handle_request({"command": "project.save", "projectPath": "", "content": content})
        self.assertFalse(invalid["ok"])
        self.assertEqual(invalid["error"]["code"], "invalid_input")


def sample_project_content(overrides: dict[str, object] | None = None) -> dict[str, object]:
    project = {
        "schemaVersion": 1,
        "packageKind": "rxnflow-project",
        "project": {
            "id": "alpha-study",
            "label": "Alpha Study",
            "meta": "open",
        },
        "files": [],
        "nodes": [{
            "id": "node-1",
            "label": "TS1",
            "formula": "C2H4",
            "kind": "transition",
            "method": "wB97X-D",
            "solvent": "Toluene",
            "energyGas": -100.0,
            "energySolution": -99.8,
            "energyUnit": "hartree",
            "sourceStatus": "parsed",
            "sourceFileId": "file-1",
            "position": {"x": 10, "y": 20},
        }],
        "edges": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "savedAt": "2026-06-14T00:00:00.000Z",
    }
    if overrides:
        project.update(overrides)
    return project


if __name__ == "__main__":
    unittest.main()
