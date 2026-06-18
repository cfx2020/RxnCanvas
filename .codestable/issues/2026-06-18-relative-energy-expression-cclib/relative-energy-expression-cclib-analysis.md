---
doc_type: issue-analysis
slug: relative-energy-expression-cclib
status: fixed
severity: high
tags: [energy-table, relative-energy, parser, cclib, ir-regression]
created: 2026-06-18
---

# Issue Analysis: relative-energy expression/cclib regression

## Root causes

1. **Table relative mode has its own baseline logic.**
   `EnergyTableView` computes per-column baselines by scanning the first row with a value. This ignores `energyDisplayOptions.baselineNodeId` and also ignores `energyTableRows()`.

2. **Shared energy model is node-only.**
   `energyDisplay.ts` currently computes `row.relative` from a single node energy minus a single baseline node energy. It cannot represent old-project-style composition terms such as `TS + Cl - 1 - 4b-1`.

3. **Graph links are not part of energy derivation.**
   The canvas edge set is used visually but not by the table/canvas energy derivation. For Ir-like graphs, the main chain and side/incoming species are enough to infer a lightweight expression model.

4. **Full-file parser still lacks cclib.**
   The engine reads full files via `sourcePath`, but it still invokes the regex parser only. Old project code used cclib for production computational output parsing and overlaid exact Gaussian text fields afterward.

## Fix strategy

- Add optional cclib full-file parse path to `rxnflow/engine.py`; preserve regex parser fallback and overlay custom Gaussian/ORCA fields.
- Extend `energyDisplay.ts` rows with graph-expression metadata, relative path visibility, and a precomputed relative `energyTable` that already respects selected zero point.
- Pass `edges` into `energyTableRows()` and `relativeEnergyZeroNode()` from `App.tsx` so canvas/table/export share the same derived rows.
- Change `ReportPanels.tsx` relative mode to read row-level relative energy tables instead of recomputing baselines.
- Add Ir workbook regression tests for the formulas above.
