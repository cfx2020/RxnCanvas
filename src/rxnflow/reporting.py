"""Report generation and reference re-zeroing."""

from __future__ import annotations

from pathlib import Path
import uuid

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from .database import connect_project_database
from .errors import WorkflowConfigError
from .paths import database_path
from .report_config import ReportDirectoryConfig, load_report_directory
from .results import write_metadata


def create_report(report_dir: str | Path) -> Path:
    directory = Path(report_dir).expanduser().absolute()
    directory.mkdir(parents=True, exist_ok=True)
    report_yaml = directory / "report.yaml"
    if not report_yaml.exists():
        report_yaml.write_text("sites: []\nedges: []\n", encoding="utf-8")
    return directory


def rebind_report_site(report_dir: str | Path, site_id: str, calculation_id: str) -> None:
    config = load_report_directory(report_dir)
    if site_id not in {site.id for site in config.sites}:
        raise WorkflowConfigError(f"Report '{config.id}' has no site '{site_id}'.")
    project_root = _project_root_from_report_dir(config.directory)
    with connect_project_database(database_path(project_root)) as conn:
        row = conn.execute(
            "select calculation_id from calculation where calculation_id = ?",
            (calculation_id,),
        ).fetchone()
        if row is None:
            raise WorkflowConfigError(f"Unknown calculation '{calculation_id}'.")
        _sync_report_config(conn, config)
        conn.execute(
            "update report_point_binding set active = 0 where report_id = ? and site_id = ?",
            (config.id, site_id),
        )
        conn.execute(
            "insert into report_point_binding(binding_id, report_id, site_id, calculation_id, active) values (?, ?, ?, ?, 1)",
            (f"bind_{uuid.uuid4().hex[:12]}", config.id, site_id, calculation_id),
        )


def validate_report(report_dir: str | Path) -> ReportDirectoryConfig:
    config = load_report_directory(report_dir)
    project_root = _project_root_from_report_dir(config.directory)
    with connect_project_database(database_path(project_root)) as conn:
        _sync_report_config(conn, config)
        missing_rows = conn.execute(
            """
            select b.calculation_id
            from report_point_binding b
            left join calculation c on c.calculation_id = b.calculation_id
            where b.report_id = ? and b.active = 1 and c.calculation_id is null
            """,
            (config.id,),
        ).fetchall()
        if missing_rows:
            labels = ", ".join(row[0] for row in missing_rows)
            raise WorkflowConfigError(f"Report '{config.id}' has missing calculations: {labels}")
        configured_sites = {site.id for site in config.sites}
        dangling_site_rows = conn.execute(
            "select site_id from report_point_binding where report_id = ? and active = 1",
            (config.id,),
        ).fetchall()
        dangling_sites = sorted(row[0] for row in dangling_site_rows if row[0] not in configured_sites)
        if dangling_sites:
            labels = ", ".join(dangling_sites)
            raise WorkflowConfigError(f"Report '{config.id}' has bindings for unknown sites: {labels}")
    return config


def render_report(report_dir: str | Path) -> Path:
    config = validate_report(report_dir)
    project_root = _project_root_from_report_dir(config.directory)
    with connect_project_database(database_path(project_root)) as conn:
        rows = conn.execute(
            """
            select
                b.site_id,
                b.calculation_id,
                c.energy,
                c.method_label,
                c.backend_label,
                c.frozen_payload_path,
                n.node_id,
                n.frozen_structure_path
            from report_point_binding b
            join calculation c on c.calculation_id = b.calculation_id
            join node n on n.node_id = c.node_id
            where b.report_id = ? and b.active = 1
            """,
            (config.id,),
        ).fetchall()
    binding_by_site = {row[0]: row for row in rows}
    sites_payload = []
    for site in config.sites:
        row = binding_by_site.get(site.id)
        site_payload = {"id": site.id, "label": site.label}
        if row is not None:
            site_payload.update(
                {
                    "calculation_id": row[1],
                    "energy": row[2],
                    "method_label": row[3],
                    "backend_label": row[4],
                    "frozen_payload_path": row[5],
                    "node_id": row[6],
                    "frozen_structure_path": row[7],
                }
            )
        sites_payload.append(site_payload)
    edges_payload = [
        {"id": edge.id, "from": edge.from_site, "to": edge.to_site, "note": edge.note}
        for edge in config.edges
    ]
    network_path = config.directory / "network.json"
    write_metadata(
        network_path,
        {
            "report_id": config.id,
            "sites": sites_payload,
            "edges": edges_payload,
        },
    )
    _plot_database_report(config.directory / "pes.png", sites_payload)
    (config.directory / "pes.cdxml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<CDXML><page id=\"1\"><t>RxnFlow PES</t></page></CDXML>\n",
        encoding="utf-8",
    )
    return config.directory


def _project_root_from_report_dir(report_dir: Path) -> Path:
    directory = Path(report_dir).absolute()
    if directory.parent.name == "report":
        return directory.parent.parent
    return directory.parent


def _sync_report_config(conn, config: ReportDirectoryConfig) -> None:
    conn.execute(
        """
        insert into report(report_id, report_dir) values (?, ?)
        on conflict(report_id) do update set report_dir = excluded.report_dir
        """,
        (config.id, str(config.directory)),
    )
    for site in config.sites:
        conn.execute(
            """
            insert into report_site(site_id, report_id, label) values (?, ?, ?)
            on conflict(site_id) do update set report_id = excluded.report_id, label = excluded.label
            """,
            (site.id, config.id, site.label),
        )
    conn.execute("delete from report_edge where report_id = ?", (config.id,))
    for edge in config.edges:
        conn.execute(
            "insert into report_edge(edge_id, report_id, from_site_id, to_site_id, note) values (?, ?, ?, ?, ?)",
            (f"{config.id}:{edge.id}", config.id, edge.from_site, edge.to_site, edge.note),
        )


def _plot_database_report(path: Path, sites_payload: list[dict]) -> None:
    bound_sites = [site for site in sites_payload if "energy" in site]
    plt.figure(figsize=(8, 4))
    if bound_sites:
        xs = list(range(len(bound_sites)))
        ys = [site["energy"] for site in bound_sites]
        labels = [site["label"] for site in bound_sites]
        plt.plot(xs, ys, marker="o")
        plt.xticks(xs, labels)
        for x_value, site in zip(xs, bound_sites, strict=True):
            plt.annotate(site["label"], (x_value, site["energy"]), textcoords="offset points", xytext=(0, 6), ha="center", fontsize=8)
    plt.xlabel("Report site")
    plt.ylabel("Energy")
    plt.title("RxnFlow PES")
    plt.tight_layout()
    plt.savefig(path, dpi=200)
    plt.close()

