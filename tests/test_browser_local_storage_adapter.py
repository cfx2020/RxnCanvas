from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
import unittest

from rxnflow.browser_storage import BrowserLocalProjectStorageBackend
from rxnflow.content_store import (
    CHEMICAL_OBJECTS_PATH,
    PROJECT_MANIFEST_PATH,
    REACTION_GRAPHS_PATH,
    WORKSPACES_PATH,
    ProjectContentSnapshot,
    ProjectContentStore,
    StorageObject,
    project_content_snapshot_from_fixture,
)
from rxnflow.export import ExportArtifactRecord
from rxnflow.fixture import run_core_fixture_vertical_slice
from rxnflow.models import ProjectManifest
from rxnflow.project import PROJECT_TIME
from rxnflow.project_manifest import PROJECT_SCHEMA_VERSION, project_manifest_to_dict


class BrowserLocalStorageAdapterTest(unittest.TestCase):
    def test_backend_contract_skeleton_rejects_unsafe_keys(self) -> None:
        backend = BrowserLocalProjectStorageBackend()

        self.assertEqual(backend.backend_id, "browser-local-indexeddb-opfs-test-v1")
        self.assert_error(
            backend.write_object("", StorageObject(CHEMICAL_OBJECTS_PATH, b"{}")),
            "invalid_input",
            "project_ref",
        )
        self.assert_error(
            backend.write_object("   ", StorageObject(CHEMICAL_OBJECTS_PATH, b"{}")),
            "invalid_input",
            "project_ref",
        )

        for unsafe_path in ("/absolute.json", "../bad.json", "bad\\path.json", "", "."):
            with self.subTest(path=unsafe_path):
                result = backend.write_object("project-a", StorageObject(unsafe_path, b"{}"))
                self.assert_error(result, "invalid_input", "path")

    def test_object_lifecycle_is_isolated_and_sorted(self) -> None:
        backend = BrowserLocalProjectStorageBackend()

        first = backend.write_object(
            "project-a",
            StorageObject(CHEMICAL_OBJECTS_PATH, b'{"old": true}\n', metadata={"kind": "chemical_objects"}),
        )
        self.assertTrue(first.ok, first.error)
        assert first.value is not None
        self.assertEqual(first.value.backend_id, "browser-local-indexeddb-opfs-test-v1")
        self.assertEqual(first.value.byte_size, len(b'{"old": true}\n'))
        self.assertTrue(first.value.checksum.startswith("sha256:"))

        read_first = backend.read_object("project-a", CHEMICAL_OBJECTS_PATH)
        self.assertTrue(read_first.ok, read_first.error)
        assert read_first.value is not None
        self.assertEqual(read_first.value.bytes, b'{"old": true}\n')
        self.assertEqual(read_first.value.checksum, first.value.checksum)
        self.assertEqual(read_first.value.metadata, {"kind": "chemical_objects"})

        replaced = backend.write_object("project-a", StorageObject(CHEMICAL_OBJECTS_PATH, b'{"new": true}\n'))
        self.assertTrue(replaced.ok, replaced.error)
        assert replaced.value is not None
        self.assertNotEqual(replaced.value.checksum, first.value.checksum)
        self.assertEqual(backend.read_object("project-a", CHEMICAL_OBJECTS_PATH).value.bytes, b'{"new": true}\n')  # type: ignore[union-attr]

        write_project_b = backend.write_object("project-b", StorageObject(CHEMICAL_OBJECTS_PATH, b'{"other": true}\n'))
        self.assertTrue(write_project_b.ok, write_project_b.error)
        self.assertEqual(backend.read_object("project-b", CHEMICAL_OBJECTS_PATH).value.bytes, b'{"other": true}\n')  # type: ignore[union-attr]
        self.assertEqual(backend.read_object("project-a", CHEMICAL_OBJECTS_PATH).value.bytes, b'{"new": true}\n')  # type: ignore[union-attr]

        backend.write_object("project-a", StorageObject(WORKSPACES_PATH, b"{}"))
        backend.write_object("project-a", StorageObject(REACTION_GRAPHS_PATH, b"{}"))
        backend.write_object("project-a", StorageObject("exports/profile.png", b"png"))
        listed = backend.list_objects("project-a", ".rxnflow/state")
        exact = backend.list_objects("project-a", CHEMICAL_OBJECTS_PATH)
        self.assertTrue(listed.ok, listed.error)
        self.assertTrue(exact.ok, exact.error)
        self.assertEqual(
            [info.path for info in listed.value],  # type: ignore[union-attr]
            [CHEMICAL_OBJECTS_PATH, REACTION_GRAPHS_PATH, WORKSPACES_PATH],
        )
        self.assertEqual([info.path for info in exact.value], [CHEMICAL_OBJECTS_PATH])  # type: ignore[union-attr]

        self.assertTrue(backend.exists("project-a", CHEMICAL_OBJECTS_PATH).value)
        self.assertFalse(backend.exists("project-a", "exports/missing.png").value)
        missing = backend.read_object("project-a", "exports/missing.png")
        self.assert_error(missing, "invalid_input", "path")

        deleted = backend.delete_object("project-a", CHEMICAL_OBJECTS_PATH)
        self.assertTrue(deleted.ok, deleted.error)
        self.assertFalse(backend.exists("project-a", CHEMICAL_OBJECTS_PATH).value)
        delete_missing = backend.delete_object("project-a", CHEMICAL_OBJECTS_PATH)
        self.assertTrue(delete_missing.ok, delete_missing.error)

    def test_project_content_store_saves_and_loads_snapshot_with_browser_backend(self) -> None:
        fixture = run_core_fixture_vertical_slice()
        self.assertTrue(fixture.ok, fixture.error)
        assert fixture.value is not None
        snapshot = project_content_snapshot_from_fixture(fixture.value)
        backend = BrowserLocalProjectStorageBackend()
        store = ProjectContentStore(backend)

        saved = store.save_snapshot("project-a", snapshot)
        loaded = store.load_snapshot("project-a")

        self.assertTrue(saved.ok, saved.error)
        self.assertTrue(loaded.ok, loaded.error)
        assert loaded.value is not None
        self.assertEqual(loaded.value.project_id, snapshot.project_id)
        self.assertEqual([obj.id for obj in loaded.value.chemical_objects], ["object-a", "object-b"])
        self.assertEqual(loaded.value.reaction_graphs[0].id, "graph-a-b")
        self.assertEqual(loaded.value.workspaces[0].active_path_id, "path-a-b")
        self.assertEqual(loaded.value.energy_profiles[0].id, "profile-a-b-electronic")

    def test_project_content_validation_reads_manifest_and_artifact_bytes_from_browser_backend(self) -> None:
        payload = b"fake png bytes"
        record = ExportArtifactRecord(
            id="artifact-main",
            format="png",
            path="exports/profile.png",
            checksum=_checksum(payload),
        )
        snapshot = ProjectContentSnapshot(project_id="project-a", export_artifacts=(record,))
        manifest = ProjectManifest(
            id="project-a",
            name="demo",
            created_at=PROJECT_TIME,
            updated_at=PROJECT_TIME,
            schema_version=PROJECT_SCHEMA_VERSION,
        )
        backend = BrowserLocalProjectStorageBackend()
        store = ProjectContentStore(backend)

        saved = store.save_snapshot("project-a", snapshot)
        self.assertTrue(saved.ok, saved.error)
        backend.write_object("project-a", StorageObject(PROJECT_MANIFEST_PATH, _json_bytes(project_manifest_to_dict(manifest))))
        backend.write_object("project-a", StorageObject(record.path, payload))
        validation = store.validate_project("project-a")

        self.assertTrue(validation.ok, validation.error)
        assert validation.value is not None
        self.assertTrue(validation.value.ok)
        self.assertEqual(validation.value.project_id, "project-a")
        self.assertEqual(validation.value.issues, ())

    def test_quota_failure_does_not_partially_overwrite_and_releases_after_replace_or_delete(self) -> None:
        backend = BrowserLocalProjectStorageBackend(quota_bytes=10)

        first = backend.write_object("project-a", StorageObject(CHEMICAL_OBJECTS_PATH, b"123456"))
        self.assertTrue(first.ok, first.error)
        too_large_replace = backend.write_object("project-a", StorageObject(CHEMICAL_OBJECTS_PATH, b"12345678901"))
        self.assert_error(too_large_replace, "storage_quota_exceeded", "quota")
        assert too_large_replace.error is not None
        self.assertEqual(too_large_replace.error.details["quota_bytes"], 10)
        self.assertEqual(too_large_replace.error.details["requested_bytes"], 11)
        self.assertEqual(backend.read_object("project-a", CHEMICAL_OBJECTS_PATH).value.bytes, b"123456")  # type: ignore[union-attr]

        smaller = backend.write_object("project-a", StorageObject(CHEMICAL_OBJECTS_PATH, b"12"))
        self.assertTrue(smaller.ok, smaller.error)
        second = backend.write_object("project-a", StorageObject(REACTION_GRAPHS_PATH, b"34567890"))
        self.assertTrue(second.ok, second.error)
        over_quota = backend.write_object("project-a", StorageObject(WORKSPACES_PATH, b"x"))
        self.assert_error(over_quota, "storage_quota_exceeded", "quota")
        self.assertFalse(backend.exists("project-a", WORKSPACES_PATH).value)

        deleted = backend.delete_object("project-a", REACTION_GRAPHS_PATH)
        self.assertTrue(deleted.ok, deleted.error)
        after_delete = backend.write_object("project-a", StorageObject(WORKSPACES_PATH, b"34567890"))
        self.assertTrue(after_delete.ok, after_delete.error)

    def test_scope_guard_no_ui_cloud_or_domain_service_coupling(self) -> None:
        browser_source = Path("rxnflow/browser_storage.py").read_text(encoding="utf-8")
        content_store_source = Path("rxnflow/content_store.py").read_text(encoding="utf-8")

        for forbidden in (
            "FastAPI",
            "React",
            "Next.js",
            "Electron",
            "Tauri",
            "Supabase",
            "Vercel Blob",
            "ParserRegistry",
            "ImportRegistryWorkflow",
            "ChemicalRegistry",
            "ReactionGraphService",
            "EnergyProfileEngine",
            "ReportExportService",
            "ProjectBundleService",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, browser_source)

        self.assertNotIn("IndexedDB", content_store_source)
        self.assertNotIn("OPFS", content_store_source)
        self.assertNotIn("browser quota", content_store_source)

    def assert_error(self, result: object, code: str, target: str) -> None:
        self.assertFalse(result.ok)  # type: ignore[attr-defined]
        self.assertIsNotNone(result.error)  # type: ignore[attr-defined]
        self.assertEqual(result.error.code, code)  # type: ignore[attr-defined]
        self.assertEqual(result.error.target, target)  # type: ignore[attr-defined]


def _checksum(payload: bytes) -> str:
    return f"sha256:{sha256(payload).hexdigest()}"


def _json_bytes(data: dict[str, object]) -> bytes:
    return (json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")
