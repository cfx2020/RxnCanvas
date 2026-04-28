# RxnFlow Plan

## Product Direction

RxnFlow is a reaction-path registration, graph assembly, and visual reporting
application for computational chemistry results.

The project starts from raw calculation outputs produced elsewhere. Users bring
files such as Gaussian logs, ORCA outputs, ASE `extxyz` trajectories, and later
other program outputs. RxnFlow parses those files, registers reusable chemistry
objects, lets users assemble reaction networks, computes selected energy
profiles, and exports visual reports.

The core product should feel like a chemistry-focused graph editor:

1. Import raw output files.
2. Parse structures, energies, thermochemistry, and metadata.
3. Register reusable calculations and species.
4. Compose states, corrections, and reaction edges.
5. Render resolved reports as JSON, PNG, and ChemDraw/CDXML.

The future frontend should generate the same declarative YAML that the CLI can
consume. The visual workflow should be close to a node graph: input files feed
species, species feed states, states connect through reaction edges, and render
nodes export the final report.

## Project Layout

A typical project should look like:

```text
rxnflow-project/
  inputs/
    gaussian/
    orca/
    ase/
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

`inputs/` contains user-supplied raw calculation outputs.

`database/` contains registered normalized objects, indexed metadata, and frozen
copies of important structures or parser payloads.

`report/` contains declarative report definitions and generated views.

## Source Of Truth

`report.yaml` should be the complete authoring source for a report.

It should define:

- imported raw output files;
- parser hints when file inference is not enough;
- species and their available energy channels;
- graph states made from one or more species;
- corrections and derived energy channels;
- edges between states;
- the energy channel to plot;
- reference state;
- export options.

`network.json` is a generated artifact, not the authoring format. It should be
safe to delete and regenerate from `report.yaml` plus registered data.

## Target CLI

The initial CLI should focus on registration, inspection, and rendering:

```bash
rxnflow register inputs/gaussian/im1.log
rxnflow list-results
rxnflow render-report report/main/report.yaml
```

`render-report` should be able to auto-register files declared in
`report.yaml` when they are missing from the database. Rendering is therefore
allowed to update `database/project.sqlite`.

The user should not need to manually bind individual `calc_*` ids into a report.
Report membership and graph wiring should live in `report.yaml`.

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

This YAML should be suitable for both hand editing and frontend generation.

## Energy Model

RxnFlow must support multiple energy channels for the same species.

The important near-term use case is solvation correction from two Gaussian
outputs:

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

Energy expressions should start conservative. The first implementation can
support named channels, simple arithmetic, and explicit corrections. General
formula evaluation can be expanded later once the data model is stable.

## Registration Model

Registration should normalize raw outputs into reusable database objects.

At minimum, registered data should include:

- source file path and source program;
- parser name and parser version;
- candidate label;
- structure geometry;
- charge and multiplicity;
- method label;
- electronic energy;
- thermal and Gibbs data when available;
- raw parser payload for later debugging;
- frozen normalized structure under `database/objects/`.

Registration should be idempotent by content hash or stable source selector
where possible. Re-rendering a report should not create duplicate records for
the same unchanged file.

## Parser Scope

Initial parser priorities:

1. Gaussian optimization/frequency logs.
2. Gaussian single-point logs.
3. ORCA outputs with comparable energy and structure fields.
4. ASE `extxyz` files containing structures, energies, and metadata.

Plain optimizer log files that do not reliably contain full coordinates should
not be treated as structure sources by default.

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
first implementation can be minimal, but CDXML export should remain a core
product direction.

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

1. Create a clean Python package and CLI for RxnFlow.
2. Implement parser interfaces and normalized result models.
3. Implement Gaussian optimization/frequency parsing.
4. Implement Gaussian single-point parsing.
5. Implement ORCA parsing for comparable fields.
6. Implement ASE `extxyz` parsing.
7. Implement database registration and idempotent imports.
8. Add `list-results`.
9. Implement declarative `report.yaml` loading.
10. Resolve imports, species, states, edges, and energy channels.
11. Implement solvation correction channels.
12. Implement `render-report report.yaml`.
13. Generate `network.json`, `pes.png`, and `pes.cdxml`.
14. Build the future frontend on top of the same YAML and resolved graph model.

