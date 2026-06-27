---
doc_type: issue-fix
slug: default-pan-tooltips
status: fixed
severity: low
tags:
  - web-workbench
  - canvas
  - toolbar
  - accessibility
fixed_at: 2026-06-27
---

# Default pan tool and button tooltips fix note

## Symptom

The canvas opened with the select tool by default, while the expected high-frequency action is grabbing / panning the canvas. Several icon buttons also exposed accessible names but did not show native hover hints.

## Root cause

`App` initialized `tool` as `select`. Many controls had `aria-label` for accessibility but no matching `title`, so the browser had no native tooltip to show on hover.

## Fix

- Changed the initial canvas tool to `pan`.
- Added a small DOM synchronizer that mirrors `aria-label` into `title` for buttons, role-buttons and menuitems that do not already define their own title.
- The synchronizer marks auto-generated titles and keeps them updated when an aria label changes, while preserving hand-authored titles.
- Updated tests to assert the default pan state and representative auto-generated tooltips.

## Verification

- `cd web && npm run test -- App.test.tsx CanvasWorkspace.test.tsx` — passed, 50 tests.
- `cd web && npm run build` — passed.
- `cd web && npm run test` — passed, 36 files / 270 tests.
- Browser smoke at `http://127.0.0.1:5173/`:
  - page loaded as `RxnFlow Workbench`;
  - canvas surface class was `is-panning`;
  - `Pan tool` had `aria-pressed="true"`, `Select tool` had `aria-pressed="false"`;
  - all `button[aria-label]` elements had a title;
  - no console errors or warnings.
