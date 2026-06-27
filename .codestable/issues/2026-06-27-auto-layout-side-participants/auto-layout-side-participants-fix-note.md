---
doc_type: issue-fix
slug: auto-layout-side-participants
status: fixed
severity: medium
tags:
  - web-workbench
  - canvas
  - auto-layout
  - energy-path
fixed_at: 2026-06-27
---

# Auto-layout side participants fix note

## Symptom

Energy auto-layout could place a side participant far away from the rest of the reaction graph. Structures outside the main reaction path, such as species added mid-path or released by a step, could also appear below the main path or overlap visually with nearby nodes.

## Root cause

`autoLayoutFlowNodes` selected a directed path mostly from the energy-table relative rows. In branched graphs, side participants can become `term-only` or have pending relative energy, so the path picker could collapse to the baseline or follow an auxiliary tail. Those off-path nodes then received ordinary sequential layout positions instead of being anchored near their related main-path node.

## Fix

- Added graph-aware main-path selection that prefers nodes with their own finite parsed energy, independent of expression/relative-table visibility quirks.
- Trimmed trailing auxiliary pending nodes from the main path, so released/pending species stay off-path instead of extending the primary lane.
- Anchored every off-path participant to the nearest connected main-path index.
- Placed off-path participants above the highest main-path node, stacking same-anchor participants upward with node-height-aware spacing to avoid overlap.
- Added regression coverage for a `reactant -> ts -> product` path with two added species and one released species.

## Verification

- `cd web && npm run test -- canvasGeometry.test.ts` — passed, 8 tests.
- `cd web && npm run test -- App.test.tsx CanvasWorkspace.test.tsx canvasGeometry.test.ts` — passed, 57 tests.
- `cd web && npm run build` — passed.
- Browser smoke at `http://127.0.0.1:5173/`:
  - page loaded as `RxnFlow Workbench`;
  - no console errors or warnings;
  - clicking `Auto layout` produced compact node positions with no far-away node in the visible graph;
  - side/non-primary demo nodes were anchored above the main visible path rather than being stretched far to the side.

## Browser note

The in-app Browser screenshot API timed out while capturing the canvas, so validation used DOM position inspection plus console checks instead of screenshot evidence for this pass.
