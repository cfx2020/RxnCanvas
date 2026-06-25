# Titlebar action hitboxes fix note

## Problem

In the packaged macOS Electron app, the top-left sidebar toggle and the top-right theme/export/right-sidebar controls could become unclickable even though the same controls worked in the browser preview. The custom titlebar also visually drifted from the native traffic-light row.

## Root cause

Electron's native draggable window regions are controlled by `-webkit-app-region`. Browser preview ignores this native hit-testing rule, so a button can appear clickable on `http://127.0.0.1:5173/` while the packaged app routes the same click to window dragging when an ancestor or overlapping gap is marked as `drag`.

A later CSS override also briefly put the left sidebar toggle back into document flow, creating the appearance of an extra titlebar layer above the real workbench row.

## Fix

- Keep the titlebar as one 48px row shared by traffic lights, sidebar toggles, right-side actions, and tabs.
- Explicitly mark real buttons as `-webkit-app-region: no-drag` and keep only the intentional gaps/status areas draggable.
- Remove broad `drag` regions from the project rail, inspector rail, and collapsed project-rail hover container; in Electron, those large drag rectangles can still swallow real mouse clicks even when the visible button hover state appears.
- Restore the left sidebar toggle to `position: fixed` so it does not push the workspace down.
- Set the titlebar controls to `top: 10px` so the custom buttons sit closer to the native macOS traffic-light visual center.

## Validation

- Browser preview: verified the left sidebar toggle, theme toggle, export trigger, and right sidebar toggle respond on `http://127.0.0.1:5173/`.
- Packaged macOS app: verified the same controls respond in `web/release/mac-arm64/RxnFlow.app` using real screen-coordinate clicks, not accessibility element actions.
- Build/package/runtime smoke were run after the Electron hitbox fix.


## 2026-06-26 follow-up

After validating with real screen-coordinate clicks, a second failure appeared only after the left sidebar was collapsed: the preview/expand trigger hovered but did not click. The collapsed tabbar reserved space with `padding-left` on a draggable tab container, so Electron's native drag rectangle still extended underneath the fixed trigger. The fix reserves that space with `margin-left` instead, physically moving the draggable tab area away from the fixed sidebar button.


A second collapsed-state drag rectangle came from `.workspace-topbar` itself. When sidebars collapse, the workbench column expands underneath fixed chrome buttons, so marking the entire topbar as `drag` makes those sibling fixed buttons hover but not click. The topbar is now `no-drag`; only safe child tab/list regions opt into drag.
