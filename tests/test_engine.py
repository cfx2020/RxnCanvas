from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from rxncanvas import demo_flow, export_flow_json
from rxncanvas.engine import MAX_SOURCE_FILE_BYTES, parse_source_file, parse_source_preview, validate_project_content
from rxncanvas import engine
from rxncanvas.engine_ipc import ENGINE_VERSION, handle_request


FAKE_CCLIB_HARTREE_TO_EV = 27.21138505


def fake_cclib_scf_energy(hartree: float) -> float:
    return hartree * FAKE_CCLIB_HARTREE_TO_EV


def fake_cclib_convertor(value: float, fromunits: str, tounits: str) -> float:
    if (fromunits, tounits) != ("eV", "hartree"):
        raise KeyError(f"Unsupported fake cclib conversion: {fromunits} -> {tounits}")
    return value / FAKE_CCLIB_HARTREE_TO_EV


def fake_cclib_module(data: SimpleNamespace, parser_name: str = "Gaussian") -> SimpleNamespace:
    parser_type = type(parser_name, (), {"parse": lambda self: data})
    return SimpleNamespace(
        io=SimpleNamespace(ccopen=lambda _path, quiet=True: parser_type()),
        parser=SimpleNamespace(utils=SimpleNamespace(convertor=fake_cclib_convertor)),
    )


def large_orca_characterization_text(iterations: int = 96) -> str:
    lines = [
        "                              O   R   C   A",
        "! UKS B3LYP D3BJ def2-TZVP OptTS Freq TightSCF",
        "* xyz -1 2",
        "Number of basis functions : 777",
        "ORCA finished by error",
    ]
    for index in range(iterations):
        offset = index / 1000
        lines.extend([
            "CARTESIAN COORDINATES (ANGSTROEM)",
            "---------------------------------",
            f"C      {offset:.6f}    0.000000    0.000000",
            f"H      {offset:.6f}    0.000000    1.000000",
            "",
            f"FINAL SINGLE POINT ENERGY     {-400.0 - offset:.9f}",
            f"CPCM SOLVATION ENERGY = {-0.001 - offset / 100:.9f}",
            *(f"ORCA characterization filler {index:03d} {filler:02d}" for filler in range(12)),
        ])
    lines.extend([
        "! HF def2-SVP SP",
        "* xyz 2 5",
        "# of contracted basis functions .... 888",
        "Total Charge           Charge          ....    3",
        "Multiplicity           Mult            ....    4",
        "CARTESIAN COORDINATES (ANGSTROEM)",
        "---------------------------------",
        "1 C      0.100000    0.200000    0.300000",
        "2 O      1.100000    1.200000    1.300000",
        "3 C     -0.100000   -0.200000   -0.300000",
        "4 H      2.100000    2.200000    2.300000",
        "5 H     -2.100000   -2.200000   -2.300000",
        "6 H      3.100000    3.200000    3.300000",
        "7 H     -3.100000   -3.200000   -3.300000",
        "---------------------------------",
        "VIBRATIONAL FREQUENCIES",
        "NORMAL MODES",
        "FINAL SINGLE POINT ENERGY     -500.123456789",
        "SMD SOLVATION ENERGY = -0.012345000",
        "Total Energy       :          -999.999999999 Eh",
        "ORCA TERMINATED NORMALLY",
        "TOTAL RUN TIME: 0 days 1 hours 2 minutes 3.4 seconds",
    ])
    return "\n".join(lines)


def large_gaussian_characterization_text(iterations: int = 176) -> str:
    lines = [
        " Entering Gaussian System, Link 0=g16",
        " #p wb97xd/genecp opt=(ts,calcfc) freq scrf=(smd,solvent=toluene)",
        " Stoichiometry C2H5NO",
        " NBasis=   777 RedAO= T",
        " Charge = -1 Multiplicity = 2",
        *gaussian_orientation_lines([
            (6, 0.0, 0.0, 0.0),
            (8, 1.2, 0.0, 0.0),
            (1, -0.6, 0.9, 0.0),
            (1, -0.6, -0.9, 0.0),
        ], "Input orientation:"),
        " SCF Done:  E(RwB97XD) =  -400.000000000     A.U. after  12 cycles",
    ]
    for index in range(iterations):
        offset = index / 1000
        lines.extend([
            *gaussian_orientation_lines([
                (6, offset, 0.0, 0.0),
                (8, 1.2 + offset, 0.0, 0.0),
                (1, -0.6 + offset, 0.9, 0.0),
                (1, -0.6 + offset, -0.9, 0.0),
            ]),
            f" SCF Done:  E(RwB97XD) =  {-400.0 - offset:.9f}     A.U. after  10 cycles",
            *(f" Gaussian characterization filler {index:03d} {filler:02d} keeps Link1 sections realistic" for filler in range(12)),
        ])
    lines.extend([
        " Job cpu time:       0 days  2 hours  3 minutes  4.5 seconds.",
        " Elapsed time:       0 days  2 hours  4 minutes  5.6 seconds.",
        " Normal termination of Gaussian 16 at Tue Jul 14 01:00:00 2026.",
        " Link1:  Proceeding to internal job step number  2.",
        " #p m062x/def2svp freq scrf=(pcm,solvent=water)",
        " Stoichiometry H2O",
        " NBasis=   888 RedAO= T",
        " Charge = 2 Multiplicity = 3",
        *gaussian_orientation_lines([
            (6, 0.1, 0.2, 0.3),
            (8, 1.1, 1.2, 1.3),
            (1, -0.1, -0.2, -0.3),
            (1, 2.1, 2.2, 2.3),
        ]),
        " SCF Done:  E(UM06-2X) =  -500.123456789     A.U. after  8 cycles",
        " Thermal correction to Gibbs Free Energy=        0.135802468",
        " Sum of electronic and thermal Free Energies=   -499.987654321",
        " Frequencies --  -423.1200   120.5000   345.6700",
        " Red. masses --     1.1000     2.2000     3.3000",
        " Frc consts  --     0.4000     0.5000     0.6000",
        " IR Inten    --    10.0000    20.0000    30.0000",
        " Raman Activ --     4.0000     5.0000     6.0000",
        " Atom  AN      X      Y      Z        X      Y      Z        X      Y      Z",
        "   1   6     0.010  0.000  0.000    0.000  0.020  0.000    0.000  0.000  0.030",
        "   2   8    -0.010  0.000  0.000    0.000 -0.020  0.000    0.000  0.000 -0.030",
        "   3   1     0.000  0.010  0.000    0.000  0.000  0.020    0.030  0.000  0.000",
        "   4   1     0.000 -0.010  0.000    0.000  0.000 -0.020   -0.030  0.000  0.000",
        " Frequencies --   901.2300  1002.3400",
        " Red. masses --      4.4000     5.5000",
        " malformed frequency payload without an Atom AN displacement table",
        " Standard orientation:",
        " ---------------------------------------------------------------------",
        " Center     Atomic      Atomic             Coordinates (Angstroms)",
        " Number     Number       Type             X           Y           Z",
        " ---------------------------------------------------------------------",
        " this trailing orientation block is intentionally incomplete",
        " Job cpu time:       1 days  2 hours  3 minutes  4.5 seconds.",
        " Elapsed time:       1 days  2 hours  4 minutes  5.6 seconds.",
        " Normal termination of Gaussian 16 at Tue Jul 14 02:00:00 2026.",
    ])
    return "\n".join(lines)


def gaussian_orientation_lines(
    atoms: list[tuple[int, float, float, float]],
    label: str = "Standard orientation:",
) -> list[str]:
    return [
        f"                          {label}",
        " ---------------------------------------------------------------------",
        " Center     Atomic      Atomic             Coordinates (Angstroms)",
        " Number     Number       Type             X           Y           Z",
        " ---------------------------------------------------------------------",
        *(f" {index:6d} {atomic_number:10d} {0:11d} {x:15.6f} {y:11.6f} {z:11.6f}" for index, (atomic_number, x, y, z) in enumerate(atoms, 1)),
        " ---------------------------------------------------------------------",
    ]


def gaussian_cclib_context_text() -> str:
    return "\n".join([
        "Entering Gaussian System",
        "#p wb97xd/genecp opt freq scrf=(smd,solvent=water)",
        "Stoichiometry H2",
        "Charge = 0 Multiplicity = 1",
        *gaussian_orientation_lines([
            (1, 0.0, 0.0, 0.0),
            (1, 0.0, 0.0, 0.74),
        ]),
        "SCF Done: E(RwB97XD) = -76.431000 A.U.",
        "Frequencies -- -123.4000",
        "Atom  AN      X      Y      Z",
        "  1   8     0.010  0.000  0.000",
        "  2   1    -0.010  0.000  0.000",
        "  3   1     0.000  0.010  0.000",
        "Job cpu time: 0 days 0 hours 1 minutes 2.3 seconds.",
        "Elapsed time: 0 days 0 hours 1 minutes 3.4 seconds.",
        "Normal termination of Gaussian 16",
    ])


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

    def test_engine_ipc_processes_multiple_requests_after_errors(self) -> None:
        completed = subprocess.run(
            [sys.executable, "-m", "rxncanvas.engine_ipc"],
            input="\n".join([
                "not-json",
                json.dumps({"command": "missing"}),
                json.dumps({"command": "engine.status"}),
            ]),
            text=True,
            capture_output=True,
            check=False,
            timeout=10,
        )
        responses = [json.loads(line) for line in completed.stdout.splitlines()]

        self.assertEqual(completed.returncode, 0)
        self.assertEqual(len(responses), 3)
        self.assertEqual(responses[0]["error"]["code"], "invalid_json")
        self.assertEqual(responses[1]["error"]["code"], "unknown_command")
        self.assertTrue(responses[2]["ok"])
        self.assertEqual(responses[2]["data"]["status"], "ready")

    def test_engine_ipc_single_request_eof_keeps_exit_semantics(self) -> None:
        cases = (
            (json.dumps({"command": "engine.status"}), 0, None),
            (json.dumps({"command": "missing"}), 1, "unknown_command"),
            ("not-json", 2, "invalid_json"),
        )

        for payload, expected_returncode, expected_error in cases:
            with self.subTest(payload=payload):
                completed = subprocess.run(
                    [sys.executable, "-m", "rxncanvas.engine_ipc"],
                    input=payload,
                    text=True,
                    capture_output=True,
                    check=False,
                    timeout=10,
                )
                responses = [json.loads(line) for line in completed.stdout.splitlines()]

                self.assertEqual(completed.returncode, expected_returncode)
                self.assertEqual(len(responses), 1)
                if expected_error is None:
                    self.assertTrue(responses[0]["ok"])
                else:
                    self.assertEqual(responses[0]["error"]["code"], expected_error)

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

            data = SimpleNamespace(
                scfenergies=[fake_cclib_scf_energy(-76.431)],
                freeenergy=-76.4,
                nbasis=42,
            )
            with patch.dict(sys.modules, {"cclib": fake_cclib_module(data)}):
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
        self.assertEqual(parse["parserId"], "gaussian-log-cclib+rxncanvas-text-full-file")
        self.assertAlmostEqual(parse["energyGas"], -76.431)
        self.assertEqual(parse["energyTable"]["gasBasisFunctions"], 42)
        self.assertAlmostEqual(parse["energyTable"]["ggasHartree"], -76.4)
        self.assertAlmostEqual(parse["energyTable"]["ggas1mHartree"], -76.396981)

    def test_engine_skips_full_file_read_above_the_source_limit(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "oversized.log"
            with source_path.open("wb") as handle:
                handle.truncate(MAX_SOURCE_FILE_BYTES + 1)

            parsed = parse_source_file(
                "oversized.log",
                str(source_path),
            )

        self.assertFalse(parsed.parsed)
        self.assertIsNone(parsed.energyGas)
        self.assertEqual(parsed.parseScope, "full-file")
        self.assertIn("source_file_too_large", [warning.code for warning in parsed.warnings])

    def test_engine_never_parses_preview_when_the_complete_source_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            for source_path in (None, str(Path(directory) / "missing.log")):
                with self.subTest(source_path=source_path):
                    response = handle_request({
                        "command": "import.preview",
                        "files": [{
                            "name": "missing.log",
                            "preview": "SCF Done: E(RB3LYP) = -76.431 A.U.",
                            "sourcePath": source_path,
                        }],
                    })
                    parsed = response["data"]["files"][0]["parse"]
                    self.assertFalse(parsed["parsed"])
                    self.assertIsNone(parsed["energyGas"])
                    self.assertFalse(parsed["candidates"])
                    self.assertEqual(parsed["parseScope"], "full-file")

    def test_cclib_failure_cannot_be_bypassed_by_late_gaussian_markers(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "late.log"
            source_path.write_text(
                "padding\n" * 10000 + "SCF Done: E(RB3LYP) = -76.431 A.U.\n",
                encoding="utf8",
            )
            with patch.dict(sys.modules, {"cclib": None}):
                response = handle_request({
                    "command": "import.preview",
                    "files": [{"name": source_path.name, "sourcePath": str(source_path)}],
                })
            parsed = response["data"]["files"][0]["parse"]
            self.assertFalse(parsed["parsed"])
            self.assertIsNone(parsed["energyGas"])
            self.assertIn("cclib_unavailable", [warning["code"] for warning in parsed["warnings"]])

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
        self.assertEqual(modes[0].source, "rxncanvas-text")
        self.assertAlmostEqual(modes[0].frequencyCm1, -423.12)
        self.assertEqual(len(modes[0].displacements), 3)
        self.assertEqual(modes[0].displacements[0].atomIndex, 0)

    def test_gaussian_vibration_index_preserves_multilink_blocks_partial_warnings_and_mode_numbering(self) -> None:
        source = "\n".join([
            " Frequencies --  -100.0000   200.0000",
            " Red. masses --      1.1000     2.2000",
            " Frc consts  --      0.1000     0.2000",
            " IR Inten    --     10.0000    20.0000",
            " Atom  AN      X      Y      Z        X      Y      Z",
            "   1   6     0.010  0.000  0.000    0.020  0.000  0.000",
            "   2   1    -0.010  0.000  0.000   -0.020  0.000  0.000",
            " Normal termination of Gaussian 16",
            " Link1:",
            " Frequencies --   300.0000",
            " Red. masses --      3.3000",
            " Frc consts  --      0.3000",
            " IR Inten    --     30.0000",
            " Atom  AN      X      Y      Z",
            "   1   6     0.030  0.000  0.000",
            "   2   1    -0.030  0.000  0.000",
            " Link1:",
            " Frequencies --   400.0000",
            " malformed frequency payload one",
            " Link1:",
            " Frequencies --   500.0000",
            " malformed frequency payload two",
        ])
        vibration_index = engine.gaussian_vibration_index(source)

        indexed_modes, indexed_warnings = engine.gaussian_vibrational_modes_from_text(
            vibration_index,
            2,
            "multilink.log",
        )
        string_modes, string_warnings = engine.gaussian_vibrational_modes_from_text(
            source,
            2,
            "multilink.log",
        )

        self.assertEqual(len(vibration_index.frequencyLineIndices), 4)
        self.assertTrue(vibration_index.hasFrequencyMarker)
        self.assertEqual(indexed_modes, string_modes)
        self.assertEqual(indexed_warnings, string_warnings)
        self.assertEqual([mode.frequencyCm1 for mode in indexed_modes], [-100.0, 200.0, 300.0])
        self.assertEqual([mode.modeIndex for mode in indexed_modes], [0, 1, 2])
        self.assertEqual(
            [mode.modeId for mode in indexed_modes],
            ["mode-1-imaginary-100.00", "mode-2-real-200.00", "mode-3-real-300.00"],
        )
        self.assertEqual([mode.reducedMassAmu for mode in indexed_modes], [1.1, 2.2, 3.3])
        self.assertEqual(
            [warning.code for warning in indexed_warnings],
            ["vibration_parse_partial", "vibration_parse_partial"],
        )

    def test_gaussian_vibration_index_supports_atom_count_mismatch_without_rebuilding(self) -> None:
        source = "\n".join([
            " Frequencies --   123.4500",
            " Atom  AN      X      Y      Z",
            "   1   6     0.010  0.000  0.000",
            "   2   1    -0.010  0.000  0.000",
        ])
        vibration_index = engine.gaussian_vibration_index(source)

        with patch.object(engine, "gaussian_vibration_index", wraps=engine.gaussian_vibration_index) as build_index:
            modes, warnings = engine.gaussian_vibrational_modes_from_text(
                vibration_index,
                3,
                "atom-mismatch.log",
            )

        self.assertEqual(build_index.call_count, 0)
        self.assertEqual(modes, ())
        self.assertEqual(
            [warning.code for warning in warnings],
            ["vibration_shape_mismatch", "vibration_parse_partial"],
        )
        self.assertEqual(warnings[0].message, "Vibration mode 1 displacement count does not match atom count.")

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
                scfenergies=[fake_cclib_scf_energy(-76.5)],
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
                parsed = parse_source_file("cclib-gaussian.log", str(source_path))
            finally:
                if previous is sentinel:
                    sys.modules.pop("cclib", None)
                else:
                    sys.modules["cclib"] = previous

        self.assertTrue(parsed.parsed)
        self.assertEqual(parsed.parserId, "gaussian-log-cclib+rxncanvas-text-full-file")
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

    def test_cclib_source_normalization_handles_gaussian_rotational_constant_overflow(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "overflow.log"
            source_path.write_text(
                "\n".join([
                    "Rotational constants (GHZ):      ************     0.59762     0.59762",
                    "     An expanding polynomial of degree 16 produced********",
                    "**********************************************************************",
                ]),
                encoding="utf8",
            )

            normalized_path = engine.normalized_cclib_source_path(str(source_path))
            try:
                normalized = Path(normalized_path).read_text(encoding="utf8")
            finally:
                Path(normalized_path).unlink(missing_ok=True)

        self.assertIn("Rotational constants (GHZ):      nan     0.59762     0.59762", normalized)
        self.assertIn("produced********", normalized)
        self.assertIn("**********************************************************************", normalized)

    def test_cclib_scf_conversion_preserves_large_gaussian_energy(self) -> None:
        expected = -1779.40423117
        fake_data = SimpleNamespace(scfenergies=[fake_cclib_scf_energy(expected)])

        actual = engine.cclib_last_scf_hartree(fake_data, fake_cclib_convertor)

        self.assertAlmostEqual(actual or 0, expected, places=10)

    def test_cclib_full_file_falls_back_to_gaussian_text_vibration_modes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "cclib-gaussian-text-vibrations.log"
            source_path.write_text(
                "\n".join([
                    "Entering Gaussian System",
                    "Stoichiometry H2O",
                    "Charge = 0 Multiplicity = 1",
                    *gaussian_orientation_lines([
                        (8, 0.0, 0.0, 0.0),
                        (1, 0.0, 0.0, 0.96),
                        (1, 0.92, 0.0, -0.24),
                    ]),
                    "SCF Done: E(RB3LYP) = -76.431000 A.U.",
                    "Frequencies -- -123.4000",
                    "Atom  AN      X      Y      Z",
                    "  1   8     0.010  0.000  0.000",
                    "  2   1    -0.010  0.000  0.000",
                    "  3   1     0.000  0.010  0.000",
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
                scfenergies=[fake_cclib_scf_energy(-76.5)],
                charge=0,
                mult=1,
                metadata={"methods": ["B3LYP"]},
            )
            fake_cclib = fake_cclib_module(fake_data)
            sentinel = object()
            previous = sys.modules.get("cclib", sentinel)
            sys.modules["cclib"] = fake_cclib
            try:
                parsed = parse_source_file("cclib-gaussian-text-vibrations.log", str(source_path))
            finally:
                if previous is sentinel:
                    sys.modules.pop("cclib", None)
                else:
                    sys.modules["cclib"] = previous

        modes = parsed.coordinatePreview.vibrationModes if parsed.coordinatePreview else ()
        self.assertEqual(len(modes), 1)
        self.assertEqual(modes[0].source, "rxncanvas-text")
        self.assertAlmostEqual(modes[0].frequencyCm1, -123.4)

    def test_cclib_full_file_reuses_one_gaussian_context_for_text_vibration_fallback(self) -> None:
        source = gaussian_cclib_context_text()
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "cclib-gaussian-context.log"
            source_path.write_text(source, encoding="utf8")
            fake_data = SimpleNamespace(
                atomnos=[8, 1, 1],
                atomcoords=[[[0.0, 0.0, 0.0], [0.0, 0.0, 0.96], [0.92, 0.0, -0.24]]],
                scfenergies=[fake_cclib_scf_energy(-76.5)],
                charge=0,
                mult=1,
                metadata={"methods": ["DFT"]},
            )
            fake_cclib = fake_cclib_module(fake_data)
            sentinel = object()
            previous = sys.modules.get("cclib", sentinel)
            sys.modules["cclib"] = fake_cclib
            try:
                with (
                    patch.object(engine, "gaussian_text_snapshot", wraps=engine.gaussian_text_snapshot) as snapshot,
                    patch.object(engine, "gaussian_vibration_index", wraps=engine.gaussian_vibration_index) as vibration_index,
                    patch.object(engine, "gaussian_vibrational_modes_from_text", wraps=engine.gaussian_vibrational_modes_from_text) as text_vibrations,
                    patch.object(engine, "computation_metadata_from_source", wraps=engine.computation_metadata_from_source) as computation_scan,
                ):
                    parsed = parse_source_file(source_path.name, str(source_path))
            finally:
                if previous is sentinel:
                    sys.modules.pop("cclib", None)
                else:
                    sys.modules["cclib"] = previous

        self.assertEqual(snapshot.call_count, 1)
        self.assertEqual(vibration_index.call_count, 1)
        self.assertEqual(text_vibrations.call_count, 2)
        first_vibration_args = text_vibrations.call_args_list[0].args
        fallback_vibration_args = text_vibrations.call_args_list[1].args
        self.assertIs(first_vibration_args[0], fallback_vibration_args[0])
        self.assertEqual(first_vibration_args[1], 2)
        self.assertEqual(fallback_vibration_args[1], 3)
        self.assertEqual(computation_scan.call_count, 0)
        self.assertEqual(parsed.method, "wb97xd/genecp")
        self.assertEqual(parsed.coordinatePreview.atomCount if parsed.coordinatePreview else 0, 3)
        modes = parsed.coordinatePreview.vibrationModes if parsed.coordinatePreview else ()
        self.assertEqual(len(modes), 1)
        self.assertEqual(len(modes[0].displacements), 3)
        self.assertEqual(modes[0].source, "rxncanvas-text")
        self.assertEqual(parsed.terminationStatus, "normal")
        self.assertEqual(parsed.jobCpuTime, "0d 0h 1m 2.3s")
        self.assertEqual(parsed.elapsedTime, "0d 0h 1m 3.4s")

    def test_cclib_full_file_skips_second_text_vibration_parse_when_cclib_has_modes(self) -> None:
        source = gaussian_cclib_context_text()
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "cclib-gaussian-vibrations.log"
            source_path.write_text(source, encoding="utf8")
            fake_data = SimpleNamespace(
                atomnos=[8, 1, 1],
                atomcoords=[[[0.0, 0.0, 0.0], [0.0, 0.0, 0.96], [0.92, 0.0, -0.24]]],
                scfenergies=[fake_cclib_scf_energy(-76.5)],
                vibfreqs=[-222.2],
                vibdisps=[[[0.02, 0.0, 0.0], [-0.02, 0.0, 0.0], [0.0, 0.02, 0.0]]],
                charge=0,
                mult=1,
                metadata={"methods": ["DFT"]},
            )
            fake_cclib = fake_cclib_module(fake_data)
            sentinel = object()
            previous = sys.modules.get("cclib", sentinel)
            sys.modules["cclib"] = fake_cclib
            try:
                with (
                    patch.object(engine, "gaussian_text_snapshot", wraps=engine.gaussian_text_snapshot) as snapshot,
                    patch.object(engine, "gaussian_vibration_index", wraps=engine.gaussian_vibration_index) as vibration_index,
                    patch.object(engine, "gaussian_vibrational_modes_from_text", wraps=engine.gaussian_vibrational_modes_from_text) as text_vibrations,
                ):
                    parsed = parse_source_file(source_path.name, str(source_path))
            finally:
                if previous is sentinel:
                    sys.modules.pop("cclib", None)
                else:
                    sys.modules["cclib"] = previous

        self.assertEqual(snapshot.call_count, 1)
        self.assertEqual(vibration_index.call_count, 1)
        self.assertEqual(text_vibrations.call_count, 1)
        modes = parsed.coordinatePreview.vibrationModes if parsed.coordinatePreview else ()
        self.assertEqual(len(modes), 1)
        self.assertAlmostEqual(modes[0].frequencyCm1, -222.2)
        self.assertEqual(modes[0].source, "cclib")

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
                scfenergies=[fake_cclib_scf_energy(-76.5)],
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
                parsed = parse_source_file("generic-dft.log", str(source_path))
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
                parsed = parse_source_file("cclib-missing-energy.log", str(source_path))
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
                scfenergies=[fake_cclib_scf_energy(-76.5)],
                freeenergy=-76.39,
                nbasis=7,
                metadata={"methods": ["B3LYP"]},
            )
            fake_cclib = fake_cclib_module(fake_data)
            sentinel = object()
            previous = sys.modules.get("cclib", sentinel)
            sys.modules["cclib"] = fake_cclib
            try:
                parsed = parse_source_file("cclib-missing-coordinates.log", str(source_path))
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
                parsed = parse_source_file("failed-gaussian.log", str(source_path))
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

    def test_engine_import_preview_preserves_orca_cross_line_regex_semantics(self) -> None:
        orca = parse_source_preview(
            "cross-line.out",
            "\n".join([
                "! B3LYP def2-SVP SP",
                "*",
                "xyz -2 3",
                "Number of basis functions :",
                "42",
                "Stoichiometry",
                "H2O",
                "FINAL SINGLE POINT ENERGY",
                "-10.000000",
                "SMD",
                "SOLVATION ENERGY =",
                "-0.200000",
            ]),
        )

        self.assertTrue(orca.parsed)
        self.assertEqual(orca.formula, "H2O")
        self.assertEqual(orca.method, "B3LYP def2-SVP SP")
        self.assertEqual(orca.candidates[0].charge, -2)
        self.assertEqual(orca.candidates[0].spinMultiplicity, 3)
        self.assertEqual(orca.energyGas, -10.0)
        self.assertEqual(orca.energySolution, -10.2)
        self.assertEqual(orca.energyTable.gasBasisFunctions if orca.energyTable else None, 42)

    def test_engine_import_preview_characterizes_large_orca_result(self) -> None:
        with patch("rxncanvas.engine.orca_text_snapshot", wraps=engine.orca_text_snapshot) as build_snapshot:
            parsed = parse_source_preview(
                "orca-large-characterization.out",
                large_orca_characterization_text(),
            )
        self.assertEqual(build_snapshot.call_count, 1)
        payload = json.loads(json.dumps(asdict(parsed)))
        warning = {
            "code": "vibration_unavailable",
            "message": "ORCA vibration data needs the full-file cclib parser or a recognized normal-mode block.",
            "target": "orca-large-characterization.out",
        }
        energy_table = {
            "egasHartree": -500.123456789,
            "gasBasisFunctions": 777,
            "ggasHartree": None,
            "ggas1mHartree": None,
            "ggasShermoHartree": None,
            "ggasShermo1mHartree": None,
            "esolHartree": None,
            "solBasisFunctions": None,
            "sgauTran": None,
            "swhitTran": None,
            "entropyDelta": None,
            "entropyCorrectionHartree": None,
            "standardStateCorrectionHartree": None,
            "gsolHartree": None,
        }
        coordinate_preview = {
            "atomCount": 7,
            "has3d": True,
            "elements": ["C", "H", "O"],
            "atoms": [
                {"element": "C", "x": 0.1, "y": 0.2, "z": 0.3},
                {"element": "O", "x": 1.1, "y": 1.2, "z": 1.3},
                {"element": "C", "x": -0.1, "y": -0.2, "z": -0.3},
                {"element": "H", "x": 2.1, "y": 2.2, "z": 2.3},
                {"element": "H", "x": -2.1, "y": -2.2, "z": -2.3},
                {"element": "H", "x": 3.1, "y": 3.2, "z": 3.3},
                {"element": "H", "x": -3.1, "y": -3.2, "z": -3.3},
            ],
            "vibrationModes": [],
            "previewKind": "text",
        }
        candidate = {
            "candidateId": "candidate-1-orca-large-characterization",
            "objectIndex": 0,
            "label": "orca-large-characterization",
            "formula": "C2H4O",
            "charge": -1,
            "spinMultiplicity": 2,
            "method": "UKS B3LYP D3BJ def2-TZVP",
            "energyGas": -500.123456789,
            "energySolution": -500.13580178899997,
            "energyUnit": "hartree",
            "coordinatePreview": coordinate_preview,
            "roleHint": "transition",
            "warnings": [warning],
            "energyTable": energy_table,
        }

        self.assertEqual(payload, {
            "label": "orca-large-characterization",
            "sourceKind": "ORCA",
            "formula": "C2H4O",
            "kind": "transition",
            "method": "UKS B3LYP D3BJ def2-TZVP",
            "solvent": "implicit solvent",
            "energyGas": -500.123456789,
            "energySolution": -500.13580178899997,
            "energyUnit": "hartree",
            "parsed": True,
            "parserId": "orca-output-text-preview",
            "parserVersion": "0.2.1",
            "objectCount": 1,
            "warnings": [warning],
            "candidates": [candidate],
            "coordinatePreview": coordinate_preview,
            "energyTable": energy_table,
            "parseScope": "preview",
            "confidence": "low",
            "terminationStatus": "normal",
            "terminationLabel": "normal",
            "jobCpuTime": None,
            "elapsedTime": "0d 1h 2m 3.4s",
        })

    def test_engine_import_preview_characterizes_large_gaussian_link1_result(self) -> None:
        source = large_gaussian_characterization_text()
        self.assertGreaterEqual(len(source), 150_000)
        self.assertLessEqual(len(source), 300_000)

        parsed = parse_source_preview("gaussian-large-characterization.log", source)
        payload = json.loads(json.dumps(asdict(parsed)))
        modes = payload["coordinatePreview"].pop("vibrationModes")
        candidate_modes = payload["candidates"][0]["coordinatePreview"].pop("vibrationModes")
        self.assertEqual(candidate_modes, modes)

        warning = {
            "code": "vibration_parse_partial",
            "message": "Gaussian frequency lines were found, but normal-mode displacements were not recognized.",
            "target": "gaussian-large-characterization.log",
        }
        energy_table = {
            "egasHartree": -500.123456789,
            "gasBasisFunctions": 777,
            "ggasHartree": -499.987654321,
            "ggas1mHartree": -499.984635321,
            "ggasShermoHartree": None,
            "ggasShermo1mHartree": None,
            "esolHartree": None,
            "solBasisFunctions": None,
            "sgauTran": None,
            "swhitTran": None,
            "entropyDelta": None,
            "entropyCorrectionHartree": None,
            "standardStateCorrectionHartree": 0.003019,
            "gsolHartree": None,
        }
        coordinate_preview = {
            "atomCount": 4,
            "has3d": True,
            "elements": ["C", "H", "O"],
            "atoms": [
                {"element": "C", "x": 0.1, "y": 0.2, "z": 0.3},
                {"element": "O", "x": 1.1, "y": 1.2, "z": 1.3},
                {"element": "H", "x": -0.1, "y": -0.2, "z": -0.3},
                {"element": "H", "x": 2.1, "y": 2.2, "z": 2.3},
            ],
            "previewKind": "text",
        }
        candidate = {
            "candidateId": "candidate-1-gaussian-large-characterization",
            "objectIndex": 0,
            "label": "gaussian-large-characterization",
            "formula": "C2H5NO",
            "charge": 2,
            "spinMultiplicity": 3,
            "method": "wb97xd",
            "energyGas": -500.123456789,
            "energySolution": -499.987654321,
            "energyUnit": "hartree",
            "coordinatePreview": coordinate_preview,
            "roleHint": "transition",
            "warnings": [warning],
            "energyTable": energy_table,
        }
        self.assertEqual(payload, {
            "label": "gaussian-large-characterization",
            "sourceKind": "Gaussian",
            "formula": "C2H5NO",
            "kind": "transition",
            "method": "wb97xd",
            "solvent": "Toluene",
            "energyGas": -500.123456789,
            "energySolution": -499.987654321,
            "energyUnit": "hartree",
            "parsed": True,
            "parserId": "gaussian-log-text-preview",
            "parserVersion": "0.2.1",
            "objectCount": 1,
            "warnings": [warning],
            "candidates": [candidate],
            "coordinatePreview": coordinate_preview,
            "energyTable": energy_table,
            "parseScope": "preview",
            "confidence": "low",
            "terminationStatus": "normal",
            "terminationLabel": "normal",
            "jobCpuTime": "1d 2h 3m 4.5s",
            "elapsedTime": "1d 2h 4m 5.6s",
        })
        self.assertEqual(len(modes), 3)
        self.assertEqual(modes[0], {
            "modeId": "mode-1-imaginary-423.12",
            "modeIndex": 0,
            "frequencyCm1": -423.12,
            "kind": "imaginary",
            "displacements": [
                {"atomIndex": 0, "dx": 0.01, "dy": 0.0, "dz": 0.0},
                {"atomIndex": 1, "dx": -0.01, "dy": 0.0, "dz": 0.0},
                {"atomIndex": 2, "dx": 0.0, "dy": 0.01, "dz": 0.0},
                {"atomIndex": 3, "dx": 0.0, "dy": -0.01, "dz": 0.0},
            ],
            "reducedMassAmu": 1.1,
            "forceConstant": 0.4,
            "irIntensityKmMol": 10.0,
            "ramanActivity": 4.0,
            "source": "rxncanvas-text",
        })

    def test_engine_import_preview_builds_one_gaussian_snapshot(self) -> None:
        source = large_gaussian_characterization_text(iterations=2)
        original = engine.gaussian_text_snapshot
        original_vibration_index = engine.gaussian_vibration_index

        with (
            patch.object(engine, "gaussian_text_snapshot", wraps=original) as snapshot,
            patch.object(engine, "gaussian_vibration_index", wraps=original_vibration_index) as vibration_index,
        ):
            parsed = parse_source_preview("gaussian-single-snapshot.log", source)

        self.assertTrue(parsed.parsed)
        self.assertEqual(parsed.sourceKind, "Gaussian")
        self.assertEqual(snapshot.call_count, 1)
        self.assertEqual(vibration_index.call_count, 1)

    def test_gaussian_snapshot_preserves_link1_first_last_and_valid_orientation_boundaries(self) -> None:
        source = "\n".join([
            "Entering Gaussian System",
            "#p wb97xd/def2tzvp opt=(ts,calcfc) scrf=(smd,solvent=toluene)",
            "Stoichiometry C2H6",
            "NBasis= 111 RedAO= T",
            "Charge = 0 Multiplicity = 1",
            *gaussian_orientation_lines([(6, 0.0, 0.0, 0.0), (1, 1.0, 0.0, 0.0)]),
            "SCF Done: E(RwB97XD) = -100.0 A.U.",
            "Normal termination of Gaussian 16",
            "Link1:",
            "#p m062x/def2svp freq scrf=(pcm,solvent=water)",
            "Stoichiometry H2O",
            "NBasis= 222 RedAO= T",
            "Charge = -2 Multiplicity = 3",
            *gaussian_orientation_lines([(8, 0.1, 0.2, 0.3), (1, 1.1, 1.2, 1.3)]),
            "SCF Done: E(UM06-2X) = -200.0 A.U.",
            "Thermal correction to Gibbs Free Energy = 0.25",
            "Standard orientation:",
            " ---------------------------------------------------------------------",
            " Center Atomic Atomic Coordinates",
            " ---------------------------------------------------------------------",
            " malformed trailing orientation",
        ])

        snapshot = engine.gaussian_text_snapshot(source)

        self.assertEqual(snapshot.scfEnergy, -200.0)
        self.assertEqual(snapshot.scfMethodLabel, "UM06-2X")
        self.assertEqual(snapshot.freeEnergy, None)
        self.assertEqual(snapshot.gibbsCorrection, 0.25)
        self.assertEqual(snapshot.basisFunctions, 111)
        self.assertEqual(snapshot.route, "wb97xd/def2tzvp opt=(ts,calcfc) scrf=(smd,solvent=toluene)")
        self.assertEqual(snapshot.method, "wb97xd")
        self.assertEqual(snapshot.methodBasis, "wb97xd/def2tzvp")
        self.assertEqual(snapshot.formula, "C2H6")
        self.assertEqual((snapshot.charge, snapshot.spinMultiplicity), (-2, 3))
        self.assertEqual(snapshot.solvent, "Toluene")
        self.assertEqual(tuple(atom.element for atom in snapshot.atoms), ("O", "H"))
        self.assertEqual(snapshot.computation.terminationStatus, "running")
        self.assertTrue(snapshot.continuationAfterNormal)
        self.assertEqual(engine.parse_gaussian(source), (-200.0, -199.75, "wb97xd"))
        self.assertEqual(engine.gaussian_method_basis_from_text(source), "wb97xd/def2tzvp")

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
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "desktop.xyz"
            source_path.write_text("2\nenergy=-100.0 hartree\nH 0 0 0\nH 0 0 0.7\n", encoding="utf8")
            preview = handle_request({
                "command": "import.preview",
                "files": [{"name": "desktop.xyz", "sourcePath": str(source_path)}],
            })
        self.assertTrue(preview["ok"])
        self.assertEqual(preview["data"]["files"][0]["parse"]["sourceKind"], "XYZ")
        self.assertEqual(preview["data"]["files"][0]["parse"]["energyGas"], -100.0)
        self.assertEqual(preview["data"]["files"][0]["parse"]["parseScope"], "full-file")

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
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / source_file["name"]
            source_path.write_text(source_file["preview"], encoding="utf8")
            preview = handle_request({
                "command": "import.preview",
                "files": [{**source_file, "sourcePath": str(source_path)}],
            })
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
        self.assertEqual(selected_object["parserId"], "maple-output-text-full-file")
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
                "packageKind": "rxncanvas-export-artifacts",
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

    def test_project_validation_reuses_and_invalidates_source_file_digest_cache(self) -> None:
        original_bytes = b"same-size-a"
        changed_bytes = b"same-size-b"
        project = sample_project_content({
            "files": [{
                "id": "file-1",
                "name": "desktop.log",
                "kind": "Gaussian",
                "size": len(original_bytes),
                "checksum": f"sha256:{hashlib.sha256(original_bytes).hexdigest()}",
                "status": "parsed",
                "preview": original_bytes.decode("utf8"),
                "storedPath": "sources/01-file-1-desktop.log",
            }],
        })

        with tempfile.TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir) / "Alpha Study"
            source_path = project_root / "sources" / "01-file-1-desktop.log"
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(original_bytes)
            (project_root / "exports").mkdir()
            (project_root / "exports" / "manifest.json").write_text(json.dumps({"artifacts": []}), encoding="utf8")
            engine._invalidate_sha256_file_cache(source_path)

            with patch("rxncanvas.engine._compute_sha256_file", wraps=engine._compute_sha256_file) as compute_digest:
                first = validate_project_content(json.dumps(project), project_root)
                second = validate_project_content(json.dumps(project), project_root)
                self.assertEqual([], first["issues"])
                self.assertEqual([], second["issues"])
                self.assertEqual(1, compute_digest.call_count)

                previous_mtime_ns = source_path.stat().st_mtime_ns
                source_path.write_bytes(changed_bytes)
                os.utime(source_path, ns=(previous_mtime_ns + 1_000_000, previous_mtime_ns + 1_000_000))
                changed = validate_project_content(json.dumps(project), project_root)
                self.assertIn("source_checksum_mismatch", {issue["code"] for issue in changed["issues"]})
                self.assertEqual(2, compute_digest.call_count)

                replacement_path = source_path.with_suffix(".replacement")
                replacement_path.write_bytes(original_bytes)
                replacement_path.replace(source_path)
                replaced = validate_project_content(json.dumps(project), project_root)
                self.assertNotIn("source_checksum_mismatch", {issue["code"] for issue in replaced["issues"]})
                self.assertEqual(3, compute_digest.call_count)

                source_path.unlink()
                missing = validate_project_content(json.dumps(project), project_root)
                self.assertIn("source_missing", {issue["code"] for issue in missing["issues"]})
                absolute_source_path = str(source_path.resolve())
                self.assertFalse(any(fingerprint[0] == absolute_source_path for fingerprint in engine._SHA256_FILE_DIGEST_CACHE))

    def test_project_validation_checks_export_artifact_manifest(self) -> None:
        artifact_bytes = b"png-bytes"
        project = sample_project_content()

        with tempfile.TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir) / "Alpha Study"
            export_path = project_root / "exports" / "rxncanvas-profile.png"
            export_path.parent.mkdir(parents=True)
            export_path.write_bytes(artifact_bytes)
            (project_root / "exports" / "manifest.json").write_text(json.dumps({
                "schemaVersion": 1,
                "packageKind": "rxncanvas-export-artifacts",
                "artifacts": [{
                    "id": "artifact-rxncanvas-profile",
                    "fileName": "rxncanvas-profile.png",
                    "path": "exports/rxncanvas-profile.png",
                    "mimeType": "image/png",
                    "size": len(artifact_bytes),
                    "checksum": f"sha256:{'0' * 64}",
                }],
            }), encoding="utf8")

            validation = validate_project_content(json.dumps(project), project_root)
            self.assertTrue(validation["valid"])
            self.assertIn("artifact_checksum_mismatch", {issue["code"] for issue in validation["issues"]})

    def test_project_validation_reuses_and_invalidates_export_artifact_digest_cache(self) -> None:
        artifact_bytes = b"png-bytes"
        project = sample_project_content()

        with tempfile.TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir) / "Alpha Study"
            export_path = project_root / "exports" / "rxncanvas-profile.png"
            export_path.parent.mkdir(parents=True)
            export_path.write_bytes(artifact_bytes)
            (project_root / "exports" / "manifest.json").write_text(json.dumps({
                "artifacts": [{
                    "path": "exports/rxncanvas-profile.png",
                    "size": len(artifact_bytes),
                    "checksum": f"sha256:{hashlib.sha256(artifact_bytes).hexdigest()}",
                }],
            }), encoding="utf8")
            engine._invalidate_sha256_file_cache(export_path)

            with patch("rxncanvas.engine._compute_sha256_file", wraps=engine._compute_sha256_file) as compute_digest:
                first = validate_project_content(json.dumps(project), project_root)
                second = validate_project_content(json.dumps(project), project_root)
                self.assertNotIn("artifact_checksum_mismatch", {issue["code"] for issue in first["issues"]})
                self.assertNotIn("artifact_checksum_mismatch", {issue["code"] for issue in second["issues"]})
                self.assertEqual(1, compute_digest.call_count)

                export_path.unlink()
                missing = validate_project_content(json.dumps(project), project_root)
                self.assertIn("artifact_missing", {issue["code"] for issue in missing["issues"]})
                absolute_export_path = str(export_path.resolve())
                self.assertFalse(any(fingerprint[0] == absolute_export_path for fingerprint in engine._SHA256_FILE_DIGEST_CACHE))

    def test_sha256_file_digest_cache_has_bounded_lru_capacity(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_root = Path(temp_dir)
            paths = []
            for index in range(engine.SHA256_FILE_CACHE_CAPACITY + 1):
                path = cache_root / f"artifact-{index}.bin"
                path.write_bytes(str(index).encode("ascii"))
                paths.append(path)
                engine.sha256_file(path)

            self.assertEqual(engine.SHA256_FILE_CACHE_CAPACITY, len(engine._SHA256_FILE_DIGEST_CACHE))
            cached_paths = {fingerprint[0] for fingerprint in engine._SHA256_FILE_DIGEST_CACHE}
            self.assertNotIn(str(paths[0].resolve()), cached_paths)
            self.assertIn(str(paths[-1].resolve()), cached_paths)

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
            self.assertTrue((Path(project_path) / ".rxncanvas" / "manifest.json").exists())
            self.assertTrue((Path(project_path) / "exports" / "manifest.json").exists())
            self.assertNotIn("sourcePath", saved["data"]["content"])
            saved_package = json.loads(saved["data"]["content"])
            self.assertNotIn("checksum", saved_package["files"][0])
            self.assertFalse((Path(project_path) / "sources" / "01-file-1-desktop.log").exists())
            self.assertIn("source_missing", {issue["code"] for issue in saved["data"]["validation"]["issues"]})
            self.assertEqual(saved_package["importLedger"]["entries"][0]["registeredNodeIds"], ["node-1"])

            opened = handle_request({"command": "project.open", "projectPath": project_path})
            self.assertTrue(opened["ok"])
            self.assertTrue(opened["data"]["validation"]["valid"])
            self.assertEqual(opened["data"]["validation"]["summary"]["nodeCount"], 1)
            self.assertIn("source_missing", {issue["code"] for issue in opened["data"]["validation"]["issues"]})

        invalid = handle_request({"command": "project.save", "projectPath": "", "content": content})
        self.assertFalse(invalid["ok"])
        self.assertEqual(invalid["error"]["code"], "invalid_input")

    def test_project_save_preserves_full_source_and_never_materializes_preview(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "Preview Study"
            stored_path = "sources/full.log"
            source_path = project_path / stored_path
            source_path.parent.mkdir(parents=True, exist_ok=True)
            source_path.write_text("complete source bytes", encoding="utf8")
            project = sample_project_content({
                "files": [{
                    "id": "full-source",
                    "name": "full.log",
                    "kind": "Gaussian",
                    "size": 900_100,
                    "status": "parsed",
                    "preview": "head\n[... RxnCanvas preview skipped 900000 bytes ...]\ntail",
                    "storedPath": stored_path,
                    "parse": {"parsed": True},
                }],
            })

            saved = handle_request({
                "command": "project.save",
                "projectPath": str(project_path),
                "content": json.dumps(project),
            })
            saved_file = json.loads(saved["data"]["content"])["files"][0]

            self.assertTrue(saved["ok"])
            self.assertEqual("complete source bytes", source_path.read_text(encoding="utf8"))
            self.assertEqual(len("complete source bytes"), saved_file["size"])
            self.assertTrue(saved_file["checksum"].startswith("sha256:"))

            source_path.unlink()
            missing = handle_request({
                "command": "project.save",
                "projectPath": str(project_path),
                "content": json.dumps(project),
            })
            missing_file = json.loads(missing["data"]["content"])["files"][0]
            self.assertTrue(missing["ok"])
            self.assertFalse(source_path.exists())
            self.assertNotIn("checksum", missing_file)
            self.assertIn("source_missing", {issue["code"] for issue in missing["data"]["validation"]["issues"]})

    def test_project_save_drops_missing_stored_path_from_pending_preview(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir) / "Pending Preview Study"
            project = sample_project_content({
                "files": [{
                    "id": "pending-source",
                    "name": "pending.log",
                    "kind": "Gaussian",
                    "size": 800_000,
                    "status": "staged",
                    "preview": "sampled preview",
                    "storedPath": "sources/pending.log",
                    "parse": {"parsed": False, "warnings": [{"code": "parse_deferred", "message": "waiting"}]},
                }],
            })

            saved = handle_request({
                "command": "project.save",
                "projectPath": str(project_path),
                "content": json.dumps(project),
            })
            saved_file = json.loads(saved["data"]["content"])["files"][0]

            self.assertTrue(saved["ok"])
            self.assertNotIn("storedPath", saved_file)
            self.assertNotIn("checksum", saved_file)
            self.assertFalse((project_path / "sources" / "pending.log").exists())


def sample_project_content(overrides: dict[str, object] | None = None) -> dict[str, object]:
    project = {
        "schemaVersion": 1,
        "packageKind": "rxncanvas-project",
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
