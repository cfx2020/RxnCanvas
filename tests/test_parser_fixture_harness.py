from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from tempfile import TemporaryDirectory
import json
import unittest

from rxnflow.constants import EV_TO_HARTREE
from rxnflow.parsers import ParserRegistry, RawFile
from rxnflow.parsers.cclib_adapter import GaussianLogPlugin, OrcaOutputPlugin
from rxnflow.parsers.maple import MapleOutputPlugin

from tests.parser_fixture_harness import (
    assert_parser_fixture_snapshot,
    load_parser_fixture_manifest,
    load_parser_support_matrix,
    project_parser_fixture_snapshot,
)


FIXTURE_MANIFEST = Path("tests/fixtures/parsers/manifest.yaml")
SUPPORT_MATRIX = Path("tests/fixtures/parsers/support-matrix.yaml")


class ParserFixtureHarnessTest(unittest.TestCase):
    def test_manifest_loads_synthetic_fixture_and_parse_options(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        self.assertEqual(len(manifest.fixtures), 9)
        fixture = _fixture_by_id(manifest, "maple-sp-synthetic-minimal")
        self.assertEqual(fixture.id, "maple-sp-synthetic-minimal")
        self.assertEqual(fixture.source.kind, "synthetic")
        self.assertTrue(fixture.source.redistributable)
        self.assertEqual(fixture.source.redaction, "none")
        self.assertEqual(fixture.parse_options.expected_format, "maple-output")
        self.assertTrue(fixture.parse_options.strict)
        self.assertEqual(fixture.parse_options.frame_policy, "all")
        self.assertTrue(fixture.file.is_file())

    def test_support_matrix_loads_and_covers_fixture_manifest(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        matrix = load_parser_support_matrix(SUPPORT_MATRIX, manifest)

        self.assertEqual(len(matrix.entries), 10)
        self.assertEqual(matrix.covered_fixture_ids(), {fixture.id for fixture in manifest.fixtures})
        self.assertIn("missing_section", matrix.diagnostics.warning_codes)
        self.assertIn("unit_assumed", matrix.diagnostics.warning_codes)
        self.assertIn("parse_failed", matrix.diagnostics.error_codes)
        partial_entries = [entry for entry in matrix.entries if entry.status == "partial"]
        self.assertTrue(partial_entries)
        for entry in partial_entries:
            self.assertTrue(entry.known_limits, entry.id)

    def test_support_matrix_catalogs_snapshot_warning_and_error_codes(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        matrix = load_parser_support_matrix(SUPPORT_MATRIX, manifest)

        warning_codes = set(matrix.diagnostics.warning_codes)
        error_codes = set(matrix.diagnostics.error_codes)
        for fixture in manifest.fixtures:
            snapshot = json.loads(fixture.expected_snapshot.read_text(encoding="utf-8"))
            for code in snapshot.get("warning_codes", ()):
                self.assertIn(code, warning_codes, fixture.id)
            if not snapshot.get("parse_ok", False):
                self.assertIn(snapshot["error"]["code"], error_codes, fixture.id)

    def test_support_matrix_reference_only_artifacts_are_not_executable(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        matrix = load_parser_support_matrix(SUPPORT_MATRIX, manifest)

        reference_only_ids = {entry.id for entry in matrix.reference_only_entries()}
        self.assertIn("maple-sum-reference", reference_only_ids)
        self.assertIn("maple-autoneb-tree-reference", reference_only_ids)
        self.assertIn("maple-md-thermo-reference", reference_only_ids)
        executable_ids = {fixture.id for fixture in manifest.executable_fixtures()}
        for entry in matrix.reference_only_entries():
            self.assertEqual(entry.fixture_ids, ())
            self.assertTrue(set(entry.formats).isdisjoint(executable_ids))

    def test_maple_manifest_entries_and_executable_status(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        sp = _fixture_by_id(manifest, "maple-sp-synthetic-minimal")
        opt = _fixture_by_id(manifest, "maple-opt-synthetic-minimal")
        path = _fixture_by_id(manifest, "maple-irc-path-synthetic-minimal")
        executable_ids = {fixture.id for fixture in manifest.executable_fixtures()}

        self.assertEqual(sp.support_status, "supported")
        self.assertEqual(opt.program, "maple")
        self.assertEqual(opt.format, "maple-output")
        self.assertEqual(opt.task, "opt")
        self.assertEqual(opt.parser_id, "maple-output")
        self.assertEqual(opt.support_status, "supported")
        self.assertEqual(path.format, "maple-xyz")
        self.assertEqual(path.task, "irc-path")
        self.assertEqual(path.support_status, "partial")
        self.assertIn(opt.id, executable_ids)
        self.assertIn(path.id, executable_ids)

    def test_xyz_extxyz_manifest_entries_and_executable_status(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        xyz = _fixture_by_id(manifest, "xyz-water-geometry-missing-energy")
        extxyz = _fixture_by_id(manifest, "extxyz-h2-energy-charge-spin")
        partial = _fixture_by_id(manifest, "extxyz-h2-missing-energy")
        bad = _fixture_by_id(manifest, "xyz-bad-atom-count")
        executable_ids = {fixture.id for fixture in manifest.executable_fixtures()}

        self.assertEqual(xyz.source.kind, "synthetic")
        self.assertEqual(xyz.support_status, "supported")
        self.assertEqual(extxyz.format, "extxyz")
        self.assertEqual(extxyz.support_status, "supported")
        self.assertEqual(partial.support_status, "partial")
        self.assertEqual(bad.support_status, "unsupported")
        self.assertIn(xyz.id, executable_ids)
        self.assertIn(extxyz.id, executable_ids)
        self.assertIn(partial.id, executable_ids)
        self.assertNotIn(bad.id, executable_ids)

    def test_gaussian_manifest_entry_and_executable_status(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        gaussian = _fixture_by_id(manifest, "gaussian-sp-water-synthetic-minimal")
        executable_ids = {fixture.id for fixture in manifest.executable_fixtures()}

        self.assertEqual(gaussian.program, "gaussian")
        self.assertEqual(gaussian.format, "gaussian-log")
        self.assertEqual(gaussian.parser_id, "gaussian-log-cclib")
        self.assertEqual(gaussian.parse_options.expected_format, "gaussian-log")
        self.assertEqual(gaussian.source.kind, "synthetic")
        self.assertEqual(gaussian.support_status, "supported")
        self.assertTrue(gaussian.file.is_file())
        self.assertIn(gaussian.id, executable_ids)

    def test_orca_manifest_entry_and_executable_status(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        orca = _fixture_by_id(manifest, "orca-sp-water-synthetic-minimal")
        executable_ids = {fixture.id for fixture in manifest.executable_fixtures()}

        self.assertEqual(orca.program, "orca")
        self.assertEqual(orca.format, "orca-output")
        self.assertEqual(orca.parser_id, "orca-output-cclib")
        self.assertEqual(orca.parse_options.expected_format, "orca-output")
        self.assertEqual(orca.source.kind, "synthetic")
        self.assertEqual(orca.support_status, "supported")
        self.assertTrue(orca.file.is_file())
        self.assertIn(orca.id, executable_ids)

    def test_snapshot_projection_matches_golden_snapshot(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        fixture = manifest.fixtures[0]

        actual = project_parser_fixture_snapshot(ParserRegistry.default(), fixture)
        expected = json.loads(fixture.expected_snapshot.read_text(encoding="utf-8"))

        self.assertEqual(actual, expected)
        self.assertTrue(actual["parse_ok"])
        self.assertEqual(actual["parser_id"], fixture.parser_id)
        self.assertEqual(actual["object_count"], 1)
        self.assertEqual(actual["objects"][0]["energy_keys"], ["electronic"])

    def test_snapshot_assertion_passes_default_registry_without_writing(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        fixture = manifest.fixtures[0]
        before = fixture.expected_snapshot.read_text(encoding="utf-8")

        assert_parser_fixture_snapshot(ParserRegistry.default(), fixture)

        self.assertEqual(fixture.expected_snapshot.read_text(encoding="utf-8"), before)

    def test_executable_fixtures_match_golden_snapshots(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        for fixture in manifest.executable_fixtures():
            with self.subTest(fixture=fixture.id):
                assert_parser_fixture_snapshot(ParserRegistry.default(), fixture)

    def test_xyz_extxyz_snapshots_cover_expected_fields(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        xyz = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "xyz-water-geometry-missing-energy"),
        )
        extxyz = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "extxyz-h2-energy-charge-spin"),
        )
        missing = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "extxyz-h2-missing-energy"),
        )

        self.assertTrue(xyz["parse_ok"])
        self.assertEqual(xyz["object_count"], 1)
        self.assertEqual(xyz["objects"][0]["elements"], ["O", "H", "H"])
        self.assertEqual(xyz["warning_codes"], ["missing_section"])

        self.assertTrue(extxyz["parse_ok"])
        extxyz_object = extxyz["objects"][0]
        self.assertEqual(extxyz_object["label"], "h2-extxyz")
        self.assertEqual(extxyz_object["charge"], 0)
        self.assertEqual(extxyz_object["spin_multiplicity"], 1)
        self.assertEqual(extxyz_object["energy_keys"], ["electronic"])
        self.assertAlmostEqual(
            extxyz_object["energies"]["electronic"]["value"],
            -1.5 * EV_TO_HARTREE,
        )
        self.assertEqual(extxyz["warning_codes"], ["unit_assumed"])

        self.assertTrue(missing["parse_ok"])
        self.assertEqual(missing["objects"][0]["energies"], {})
        self.assertEqual(missing["warning_codes"], ["missing_section"])

    def test_maple_snapshots_cover_expected_fields(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        opt = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "maple-opt-synthetic-minimal"),
        )
        path = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "maple-irc-path-synthetic-minimal"),
        )

        self.assertTrue(opt["parse_ok"])
        self.assertEqual(opt["object_count"], 1)
        opt_object = opt["objects"][0]
        self.assertEqual(opt_object["label"], "MAPLE opt")
        self.assertEqual(opt_object["method"], "opt ani2x")
        self.assertEqual(opt_object["elements"], ["C", "H"])
        self.assertEqual(opt_object["geometry_sample"][0]["element"], "C")
        self.assertEqual(opt_object["energy_keys"], ["electronic"])
        self.assertEqual(opt_object["energies"]["electronic"]["unit"], "hartree")
        self.assertAlmostEqual(opt_object["energies"]["electronic"]["value"], -14.123456789)
        self.assertEqual(opt_object["thermochemistry_keys"], [])
        self.assertEqual(opt["warning_codes"], [])

        self.assertTrue(path["parse_ok"])
        self.assertEqual(path["object_count"], 3)
        self.assertEqual(
            [obj["label"] for obj in path["objects"]],
            ["Image 0", "Iter 1 Image 1", "Iteration 7"],
        )
        self.assertEqual([obj["energy_keys"] for obj in path["objects"]], [["electronic"]] * 3)
        self.assertEqual(path["objects"][2]["geometry_sample"][0]["element"], "C")
        self.assertEqual(path["warning_codes"], [])

    def test_maple_path_comment_variants_are_detected_by_maple_plugin(self) -> None:
        cases = {
            "image": "2\nImage 0  Energy = -1.0\nC 0 0 0\nH 0 0 1\n",
            "iter-image": "2\nIter 1 Image 0  Energy = -1.0\nC 0 0 0\nH 0 0 1\n",
            "iteration": "2\nIteration 7  Energy = -1.0\nC 0 0 0\nH 0 0 1\n",
        }
        plugin = MapleOutputPlugin()
        for name, content in cases.items():
            with self.subTest(name=name):
                capability = plugin.can_parse(RawFile(id=name, name=f"{name}.xyz", content=content))
                self.assertTrue(capability.supported)
                self.assertEqual(capability.format, "maple-xyz")

    def test_gaussian_snapshot_covers_expected_fields(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        gaussian = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "gaussian-sp-water-synthetic-minimal"),
        )

        self.assertTrue(gaussian["parse_ok"])
        self.assertEqual(gaussian["object_count"], 1)
        self.assertEqual(gaussian["provenance"]["parser_id"], "gaussian-log-cclib")
        gaussian_object = gaussian["objects"][0]
        self.assertEqual(gaussian_object["label"], "gaussian-sp-water-synthetic-minimal.log")
        self.assertEqual(gaussian_object["charge"], 0)
        self.assertEqual(gaussian_object["spin_multiplicity"], 1)
        self.assertEqual(gaussian_object["method"], "B3LYP")
        self.assertEqual(gaussian_object["elements"], ["O", "H"])
        self.assertEqual(gaussian_object["atom_count"], 2)
        self.assertEqual(gaussian_object["geometry_sample"][0]["element"], "O")
        self.assertEqual(gaussian_object["energy_keys"], ["electronic"])
        self.assertEqual(
            gaussian_object["energies"]["electronic"]["reference"],
            "cclib scfenergies converted from eV",
        )
        self.assertEqual(gaussian_object["energies"]["electronic"]["unit"], "hartree")
        self.assertAlmostEqual(
            gaussian_object["energies"]["electronic"]["value"],
            -74.99999670361889,
        )
        self.assertEqual(gaussian_object["thermochemistry_keys"], [])
        self.assertEqual(gaussian["warning_codes"], [])

    def test_orca_snapshot_covers_expected_fields(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        orca = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "orca-sp-water-synthetic-minimal"),
        )

        self.assertTrue(orca["parse_ok"])
        self.assertEqual(orca["object_count"], 1)
        self.assertEqual(orca["provenance"]["parser_id"], "orca-output-cclib")
        orca_object = orca["objects"][0]
        self.assertEqual(orca_object["label"], "orca-sp-water-synthetic-minimal.out")
        self.assertEqual(orca_object["charge"], 0)
        self.assertEqual(orca_object["spin_multiplicity"], 1)
        self.assertEqual(orca_object["method"], "B3LYP")
        self.assertEqual(orca_object["elements"], ["O", "H", "H"])
        self.assertEqual(orca_object["atom_count"], 3)
        self.assertEqual(orca_object["geometry_sample"][0]["element"], "O")
        self.assertEqual(orca_object["energy_keys"], ["electronic"])
        self.assertEqual(
            orca_object["energies"]["electronic"]["reference"],
            "cclib scfenergies converted from eV",
        )
        self.assertEqual(orca_object["energies"]["electronic"]["unit"], "hartree")
        self.assertAlmostEqual(
            orca_object["energies"]["electronic"]["value"],
            -76.34567554447393,
        )
        self.assertEqual(orca_object["thermochemistry_keys"], [])
        self.assertEqual(orca["warning_codes"], [])

    def test_bad_xyz_count_expected_error_snapshot(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        bad = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "xyz-bad-atom-count"),
        )

        self.assertFalse(bad["parse_ok"])
        self.assertEqual(bad["error"]["code"], "parse_failed")
        expected = json.loads(
            _fixture_by_id(manifest, "xyz-bad-atom-count").expected_snapshot.read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(bad, expected)

    def test_gaussian_missing_geometry_expected_error(self) -> None:
        def missing_geometry_backend(raw_file: RawFile):
            return SimpleNamespace(
                atomnos=(8, 1),
                charge=0,
                mult=1,
                scfenergies=(-75.0 / EV_TO_HARTREE,),
                metadata={"methods": ["DFT"], "functional": "B3LYP"},
            )

        result = GaussianLogPlugin(backend=missing_geometry_backend).parse(
            RawFile(id="gaussian-missing-geometry", name="missing-geometry.log", content="Gaussian")
        )

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "parse_failed")
        self.assertIn("atomcoords", result.error.message)

    def test_orca_missing_energy_expected_warning(self) -> None:
        def missing_energy_backend(raw_file: RawFile):
            return SimpleNamespace(
                atomcoords=(((0.0, 0.0, 0.0), (0.0, 0.0, 0.9572), (0.9266, 0.0, -0.2396)),),
                atomnos=(8, 1, 1),
                charge=0,
                mult=1,
                metadata={"methods": ["DFT"], "keywords": ["B3LYP", "def2-SVP", "SP"]},
            )

        result = OrcaOutputPlugin(backend=missing_energy_backend).parse(
            RawFile(id="orca-missing-energy", name="missing-energy.out", content="O   R   C   A")
        )

        self.assertTrue(result.ok, result.error)
        self.assertEqual([warning.code for warning in result.warnings], ["missing_section"])
        draft = result.value.objects[0]  # type: ignore[union-attr]
        self.assertEqual(draft.method, "B3LYP")
        self.assertEqual(draft.energies, {})

    def test_orca_unknown_dft_keyword_falls_back_to_dft(self) -> None:
        def generic_dft_backend(raw_file: RawFile):
            return SimpleNamespace(
                atomcoords=(((0.0, 0.0, 0.0),),),
                atomnos=(8,),
                charge=0,
                mult=1,
                scfenergies=(-76.0 / EV_TO_HARTREE,),
                metadata={"methods": ["DFT"], "keywords": ["def2-SVP", "SP"]},
            )

        result = OrcaOutputPlugin(backend=generic_dft_backend).parse(
            RawFile(id="orca-generic-dft", name="generic-dft.out", content="O   R   C   A")
        )

        self.assertTrue(result.ok, result.error)
        self.assertEqual(result.value.objects[0].method, "DFT")  # type: ignore[union-attr]

    def test_snapshot_update_requires_explicit_update_true(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        fixture = manifest.fixtures[0]
        with TemporaryDirectory() as tmp:
            snapshot = Path(tmp) / "snapshot.json"
            snapshot.write_text('{"parse_ok": false}\n', encoding="utf-8")
            temp_fixture = fixture.__class__(
                id=fixture.id,
                program=fixture.program,
                format=fixture.format,
                task=fixture.task,
                parser_id=fixture.parser_id,
                file=fixture.file,
                source=fixture.source,
                parse_options=fixture.parse_options,
                expected_snapshot=snapshot,
                tolerances=fixture.tolerances,
                support_status=fixture.support_status,
                tags=fixture.tags,
                notes=fixture.notes,
            )

            with self.assertRaises(AssertionError):
                assert_parser_fixture_snapshot(ParserRegistry.default(), temp_fixture)
            self.assertEqual(snapshot.read_text(encoding="utf-8"), '{"parse_ok": false}\n')

            assert_parser_fixture_snapshot(ParserRegistry.default(), temp_fixture, update=True)
            updated = json.loads(snapshot.read_text(encoding="utf-8"))
            self.assertTrue(updated["parse_ok"])

    def test_loader_rejects_bad_schema_version(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.yaml"
            path.write_text("schema_version: parser-fixtures-v2\nfixtures: []\n", encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "schema_version"):
                load_parser_fixture_manifest(path)

    def test_support_matrix_loader_rejects_bad_schema_version(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "support-matrix.yaml"
            path.write_text(_support_matrix_yaml(schema_version="parser-support-matrix-v2"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "schema_version"):
                load_parser_support_matrix(path)

    def test_support_matrix_loader_rejects_unknown_fixture_id(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "support-matrix.yaml"
            path.write_text(_support_matrix_yaml(fixture_id="unknown-fixture"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "unknown fixture ids"):
                load_parser_support_matrix(path, manifest)

    def test_support_matrix_loader_rejects_undefined_diagnostic_code(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "support-matrix.yaml"
            path.write_text(_support_matrix_yaml(warning_code="not_cataloged"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "undefined warning codes"):
                load_parser_support_matrix(path, manifest)

    def test_loader_rejects_duplicate_fixture_id(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.yaml"
            path.write_text(_manifest_yaml("dup") + _fixture_yaml("dup"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "Duplicate"):
                load_parser_fixture_manifest(path)

    def test_loader_rejects_unsafe_fixture_paths(self) -> None:
        cases = {
            "absolute": "/tmp/file.out",
            "parent": "../file.out",
            "backslash": "files\\maple\\file.out",
        }
        for name, raw_path in cases.items():
            with self.subTest(name=name), TemporaryDirectory() as tmp:
                path = Path(tmp) / "manifest.yaml"
                path.write_text(_manifest_yaml(file_path=raw_path), encoding="utf-8")

                with self.assertRaises(AssertionError):
                    load_parser_fixture_manifest(path)

    def test_loader_rejects_non_redistributable_local_file(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.yaml"
            path.write_text(_manifest_yaml(redistributable="false"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "not redistributable"):
                load_parser_fixture_manifest(path)

    def test_reference_only_fixture_is_not_executable(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.yaml"
            path.write_text(_manifest_yaml(status="reference-only"), encoding="utf-8")

            manifest = load_parser_fixture_manifest(path)

            self.assertEqual(manifest.executable_fixtures(), ())

    def test_snapshot_assertion_fails_on_parser_id_mismatch(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        fixture = manifest.fixtures[0]
        with TemporaryDirectory() as tmp:
            snapshot = Path(tmp) / "snapshot.json"
            expected = json.loads(fixture.expected_snapshot.read_text(encoding="utf-8"))
            expected["parser_id"] = "wrong-parser"
            snapshot.write_text(json.dumps(expected), encoding="utf-8")
            temp_fixture = fixture.__class__(
                id=fixture.id,
                program=fixture.program,
                format=fixture.format,
                task=fixture.task,
                parser_id=fixture.parser_id,
                file=fixture.file,
                source=fixture.source,
                parse_options=fixture.parse_options,
                expected_snapshot=snapshot,
                tolerances=fixture.tolerances,
                support_status=fixture.support_status,
                tags=fixture.tags,
                notes=fixture.notes,
            )

            with self.assertRaisesRegex(AssertionError, "parser_id"):
                assert_parser_fixture_snapshot(ParserRegistry.default(), temp_fixture)

    def test_snapshot_assertion_fails_when_parser_fails_expected_success(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        with self.assertRaises(AssertionError):
            assert_parser_fixture_snapshot(ParserRegistry(()), manifest.fixtures[0])

    def test_scope_guards_keep_harness_out_of_runtime_workflows(self) -> None:
        harness_source = Path("tests/parser_fixture_harness.py").read_text(encoding="utf-8")
        forbidden = (
            "ProjectStore",
            "ImportRegistryWorkflow",
            "ChemicalRegistry",
            "ReactionGraphService",
            "EnergyProfileEngine",
            "ReportExportService",
            "PlatformShellService",
            "ProjectBundleService",
            "subprocess",
        )
        for token in forbidden:
            self.assertNotIn(token, harness_source)

        parser_runtime_exports = Path("rxnflow/parsers/__init__.py").read_text(encoding="utf-8")
        self.assertNotIn("parser_fixture_harness", parser_runtime_exports)

    def test_fixture_corpus_excludes_system_and_large_runtime_files(self) -> None:
        forbidden_suffixes = {".chk", ".gbw", ".hess", ".tmp", ".cache"}
        for path in Path("tests/fixtures/parsers").rglob("*"):
            self.assertNotEqual(path.name, ".DS_Store")
            self.assertNotIn(path.suffix, forbidden_suffixes)

    def test_gaussian_fixture_is_synthetic_and_redacted(self) -> None:
        text = Path(
            "tests/fixtures/parsers/files/gaussian/gaussian-sp-water-synthetic-minimal.log"
        ).read_text(encoding="utf-8")
        forbidden_tokens = (
            "cclib-data",
            "/home/",
            "/scratch/",
            "%Chk",
            "%Rwf",
            "Copyright",
            "proprietary",
            "license",
        )

        for token in forbidden_tokens:
            self.assertNotIn(token, text)

    def test_orca_fixture_is_synthetic_and_redacted(self) -> None:
        text = Path(
            "tests/fixtures/parsers/files/orca/orca-sp-water-synthetic-minimal.out"
        ).read_text(encoding="utf-8")
        forbidden_tokens = (
            "cclib-data",
            "/home/",
            "/scratch/",
            "/Users/",
            ".gbw",
            ".hess",
            "Copyright",
            "proprietary",
            "license",
        )

        for token in forbidden_tokens:
            self.assertNotIn(token, text)

    def test_maple_fixtures_are_synthetic_and_redacted(self) -> None:
        forbidden_tokens = (
            "ClickFF/MAPLE",
            "/home/",
            "/scratch/",
            "/Users/",
            "University of Pittsburgh",
            "Principal Developer",
            "Copyright",
            "license",
            "Licensed under",
        )
        for path in Path("tests/fixtures/parsers/files/maple").glob("maple-*-synthetic-minimal.*"):
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                for token in forbidden_tokens:
                    self.assertNotIn(token, text)


def _manifest_yaml(
    fixture_id: str = "fixture",
    *,
    file_path: str = "files/maple/file.out",
    snapshot_path: str = "snapshots/file.json",
    redistributable: str = "true",
    status: str = "supported",
) -> str:
    return (
        "schema_version: parser-fixtures-v1\n"
        "fixtures:\n"
        f"{_fixture_yaml(fixture_id, file_path=file_path, snapshot_path=snapshot_path, redistributable=redistributable, status=status)}"
    )


def _fixture_yaml(
    fixture_id: str = "fixture",
    *,
    file_path: str = "files/maple/file.out",
    snapshot_path: str = "snapshots/file.json",
    redistributable: str = "true",
    status: str = "supported",
) -> str:
    return (
        f"  - id: {fixture_id}\n"
        "    program: maple\n"
        "    format: maple-output\n"
        "    task: sp\n"
        "    parser_id: maple-output\n"
        f"    file: {file_path}\n"
        "    source:\n"
        "      kind: synthetic\n"
        "      url: null\n"
        "      commit: null\n"
        "      license: project-test-fixture\n"
        f"      redistributable: {redistributable}\n"
        "      redaction: none\n"
        "    parse_options:\n"
        "      expected_format: maple-output\n"
        "      strict: true\n"
        "      frame_policy: all\n"
        f"    expected_snapshot: {snapshot_path}\n"
        "    tolerances:\n"
        "      energy_abs: 1.0e-10\n"
        "      coordinate_abs: 1.0e-8\n"
        f"    support_status: {status}\n"
        "    tags: [maple]\n"
        "    notes: null\n"
    )


def _support_matrix_yaml(
    *,
    schema_version: str = "parser-support-matrix-v1",
    fixture_id: str = "maple-sp-synthetic-minimal",
    warning_code: str = "missing_section",
) -> str:
    return (
        f"schema_version: {schema_version}\n"
        "diagnostics:\n"
        "  warning_codes:\n"
        "    missing_section:\n"
        "      severity: warning\n"
        "      meaning: fixture\n"
        "  error_codes:\n"
        "    parse_failed:\n"
        "      severity: error\n"
        "      meaning: fixture\n"
        "entries:\n"
        "  - id: minimal-entry\n"
        "    program: maple\n"
        "    formats: [maple-output]\n"
        "    tasks: [sp]\n"
        "    versions: [synthetic]\n"
        "    parser_id: maple-output\n"
        "    status: partial\n"
        "    fields:\n"
        "      geometry: supported\n"
        f"    fixture_ids: [{fixture_id}]\n"
        f"    observed_warning_codes: [{warning_code}]\n"
        "    observed_error_codes: []\n"
        "    known_limits: [fixture]\n"
    )


def _fixture_by_id(manifest, fixture_id: str):
    for fixture in manifest.fixtures:
        if fixture.id == fixture_id:
            return fixture
    raise AssertionError(f"Fixture not found: {fixture_id}")


if __name__ == "__main__":
    unittest.main()
