"""Report generation and reference re-zeroing."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from .errors import WorkflowConfigError
from .model import BranchSpec, WorkflowConfig
from .paths import reports_root
from .results import copy_structure, load_input_metadata, load_task_metadata, write_metadata


def generate_report(config: WorkflowConfig, reference_override: str | None = None) -> Path:
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
