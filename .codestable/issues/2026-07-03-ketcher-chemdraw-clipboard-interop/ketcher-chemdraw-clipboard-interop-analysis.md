---
doc_type: issue-analysis
slug: ketcher-chemdraw-clipboard-interop
status: confirmed
severity: high
tags: [ketcher, chemdraw, clipboard, electron, structure-editor]
created_at: 2026-07-03
---

# Ketcher ChemDraw Clipboard Interop Analysis

## Root Cause

The embedded Ketcher editor relies on browser clipboard APIs for its toolbar paste/copy actions. Those APIs cannot read or write ChemDraw's native macOS/Windows pasteboard flavors reliably inside the Electron renderer. RxnFlow added a native `readChemicalClipboard` bridge, but it is only used from React paste capture and there is no native write bridge.

## Fix Direction

- Add an Electron main/preload `writeChemicalClipboard` bridge.
- Capture Ketcher's toolbar copy/paste button clicks inside `Molecule2DEditorDialog` before Ketcher's browser clipboard handlers run.
- Capture `Cmd/Ctrl+C` and `Cmd/Ctrl+V` in the Ketcher host for non-text-editing targets and route them to RxnFlow native chemical clipboard interop.
- Copy Ketcher structures as CDXML, CDX, molfile, KET, and plain text when available.
- Paste should prioritize ChemDraw/CDXML/CDX-like payloads from the native clipboard and pass the selected structure to `ketcher.setMolecule()`.

## Impact

- Desktop app interop improves immediately.
- Browser-only preview remains limited to web clipboard events because it has no Electron clipboard bridge.
- Exact ChemDraw native flavor names still need real ChemDraw round-trip validation, so the writer should emit several common chemical flavor aliases.
