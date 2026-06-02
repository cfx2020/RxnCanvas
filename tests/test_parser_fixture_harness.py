from __future__ import annotations

from dataclasses import replace
import hashlib
import inspect
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
    build_parser_public_candidate_fetch_request,
    load_parser_fixture_manifest,
    load_parser_public_fixture_decisions,
    load_parser_source_inventory,
    load_parser_support_matrix,
    project_parser_fixture_snapshot,
    summarize_maple_public_candidate_resolution,
    verify_parser_public_candidate_bytes,
)


FIXTURE_MANIFEST = Path("tests/fixtures/parsers/manifest.yaml")
PUBLIC_FIXTURE_DECISIONS = Path("tests/fixtures/parsers/public-fixture-decisions.yaml")
SUPPORT_MATRIX = Path("tests/fixtures/parsers/support-matrix.yaml")
SOURCE_INVENTORY = Path("tests/fixtures/parsers/sources.yaml")


class ParserFixtureHarnessTest(unittest.TestCase):
    def test_manifest_loads_synthetic_fixture_and_parse_options(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        self.assertEqual(len(manifest.fixtures), 15)
        fixture = _fixture_by_id(manifest, "maple-sp-synthetic-minimal")
        self.assertEqual(fixture.id, "maple-sp-synthetic-minimal")
        self.assertEqual(fixture.source.kind, "synthetic")
        self.assertTrue(fixture.source.redistributable)
        self.assertEqual(fixture.source.redaction, "none")
        self.assertIsNone(fixture.source.source_path)
        self.assertIsNone(fixture.source.source_sha256)
        self.assertIsNone(fixture.source.source_size_bytes)
        self.assertEqual(fixture.parse_options.expected_format, "maple-output")
        self.assertTrue(fixture.parse_options.strict)
        self.assertEqual(fixture.parse_options.frame_policy, "all")
        self.assertTrue(fixture.file.is_file())

    def test_support_matrix_loads_and_covers_fixture_manifest(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        matrix = load_parser_support_matrix(SUPPORT_MATRIX, manifest, source_inventory=inventory)

        self.assertEqual(len(matrix.entries), 16)
        self.assertEqual(matrix.covered_fixture_ids(), {fixture.id for fixture in manifest.fixtures})
        self.assertIn("missing_section", matrix.diagnostics.warning_codes)
        self.assertIn("unit_assumed", matrix.diagnostics.warning_codes)
        self.assertIn("parse_failed", matrix.diagnostics.error_codes)
        partial_entries = [entry for entry in matrix.entries if entry.status == "partial"]
        self.assertTrue(partial_entries)
        for entry in partial_entries:
            self.assertTrue(entry.known_limits, entry.id)

        maple_sum = _matrix_entry_by_id(matrix, "maple-sum-reference")
        self.assertEqual(maple_sum.source_ids, ("maple-dev-example",))
        self.assertEqual(maple_sum.reference_file_ids, ("maple-frequency-summary-reference",))
        extxyz = _matrix_entry_by_id(matrix, "ase-extxyz-synthetic")
        self.assertEqual(extxyz.source_ids, ("ase-extxyz-project-authored",))

    def test_maple_public_example_inventory_splits_candidates_and_references(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        matrix = load_parser_support_matrix(SUPPORT_MATRIX, manifest, source_inventory=inventory)

        maple_source = inventory.source_by_id("maple-dev-example")
        maple_tasks = {file.task for file in maple_source.files}
        self.assertTrue({"sp", "opt", "scan", "neb", "string", "irc", "md", "freq"}.issubset(maple_tasks))

        candidates = _matrix_entry_by_id(matrix, "maple-output-public-candidates")
        self.assertEqual(candidates.status, "candidate")
        self.assertEqual(
            candidates.candidate_file_ids,
            ("maple-sp-output-example", "maple-opt-output-example", "maple-opt-final-xyz-example"),
        )
        self.assertEqual(candidates.reference_file_ids, ())
        self.assertEqual(candidates.fixture_ids, ())

        for entry_id in (
            "maple-scan-reference",
            "maple-path-family-reference",
            "maple-md-artifacts-reference",
            "maple-frequency-reference",
        ):
            with self.subTest(entry=entry_id):
                entry = _matrix_entry_by_id(matrix, entry_id)
                self.assertEqual(entry.status, "reference-only")
                self.assertEqual(entry.fixture_ids, ())
                self.assertEqual(entry.candidate_file_ids, ())
                self.assertTrue(entry.reference_file_ids)

        reference_only_ids = {entry.id for entry in matrix.reference_only_entries()}
        self.assertNotIn("maple-output-public-candidates", reference_only_ids)
        self.assertIn("maple-path-family-reference", reference_only_ids)
        self.assertIn("maple-frequency-reference", reference_only_ids)

    def test_maple_public_shape_regression_uses_synthetic_derived_fixtures(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        matrix = load_parser_support_matrix(SUPPORT_MATRIX, manifest, source_inventory=inventory)

        entry = _matrix_entry_by_id(matrix, "maple-public-shape-regression")
        self.assertEqual(entry.status, "partial")
        self.assertEqual(entry.source_ids, ("maple-dev-example",))
        self.assertEqual(
            entry.candidate_file_ids,
            ("maple-sp-output-example", "maple-opt-final-xyz-example"),
        )
        self.assertEqual(
            entry.fixture_ids,
            (
                "maple-sp-public-shape-synthetic-derived",
                "maple-opt-final-xyz-public-shape-synthetic-derived",
            ),
        )

        for fixture_id in entry.fixture_ids:
            with self.subTest(fixture=fixture_id):
                fixture = _fixture_by_id(manifest, fixture_id)
                self.assertEqual(fixture.source.kind, "synthetic")
                self.assertIsNone(fixture.source.source_path)
                self.assertIsNone(fixture.source.source_sha256)
                self.assertIsNone(fixture.source.source_size_bytes)
                self.assertIn("synthetic-derived", fixture.tags)

    def test_source_inventory_loads_public_and_project_authored_sources(self) -> None:
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)

        self.assertEqual(len(inventory.sources), 3)
        maple = inventory.source_by_id("maple-dev-example")
        self.assertEqual(maple.program, "maple")
        self.assertEqual(maple.branch, "dev")
        self.assertEqual(maple.commit, "001636482646bca0d1e867fb257322d2a172cc86")
        self.assertEqual(maple.redistributable_default, "review-required")
        self.assertIn(".xyz", maple.source_summary["file_counts_by_extension"])
        self.assertIn("academic/commercial", maple.license)
        self.assertGreaterEqual(len(maple.files), 7)
        self.assertIn("maple-sp-output-example", {file.id for file in maple.files_by_policy("candidate")})
        self.assertIn(
            "maple-autoneb-tree-json-reference",
            {file.id for file in maple.files_by_policy("reference-only")},
        )

        cclib = inventory.source_by_id("cclib-data-gaussian-orca")
        self.assertEqual(cclib.commit, "2149daf306ebcca0f3946a41f222d04ae0e83329")
        self.assertEqual(cclib.redistributable_default, "review-required")
        self.assertIn("Gaussian/Gaussian16", cclib.source_summary["file_counts_by_directory"])
        self.assertIn("cclib-gaussian16-water-log", {file.id for file in cclib.files_by_policy("candidate")})
        self.assertIn("cclib-orca60-1618-output", {file.id for file in cclib.files_by_policy("candidate")})

        ase = inventory.source_by_id("ase-extxyz-project-authored")
        self.assertEqual(ase.program, "ase-extxyz")
        self.assertEqual(ase.version, "3.28.0")
        self.assertEqual(ase.license, "LGPL-2.1-or-later")
        self.assertEqual(ase.redistributable_default, "allowed")
        self.assertEqual(len(ase.files_by_policy("vendored")), 3)
        self.assertIn(
            "ase-extxyz-multiframe-metadata-calculator-energy",
            {file.id for file in ase.files_by_policy("vendored")},
        )

    def test_source_inventory_files_have_policy_size_hash_and_parser_intent(self) -> None:
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)

        all_files = [file for source in inventory.sources for file in source.files]
        self.assertTrue(all_files)
        for file in all_files:
            with self.subTest(file=file.id):
                self.assertGreater(file.size_bytes, 0)
                self.assertRegex(file.sha256, r"^sha256:[0-9a-f]{64}$")
                self.assertIn(file.fixture_policy, {"candidate", "vendored", "reference-only", "rejected"})
                self.assertTrue(file.parser_intent)

        candidate_ids = {file.id for file in inventory.files_by_policy("candidate")}
        self.assertIn("maple-sp-output-example", candidate_ids)
        self.assertIn("cclib-orca50-1038-output", candidate_ids)

    def test_public_candidate_fetch_request_builds_from_source_inventory(self) -> None:
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)

        request = build_parser_public_candidate_fetch_request(
            inventory,
            "maple-dev-example",
            "maple-sp-output-example",
        )

        self.assertEqual(request.source_id, "maple-dev-example")
        self.assertEqual(request.file_id, "maple-sp-output-example")
        self.assertEqual(request.url, "https://github.com/ClickFF/MAPLE")
        self.assertEqual(request.upstream_path, "example/sp/sp.out")
        self.assertEqual(request.commit_or_version, "001636482646bca0d1e867fb257322d2a172cc86")
        self.assertEqual(
            request.expected_sha256,
            "sha256:4fff4cc57b157df05ca028b7acc6c4d0fce68687b51ddd27dfbf6456de587d17",
        )
        self.assertEqual(request.expected_size_bytes, 4253)

    def test_public_candidate_fetch_request_rejects_unknown_source_or_file(self) -> None:
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)

        with self.assertRaisesRegex(AssertionError, "source not found|source inventory source not found"):
            build_parser_public_candidate_fetch_request(
                inventory,
                "unknown-source",
                "maple-sp-output-example",
            )
        with self.assertRaisesRegex(AssertionError, "unknown file id"):
            build_parser_public_candidate_fetch_request(
                inventory,
                "maple-dev-example",
                "unknown-file",
            )

    def test_public_candidate_fetch_request_rejects_file_source_mismatch(self) -> None:
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)

        with self.assertRaisesRegex(AssertionError, "does not belong to source"):
            build_parser_public_candidate_fetch_request(
                inventory,
                "maple-dev-example",
                "cclib-orca50-1038-output",
            )

    def test_public_candidate_fetch_request_rejects_missing_url_or_tracking_info(self) -> None:
        cases = {
            "missing_url": {"url": "null"},
            "missing_tracking": {"branch": "null", "commit": "null", "version": "null"},
        }
        for name, kwargs in cases.items():
            with self.subTest(name=name), TemporaryDirectory() as tmp:
                path = Path(tmp) / "sources.yaml"
                path.write_text(_source_inventory_yaml(**kwargs), encoding="utf-8")
                inventory = load_parser_source_inventory(path)

                with self.assertRaisesRegex(AssertionError, "missing"):
                    build_parser_public_candidate_fetch_request(inventory, "source", "file")

    def test_public_candidate_fetch_request_rejects_malformed_inventory_sha256(self) -> None:
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        source = inventory.source_by_id("maple-dev-example")
        file = inventory.file_by_id("maple-sp-output-example")
        mutated_source = replace(
            source,
            files=(replace(file, sha256="sha256:not-a-hash"),),
        )
        mutated_inventory = replace(inventory, sources=(mutated_source,))

        with self.assertRaisesRegex(AssertionError, "malformed sha256"):
            build_parser_public_candidate_fetch_request(
                mutated_inventory,
                "maple-dev-example",
                "maple-sp-output-example",
            )

    def test_public_candidate_fetch_verify_accepts_matching_bytes(self) -> None:
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        request = build_parser_public_candidate_fetch_request(
            inventory,
            "maple-dev-example",
            "maple-sp-output-example",
        )
        content = b"verified candidate bytes\n"
        expected_sha256 = "sha256:" + hashlib.sha256(content).hexdigest()
        request = replace(
            request,
            expected_sha256=expected_sha256,
            expected_size_bytes=len(content),
        )

        result = verify_parser_public_candidate_bytes(
            request,
            content,
            fetched_at="2026-06-02T00:00:00Z",
        )

        self.assertTrue(result.ok)
        self.assertIsNone(result.error)
        self.assertEqual(result.source_id, request.source_id)
        self.assertEqual(result.file_id, request.file_id)
        self.assertEqual(result.url, request.url)
        self.assertEqual(result.upstream_path, request.upstream_path)
        self.assertEqual(result.expected_sha256, expected_sha256)
        self.assertEqual(result.actual_sha256, expected_sha256)
        self.assertEqual(result.expected_size_bytes, len(content))
        self.assertEqual(result.actual_size_bytes, len(content))
        self.assertEqual(result.fetched_at, "2026-06-02T00:00:00Z")

    def test_public_candidate_fetch_verify_reports_sha_mismatch_without_mutating_request(self) -> None:
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        request = build_parser_public_candidate_fetch_request(
            inventory,
            "maple-dev-example",
            "maple-sp-output-example",
        )
        content = b"verified candidate bytes\n"
        original_sha256 = inventory.file_by_id("maple-sp-output-example").sha256
        actual_sha256 = "sha256:" + hashlib.sha256(content).hexdigest()
        request = replace(
            request,
            expected_sha256="sha256:" + "0" * 64,
            expected_size_bytes=len(content),
        )

        result = verify_parser_public_candidate_bytes(
            request,
            content,
            fetched_at="2026-06-02T00:00:00Z",
        )

        self.assertFalse(result.ok)
        self.assertEqual(result.error, "sha256_mismatch")
        self.assertEqual(result.expected_sha256, "sha256:" + "0" * 64)
        self.assertEqual(result.actual_sha256, actual_sha256)
        self.assertEqual(request.expected_sha256, "sha256:" + "0" * 64)
        self.assertEqual(inventory.file_by_id("maple-sp-output-example").sha256, original_sha256)

    def test_public_candidate_fetch_verify_reports_size_mismatch_without_writing_files(self) -> None:
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        request = build_parser_public_candidate_fetch_request(
            inventory,
            "maple-dev-example",
            "maple-sp-output-example",
        )
        content = b"verified candidate bytes\n"
        expected_sha256 = "sha256:" + hashlib.sha256(content).hexdigest()
        request = replace(
            request,
            expected_sha256=expected_sha256,
            expected_size_bytes=len(content) + 1,
        )
        before_files = _parser_fixture_file_snapshot()

        result = verify_parser_public_candidate_bytes(
            request,
            content,
            fetched_at="2026-06-02T00:00:00Z",
        )

        self.assertFalse(result.ok)
        self.assertEqual(result.error, "size_mismatch")
        self.assertEqual(result.expected_size_bytes, len(content) + 1)
        self.assertEqual(result.actual_size_bytes, len(content))
        self.assertEqual(_parser_fixture_file_snapshot(), before_files)

    def test_maple_public_resolution_summary_classifies_current_source_files(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        matrix = load_parser_support_matrix(SUPPORT_MATRIX, manifest, source_inventory=inventory)
        ledger = load_parser_public_fixture_decisions(
            PUBLIC_FIXTURE_DECISIONS,
            source_inventory=inventory,
            manifest=manifest,
        )

        summary = summarize_maple_public_candidate_resolution(inventory, ledger, matrix)

        self.assertEqual(summary.source_id, "maple-dev-example")
        self.assertEqual(
            summary.candidate_file_ids,
            ("maple-sp-output-example", "maple-opt-output-example", "maple-opt-final-xyz-example"),
        )
        self.assertEqual(len(summary.reference_file_ids), 14)
        self.assertEqual(summary.promoted_file_ids, ())
        self.assertEqual(summary.blocked_candidate_file_ids, summary.candidate_file_ids)
        self.assertEqual(summary.unresolved_file_ids, ())

        maple_source = inventory.source_by_id("maple-dev-example")
        self.assertEqual(
            set(summary.reference_file_ids),
            {file.id for file in maple_source.files_by_policy("reference-only")},
        )
        self.assertEqual(
            set(summary.candidate_file_ids) | set(summary.reference_file_ids),
            {file.id for file in maple_source.files},
        )
        expected_fallbacks = {
            "maple-sp-public-shape-synthetic-derived",
            "maple-opt-synthetic-minimal",
            "maple-opt-final-xyz-public-shape-synthetic-derived",
            "maple-path-family-synthetic-derived",
        }
        self.assertEqual(set(summary.fallback_fixture_ids), expected_fallbacks)
        for fixture_id in summary.fallback_fixture_ids:
            with self.subTest(fixture=fixture_id):
                fixture = _fixture_by_id(manifest, fixture_id)
                self.assertEqual(fixture.source.kind, "synthetic")

    def test_maple_public_resolution_summary_exposes_ledger_inconsistencies(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        matrix = load_parser_support_matrix(SUPPORT_MATRIX, manifest, source_inventory=inventory)
        ledger = load_parser_public_fixture_decisions(
            PUBLIC_FIXTURE_DECISIONS,
            source_inventory=inventory,
            manifest=manifest,
        )

        with self.assertRaisesRegex(AssertionError, "program=maple"):
            summarize_maple_public_candidate_resolution(
                inventory,
                ledger,
                matrix,
                source_id="cclib-data-gaussian-orca",
            )

        candidate_without_fallback = _replace_decision(
            ledger,
            "maple-sp-output-example",
            fallback_fixture_ids=(),
        )
        summary = summarize_maple_public_candidate_resolution(
            inventory,
            candidate_without_fallback,
            matrix,
        )
        self.assertIn("maple-sp-output-example", summary.unresolved_file_ids)

        reference_without_self_anchor = _replace_decision(
            ledger,
            "maple-frequency-summary-reference",
            reference_file_ids=(),
        )
        summary = summarize_maple_public_candidate_resolution(
            inventory,
            reference_without_self_anchor,
            matrix,
        )
        self.assertIn("maple-frequency-summary-reference", summary.unresolved_file_ids)

        missing_decision = ledger.__class__(
            root=ledger.root,
            decisions=tuple(
                decision
                for decision in ledger.decisions
                if decision.file_id != "maple-opt-output-example"
            ),
        )
        summary = summarize_maple_public_candidate_resolution(inventory, missing_decision, matrix)
        self.assertIn("maple-opt-output-example", summary.unresolved_file_ids)

    def test_maple_public_resolution_support_matrix_keeps_public_originals_non_executable(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        matrix = load_parser_support_matrix(SUPPORT_MATRIX, manifest, source_inventory=inventory)

        maple_source = inventory.source_by_id("maple-dev-example")
        maple_candidate_ids = {file.id for file in maple_source.files_by_policy("candidate")}
        maple_reference_ids = {file.id for file in maple_source.files_by_policy("reference-only")}

        candidates = _matrix_entry_by_id(matrix, "maple-output-public-candidates")
        self.assertEqual(candidates.status, "candidate")
        self.assertEqual(set(candidates.candidate_file_ids), maple_candidate_ids)
        self.assertEqual(candidates.fixture_ids, ())
        self.assertEqual(candidates.reference_file_ids, ())

        reference_entries = [
            entry
            for entry in matrix.entries
            if "maple-dev-example" in entry.source_ids and entry.status == "reference-only"
        ]
        self.assertTrue(reference_entries)
        matrix_reference_ids = set()
        for entry in reference_entries:
            with self.subTest(entry=entry.id):
                self.assertEqual(entry.fixture_ids, ())
                self.assertEqual(entry.candidate_file_ids, ())
                self.assertTrue(set(entry.reference_file_ids).issubset(maple_reference_ids))
                matrix_reference_ids.update(entry.reference_file_ids)
        self.assertEqual(matrix_reference_ids, maple_reference_ids)

        public_shape = _matrix_entry_by_id(matrix, "maple-public-shape-regression")
        self.assertEqual(public_shape.status, "partial")
        self.assertEqual(public_shape.source_ids, ("maple-dev-example",))
        self.assertEqual(
            set(public_shape.candidate_file_ids),
            {"maple-sp-output-example", "maple-opt-final-xyz-example"},
        )
        for fixture_id in public_shape.fixture_ids:
            with self.subTest(fixture=fixture_id):
                fixture = _fixture_by_id(manifest, fixture_id)
                self.assertEqual(fixture.source.kind, "synthetic")
                self.assertIn("synthetic-derived", fixture.tags)

    def test_public_fixture_decision_ledger_loads_and_covers_source_inventory(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)

        ledger = load_parser_public_fixture_decisions(
            PUBLIC_FIXTURE_DECISIONS,
            source_inventory=inventory,
            manifest=manifest,
        )

        source_file_keys = {
            (source.id, file.id)
            for source in inventory.sources
            for file in source.files
        }
        self.assertEqual(ledger.source_file_keys(), source_file_keys)
        maple_sp = ledger.decision_for("maple-dev-example", "maple-sp-output-example")
        self.assertEqual(maple_sp.decision, "needs-permission")
        self.assertEqual(maple_sp.promotion, "blocked")
        self.assertEqual(
            maple_sp.id,
            ledger.decision_by_id("maple-dev-example:maple-sp-output-example").id,
        )
        self.assertTrue(maple_sp.evidence)
        self.assertEqual(maple_sp.fallback_fixture_ids, ("maple-sp-public-shape-synthetic-derived",))

    def test_public_fixture_decision_ledger_blocks_maple_and_cclib_candidates(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        ledger = load_parser_public_fixture_decisions(
            PUBLIC_FIXTURE_DECISIONS,
            source_inventory=inventory,
            manifest=manifest,
        )

        for source_id in ("maple-dev-example", "cclib-data-gaussian-orca"):
            source = inventory.source_by_id(source_id)
            for file in source.files_by_policy("candidate"):
                with self.subTest(file=file.id):
                    decision = ledger.decision_for(source.id, file.id)
                    self.assertNotEqual(decision.decision, "allowed")
                    self.assertNotEqual(decision.promotion, "promoted")
                    self.assertEqual(decision.decision, "needs-permission")
                    self.assertEqual(decision.promotion, "blocked")
                    self.assertTrue(decision.reason)
                    self.assertTrue(decision.fallback_fixture_ids or decision.reference_file_ids)

    def test_public_fixture_decision_ledger_keeps_reference_files_unpromoted(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        ledger = load_parser_public_fixture_decisions(
            PUBLIC_FIXTURE_DECISIONS,
            source_inventory=inventory,
            manifest=manifest,
        )

        for source in inventory.sources:
            for file in source.files_by_policy("reference-only"):
                with self.subTest(file=file.id):
                    decision = ledger.decision_for(source.id, file.id)
                    self.assertEqual(decision.decision, "reference-only")
                    self.assertEqual(decision.promotion, "not-applicable")
                    self.assertEqual(decision.reference_file_ids, (file.id,))
                    self.assertTrue(decision.reason)

    def test_public_fixture_decision_ledger_allows_project_authored_extxyz(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        ledger = load_parser_public_fixture_decisions(
            PUBLIC_FIXTURE_DECISIONS,
            source_inventory=inventory,
            manifest=manifest,
        )

        ase = inventory.source_by_id("ase-extxyz-project-authored")
        for file in ase.files_by_policy("vendored"):
            with self.subTest(file=file.id):
                decision = ledger.decision_for(ase.id, file.id)
                self.assertEqual(decision.decision, "allowed")
                self.assertEqual(decision.promotion, "promoted")
                self.assertIn("not a third-party public original", decision.reason)
                self.assertTrue(decision.fallback_fixture_ids)

    def test_vendored_third_party_source_metadata_loads_when_complete(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.yaml"
            path.write_text(_manifest_yaml(source_kind="vendored-third-party"), encoding="utf-8")

            manifest = load_parser_fixture_manifest(path)

            source = manifest.fixtures[0].source
            self.assertEqual(source.kind, "vendored-third-party")
            self.assertEqual(source.source_path, "upstream/file.out")
            self.assertEqual(source.source_sha256, "sha256:" + "1" * 64)
            self.assertEqual(source.source_size_bytes, 42)

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
        path_family = _fixture_by_id(manifest, "maple-path-family-synthetic-derived")
        public_shape_sp = _fixture_by_id(manifest, "maple-sp-public-shape-synthetic-derived")
        public_shape_xyz = _fixture_by_id(manifest, "maple-opt-final-xyz-public-shape-synthetic-derived")
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
        self.assertEqual(path_family.format, "maple-xyz")
        self.assertEqual(path_family.task, "path-family")
        self.assertEqual(path_family.source.kind, "synthetic")
        self.assertEqual(path_family.support_status, "partial")
        self.assertEqual(public_shape_sp.source.kind, "synthetic")
        self.assertEqual(public_shape_sp.support_status, "supported")
        self.assertEqual(public_shape_xyz.format, "maple-xyz")
        self.assertEqual(public_shape_xyz.task, "opt-final")
        self.assertEqual(public_shape_xyz.source.kind, "synthetic")
        self.assertEqual(public_shape_xyz.support_status, "supported")
        self.assertIn(opt.id, executable_ids)
        self.assertIn(path.id, executable_ids)
        self.assertIn(path_family.id, executable_ids)
        self.assertIn(public_shape_sp.id, executable_ids)
        self.assertIn(public_shape_xyz.id, executable_ids)

    def test_maple_path_family_support_matrix_declares_frame_only_boundary(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        matrix = load_parser_support_matrix(SUPPORT_MATRIX, manifest, source_inventory=inventory)

        entry = _matrix_entry_by_id(matrix, "maple-xyz-path-synthetic")
        self.assertEqual(entry.status, "partial")
        self.assertEqual(
            entry.fixture_ids,
            ("maple-irc-path-synthetic-minimal", "maple-path-family-synthetic-derived"),
        )
        self.assertEqual(entry.source_ids, ("maple-dev-example",))
        self.assertEqual(entry.candidate_file_ids, ())
        self.assertEqual(
            entry.reference_file_ids,
            (
                "maple-irc-full-path-xyz-reference",
                "maple-autoneb-tree-json-reference",
                "maple-neb-output-reference",
                "maple-neb-mep-xyz-reference",
                "maple-string-output-reference",
                "maple-string-mep-xyz-reference",
            ),
        )
        self.assertEqual(entry.fields["frame_labels"], "supported")
        self.assertEqual(entry.fields["path_frames"], "partial")
        self.assertEqual(entry.fields["direction"], "unsupported")
        self.assertEqual(entry.fields["path_topology"], "unsupported")
        self.assertEqual(entry.fields["transition_state"], "unsupported")
        self.assertTrue(
            any("independent frame objects" in limit for limit in entry.known_limits),
            entry.known_limits,
        )

        reference = _matrix_entry_by_id(matrix, "maple-path-family-reference")
        self.assertEqual(reference.status, "reference-only")
        self.assertEqual(reference.fixture_ids, ())
        self.assertEqual(reference.candidate_file_ids, ())
        self.assertEqual(
            reference.reference_file_ids,
            (
                "maple-irc-full-path-xyz-reference",
                "maple-autoneb-tree-json-reference",
                "maple-neb-output-reference",
                "maple-neb-mep-xyz-reference",
                "maple-string-output-reference",
                "maple-string-mep-xyz-reference",
            ),
        )

    def test_xyz_extxyz_manifest_entries_and_executable_status(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        xyz = _fixture_by_id(manifest, "xyz-water-geometry-missing-energy")
        extxyz = _fixture_by_id(manifest, "extxyz-h2-energy-charge-spin")
        partial = _fixture_by_id(manifest, "extxyz-h2-missing-energy")
        multiframe = _fixture_by_id(manifest, "extxyz-multiframe-metadata-calculator-energy")
        bad = _fixture_by_id(manifest, "xyz-bad-atom-count")
        executable_ids = {fixture.id for fixture in manifest.executable_fixtures()}

        self.assertEqual(xyz.source.kind, "synthetic")
        self.assertEqual(xyz.support_status, "supported")
        self.assertEqual(extxyz.format, "extxyz")
        self.assertEqual(extxyz.support_status, "supported")
        self.assertEqual(partial.support_status, "partial")
        self.assertEqual(multiframe.support_status, "partial")
        self.assertIn("multiframe", multiframe.tags)
        self.assertIn("calculator-energy", multiframe.tags)
        self.assertEqual(bad.support_status, "unsupported")
        self.assertIn(xyz.id, executable_ids)
        self.assertIn(extxyz.id, executable_ids)
        self.assertIn(partial.id, executable_ids)
        self.assertIn(multiframe.id, executable_ids)
        self.assertNotIn(bad.id, executable_ids)

    def test_gaussian_manifest_entry_and_executable_status(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        gaussian = _fixture_by_id(manifest, "gaussian-sp-water-synthetic-minimal")
        public_shape = _fixture_by_id(manifest, "gaussian-sp-public-shape-synthetic-derived")
        executable_ids = {fixture.id for fixture in manifest.executable_fixtures()}

        self.assertEqual(gaussian.program, "gaussian")
        self.assertEqual(gaussian.format, "gaussian-log")
        self.assertEqual(gaussian.parser_id, "gaussian-log-cclib")
        self.assertEqual(gaussian.parse_options.expected_format, "gaussian-log")
        self.assertEqual(gaussian.source.kind, "synthetic")
        self.assertEqual(gaussian.support_status, "supported")
        self.assertTrue(gaussian.file.is_file())
        self.assertIn(gaussian.id, executable_ids)
        self.assertEqual(public_shape.program, "gaussian")
        self.assertEqual(public_shape.format, "gaussian-log")
        self.assertEqual(public_shape.parser_id, "gaussian-log-cclib")
        self.assertEqual(public_shape.parse_options.expected_format, "gaussian-log")
        self.assertEqual(public_shape.source.kind, "synthetic")
        self.assertEqual(public_shape.support_status, "supported")
        self.assertTrue(public_shape.file.is_file())
        self.assertIn(public_shape.id, executable_ids)

    def test_orca_manifest_entry_and_executable_status(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        orca = _fixture_by_id(manifest, "orca-sp-water-synthetic-minimal")
        public_shape = _fixture_by_id(manifest, "orca-sp-public-shape-synthetic-derived")
        executable_ids = {fixture.id for fixture in manifest.executable_fixtures()}

        self.assertEqual(orca.program, "orca")
        self.assertEqual(orca.format, "orca-output")
        self.assertEqual(orca.parser_id, "orca-output-cclib")
        self.assertEqual(orca.parse_options.expected_format, "orca-output")
        self.assertEqual(orca.source.kind, "synthetic")
        self.assertEqual(orca.support_status, "supported")
        self.assertTrue(orca.file.is_file())
        self.assertIn(orca.id, executable_ids)
        self.assertEqual(public_shape.program, "orca")
        self.assertEqual(public_shape.format, "orca-output")
        self.assertEqual(public_shape.parser_id, "orca-output-cclib")
        self.assertEqual(public_shape.parse_options.expected_format, "orca-output")
        self.assertEqual(public_shape.source.kind, "synthetic")
        self.assertEqual(public_shape.support_status, "supported")
        self.assertTrue(public_shape.file.is_file())
        self.assertIn(public_shape.id, executable_ids)

    def test_cclib_public_shape_regression_links_candidates_without_vendoring(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        matrix = load_parser_support_matrix(SUPPORT_MATRIX, manifest, source_inventory=inventory)

        cclib_source = inventory.source_by_id("cclib-data-gaussian-orca")
        self.assertEqual(cclib_source.redistributable_default, "review-required")
        self.assertEqual(cclib_source.license, "not-declared-in-sparse-checkout")

        gaussian = _matrix_entry_by_id(matrix, "gaussian-log-cclib-synthetic")
        self.assertEqual(gaussian.source_ids, ("cclib-data-gaussian-orca",))
        self.assertEqual(
            gaussian.candidate_file_ids,
            ("cclib-gaussian16-water-log", "cclib-gaussian16-co-pbe-log"),
        )
        self.assertEqual(
            gaussian.fixture_ids,
            ("gaussian-sp-water-synthetic-minimal", "gaussian-sp-public-shape-synthetic-derived"),
        )
        for fixture_id in gaussian.fixture_ids:
            self.assertEqual(_fixture_by_id(manifest, fixture_id).source.kind, "synthetic")

        orca = _matrix_entry_by_id(matrix, "orca-output-cclib-synthetic")
        self.assertEqual(orca.source_ids, ("cclib-data-gaussian-orca",))
        self.assertEqual(
            orca.candidate_file_ids,
            ("cclib-orca50-1038-output", "cclib-orca60-1618-output"),
        )
        self.assertEqual(
            orca.fixture_ids,
            ("orca-sp-water-synthetic-minimal", "orca-sp-public-shape-synthetic-derived"),
        )
        for fixture_id in orca.fixture_ids:
            self.assertEqual(_fixture_by_id(manifest, fixture_id).source.kind, "synthetic")

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
        multiframe = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "extxyz-multiframe-metadata-calculator-energy"),
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

        self.assertTrue(multiframe["parse_ok"])
        self.assertEqual(multiframe["object_count"], 3)
        calc_energy = multiframe["objects"][0]
        self.assertEqual(calc_energy["label"], "co-calc-energy")
        self.assertEqual(calc_energy["charge"], 0)
        self.assertEqual(calc_energy["spin_multiplicity"], 1)
        self.assertEqual(calc_energy["elements"], ["C", "O"])
        self.assertAlmostEqual(
            calc_energy["energies"]["electronic"]["value"],
            -14.25 * EV_TO_HARTREE,
        )
        spin_metadata = multiframe["objects"][1]
        self.assertEqual(spin_metadata["label"], "h2-spin-metadata")
        self.assertEqual(spin_metadata["spin_multiplicity"], 1)
        self.assertAlmostEqual(
            spin_metadata["energies"]["electronic"]["value"],
            -1.1 * EV_TO_HARTREE,
        )
        missing_energy = multiframe["objects"][2]
        self.assertEqual(missing_energy["label"], "he-missing-energy")
        self.assertEqual(missing_energy["energies"], {})
        self.assertEqual(
            multiframe["warning_codes"],
            ["missing_section", "unit_assumed", "unit_assumed"],
        )

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
        path_family = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "maple-path-family-synthetic-derived"),
        )
        public_shape_sp = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "maple-sp-public-shape-synthetic-derived"),
        )
        public_shape_xyz = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "maple-opt-final-xyz-public-shape-synthetic-derived"),
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

        self.assertTrue(path_family["parse_ok"])
        self.assertEqual(path_family["object_count"], 4)
        self.assertEqual(
            [obj["label"] for obj in path_family["objects"]],
            ["Image 0", "Image 1", "Image 2", "Image 3"],
        )
        self.assertEqual(
            [obj["energies"]["electronic"]["unit"] for obj in path_family["objects"]],
            ["hartree", "hartree", "hartree", "hartree"],
        )
        self.assertEqual(path_family["objects"][0]["thermochemistry_keys"], [])
        self.assertEqual(path_family["warning_codes"], [])

        self.assertTrue(public_shape_sp["parse_ok"])
        sp_object = public_shape_sp["objects"][0]
        self.assertEqual(sp_object["label"], "MAPLE sp")
        self.assertEqual(sp_object["method"], "sp uma")
        self.assertEqual(sp_object["elements"], ["C", "O", "H", "H"])
        self.assertEqual(sp_object["energies"]["electronic"]["unit"], "hartree")
        self.assertAlmostEqual(sp_object["energies"]["electronic"]["value"], -112.3456789012)
        self.assertEqual(public_shape_sp["warning_codes"], [])

        self.assertTrue(public_shape_xyz["parse_ok"])
        xyz_object = public_shape_xyz["objects"][0]
        self.assertEqual(xyz_object["label"], "Image 0")
        self.assertEqual(xyz_object["method"], None)
        self.assertEqual(xyz_object["elements"], ["C", "O", "H", "H"])
        self.assertEqual(xyz_object["energies"]["electronic"]["unit"], "hartree")
        self.assertAlmostEqual(xyz_object["energies"]["electronic"]["value"], -112.4567890123)
        self.assertEqual(public_shape_xyz["warning_codes"], [])

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
        public_shape = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "gaussian-sp-public-shape-synthetic-derived"),
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

        self.assertTrue(public_shape["parse_ok"])
        self.assertEqual(public_shape["object_count"], 1)
        public_object = public_shape["objects"][0]
        self.assertEqual(public_object["label"], "gaussian-sp-public-shape-synthetic-derived.log")
        self.assertEqual(public_object["charge"], 0)
        self.assertEqual(public_object["spin_multiplicity"], 1)
        self.assertEqual(public_object["method"], "PBE")
        self.assertEqual(public_object["elements"], ["C", "O"])
        self.assertEqual(public_object["atom_count"], 2)
        self.assertEqual(public_object["geometry_sample"][0]["element"], "C")
        self.assertEqual(public_object["energy_keys"], ["electronic"])
        self.assertEqual(
            public_object["energies"]["electronic"]["reference"],
            "cclib scfenergies converted from eV",
        )
        self.assertEqual(public_object["energies"]["electronic"]["unit"], "hartree")
        self.assertAlmostEqual(
            public_object["energies"]["electronic"]["value"],
            -112.99999503345245,
        )
        self.assertEqual(public_object["thermochemistry_keys"], [])
        self.assertEqual(public_shape["warning_codes"], [])

    def test_orca_snapshot_covers_expected_fields(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)

        orca = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "orca-sp-water-synthetic-minimal"),
        )
        public_shape = project_parser_fixture_snapshot(
            ParserRegistry.default(),
            _fixture_by_id(manifest, "orca-sp-public-shape-synthetic-derived"),
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

        self.assertTrue(public_shape["parse_ok"])
        self.assertEqual(public_shape["object_count"], 1)
        public_object = public_shape["objects"][0]
        self.assertEqual(public_object["label"], "orca-sp-public-shape-synthetic-derived.out")
        self.assertEqual(public_object["charge"], 0)
        self.assertEqual(public_object["spin_multiplicity"], 1)
        self.assertEqual(public_object["method"], "PBE0")
        self.assertEqual(public_object["elements"], ["C", "O"])
        self.assertEqual(public_object["atom_count"], 2)
        self.assertEqual(public_object["geometry_sample"][0]["element"], "C")
        self.assertEqual(public_object["energy_keys"], ["electronic"])
        self.assertEqual(
            public_object["energies"]["electronic"]["reference"],
            "cclib scfenergies converted from eV",
        )
        self.assertEqual(public_object["energies"]["electronic"]["unit"], "hartree")
        self.assertAlmostEqual(
            public_object["energies"]["electronic"]["value"],
            -113.1234518080263,
        )
        self.assertEqual(public_object["thermochemistry_keys"], [])
        self.assertEqual(public_shape["warning_codes"], [])

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

    def test_source_inventory_loader_rejects_bad_schema_version(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "sources.yaml"
            path.write_text(_source_inventory_yaml(schema_version="parser-source-inventory-v2"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "schema_version"):
                load_parser_source_inventory(path)

    def test_public_fixture_decision_loader_rejects_bad_schema_version(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "public-fixture-decisions.yaml"
            path.write_text(
                _public_fixture_decisions_yaml(schema_version="parser-public-fixture-decisions-v2"),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(AssertionError, "schema_version"):
                load_parser_public_fixture_decisions(path)

    def test_source_inventory_loader_rejects_unknown_policy(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "sources.yaml"
            path.write_text(_source_inventory_yaml(fixture_policy="maybe"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "fixture_policy"):
                load_parser_source_inventory(path)

    def test_source_inventory_loader_rejects_malformed_sha256(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "sources.yaml"
            path.write_text(_source_inventory_yaml(sha256="sha256:not-a-hash"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "sha256"):
                load_parser_source_inventory(path)

    def test_source_inventory_loader_rejects_unsafe_paths(self) -> None:
        cases = {
            "absolute": "/tmp/file.out",
            "parent": "../file.out",
            "backslash": "files\\maple\\file.out",
        }
        for name, raw_path in cases.items():
            with self.subTest(name=name), TemporaryDirectory() as tmp:
                path = Path(tmp) / "sources.yaml"
                path.write_text(_source_inventory_yaml(file_path=raw_path), encoding="utf-8")

                with self.assertRaises(AssertionError):
                    load_parser_source_inventory(path)

    def test_loader_rejects_vendored_third_party_missing_source_path(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.yaml"
            path.write_text(
                _manifest_yaml(source_kind="vendored-third-party", source_path="null"),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(AssertionError, "source_path"):
                load_parser_fixture_manifest(path)

    def test_loader_rejects_vendored_third_party_malformed_source_sha256(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.yaml"
            path.write_text(
                _manifest_yaml(source_kind="vendored-third-party", source_sha256="sha256:not-a-hash"),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(AssertionError, "source_sha256"):
                load_parser_fixture_manifest(path)

    def test_loader_rejects_vendored_third_party_bad_source_size(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.yaml"
            path.write_text(
                _manifest_yaml(source_kind="vendored-third-party", source_size_bytes="0"),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(AssertionError, "source_size_bytes"):
                load_parser_fixture_manifest(path)

    def test_loader_rejects_vendored_third_party_non_redistributable(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.yaml"
            path.write_text(
                _manifest_yaml(source_kind="vendored-third-party", redistributable="false"),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(AssertionError, "redistributable"):
                load_parser_fixture_manifest(path)

    def test_support_matrix_loader_rejects_unknown_fixture_id(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "support-matrix.yaml"
            path.write_text(_support_matrix_yaml(fixture_id="unknown-fixture"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "unknown fixture ids"):
                load_parser_support_matrix(path, manifest)

    def test_support_matrix_loader_rejects_unknown_source_id(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "support-matrix.yaml"
            path.write_text(_support_matrix_yaml(source_id="unknown-source"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "unknown source ids"):
                load_parser_support_matrix(path, manifest, source_inventory=inventory)

    def test_support_matrix_loader_rejects_unknown_reference_file_id(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "support-matrix.yaml"
            path.write_text(_support_matrix_yaml(reference_file_id="unknown-file"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "unknown reference file ids"):
                load_parser_support_matrix(path, manifest, source_inventory=inventory)

    def test_support_matrix_loader_rejects_unknown_candidate_file_id(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "support-matrix.yaml"
            path.write_text(_support_matrix_yaml(candidate_file_id="unknown-file"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "unknown candidate file ids"):
                load_parser_support_matrix(path, manifest, source_inventory=inventory)

    def test_support_matrix_loader_rejects_reference_file_as_candidate(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "support-matrix.yaml"
            path.write_text(_support_matrix_yaml(candidate_file_id="maple-frequency-summary-reference"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "candidate files"):
                load_parser_support_matrix(path, manifest, source_inventory=inventory)

    def test_support_matrix_loader_rejects_non_reference_file_id(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "support-matrix.yaml"
            path.write_text(_support_matrix_yaml(reference_file_id="maple-sp-output-example"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "reference-only"):
                load_parser_support_matrix(path, manifest, source_inventory=inventory)

    def test_public_fixture_decision_loader_rejects_unknown_source_id(self) -> None:
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "public-fixture-decisions.yaml"
            path.write_text(_public_fixture_decisions_yaml(source_id="unknown-source"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "source not found|source inventory source not found"):
                load_parser_public_fixture_decisions(path, source_inventory=inventory)

    def test_public_fixture_decision_loader_rejects_unknown_file_id(self) -> None:
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "public-fixture-decisions.yaml"
            path.write_text(_public_fixture_decisions_yaml(file_id="unknown-file"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "unknown file id"):
                load_parser_public_fixture_decisions(path, source_inventory=inventory)

    def test_public_fixture_decision_loader_rejects_file_source_mismatch(self) -> None:
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "public-fixture-decisions.yaml"
            path.write_text(
                _public_fixture_decisions_yaml(
                    source_id="maple-dev-example",
                    file_id="cclib-orca50-1038-output",
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(AssertionError, "does not belong to source"):
                load_parser_public_fixture_decisions(path, source_inventory=inventory)

    def test_public_fixture_decision_loader_rejects_unknown_fallback_fixture_id(self) -> None:
        manifest = load_parser_fixture_manifest(FIXTURE_MANIFEST)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "public-fixture-decisions.yaml"
            path.write_text(_public_fixture_decisions_yaml(fallback_fixture_id="unknown-fixture"), encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "unknown fallback fixture ids"):
                load_parser_public_fixture_decisions(path, manifest=manifest)

    def test_public_fixture_decision_loader_rejects_unknown_reference_file_id(self) -> None:
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "public-fixture-decisions.yaml"
            path.write_text(
                _public_fixture_decisions_yaml(
                    decision="reference-only",
                    promotion="not-applicable",
                    fallback_fixture_id="",
                    reference_file_id="unknown-reference",
                ),
                encoding="utf-8",
            )

            with self.assertRaises(AssertionError):
                load_parser_public_fixture_decisions(path, source_inventory=inventory)

    def test_public_fixture_decision_loader_rejects_non_reference_file_anchor(self) -> None:
        inventory = load_parser_source_inventory(SOURCE_INVENTORY)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "public-fixture-decisions.yaml"
            path.write_text(
                _public_fixture_decisions_yaml(
                    decision="reference-only",
                    promotion="not-applicable",
                    fallback_fixture_id="",
                    reference_file_id="maple-sp-output-example",
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(AssertionError, "reference-only"):
                load_parser_public_fixture_decisions(path, source_inventory=inventory)

    def test_public_fixture_decision_loader_rejects_unknown_decision_and_promotion(self) -> None:
        cases = {
            "decision": {"decision": "maybe"},
            "promotion": {"promotion": "maybe"},
        }
        for name, kwargs in cases.items():
            with self.subTest(name=name), TemporaryDirectory() as tmp:
                path = Path(tmp) / "public-fixture-decisions.yaml"
                path.write_text(_public_fixture_decisions_yaml(**kwargs), encoding="utf-8")

                with self.assertRaisesRegex(AssertionError, f"unsupported {name}"):
                    load_parser_public_fixture_decisions(path)

    def test_public_fixture_decision_loader_rejects_promoted_without_allowed(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "public-fixture-decisions.yaml"
            path.write_text(
                _public_fixture_decisions_yaml(decision="needs-permission", promotion="promoted"),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(AssertionError, "promoted requires decision=allowed"):
                load_parser_public_fixture_decisions(path)

    def test_public_fixture_decision_loader_rejects_blocked_without_anchor(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "public-fixture-decisions.yaml"
            path.write_text(
                _public_fixture_decisions_yaml(
                    decision="needs-permission",
                    promotion="blocked",
                    fallback_fixture_id="",
                    reference_file_id="",
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(AssertionError, "fallback/reference"):
                load_parser_public_fixture_decisions(path)

    def test_public_fixture_decision_loader_rejects_synthetic_only_without_fallback(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "public-fixture-decisions.yaml"
            path.write_text(
                _public_fixture_decisions_yaml(
                    decision="synthetic-only",
                    promotion="blocked",
                    fallback_fixture_id="",
                    reference_file_id="maple-frequency-summary-reference",
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(AssertionError, "synthetic-only requires fallback_fixture_ids"):
                load_parser_public_fixture_decisions(path)

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
            "requests",
            "urllib",
            "urlopen",
            "socket",
            "http.client",
        )
        for token in forbidden:
            self.assertNotIn(token, harness_source)

        parser_runtime_exports = Path("rxnflow/parsers/__init__.py").read_text(encoding="utf-8")
        self.assertNotIn("parser_fixture_harness", parser_runtime_exports)

    def test_public_candidate_fetch_helpers_do_not_access_network_or_write_files(self) -> None:
        helper_source = "\n".join(
            (
                inspect.getsource(build_parser_public_candidate_fetch_request),
                inspect.getsource(verify_parser_public_candidate_bytes),
                inspect.getsource(summarize_maple_public_candidate_resolution),
            )
        )
        forbidden = (
            "requests",
            "urllib",
            "urlopen",
            "socket",
            "http.client",
            "subprocess",
            "write_text",
            "write_bytes",
            "open(",
        )
        for token in forbidden:
            self.assertNotIn(token, helper_source)

    def test_fixture_corpus_excludes_system_and_large_runtime_files(self) -> None:
        forbidden_suffixes = {".chk", ".gbw", ".hess", ".tmp", ".cache"}
        for path in Path("tests/fixtures/parsers").rglob("*"):
            self.assertNotEqual(path.name, ".DS_Store")
            self.assertNotIn(path.suffix, forbidden_suffixes)

    def test_gaussian_fixture_is_synthetic_and_redacted(self) -> None:
        forbidden_tokens = (
            "cclib-data",
            "/home/",
            "/scratch/",
            "/Users/",
            "%Chk",
            "%Rwf",
            "Copyright",
            "proprietary",
            "license",
        )

        for path in Path("tests/fixtures/parsers/files/gaussian").glob("gaussian-*"):
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                for token in forbidden_tokens:
                    self.assertNotIn(token, text)

    def test_orca_fixture_is_synthetic_and_redacted(self) -> None:
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

        for path in Path("tests/fixtures/parsers/files/orca").glob("orca-*"):
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                for token in forbidden_tokens:
                    self.assertNotIn(token, text)

    def test_maple_fixtures_are_synthetic_and_redacted(self) -> None:
        forbidden_tokens = (
            "ClickFF/MAPLE",
            "MAchine-learning Potential",
            "/home/",
            "/scratch/",
            "/Users/",
            "University of Pittsburgh",
            "Principal Developer",
            "Copyright",
            "license",
            "Licensed under",
            "All rights reserved",
            "academic use",
            "Commercial Use Prohibited",
            "Creative Commons",
        )
        for path in Path("tests/fixtures/parsers/files/maple").glob("maple-*"):
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
    source_kind: str = "synthetic",
    source_path: str = "upstream/file.out",
    source_sha256: str = "sha256:" + "1" * 64,
    source_size_bytes: str = "42",
) -> str:
    return (
        "schema_version: parser-fixtures-v1\n"
        "fixtures:\n"
        f"{_fixture_yaml(fixture_id, file_path=file_path, snapshot_path=snapshot_path, redistributable=redistributable, status=status, source_kind=source_kind, source_path=source_path, source_sha256=source_sha256, source_size_bytes=source_size_bytes)}"
    )


def _fixture_yaml(
    fixture_id: str = "fixture",
    *,
    file_path: str = "files/maple/file.out",
    snapshot_path: str = "snapshots/file.json",
    redistributable: str = "true",
    status: str = "supported",
    source_kind: str = "synthetic",
    source_path: str = "upstream/file.out",
    source_sha256: str = "sha256:" + "1" * 64,
    source_size_bytes: str = "42",
) -> str:
    extra_source = ""
    if source_kind == "vendored-third-party":
        extra_source = (
            f"      source_path: {source_path}\n"
            f"      source_sha256: {source_sha256}\n"
            f"      source_size_bytes: {source_size_bytes}\n"
        )
    return (
        f"  - id: {fixture_id}\n"
        "    program: maple\n"
        "    format: maple-output\n"
        "    task: sp\n"
        "    parser_id: maple-output\n"
        f"    file: {file_path}\n"
        "    source:\n"
        f"      kind: {source_kind}\n"
        "      url: https://example.test/repo\n"
        "      commit: abc123\n"
        "      license: project-test-fixture\n"
        f"      redistributable: {redistributable}\n"
        "      redaction: none\n"
        f"{extra_source}"
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
    source_id: str = "maple-dev-example",
    candidate_file_id: str = "maple-sp-output-example",
    reference_file_id: str = "maple-frequency-summary-reference",
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
        f"    source_ids: [{source_id}]\n"
        f"    candidate_file_ids: [{candidate_file_id}]\n"
        f"    fixture_ids: [{fixture_id}]\n"
        f"    reference_file_ids: [{reference_file_id}]\n"
        f"    observed_warning_codes: [{warning_code}]\n"
        "    observed_error_codes: []\n"
        "    known_limits: [fixture]\n"
    )


def _public_fixture_decisions_yaml(
    *,
    schema_version: str = "parser-public-fixture-decisions-v1",
    source_id: str = "maple-dev-example",
    file_id: str = "maple-sp-output-example",
    decision: str = "needs-permission",
    promotion: str = "blocked",
    fallback_fixture_id: str = "maple-sp-public-shape-synthetic-derived",
    reference_file_id: str = "",
) -> str:
    fallback_fixture_ids = f"[{fallback_fixture_id}]" if fallback_fixture_id else "[]"
    reference_file_ids = f"[{reference_file_id}]" if reference_file_id else "[]"
    return (
        f"schema_version: {schema_version}\n"
        "decisions:\n"
        f"  - id: {source_id}:{file_id}\n"
        f"    source_id: {source_id}\n"
        f"    file_id: {file_id}\n"
        "    checked_at: \"2026-06-02\"\n"
        "    evidence:\n"
        "      - kind: source-inventory\n"
        "        ref: tests/fixtures/parsers/sources.yaml\n"
        "        note: fixture\n"
        f"    decision: {decision}\n"
        f"    promotion: {promotion}\n"
        "    reason: fixture\n"
        f"    fallback_fixture_ids: {fallback_fixture_ids}\n"
        f"    reference_file_ids: {reference_file_ids}\n"
        "    reviewer: agent\n"
    )


def _source_inventory_yaml(
    *,
    schema_version: str = "parser-source-inventory-v1",
    fixture_policy: str = "candidate",
    sha256: str = "sha256:" + "0" * 64,
    file_path: str = "example/sp/sp.out",
    url: str = "https://example.test/repo",
    branch: str = "main",
    commit: str = "abc123",
    version: str = "null",
) -> str:
    return (
        f"schema_version: {schema_version}\n"
        "sources:\n"
        "  - id: source\n"
        "    program: maple\n"
        "    kind: upstream-git\n"
        f"    url: {url}\n"
        f"    branch: {branch}\n"
        f"    commit: {commit}\n"
        f"    version: {version}\n"
        "    license: review-required\n"
        "    redistributable_default: review-required\n"
        "    local_reference_path: null\n"
        "    source_summary:\n"
        "      scope: example/\n"
        "    notes: fixture\n"
        "    files:\n"
        "      - id: file\n"
        f"        path: {file_path}\n"
        "        task: sp\n"
        "        format: maple-output\n"
        "        size_bytes: 1\n"
        f"        sha256: {sha256}\n"
        f"        fixture_policy: {fixture_policy}\n"
        "        parser_intent: maple-output\n"
        "        notes: fixture\n"
    )


def _fixture_by_id(manifest, fixture_id: str):
    for fixture in manifest.fixtures:
        if fixture.id == fixture_id:
            return fixture
    raise AssertionError(f"Fixture not found: {fixture_id}")


def _parser_fixture_file_snapshot() -> tuple[tuple[str, int, str], ...]:
    root = Path("tests/fixtures/parsers/files")
    return tuple(
        sorted(
            (
                str(path.relative_to(root)),
                path.stat().st_size,
                hashlib.sha256(path.read_bytes()).hexdigest(),
            )
            for path in root.rglob("*")
            if path.is_file()
        )
    )


def _replace_decision(ledger, file_id: str, **kwargs):
    return ledger.__class__(
        root=ledger.root,
        decisions=tuple(
            replace(decision, **kwargs) if decision.file_id == file_id else decision
            for decision in ledger.decisions
        ),
    )


def _matrix_entry_by_id(matrix, entry_id: str):
    for entry in matrix.entries:
        if entry.id == entry_id:
            return entry
    raise AssertionError(f"Matrix entry not found: {entry_id}")


if __name__ == "__main__":
    unittest.main()
