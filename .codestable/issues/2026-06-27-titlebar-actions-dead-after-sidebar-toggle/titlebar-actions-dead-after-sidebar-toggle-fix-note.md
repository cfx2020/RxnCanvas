---
doc_type: issue-fix
slug: titlebar-actions-dead-after-sidebar-toggle
status: fixed
severity: high
tags:
  - ui
  - electron
  - titlebar
  - hit-testing
fixed_at: 2026-06-27
---

# Titlebar actions dead after right sidebar toggle fix note

## Symptom

After the dark-mode titlebar cleanup, the top titlebar buttons could be clicked initially, but after toggling the right sidebar the left sidebar button and right-side titlebar buttons stopped receiving hover/clicks in the desktop shell.

## Root cause

The final dark chrome/native drag guard marked the whole `.workspace-topbar-actions.desktop-window-actions` fixed parent as an Electron `drag` region. Its child buttons were declared `no-drag`, but in packaged macOS/Electron hit-testing the draggable fixed parent could still swallow child hover/click after the sidebar state changed.

## Fix

Updated `/Users/linsay/Desktop/code/rxnflow/web/src/app/workbench.css` so the right action cluster parent is always `no-drag`; only explicit `.window-action-drag-gap` and status spacer atoms remain draggable. Theme/export/right-sidebar buttons are forced to `pointer-events: auto` and `no-drag` in the final cascade guard.

## Verification

- Browser hit-test inspection confirms `.workspace-topbar-actions` computes to `no-drag` while each action button remains the top element at its center.
- In the in-app browser, after collapsing the right sidebar:
  - right sidebar toggle can be clicked again to expand,
  - theme button toggles light/dark,
  - export button opens the export menu.
- `cd web && npm run test -- App.test.tsx` passed: 45 tests.
- `cd web && npm run build` passed.
- `cd web && npm run desktop:pack` passed and rebuilt `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`.

## Follow-up: fixed action cluster spacers are no-drag too

User reported that after clicking a topbar control once, the left sidebar, right sidebar, theme, and export controls could again behave like window drag regions in the desktop app.

The previous fix left the tiny `.window-action-drag-gap` spacers between right-side controls as draggable. Because those spacers are visually part of the fixed control cluster and sit only 7px from the buttons, macOS/Electron hit-testing could still feel like the buttons themselves had become draggable after a state change.

Updated `/Users/linsay/Desktop/code/rxnflow/web/src/app/workbench.css` to make the whole fixed titlebar control cluster a stable no-drag island: buttons, nested icons, status atoms, and the spacer gaps all compute to `no-drag`. Window dragging is kept on the tab strip and empty titlebar/topbar regions rather than inside the icon cluster.

Validation:

- `npm --prefix web run test -- App.test.tsx --run` passed: 46 tests.
- `npm --prefix web run build` passed.
- Electron dev-shell guard probe clicked left sidebar, right sidebar, theme, and export controls repeatedly; final computed hit-test state had zero failures, with all four controls and `.window-action-drag-gap` reporting `no-drag`.
- `npm --prefix web run desktop:pack` passed.
- `npm --prefix web run desktop:runtime:smoke` passed.
- `npm --prefix web run desktop:release:smoke` passed.
- Repacked app: `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/Resources/app.asar`, timestamp `2026-06-27 12:45:42`.

## Follow-up: remove overlapping drag slabs under titlebar buttons

User reported the previous no-drag button guard was still insufficient in the real packaged app: the left sidebar icon was never clickable, and the right sidebar icon could collapse once but could not expand again.

A deeper overlap scan checked every element geometrically under each fixed titlebar button, not only the top `elementFromPoint()` target. It found the actual native hit-test problem:

- The left sidebar toggle sat above `.project-rail`, whose full rail rectangle was still a native `drag` region.
- After the right sidebar collapsed, `.workspace-topbar` expanded under the theme/export/right-sidebar controls and was still a native `drag` region.

Because Electron/macOS titlebar hit testing can treat an underlying overlapping drag region as draggable even when the visible button computes to `no-drag`, the fix now removes broad structural slabs from the native drag map. `/Users/linsay/Desktop/code/rxnflow/web/src/app/workbench.css` now forces `.project-rail` and `.workspace-topbar` to `no-drag`; only bounded tab-strip elements (`.workspace-topbar-left`, `.canvas-tab-bar`, `.canvas-tab-list`) remain draggable, while tabs/buttons and all fixed controls stay `no-drag`.

Validation:

- Overlap scanner states checked: initial, after right sidebar collapsed, after left+right collapsed. For left/sidebar/theme/export/right controls, every center point reported `overlappingDrag: []`.
- `npm --prefix web run test -- App.test.tsx --run` passed: 46 tests.
- `npm --prefix web run build` passed.
- Electron dev-shell guard probe repeatedly clicked left sidebar, right sidebar, theme, and export controls; zero failures.
- `npm --prefix web run desktop:pack` passed.
- `npm --prefix web run desktop:runtime:smoke` passed.
- `npm --prefix web run desktop:release:smoke` passed.
- Repacked app: `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/Resources/app.asar`, timestamp `2026-06-27 13:13:19`.

## Follow-up: right expanded titlebar drag bridge and left collapsed reserve

User reported two remaining native-titlebar inconsistencies:

- With the right inspector expanded, the gap between the workbench topbar and the fixed theme/export/right-sidebar buttons was not draggable, even though the same area became draggable after the inspector collapsed.
- Left sidebar collapse/expand felt like the tab strip was being pushed in from the far-left window edge. The collapsed workspace column went to `0`, then the tab strip was visually offset by a topbar margin, so during expand it could briefly originate from the wrong x-position.

Root cause:

- In the expanded-right-sidebar layout, the workbench topbar ended before the fixed right action cluster. The remaining titlebar band over the inspector column was covered by `.workspace`/right-shell structure with `app-region: none`, so Electron had no native drag island there.
- The collapsed-left-sidebar layout used a zero-width first grid column plus a synthetic margin on `.workspace-topbar-left`, which created a layout discontinuity between collapsed and expanded states.

Fix:

- Added a real `.right-titlebar-drag-bridge` element while the right sidebar is open. It only covers the empty titlebar gap left of the fixed right action cluster, is `-webkit-app-region: drag`, sits below the button z-index, and does not overlap the actual buttons. The final implementation intentionally uses this real element only, not an additional pseudo-element bridge, to keep the transparent hit-test layer count to one.
- Changed the left-collapsed workspace grid to reserve the same stable titlebar gutter used by the left sidebar toggle/add-tab region instead of collapsing to `0`; removed the compensating topbar-left margin. This keeps tabs starting from a stable boundary and avoids the “from far left” animation artifact.

Validation:

- `npm --prefix web run test -- App.test.tsx --run` passed: 46 tests.
- `npm --prefix web run build` passed.
- Electron dev-shell hit-test scan confirmed, with right sidebar open/reopened, the titlebar gap points `x=1170/1210/1260/1300, y=18` hit `.right-titlebar-drag-bridge` with native `drag`, while theme/export/right-sidebar button centers remain unobstructed.
- Electron dev-shell layout scan confirmed the active tab no longer starts near the far-left edge during left collapse/expand: collapsed active tab `x≈144`, expanded active tab `x≈224`.
- `npm --prefix web run desktop:pack` passed.
- `npm --prefix web run desktop:runtime:smoke` passed.
- `npm --prefix web run desktop:release:smoke` passed.
- Repacked app: `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/Resources/app.asar`, timestamp `2026-06-27 13:33:11`.

## Follow-up: split collapsed titlebar reserve from canvas grid

User reported that the previous left-collapsed titlebar reserve removed the "tab slides from far left" artifact, but introduced a tall non-canvas color block on the left side of the workbench. The root cause was that the reserve was applied to the workspace grid itself, so both the titlebar and the canvas were pushed right.

Fix:

- Keep the left-collapsed workspace grid first column at `0`, so the canvas and its dotted surface move all the way to the left edge and the canvas/project divider follows it.
- Apply the collapsed gutter only inside `.workspace-topbar-left`, via `margin-left`, so the tab strip still starts to the right of the traffic lights / left-sidebar button.
- Add a narrow-screen override so the titlebar gutter remains usable on compact widths without recreating a full-height grid color block.

Validation:

- Desktop Playwright geometry check after collapsing the project sidebar:
  - workspace columns `0px 1224px 288px`,
  - workbench `x=0`,
  - canvas stage `x=0`,
  - active tab `x=144`,
  - left sidebar button remains `no-drag` at `x=104`.
- Compact-width geometry check after collapsing the project sidebar:
  - workspace columns `0px 88px 288px`,
  - canvas stage `x=0`,
  - active tab remains to the right of the left-sidebar button.
- Electron dev-shell hit-test scan still passed with zero failures for left/sidebar/theme/export/right controls and the right titlebar drag bridge.
- `npm --prefix web run test -- App.test.tsx --run` passed: 46 tests.
- `npm --prefix web run build` passed.
- `npm --prefix web run desktop:pack` passed.
- `npm --prefix web run desktop:runtime:smoke` passed.
- `npm --prefix web run desktop:release:smoke` passed.
- Repacked app: `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/Resources/app.asar`, timestamp `2026-06-27 14:02:57`.

## Follow-up: synchronize collapsed tab-strip margin animation

User reported that after the canvas-fill fix, expanding the left sidebar made the active tab look like it was coming from the far-left edge again. The final positions were correct, but the transition was not: the workspace grid was animating over 180ms while `.workspace-topbar-left` margin jumped immediately from the collapsed gutter back to `0`, so the tab briefly appeared near the left edge before the grid pushed it right.

Fix:

- Added a final transition on `.workspace-topbar-left` for `margin-left`, `max-width`, and `flex-basis` using the same 180ms timing as the workspace grid.
- This keeps the tab strip's absolute x-position coupled to the grid motion: during expand it moves smoothly from the collapsed tab position to the expanded tab position instead of jumping left first.

Validation:

- Playwright expand animation sampling after collapse:
  - collapsed active tab `x=144`,
  - samples moved `144 → 173 → 189 → 215 → 222 → 224`,
  - minimum sampled x stayed `144` and never jumped toward the far-left edge.
- Playwright collapse animation sampling:
  - samples moved `224 → 217 → 203 → 173 → 161 → 147 → 144`,
  - minimum sampled x stayed `144`, maximum stayed under expanded x.
- Electron dev-shell titlebar hit-test scan still passed with zero failures.
- `npm --prefix web run test -- App.test.tsx --run` passed: 46 tests.
- `npm --prefix web run build` passed.
- `npm --prefix web run desktop:pack` passed.
- `npm --prefix web run desktop:runtime:smoke` passed.
- `npm --prefix web run desktop:release:smoke` passed.
- Repacked app: `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/Resources/app.asar`, timestamp `2026-06-27 14:16:30`.
