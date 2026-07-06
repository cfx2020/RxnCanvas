---
doc_type: issue-fix
slug: project-rail-native-drag-scroll
status: fixed
severity: high
tags: [project-rail, drag-drop, scrolling, canvas-focus]
created_at: 2026-07-02
---

# Project Rail Native Drag Scroll Fix Note

## Problem

- Trackpad scrolling inside the left file list could stall.
- Project file dragging had no native drag feedback after the row drag path was changed to pointer simulation.
- Dropping a project file onto the canvas did not leave focus on the canvas, so immediate undo shortcuts could miss the canvas.

## Fix

- Removed the pointer-move project-file drag simulation and returned project file rows to browser-native HTML drag and drop with `draggable` plus DataTransfer payloads.
- Added a native `setDragImage` label when supported, leaving browser fallback behavior intact.
- Kept the project rail as a single native `overflow-y: auto` scroll container with contained overscroll.
- Focus the canvas surface during native drop handling so keyboard shortcuts work immediately after release.

## Documentation Checked

- MDN HTML Drag and Drop API: native drag feedback and DataTransfer are tied to `draggable`/`dragstart`.
- Electron native file drag/drop docs: native file dragging is for OS-level file drags, not app-internal object drags.

## Verification

- `cd web && npm run test -- --run src/app/App.test.tsx src/app/CanvasWorkspace.test.tsx src/app/ReportPanels.test.tsx`
- `cd web && npm run build`
- `cd web && npm run desktop:release:smoke`
- `cd web && npx electron-builder --mac --publish never`
- `cd web && npm run desktop:runtime:smoke`
- Opened `http://127.0.0.1:5173/` and verified the workbench renders with the updated rail/export DOM.

## Follow-up Adjustment 2026-07-02 Evening

- Removed the custom `setDragImage` label because it displayed confusing text such as `3 files`; dragging now uses the browser default row preview.
- Removed the fixed scrollbar gutter that produced a white vertical track in the project rail.
- Styled the rail scrollbar as a thin transparent-track scrollbar so long file lists do not get a heavy white strip.
