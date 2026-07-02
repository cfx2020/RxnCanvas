---
doc_type: issue-report
slug: ketcher-chemdraw-clipboard-interop
status: confirmed
severity: high
tags: [ketcher, chemdraw, clipboard, electron, structure-editor]
created_at: 2026-07-03
---

# Ketcher ChemDraw Clipboard Interop

## Problem

- Copying a structure from ChemDraw cannot be pasted into the embedded Ketcher editor.
- Ketcher's paste toolbar button shows the browser permission error: "Your browser doesn't allow pasting clipboard content via button. Please use shortcut instead."
- `Cmd+V` also does not paste the ChemDraw structure into Ketcher.
- Structures drawn in Ketcher cannot be pasted into ChemDraw.

## Expected

- In the desktop app, Ketcher paste should use Electron native clipboard access and accept ChemDraw chemical formats when available.
- Ketcher copy should write chemical clipboard formats that ChemDraw can recognize, not only browser `text/plain`.
- The Ketcher toolbar copy/paste buttons and `Cmd/Ctrl+C/V` should use the same RxnFlow desktop interop path.

## Evidence

- `web/electron/main.cjs` exposes `rxnflow:read-chemical-clipboard` but has no matching write IPC.
- `web/src/app/Molecule2DEditorDialog.tsx` only invokes the native clipboard reader from React paste capture; Ketcher's own toolbar paste button still uses browser clipboard APIs.
- `web/node_modules/ketcher-react` paste button uses browser clipboard APIs, which Electron renderer cannot use for native ChemDraw pasteboard flavors.
