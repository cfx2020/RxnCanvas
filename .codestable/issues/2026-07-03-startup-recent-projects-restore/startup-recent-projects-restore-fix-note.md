---
doc_type: issue-fix
slug: startup-recent-projects-restore
status: fixed
severity: high
tags: [desktop, startup, recent-projects, project-rail]
created_at: 2026-07-03
---

# Startup Recent Projects Restore Fix Note

## Problem

When the desktop project rail had an existing `Ir` project and the user created/opened a new `Ni` project, restarting the app restored only `Ni`. `Ir` disappeared from the left project rail until the user manually opened the `Ir` folder again.

## Root Cause

The Electron main process only returned the first valid startup recent project payload. The renderer also treated `projectContents` as a single active-project fallback and restored only the last payload. The recent-project store could retain both paths, but the startup restore bridge collapsed the list into one workspace.

## Fixed

- `web/electron/main.cjs` now collects all valid recent runtime project payloads during startup restore.
- The main process returns `projectContents` ordered with inactive projects first and the active project last, so restoring them sequentially keeps the active project selected.
- Invalid recent project paths are still pruned, and the in-memory recent state is synchronized after pruning.
- `web/src/app/appRuntimeEffects.ts` now restores every startup `projectContents` payload instead of only the last one.
- Added App-level coverage for the exact behavior: startup restores both `Ir` and `Ni`, removes demo projects, and keeps `Ni` active.

## Verification

- `cd web && npm run test -- --run src/app/appRuntimeEffects.test.ts src/app/App.test.tsx`
- `cd web && npm run build`

## Notes

- Build still reports the existing 3Dmol direct `eval` warning and large chunk warnings; unrelated to this startup restore fix.
