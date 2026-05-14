"""Project bundle import/export service for RxnFlow project directories."""

from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
import os
from pathlib import Path, PurePosixPath
import shutil
import tempfile
from typing import Any
import zipfile

from .content_store import PROJECT_CONTENT_INDEX_PATH, ProjectContentStore, ProjectContentValidationReport
from .errors import RxnFlowError, RxnFlowWarning
from .project import ProjectStore
from .result import Result, err, ok


BUNDLE_SUFFIX = ".rxnflow.zip"
BUNDLE_TIME = (2026, 5, 14, 0, 0, 0)
BUNDLE_ALLOWED_ROOTS = frozenset({".rxnflow", "inputs", "exports"})
BUNDLE_SKIPPED_FILE_NAMES = frozenset({".DS_Store"})
BUNDLE_CONFLICT_FAIL_IF_EXISTS = "fail_if_exists"


@dataclass(frozen=True)
class ProjectBundleSummary:
    bundle_path: str
    project_path: str | None
    project_id: str | None
    root_name: str
    file_count: int
    byte_size: int
    checksum: str
    validation_summary: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class _BundleEntry:
    name: str
    relative_path: str
    is_dir: bool


@dataclass(frozen=True)
class _BundleInspection:
    root_name: str
    entries: tuple[_BundleEntry, ...]
    file_count: int


class ProjectBundleService:
    def __init__(
        self,
        project_store: ProjectStore | None = None,
        content_store: ProjectContentStore | None = None,
    ) -> None:
        self._project_store = project_store or ProjectStore()
        self._content_store = content_store or ProjectContentStore()

    def export_bundle(
        self,
        project_path: str | os.PathLike[str],
        destination_path: str | os.PathLike[str],
    ) -> Result[ProjectBundleSummary]:
        project_root = Path(project_path)
        destination = Path(destination_path)
        suffix_error = _validate_bundle_path(destination)
        if suffix_error is not None:
            return err(suffix_error)

        loaded = self._project_store.load_project(project_root)
        if not loaded.ok or loaded.value is None:
            assert loaded.error is not None
            return err(loaded.error, loaded.warnings)

        validation = _validate_content_if_present(project_root, self._content_store)
        if not validation.ok:
            assert validation.error is not None
            return err(validation.error, validation.warnings)
        validation_summary = validation.value or _validation_not_run()

        files_result = _collect_bundle_files(project_root)
        if not files_result.ok or files_result.value is None:
            assert files_result.error is not None
            return err(files_result.error, validation.warnings)

        root_name = project_root.name
        tmp_path = destination.with_name(f".{destination.name}.tmp")
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for relative_path, source_path in files_result.value:
                    entry_name = f"{root_name}/{relative_path}"
                    _write_zip_file(archive, entry_name, source_path)
            tmp_path.replace(destination)
        except OSError as exc:
            return err(
                RxnFlowError(
                    "internal_error",
                    f"Failed to write project bundle: {exc}.",
                    target=str(destination),
                ),
                validation.warnings,
            )
        except zipfile.BadZipFile as exc:
            return err(
                RxnFlowError(
                    "internal_error",
                    f"Failed to build project bundle: {exc}.",
                    target=str(destination),
                ),
                validation.warnings,
            )
        finally:
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass

        checksum_result = _checksum_file(destination)
        if not checksum_result.ok or checksum_result.value is None:
            assert checksum_result.error is not None
            return err(checksum_result.error, validation.warnings)
        byte_size = destination.stat().st_size
        return ok(
            ProjectBundleSummary(
                bundle_path=str(destination),
                project_path=str(project_root),
                project_id=loaded.value.id,
                root_name=root_name,
                file_count=len(files_result.value),
                byte_size=byte_size,
                checksum=checksum_result.value,
                validation_summary=validation_summary,
            ),
            validation.warnings,
        )

    def import_bundle(
        self,
        bundle_path: str | os.PathLike[str],
        destination_dir: str | os.PathLike[str],
        conflict_policy: str = BUNDLE_CONFLICT_FAIL_IF_EXISTS,
    ) -> Result[ProjectBundleSummary]:
        bundle = Path(bundle_path)
        destination = Path(destination_dir)
        suffix_error = _validate_bundle_path(bundle)
        if suffix_error is not None:
            return err(suffix_error)
        if conflict_policy != BUNDLE_CONFLICT_FAIL_IF_EXISTS:
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Project bundle import only supports fail_if_exists conflict policy.",
                    target="conflict_policy",
                    details={"actual": conflict_policy},
                )
            )
        if not bundle.is_file():
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Project bundle does not exist.",
                    target="bundle_path",
                    details={"bundle_path": str(bundle)},
                )
            )
        if not destination.is_dir():
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Project bundle destination directory does not exist.",
                    target="destination_dir",
                    details={"destination_dir": str(destination)},
                )
            )

        inspection_result = _inspect_bundle(bundle)
        if not inspection_result.ok or inspection_result.value is None:
            assert inspection_result.error is not None
            return err(inspection_result.error)
        inspection = inspection_result.value
        target_project = destination / inspection.root_name
        if target_project.exists():
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Imported project already exists.",
                    target="destination_dir",
                    details={"project_path": str(target_project), "conflict_policy": conflict_policy},
                )
            )

        with tempfile.TemporaryDirectory(prefix=f".{inspection.root_name}.import-", dir=destination) as tmp:
            tmp_root = Path(tmp)
            tmp_project = tmp_root / inspection.root_name
            extract_result = _extract_bundle(bundle, inspection, tmp_project)
            if not extract_result.ok:
                assert extract_result.error is not None
                return err(extract_result.error)

            loaded = self._project_store.load_project(tmp_project)
            if not loaded.ok or loaded.value is None:
                assert loaded.error is not None
                return err(
                    RxnFlowError(
                        "invalid_bundle",
                        "Project bundle manifest could not be loaded.",
                        target=f"{inspection.root_name}/.rxnflow/manifest.json",
                        details={"error": loaded.error.message},
                    )
                )

            validation = _validate_content_if_present(tmp_project, self._content_store)
            if not validation.ok:
                assert validation.error is not None
                return err(validation.error, validation.warnings)
            validation_summary = validation.value or _validation_not_run()

            if target_project.exists():
                return err(
                    RxnFlowError(
                        "invalid_input",
                        "Imported project already exists.",
                        target="destination_dir",
                        details={"project_path": str(target_project), "conflict_policy": conflict_policy},
                    ),
                    validation.warnings,
                )
            try:
                tmp_project.rename(target_project)
            except OSError as exc:
                return err(
                    RxnFlowError(
                        "internal_error",
                        f"Failed to move imported project into destination: {exc}.",
                        target=str(target_project),
                    ),
                    validation.warnings,
                )

        checksum_result = _checksum_file(bundle)
        if not checksum_result.ok or checksum_result.value is None:
            assert checksum_result.error is not None
            return err(checksum_result.error)
        return ok(
            ProjectBundleSummary(
                bundle_path=str(bundle),
                project_path=str(target_project),
                project_id=loaded.value.id,
                root_name=inspection.root_name,
                file_count=inspection.file_count,
                byte_size=bundle.stat().st_size,
                checksum=checksum_result.value,
                validation_summary=validation_summary,
            ),
            validation.warnings,
        )


def _validate_bundle_path(path: Path) -> RxnFlowError | None:
    if str(path).strip() == "":
        return RxnFlowError("invalid_input", "Project bundle path is required.", target="bundle_path")
    if not path.name.endswith(BUNDLE_SUFFIX):
        return RxnFlowError(
            "invalid_input",
            "Project bundle path must end with .rxnflow.zip.",
            target="bundle_path",
            details={"path": str(path)},
        )
    return None


def _validate_content_if_present(
    project_root: Path,
    content_store: ProjectContentStore,
) -> Result[dict[str, Any]]:
    if not (project_root / PROJECT_CONTENT_INDEX_PATH).is_file():
        return ok(_validation_not_run())
    report_result = content_store.validate_project(project_root)
    if not report_result.ok or report_result.value is None:
        assert report_result.error is not None
        return err(report_result.error, report_result.warnings)
    report = report_result.value
    warnings = _warnings_from_report(report)
    if not report.ok:
        return err(_validation_error(report), warnings)
    return ok(_validation_summary(report), warnings)


def _validation_not_run() -> dict[str, Any]:
    return {"checked": False, "ok": None, "summary": {"total": 0, "errors": 0, "warnings": 0}}


def _validation_summary(report: ProjectContentValidationReport) -> dict[str, Any]:
    return {"checked": True, "ok": report.ok, "summary": dict(report.summary)}


def _validation_error(report: ProjectContentValidationReport) -> RxnFlowError:
    return RxnFlowError(
        "project_content_invalid",
        "Project content validation failed.",
        target="project_content",
        details={
            "project_id": report.project_id,
            "schema_version": report.schema_version,
            "summary": report.summary,
            "issues": [
                {
                    "severity": issue.severity,
                    "code": issue.code,
                    "message": issue.message,
                    "target": issue.target,
                    "details": issue.details,
                }
                for issue in report.issues
            ],
        },
    )


def _warnings_from_report(report: ProjectContentValidationReport) -> tuple[RxnFlowWarning, ...]:
    return tuple(
        RxnFlowWarning(issue.code, issue.message, issue.target)
        for issue in report.issues
        if issue.severity == "warning"
    )


def _collect_bundle_files(project_root: Path) -> Result[tuple[tuple[str, Path], ...]]:
    candidates = (
        project_root / ".rxnflow",
        project_root / "inputs" / "raw",
        project_root / "exports",
    )
    files: list[tuple[str, Path]] = []
    for root in candidates:
        if not root.exists():
            continue
        if not root.is_dir():
            return err(
                RxnFlowError(
                    "invalid_input",
                    "Project bundle content root is not a directory.",
                    target=str(root),
                )
            )
        for path in sorted(item for item in root.rglob("*") if item.is_file()):
            if _should_skip_project_file(path):
                continue
            relative = path.relative_to(project_root).as_posix()
            path_error = _validate_project_relative_bundle_path(relative)
            if path_error is not None:
                return err(path_error)
            files.append((relative, path))
    return ok(tuple(files))


def _should_skip_project_file(path: Path) -> bool:
    return path.name in BUNDLE_SKIPPED_FILE_NAMES or "__MACOSX" in path.parts


def _write_zip_file(archive: zipfile.ZipFile, entry_name: str, source_path: Path) -> None:
    info = zipfile.ZipInfo(entry_name, date_time=BUNDLE_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    with source_path.open("rb") as source, archive.open(info, "w") as target:
        shutil.copyfileobj(source, target)


def _inspect_bundle(bundle_path: Path) -> Result[_BundleInspection]:
    try:
        with zipfile.ZipFile(bundle_path, "r") as archive:
            raw_infos = archive.infolist()
            roots: set[str] = set()
            entries: list[_BundleEntry] = []
            seen_names: set[str] = set()
            manifest_seen = False

            for info in raw_infos:
                entry_result = _bundle_entry_from_zip_info(info)
                if not entry_result.ok or entry_result.value is None:
                    assert entry_result.error is not None
                    return err(entry_result.error)
                entry = entry_result.value
                if entry.name in seen_names:
                    return err(_invalid_bundle("Project bundle contains duplicate entries.", entry.name))
                seen_names.add(entry.name)

                root_name = PurePosixPath(entry.name).parts[0]
                roots.add(root_name)
                if len(roots) > 1:
                    return err(
                        _invalid_bundle(
                            "Project bundle must contain exactly one project root.",
                            entry.name,
                            {"roots": sorted(roots)},
                        )
                    )
                if not entry.is_dir:
                    entries.append(entry)
                if entry.name == f"{root_name}/.rxnflow/manifest.json" and not entry.is_dir:
                    manifest_seen = True

            if not roots:
                return err(_invalid_bundle("Project bundle is empty.", str(bundle_path)))
            root_name = next(iter(roots))
            if not manifest_seen:
                return err(
                    _invalid_bundle(
                        "Project bundle is missing .rxnflow/manifest.json.",
                        f"{root_name}/.rxnflow/manifest.json",
                    )
                )
            return ok(_BundleInspection(root_name=root_name, entries=tuple(entries), file_count=len(entries)))
    except zipfile.BadZipFile:
        return err(_invalid_bundle("Project bundle is not a valid zip file.", str(bundle_path)))
    except OSError as exc:
        return err(
            RxnFlowError(
                "internal_error",
                f"Failed to read project bundle: {exc}.",
                target=str(bundle_path),
            )
        )


def _bundle_entry_from_zip_info(info: zipfile.ZipInfo) -> Result[_BundleEntry]:
    name = info.filename
    path_error = _validate_bundle_entry_path(name, info.is_dir())
    if path_error is not None:
        return err(path_error)
    mode = (info.external_attr >> 16) & 0o170000
    if mode == 0o120000:
        return err(_invalid_bundle("Project bundle entry must not be a symlink.", name))
    normalized = PurePosixPath(name.rstrip("/")).as_posix()
    return ok(
        _BundleEntry(
            name=normalized,
            relative_path=_entry_project_relative_path(normalized),
            is_dir=info.is_dir(),
        )
    )


def _validate_bundle_entry_path(name: str, is_dir: bool) -> RxnFlowError | None:
    if not isinstance(name, str) or name.strip() == "":
        return _invalid_bundle("Project bundle entry path is required.", "zip_entry")
    if "\\" in name:
        return _invalid_bundle("Project bundle entry path must be POSIX relative.", name)
    if name.startswith("/"):
        return _invalid_bundle("Project bundle entry path must be relative.", name)
    stripped = name.rstrip("/") if is_dir else name
    if stripped in {"", "."}:
        return _invalid_bundle("Project bundle entry path must not be empty.", name)
    posix_path = PurePosixPath(stripped)
    if posix_path.as_posix() != stripped:
        return _invalid_bundle("Project bundle entry path must be normalized.", name)
    parts = posix_path.parts
    if posix_path.is_absolute() or not parts or "." in parts or ".." in parts:
        return _invalid_bundle("Project bundle entry path must be safe and project-relative.", name)
    root_name = parts[0]
    root_error = _validate_bundle_root_name(root_name, name)
    if root_error is not None:
        return root_error
    if len(parts) == 1:
        if is_dir:
            return None
        return _invalid_bundle("Project bundle entries must be under the project root directory.", name)
    return _validate_project_relative_bundle_path(PurePosixPath(*parts[1:]).as_posix(), target=name)


def _validate_bundle_root_name(root_name: str, target: str) -> RxnFlowError | None:
    if root_name == "__MACOSX":
        return _invalid_bundle("Project bundle must not contain __MACOSX metadata.", target)
    if "\\" in root_name or root_name in {"", ".", ".."}:
        return _invalid_bundle("Project bundle root name is invalid.", target)
    if PurePosixPath(root_name).is_absolute():
        return _invalid_bundle("Project bundle root name must be relative.", target)
    return None


def _validate_project_relative_bundle_path(path: str, target: str | None = None) -> RxnFlowError | None:
    if not isinstance(path, str) or path.strip() == "":
        return _invalid_bundle("Project bundle project-relative path is required.", target or "path")
    if "\\" in path:
        return _invalid_bundle("Project bundle project-relative path must be POSIX relative.", target or path)
    posix_path = PurePosixPath(path)
    parts = posix_path.parts
    if posix_path.is_absolute() or not parts or str(posix_path) in {"", "."} or "." in parts or ".." in parts:
        return _invalid_bundle("Project bundle project-relative path must be safe.", target or path)
    if parts[0] not in BUNDLE_ALLOWED_ROOTS:
        return _invalid_bundle("Project bundle entry is outside the allowed project content roots.", target or path)
    if parts[0] == "inputs" and not (len(parts) >= 2 and parts[1] == "raw"):
        return _invalid_bundle("Project bundle inputs entries must be under inputs/raw/.", target or path)
    return None


def _entry_project_relative_path(entry_name: str) -> str:
    parts = PurePosixPath(entry_name).parts
    return PurePosixPath(*parts[1:]).as_posix() if len(parts) > 1 else ""


def _extract_bundle(bundle_path: Path, inspection: _BundleInspection, target_project: Path) -> Result[None]:
    try:
        with zipfile.ZipFile(bundle_path, "r") as archive:
            for entry in inspection.entries:
                target = target_project / PurePosixPath(entry.relative_path)
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(entry.name, "r") as source, target.open("wb") as destination:
                    shutil.copyfileobj(source, destination)
    except (OSError, zipfile.BadZipFile) as exc:
        return err(
            RxnFlowError(
                "internal_error",
                f"Failed to extract project bundle: {exc}.",
                target=str(bundle_path),
            )
        )
    return ok(None)


def _checksum_file(path: Path) -> Result[str]:
    digest = sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        return err(
            RxnFlowError(
                "internal_error",
                f"Failed to checksum project bundle: {exc}.",
                target=str(path),
            )
        )
    return ok(f"sha256:{digest.hexdigest()}")


def _invalid_bundle(message: str, target: str, details: dict[str, Any] | None = None) -> RxnFlowError:
    return RxnFlowError("invalid_bundle", message, target=target, details=details or {})
