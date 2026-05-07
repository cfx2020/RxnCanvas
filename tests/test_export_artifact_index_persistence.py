from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from rxnflow.content_store import (
    EXPORT_ARTIFACTS_PATH,
    PROJECT_CONTENT_INDEX_PATH,
    PROJECT_CONTENT_SCHEMA_VERSION,
    LocalProjectStorageBackend,
    ProjectContentSnapshot,
    ProjectContentStore,
    StorageObject,
)
from rxnflow.export import ExportArtifactRecord
from rxnflow.export_artifact_codec import (
    EXPORT_ARTIFACTS_SCHEMA_VERSION,
    export_artifacts_section_from_dict,
    export_artifacts_section_to_dict,
)
from rxnflow.project import ProjectStore


PROJECT_ID = "project-a"
CHECKSUM = f"sha256:{'a' * 64}"


class ExportArtifactIndexPersistenceTest(unittest.TestCase):
    def test_record_and_section_round_trip_without_bytes(self) -> None:
        record = _record()

        section = export_artifacts_section_to_dict(PROJECT_ID, (record,))

        self.assertTrue(section.ok, section.error)
        payload = section.value
        assert payload is not None
        artifact = payload["artifacts"][0]
        self.assertEqual(payload["schema_version"], EXPORT_ARTIFACTS_SCHEMA_VERSION)
        self.assertEqual(artifact["id"], record.id)
        self.assertEqual(artifact["format"], "png")
        self.assertEqual(artifact["path"], "exports/main-route.png")
        self.assertEqual(artifact["checksum"], CHECKSUM)
        self.assertEqual(artifact["metadata"]["writer_id"], "pillow-energy-plot-v1")
        self.assertNotIn("bytes", artifact)

        restored = export_artifacts_section_from_dict(PROJECT_ID, payload)

        self.assertTrue(restored.ok, restored.error)
        self.assertEqual(restored.value, (record,))

    def test_content_store_persists_export_artifact_index_with_stable_checksum(self) -> None:
        record = _record()
        snapshot = ProjectContentSnapshot(project_id=PROJECT_ID, export_artifacts=(record,))

        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            created = ProjectStore().create_project("demo", root)
            self.assertTrue(created.ok, created.error)
            manifest_before = (root / ".rxnflow" / "manifest.json").read_text(encoding="utf-8")

            store = ProjectContentStore()
            saved = store.save_snapshot(root, snapshot)
            repeated = store.save_snapshot(root, snapshot)

            self.assertTrue(saved.ok, saved.error)
            self.assertTrue(repeated.ok, repeated.error)
            export_file = next(file for file in saved.value.files if file.kind == "export_artifacts")  # type: ignore[union-attr]
            repeated_file = next(file for file in repeated.value.files if file.kind == "export_artifacts")  # type: ignore[union-attr]
            self.assertEqual(export_file.path, EXPORT_ARTIFACTS_PATH)
            self.assertEqual(export_file.checksum, repeated_file.checksum)
            self.assertTrue((root / EXPORT_ARTIFACTS_PATH).is_file())
            self.assertFalse((root / record.path).exists())

            section = json.loads((root / EXPORT_ARTIFACTS_PATH).read_text(encoding="utf-8"))
            self.assertEqual(section["artifacts"][0]["path"], record.path)
            self.assertNotIn("bytes", section["artifacts"][0])

            loaded = store.load_snapshot(root)

            self.assertTrue(loaded.ok, loaded.error)
            restored_record = loaded.value.export_artifacts[0]  # type: ignore[union-attr]
            self.assertEqual(restored_record.id, record.id)
            self.assertEqual(restored_record.metadata["profile_id"], "profile-main")
            index_kinds = {file.kind for file in saved.value.files}  # type: ignore[union-attr]
            self.assertIn("export_artifacts", index_kinds)

            manifest_after = (root / ".rxnflow" / "manifest.json").read_text(encoding="utf-8")
            self.assertEqual(manifest_after, manifest_before)
            self.assertEqual(ProjectStore().load_project(root).value.resources, ())  # type: ignore[union-attr]

    def test_section_validation_errors_are_structured(self) -> None:
        valid = export_artifacts_section_to_dict(PROJECT_ID, (_record(),)).value
        assert valid is not None

        duplicate_path = deepcopy(valid["artifacts"][0])
        duplicate_path["id"] = "artifact-other"

        cases = (
            ({**valid, "schema_version": "export-artifacts-v2"}, "export_artifacts"),
            ({**valid, "project_id": "project-b"}, "export_artifacts"),
            ({**valid, "artifacts": "not-list"}, "artifacts"),
            ({**valid, "artifacts": [42]}, "artifacts[0]"),
            ({**valid, "artifacts": [valid["artifacts"][0], valid["artifacts"][0]]}, "artifact-main"),
            ({**valid, "artifacts": [valid["artifacts"][0], duplicate_path]}, "exports/main-route.png"),
            (_with_artifact_patch(valid, {"format": "gif"}), "artifacts[0].format"),
            (_with_artifact_patch(valid, {"path": "/tmp/main-route.png"}), "artifacts[0].path"),
            (_with_artifact_patch(valid, {"path": "exports/../main-route.png"}), "artifacts[0].path"),
            (_with_artifact_patch(valid, {"path": "exports\\main-route.png"}), "artifacts[0].path"),
            (_with_artifact_patch(valid, {"path": ""}), "artifacts[0].path"),
            (_with_artifact_patch(valid, {"path": ".rxnflow/state/main-route.png"}), "artifacts[0].path"),
            (_without_artifact_field(valid, "checksum"), "artifacts[0].checksum"),
            (_with_artifact_patch(valid, {"checksum": "sha256:bad"}), "artifacts[0].checksum"),
            (_with_artifact_patch(valid, {"metadata": "not-object"}), "artifacts[0].metadata"),
            (_with_artifact_patch(valid, {"metadata": {"payload": b"png-bytes"}}), "artifacts[0].metadata.payload"),
            (_with_artifact_patch(valid, {"metadata": {"route": ("node-a", "node-b")}}), "artifacts[0].metadata.route"),
            (_with_artifact_patch(valid, {"metadata": {"path": Path("exports/main-route.png")}}), "artifacts[0].metadata.path"),
            (_with_artifact_patch(valid, {"created_at": None}), "artifacts[0].created_at"),
        )

        for section, target in cases:
            with self.subTest(target=target):
                result = export_artifacts_section_from_dict(PROJECT_ID, section)
                self.assert_error(result, "invalid_input", target)

    def test_project_content_store_uses_export_artifact_errors(self) -> None:
        backend = LocalProjectStorageBackend()
        store = ProjectContentStore(backend)
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            backend.write_object(
                root,
                StorageObject(
                    PROJECT_CONTENT_INDEX_PATH,
                    _json_bytes(
                        {
                            "schema_version": PROJECT_CONTENT_SCHEMA_VERSION,
                            "project_id": PROJECT_ID,
                            "updated_at": "2026-05-05T00:00:00Z",
                            "files": [
                                {
                                    "kind": "export_artifacts",
                                    "path": EXPORT_ARTIFACTS_PATH,
                                    "checksum": "sha256:test",
                                    "updated_at": "2026-05-05T00:00:00Z",
                                }
                            ],
                        }
                    ),
                ),
            )
            backend.write_object(
                root,
                StorageObject(
                    EXPORT_ARTIFACTS_PATH,
                    _json_bytes({"schema_version": "export-artifacts-v2", "project_id": PROJECT_ID, "artifacts": []}),
                ),
            )

            loaded = store.load_snapshot(root)

            self.assert_error(loaded, "invalid_input", "export_artifacts")

    def test_scope_guard_does_not_call_writers_or_unrelated_domains(self) -> None:
        content_source = Path("rxnflow/content_store.py").read_text(encoding="utf-8")
        codec_source = Path("rxnflow/export_artifact_codec.py").read_text(encoding="utf-8")
        combined = "\n".join((content_source, codec_source))

        for forbidden in (
            "ReportExportService",
            "ParserRegistry",
            "ImportRegistryWorkflow",
            "ChemicalRegistry",
            "ChemicalRegistry.register",
            "ReactionGraphService",
            "apply_patch",
            "EnergyProfileEngine",
            "PlatformShellService",
            "ProjectResource(",
            "CDX",
            "PDF",
            "PPTX",
            "SVG",
            "CSV",
        ):
            self.assertNotIn(forbidden, combined)

    def assert_error(self, result: object, code: str, target: str) -> None:
        self.assertFalse(result.ok)  # type: ignore[attr-defined]
        self.assertIsNotNone(result.error)  # type: ignore[attr-defined]
        self.assertEqual(result.error.code, code)  # type: ignore[attr-defined]
        self.assertEqual(result.error.target, target)  # type: ignore[attr-defined]


def _record() -> ExportArtifactRecord:
    return ExportArtifactRecord(
        id="artifact-main",
        format="png",
        path="exports/main-route.png",
        checksum=CHECKSUM,
        created_at="2026-05-07T00:00:00Z",
        metadata={
            "profile_id": "profile-main",
            "path_id": "path-main",
            "writer_id": "pillow-energy-plot-v1",
            "warnings": [],
        },
    )


def _with_artifact_patch(section: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    updated = deepcopy(section)
    updated["artifacts"][0].update(patch)  # type: ignore[index,union-attr]
    return updated


def _without_artifact_field(section: dict[str, object], field: str) -> dict[str, object]:
    updated = deepcopy(section)
    del updated["artifacts"][0][field]  # type: ignore[index,union-attr]
    return updated


def _json_bytes(data: dict[str, object]) -> bytes:
    return (json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")


if __name__ == "__main__":
    unittest.main()
