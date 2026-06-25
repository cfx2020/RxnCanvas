# Titlebar action hitboxes fix note

## Problem

In the packaged macOS Electron app, the top-left sidebar toggle and the top-right theme/export/right-sidebar controls could become unclickable even though the same controls worked in the browser preview. The custom titlebar also visually drifted from the native traffic-light row.

## Root cause

Electron's native draggable window regions are controlled by `-webkit-app-region`. Browser preview ignores this native hit-testing rule, so a button can appear clickable on `http://127.0.0.1:5173/` while the packaged app routes the same click to window dragging when an ancestor or overlapping gap is marked as `drag`.

A later CSS override also briefly put the left sidebar toggle back into document flow, creating the appearance of an extra titlebar layer above the real workbench row.

## Fix

- Keep the titlebar as one 48px row shared by traffic lights, sidebar toggles, right-side actions, and tabs.
- Explicitly mark real buttons as `-webkit-app-region: no-drag` and keep only the intentional gaps/status areas draggable.
- Restore the left sidebar toggle to `position: fixed` so it does not push the workspace down.
- Set the titlebar controls to `top: 10px` so the custom buttons sit closer to the native macOS traffic-light visual center.

## Validation

- Browser preview: verified the left sidebar toggle, theme toggle, export trigger, and right sidebar toggle respond on `http://127.0.0.1:5173/`.
- Packaged macOS app: verified the same controls respond in `web/release/mac-arm64/RxnFlow.app` using real UI clicks.
- Build/package/runtime smoke were run after the Electron hitbox fix.
