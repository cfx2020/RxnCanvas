# ML Reaction Workflow Architecture Design

Date: 2026-04-23
Status: Approved for planning
Scope: Backend/service layer plus task-index-report data model. Frontend UI is intentionally out of scope for v1 implementation.

## Summary

This design reshapes `mlrxn-workflow` into a workflow-first chemistry system with three fixed project areas:

- `task/`: one self-contained task work directory per job
- `report/`: user-authored mechanism/network composition plus rendered PES artifacts
- `index/`: SQLite-backed source of truth for registered geometries, calculations, provenance, and report bindings

The v1 system does not treat task outputs as automatically reportable chemistry objects. Tasks only generate task-local raw working files. A separate `register-result` action parses either task outputs or external files such as Gaussian/ORCA results, normalizes the selected result, freezes a copy under `index/`, and writes `node + calculation + result_record` into `index/project.sqlite`.

## Goals

- Keep execution modular, decoupled, and frontend-ready.
- Default to a machine-level shared UMA service so models are not reloaded for every task.
- Preserve a one-task-one-folder workflow similar to ORCA/xTB/CREST.
- Keep task execution and report composition strictly decoupled.
- Allow external chemistry results to be registered and used in reports without forcing them through the task engine.
- Support full branching report networks rather than only linear traces.
- Keep all reportable objects explicit and user-controlled.

## Non-Goals

- No v1 frontend implementation.
- No v1 automatic mechanism discovery or agent-like task planning.
- No v1 automatic geometry matching against existing nodes.
- No v1 automatic registration of task outputs into the index.
- No v1 task bundles as a first-class storage model.
- No v1 task-status or rerun lifecycle manager.
- No v1 raw task files used directly by report rendering.

## Architectural Approach

This design uses a moderate refactor rather than a full rewrite.

- Keep the repository and reusable execution logic for `geomopt`, `scan`, `neb`, and related tests.
- Replace the current direct `task artifact -> report` flow with `task -> register-result -> index -> report`.
- Replace the current in-process UMA default with a service-client abstraction.
- Keep the CLI workflow-first and explicit.

## Core Principles

1. Tasks are working directories, not report objects.
2. Registered results are the only chemistry objects that enter the index.
3. Geometry and calculation remain separate concepts.
4. Reports compose registered calculations into user-defined mechanism networks.
5. Raw files remain in task directories; normalized frozen copies live under `index/`.
6. All joins that could be chemically ambiguous are explicit, not guessed.

## Project Layout

```text
project/
  task/
    opt_im1/
      task.yaml
      input.xyz
      stdout.log
      trajectory.traj
      result.xyz
      energies.csv
      peak.xyz              # task-specific, optional
      images/               # task-specific, optional
    scan_oa/
    neb_re/
  report/
    mechanism_compare/
      report.yaml
      network.json
      pes.cdxml
      pes.png
  index/
    project.sqlite
    store/
      results/
        rr_0001/
          node.xyz
          calculation.json
```

Design notes:

- Each task directory is flat by default.
- Subdirectories inside a task directory are allowed only when a task naturally produces grouped outputs such as NEB images.
- The task directory holds user input and raw runtime outputs together.
- `index/store/` holds frozen normalized copies created only at registration time.
- `report/` holds user-authored report definitions plus rendered output artifacts.

## Service Layer

### Default Mode

The default execution mode is a machine-level shared UMA service running on `win11local`.

- One long-lived service process loads the model once.
- Multiple projects can connect to the same service profile.
- The service is treated as stateless with respect to project chemistry.
- Queueing is explicit; no v1 promise of concurrent chemistry execution is made.

### Optional Isolation

When the user explicitly needs isolation, the workflow may point to a project-local service instance instead of the machine-level shared one.

### Required Service Boundary

The workflow code should talk to a service client abstraction rather than directly constructing UMA predictors inside task execution code.

The client boundary is responsible for:

- request serialization
- service profile selection
- connection management
- normalized energy/force/hessian response handling

## Task Model

### Task Philosophy

Tasks are independent jobs. They do not implicitly become pathway nodes.

Examples:

- `geomopt`
- `scan`
- `neb`
- `ts`

All of them are peer task types. A `neb` task can be used to find a TS candidate; a later `ts` or `geomopt` task can refine it. Only selected final chemistry results are registered.

### Task Inputs

Each task directory contains:

- `task.yaml`: human-authored task definition
- `input.xyz`: task-local structure input

The task definition is YAML, not a Gaussian-like freeform route file. It should be expressive enough to carry the chemistry information normally found in a `.gjf` while staying explicit for workflow use.

Minimum task inputs:

- task type
- charge
- multiplicity
- backend/service profile selection
- task-specific settings such as optimizer, scan coordinate, or NEB image count
- task-local paths such as `input.xyz`

### Task Outputs

`run-task` writes only task-local runtime files. It does not create report-ready normalized outputs in the index.

Typical task files may include:

- `stdout.log`
- `trajectory.traj`
- `result.xyz`
- `energies.csv`
- `peak.xyz`
- `images/`

These files are parser inputs for `register-result`, not the stable API consumed by reports.

### CLI

V1 task commands:

- `validate-task <task-dir>`: input-only validation before execution
- `run-task <task-dir>`: execute the task inside that task directory

V1 does not include:

- `create-task`
- `task-status`
- `rerun`
- bundle-oriented commands

The expected user flow is to manually create a task directory, place `input.xyz`, author `task.yaml`, then run the task.

## Unified Result Registration

### Why Registration Is Separate

Task outputs and external files should be treated the same way from the index's perspective: both are just sources of chemistry results that must be normalized before entering the source of truth.

### Single Registration Command

V1 uses one unified registration concept:

- `register-result`

It accepts different source adapters:

- a task directory
- a Gaussian result file
- an ORCA result file
- future external formats

### Registration Behavior

`register-result` performs the following steps:

1. Read the source files.
2. Parse task-specific or program-specific raw outputs.
3. Select one explicit candidate result.
4. Normalize the chosen structure and chemistry metadata.
5. Freeze a copy under `index/store/results/<result-record-id>/`.
6. Insert `result_record`, `node`, and `calculation` rows into `project.sqlite`.

### Registration Granularity

V1 always registers a chemistry result, not a bare geometry placeholder.

Default registration unit:

- `node + calculation`

This means v1 does not support inserting a geometry-only node into the index.

### Candidate Selection

Tasks such as `scan` and `neb` may expose multiple candidate outputs, but none are auto-registered.

Examples of valid explicit candidates:

- `final`
- `peak`
- `image_07`

This keeps the index clean and avoids filling it with intermediate search artifacts that were never intended for PES comparison.

## Node and Calculation Model

### Node

`node` represents one concrete geometry.

Properties:

- one actual structure snapshot
- charge and multiplicity metadata
- origin kind such as task-derived or external import
- frozen structure path under `index/store/`

Rule:

- if the geometry is different, it is a different node

### Calculation

`calculation` represents one method/result performed on one node.

Properties:

- `calculation_id`
- `node_id`
- method/backend summary
- energy and optional frequency summary
- provenance fields
- frozen normalized result payload path

### Why They Stay Separate

Even when the default registration action inserts `node + calculation` together, the model stays split because:

- one geometry can later accumulate multiple results
- reports conceptually choose calculations, not raw geometries
- hard deletion can remove a bad calculation while preserving a node if other valid calculations still reference it

### No Automatic Geometry Matching

V1 never guesses whether a newly parsed geometry should be merged into an existing node.

Explicit modes:

- `--new-node`
- `--attach-node <node-id>`

Use cases:

- final structure from optimization: usually `--new-node`
- single-point or frequency on an already known geometry: usually `--attach-node`

## Index Schema

### Source of Truth

`index/project.sqlite` is the only source of truth for registered chemistry objects and report bindings.

### Core Tables

#### `task_run`

Tracks task provenance without acting as a report object.

Representative fields:

- `task_run_id`
- `task_dir`
- `task_type`
- `source_task_yaml_path`

This table is intentionally minimal in v1 because task runtime status management is not a first-class feature.

#### `import_record`

Tracks provenance for external sources.

Representative fields:

- `import_record_id`
- `source_program`
- `source_path`
- `parser_name`
- `imported_at`

#### `result_record`

Represents one registration event and is the hard-delete boundary.

Representative fields:

- `result_record_id`
- `source_kind` (`task` or `import`)
- `task_run_id` or `import_record_id`
- `candidate_label`
- `registered_at`

#### `node`

Geometry record.

Representative fields:

- `node_id`
- `charge`
- `multiplicity`
- `origin_kind`
- `frozen_structure_path`

#### `calculation`

Registered chemistry result record.

Representative fields:

- `calculation_id`
- `node_id`
- `result_record_id`
- `method_label`
- `backend_label`
- `energy`
- `frequency_summary_json`
- `frozen_payload_path`

### Frozen Store

At registration time, the workflow creates immutable normalized artifacts under `index/store/`.

Reasons:

- reports and report bindings do not depend on later edits to task directories
- external source files can move without invalidating previously registered results
- deletion and replacement become clean index operations

SQLite stores:

- frozen artifact paths
- original source paths for provenance

## Report Model

### Report Philosophy

Reports are user-authored branching mechanism networks, not derived task trees.

### Report Objects

#### `report`

One report workspace under `report/<report-id>/`.

#### `report_site`

Represents one displayed chemistry point such as `IM1`, `TS1`, or `P1`.

Label policy:

- project-level canonical labels may exist for reuse
- each report may override the display label

This supports both shared naming and report-specific presentation.

#### `report_point_binding`

Maps a report site to a chosen calculation.

V1 behavior:

- one active binding per displayed point
- the schema may keep room for future candidate bindings, but v1 does not expose a full energy-view system

#### `report_edge`

Represents a user-authored connection between two report sites.

Edge semantics:

- primarily composition/display relationship
- optional provenance may point to a task run or include a freeform note
- provenance is not mandatory

### Full Network Support

V1 report data model is a full branching network.

Rendering policy:

- users may choose to render the whole network
- or render selected traces/branches from that network

This keeps the stored model expressive without forcing one rigid visualization mode.

### Render Outputs

`render-report` produces:

- `network.json`
- `pes.png`
- `pes.cdxml`

The report renderer never reads raw task files directly; it resolves everything through the index.

## CLI Surface

### Task Commands

- `validate-task <task-dir>`
- `run-task <task-dir>`

### Registration Commands

- `register-result --from-task <task-dir> --candidate <label> [--new-node | --attach-node <node-id>]`
- `register-result --from-file <path> --parser <gaussian|orca|...> [--new-node | --attach-node <node-id>]`

### Report Commands

- `create-report <report-id>`
- `validate-report <report-id>`
- `rebind-report <report-id> --site <site-id> --calculation <calculation-id>`
- `render-report <report-id>`

### Deletion Command

- `delete-result <result-record-id>`

## Deletion and Replacement Rules

### Hard Delete

V1 uses hard deletion for mistaken registrations.

Deletion sequence:

1. delete `result_record`
2. delete linked `calculation`
3. if the linked `node` has no remaining calculations, delete the orphan node and its frozen files

Deletion does not remove:

- raw task directory files
- original Gaussian/ORCA files

### Replacement

V1 does not need a complicated in-place replacement engine.

Recommended replacement flow:

1. `delete-result`
2. `register-result`
3. `rebind-report` if needed

This keeps provenance and report repair explicit.

### Report Safety

If a report still references a deleted calculation:

- `validate-report` fails
- `render-report` refuses to render
- the system never silently retargets to another calculation

## Validation and Error Handling

### `validate-task`

`validate-task` is a pre-run input validation command only.

Checks include:

- `task.yaml` syntax and required keys
- `input.xyz` existence and readability
- charge/multiplicity sanity
- task-type-specific parameter validation
- existence of referenced local files or service profiles

It does not inspect task success/failure after execution.

### `validate-report`

Checks include:

- report syntax
- existence of referenced sites, calculations, and edges
- binding consistency
- absence of dangling references after deletion/replacement

### Registration Errors

Registration should fail explicitly when:

- the requested candidate does not exist
- the parser cannot identify a valid final structure/result
- the source format is unsupported
- `--attach-node` conflicts with parsed metadata in a way the system treats as invalid

## Frontend Boundary

### V1 Decision

Do not implement the frontend in v1.

### Reason

The core object model is still the risky part. A premature UI would hard-code unstable assumptions and increase rework.

### Required Backend Contracts for Future UI

The v1 backend should be shaped so a future report composer UI can:

- browse nodes and calculations from the index
- inspect frozen structures and energy summaries
- create and edit report sites
- create and edit report edges
- rebind report sites to different calculations
- trigger report rendering

### Intended First UI Slice

When the data model stabilizes, the first useful UI should focus on report composition:

- browse index objects
- drag or select report sites
- connect branch edges
- switch site bindings
- preview relative energies and render outputs

Task running itself is not the first UI priority.

## Migration Guidance

Implementation should proceed in the following order:

1. introduce the UMA service-client boundary
2. refactor task execution to stop treating task outputs as report-ready
3. add SQLite index plus frozen store
4. implement unified `register-result`
5. refactor report generation to consume index records only
6. add validation and deletion flows
7. expose frontend-ready query/mutation contracts without building the UI yet

## Accepted Decisions From Design Review

- scope is backend/service plus task-index-report model; frontend deferred
- shared machine-level UMA service is the default, project-local isolation is optional
- tasks are one-folder-per-job with `task.yaml` plus `input.xyz`
- no bundle-first workflow in v1
- task outputs stay task-local and raw
- `register-result` is the only path into the index for chemistry objects
- registration freezes normalized copies under `index/`
- geometry and calculation remain separate concepts
- reports are branching networks with optional provenance on edges
- scan/neb results are not auto-registered
- v1 uses hard deletion for mistaken registrations
