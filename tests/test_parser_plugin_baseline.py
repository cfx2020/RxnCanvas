from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from tempfile import TemporaryDirectory
import unittest

import numpy as np

from rxnflow.constants import EV_TO_HARTREE
from rxnflow.models import ChemicalObjectDraft, Provenance
from rxnflow.parsers import (
    ParseOptions,
    ParseResult,
    ParserCapability,
    ParserRegistry,
    RawFile,
)
from rxnflow.parsers.cclib_adapter import GaussianLogPlugin, OrcaOutputPlugin
from rxnflow.parsers.maple import MapleOutputPlugin
from rxnflow.parsers.xyz import XyzPlugin
from rxnflow.result import ok


class FakePlugin:
    id = "fake"
    version = "0.1.0"

    def __init__(self, capability: ParserCapability) -> None:
        self._capability = capability

    def can_parse(self, raw_file: RawFile) -> ParserCapability:
        return self._capability

    def parse(self, raw_file: RawFile, options: ParseOptions | None = None):
        return ok(
            ParseResult(
                objects=(ChemicalObjectDraft(label=raw_file.name),),
                provenance=Provenance(raw_file.id, self.id, self.version, "2026-05-02T00:00:00Z"),
            )
        )


class ParserPluginBaselineTest(unittest.TestCase):
    def test_fake_plugin_round_trips_parse_result(self) -> None:
        registry = ParserRegistry((FakePlugin(ParserCapability(True, "xyz", 0.8)),))

        result = registry.parse(RawFile(id="raw", name="raw.xyz", content="fixture"))

        self.assertTrue(result.ok, result.error)
        self.assertEqual(result.value.objects[0].label, "raw.xyz")  # type: ignore[union-attr]
        self.assertEqual(result.value.provenance.parser_id, "fake")  # type: ignore[union-attr]

    def test_registry_returns_unsupported_format_for_no_candidates(self) -> None:
        result = ParserRegistry.default().parse(
            RawFile(id="raw-note", name="note.txt", content="not a chemistry output")
        )

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "unsupported_format")

    def test_registry_rejects_ambiguous_high_confidence_candidates(self) -> None:
        registry = ParserRegistry(
            (
                FakePlugin(ParserCapability(True, "xyz", 0.9)),
                FakePlugin(ParserCapability(True, "xyz", 0.9)),
            )
        )

        result = registry.parse(RawFile(id="raw", name="raw.xyz", content="fixture"))

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "unsupported_format")
        self.assertEqual(result.warnings[0].code, "ambiguous_format")

    def test_registry_missing_path_returns_invalid_input(self) -> None:
        with TemporaryDirectory() as tmp:
            result = ParserRegistry.default().parse(
                RawFile(id="raw-missing", name="missing.xyz", path=Path(tmp) / "missing.xyz")
            )

            self.assertFalse(result.ok)
            self.assertIsNotNone(result.error)
            assert result.error is not None
            self.assertEqual(result.error.code, "invalid_input")

    def test_standard_xyz_content_parses_geometry(self) -> None:
        result = XyzPlugin().parse(
            RawFile(
                id="raw-water",
                name="water.xyz",
                content="3\nwater\nO 0 0 0\nH 0 0 0.96\nH 0.92 0 0\n",
            )
        )

        self.assertTrue(result.ok, result.error)
        draft = result.value.objects[0]  # type: ignore[union-attr]
        self.assertEqual(draft.geometry[0].element, "O")
        self.assertEqual(draft.geometry[0].unit, "angstrom")
        self.assertEqual(result.value.provenance.source_file_id, "raw-water")  # type: ignore[union-attr]
        self.assertIn("missing_section", {warning.code for warning in result.warnings})

    def test_extxyz_parses_energy_metadata(self) -> None:
        result = XyzPlugin().parse(
            RawFile(
                id="raw-extxyz",
                name="water.xyz",
                content=(
                    '2\nProperties=species:S:1:pos:R:3 energy=-1.5 charge=0 pbc="F F F"\n'
                    "H 0 0 0\nH 0 0 0.74\n"
                ),
            )
        )

        self.assertTrue(result.ok, result.error)
        draft = result.value.objects[0]  # type: ignore[union-attr]
        self.assertEqual(len(draft.geometry), 2)
        self.assertAlmostEqual(draft.energies["electronic"].value, -1.5 * EV_TO_HARTREE)
        self.assertEqual(draft.energies["electronic"].unit, "hartree")

    def test_xyz_atom_count_mismatch_returns_parse_failed(self) -> None:
        result = XyzPlugin().parse(
            RawFile(id="raw-bad", name="bad.xyz", content="3\nbad\nH 0 0 0\n")
        )

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "parse_failed")

    def test_gaussian_cclib_adapter_maps_basic_fields(self) -> None:
        result = GaussianLogPlugin(backend=_fake_cclib_data).parse(
            RawFile(id="raw-gaussian", name="gaussian.log", content="Gaussian")
        )

        self.assertTrue(result.ok, result.error)
        draft = result.value.objects[0]  # type: ignore[union-attr]
        self.assertEqual(draft.charge, 0)
        self.assertEqual(draft.spin_multiplicity, 1)
        self.assertEqual(draft.method, "B3LYP")
        self.assertEqual(draft.geometry[0].element, "O")
        self.assertAlmostEqual(draft.energies["electronic"].value, -75.0, places=8)
        self.assertEqual(result.value.provenance.parser_id, "gaussian-log-cclib")  # type: ignore[union-attr]

    def test_orca_cclib_adapter_maps_basic_fields(self) -> None:
        result = OrcaOutputPlugin(backend=_fake_cclib_data).parse(
            RawFile(id="raw-orca", name="orca.out", content="O   R   C   A")
        )

        self.assertTrue(result.ok, result.error)
        self.assertEqual(result.value.provenance.parser_id, "orca-output-cclib")  # type: ignore[union-attr]
        self.assertAlmostEqual(
            result.value.objects[0].energies["electronic"].value,  # type: ignore[union-attr]
            -75.0,
            places=8,
        )

    def test_cclib_adapter_backend_exception_returns_parse_failed(self) -> None:
        def failing_backend(raw_file: RawFile):
            raise ValueError("bad output")

        result = GaussianLogPlugin(backend=failing_backend).parse(
            RawFile(id="raw-gaussian", name="gaussian.log", content="Gaussian")
        )

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "parse_failed")

    def test_maple_sp_output_parses_task_model_geometry_and_energy(self) -> None:
        result = MapleOutputPlugin().parse(
            RawFile(
                id="raw-maple-sp",
                name="sp.out",
                content=(
                    "M   A   P   L   E\n"
                    "Task: sp\n"
                    "model          : ani2x\n"
                    "1 C 0.0 0.0 0.0\n"
                    "2 H 0.0 0.0 1.0\n"
                    "Energy: -14.0923448397 Hartree\n"
                ),
            )
        )

        self.assertTrue(result.ok, result.error)
        draft = result.value.objects[0]  # type: ignore[union-attr]
        self.assertEqual(draft.label, "MAPLE sp")
        self.assertEqual(draft.method, "sp ani2x")
        self.assertEqual(len(draft.geometry), 2)
        self.assertEqual(draft.energies["electronic"].unit, "hartree")
        self.assertEqual(result.value.provenance.parser_id, "maple-output")  # type: ignore[union-attr]

    def test_maple_multi_frame_xyz_parses_each_image(self) -> None:
        result = MapleOutputPlugin().parse(
            RawFile(
                id="raw-maple-mep",
                name="mep.xyz",
                content=(
                    "2\nImage 0  Energy = -1.23\nC 0 0 0\nH 0 0 1\n"
                    "2\nFrame 1  Energy = -1.24 Hartree\nC 0 0 0\nH 0 0 1.1\n"
                ),
            )
        )

        self.assertTrue(result.ok, result.error)
        objects = result.value.objects  # type: ignore[union-attr]
        self.assertEqual(len(objects), 2)
        self.assertEqual(objects[0].label, "Image 0")
        self.assertEqual(objects[1].label, "Frame 1")
        self.assertEqual(objects[0].energies["electronic"].unit, "hartree")

    def test_maple_parser_does_not_run_maple_or_project_store(self) -> None:
        parser_sources = "\n".join(
            path.read_text(encoding="utf-8")
            for path in Path("rxnflow/parsers").glob("*.py")
        )

        self.assertNotIn("save_project", parser_sources)
        self.assertNotIn("ProjectStore", parser_sources)
        self.assertNotIn("ChemicalObject(", parser_sources)
        self.assertNotIn("ReactionGraph", parser_sources)
        self.assertNotIn("EnergyProfile", parser_sources)
        self.assertNotIn("subprocess", parser_sources)
        self.assertNotIn("torch", parser_sources)


def _fake_cclib_data(raw_file: RawFile):
    return SimpleNamespace(
        atomcoords=np.array([[[0.0, 0.0, 0.0], [0.0, 0.0, 0.96]]]),
        atomnos=np.array([8, 1]),
        charge=0,
        mult=1,
        scfenergies=np.array([-75.0 / EV_TO_HARTREE]),
        metadata={"methods": ["B3LYP"]},
    )


if __name__ == "__main__":
    unittest.main()
