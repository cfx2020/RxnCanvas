"""Report generation and reference re-zeroing."""

from __future__ import annotations

import csv
import json
from pathlib import Path
import uuid

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from .database import connect_project_database
from .execution import cache_declared_inputs
from .errors import WorkflowConfigError
from .model import BranchSpec, WorkflowConfig
from .paths import database_path, reports_root
from .report_config import ReportDirectoryConfig, load_report_directory
from .results import copy_structure, load_input_metadata, load_task_metadata, write_metadata


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


def generate_report(config: WorkflowConfig, reference_override: str | None = None) -> Path:
    cache_declared_inputs(config)
    report_id = config.report.id
    output_dir = reports_root(config) / report_id
    output_dir.mkdir(parents=True, exist_ok=True)

    reference_id = reference_override or config.report.reference
    if not reference_id:
        raise WorkflowConfigError("Report generation requires a configured reference id.")
    reference_energy = load_input_metadata(config, reference_id)["summary"]["energy"]

    rows: list[dict] = []
    branches_payload: list[dict] = []
    for branch in config.report.branches:
        branch_points = branch_points_from_tasks(config, branch, reference_energy, output_dir)
        branches_payload.append({"id": branch.id, "label": branch.label, "points": branch_points})
        rows.extend(branch_points)

    csv_path = output_dir / "relative_energies.csv"
    write_relative_energy_csv(csv_path, rows)

    plot_path = output_dir / "branch_comparison.png"
    plot_branch_comparison(plot_path, branches_payload, reference_id)

    summary_path = output_dir / "summary.json"
    write_metadata(
        summary_path,
        {
            "report_id": report_id,
            "reference_id": reference_id,
            "reference_energy": reference_energy,
            "branches": branches_payload,
            "artifacts": {
                "relative_energy_table": str(csv_path),
                "branch_comparison_plot": str(plot_path),
            },
        },
    )
    return output_dir


def branch_points_from_tasks(
    config: WorkflowConfig,
    branch: BranchSpec,
    reference_energy: float,
    output_dir: Path,
) -> list[dict]:
    points: list[dict] = []
    for task_id in branch.tasks:
        metadata = load_task_metadata(config, task_id)
        task_type = metadata["task"]["type"]
        if task_type == "geomopt":
            points.append(
                make_point(
                    branch.id,
                    task_id,
                    "result",
                    metadata["summary"]["final_energy"],
                    reference_energy,
                    metadata["artifacts"]["result_structure"],
                    output_dir,
                )
            )
        elif task_type == "scan":
            points.append(
                make_point(
                    branch.id,
                    task_id,
                    "peak",
                    metadata["summary"]["peak_energy"],
                    reference_energy,
                    metadata["artifacts"]["ts_like_structure"],
                    output_dir,
                )
            )
            points.append(
                make_point(
                    branch.id,
                    task_id,
                    "final",
                    metadata["summary"]["final_energy"],
                    reference_energy,
                    metadata["artifacts"]["result_structure"],
                    output_dir,
                )
            )
        elif task_type == "neb":
            points.append(
                make_point(
                    branch.id,
                    task_id,
                    "peak",
                    metadata["summary"]["peak_energy"],
                    reference_energy,
                    metadata["artifacts"]["ts_like_structure"],
                    output_dir,
                )
            )
        else:
            raise WorkflowConfigError(f"Unsupported report task type '{task_type}'.")
    return points


def make_point(
    branch_id: str,
    task_id: str,
    point_kind: str,
    raw_energy: float,
    reference_energy: float,
    structure_path: str,
    output_dir: Path,
) -> dict:
    exported_path = output_dir / "structures" / branch_id / f"{task_id}__{point_kind}.xyz"
    copy_structure(structure_path, exported_path)
    return {
        "branch_id": branch_id,
        "task_id": task_id,
        "point_kind": point_kind,
        "label": f"{task_id}:{point_kind}",
        "raw_energy": raw_energy,
        "relative_energy": raw_energy - reference_energy,
        "structure_path": str(structure_path),
        "exported_structure": str(exported_path),
    }


def write_relative_energy_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "branch_id",
                "task_id",
                "point_kind",
                "label",
                "raw_energy",
                "relative_energy",
                "structure_path",
                "exported_structure",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def plot_branch_comparison(path: Path, branches_payload: list[dict], reference_id: str) -> None:
    plt.figure(figsize=(10, 6))
    for branch in branches_payload:
        xs = list(range(len(branch["points"])))
        ys = [point["relative_energy"] for point in branch["points"]]
        label = branch["label"] or branch["id"]
        plt.plot(xs, ys, marker="o", label=label)
        for x_value, point in zip(xs, branch["points"], strict=True):
            plt.annotate(point["label"], (x_value, point["relative_energy"]), textcoords="offset points", xytext=(0, 6), ha="center", fontsize=8)
    plt.xlabel("Branch step")
    plt.ylabel(f"Relative energy (ref={reference_id})")
    plt.title("Branch Comparison")
    plt.legend()
    plt.tight_layout()
    plt.savefig(path, dpi=200)
    plt.close()
