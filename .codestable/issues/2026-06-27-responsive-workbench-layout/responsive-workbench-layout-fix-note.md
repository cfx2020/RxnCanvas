---
doc_type: issue-fix
status: fixed
severity: high
tags:
  - web-workbench
  - responsive-layout
  - project-rail
  - inspector
fixed_at: 2026-06-27
---

# Responsive workbench layout fix note

## Symptom

At narrower desktop / Electron window sizes, the workbench layout became visually misaligned:

- project rail text and icons could overlap or appear in a half-collapsed state;
- the left rail kept a full-width grid column while labels were hidden;
- right inspector and project rail consumed too much width, leaving the canvas cramped;
- narrow breakpoints inherited an old two-row grid that shortened the canvas height.

## Root cause

`workbench.css` contained multiple historical responsive and sidebar rules. The later sidebar-width variable rule won over the earlier `max-width: 1100px` compact-rail rule, so the layout entered a mixed state: compact content styling with a full-width rail column.

For `max-width: 980px`, an older two-row workspace layout also remained active, which made the canvas shell use only part of the viewport height even when the right inspector was converted to a narrow/overlay surface.

## Fix

Added a final responsive hardening layer in `web/src/app/workbench.css`:

- `<=1180px`: force a real compact icon rail (`72px`) and slimmer inspector (`248–272px`), hide project/file labels, center all rail hit targets, and hide the rail resize handle.
- `<=960px`: keep the canvas as the main grid column (`64px + canvas + 0`), turn the inspector into a fixed overlay drawer, and reset the old two-row layout so the canvas keeps full height.
- `<=760px`: keep the compact rail pinned at the left edge and reduce rail target width slightly.
- Added overflow-safe inspector definition lists so labels/values wrap instead of pushing columns.

## Validation

- `cd web && npm run build` — passed.
- `cd web && npm run test -- CanvasWorkspace.test.tsx App.test.tsx` — 2 files / 49 tests passed.
- Browser responsive smoke at `http://127.0.0.1:5173/`:
  - `1280x800`: grid `212px 780px 288px`, no out-of-viewport key panes.
  - `1024x760`: grid `72px 680px 272px`, project rail text hidden, no out-of-viewport key panes.
  - `900x760`: grid `64px 836px 0px`, inspector is overlay, canvas keeps full height.
  - `740x720`: grid `64px 676px 0px`, inspector is overlay, no out-of-viewport key panes.
  - Console errors/warnings: none.
