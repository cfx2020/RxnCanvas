---
doc_type: issue-fix
slug: ketcher-chemdraw-clipboard-interop
status: fixed
severity: high
tags: [ketcher, chemdraw, clipboard, electron, structure-editor]
created_at: 2026-07-03
---

# Ketcher ChemDraw Clipboard Interop Fix Note

## Fixed

- Added Electron `rxnflow:write-chemical-clipboard` IPC and preload bridge.
- Native clipboard write now emits CDXML, CDX, molfile, KET, and plain text payloads across common chemical MIME, CambridgeSoft, PerkinElmer, Revvity, and macOS OSType formats.
- Native clipboard read now recognizes CDX-like formats including `CDIF`, `STRU`, `CHMS`, `CdxM`, `com.revvity.*`, and `com.perkinelmer.*`, and converts binary CDX payloads to base64 for Ketcher.
- `Molecule2DEditorDialog` now captures Ketcher toolbar paste/copy clicks and `Cmd/Ctrl+V` / `Cmd/Ctrl+C` before Ketcher's browser clipboard handlers run.
- `Cmd/Ctrl+C` and `Cmd/Ctrl+V` are also captured at the dialog document level so Ketcher's hidden clipboard textarea does not swallow shortcuts.
- Clipboard success/failure messages now use a bottom-right non-blocking toast that auto-dismisses instead of the full-canvas status overlay.
- Paste routes through `readChemicalClipboard` and calls `ketcher.setMolecule()`.
- Copy routes through `writeChemicalClipboard` using Ketcher's `getKet()`, `getMolfile("v3000")`, `getCDXml()`, and `getCDX()`.

## Verification

- `node --check web/electron/main.cjs`
- `node --check web/electron/preload.cjs`
- `cd web && npm run test -- --run src/app/Molecule2DEditorDialog.test.tsx`
- `cd web && npm run build`
- `cd web && npm run test -- --run src/app/Molecule2DEditorDialog.test.tsx src/app/App.test.tsx src/domain/reportExports.test.ts src/app/appReportExport.test.ts`
- Browser smoke via Vite + Playwright: open 2D editor, inject desktop clipboard bridge, press `Cmd+C`, verify `.molecule-editor-toast` appears at bottom-right, `.molecule-editor-status` remains absent, and toast auto-dismisses.

## Remaining Manual Check

Final proof still requires real ChemDraw round-trip validation in the packaged desktop app: copy ChemDraw -> RxnFlow Ketcher and RxnFlow Ketcher -> ChemDraw.
