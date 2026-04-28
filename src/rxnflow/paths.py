"""Filesystem layout helpers."""

from __future__ import annotations

from pathlib import Path


PROJECT_MARKER_DIRS = {"task", "report", "database"}


def task_root(project_root: Path) -> Path:
    return Path(project_root) / "task"


def report_root(project_root: Path) -> Path:
    return Path(project_root) / "report"


def database_root(project_root: Path) -> Path:
    return Path(project_root) / "database"


def database_path(project_root: Path) -> Path:
    return database_root(project_root) / "project.sqlite"


def objects_root(project_root: Path) -> Path:
    return database_root(project_root) / "objects"


def infer_project_root(reference_path: str | Path | None = None, *, cwd: str | Path | None = None) -> Path:
    fallback = Path.cwd() if cwd is None else Path(cwd).expanduser().absolute()
    references = []
    if reference_path is not None:
        references.append(Path(reference_path).expanduser().absolute())
    references.append(fallback)

    for reference in references:
        root = _project_root_from_known_layout(reference)
        if root is not None:
            return root
    return fallback


def _project_root_from_known_layout(reference: Path) -> Path | None:
    start = reference if reference.is_dir() else reference.parent
    for candidate in (start, *start.parents):
        if candidate.name in PROJECT_MARKER_DIRS:
            return candidate.parent
    return None
