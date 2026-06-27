---
doc_type: issue-fix
slug: electron-memory-growth
status: fixed
severity: high
tags:
  - electron
  - 3d-view
  - 3dmol
  - performance
  - memory
fixed_at: 2026-06-27
---

# Electron memory growth fix note

## Symptom

macOS Activity Monitor can show two RxnFlow entries, for example `RxnFlow` and `RxnFlow Helper`, with memory growing to ~1.5GB+ after using the app. The app starts smooth, then canvas and interaction performance gradually degrade as memory pressure increases.

## Explanation

Two RxnFlow processes are expected for an Electron desktop app:

- `RxnFlow` is the main process that owns the native window and app lifecycle.
- `RxnFlow Helper` entries are Chromium renderer / GPU / utility processes used to render the React app and WebGL views.

The duplicate-looking process names are normal. The abnormal part is sustained renderer/GPU memory growth until interaction becomes laggy.

## Root cause

The highest-confidence leak / pressure source was the 3D structure vibration loop in `/Users/linsay/Desktop/code/rxnflow/web/src/app/Molecule3DmolViewer.tsx`.

When vibration playback was enabled, every animation frame rebuilt the entire 3Dmol model:

1. compute displaced atoms;
2. `removeAllModels()`;
3. `addModel(...)` with a full XYZ string;
4. reset styles / click handlers;
5. render again.

For larger structures, this created heavy renderer/GPU churn and could leave Chromium/WebGL allocations behind. Closing and reopening structure previews also only cleared models and DOM, without explicitly stopping 3Dmol animation state or releasing WebGL contexts.

## Fix

- Replaced the rebuild-based vibration loop with 3Dmol native vibration frames:
  - RxnFlow writes parsed displacement vectors into XYZ columns 5-7 as `dx/dy/dz`;
  - 3Dmol parses those fields onto atoms;
  - `viewer.vibrate(30, 0.45, true, ...)` generates native model frames;
  - `viewer.animate({ loop: "backAndForth", interval: 16 })` plays the frames instead of React driving a requestAnimationFrame loop.
- Removed the React-side vibration `requestAnimationFrame` loop, so playback no longer calls `removeAllModels()` / `addModel()` every animation frame.
- Kept static / non-playing 3D rendering as a one-shot update.
- Added explicit 3Dmol cleanup on unmount:
  - stop viewer animation if present;
  - remove surfaces, shapes and models;
  - release WebGL contexts via `WEBGL_lose_context` before clearing the container DOM.
- Reduced avoidable viewer remounts by keying the initial mount effect from the generated XYZ payload rather than directly from every render-time prop identity.
- Added regression tests proving vibration playback goes through 3Dmol native `vibrate()` / `animate()` and restores the original frame when paused.

## Verification

- `npm --prefix web run test -- Molecule3DmolViewer.test.tsx App.test.tsx --run` — passed, 52 tests.
- `npm --prefix web run build` — passed. Existing warnings remain from the bundled `3dmol` direct eval and large Ketcher/3Dmol chunks.
- Playwright smoke at `http://127.0.0.1:5173/`:
  - imported `/tmp/rxnflow-ts-vibration.log`, a temporary Gaussian-style file with coordinates and normal-mode displacements;
  - dragged the imported source file from the project rail onto the canvas, registering a `rxnflow-ts-vibration` node;
  - opened `3D Structure` for that node;
  - verified the vibration button was enabled, clicked it, and observed `Play vibration` become `Pause vibration`;
  - no app errors were emitted. Headless Chromium reported WebGL `ReadPixels` performance warnings while screenshotting, which are renderer diagnostics rather than RxnFlow runtime errors.
- `npm --prefix web run desktop:pack` — passed; packaged app written to `web/release/mac-arm64/RxnFlow.app`.
- `npm --prefix web run desktop:runtime:smoke` — passed.
- `npm --prefix web run desktop:release:smoke` — passed.
- Packaged `app.asar` timestamp after native vibration rebuild: `2026-06-27 16:22:24`.

## Remaining risk / follow-up

This is a targeted 3D-view pressure fix, but later user validation showed the GB-level Activity Monitor growth could happen after canvas-only panning / node dragging and did not require opening 3D vibration. That follow-up evidence moved the primary suspicion from 3Dmol to canvas compositor / GPU layer pressure.

Follow-up canvas fix is tracked in `.codestable/issues/2026-06-27-canvas-drag-performance/canvas-drag-performance-fix-note.md`:

- removed permanent `will-change: transform` from the canvas world and all reaction nodes;
- changed persistent canvas positioning from `translate3d(...)` to 2D `translate(...)`;
- kept compositor hints only during active live pan / node drag.

If memory still grows after prolonged canvas-only use after this compositor fix, the next likely area is large pasted image annotations stored as data URLs and duplicated in undo history snapshots. That should be handled separately with image downscaling / object URL storage and tighter undo snapshot memory caps.
