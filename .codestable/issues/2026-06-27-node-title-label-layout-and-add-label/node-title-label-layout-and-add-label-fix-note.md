---
doc_type: issue-fix
slug: node-title-label-layout-and-add-label
status: fixed
severity: medium
tags:
  - ui
  - canvas
  - node-card
  - labels
fixed_at: 2026-06-27
---

# Node title layout and Add label interaction fix note

## Symptom

Node title rename controls used a fixed width instead of following the actual text, node card meta pills left unnecessary horizontal air between the energy and kind badge, and clicking a curve `Add label` capsule could fail to enter inline editing.

## Root cause

The node title input/button CSS forced full-width behavior while the canvas label anchor final cascade disabled pointer events on the anchor layer. A late node-card CSS guard also used `justify-content: space-between`, pushing the energy and kind pills to opposite sides.

## Fix

- Compute node title button/input width with the same text-estimation helper used by canvas capsules.
- Keep title controls bounded by available node-card header space.
- Override the meta row to left-pack its independent energy and kind pills with an 8px gap.
- Restore pointer events on canvas label anchors and keep empty edge `Add label` capsules visible/clickable.

## Verification

- Browser DOM inspection shows node title width follows text and energy/kind pill gap is compact.
- Browser hit-test inspection shows existing edge/barrier labels are top targets at their centers.
- `cd web && npm run test -- CanvasWorkspace.test.tsx App.test.tsx` passed: 49 tests, including `Add path label` -> `Path label` editor.
- `cd web && npm run build` passed.

## Follow-up: real pointer click opens Add label editor

User validation found that the curve `Add label` capsule was still not editable in the real app even though the jsdom click regression passed.

Additional root cause:

- `ReactionEdgeLabel` switched from capsule button to inline input on `pointerdown`.
- In a real browser, the same physical click still has `pointerup` / `click` / focus transitions pending after React replaces the button with the input. That made the just-mounted input immediately lose the editing state, so the textbox never stayed available for typing.
- The unit test used `fireEvent.click`, which skipped the problematic pointerdown-first ordering.

Additional fix:

- Edge and barrier label capsules now use `pointerdown` only to stop propagation to the canvas / curve selection layer.
- Editing starts on `click`, after the pointer gesture has completed, so the inline input mounts and keeps focus.
- Updated the regression test to assert pointerdown alone does not open the editor or select the curve, then click opens the `Path label` textbox.

Additional verification:

- `npm --prefix web run test -- App.test.tsx CanvasWorkspace.test.tsx --run` — passed, 50 tests.
- `npm --prefix web run build` — passed; only existing 3Dmol direct-eval and Ketcher large-chunk warnings.
- Playwright smoke at `http://127.0.0.1:5173/`:
  - created a default `path` edge from `TS1 (Endo)` to `Exo Adduct`;
  - clicked `Add path label from TS1 (Endo) to Exo Adduct`;
  - `Path label` textbox stayed mounted and focused;
  - typed `Delta G 4.20` and pressed Enter;
  - canvas showed the edge label `Delta G 4.20`;
  - no console warnings/errors.
  - Screenshot: `/tmp/rxnflow-edge-label-repro.png`.
