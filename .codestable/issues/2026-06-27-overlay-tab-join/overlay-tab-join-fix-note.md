---
doc_type: issue-fix
slug: overlay-tab-join
status: fixed
severity: low
tags:
  - web-workbench
  - tabs
  - overlay
  - visual-polish
fixed_at: 2026-06-27
---

# Overlay tab join fix note

## Symptom

Opening Structure Preview or Table View made the active canvas tab's Chrome-style join segment look broken: the left/right shoulder pseudo-elements stayed attached to the tab while the content below switched to a blurred overlay, producing stray white blobs next to the selected tab.

## Root cause

The active canvas tab is styled to merge into the canvas by drawing `::before` / `::after` shoulder feet and by keeping the bottom corners open. That is correct for the normal canvas surface, but Structure Preview and Table View replace the canvas with a blur scrim/panel. The tab did not know an overlay was active, so it kept drawing its canvas-join geometry on top of the overlay.

## Fix

- Added `has-overlay-view` to `.app-shell` whenever Table View or Structure Preview is open.
- In overlay state, the active tab becomes a self-contained rounded tab/pill instead of a canvas-joined tab.
- Disabled the active tab `::before` / `::after` shoulder pseudo-elements while an overlay is active.
- Added regression tests that table and structure overlays set the overlay state class.

## Verification

- `cd web && npm run test -- App.test.tsx CanvasWorkspace.test.tsx` — passed, 50 tests.
- `cd web && npm run build` — passed.
- `cd web && npm run test` — passed, 36 files / 270 tests.
- Browser smoke at `http://127.0.0.1:5173/`:
  - Table View open: `.app-shell.theme-light.has-overlay-view`, active tab `::before` / `::after` computed as `display: none` and `content: none`.
  - Structure Preview open: same overlay class and pseudo-elements disabled.
  - no console errors or warnings.

## Follow-up: table overlay top inset and close behavior

User validation found that Table View made the active tab look vertically shifted because the overlay-state tab shell itself was moved instead of keeping the original tab slot and insetting only the visible tab surface.

Additional fix:

- Kept the active tab shell in the normal titlebar slot during overlay mode.
- Moved the overlay pill surface onto `.canvas-tab` with a 4px vertical inset, so the top gap remains visually consistent with neighboring tab/add controls.
- Removed the delayed `tableDrawerMounted` unmount path; closing Table View now removes the table drawer immediately instead of playing the closing fade/scale animation.

Additional verification:

- `cd web && npm run test -- App.test.tsx CanvasWorkspace.test.tsx` — passed, 50 tests.
- `cd web && npm run build` — passed.
- `cd web && npm run test` — passed, 36 files / 270 tests.
- Playwright smoke at `http://127.0.0.1:5173/`:
  - Table View open: `.app-shell.theme-light.has-overlay-view`, active tab shoulders disabled, tab visual layer inset inside its shell.
  - Table View close: `.table-drawer-shell` count immediately became `0`.
  - no console errors or warnings.

## Follow-up: keep short overlay tabs at fixed Chrome width

User validation found that opening Table View with a short canvas label such as `Ir` made the visible active tab shrink to the label width. That looked unlike Chrome, where a tab keeps a fixed slot until the tab strip runs out of horizontal space.

Additional root cause:

- The previous overlay-state fix correctly moved the visible active-tab surface from the outer `.canvas-tab-shell` to the inner `.canvas-tab` so the canvas-join shoulders could disappear.
- The outer shell still had the intended tab slot, but the inner button did not fill that shell. With short labels, the visible pill therefore collapsed to content width even though the invisible slot was wider.

Additional fix:

- Added final tab-strip sizing guards:
  - default desktop tab slot is fixed at `174px`;
  - the inner `.canvas-tab` fills `100%` of its shell in normal and overlay states;
  - tabs use `flex: 0 1` so they only compress when multiple open tabs exhaust available strip width;
  - the plus button remains fixed-size and sits immediately after the last visible tab.
- Added a narrower fixed slot only for small viewports (`148px`, with lower min width) so responsive layouts still fit.

Additional verification:

- `npm --prefix web run build` — passed; only existing 3Dmol direct-eval and Ketcher large-chunk warnings.
- `npm --prefix web run test -- App.test.tsx --run` — passed, 46 tests.
- Playwright smoke at `http://127.0.0.1:5173/` with the active tab renamed to `Ir` and Table View open:
  - desktop viewport `1512×895`: shell width `174px`, visible tab button width `174px`, plus button placed immediately after the tab;
  - narrow viewport `456×165`: responsive shell/button width `148px`, visible tab still fills the shell instead of collapsing to text width;
  - page title `RxnFlow Workbench`, nonblank app, Table View overlay present, no console warnings/errors.
  - Screenshot: `/tmp/rxnflow-table-tab-fixed.png`.
