---
doc_type: issue-fix
slug: canvas-image-insertion-paste
status: fixed
severity: medium
tags:
  - web-workbench
  - canvas
  - annotations
  - clipboard
fixed_at: 2026-06-27
---

# Canvas image insertion and paste fix note

## Symptom

The floating canvas toolbar had a text tool but no explicit image insertion action. Copying an image and pasting into the canvas could also fail depending on the clipboard source because the app only read `clipboardData.items` image files.

## Root cause

Image annotations already existed at the canvas rendering / persistence layer, but the UI only exposed paste as an implicit path. The paste listener did not inspect `clipboardData.files` and had no async `navigator.clipboard.read()` fallback for Electron / browser clipboard sources that do not expose image files through `ClipboardEvent.items`.

## Fix

- Added an `Insert image` button to the floating toolbar.
- Added a hidden `image/*` file picker and inserts selected image files as canvas image annotations.
- Reused the same insertion pipeline for picker, `clipboardData.files`, `clipboardData.items`, and async system clipboard reads.
- Added a `Meta/Ctrl+V` fallback that attempts `navigator.clipboard.read()` if the paste event did not already insert an image.
- Added regression coverage for toolbar image insertion and pasted image files.

## Verification

- `cd web && npm run test -- App.test.tsx CanvasWorkspace.test.tsx` — passed, 50 tests.
- `cd web && npm run test` — passed, 36 files / 270 tests.
- `cd web && npm run build` — passed.
- Browser smoke at `http://127.0.0.1:5173/`:
  - page loaded as `RxnFlow Workbench`;
  - toolbar exposes `Insert image`;
  - browser clipboard image + `Meta+V` inserted a `.canvas-image-annotation img` with a data-image URL;
  - no console errors or warnings.
