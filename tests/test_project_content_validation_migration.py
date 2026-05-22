from __future__ import annotations

import json
from hashlib import sha256
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from rxnflow.content_store import (
    CHEMICAL_OBJECTS_PATH,
    ENERGY_PROFILES_PATH,
    EXPORT_ARTIFACTS_PATH,
    IMPORT_LEDGER_PATH,
    PROJECT_CONTENT_INDEX_PATH,
    PROJECT_CONTENT_SCHEMA_VERSION,
    REACTION_GRAPHS_PATH,
    PROJECT_CONTENT_TIME,
    WORKSPACES_PATH,
    ProjectContentFile,
    ProjectContentIndex,
    ProjectContentMigrationPlan,
    ProjectContentSnapshot,
    ProjectContentStore,
    ProjectContentValidationIssue,
    ProjectContentValidationReport,
    StorageObject,
    _json_bytes,
    _project_content_index_from_dict,
    _project_content_index_to_dict,
    project_content_snapshot_from_fixture,
)
from rxnflow.errors import RxnFlowError
from rxnflow.export import ExportArtifactRecord
from rxnflow.fixture import run_core_fixture_vertical_slice
from rxnflow.project import ProjectStore
from rxnflow.result import err


class ProjectContentValidationMigrationTest(unittest.TestCase):
    def test_validation_report_and_migration_plan_contracts_are_json_safe(self) -> None:
        warning = ProjectContentValidationIssue(
            severity="warning",
            code="source_file_missing",
            message="source_file_id is not anchored.",
            target="chemical_objects[0].source_file_id",
            details={"object_id": "object-a"},
        )
        error = ProjectContentValidationIssue(
            severity="error",
            code="checksum_mismatch",
            message="Section checksum does not match the index.",
            target=".rxnflow/state/chemical-objects.json",
            details={"expected": "sha256:a", "actual": "sha256:b"},
        )

        passed = ProjectContentValidationReport(
            project_id="project-a",
            schema_version=PROJECT_CONTENT_SCHEMA_VERSION,
        )
        failed = ProjectContentValidationReport(
            project_id="project-a",
            schema_version=PROJECT_CONTENT_SCHEMA_VERSION,
            issues=(warning, error),
        )
        plan = ProjectContentMigrationPlan(
            current_schema_version=PROJECT_CONTENT_SCHEMA_VERSION,
            target_schema_version=PROJECT_CONTENT_SCHEMA_VERSION,
            needed=False,
        )

        self.assertTrue(passed.ok)
        self.assertEqual(passed.summary, {"total": 0, "errors": 0, "warnings": 0})
        self.assertEqual(passed.checked_at, PROJECT_CONTENT_TIME)
        self.assertFalse(failed.ok)
        self.assertEqual(failed.summary, {"total": 2, "errors": 1, "warnings": 1})
        self.assertEqual(failed.issues[0].details["object_id"], "object-a")
        self.assertFalse(plan.needed)
        self.assertEqual(plan.steps, ())
        self.assertEqual(plan.issues, ())

        with self.assertRaises(ValueError):
            ProjectContentValidationIssue(
                severity="info",  # type: ignore[arg-type]
                code="bad_severity",
                message="Invalid severity.",
            )
        with self.assertRaises(ValueError):
            ProjectContentValidationIssue(
                severity="error",
                code="bad_details",
                message="Invalid details.",
                details={"not_json": object()},
            )

    def test_validate_project_reports_normal_project_as_ok(self) -> None:
        fixture = run_core_fixture_vertical_slice()
        self.assertTrue(fixture.ok, fixture.error)
        assert fixture.value is not None
        snapshot = project_content_snapshot_from_fixture(fixture.value)

        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            created = ProjectStore().create_project("demo", root)
            self.assertTrue(created.ok, created.error)
            saved = ProjectContentStore().save_snapshot(root, snapshot)
            self.assertTrue(saved.ok, saved.error)

            report_result = ProjectContentStore().validate_project(root)

        self.assertTrue(report_result.ok, report_result.error)
        report = report_result.value
        assert report is not None
        self.assertEqual(report.project_id, snapshot.project_id)
        self.assertEqual(report.schema_version, PROJECT_CONTENT_SCHEMA_VERSION)
        self.assertTrue(report.ok)
        self.assertEqual([issue.severity for issue in report.issues], ["warning", "warning"])
        self.assertEqual({issue.code for issue in report.issues}, {"source_file_missing"})

    def test_validate_project_reports_index_and_section_integrity_issues(self) -> None:
        snapshot = ProjectContentSnapshot(project_id="project-a")

        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            ProjectStore().create_project("demo", root)
            saved = ProjectContentStore().save_snapshot(root, snapshot)
            self.assertTrue(saved.ok, saved.error)

            (root / CHEMICAL_OBJECTS_PATH).unlink()
            missing = ProjectContentStore().validate_project(root).value
            assert missing is not None
            self.assertFalse(missing.ok)
            self.assertIn("missing_section", {issue.code for issue in missing.issues})

            ProjectContentStore().save_snapshot(root, snapshot)
            section_path = root / CHEMICAL_OBJECTS_PATH
            section_data = section_path.read_text(encoding="utf-8")
            section_path.write_text(section_data.replace("  ", " "), encoding="utf-8")
            checksum_mismatch = ProjectContentStore().validate_project(root).value
            assert checksum_mismatch is not None
            self.assertFalse(checksum_mismatch.ok)
            self.assertIn("checksum_mismatch", {issue.code for issue in checksum_mismatch.issues})

    def test_validate_project_reports_bad_index_shape_and_canonical_path(self) -> None:
        index = ProjectContentIndex(
            schema_version=PROJECT_CONTENT_SCHEMA_VERSION,
            project_id="project-a",
            updated_at=PROJECT_CONTENT_TIME,
            files=(
                ProjectContentFile(
                    kind="chemical_objects",
                    path=".rxnflow/state/not-canonical.json",
                    checksum=f"sha256:{'a' * 64}",
                ),
                ProjectContentFile(
                    kind="chemical_objects",
                    path=CHEMICAL_OBJECTS_PATH,
                    checksum="sha256:not-valid",
                ),
            ),
        )

        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            ProjectStore().create_project("demo", root)
            index_path = root / PROJECT_CONTENT_INDEX_PATH
            index_path.parent.mkdir(parents=True, exist_ok=True)
            index_path.write_bytes(_json_bytes(_project_content_index_to_dict(index)))

            report = ProjectContentStore().validate_project(root).value

        assert report is not None
        self.assertFalse(report.ok)
        issue_codes = {issue.code for issue in report.issues}
        self.assertIn("canonical_path_mismatch", issue_codes)
        self.assertIn("duplicate_section_kind", issue_codes)
        self.assertIn("invalid_checksum", issue_codes)

    def test_validate_project_reports_index_shape_and_unknown_section_behavior(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            ProjectStore().create_project("demo", root)
            index_path = root / PROJECT_CONTENT_INDEX_PATH
            index_path.parent.mkdir(parents=True, exist_ok=True)
            index_path.write_bytes(
                _json_bytes(
                    {
                        "schema_version": PROJECT_CONTENT_SCHEMA_VERSION,
                        "project_id": "project-a",
                        "updated_at": PROJECT_CONTENT_TIME,
                        "files": "not-list",
                    }
                )
            )
            bad_files = ProjectContentStore().validate_project(root).value
            assert bad_files is not None
            self.assertIn("index_files", {issue.code for issue in bad_files.issues})

            unknown_payload = b'{"schema_version": "unknown-v1", "project_id": "project-a"}\n'
            unknown_path = root / ".rxnflow" / "state" / "unknown.json"
            unknown_path.write_bytes(unknown_payload)
            index_path.write_bytes(
                _json_bytes(
                    {
                        "schema_version": PROJECT_CONTENT_SCHEMA_VERSION,
                        "project_id": "project-a",
                        "updated_at": PROJECT_CONTENT_TIME,
                        "files": [
                            42,
                            {
                                "kind": "",
                                "path": "../unsafe.json",
                                "checksum": None,
                                "updated_at": PROJECT_CONTENT_TIME,
                            },
                            {
                                "kind": "unknown_section",
                                "path": ".rxnflow/state/unknown.json",
                                "checksum": _checksum(unknown_payload),
                                "updated_at": PROJECT_CONTENT_TIME,
                            },
                        ],
                    }
                )
            )
            report = ProjectContentStore().validate_project(root).value

        assert report is not None
        issue_codes = {issue.code for issue in report.issues}
        self.assertIn("index_file_entry", issue_codes)
        self.assertIn("invalid_section_kind", issue_codes)
        self.assertIn("invalid_section_path", issue_codes)
        self.assertIn("unknown_section_kind", issue_codes)

    def test_validate_project_reports_bad_section_json_and_codec_errors(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            ProjectStore().create_project("demo", root)
            saved = ProjectContentStore().save_snapshot(root, ProjectContentSnapshot(project_id="project-a"))
            self.assertTrue(saved.ok, saved.error)

            (root / CHEMICAL_OBJECTS_PATH).write_bytes(b"{bad json")
            bad_json = ProjectContentStore().validate_project(root).value
            assert bad_json is not None
            self.assertIn("bad_json", {issue.code for issue in bad_json.issues})

            ProjectContentStore().save_snapshot(root, ProjectContentSnapshot(project_id="project-a"))
            section = _read_json(root / CHEMICAL_OBJECTS_PATH)
            section["schema_version"] = "chemical-objects-v2"
            (root / CHEMICAL_OBJECTS_PATH).write_bytes(_json_bytes(section))
            bad_schema = ProjectContentStore().validate_project(root).value
            assert bad_schema is not None
            self.assertIn("section_decode_error", {issue.code for issue in bad_schema.issues})

    def test_validate_project_reports_cross_section_reference_errors(self) -> None:
        fixture = run_core_fixture_vertical_slice()
        self.assertTrue(fixture.ok, fixture.error)
        assert fixture.value is not None
        snapshot = project_content_snapshot_from_fixture(fixture.value)

        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            ProjectStore().create_project("demo", root)
            saved = ProjectContentStore().save_snapshot(root, snapshot)
            self.assertTrue(saved.ok, saved.error)

            graph_section = _read_json(root / REACTION_GRAPHS_PATH)
            graph_section["graphs"][0]["nodes"][0]["chemical_object_ids"] = ["missing-object"]
            (root / REACTION_GRAPHS_PATH).write_bytes(_json_bytes(graph_section))
            graph_ref = ProjectContentStore().validate_project(root).value
            assert graph_ref is not None
            self.assertIn("section_decode_error", {issue.code for issue in graph_ref.issues})

            ProjectContentStore().save_snapshot(root, snapshot)
            profile_section = _read_json(root / ENERGY_PROFILES_PATH)
            profile_section["profiles"][0]["graph_id"] = "missing-graph"
            (root / ENERGY_PROFILES_PATH).write_bytes(_json_bytes(profile_section))
            profile_ref = ProjectContentStore().validate_project(root).value
            assert profile_ref is not None
            self.assertIn("section_decode_error", {issue.code for issue in profile_ref.issues})

            ProjectContentStore().save_snapshot(root, snapshot)
            workspace_section = _read_json(root / WORKSPACES_PATH)
            workspace_section["workspaces"][0]["viewport"]["zoom"] = -1
            (root / WORKSPACES_PATH).write_bytes(_json_bytes(workspace_section))
            workspace_ref = ProjectContentStore().validate_project(root).value
            assert workspace_ref is not None
            self.assertIn("section_decode_error", {issue.code for issue in workspace_ref.issues})

            ProjectContentStore().save_snapshot(root, snapshot)
            import_section = _read_json(root / IMPORT_LEDGER_PATH)
            import_section["batches"] = [
                {
                    "id": "batch-a",
                    "project_id": snapshot.project_id,
                    "items": [
                        {
                            "id": "item-a",
                            "source_path_display": "input.log",
                            "status": "registered",
                            "raw_resource_id": None,
                            "preview": None,
                            "registered_object_ids": ["missing-object"],
                            "warnings": [],
                            "error": None,
                        }
                    ],
                }
            ]
            (root / IMPORT_LEDGER_PATH).write_bytes(_json_bytes(import_section))
            import_ref = ProjectContentStore().validate_project(root).value
            assert import_ref is not None
            self.assertIn("section_decode_error", {issue.code for issue in import_ref.issues})

    def test_validate_project_accepts_legacy_energy_semantics_optional_fields(self) -> None:
        fixture = run_core_fixture_vertical_slice()
        self.assertTrue(fixture.ok, fixture.error)
        assert fixture.value is not None
        snapshot = project_content_snapshot_from_fixture(fixture.value)

        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            ProjectStore().create_project("demo", root)
            saved = ProjectContentStore().save_snapshot(root, snapshot)
            self.assertTrue(saved.ok, saved.error)

            graph_section = _read_json(root / REACTION_GRAPHS_PATH)
            del graph_section["graphs"][0]["nodes"][0]["composition"]  # type: ignore[index]
            _write_section_and_refresh_index(root, REACTION_GRAPHS_PATH, graph_section)

            profile_section = _read_json(root / ENERGY_PROFILES_PATH)
            del profile_section["profiles"][0]["points"][0]["expression"]  # type: ignore[index]
            _write_section_and_refresh_index(root, ENERGY_PROFILES_PATH, profile_section)

            report = ProjectContentStore().validate_project(root).value
            loaded = ProjectContentStore().load_snapshot(root)

        assert report is not None
        self.assertTrue(report.ok, report.issues)
        self.assertNotIn("section_decode_error", {issue.code for issue in report.issues})
        self.assertTrue(loaded.ok, loaded.error)
        assert loaded.value is not None
        graph_node = loaded.value.reaction_graphs[0].nodes[0]
        self.assertEqual(graph_node.composition[0].object_id, graph_node.chemical_object_ids[0])
        self.assertEqual(graph_node.composition[0].coefficient, 1.0)
        self.assertIsNone(loaded.value.energy_profiles[0].points[0].expression)

    def test_validate_project_reports_composition_semantics_errors(self) -> None:
        fixture = run_core_fixture_vertical_slice()
        self.assertTrue(fixture.ok, fixture.error)
        assert fixture.value is not None
        snapshot = project_content_snapshot_from_fixture(fixture.value)

        cases = (
            (
                "projection-mismatch",
                lambda section: section["graphs"][0]["nodes"][0].update({"chemical_object_ids": []}),  # type: ignore[index,union-attr]
                "profiles[0].graph_id",
                "graphs[0].nodes[0].chemical_object_ids",
            ),
            (
                "zero-coefficient",
                lambda section: section["graphs"][0]["nodes"][0]["composition"][0].update({"coefficient": 0}),  # type: ignore[index,union-attr]
                "graphs[0].nodes[0].composition",
                "graphs[0].nodes[0].composition",
            ),
            (
                "missing-object",
                lambda section: section["graphs"][0]["nodes"][0].update(
                    {
                        "chemical_object_ids": ["object-missing"],
                        "composition": [{"object_id": "object-missing", "coefficient": 1.0}],
                    }
                ),  # type: ignore[index,union-attr]
                "profiles[0].graph_id",
                "object_id",
            ),
        )

        for label, mutate, _legacy_target, expected_target in cases:
            with self.subTest(label=label):
                with TemporaryDirectory() as tmp:
                    root = Path(tmp) / "demo.rxnflow"
                    ProjectStore().create_project("demo", root)
                    saved = ProjectContentStore().save_snapshot(root, snapshot)
                    self.assertTrue(saved.ok, saved.error)

                    graph_section = _read_json(root / REACTION_GRAPHS_PATH)
                    mutate(graph_section)
                    _write_section_and_refresh_index(root, REACTION_GRAPHS_PATH, graph_section)

                    report = ProjectContentStore().validate_project(root).value

                assert report is not None
                self.assertFalse(report.ok)
                section_issues = [issue for issue in report.issues if issue.code == "section_decode_error"]
                self.assertTrue(section_issues)
                self.assertEqual(section_issues[0].target, expected_target)

    def test_validate_project_reports_expression_semantics_errors(self) -> None:
        fixture = run_core_fixture_vertical_slice()
        self.assertTrue(fixture.ok, fixture.error)
        assert fixture.value is not None
        snapshot = project_content_snapshot_from_fixture(fixture.value)

        cases = (
            (
                "node-mismatch",
                lambda point: point["expression"].update({"node_id": "node-missing"}),
                "profiles[0].points[0].expression.node_id",
            ),
            (
                "bad-source",
                lambda point: point["expression"]["terms"][0].update({"energy_source": "bad-source"}),
                "profiles[0].points[0].expression.terms[0].energy_source",
            ),
            (
                "bad-correction-kind",
                lambda point: point["expression"]["corrections"].append(
                    {
                        "object_id": "object-a",
                        "correction_id": "corr-a",
                        "kind": "bad-kind",
                        "coefficient": 1,
                        "raw_energy": {"value": 1, "unit": "kcal_mol", "reference": None},
                        "converted_energy": {"value": 1, "unit": "kcal_mol", "reference": None},
                        "contribution": {"value": 1, "unit": "kcal_mol", "reference": None},
                    }
                ),
                "profiles[0].points[0].expression.corrections[0].kind",
            ),
            (
                "zero-coefficient",
                lambda point: point["expression"]["terms"][0].update({"coefficient": 0}),
                "profiles[0].points[0].expression.terms[0].coefficient",
            ),
            (
                "converted-unit-mismatch",
                lambda point: point["expression"]["terms"][0]["converted_energy"].update({"unit": "hartree"}),
                "profiles[0].points[0].expression.terms[0].converted_energy.unit",
            ),
            (
                "total-unit-mismatch",
                lambda point: point["expression"]["total"].update({"unit": "hartree"}),
                "profiles[0].points[0].expression.total.unit",
            ),
            (
                "missing-with-total",
                lambda point: point.update({"missing_reason": "missing_energy", "absolute_energy": None, "relative_energy": None}),
                "profiles[0].points[0].expression.total",
            ),
            (
                "non-missing-without-total",
                lambda point: point["expression"].update({"total": None}),
                "profiles[0].points[0].expression.total",
            ),
        )

        for label, mutate_point, expected_target in cases:
            with self.subTest(label=label):
                with TemporaryDirectory() as tmp:
                    root = Path(tmp) / "demo.rxnflow"
                    ProjectStore().create_project("demo", root)
                    saved = ProjectContentStore().save_snapshot(root, snapshot)
                    self.assertTrue(saved.ok, saved.error)

                    profile_section = _read_json(root / ENERGY_PROFILES_PATH)
                    mutate_point(profile_section["profiles"][0]["points"][0])  # type: ignore[index]
                    _write_section_and_refresh_index(root, ENERGY_PROFILES_PATH, profile_section)

                    report = ProjectContentStore().validate_project(root).value

                assert report is not None
                self.assertFalse(report.ok)
                section_issues = [issue for issue in report.issues if issue.code == "section_decode_error"]
                self.assertTrue(section_issues)
                self.assertEqual(section_issues[0].target, expected_target)

    def test_validate_project_deep_checks_export_artifacts(self) -> None:
        record = ExportArtifactRecord(
            id="artifact-main",
            format="png",
            path="exports/main-route.png",
            checksum=f"sha256:{'a' * 64}",
            metadata={"profile_id": "missing-profile", "path_id": "missing-path"},
        )
        snapshot = ProjectContentSnapshot(project_id="project-a", export_artifacts=(record,))

        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            ProjectStore().create_project("demo", root)
            saved = ProjectContentStore().save_snapshot(root, snapshot)
            self.assertTrue(saved.ok, saved.error)

            missing = ProjectContentStore().validate_project(root).value
            assert missing is not None
            self.assertIn("artifact_missing", {issue.code for issue in missing.issues})
            self.assertIn("export_metadata_ref_missing", {issue.code for issue in missing.issues})

            artifact_path = root / record.path
            artifact_path.parent.mkdir(parents=True, exist_ok=True)
            artifact_path.write_bytes(b"not the recorded artifact")
            mismatch = ProjectContentStore().validate_project(root).value
            assert mismatch is not None
            self.assertIn("artifact_checksum_mismatch", {issue.code for issue in mismatch.issues})

            export_section = _read_json(root / EXPORT_ARTIFACTS_PATH)
            export_section["artifacts"][0]["path"] = ".rxnflow/state/not-export.png"
            export_section["artifacts"][0]["checksum"] = "sha256:bad"
            (root / EXPORT_ARTIFACTS_PATH).write_bytes(_json_bytes(export_section))
            bad_record = ProjectContentStore().validate_project(root).value
            assert bad_record is not None
            self.assertIn("section_decode_error", {issue.code for issue in bad_record.issues})

    def test_validate_project_and_migration_plan_do_not_modify_project_files(self) -> None:
        fixture = run_core_fixture_vertical_slice()
        self.assertTrue(fixture.ok, fixture.error)
        assert fixture.value is not None
        fixture_snapshot = project_content_snapshot_from_fixture(fixture.value)

        snapshots = (
            ProjectContentSnapshot(
                project_id="project-a",
                export_artifacts=(
                    ExportArtifactRecord(
                        id="artifact-main",
                        format="png",
                        path="exports/main-route.png",
                        checksum=_checksum(b"artifact-bytes"),
                    ),
                ),
            ),
            fixture_snapshot,
        )

        for snapshot in snapshots:
            with self.subTest(project_id=snapshot.project_id, has_energy=bool(snapshot.energy_profiles)):
                with TemporaryDirectory() as tmp:
                    root = Path(tmp) / "demo.rxnflow"
                    ProjectStore().create_project("demo", root)
                    source = Path(tmp) / "raw.log"
                    source.write_text("raw content", encoding="utf-8")
                    raw = ProjectStore().add_raw_file(root, source)
                    self.assertTrue(raw.ok, raw.error)
                    artifact_path = root / "exports" / "main-route.png"
                    artifact_path.parent.mkdir(parents=True, exist_ok=True)
                    artifact_path.write_bytes(b"artifact-bytes")
                    saved = ProjectContentStore().save_snapshot(root, snapshot)
                    self.assertTrue(saved.ok, saved.error)

                    if snapshot.energy_profiles:
                        graph_section = _read_json(root / REACTION_GRAPHS_PATH)
                        del graph_section["graphs"][0]["nodes"][0]["composition"]  # type: ignore[index]
                        _write_section_and_refresh_index(root, REACTION_GRAPHS_PATH, graph_section)
                        profile_section = _read_json(root / ENERGY_PROFILES_PATH)
                        del profile_section["profiles"][0]["points"][0]["expression"]  # type: ignore[index]
                        _write_section_and_refresh_index(root, ENERGY_PROFILES_PATH, profile_section)

                    before = _tracked_file_bytes(root)

                    report = ProjectContentStore().validate_project(root).value
                    plan = ProjectContentStore().migration_plan(root).value

                    after = _tracked_file_bytes(root)

                assert report is not None
                assert plan is not None
                self.assertFalse(plan.needed)
                self.assertEqual(plan.steps, ())
                self.assertEqual(plan.issues, ())
                self.assertEqual(after, before)

    def test_validate_project_is_stable_and_internal_io_remains_result_error(self) -> None:
        snapshot = ProjectContentSnapshot(project_id="project-a")

        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            ProjectStore().create_project("demo", root)
            saved = ProjectContentStore().save_snapshot(root, snapshot)
            self.assertTrue(saved.ok, saved.error)
            (root / CHEMICAL_OBJECTS_PATH).unlink()

            first = ProjectContentStore().validate_project(root).value
            second = ProjectContentStore().validate_project(root).value

        assert first is not None
        assert second is not None
        self.assertEqual(
            [(issue.severity, issue.code, issue.target) for issue in second.issues],
            [(issue.severity, issue.code, issue.target) for issue in first.issues],
        )

        failed = ProjectContentStore(_InternalReadBackend()).validate_project("project")
        self.assertFalse(failed.ok)
        self.assertEqual(failed.error.code, "internal_error")  # type: ignore[union-attr]

    def test_migration_plan_reports_noop_and_unsupported_versions(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            ProjectStore().create_project("demo", root)
            saved = ProjectContentStore().save_snapshot(root, ProjectContentSnapshot(project_id="project-a"))
            self.assertTrue(saved.ok, saved.error)

            noop = ProjectContentStore().migration_plan(root).value
            unsupported = ProjectContentStore().migration_plan(root, "project-content-v2").value
            index = _read_json(root / PROJECT_CONTENT_INDEX_PATH)
            index["schema_version"] = "project-content-v2"
            (root / PROJECT_CONTENT_INDEX_PATH).write_bytes(_json_bytes(index))
            unsupported_source = ProjectContentStore().migration_plan(root).value

        assert noop is not None
        assert unsupported is not None
        assert unsupported_source is not None
        self.assertFalse(noop.needed)
        self.assertEqual(noop.issues, ())
        self.assertFalse(unsupported.needed)
        self.assertEqual(unsupported.issues[0].code, "unsupported_migration_target")
        self.assertEqual(unsupported.issues[0].severity, "error")
        self.assertEqual(unsupported_source.issues[0].code, "unsupported_migration_source")


def _read_json(path: Path) -> dict[str, object]:
    data = path.read_text(encoding="utf-8")
    parsed = json.loads(data)
    assert isinstance(parsed, dict)
    return parsed


def _tracked_file_bytes(root: Path) -> dict[str, bytes]:
    paths = tuple(sorted(path for path in root.rglob("*") if path.is_file()))
    return {path.relative_to(root).as_posix(): path.read_bytes() for path in paths}


def _write_section_and_refresh_index(root: Path, section_path: str, section: dict[str, object]) -> None:
    payload = _json_bytes(section)
    (root / section_path).write_bytes(payload)

    index_data = _read_json(root / PROJECT_CONTENT_INDEX_PATH)
    parsed_index = _project_content_index_from_dict(index_data, PROJECT_CONTENT_INDEX_PATH)
    assert parsed_index.ok, parsed_index.error
    assert parsed_index.value is not None
    updated_files = []
    for file in parsed_index.value.files:
        if file.path == section_path:
            updated_files.append(
                ProjectContentFile(
                    kind=file.kind,
                    path=file.path,
                    checksum=_checksum(payload),
                    updated_at=file.updated_at,
                )
            )
        else:
            updated_files.append(file)
    updated_index = ProjectContentIndex(
        schema_version=parsed_index.value.schema_version,
        project_id=parsed_index.value.project_id,
        updated_at=parsed_index.value.updated_at,
        files=tuple(updated_files),
    )
    (root / PROJECT_CONTENT_INDEX_PATH).write_bytes(_json_bytes(_project_content_index_to_dict(updated_index)))


def _checksum(payload: bytes) -> str:
    return f"sha256:{sha256(payload).hexdigest()}"


class _InternalReadBackend:
    backend_id = "internal-read-backend"

    def read_object(self, project_ref: str | Path, path: str) -> Any:
        return err(RxnFlowError("internal_error", "boom", target=path))

    def write_object(self, project_ref: str | Path, obj: StorageObject) -> Any:
        raise AssertionError("write_object should not be called")

    def exists(self, project_ref: str | Path, path: str) -> Any:
        raise AssertionError("exists should not be called")

    def list_objects(self, project_ref: str | Path, prefix: str) -> Any:
        raise AssertionError("list_objects should not be called")

    def delete_object(self, project_ref: str | Path, path: str) -> Any:
        raise AssertionError("delete_object should not be called")


if __name__ == "__main__":
    unittest.main()
