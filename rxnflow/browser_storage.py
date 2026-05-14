"""Browser-local project storage backend test double."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from hashlib import sha256
from pathlib import PurePosixPath

from .content_store import PROJECT_CONTENT_TIME, StorageObject, StorageObjectInfo, WriteReceipt
from .errors import RxnFlowError
from .result import Result, err, ok


class BrowserLocalProjectStorageBackend:
    backend_id = "browser-local-indexeddb-opfs-test-v1"

    def __init__(self, *, quota_bytes: int | None = None) -> None:
        self._quota_bytes = quota_bytes
        self._objects: dict[str, dict[str, _ObjectRecord]] = {}

    def read_object(self, project_ref: str | os.PathLike[str], path: str) -> Result[StorageObject]:
        project_key = _validate_project_ref(project_ref)
        if project_key is None:
            return err(_project_ref_error())
        path_error = _validate_logical_path(path)
        if path_error is not None:
            return err(path_error)
        record = self._objects.get(project_key, {}).get(path)
        if record is None:
            return err(_missing_object_error(path))
        return ok(
            StorageObject(
                path=path,
                bytes=record.bytes,
                checksum=record.checksum,
                metadata=dict(record.metadata),
            )
        )

    def write_object(
        self,
        project_ref: str | os.PathLike[str],
        obj: StorageObject,
    ) -> Result[WriteReceipt]:
        project_key = _validate_project_ref(project_ref)
        if project_key is None:
            return err(_project_ref_error())
        path_error = _validate_logical_path(obj.path)
        if path_error is not None:
            return err(path_error)
        checksum = _checksum_bytes(obj.bytes)
        records = self._objects.setdefault(project_key, {})
        quota_error = self._quota_error(records, obj.path, len(obj.bytes))
        if quota_error is not None:
            return err(quota_error)
        records[obj.path] = _ObjectRecord(
            bytes=obj.bytes,
            checksum=checksum,
            metadata=dict(obj.metadata),
        )
        return ok(
            WriteReceipt(
                path=obj.path,
                checksum=checksum,
                byte_size=len(obj.bytes),
                updated_at=PROJECT_CONTENT_TIME,
                backend_id=self.backend_id,
            )
        )

    def exists(self, project_ref: str | os.PathLike[str], path: str) -> Result[bool]:
        project_key = _validate_project_ref(project_ref)
        if project_key is None:
            return err(_project_ref_error())
        path_error = _validate_logical_path(path)
        if path_error is not None:
            return err(path_error)
        return ok(path in self._objects.get(project_key, {}))

    def list_objects(
        self,
        project_ref: str | os.PathLike[str],
        prefix: str,
    ) -> Result[tuple[StorageObjectInfo, ...]]:
        project_key = _validate_project_ref(project_ref)
        if project_key is None:
            return err(_project_ref_error())
        path_error = _validate_logical_path(prefix)
        if path_error is not None:
            return err(path_error)
        records = self._objects.get(project_key, {})
        prefix_root = f"{prefix.rstrip('/')}/"
        infos = [
            StorageObjectInfo(
                path=path,
                checksum=record.checksum,
                byte_size=len(record.bytes),
                backend_id=self.backend_id,
            )
            for path, record in sorted(records.items())
            if path == prefix or path.startswith(prefix_root)
        ]
        return ok(tuple(infos))

    def delete_object(self, project_ref: str | os.PathLike[str], path: str) -> Result[None]:
        project_key = _validate_project_ref(project_ref)
        if project_key is None:
            return err(_project_ref_error())
        path_error = _validate_logical_path(path)
        if path_error is not None:
            return err(path_error)
        records = self._objects.get(project_key)
        if records is not None:
            records.pop(path, None)
        return ok(None)

    def _quota_error(
        self,
        records: dict[str, "_ObjectRecord"],
        path: str,
        byte_size: int,
    ) -> RxnFlowError | None:
        if self._quota_bytes is None:
            return None
        current_bytes = sum(len(record.bytes) for record in records.values())
        existing_bytes = len(records[path].bytes) if path in records else 0
        requested_bytes = current_bytes - existing_bytes + byte_size
        if requested_bytes <= self._quota_bytes:
            return None
        return RxnFlowError(
            "storage_quota_exceeded",
            "Browser local storage quota would be exceeded.",
            target="quota",
            details={
                "quota_bytes": self._quota_bytes,
                "requested_bytes": requested_bytes,
                "current_bytes": current_bytes,
            },
        )


@dataclass(frozen=True)
class _ObjectRecord:
    bytes: bytes
    checksum: str
    metadata: dict[str, object] = field(default_factory=dict)


def _validate_project_ref(project_ref: str | os.PathLike[str]) -> str | None:
    try:
        value = os.fspath(project_ref)
    except TypeError:
        return None
    if not isinstance(value, str) or value.strip() == "":
        return None
    return value


def _validate_logical_path(path: str) -> RxnFlowError | None:
    if not isinstance(path, str) or path.strip() == "":
        return RxnFlowError("invalid_input", "Project storage path is required.", target="path")
    if "\\" in path:
        return RxnFlowError("invalid_input", "Project storage path must be POSIX relative.", target="path")
    posix_path = PurePosixPath(path)
    if posix_path.is_absolute() or str(posix_path) in {"", "."} or ".." in posix_path.parts:
        return RxnFlowError("invalid_input", "Project storage path must be project-relative.", target="path")
    return None


def _project_ref_error() -> RxnFlowError:
    return RxnFlowError("invalid_input", "Browser local project reference is required.", target="project_ref")


def _missing_object_error(path: str) -> RxnFlowError:
    return RxnFlowError(
        "invalid_input",
        "Browser local storage object does not exist.",
        target="path",
        details={"path": path},
    )


def _checksum_bytes(payload: bytes) -> str:
    return f"sha256:{sha256(payload).hexdigest()}"
