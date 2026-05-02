"""Serialization helpers for RxnFlow project manifests."""

from __future__ import annotations

from pathlib import PurePosixPath
from typing import Any

from .errors import RxnFlowError
from .models import ProjectManifest, ProjectResource, ResourceKind
from .result import Result, err, ok

PROJECT_SCHEMA_VERSION = "project-v1"
RESOURCE_KINDS: frozenset[ResourceKind] = frozenset(
    {
        "raw_file",
        "chemical_object",
        "reaction_graph",
        "energy_profile",
        "export_artifact",
    }
)


def project_manifest_to_dict(manifest: ProjectManifest) -> dict[str, Any]:
    return {
        "id": manifest.id,
        "name": manifest.name,
        "created_at": manifest.created_at,
        "updated_at": manifest.updated_at,
        "schema_version": manifest.schema_version,
        "resources": [project_resource_to_dict(resource) for resource in manifest.resources],
    }


def project_manifest_from_dict(data: dict[str, Any], target: str = "manifest") -> Result[ProjectManifest]:
    schema_version = data.get("schema_version")
    if schema_version != PROJECT_SCHEMA_VERSION:
        return err(
            RxnFlowError(
                code="invalid_input",
                message=f"Unsupported project schema_version '{schema_version}'.",
                target=target,
            )
        )

    resources_result = _resources_from_dicts(data.get("resources", []), target)
    if not resources_result.ok or resources_result.value is None:
        return resources_result

    try:
        manifest = ProjectManifest(
            id=str(data["id"]),
            name=str(data["name"]),
            created_at=str(data["created_at"]),
            updated_at=str(data["updated_at"]),
            schema_version=str(schema_version),
            resources=resources_result.value,
        )
    except KeyError as exc:
        return err(
            RxnFlowError(
                code="invalid_input",
                message=f"Project manifest is missing field '{exc.args[0]}'.",
                target=target,
            )
        )
    return ok(manifest)


def project_resource_to_dict(resource: ProjectResource) -> dict[str, Any]:
    return {
        "id": resource.id,
        "kind": resource.kind,
        "path": resource.path,
        "checksum": resource.checksum,
        "metadata": resource.metadata,
    }


def project_resource_from_dict(data: dict[str, Any], target: str = "resource") -> Result[ProjectResource]:
    kind = data.get("kind")
    if kind not in RESOURCE_KINDS:
        return err(
            RxnFlowError(
                code="invalid_input",
                message=f"Unsupported project resource kind '{kind}'.",
                target=target,
            )
        )
    path = data.get("path")
    if path is not None and not isinstance(path, str):
        return err(
            RxnFlowError(
                code="invalid_input",
                message="Project resource path must be a string.",
                target=target,
            )
        )

    try:
        resource = ProjectResource(
            id=str(data["id"]),
            kind=kind,
            path=path,
            checksum=data.get("checksum"),
            metadata=dict(data.get("metadata", {})),
        )
    except (KeyError, TypeError, ValueError) as exc:
        return err(
            RxnFlowError(
                code="invalid_input",
                message=f"Invalid project resource: {exc}.",
                target=target,
            )
        )
    path_error = _validate_resource_path(resource.path, target)
    if path_error is not None:
        return err(path_error)
    return ok(resource)


def _resources_from_dicts(
    values: Any,
    target: str,
) -> Result[tuple[ProjectResource, ...]]:
    if not isinstance(values, list):
        return err(
            RxnFlowError(
                code="invalid_input",
                message="Project manifest resources must be a list.",
                target=target,
            )
        )

    resources: list[ProjectResource] = []
    for index, value in enumerate(values):
        if not isinstance(value, dict):
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Project resource entry must be an object.",
                    target=f"{target}.resources[{index}]",
                )
            )
        resource_result = project_resource_from_dict(value, f"{target}.resources[{index}]")
        if not resource_result.ok or resource_result.value is None:
            return resource_result
        resources.append(resource_result.value)
    return ok(tuple(resources))


def _validate_resource_path(path: str | None, target: str) -> RxnFlowError | None:
    if path is None:
        return None
    posix_path = PurePosixPath(path)
    if posix_path.is_absolute() or ".." in posix_path.parts or str(posix_path) in {"", "."}:
        return RxnFlowError(
            code="invalid_input",
            message="Project resource path must be a project-relative path.",
            target=target,
        )
    return None
