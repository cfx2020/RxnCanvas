from __future__ import annotations

import json
import math
import unittest

from rxnflow import run_core_fixture_vertical_slice
from rxnflow.errors import RxnFlowWarning
from rxnflow.export import (
    ENERGY_TABLE_SCHEMA_VERSION,
    EnergyTableRow,
    ExportArtifact,
    ExportArtifactRecord,
)
from rxnflow.report_manifest import (
    REPORT_DOCUMENT_SCHEMA_VERSION,
    REPORT_SECTION_ORDER,
    ReportComposerRequest,
    ReportComposerService,
    report_document_to_dict,
)


PROJECT_ID = "project-fixture-minimal-reaction"


class ReportManifestTest(unittest.TestCase):
    def test_composer_builds_json_safe_document_from_existing_artifacts(self) -> None:
        profile = _profile()
        artifacts = (
            _artifact("artifact-png", "png", "energy_diagram"),
            _artifact("artifact-cdxml", "cdxml", "energy_diagram"),
            _artifact(
                "artifact-csv",
                "csv",
                "energy_table",
                {
                    "energy_table_schema_version": ENERGY_TABLE_SCHEMA_VERSION,
                    "energy_table_row_count": 1,
                },
            ),
            _artifact(
                "artifact-xlsx",
                "xlsx",
                "energy_table",
                {
                    "energy_table_schema_version": ENERGY_TABLE_SCHEMA_VERSION,
                    "energy_table_row_count": 1,
                },
            ),
            _artifact(
                "artifact-svg",
                "svg",
                "graph_snapshot",
                {"graph_id": profile.graph_id, "node_count": 2, "edge_count": 1, "path_count": 1},
            ),
        )
        result = ReportComposerService().compose(
            ReportComposerRequest(
                project_id=PROJECT_ID,
                title="Relative energy report",
                profile=profile,
                table_rows=(EnergyTableRow("A", {"relative_energy": 0.0}),),
                artifacts=artifacts,
                metadata={"template": "default"},
            )
        )

        self.assertTrue(result.ok, result.error)
        document = result.value
        assert document is not None
        self.assertEqual(document.metadata["schema_version"], REPORT_DOCUMENT_SCHEMA_VERSION)
        self.assertEqual([section.kind for section in document.sections], list(REPORT_SECTION_ORDER))
        self.assertEqual(
            [asset.source_artifact_id for asset in document.assets],
            [artifact.id for artifact in artifacts],
        )
        self.assertFalse(any(hasattr(asset, "bytes") for asset in document.assets))

        encoded = report_document_to_dict(document)
        self.assertTrue(encoded.ok, encoded.error)
        payload = encoded.value
        assert payload is not None
        json.dumps(payload, sort_keys=True, allow_nan=False)
        self.assertNotIn("bytes", payload["assets"][0])

    def test_artifact_record_merges_path_checksum_and_metadata_without_copying_bytes(self) -> None:
        artifact = _artifact(
            "artifact-csv",
            "csv",
            "energy_table",
            {"runtime_only": True, "energy_table_row_count": 2},
            bytes_=b"structure,energy\nA,0\n",
            path="/tmp/outside.csv",
        )
        record = ExportArtifactRecord(
            id="artifact-csv",
            format="csv",
            path="exports/report.csv",
            checksum="sha256:" + "a" * 64,
            metadata={"persisted": True},
        )

        result = ReportComposerService().compose(
            ReportComposerRequest(project_id=PROJECT_ID, artifacts=(artifact,), artifact_records=(record,))
        )

        self.assertTrue(result.ok, result.error)
        document = result.value
        assert document is not None
        self.assertEqual(len(document.assets), 1)
        asset = document.assets[0]
        self.assertEqual(asset.path, "exports/report.csv")
        self.assertEqual(asset.checksum, "sha256:" + "a" * 64)
        self.assertTrue(asset.metadata["runtime_only"])
        self.assertTrue(asset.metadata["persisted"])
        self.assertFalse(hasattr(asset, "bytes"))

    def test_missing_artifacts_are_unavailable_warnings_without_fake_assets(self) -> None:
        result = ReportComposerService().compose(
            ReportComposerRequest(project_id=PROJECT_ID, profile=_profile())
        )

        self.assertTrue(result.ok, result.error)
        document = result.value
        assert document is not None
        self.assertEqual(document.assets, ())
        sections = {section.kind: section for section in document.sections}
        self.assertEqual(sections["graph"].data["status"], "unavailable")
        self.assertEqual(sections["energy_table"].data["status"], "unavailable")
        warning_codes = {warning.code for warning in document.warnings}
        self.assertIn("missing_report_graph_snapshot", warning_codes)
        self.assertIn("missing_report_energy_table", warning_codes)

    def test_profile_and_artifact_warnings_are_deduplicated(self) -> None:
        profile = _profile(warnings=(RxnFlowWarning("manual_warning", "Check TS entropy", "node-ts"),))
        artifact = _artifact(
            "artifact-png",
            "png",
            "energy_diagram",
            {
                "warnings": [
                    {"code": "manual_warning", "message": "Check TS entropy", "target": "node-ts"},
                    {"code": "artifact_warning", "message": "Artifact warning", "target": "artifact-png"},
                ]
            },
        )

        result = ReportComposerService().compose(
            ReportComposerRequest(project_id=PROJECT_ID, profile=profile, artifacts=(artifact,))
        )

        self.assertTrue(result.ok, result.error)
        document = result.value
        assert document is not None
        warning_keys = [(warning.code, warning.message, warning.target) for warning in document.warnings]
        self.assertEqual(warning_keys.count(("manual_warning", "Check TS entropy", "node-ts")), 1)
        self.assertIn(("artifact_warning", "Artifact warning", "artifact-png"), warning_keys)

    def test_non_json_safe_metadata_is_rejected(self) -> None:
        artifact = _artifact("artifact-png", "png", "energy_diagram", {"bad_number": math.nan})

        result = ReportComposerService().compose(
            ReportComposerRequest(project_id=PROJECT_ID, artifacts=(artifact,))
        )

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "invalid_input")
        self.assertIn("metadata", result.error.target or "")

    def test_repeated_compose_keeps_stable_ids_and_order(self) -> None:
        request = ReportComposerRequest(
            project_id=PROJECT_ID,
            profile=_profile(),
            artifacts=(
                _artifact("artifact-png", "png", "energy_diagram"),
                _artifact("artifact-svg", "svg", "graph_snapshot", {"graph_id": "graph-a-b"}),
            ),
        )

        first = ReportComposerService().compose(request)
        second = ReportComposerService().compose(request)

        self.assertTrue(first.ok, first.error)
        self.assertTrue(second.ok, second.error)
        first_document = first.value
        second_document = second.value
        assert first_document is not None
        assert second_document is not None
        self.assertEqual(first_document.id, second_document.id)
        self.assertEqual([section.id for section in first_document.sections], [section.id for section in second_document.sections])
        self.assertEqual([asset.id for asset in first_document.assets], [asset.id for asset in second_document.assets])

    def test_duplicate_artifacts_keep_first_and_warn(self) -> None:
        result = ReportComposerService().compose(
            ReportComposerRequest(
                project_id=PROJECT_ID,
                artifacts=(
                    _artifact("artifact-png", "png", "energy_diagram", {"label": "first"}),
                    _artifact("artifact-png", "png", "energy_diagram", {"label": "second"}),
                ),
            )
        )

        self.assertTrue(result.ok, result.error)
        document = result.value
        assert document is not None
        self.assertEqual(len(document.assets), 1)
        self.assertEqual(document.assets[0].metadata["label"], "first")
        self.assertIn("duplicate_report_artifact", {warning.code for warning in document.warnings})


def _profile(warnings: tuple[RxnFlowWarning, ...] = ()):
    result = run_core_fixture_vertical_slice()
    assert result.ok, result.error
    profile = result.value.profile  # type: ignore[union-attr]
    if not warnings:
        return profile
    from dataclasses import replace

    return replace(profile, warnings=warnings)


def _artifact(
    artifact_id: str,
    format_id: str,
    kind: str,
    metadata: dict | None = None,
    *,
    bytes_: bytes | None = None,
    path: str | None = None,
) -> ExportArtifact:
    return ExportArtifact(
        id=artifact_id,
        format=format_id,  # type: ignore[arg-type]
        path=path,
        bytes=bytes_,
        metadata={"artifact_kind": kind, "format": format_id, **(metadata or {})},
    )


if __name__ == "__main__":
    unittest.main()
