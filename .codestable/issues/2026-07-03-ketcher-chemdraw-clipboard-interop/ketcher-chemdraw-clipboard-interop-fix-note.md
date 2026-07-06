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

## 2026-07-04 Regression Follow-Up

- Ketcher-owned copy shortcuts and the regular Ketcher copy toolbar button are no longer intercepted by RxnFlow. Ketcher can keep its native selection-copy behavior.
- Native desktop paste now calls Ketcher's `addFragment()` instead of `setMolecule()`, so pasted structures are added to the current editor canvas instead of replacing the whole 2D canvas.
- Ketcher copy events are enriched after Ketcher writes its own clipboard payload: RxnFlow reads the copied KET/text payload, converts it through Ketcher/Indigo, then writes ChemDraw-readable KET, Molfile, CDXML, CDX, and plain text formats.
- Clipboard payload priority now prefers KET/Indigo formats before CDXML/CDX/Molfile when RxnFlow is deciding what to feed back into Ketcher.

## 2026-07-04 Verification

- `cd web && npm run test -- --run src/app/Molecule2DEditorDialog.test.tsx`
- `cd web && npm run build`
- Browser smoke via Vite + Playwright: opened the real Ketcher 2D dialog, injected a desktop clipboard bridge, clicked Ketcher's Paste button, pressed `Cmd+V` on the Ketcher cliparea, and dispatched a Ketcher copy event. Verified paste used the desktop reader, `Cmd+V` was handled as paste, no blocking editor status appeared, and copy enrichment wrote `ket`, `molfile`, `cdxml`, `cdx`, and `text`.

## 2026-07-04 ChemDraw Image-Only Clipboard Follow-Up

- Observed failure: ChemDraw -> Ketcher paste can report only `image/png`, so no CDXML/CDX/Molfile/KET payload reaches the renderer.
- Added a macOS ChemDraw selection bridge in the Electron main process: when the system clipboard has image-only data and the pasteboard source is ChemDraw, RxnFlow asks ChemDraw for the current selection's SMILES through its AppleScript API and exposes it as `chemical/x-daylight-smiles`.
- The renderer now explicitly prioritizes SMILES chemical payloads ahead of plain text/html, so Ketcher receives the structure text instead of showing the unsupported-image toast.

## 2026-07-04 ChemDraw Image-Only Verification

- `node --check web/electron/main.cjs`
- `cd web && npm run test -- --run src/app/Molecule2DEditorDialog.test.tsx`
- `cd web && npm run build`
- Local AppleScript probe verified ChemDraw exposes `SMILES of selection`; current clipboard source was Raycast during screenshot capture, so real ChemDraw paste still needs packaged-app manual confirmation with a selected ChemDraw structure.
