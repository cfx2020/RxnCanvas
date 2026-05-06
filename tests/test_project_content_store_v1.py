from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from rxnflow.content_store import (
    CHEMICAL_OBJECTS_PATH,
    ENERGY_PROFILES_PATH,
    PROJECT_CONTENT_INDEX_PATH,
    PROJECT_CONTENT_SCHEMA_VERSION,
    REACTION_GRAPHS_PATH,
    WORKSPACES_PATH,
    LocalProjectStorageBackend,
    ProjectContentFile,
    ProjectContentIndex,
    ProjectContentSnapshot,
    ProjectContentStore,
    StorageObject,
    WriteReceipt,
    project_content_snapshot_from_fixture,
)
from rxnflow.fixture import run_core_fixture_vertical_slice
from rxnflow.project import ProjectStore


class ProjectContentStoreV1Test(unittest.TestCase):
    def test_contracts_and_local_backend_io(self) -> None:
        index = ProjectContentIndex(
            schema_version=PROJECT_CONTENT_SCHEMA_VERSION,
            project_id="project-a",
            updated_at="2026-05-05T00:00:00Z",
            files=(ProjectContentFile("chemical_objects", CHEMICAL_OBJECTS_PATH, "sha256:test"),),
        )
        snapshot = ProjectContentSnapshot(project_id="project-a")
        receipt_type = WriteReceipt(
            path=CHEMICAL_OBJECTS_PATH,
            checksum="sha256:test",
            byte_size=2,
            updated_at="2026-05-05T00:00:00Z",
            backend_id="local-filesystem-v1",
        )

        self.assertEqual(index.schema_version, "project-content-v1")
        self.assertEqual(snapshot.project_id, "project-a")
        self.assertEqual(receipt_type.backend_id, "local-filesystem-v1")

        backend = LocalProjectStorageBackend()
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            payload = b'{"ok": true}\n'
            written = backend.write_object(root, StorageObject(CHEMICAL_OBJECTS_PATH, payload))

            self.assertTrue(written.ok, written.error)
            receipt = written.value
            assert receipt is not None
            self.assertEqual(receipt.backend_id, "local-filesystem-v1")
            self.assertEqual(receipt.byte_size, len(payload))
            self.assertTrue(receipt.checksum.startswith("sha256:"))
            self.assertTrue((root / CHEMICAL_OBJECTS_PATH).is_file())

            read = backend.read_object(root, CHEMICAL_OBJECTS_PATH)
            self.assertTrue(read.ok, read.error)
            self.assertEqual(read.value.bytes, payload)  # type: ignore[union-attr]
            self.assertEqual(read.value.checksum, receipt.checksum)  # type: ignore[union-attr]

            exists = backend.exists(root, CHEMICAL_OBJECTS_PATH)
            listed = backend.list_objects(root, ".rxnflow/state")
            self.assertTrue(exists.ok, exists.error)
            self.assertTrue(exists.value)
            self.assertTrue(listed.ok, listed.error)
            self.assertEqual(listed.value[0].path, CHEMICAL_OBJECTS_PATH)  # type: ignore[index,union-attr]

            deleted = backend.delete_object(root, CHEMICAL_OBJECTS_PATH)
            self.assertTrue(deleted.ok, deleted.error)
            self.assertFalse((root / CHEMICAL_OBJECTS_PATH).exists())

        for unsafe_path in ("/absolute.json", "../bad.json", "bad\\path.json", "", "."):
            result = backend.write_object("/tmp/project", StorageObject(unsafe_path, b"{}"))
            self.assert_error(result, "invalid_input", "path")
        self.assert_error(
            backend.write_object("", StorageObject(CHEMICAL_OBJECTS_PATH, b"{}")),
            "invalid_input",
            "project_ref",
        )

    def test_content_store_saves_and_loads_fixture_snapshot_without_manifest_changes(self) -> None:
        fixture = run_core_fixture_vertical_slice()
        self.assertTrue(fixture.ok, fixture.error)
        assert fixture.value is not None
        snapshot = project_content_snapshot_from_fixture(fixture.value)

        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            created = ProjectStore().create_project("demo", root)
            self.assertTrue(created.ok, created.error)
            manifest_before = (root / ".rxnflow" / "manifest.json").read_text(encoding="utf-8")

            store = ProjectContentStore(LocalProjectStorageBackend())
            saved = store.save_snapshot(root, snapshot)

            self.assertTrue(saved.ok, saved.error)
            index = saved.value
            assert index is not None
            self.assertEqual(index.schema_version, PROJECT_CONTENT_SCHEMA_VERSION)
            self.assertEqual(index.project_id, snapshot.project_id)
            self.assertEqual(
                {file.kind for file in index.files},
                {"chemical_objects", "reaction_graphs", "workspaces", "energy_profiles"},
            )
            self.assertEqual({file.path for file in index.files}, set(_state_paths()))
            for file in index.files:
                self.assertTrue(file.checksum.startswith("sha256:"))  # type: ignore[union-attr]
                self.assertTrue((root / file.path).is_file())
            self.assertTrue((root / PROJECT_CONTENT_INDEX_PATH).is_file())

            repeated = store.save_snapshot(root, snapshot)
            self.assertTrue(repeated.ok, repeated.error)
            self.assertEqual(
                [(file.kind, file.path, file.checksum) for file in repeated.value.files],  # type: ignore[union-attr]
                [(file.kind, file.path, file.checksum) for file in index.files],
            )

            loaded = ProjectContentStore(LocalProjectStorageBackend()).load_snapshot(root)

            self.assertTrue(loaded.ok, loaded.error)
            restored = loaded.value
            assert restored is not None
            self.assertEqual(restored.project_id, snapshot.project_id)
            self.assertEqual([obj.id for obj in restored.chemical_objects], ["object-a", "object-b"])
            self.assertEqual(restored.chemical_objects[0].energies["electronic"].unit, "hartree")
            self.assertEqual(restored.reaction_graphs[0].id, "graph-a-b")
            self.assertEqual(restored.reaction_graphs[0].paths[0].id, "path-a-b")
            self.assertEqual(restored.workspaces[0].graph.id, "graph-a-b")
            self.assertEqual(restored.workspaces[0].active_path_id, "path-a-b")
            self.assertEqual(restored.workspaces[0].palette[0].object_id, "object-a")
            self.assertEqual(restored.energy_profiles[0].id, "profile-a-b-electronic")
            self.assertEqual(len(restored.energy_profiles[0].points), 2)

            manifest_after = (root / ".rxnflow" / "manifest.json").read_text(encoding="utf-8")
            self.assertEqual(manifest_after, manifest_before)
            self.assertEqual(ProjectStore().load_project(root).value.resources, ())  # type: ignore[union-attr]

    def test_load_errors_are_structured_and_do_not_silent_fallback(self) -> None:
        backend = LocalProjectStorageBackend()
        store = ProjectContentStore(backend)
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"

            missing = store.load_index(root)
            self.assert_error(missing, "invalid_input", "path")

            backend.write_object(
                root,
                StorageObject(
                    PROJECT_CONTENT_INDEX_PATH,
                    _json_bytes({"schema_version": "project-content-v2", "project_id": "project-a", "files": []}),
                ),
            )
            bad_schema = store.load_snapshot(root)
            self.assert_error(bad_schema, "invalid_input", "schema_version")

            backend.write_object(
                root,
                StorageObject(
                    PROJECT_CONTENT_INDEX_PATH,
                    _json_bytes(
                        {
                            "schema_version": PROJECT_CONTENT_SCHEMA_VERSION,
                            "project_id": "project-a",
                            "updated_at": "2026-05-05T00:00:00Z",
                            "files": [
                                {
                                    "kind": "chemical_objects",
                                    "path": CHEMICAL_OBJECTS_PATH,
                                    "checksum": "sha256:test",
                                    "updated_at": "2026-05-05T00:00:00Z",
                                }
                            ],
                        }
                    ),
                ),
            )
            backend.write_object(root, StorageObject(CHEMICAL_OBJECTS_PATH, b"{bad json"))
            bad_json = store.load_snapshot(root)
            self.assertFalse(bad_json.ok)
            self.assertEqual(bad_json.error.code, "invalid_input")  # type: ignore[union-attr]

            backend.write_object(
                root,
                StorageObject(
                    PROJECT_CONTENT_INDEX_PATH,
                    _json_bytes(
                        {
                            "schema_version": PROJECT_CONTENT_SCHEMA_VERSION,
                            "project_id": "project-a",
                            "updated_at": "2026-05-05T00:00:00Z",
                            "files": [
                                {
                                    "kind": "chemical_objects",
                                    "path": ".rxnflow/state/missing.json",
                                    "checksum": "sha256:test",
                                    "updated_at": "2026-05-05T00:00:00Z",
                                }
                            ],
                        }
                    ),
                ),
            )
            missing_section = store.load_snapshot(root)
            self.assert_error(missing_section, "invalid_input", "path")

    def test_scope_guard_and_existing_core_fixture_still_passes(self) -> None:
        fixture = run_core_fixture_vertical_slice()
        self.assertTrue(fixture.ok, fixture.error)

        source = Path("rxnflow/content_store.py").read_text(encoding="utf-8")
        for forbidden in (
            "IndexedDB",
            "OPFS",
            "Supabase",
            "Vercel Blob",
            "ParserRegistry",
            "ImportRegistryWorkflow",
            "ChemicalRegistry",
            "ReactionGraphService",
            "EnergyProfileEngine",
            "ReportExportService",
            "GraphPatch",
            "argparse",
            "FastAPI",
        ):
            self.assertNotIn(forbidden, source)

    def assert_error(self, result: object, code: str, target: str) -> None:
        self.assertFalse(result.ok)  # type: ignore[attr-defined]
        self.assertIsNotNone(result.error)  # type: ignore[attr-defined]
        self.assertEqual(result.error.code, code)  # type: ignore[attr-defined]
        self.assertEqual(result.error.target, target)  # type: ignore[attr-defined]


def _state_paths() -> tuple[str, ...]:
    return (
        CHEMICAL_OBJECTS_PATH,
        REACTION_GRAPHS_PATH,
        WORKSPACES_PATH,
        ENERGY_PROFILES_PATH,
    )


def _json_bytes(data: dict[str, object]) -> bytes:
    return (json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")


if __name__ == "__main__":
    unittest.main()
