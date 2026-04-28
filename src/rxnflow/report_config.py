"""Report-directory YAML loading."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .errors import RxnFlowError


@dataclass(slots=True)
class ReportSiteConfig:
    id: str
    label: str

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ReportSiteConfig":
        site_id = str(data["id"])
        return cls(id=site_id, label=str(data.get("label", site_id)))


@dataclass(slots=True)
class ReportEdgeConfig:
    id: str
    from_site: str
    to_site: str
    note: str = ""

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ReportEdgeConfig":
        from_site = str(data["from"])
        to_site = str(data["to"])
        return cls(
            id=str(data.get("id", f"{from_site}->{to_site}")),
            from_site=from_site,
            to_site=to_site,
            note=str(data.get("note", "")),
        )


@dataclass(slots=True)
class ReportDirectoryConfig:
    id: str
    directory: Path
    sites: list[ReportSiteConfig] = field(default_factory=list)
    edges: list[ReportEdgeConfig] = field(default_factory=list)


def load_report_directory(report_dir: str | Path) -> ReportDirectoryConfig:
    directory = Path(report_dir).expanduser().absolute()
    report_yaml = directory / "report.yaml"
    try:
        raw = yaml.safe_load(report_yaml.read_text(encoding="utf-8")) or {}
    except OSError as exc:
        raise RxnFlowError(f"Unable to read report config '{report_yaml}': {exc}") from exc
    if not isinstance(raw, dict):
        raise RxnFlowError("Report YAML must contain a top-level mapping.")

    sites = [ReportSiteConfig.from_dict(item) for item in raw.get("sites", [])]
    edges = [ReportEdgeConfig.from_dict(item) for item in raw.get("edges", [])]
    _validate_report_directory(directory, sites, edges)
    return ReportDirectoryConfig(id=directory.name, directory=directory, sites=sites, edges=edges)


def _validate_report_directory(directory: Path, sites: list[ReportSiteConfig], edges: list[ReportEdgeConfig]) -> None:
    site_ids: set[str] = set()
    for site in sites:
        if site.id in site_ids:
            raise RxnFlowError(f"Report '{directory.name}' has duplicate site id '{site.id}'.")
        site_ids.add(site.id)
    edge_ids: set[str] = set()
    for edge in edges:
        if edge.id in edge_ids:
            raise RxnFlowError(f"Report '{directory.name}' has duplicate edge id '{edge.id}'.")
        edge_ids.add(edge.id)
        if edge.from_site not in site_ids or edge.to_site not in site_ids:
            raise RxnFlowError(f"Report edge '{edge.id}' references an unknown site.")
