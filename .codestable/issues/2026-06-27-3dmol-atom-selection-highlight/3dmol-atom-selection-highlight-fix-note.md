---
doc_type: issue-fix
slug: 3dmol-atom-selection-highlight
status: fixed
severity: medium
tags:
  - ui
  - 3d-view
  - 3dmol
  - interaction
fixed_at: 2026-06-27
---

# 3Dmol atom selection highlight fix note

## Symptom

In the 3D structure view, clicking an atom enlarged the atom. Users expected GaussView-like selection feedback: same atom size, shallow blue highlight. Users also expected clicking empty 3D space to clear selected atoms.

## Root cause

`/Users/linsay/Desktop/code/rxnflow/web/src/app/Molecule3DmolViewer.tsx` rendered selected atoms with `viewer.addStyle(..., { sphere: { scale: 0.46, color: "#1fb996" } })`, overriding the base sphere scale `0.28` and making selected atoms visibly bigger. The 3Dmol canvas had atom click handling through `setClickable`, but no blank-canvas click guard to clear selection.

## Fix

- Added a shared `selectedAtomHighlightStyle` that keeps selected atom sphere scale at the base `0.28` and changes only the sphere color to shallow blue `#9ad8ff`.
- Added click bookkeeping around the 3Dmol container:
  - atom click callbacks mark the click as atom-handled,
  - canvas blank clicks clear `selectedAtomIndices`,
  - a short serial guard handles either native event ordering so atom clicks do not get mistaken for blank clicks.

## Verification

- `npm --prefix web run test -- Molecule3DmolViewer.test.tsx structureMeasurements.test.ts --run` passed: 6 tests.
- `npm --prefix web run build` passed.
- `npm --prefix web run test -- --run` passed: 36 files / 274 tests.
- Playwright rendered smoke opened `http://127.0.0.1:5173/`, verified the app was not blank, and opened the structure dialog. Headless Chromium did not expose a usable WebGL 3Dmol canvas, so atom picking itself is covered by the 3Dmol mock tests.
