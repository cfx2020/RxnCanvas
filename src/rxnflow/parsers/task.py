"""Parse raw task outputs into registration candidates."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

from ..errors import WorkflowConfigError


@dataclass(slots=True)
class ParsedResult:
    structure_xyz: str
    energy: float
    charge: int
    multiplicity: int
    method_label: str
    backend_label: str
    frequency_summary_json: str = "{}"
    source_task_type: str = "unknown"


def parse_task_candidate(task_dir: Path, candidate: str) -> ParsedResult:
    metadata_path = task_dir / "metadata.json"
    if not metadata_path.exists():
        raise WorkflowConfigError(f"Task directory '{task_dir}' is missing metadata.json.")
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    artifact_key, energy_key = _candidate_keys(candidate)
    artifacts = metadata["artifacts"]
    summary = metadata["summary"]
    structure_path = Path(artifacts[artifact_key])
    if not structure_path.is_absolute():
        structure_path = task_dir / structure_path
    if not structure_path.exists():
        raise WorkflowConfigError(f"Task candidate structure '{structure_path}' does not exist.")
    settings = metadata["settings"]
    return ParsedResult(
        structure_xyz=structure_path.read_text(encoding="utf-8"),
        energy=float(summary[energy_key]),
        charge=int(settings["charge"]),
        multiplicity=int(settings["multiplicity"]),
        method_label=str(settings.get("model", "unknown-model")),
        backend_label=str(settings.get("backend", "unknown-backend")),
        source_task_type=str(metadata.get("task", {}).get("type", "unknown")),
    )


def _candidate_keys(candidate: str) -> tuple[str, str]:
    if candidate == "final":
        return "result_structure", "final_energy"
    if candidate == "peak":
        return "ts_like_structure", "peak_energy"
    raise WorkflowConfigError(f"Task candidate '{candidate}' is not available.")

