# RxnFlow Rewrite Plan

## Core Direction

RxnFlow should be rewritten as a reaction-path registration, graph assembly, and
visual reporting application. It should not remain an ASE task runner.

The ASE/UMA calculation runner should become a separate project. A working name
for that project is `aseflow`. It owns task execution and raw ASE artifacts.
RxnFlow owns parsing already-produced calculation outputs, registering reusable
chemistry objects, assembling reaction networks, and exporting visual reports.

This split is intentional:

- `aseflow`: run `task.yaml` with ASE/UMA and produce raw files.
- `rxnflow`: consume ASE/Gaussian/ORCA outputs and build reaction-path reports.

The current codebase is exploratory and not released. Backward compatibility is
not required. Remove old compatibility commands and legacy layers when they get
in the way.

## Non-Goals For RxnFlow

RxnFlow should not:

- run ASE optimizations, scans, or NEB jobs;
- own UMA calculator setup or device/model execution;
- keep `validate-task` or `run-task`;
- keep `rebind-report`;
- require users to manually bind individual `calc_*` ids after registration;
- treat `network.json` as editable input;
- preserve old workflow-YAML behavior.

## Product Goal

RxnFlow should feel like a chemistry-focused graph/report application:

1. Users provide raw outputs from ASE, Gaussian, ORCA, and later other tools.
2. RxnFlow parses those files and registers structures, energies, and metadata.
3. Users define or visually arrange species, states, corrections, and edges.
4. RxnFlow resolves the graph and computes reaction-profile values.
5. RxnFlow exports machine-readable JSON and visual outputs such as PNG and
   ChemDraw/CDXML.

The future frontend should be able to generate the same declarative report YAML
that a power user can write by hand. The mental model is similar to ComfyUI:
files and calculations are input nodes; species, corrections, states, and edges
are graph nodes; rendering produces report artifacts.

## Project Layout

A typical RxnFlow project should look like:

```text
rxnflow-project/
  inputs/
    ase/
    gaussian/
    orca/
  database/
    project.sqlite
    objects/
  report/
    main/
      report.yaml
      network.json
      pes.png
      pes.cdxml
```

`inputs/` contains user-supplied raw calculation outputs. `database/` contains
registered normalized objects and indexed metadata. `report/` contains report
definitions and generated views.

Task-output directories produced by `aseflow` can also be used as inputs, but
they are not part of RxnFlow's execution responsibility.

## Source Of Truth

`report.yaml` should become the complete source of truth for a report.

It should define:

- imported raw output files;
- parser hints only when inference is not enough;
- species and their energy channels;
- graph states made from one or more species;
- edges between states;
- the profile energy to plot;
- reference state and export options.

`network.json` is only a resolved render artifact. It is generated from
`report.yaml` plus registered/parsed data. Users should not need to edit
`network.json` directly.

## Target CLI

The primary CLI should be:

```bash
rxnflow register path/to/output.log
rxnflow list-results
rxnflow render-report report/main/report.yaml
```

`render-report` should be able to auto-register files declared in `report.yaml`
when they are missing from the database. This means render is allowed to update
`database/project.sqlite`.

Manual `rebind-report` should be removed. A report should not depend on hidden
binding state in the database.

## Declarative Report YAML

The target shape should be close to:

```yaml
id: main

imports:
  im1_gas_opt:
    source: inputs/gaussian/im1_gas_opt.log
    parser: gaussian
    candidate: final
    role: gas_opt

  im1_solv_sp:
    source: inputs/gaussian/im1_solv_sp.log
    parser: gaussian
    candidate: final
    role: solvent_sp

species:
  im1:
    geometry: im1_gas_opt
    energies:
      gas_electronic: im1_gas_opt.energy.electronic
      gas_gibbs: im1_gas_opt.thermo.gibbs
      solvent_sp_electronic: im1_solv_sp.energy.electronic
      solvated_gibbs:
        expression: gas_gibbs + solvent_sp_electronic - gas_electronic

states:
  reactants:
    label: Cat + Substrate
    components:
      - species: catalyst
      - species: substrate

  complex:
    label: Bound complex
    components:
      - species: im1

  ts1:
    label: TS1
    components:
      - species: ts1

  products:
    label: Cat + Product
    components:
      - species: catalyst_after
      - species: product

edges:
  - from: reactants
    to: complex
    kind: association

  - from: complex
    to: ts1
    kind: reaction

  - from: ts1
    to: products
    kind: release

profile:
  energy: solvated_gibbs
  reference: reactants

exports:
  json: true
  png: true
  cdxml: true
```

The frontend can later generate this YAML directly from a visual graph editor.

## Energy Model

RxnFlow must support multiple energy channels for the same species.

The important near-term use case is solvation correction from two Gaussian logs:

- gas-phase optimization/frequency output gives gas electronic energy and gas
  Gibbs free energy;
- solvent single-point output on the gas-phase geometry gives solvent electronic
  energy;
- solvated Gibbs free energy is computed as:

```text
G_sol = G_gas + E_solvent_sp - E_gas
```

Reaction profiles then compute state sums and relative energies:

```text
Delta G_sol = G_sol(state) - G_sol(reference)
Delta G_sol barrier = G_sol(TS) - G_sol(reference)
```

States may contain one species or multiple components. Multi-component states
are sums of component energies. This is required for substrate association,
product release, separated reactants, and separated products.

## Registration Model

Registration should normalize raw outputs into reusable database objects.

At minimum, registered data should include:

- source file path and source program;
- parser name and parser version;
- candidate label;
- structure geometry;
- charge and multiplicity;
- method/backend label;
- electronic energy;
- thermal/Gibbs data when available;
- raw parser payload for later debugging;
- frozen normalized structure under `database/objects/`.

Registration should be idempotent by content or by stable source selector where
possible. Re-rendering a report should not create duplicate records for the same
unchanged file.

## Parser Scope

Initial parser priorities:

1. ASE `extxyz` outputs from `aseflow` or external ASE runs.
2. Gaussian optimization/frequency logs.
3. Gaussian single-point logs.
4. ORCA outputs with comparable energy and structure fields.

ASE `opt.log` style files are not good structure sources by themselves because
they do not reliably contain full coordinates. Prefer `extxyz`, Gaussian logs,
or ORCA outputs for registration.

## Report Outputs

Rendering should produce:

```text
network.json
pes.png
pes.cdxml
```

`network.json` should be the resolved graph with all selected calculations,
energies, relative energies, states, edges, and source references. It is useful
for the frontend and for debugging, but it is not the authoring format.

`pes.png` should be a quick visual reaction profile.

`pes.cdxml` should be suitable for opening or further editing in ChemDraw. The
first implementation can be minimal, but the format should remain part of the
core product direction.

## Frontend Direction

The future frontend should expose:

- file upload/import;
- parsed result list with structures and energy channels;
- graph canvas for species, states, corrections, and edges;
- live resolved network preview;
- relative energy table;
- reaction profile plot;
- one-click export to JSON, PNG, and CDXML.

The frontend should not invent a separate hidden data model. It should generate
and consume the same declarative `report.yaml` used by the CLI.

## Rewrite Milestones

1. Split ASE runner into a new `aseflow` project.
2. Remove task execution code from `rxnflow`.
3. Remove `rebind-report` and old hidden report bindings.
4. Keep or rebuild registration around raw ASE/Gaussian/ORCA files.
5. Add `list-results`.
6. Redesign `report.yaml` as the complete graph/report definition.
7. Implement `render-report report.yaml` with auto-register and graph resolve.
8. Add energy channels and the solvation correction model.
9. Generate `network.json`, `pes.png`, and `pes.cdxml` from the resolved graph.
10. Build the future frontend on top of the same YAML and resolved graph model.

