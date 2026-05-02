from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from rxnflow.models import ProjectResource
from rxnflow.project import ProjectStore
from rxnflow.project_manifest import (
    PROJECT_SCHEMA_VERSION,
    project_manifest_from_dict,
    project_manifest_to_dict,
)


class ProjectStorageModelTest(unittest.TestCase):
    def test_project_manifest_round_trips_through_json_dict(self) -> None:
        store = ProjectStore()
        with TemporaryDirectory() as tmp:
            created = store.create_project("demo", Path(tmp) / "demo.rxnflow")
            self.assertTrue(created.ok, created.error)

            data = project_manifest_to_dict(created.value)  # type: ignore[arg-type]
            loaded = project_manifest_from_dict(data)

            self.assertTrue(loaded.ok, loaded.error)
            self.assertEqual(loaded.value, created.value)

    def test_create_project_writes_manifest_and_raw_directory(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            result = ProjectStore().create_project("demo", root)

            self.assertTrue(result.ok, result.error)
            self.assertEqual(result.value.schema_version, PROJECT_SCHEMA_VERSION)  # type: ignore[union-attr]
            self.assertTrue((root / ".rxnflow" / "manifest.json").is_file())
            self.assertTrue((root / "inputs" / "raw").is_dir())

    def test_create_then_load_returns_equivalent_manifest(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            store = ProjectStore()
            created = store.create_project("demo", root)
            loaded = store.load_project(root)

            self.assertTrue(created.ok, created.error)
            self.assertTrue(loaded.ok, loaded.error)
            self.assertEqual(loaded.value, created.value)

    def test_save_preserves_updated_resources(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            store = ProjectStore()
            created = store.create_project("demo", root)
            self.assertTrue(created.ok, created.error)

            resource = ProjectResource(
                id="raw-test",
                kind="raw_file",
                path="inputs/raw/test.log",
                checksum="sha256:test",
            )
            updated = store.save_project(
                root,
                created.value.__class__(  # type: ignore[union-attr]
                    **{**created.value.__dict__, "resources": (resource,)}  # type: ignore[union-attr]
                ),
            )
            loaded = store.load_project(root)

            self.assertTrue(updated.ok, updated.error)
            self.assertTrue(loaded.ok, loaded.error)
            self.assertEqual(loaded.value.resources, (resource,))  # type: ignore[union-attr]

    def test_add_raw_file_copies_file_and_registers_relative_resource(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            source = Path(tmp) / "input.log"
            source.write_text("raw data", encoding="utf-8")
            store = ProjectStore()
            self.assertTrue(store.create_project("demo", root).ok)

            added = store.add_raw_file(root, source)
            loaded = store.load_project(root)

            self.assertTrue(added.ok, added.error)
            resource = added.value
            self.assertIsNotNone(resource)
            assert resource is not None
            self.assertEqual(resource.kind, "raw_file")
            self.assertTrue(resource.path.startswith("inputs/raw/"))
            self.assertFalse(Path(resource.path).is_absolute())
            self.assertTrue(resource.checksum.startswith("sha256:"))
            self.assertEqual(resource.metadata["source_name"], "input.log")
            self.assertEqual(resource.metadata["byte_size"], 8)
            self.assertEqual((root / resource.path).read_text(encoding="utf-8"), "raw data")
            self.assertEqual(loaded.value.resources, (resource,))  # type: ignore[union-attr]

    def test_add_same_raw_file_is_idempotent(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            source = Path(tmp) / "input.log"
            source.write_text("raw data", encoding="utf-8")
            store = ProjectStore()
            self.assertTrue(store.create_project("demo", root).ok)

            first = store.add_raw_file(root, source)
            second = store.add_raw_file(root, source)
            loaded = store.load_project(root)

            self.assertTrue(first.ok, first.error)
            self.assertTrue(second.ok, second.error)
            self.assertEqual(second.value, first.value)
            self.assertEqual(len(loaded.value.resources), 1)  # type: ignore[union-attr]

    def test_load_non_project_directory_returns_invalid_input(self) -> None:
        with TemporaryDirectory() as tmp:
            result = ProjectStore().load_project(Path(tmp) / "not-a-project")

            self.assertFalse(result.ok)
            self.assertIsNotNone(result.error)
            assert result.error is not None
            self.assertEqual(result.error.code, "invalid_input")
            self.assertTrue(result.error.target.endswith(".rxnflow/manifest.json"))

    def test_load_corrupt_manifest_returns_invalid_input(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            store = ProjectStore()
            self.assertTrue(store.create_project("demo", root).ok)
            (root / ".rxnflow" / "manifest.json").write_text("{bad json", encoding="utf-8")

            result = store.load_project(root)

            self.assertFalse(result.ok)
            self.assertIsNotNone(result.error)
            assert result.error is not None
            self.assertEqual(result.error.code, "invalid_input")

    def test_load_incompatible_schema_returns_invalid_input(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            store = ProjectStore()
            self.assertTrue(store.create_project("demo", root).ok)
            manifest_path = root / ".rxnflow" / "manifest.json"
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            data["schema_version"] = "project-v0"
            manifest_path.write_text(json.dumps(data), encoding="utf-8")

            result = store.load_project(root)

            self.assertFalse(result.ok)
            self.assertIsNotNone(result.error)
            assert result.error is not None
            self.assertEqual(result.error.code, "invalid_input")

    def test_manifest_rejects_absolute_resource_path(self) -> None:
        data = {
            "id": "project-demo",
            "name": "demo",
            "created_at": "2026-05-02T00:00:00Z",
            "updated_at": "2026-05-02T00:00:00Z",
            "schema_version": PROJECT_SCHEMA_VERSION,
            "resources": [
                {"id": "raw-test", "kind": "raw_file", "path": "/tmp/input.log"}
            ],
        }

        result = project_manifest_from_dict(data)

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "invalid_input")

    def test_manifest_rejects_unknown_resource_kind(self) -> None:
        data = {
            "id": "project-demo",
            "name": "demo",
            "created_at": "2026-05-02T00:00:00Z",
            "updated_at": "2026-05-02T00:00:00Z",
            "schema_version": PROJECT_SCHEMA_VERSION,
            "resources": [
                {"id": "raw-test", "kind": "unknown_resource", "path": "inputs/raw/test.log"}
            ],
        }

        result = project_manifest_from_dict(data)

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "invalid_input")

    def test_manifest_rejects_non_string_resource_path(self) -> None:
        data = {
            "id": "project-demo",
            "name": "demo",
            "created_at": "2026-05-02T00:00:00Z",
            "updated_at": "2026-05-02T00:00:00Z",
            "schema_version": PROJECT_SCHEMA_VERSION,
            "resources": [
                {"id": "raw-test", "kind": "raw_file", "path": 123}
            ],
        }

        result = project_manifest_from_dict(data)

        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error)
        assert result.error is not None
        self.assertEqual(result.error.code, "invalid_input")

    def test_add_raw_file_missing_source_returns_invalid_input(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "demo.rxnflow"
            store = ProjectStore()
            self.assertTrue(store.create_project("demo", root).ok)

            result = store.add_raw_file(root, Path(tmp) / "missing.log")

            self.assertFalse(result.ok)
            self.assertIsNotNone(result.error)
            assert result.error is not None
            self.assertEqual(result.error.code, "invalid_input")


if __name__ == "__main__":
    unittest.main()
