"""In-memory project helpers for the core fixture."""

from __future__ import annotations

from dataclasses import replace

from .models import ProjectManifest, ProjectResource

FIXTURE_TIME = "1970-01-01T00:00:00Z"
FIXTURE_SCHEMA_VERSION = "fixture-v0"


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
