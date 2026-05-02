"""Project helpers and filesystem-backed project store."""

from __future__ import annotations

import json
import os
import shutil
from hashlib import sha256
from dataclasses import replace
from pathlib import Path

from .errors import RxnFlowError
from .models import ProjectManifest, ProjectResource
from .project_manifest import PROJECT_SCHEMA_VERSION, project_manifest_from_dict, project_manifest_to_dict
from .result import Result, err, ok

FIXTURE_TIME = "1970-01-01T00:00:00Z"
FIXTURE_SCHEMA_VERSION = "fixture-v0"
PROJECT_TIME = "2026-05-02T00:00:00Z"
RXNFLOW_DIR = ".rxnflow"
MANIFEST_NAME = "manifest.json"
RAW_INPUT_DIR = Path("inputs") / "raw"


def create_project(project_name: str) -> ProjectManifest:
    return ProjectManifest(
        id=f"project-{project_name}",
        name=project_name,
        created_at=FIXTURE_TIME,
        updated_at=FIXTURE_TIME,
        schema_version=FIXTURE_SCHEMA_VERSION,
    )


def attach_resources(
    project: ProjectManifest,
    resources: tuple[ProjectResource, ...],
) -> ProjectManifest:
    return replace(project, resources=resources)


class ProjectStore:
    def create_project(self, name: str, location: str | os.PathLike[str]) -> Result[ProjectManifest]:
        project_path = Path(location)
        try:
            project_path.mkdir(parents=True, exist_ok=True)
            (project_path / RXNFLOW_DIR).mkdir(parents=True, exist_ok=True)
            (project_path / RAW_INPUT_DIR).mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message=f"Cannot create project directory: {exc}.",
                    target=str(project_path),
                )
            )

        manifest = ProjectManifest(
            id=f"project-{name}",
            name=name,
            created_at=PROJECT_TIME,
            updated_at=PROJECT_TIME,
            schema_version=PROJECT_SCHEMA_VERSION,
        )
        save_result = self.save_project(project_path, manifest)
        if not save_result.ok:
            return save_result
        return ok(manifest)

    def load_project(self, project_path: str | os.PathLike[str]) -> Result[ProjectManifest]:
        manifest_path = _manifest_path(Path(project_path))
        if not manifest_path.is_file():
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Project manifest does not exist.",
                    target=str(manifest_path),
                )
            )

        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message=f"Project manifest is not valid JSON: {exc.msg}.",
                    target=str(manifest_path),
                )
            )
        except OSError as exc:
            return err(
                RxnFlowError(
                    code="internal_error",
                    message=f"Failed to read project manifest: {exc}.",
                    target=str(manifest_path),
                )
            )
        if not isinstance(data, dict):
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Project manifest must be a JSON object.",
                    target=str(manifest_path),
                )
            )
        return project_manifest_from_dict(data, str(manifest_path))

    def save_project(
        self,
        project_path: str | os.PathLike[str],
        manifest: ProjectManifest,
    ) -> Result[ProjectManifest]:
        root = Path(project_path)
        manifest_path = _manifest_path(root)
        try:
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            (root / RAW_INPUT_DIR).mkdir(parents=True, exist_ok=True)
            _write_manifest_atomically(manifest_path, project_manifest_to_dict(manifest))
        except OSError as exc:
            return err(
                RxnFlowError(
                    code="internal_error",
                    message=f"Failed to write project manifest: {exc}.",
                    target=str(manifest_path),
                )
            )
        return ok(manifest)

    def add_raw_file(
        self,
        project_path: str | os.PathLike[str],
        source_path: str | os.PathLike[str],
    ) -> Result[ProjectResource]:
        root = Path(project_path)
        source = Path(source_path)
        manifest_result = self.load_project(root)
        if not manifest_result.ok or manifest_result.value is None:
            return manifest_result
        manifest = manifest_result.value

        if not source.is_file():
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Raw file source path does not exist or is not a file.",
                    target=str(source),
                )
            )

        checksum_result = _sha256_file(source)
        if not checksum_result.ok or checksum_result.value is None:
            return checksum_result
        checksum = checksum_result.value
        existing = _find_resource_by_checksum(manifest, checksum)
        if existing is not None:
            return ok(existing)

        destination_relative = _raw_file_relative_path(source.name, checksum)
        destination = root / destination_relative
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
        except OSError as exc:
            return err(
                RxnFlowError(
                    code="internal_error",
                    message=f"Failed to copy raw file into project: {exc}.",
                    target=str(destination),
                )
            )

        try:
            byte_size = source.stat().st_size
        except OSError as exc:
            return err(
                RxnFlowError(
                    code="internal_error",
                    message=f"Failed to stat raw file source: {exc}.",
                    target=str(source),
                )
            )

        resource = ProjectResource(
            id=f"raw-{checksum.removeprefix('sha256:')[:12]}",
            kind="raw_file",
            path=destination_relative.as_posix(),
            checksum=checksum,
            metadata={"source_name": source.name, "byte_size": byte_size},
        )
        updated = attach_resources(manifest, (*manifest.resources, resource))
        save_result = self.save_project(root, updated)
        if not save_result.ok and save_result.error is not None:
            return err(save_result.error)
        if not save_result.ok:
            return err(
                RxnFlowError(
                    code="internal_error",
                    message="Failed to save project manifest.",
                    target=str(_manifest_path(root)),
                )
            )
        return ok(resource)


def _manifest_path(project_path: Path) -> Path:
    return project_path / RXNFLOW_DIR / MANIFEST_NAME


def _write_manifest_atomically(manifest_path: Path, data: dict[str, object]) -> None:
    tmp_path = manifest_path.with_suffix(".json.tmp")
    tmp_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    tmp_path.replace(manifest_path)


def _sha256_file(path: Path) -> Result[str]:
    digest = sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        return err(
            RxnFlowError(
                code="internal_error",
                message=f"Failed to read raw file source: {exc}.",
                target=str(path),
            )
        )
    return ok(f"sha256:{digest.hexdigest()}")


def _find_resource_by_checksum(
    manifest: ProjectManifest,
    checksum: str,
) -> ProjectResource | None:
    for resource in manifest.resources:
        if resource.kind == "raw_file" and resource.checksum == checksum:
            return resource
    return None


def _raw_file_relative_path(source_name: str, checksum: str) -> Path:
    prefix = checksum.removeprefix("sha256:")[:12]
    safe_name = Path(source_name).name
    return RAW_INPUT_DIR / f"{prefix}-{safe_name}"
