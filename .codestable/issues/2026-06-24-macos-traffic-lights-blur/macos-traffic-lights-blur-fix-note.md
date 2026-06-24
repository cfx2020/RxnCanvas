---
doc_type: issue-fix
id: 2026-06-24-macos-traffic-lights-blur
status: fixed
severity: medium
tags:
  - macos
  - electron
  - window-chrome
  - ui-regression
created_at: 2026-06-24
updated_at: 2026-06-24
---

# macOS traffic lights disappear when window loses focus — fix note

## Problem

In the packaged macOS app, the native top-left close/minimize/zoom controls could visually disappear after RxnFlow lost focus. Expected macOS behavior is that traffic lights remain visible in a muted/inactive state rather than vanishing.

## Root cause

The Electron main window used `titleBarStyle: "hiddenInset"`. With the current full-height custom workbench chrome, this hidden-inset titlebar style could make inactive native window controls visually drop out instead of keeping the standard dimmed appearance.

The first fix switched the native titlebar mode and reasserted native visibility, but user screenshot verification showed that a renderer-drawn fallback layer could overlap the real system controls. That fallback was rejected because macOS traffic lights must be native, including their inactive/focus-lost muted state.

The final approach keeps the controls native only and removes every renderer-side traffic-light visual, including fake dots and the later backing patch.

## Fix

- Switched the macOS titlebar style from `hiddenInset` to `hidden`.
- Added an explicit `trafficLightPosition` so the native buttons keep a stable top-left location.
- Added `installMacWindowControls(window)` to reassert `setWindowButtonVisibility(true)` and `setWindowButtonPosition(...)` after `show`, `focus`, `blur`, and fullscreen state changes.
- Removed the rejected `.macos-traffic-light-ghosts` fake-dot layer.
- Removed the `.app-shell.is-macos-desktop::before` renderer backing layer so RxnFlow no longer paints any custom traffic-light-related visual.
- Added release-smoke assertions so the app does not regress back to `hiddenInset`, omit the macOS window-control visibility guard, reintroduce fake macOS traffic-light dots, or reintroduce a renderer backing patch.
- Follow-up screenshot sync aligned the custom titlebar chrome with Codex-style placement: the project-sidebar toggle now lives in the left sidebar titlebar area, export / theme / node-sidebar controls are grouped as one top-right fixed cluster, and the Project / Node rail content starts higher (`50px`) instead of being pushed too far below the titlebar.

## Files changed

- `web/electron/main.cjs`
- `web/electron/release-smoke.cjs`
- `web/src/app/App.tsx`
- `web/src/app/App.test.tsx`
- `web/src/app/workbench.css`

## Validation

- `cd web && npm run desktop:release:smoke` passed.
- `cd web && npm run test -- src/app/App.test.tsx --run` passed after adding coverage for the macOS desktop shell class and ensuring fake dots are absent.
- `cd web && npm run build` passed.
- `cd web && npm run desktop:pack` passed and rebuilt `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`.
- `cd web && node electron/release-smoke.cjs` passed against the rebuilt release directory.
- The rebuilt `app.asar` was extracted and checked: it contains the native `titleBarStyle: "hidden"` / `trafficLightPosition` / `installMacWindowControls(window)` code and contains no `.macos-traffic-light-ghosts` or `.app-shell.is-macos-desktop::before` renderer visuals.
- Browser visual check via Playwright against `http://127.0.0.1:5173/` confirmed: no project-sidebar button remains inside `.workspace-topbar-left`; `.desktop-window-actions` is fixed to the viewport right edge; Project / Node headings start at the tighter rail offset.
- The rebuilt `app.asar` was also checked for `left-sidebar-fixed-toggle`, `desktop-window-actions`, `right-sidebar-fixed-toggle`, `right:14px`, and `padding-top:50px` so the packaged app includes the latest titlebar alignment.

## Notes

This keeps native macOS controls for both visuals and interaction. The renderer does not draw or patch the traffic-light area.
