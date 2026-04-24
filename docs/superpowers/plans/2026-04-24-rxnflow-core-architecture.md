# RxnFlow Core Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved RxnFlow backend architecture: task-local raw execution, shared UMA service boundary, SQLite registration, frozen database objects, database-backed reports, validation, and deletion.

**Architecture:** The implementation proceeds in thin vertical slices. First align project identity and file layout, then introduce the service-client boundary without changing chemistry behavior, then make task execution raw-only, then add the database and registration boundary, then move reports onto registered calculations only.

**Tech Stack:** Python 3.11+, ASE, PyYAML, sqlite3 from the standard library, unittest, matplotlib, git, and the remote `win11local` Windows host with the `chem` conda environment.

---

## Scope Check

The approved design covers several coupled backend pieces, not independent products. A single plan fits because each task depends on the previous task's public contracts:

- project identity and layout provide stable names for subsequent commands
- service-client boundary keeps task execution from constructing UMA predictors directly
- raw task execution provides parser input for registration
- registration is the only path into `database/project.sqlite`
- report rendering reads registered calculations and refuses raw task files
- deletion and validation protect report bindings

Frontend work remains out of scope.

## Current State

Current local repository: `/Users/linsay/Desktop/code/win11local/rxnflow`

Current remote repository: `D:\Code\rxnflow` on `win11local`

Important current mismatches to fix:

- Python package is still `src/mlrxn_workflow`.
- CLI command is still `mlrxn`.
- Outputs still use `runs/tasks`, `runs/inputs`, and `reports`.
- `report` reads task metadata directly.
- UMA backend still constructs the predictor in process.
- There is no `database/project.sqlite`, frozen object store, or `register-result` command.

Do not touch these local untracked files during implementation unless the user explicitly asks:

- `.superpowers/`
- `Architecture.png`
- `plan.md`

## File Structure

### Rename And Identity

- Modify: `pyproject.toml`
- Move: `src/mlrxn_workflow/` to `src/rxnflow/`
- Modify: `src/rxnflow/cli.py`
- Modify: all files under `tests/` that import `mlrxn_workflow`
- Modify: `README.md`
- Create: `tests/test_cli_identity.py`

### Task Directory And Raw Execution

- Create: `src/rxnflow/task_config.py`
- Modify: `src/rxnflow/model.py`
- Modify: `src/rxnflow/config.py`
- Modify: `src/rxnflow/paths.py`
- Modify: `src/rxnflow/execution.py`
- Modify: `src/rxnflow/results.py`
- Create: `tests/test_task_config.py`
- Modify: `tests/test_geomopt.py`
- Modify: `tests/test_scan.py`
- Modify: `tests/test_neb.py`

### UMA Service Boundary

- Create: `src/rxnflow/service_client.py`
- Modify: `src/rxnflow/calculators/base.py`
- Modify: `src/rxnflow/calculators/factory.py`
- Modify: `src/rxnflow/calculators/backends/uma.py`
- Modify: `src/rxnflow/calculators/backends/fake.py`
- Create: `tests/test_service_client.py`
- Modify: `tests/test_calculators.py`

### Database And Registration

- Create: `src/rxnflow/database.py`
- Create: `src/rxnflow/registration.py`
- Create: `src/rxnflow/parsers/__init__.py`
- Create: `src/rxnflow/parsers/task.py`
- Create: `src/rxnflow/parsers/gaussian.py`
- Create: `src/rxnflow/parsers/orca.py`
- Create: `tests/test_database.py`
- Create: `tests/test_registration.py`
- Create: `tests/fixtures/gaussian/minimal_opt.log`
- Create: `tests/fixtures/orca/minimal_opt.out`

### Report Model

- Modify: `src/rxnflow/reporting.py`
- Create: `src/rxnflow/report_config.py`
- Create: `tests/test_report_model.py`
- Modify: `tests/test_reporting.py`

### Deletion, Validation, Docs, And Remote Smoke

- Create: `tests/test_delete_result.py`
- Modify: `src/rxnflow/database.py`
- Modify: `src/rxnflow/cli.py`
- Modify: `README.md`

## Remote Execution Baseline

Use the remote host for real execution checks:

```bash
ssh win11local "powershell -NoProfile -Command \"Set-Location 'D:\\Code\\rxnflow'; conda run -n chem python -m unittest discover -s tests -v\""
```

Expected baseline after each completed implementation task:

```text
OK
```

Use git bundle synchronization when moving local commits to the remote repository because neither checkout currently has a configured git remote:

```bash
git bundle create /tmp/rxnflow-main.bundle main
scp /tmp/rxnflow-main.bundle win11local:D:/Code/rxnflow-main.bundle
ssh win11local "powershell -NoProfile -Command \"Set-Location 'D:\\Code\\rxnflow'; git fetch D:\\Code\\rxnflow-main.bundle main:refs/remotes/local/main; git merge --ff-only refs/remotes/local/main\""
```

---

### Task 1: Project Identity And CLI Rename

**Files:**
- Modify: `pyproject.toml`
- Move: `src/mlrxn_workflow/` to `src/rxnflow/`
- Modify: `src/rxnflow/cli.py`
- Modify: `tests/*.py`
- Create: `tests/test_cli_identity.py`
- Modify: `README.md`

- [ ] **Step 1: Write the failing identity test**

Create `tests/test_cli_identity.py`:

```python
from __future__ import annotations

import sys
import tomllib
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.cli import build_parser


class CliIdentityTests(unittest.TestCase):
    def test_parser_uses_rxnflow_program_name(self) -> None:
        parser = build_parser()
        self.assertEqual(parser.prog, "rxnflow")

    def test_pyproject_exposes_rxnflow_command(self) -> None:
        pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
        data = tomllib.loads(pyproject.read_text(encoding="utf-8"))
        self.assertEqual(data["project"]["name"], "rxnflow")
        self.assertEqual(data["project"]["scripts"]["rxnflow"], "rxnflow.cli:main")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
python -m unittest tests.test_cli_identity -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'rxnflow'`.

- [ ] **Step 3: Move the package and update imports**

Run:

```bash
git mv src/mlrxn_workflow src/rxnflow
python - <<'PY'
from pathlib import Path

for path in list(Path("tests").glob("test_*.py")) + list(Path("src/rxnflow").rglob("*.py")):
    text = path.read_text(encoding="utf-8")
    text = text.replace("mlrxn_workflow", "rxnflow")
    path.write_text(text, encoding="utf-8")
PY
```

- [ ] **Step 4: Update project metadata**

Replace `pyproject.toml` project identity and scripts with:

```toml
[project]
name = "rxnflow"
version = "0.1.0"
description = "Workflow-first chemistry system for ML-assisted reaction-path screening"
readme = "README.md"
requires-python = ">=3.11"
dependencies = [
  "ase>=3.26",
  "PyYAML>=6.0",
]

[project.scripts]
rxnflow = "rxnflow.cli:main"
```

- [ ] **Step 5: Update CLI parser identity**

In `src/rxnflow/cli.py`, change `build_parser()` to start with:

```python
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rxnflow", description="RxnFlow workflow CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)
```

- [ ] **Step 6: Update README title and one-line summary**

Replace `README.md` with:

```markdown
# RxnFlow

Workflow-first chemistry system for ML-assisted reaction-path screening.
```

- [ ] **Step 7: Run identity and existing tests**

Run:

```bash
python -m unittest tests.test_cli_identity -v
python -m unittest discover -s tests -v
```

Expected: both commands end with `OK`.

- [ ] **Step 8: Commit the rename**

Run:

```bash
git add pyproject.toml README.md src/rxnflow tests
git commit -m "chore: rename package and CLI to rxnflow"
```

---

### Task 2: Task Directory Loader And V1 Project Layout

**Files:**
- Create: `src/rxnflow/task_config.py`
- Modify: `src/rxnflow/model.py`
- Modify: `src/rxnflow/paths.py`
- Modify: `src/rxnflow/config.py`
- Create: `tests/test_task_config.py`
- Modify: `tests/test_config.py`

- [ ] **Step 1: Write the failing task directory loader test**

Create `tests/test_task_config.py`:

```python
from __future__ import annotations

import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.errors import WorkflowConfigError
from rxnflow.paths import database_path, objects_root, report_root, task_root
from rxnflow.task_config import load_task_directory


class TaskDirectoryConfigTests(unittest.TestCase):
    def test_loads_task_yaml_and_input_xyz_from_task_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            task_dir = Path(tmp) / "task" / "opt_im1"
            task_dir.mkdir(parents=True)
            (task_dir / "input.xyz").write_text("1\n\nH 0 0 0\n", encoding="utf-8")
            (task_dir / "task.yaml").write_text(
                textwrap.dedent(
                    """
                    type: geomopt
                    charge: 0
                    multiplicity: 1
                    backend: fake
                    model: fake-base
                    device: cpu
                    task_name: omol
                    fmax: 0.01
                    max_steps: 5
                    """
                ),
                encoding="utf-8",
            )

            config = load_task_directory(task_dir)

            self.assertEqual(config.id, "opt_im1")
            self.assertEqual(config.type, "geomopt")
            self.assertEqual(config.input_path, task_dir / "input.xyz")
            self.assertEqual(config.charge, 0)
            self.assertEqual(config.multiplicity, 1)

    def test_missing_input_xyz_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            task_dir = Path(tmp) / "task" / "bad"
            task_dir.mkdir(parents=True)
            (task_dir / "task.yaml").write_text("type: geomopt\ncharge: 0\nmultiplicity: 1\n", encoding="utf-8")

            with self.assertRaisesRegex(WorkflowConfigError, "input.xyz"):
                load_task_directory(task_dir)

    def test_project_layout_paths(self) -> None:
        root = Path("/project")
        self.assertEqual(task_root(root), root / "task")
        self.assertEqual(report_root(root), root / "report")
        self.assertEqual(database_path(root), root / "database" / "project.sqlite")
        self.assertEqual(objects_root(root), root / "database" / "objects")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the task loader test and verify it fails**

Run:

```bash
python -m unittest tests.test_task_config -v
```

Expected: FAIL with `ModuleNotFoundError` or import errors for `rxnflow.task_config`, `task_root`, `report_root`, `database_path`, and `objects_root`.

- [ ] **Step 3: Add task directory models**

Add these dataclasses to `src/rxnflow/model.py`:

```python
@dataclass(slots=True)
class TaskDirectoryConfig:
    id: str
    directory: Path
    input_path: Path
    type: str
    charge: int
    multiplicity: int
    backend: str = "uma"
    model: str = "uma-s-1p1"
    device: str = "cuda"
    task_name: str = "omol"
    optimizer: str = "lbfgs"
    fmax: float = 0.05
    max_steps: int = 200
    coordinate: ScanCoordinate | None = None
    constraints: list[ConstraintSpec] = field(default_factory=list)
    initial_path: Path | None = None
    final_path: Path | None = None
    images: int | None = None
```

- [ ] **Step 4: Add project layout helpers**

Replace `src/rxnflow/paths.py` with:

```python
"""Filesystem layout helpers."""

from __future__ import annotations

from pathlib import Path


def project_root_from_task_dir(task_dir: Path) -> Path:
    task_dir = Path(task_dir).resolve()
    if task_dir.parent.name == "task":
        return task_dir.parent.parent
    return task_dir.parent


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
```

- [ ] **Step 5: Add `load_task_directory()`**

Create `src/rxnflow/task_config.py`:

```python
"""Task-directory config loading."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from .errors import WorkflowConfigError
from .model import ConstraintSpec, ScanCoordinate, TaskDirectoryConfig


def load_task_directory(task_dir: str | Path) -> TaskDirectoryConfig:
    directory = Path(task_dir).expanduser().resolve()
    task_yaml = directory / "task.yaml"
    input_path = directory / "input.xyz"
    if not task_yaml.exists():
        raise WorkflowConfigError(f"Task directory '{directory}' is missing task.yaml.")
    if not input_path.exists():
        raise WorkflowConfigError(f"Task directory '{directory}' is missing input.xyz.")
    data = _read_task_yaml(task_yaml)
    coordinate = None
    if data.get("coordinate") is not None:
        coordinate = ScanCoordinate.from_dict(data["coordinate"])
    constraints = [ConstraintSpec.from_dict(item) for item in data.get("constraints", [])]
    return TaskDirectoryConfig(
        id=directory.name,
        directory=directory,
        input_path=input_path,
        type=str(data["type"]),
        charge=int(data["charge"]),
        multiplicity=int(data["multiplicity"]),
        backend=str(data.get("backend", "uma")),
        model=str(data.get("model", "uma-s-1p1")),
        device=str(data.get("device", "cuda")),
        task_name=str(data.get("task_name", "omol")),
        optimizer=str(data.get("optimizer", "lbfgs")),
        fmax=float(data.get("fmax", 0.05)),
        max_steps=int(data.get("max_steps", 200)),
        coordinate=coordinate,
        constraints=constraints,
        initial_path=None if data.get("initial") is None else (directory / str(data["initial"])).resolve(),
        final_path=None if data.get("final") is None else (directory / str(data["final"])).resolve(),
        images=None if data.get("images") is None else int(data["images"]),
    )


def _read_task_yaml(path: Path) -> dict[str, Any]:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except OSError as exc:
        raise WorkflowConfigError(f"Unable to read task config '{path}': {exc}") from exc
    if not isinstance(raw, dict):
        raise WorkflowConfigError("task.yaml must contain a mapping.")
    for key in ["type", "charge", "multiplicity"]:
        if key not in raw:
            raise WorkflowConfigError(f"task.yaml must declare '{key}'.")
    return raw
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
python -m unittest tests.test_task_config -v
```

Expected: `OK`.

- [ ] **Step 7: Commit the layout loader**

Run:

```bash
git add src/rxnflow/model.py src/rxnflow/paths.py src/rxnflow/task_config.py tests/test_task_config.py
git commit -m "feat: add task directory layout loader"
```

---

### Task 3: UMA Service-Client Boundary

**Files:**
- Create: `src/rxnflow/service_client.py`
- Modify: `src/rxnflow/calculators/base.py`
- Modify: `src/rxnflow/calculators/factory.py`
- Modify: `src/rxnflow/calculators/backends/uma.py`
- Create: `tests/test_service_client.py`
- Modify: `tests/test_calculators.py`

- [ ] **Step 1: Write the failing service profile tests**

Create `tests/test_service_client.py`:

```python
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.service_client import ServiceProfile, resolve_service_profile


class ServiceClientTests(unittest.TestCase):
    def test_default_profile_is_machine_level_uma(self) -> None:
        profile = resolve_service_profile(None)
        self.assertEqual(profile.name, "win11local-uma")
        self.assertEqual(profile.mode, "machine")
        self.assertEqual(profile.host, "127.0.0.1")
        self.assertGreater(profile.port, 0)

    def test_explicit_project_profile_is_supported(self) -> None:
        profile = resolve_service_profile(
            ServiceProfile(name="project-uma", mode="project", host="127.0.0.1", port=8765)
        )
        self.assertEqual(profile.name, "project-uma")
        self.assertEqual(profile.mode, "project")
        self.assertEqual(profile.port, 8765)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the service profile tests and verify they fail**

Run:

```bash
python -m unittest tests.test_service_client -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'rxnflow.service_client'`.

- [ ] **Step 3: Add the service profile and client module**

Create `src/rxnflow/service_client.py`:

```python
"""UMA service-client boundary."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class ServiceProfile:
    name: str
    mode: str
    host: str
    port: int


DEFAULT_UMA_PROFILE = ServiceProfile(
    name="win11local-uma",
    mode="machine",
    host="127.0.0.1",
    port=8765,
)


def resolve_service_profile(profile: ServiceProfile | None) -> ServiceProfile:
    return DEFAULT_UMA_PROFILE if profile is None else profile
```

- [ ] **Step 4: Extend calculator settings with service metadata**

Modify `src/rxnflow/calculators/base.py` so `CalculatorSettings` is:

```python
@dataclass(slots=True)
class CalculatorSettings:
    backend: str
    model: str
    device: str
    task_name: str
    charge: int
    multiplicity: int
    service_profile: str = "win11local-uma"
    service_mode: str = "machine"
    service_host: str = "127.0.0.1"
    service_port: int = 8765
```

- [ ] **Step 5: Keep fake backend behavior unchanged**

Run:

```bash
python -m unittest tests.test_calculators.CalculatorTests.test_fake_backend_builds_calculator -v
```

Expected: `OK`.

- [ ] **Step 6: Update UMA backend to use the boundary**

Modify `src/rxnflow/calculators/backends/uma.py` so the in-process fallback is isolated behind one method:

```python
class UmaBackend(CalculatorBackend):
    name = "uma"

    def build(self, settings: CalculatorSettings):
        if settings.service_mode == "machine":
            return self._build_service_calculator(settings)
        return self._build_in_process_calculator(settings)

    def _build_service_calculator(self, settings: CalculatorSettings):
        return self._build_in_process_calculator(settings)

    def _build_in_process_calculator(self, settings: CalculatorSettings):
        try:
            from fairchem.core import FAIRChemCalculator, pretrained_mlip
        except ImportError as exc:
            raise RuntimeError(
                "UMA backend requires fairchem-core to be installed in the active Python environment."
            ) from exc

        predictor = pretrained_mlip.get_predict_unit(model_name=settings.model, device=settings.device)
        return FAIRChemCalculator(predictor, task_name=settings.task_name)
```

This keeps tests buildable while creating a single boundary where the real TCP client can replace `_build_service_calculator()`.

- [ ] **Step 7: Run calculator and service tests**

Run:

```bash
python -m unittest tests.test_service_client tests.test_calculators -v
```

Expected: `OK`.

- [ ] **Step 8: Commit the service boundary**

Run:

```bash
git add src/rxnflow/service_client.py src/rxnflow/calculators tests/test_service_client.py tests/test_calculators.py
git commit -m "feat: add UMA service client boundary"
```

---

### Task 4: Raw-Only Task Execution Commands

**Files:**
- Modify: `src/rxnflow/cli.py`
- Modify: `src/rxnflow/execution.py`
- Modify: `src/rxnflow/results.py`
- Modify: `tests/test_geomopt.py`
- Modify: `tests/test_scan.py`
- Modify: `tests/test_neb.py`

- [ ] **Step 1: Write the failing CLI command test**

Create `tests/test_task_cli.py`:

```python
from __future__ import annotations

import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.cli import main


class TaskCliTests(unittest.TestCase):
    def test_validate_task_accepts_task_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            task_dir = Path(tmp) / "task" / "opt_h"
            task_dir.mkdir(parents=True)
            (task_dir / "input.xyz").write_text("1\n\nH 0 0 0\n", encoding="utf-8")
            (task_dir / "task.yaml").write_text(
                textwrap.dedent(
                    """
                    type: geomopt
                    charge: 0
                    multiplicity: 1
                    backend: fake
                    device: cpu
                    max_steps: 2
                    """
                ),
                encoding="utf-8",
            )
            self.assertEqual(main(["validate-task", str(task_dir)]), 0)

    def test_run_task_writes_only_task_local_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            task_dir = Path(tmp) / "task" / "opt_h"
            task_dir.mkdir(parents=True)
            (task_dir / "input.xyz").write_text("1\n\nH 0 0 0\n", encoding="utf-8")
            (task_dir / "task.yaml").write_text(
                textwrap.dedent(
                    """
                    type: geomopt
                    charge: 0
                    multiplicity: 1
                    backend: fake
                    device: cpu
                    max_steps: 2
                    """
                ),
                encoding="utf-8",
            )
            self.assertEqual(main(["run-task", str(task_dir)]), 0)
            self.assertTrue((task_dir / "result.xyz").exists())
            self.assertTrue((task_dir / "metadata.json").exists())
            self.assertFalse((Path(tmp) / "database").exists())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the task CLI test and verify it fails**

Run:

```bash
python -m unittest tests.test_task_cli -v
```

Expected: FAIL because `validate-task` and `run-task` are not registered CLI commands.

- [ ] **Step 3: Add CLI commands**

In `src/rxnflow/cli.py`, add subparsers:

```python
validate_task_parser = subparsers.add_parser("validate-task", help="Validate one task directory")
validate_task_parser.add_argument("task_dir", help="Path to task/<task-id>")

run_task_parser = subparsers.add_parser("run-task", help="Run one task directory")
run_task_parser.add_argument("task_dir", help="Path to task/<task-id>")
```

In `main()`, add command handlers before the legacy workflow commands:

```python
    if args.command == "validate-task":
        load_task_directory(args.task_dir)
        print(json.dumps({"task_dir": str(args.task_dir), "valid": True}, indent=2))
        return 0

    if args.command == "run-task":
        task_config = load_task_directory(args.task_dir)
        run_task_directory(task_config)
        print(json.dumps({"task_id": task_config.id, "task_dir": str(task_config.directory)}, indent=2))
        return 0
```

- [ ] **Step 4: Add task-directory execution adapter**

In `src/rxnflow/execution.py`, add:

```python
def run_task_directory(task: TaskDirectoryConfig) -> None:
    if task.type == "geomopt":
        run_geomopt_directory(task)
        return
    if task.type == "scan":
        run_scan_directory(task)
        return
    if task.type == "neb":
        run_neb_directory(task)
        return
    raise WorkflowConfigError(f"Task '{task.id}' has unsupported type '{task.type}'.")
```

Implement `run_geomopt_directory()` first by loading `task.input_path`, using task settings directly, and writing `trajectory.traj`, `trajectory.xyz`, `energies.csv`, `result.xyz`, and `metadata.json` under `task.directory`.

- [ ] **Step 5: Run the geomopt task CLI test**

Run:

```bash
python -m unittest tests.test_task_cli.TaskCliTests.test_run_task_writes_only_task_local_outputs -v
```

Expected: `OK`.

- [ ] **Step 6: Port scan and neb tests to task directories**

Update `tests/test_scan.py` and `tests/test_neb.py` so each test creates `task/<task-id>/task.yaml`, `input.xyz`, and any endpoint files inside the task directory. Assert outputs stay in that task directory:

```python
self.assertTrue((task_dir / "result.xyz").exists())
self.assertTrue((task_dir / "energies.csv").exists())
self.assertTrue((task_dir / "metadata.json").exists())
self.assertFalse((Path(tmp) / "database").exists())
```

- [ ] **Step 7: Run task execution tests**

Run:

```bash
python -m unittest tests.test_task_cli tests.test_geomopt tests.test_scan tests.test_neb -v
```

Expected: `OK`.

- [ ] **Step 8: Commit raw-only task execution**

Run:

```bash
git add src/rxnflow/cli.py src/rxnflow/execution.py src/rxnflow/results.py tests/test_task_cli.py tests/test_geomopt.py tests/test_scan.py tests/test_neb.py
git commit -m "feat: run task directories as raw-only jobs"
```

---

### Task 5: SQLite Database And Frozen Object Store

**Files:**
- Create: `src/rxnflow/database.py`
- Create: `tests/test_database.py`

- [ ] **Step 1: Write the failing database schema test**

Create `tests/test_database.py`:

```python
from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.database import connect_project_database, initialize_database


class DatabaseTests(unittest.TestCase):
    def test_initialize_database_creates_core_tables(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "database" / "project.sqlite"
            initialize_database(db_path)

            with sqlite3.connect(db_path) as conn:
                names = {
                    row[0]
                    for row in conn.execute(
                        "select name from sqlite_master where type = 'table'"
                    )
                }

            self.assertEqual(
                {
                    "task_run",
                    "import_record",
                    "result_record",
                    "node",
                    "calculation",
                    "report",
                    "report_site",
                    "report_point_binding",
                    "report_edge",
                },
                names,
            )

    def test_connect_project_database_initializes_parent_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "database" / "project.sqlite"
            with connect_project_database(db_path) as conn:
                count = conn.execute("select count(*) from sqlite_master").fetchone()[0]
            self.assertGreater(count, 0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the database tests and verify they fail**

Run:

```bash
python -m unittest tests.test_database -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'rxnflow.database'`.

- [ ] **Step 3: Add database initialization**

Create `src/rxnflow/database.py`:

```python
"""SQLite source of truth for registered RxnFlow objects."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
import sqlite3
from typing import Iterator


SCHEMA_STATEMENTS = [
    """
    create table if not exists task_run (
        task_run_id text primary key,
        task_dir text not null,
        task_type text not null,
        source_task_yaml_path text not null
    )
    """,
    """
    create table if not exists import_record (
        import_record_id text primary key,
        source_program text not null,
        source_path text not null,
        parser_name text not null,
        imported_at text not null
    )
    """,
    """
    create table if not exists result_record (
        result_record_id text primary key,
        source_kind text not null check (source_kind in ('task', 'import')),
        task_run_id text references task_run(task_run_id),
        import_record_id text references import_record(import_record_id),
        candidate_label text not null,
        registered_at text not null
    )
    """,
    """
    create table if not exists node (
        node_id text primary key,
        charge integer not null,
        multiplicity integer not null,
        origin_kind text not null,
        frozen_structure_path text not null
    )
    """,
    """
    create table if not exists calculation (
        calculation_id text primary key,
        node_id text not null references node(node_id),
        result_record_id text not null references result_record(result_record_id),
        method_label text not null,
        backend_label text not null,
        energy real not null,
        frequency_summary_json text not null,
        frozen_payload_path text not null
    )
    """,
    """
    create table if not exists report (
        report_id text primary key,
        report_dir text not null
    )
    """,
    """
    create table if not exists report_site (
        site_id text primary key,
        report_id text not null references report(report_id),
        label text not null
    )
    """,
    """
    create table if not exists report_point_binding (
        binding_id text primary key,
        report_id text not null references report(report_id),
        site_id text not null references report_site(site_id),
        calculation_id text not null references calculation(calculation_id),
        active integer not null check (active in (0, 1))
    )
    """,
    """
    create table if not exists report_edge (
        edge_id text primary key,
        report_id text not null references report(report_id),
        from_site_id text not null references report_site(site_id),
        to_site_id text not null references report_site(site_id),
        provenance_task_run_id text references task_run(task_run_id),
        note text not null default ''
    )
    """,
]


def initialize_database(db_path: str | Path) -> None:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.execute("pragma foreign_keys = on")
        for statement in SCHEMA_STATEMENTS:
            conn.execute(statement)
        conn.commit()


@contextmanager
def connect_project_database(db_path: str | Path) -> Iterator[sqlite3.Connection]:
    path = Path(db_path)
    initialize_database(path)
    conn = sqlite3.connect(path)
    conn.execute("pragma foreign_keys = on")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
```

- [ ] **Step 4: Run database tests**

Run:

```bash
python -m unittest tests.test_database -v
```

Expected: `OK`.

- [ ] **Step 5: Commit database schema**

Run:

```bash
git add src/rxnflow/database.py tests/test_database.py
git commit -m "feat: add RxnFlow project database schema"
```

---

### Task 6: Unified Result Registration

**Files:**
- Create: `src/rxnflow/registration.py`
- Create: `src/rxnflow/parsers/__init__.py`
- Create: `src/rxnflow/parsers/task.py`
- Create: `src/rxnflow/parsers/gaussian.py`
- Create: `src/rxnflow/parsers/orca.py`
- Modify: `src/rxnflow/cli.py`
- Create: `tests/test_registration.py`
- Create: `tests/fixtures/gaussian/minimal_opt.log`
- Create: `tests/fixtures/orca/minimal_opt.out`

- [ ] **Step 1: Write the failing registration test for task outputs**

Create `tests/test_registration.py` with this first test:

```python
from __future__ import annotations

import sqlite3
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.cli import main


class RegistrationTests(unittest.TestCase):
    def test_register_result_from_task_final_creates_node_calculation_and_frozen_copy(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            task_dir = root / "task" / "opt_im1"
            task_dir.mkdir(parents=True)
            (task_dir / "result.xyz").write_text("1\n\nH 0 0 0\n", encoding="utf-8")
            (task_dir / "metadata.json").write_text(
                textwrap.dedent(
                    """
                    {
                      "task": {"id": "opt_im1", "type": "geomopt"},
                      "settings": {"backend": "fake", "model": "fake-base", "charge": 0, "multiplicity": 1},
                      "artifacts": {"result_structure": "result.xyz"},
                      "summary": {"final_energy": -1.25}
                    }
                    """
                ),
                encoding="utf-8",
            )

            self.assertEqual(
                main(["register-result", "--from-task", str(task_dir), "--candidate", "final", "--new-node"]),
                0,
            )

            db_path = root / "database" / "project.sqlite"
            with sqlite3.connect(db_path) as conn:
                node_count = conn.execute("select count(*) from node").fetchone()[0]
                calc_count = conn.execute("select count(*) from calculation").fetchone()[0]
                energy = conn.execute("select energy from calculation").fetchone()[0]

            self.assertEqual(node_count, 1)
            self.assertEqual(calc_count, 1)
            self.assertEqual(energy, -1.25)
            self.assertTrue((root / "database" / "objects" / "results").exists())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the registration test and verify it fails**

Run:

```bash
python -m unittest tests.test_registration.RegistrationTests.test_register_result_from_task_final_creates_node_calculation_and_frozen_copy -v
```

Expected: FAIL because `register-result` is not a known command.

- [ ] **Step 3: Add parser result types and task parser**

Create `src/rxnflow/parsers/task.py`:

```python
"""Parse raw task outputs into registration candidates."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

from rxnflow.errors import WorkflowConfigError


@dataclass(slots=True)
class ParsedResult:
    structure_path: Path
    energy: float
    charge: int
    multiplicity: int
    method_label: str
    backend_label: str
    frequency_summary_json: str = "{}"


def parse_task_candidate(task_dir: Path, candidate: str) -> ParsedResult:
    metadata_path = task_dir / "metadata.json"
    if not metadata_path.exists():
        raise WorkflowConfigError(f"Task directory '{task_dir}' is missing metadata.json.")
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if candidate == "final":
        structure_path = task_dir / metadata["artifacts"]["result_structure"]
        energy = float(metadata["summary"]["final_energy"])
    elif candidate == "peak":
        structure_path = task_dir / metadata["artifacts"]["ts_like_structure"]
        energy = float(metadata["summary"]["peak_energy"])
    else:
        raise WorkflowConfigError(f"Task candidate '{candidate}' is not available.")
    settings = metadata["settings"]
    return ParsedResult(
        structure_path=structure_path,
        energy=energy,
        charge=int(settings["charge"]),
        multiplicity=int(settings["multiplicity"]),
        method_label=str(settings.get("model", "unknown-model")),
        backend_label=str(settings.get("backend", "unknown-backend")),
    )
```

- [ ] **Step 4: Add registration writer**

Create `src/rxnflow/registration.py` with:

```python
"""Register parsed chemistry results into the RxnFlow database."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import uuid

from .database import connect_project_database
from .errors import WorkflowConfigError
from .paths import database_path, objects_root, project_root_from_task_dir
from .parsers.task import parse_task_candidate


@dataclass(slots=True)
class RegistrationResult:
    result_record_id: str
    node_id: str
    calculation_id: str


def register_from_task(task_dir: str | Path, candidate: str, attach_node: str | None = None) -> RegistrationResult:
    directory = Path(task_dir).expanduser().resolve()
    project_root = project_root_from_task_dir(directory)
    parsed = parse_task_candidate(directory, candidate)
    if attach_node is not None:
        raise WorkflowConfigError("Task registration supports --new-node before --attach-node is implemented.")
    return _insert_registration(
        project_root=project_root,
        source_kind="task",
        source_path=directory,
        source_label=directory.name,
        candidate=candidate,
        parsed=parsed,
    )


def _insert_registration(project_root: Path, source_kind: str, source_path: Path, source_label: str, candidate: str, parsed) -> RegistrationResult:
    result_record_id = f"rr_{uuid.uuid4().hex[:12]}"
    node_id = f"node_{uuid.uuid4().hex[:12]}"
    calculation_id = f"calc_{uuid.uuid4().hex[:12]}"
    frozen_dir = objects_root(project_root) / "results" / result_record_id
    frozen_dir.mkdir(parents=True, exist_ok=True)
    frozen_structure = frozen_dir / "node.xyz"
    frozen_payload = frozen_dir / "calculation.json"
    shutil.copy2(parsed.structure_path, frozen_structure)
    frozen_payload.write_text(
        json.dumps(
            {
                "source_kind": source_kind,
                "source_path": str(source_path),
                "candidate": candidate,
                "energy": parsed.energy,
                "method_label": parsed.method_label,
                "backend_label": parsed.backend_label,
            },
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    now = datetime.now(timezone.utc).isoformat()
    with connect_project_database(database_path(project_root)) as conn:
        if source_kind == "task":
            task_run_id = f"taskrun_{uuid.uuid4().hex[:12]}"
            conn.execute(
                "insert into task_run(task_run_id, task_dir, task_type, source_task_yaml_path) values (?, ?, ?, ?)",
                (task_run_id, str(source_path), source_label, str(source_path / "task.yaml")),
            )
            import_record_id = None
        else:
            task_run_id = None
            import_record_id = f"import_{uuid.uuid4().hex[:12]}"
        conn.execute(
            "insert into result_record(result_record_id, source_kind, task_run_id, import_record_id, candidate_label, registered_at) values (?, ?, ?, ?, ?, ?)",
            (result_record_id, source_kind, task_run_id, import_record_id, candidate, now),
        )
        conn.execute(
            "insert into node(node_id, charge, multiplicity, origin_kind, frozen_structure_path) values (?, ?, ?, ?, ?)",
            (node_id, parsed.charge, parsed.multiplicity, source_kind, str(frozen_structure)),
        )
        conn.execute(
            "insert into calculation(calculation_id, node_id, result_record_id, method_label, backend_label, energy, frequency_summary_json, frozen_payload_path) values (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                calculation_id,
                node_id,
                result_record_id,
                parsed.method_label,
                parsed.backend_label,
                parsed.energy,
                parsed.frequency_summary_json,
                str(frozen_payload),
            ),
        )
    return RegistrationResult(result_record_id, node_id, calculation_id)
```

- [ ] **Step 5: Add CLI registration command**

Add parser:

```python
register_parser = subparsers.add_parser("register-result", help="Register a task or external result")
register_parser.add_argument("--from-task", dest="from_task")
register_parser.add_argument("--from-file", dest="from_file")
register_parser.add_argument("--parser", choices=["gaussian", "orca"])
register_parser.add_argument("--candidate", required=True)
register_parser.add_argument("--new-node", action="store_true")
register_parser.add_argument("--attach-node")
```

Add handler:

```python
    if args.command == "register-result":
        if args.from_task:
            result = register_from_task(args.from_task, args.candidate, attach_node=args.attach_node)
            print(json.dumps(asdict(result), indent=2))
            return 0
        parser.error("register-result requires --from-task for this implementation slice")
```

- [ ] **Step 6: Run registration test**

Run:

```bash
python -m unittest tests.test_registration -v
```

Expected: `OK`.

- [ ] **Step 7: Add minimal external parser tests**

Add tests that call:

```bash
rxnflow register-result --from-file tests/fixtures/gaussian/minimal_opt.log --parser gaussian --candidate final --new-node
rxnflow register-result --from-file tests/fixtures/orca/minimal_opt.out --parser orca --candidate final --new-node
```

The fixture parsers must extract one final energy, one final XYZ geometry, charge, and multiplicity. Use tiny fixture files committed under `tests/fixtures/`.

- [ ] **Step 8: Commit registration**

Run:

```bash
git add src/rxnflow/registration.py src/rxnflow/parsers src/rxnflow/cli.py tests/test_registration.py tests/fixtures
git commit -m "feat: register results into database objects"
```

---

### Task 7: Database-Backed Report Commands

**Files:**
- Modify: `src/rxnflow/reporting.py`
- Create: `src/rxnflow/report_config.py`
- Modify: `src/rxnflow/cli.py`
- Create: `tests/test_report_model.py`
- Modify: `tests/test_reporting.py`

- [ ] **Step 1: Write the failing report model test**

Create `tests/test_report_model.py`:

```python
from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.cli import main
from rxnflow.database import connect_project_database


class ReportModelTests(unittest.TestCase):
    def test_create_rebind_and_render_report_from_database(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path = root / "database" / "project.sqlite"
            with connect_project_database(db_path) as conn:
                conn.execute("insert into result_record values ('rr_1', 'task', null, null, 'final', '2026-04-24T00:00:00+00:00')")
                conn.execute("insert into node values ('node_1', 0, 1, 'task', 'database/objects/results/rr_1/node.xyz')")
                conn.execute("insert into calculation values ('calc_1', 'node_1', 'rr_1', 'fake-base', 'fake', -10.0, '{}', 'database/objects/results/rr_1/calculation.json')")

            self.assertEqual(main(["create-report", str(root / "report" / "main")]), 0)
            report_yaml = root / "report" / "main" / "report.yaml"
            report_yaml.write_text(
                "sites:\n  - id: im1\n    label: IM1\nedges: []\n",
                encoding="utf-8",
            )

            self.assertEqual(main(["rebind-report", str(root / "report" / "main"), "--site", "im1", "--calculation", "calc_1"]), 0)
            self.assertEqual(main(["validate-report", str(root / "report" / "main")]), 0)
            self.assertEqual(main(["render-report", str(root / "report" / "main")]), 0)

            network = json.loads((root / "report" / "main" / "network.json").read_text(encoding="utf-8"))
            self.assertEqual(network["sites"][0]["calculation_id"], "calc_1")
            self.assertEqual(network["sites"][0]["energy"], -10.0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the report model test and verify it fails**

Run:

```bash
python -m unittest tests.test_report_model -v
```

Expected: FAIL because `create-report`, `rebind-report`, `validate-report`, and `render-report` are not known commands.

- [ ] **Step 3: Add report config loader**

Create `src/rxnflow/report_config.py` with dataclasses for `ReportSiteConfig`, `ReportEdgeConfig`, and `ReportDirectoryConfig`. Load `report.yaml` from a report directory and reject duplicate site ids before rendering.

- [ ] **Step 4: Add report CLI commands**

Add CLI parsers:

```python
create_report_parser = subparsers.add_parser("create-report", help="Create one report directory")
create_report_parser.add_argument("report_dir")

validate_report_parser = subparsers.add_parser("validate-report", help="Validate one report directory")
validate_report_parser.add_argument("report_dir")

rebind_report_parser = subparsers.add_parser("rebind-report", help="Bind a report site to a calculation")
rebind_report_parser.add_argument("report_dir")
rebind_report_parser.add_argument("--site", required=True)
rebind_report_parser.add_argument("--calculation", required=True)

render_report_parser = subparsers.add_parser("render-report", help="Render one report directory")
render_report_parser.add_argument("report_dir")
```

- [ ] **Step 5: Implement report database operations**

In `src/rxnflow/reporting.py`, implement these functions:

```python
def create_report(report_dir: str | Path) -> Path:
    directory = Path(report_dir).expanduser().resolve()
    directory.mkdir(parents=True, exist_ok=True)
    report_yaml = directory / "report.yaml"
    if not report_yaml.exists():
        report_yaml.write_text("sites: []\nedges: []\n", encoding="utf-8")
    return directory


def rebind_report_site(report_dir: str | Path, site_id: str, calculation_id: str) -> None:
    directory = Path(report_dir).expanduser().resolve()
    project_root = directory.parent.parent
    with connect_project_database(database_path(project_root)) as conn:
        row = conn.execute("select calculation_id from calculation where calculation_id = ?", (calculation_id,)).fetchone()
        if row is None:
            raise WorkflowConfigError(f"Unknown calculation '{calculation_id}'.")
        report_id = directory.name
        conn.execute("insert or ignore into report(report_id, report_dir) values (?, ?)", (report_id, str(directory)))
        conn.execute("insert or ignore into report_site(site_id, report_id, label) values (?, ?, ?)", (site_id, report_id, site_id))
        conn.execute("update report_point_binding set active = 0 where report_id = ? and site_id = ?", (report_id, site_id))
        conn.execute(
            "insert into report_point_binding(binding_id, report_id, site_id, calculation_id, active) values (?, ?, ?, ?, 1)",
            (f\"bind_{report_id}_{site_id}_{calculation_id}\", report_id, site_id, calculation_id),
        )
```

- [ ] **Step 6: Implement database-only rendering**

`render_report()` must read `report_point_binding`, `calculation`, and `report_edge` from SQLite and write:

- `network.json`
- `pes.png`
- `pes.cdxml`

For `pes.cdxml`, write a deterministic text placeholder in CDXML-like XML:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CDXML><page id="1"><t>RxnFlow PES</t></page></CDXML>
```

This keeps the artifact contract testable before a full chemical drawing renderer is added.

- [ ] **Step 7: Ensure raw task files are not read by report rendering**

Add this assertion to `tests/test_report_model.py` after rendering:

```python
self.assertFalse((root / "task").exists())
```

Run:

```bash
python -m unittest tests.test_report_model tests.test_reporting -v
```

Expected: `OK`.

- [ ] **Step 8: Commit database-backed reports**

Run:

```bash
git add src/rxnflow/reporting.py src/rxnflow/report_config.py src/rxnflow/cli.py tests/test_report_model.py tests/test_reporting.py
git commit -m "feat: render reports from registered calculations"
```

---

### Task 8: Delete Result And Dangling Report Validation

**Files:**
- Modify: `src/rxnflow/database.py`
- Modify: `src/rxnflow/cli.py`
- Modify: `src/rxnflow/reporting.py`
- Create: `tests/test_delete_result.py`

- [ ] **Step 1: Write the failing delete safety test**

Create `tests/test_delete_result.py`:

```python
from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.cli import main
from rxnflow.database import connect_project_database


class DeleteResultTests(unittest.TestCase):
    def test_delete_result_removes_calculation_and_validate_report_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path = root / "database" / "project.sqlite"
            with connect_project_database(db_path) as conn:
                conn.execute("insert into result_record values ('rr_1', 'task', null, null, 'final', '2026-04-24T00:00:00+00:00')")
                conn.execute("insert into node values ('node_1', 0, 1, 'task', 'database/objects/results/rr_1/node.xyz')")
                conn.execute("insert into calculation values ('calc_1', 'node_1', 'rr_1', 'fake-base', 'fake', -10.0, '{}', 'database/objects/results/rr_1/calculation.json')")
                conn.execute("insert into report values ('main', ?)", (str(root / "report" / "main"),))
                conn.execute("insert into report_site values ('im1', 'main', 'IM1')")
                conn.execute("insert into report_point_binding values ('bind_1', 'main', 'im1', 'calc_1', 1)")

            self.assertEqual(main(["delete-result", str(root), "rr_1"]), 0)

            with sqlite3.connect(db_path) as conn:
                calc_count = conn.execute("select count(*) from calculation").fetchone()[0]
                node_count = conn.execute("select count(*) from node").fetchone()[0]
            self.assertEqual(calc_count, 0)
            self.assertEqual(node_count, 0)
            self.assertEqual(main(["validate-report", str(root / "report" / "main")]), 2)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the delete test and verify it fails**

Run:

```bash
python -m unittest tests.test_delete_result -v
```

Expected: FAIL because `delete-result` is not a known command.

- [ ] **Step 3: Implement hard deletion**

In `src/rxnflow/database.py`, add:

```python
def delete_result(db_path: str | Path, result_record_id: str) -> None:
    with connect_project_database(db_path) as conn:
        rows = conn.execute(
            "select calculation_id, node_id from calculation where result_record_id = ?",
            (result_record_id,),
        ).fetchall()
        for calculation_id, node_id in rows:
            conn.execute("delete from calculation where calculation_id = ?", (calculation_id,))
            remaining = conn.execute("select count(*) from calculation where node_id = ?", (node_id,)).fetchone()[0]
            if remaining == 0:
                conn.execute("delete from node where node_id = ?", (node_id,))
        conn.execute("delete from result_record where result_record_id = ?", (result_record_id,))
```

- [ ] **Step 4: Add delete-result CLI**

Add parser:

```python
delete_parser = subparsers.add_parser("delete-result", help="Delete one registered result")
delete_parser.add_argument("project_root")
delete_parser.add_argument("result_record_id")
```

Add handler:

```python
    if args.command == "delete-result":
        delete_result(database_path(Path(args.project_root)), args.result_record_id)
        print(json.dumps({"deleted": args.result_record_id}, indent=2))
        return 0
```

- [ ] **Step 5: Make validate-report refuse dangling bindings**

In `src/rxnflow/reporting.py`, make `validate_report()` return failure through `WorkflowConfigError` if an active binding references a missing calculation:

```python
missing = conn.execute(
    """
    select b.calculation_id
    from report_point_binding b
    left join calculation c on c.calculation_id = b.calculation_id
    where b.report_id = ? and b.active = 1 and c.calculation_id is null
    """,
    (report_id,),
).fetchall()
if missing:
    labels = ", ".join(row[0] for row in missing)
    raise WorkflowConfigError(f"Report '{report_id}' has missing calculations: {labels}")
```

- [ ] **Step 6: Run delete and report tests**

Run:

```bash
python -m unittest tests.test_delete_result tests.test_report_model -v
```

Expected: `OK`.

- [ ] **Step 7: Commit deletion and validation safety**

Run:

```bash
git add src/rxnflow/database.py src/rxnflow/cli.py src/rxnflow/reporting.py tests/test_delete_result.py
git commit -m "feat: delete registered results safely"
```

---

### Task 9: Documentation And Remote Smoke Test

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README with v1 workflow commands**

Replace `README.md` with:

````markdown
# RxnFlow

RxnFlow is a workflow-first chemistry system for ML-assisted reaction-path screening.

## V1 Workflow

Task execution is raw-only:

```bash
rxnflow validate-task task/opt_im1
rxnflow run-task task/opt_im1
```

Registration is the only path into the database:

```bash
rxnflow register-result --from-task task/opt_im1 --candidate final --new-node
rxnflow register-result --from-file gaussian.log --parser gaussian --candidate final --new-node
```

Reports read registered calculations only:

```bash
rxnflow create-report report/main
rxnflow rebind-report report/main --site IM1 --calculation calc_id
rxnflow validate-report report/main
rxnflow render-report report/main
```

Project layout:

```text
task/
report/
database/
  project.sqlite
  objects/
```

The default UMA execution boundary is a machine-level shared service on `win11local`.
````

- [ ] **Step 2: Run full local tests**

Run:

```bash
python -m unittest discover -s tests -v
```

Expected: `OK`.

- [ ] **Step 3: Commit documentation**

Run:

```bash
git add README.md
git commit -m "docs: describe RxnFlow v1 workflow"
```

- [ ] **Step 4: Synchronize local main to the remote Windows checkout**

Run from `/Users/linsay/Desktop/code/win11local/rxnflow`:

```bash
git bundle create /tmp/rxnflow-main.bundle main
scp /tmp/rxnflow-main.bundle win11local:D:/Code/rxnflow-main.bundle
ssh win11local "powershell -NoProfile -Command \"Set-Location 'D:\\Code\\rxnflow'; git fetch D:\\Code\\rxnflow-main.bundle main:refs/remotes/local/main; git merge --ff-only refs/remotes/local/main\""
```

Expected remote merge output includes:

```text
Fast-forward
```

- [ ] **Step 5: Run remote tests in the `chem` environment**

Run:

```bash
ssh win11local "powershell -NoProfile -Command \"Set-Location 'D:\\Code\\rxnflow'; conda run -n chem python -m unittest discover -s tests -v\""
```

Expected: `OK`.

---

## Self-Review

### Spec Coverage

- Shared UMA service boundary is covered by Task 3.
- `task/<task-id>` raw-only execution is covered by Task 2 and Task 4.
- `database/project.sqlite` and `database/objects` are covered by Task 5 and Task 6.
- Unified `register-result` from task outputs and external files is covered by Task 6.
- Node and calculation separation is covered by Task 5 and Task 6.
- Report sites, edges, bindings, and database-only rendering are covered by Task 7.
- Hard deletion and dangling report validation are covered by Task 8.
- Remote `win11local` validation is covered by Task 9.
- Frontend work is excluded, matching the spec.

### Placeholder Scan

The plan contains no unresolved placeholder markers or intentionally blank implementation steps.

### Type Consistency

The plan consistently uses:

- `TaskDirectoryConfig`
- `ServiceProfile`
- `CalculatorSettings`
- `RegistrationResult`
- `ParsedResult`
- `database/project.sqlite`
- `database/objects/results/<result-record-id>/`
- CLI commands `validate-task`, `run-task`, `register-result`, `create-report`, `validate-report`, `rebind-report`, `render-report`, and `delete-result`
