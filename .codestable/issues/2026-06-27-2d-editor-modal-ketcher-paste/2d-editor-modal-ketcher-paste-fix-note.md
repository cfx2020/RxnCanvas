---
doc_type: issue-fix
slug: 2d-editor-modal-ketcher-paste
status: fixed
severity: medium
tags:
  - ui
  - ketcher
  - electron
  - clipboard
  - structure-editor
fixed_at: 2026-06-27
---

# 2D editor modal Ketcher paste fix note

## Symptom

The 2D structure editor felt inconsistent with the rest of the workbench:

- The header used a text “Close” button instead of the app's icon-only close affordance.
- The bottom primary action said “Save 2D structure” instead of the simpler “Save”.
- The right inspector could visually cover or compete with the 2D editor because the modal stayed below the inspector z-layer and the editor layout did not take full workbench width.
- The bottom helper copy duplicated obvious behavior and added visual noise.
- Ketcher's internal vertical tool palettes could be clipped by the fixed 500px host height.
- The active tab did not enter overlay mode while the 2D editor was open, so old Chrome-style tab shoulders could still show between the tab and blurred scrim.
- Pasting ChemDraw content depended only on what Chromium/Ketcher could see directly from the paste event.

## Root cause

`Molecule2DEditorDialog` reused the structure preview scrim but did not participate in the app-shell overlay state and kept Ketcher inside a fixed-height container. The Electron preload surface also did not expose native clipboard flavors, so macOS ChemDraw-specific pasteboard formats could be invisible to the renderer even when they existed on the system clipboard.

## Fix

- Updated `/Users/linsay/Desktop/code/rxnflow/web/src/app/Molecule2DEditorDialog.tsx`:
  - header close is now an icon-only X button,
  - bottom primary action is “Save”,
  - bottom explanatory copy was removed,
  - paste capture now accepts CDXML/Molfile/RXN/KET-like text payloads and calls `ketcher.setMolecule`,
  - Ketcher controls with `title` are decorated with aria labels and immediate RxnFlow tooltip data.
- Updated `/Users/linsay/Desktop/code/rxnflow/web/src/app/App.tsx` so opening the 2D editor marks the app shell as `has-overlay-view`.
- Updated `/Users/linsay/Desktop/code/rxnflow/web/src/app/workbench.css`:
  - the 2D editor modal sits above the inspector,
  - it uses the full workbench width below the titlebar,
  - Ketcher gets a responsive tall host instead of a 500px fixed box,
  - overlay tabs have straight bottom corners and no shoulder pseudo-elements.
- Updated Electron bridge files:
  - `/Users/linsay/Desktop/code/rxnflow/web/electron/main.cjs`
  - `/Users/linsay/Desktop/code/rxnflow/web/electron/preload.cjs`
  - `/Users/linsay/Desktop/code/rxnflow/web/src/app/appRuntimeEffects.ts`

  The renderer can now call `window.rxnflowDesktop.readChemicalClipboard()` to read native clipboard formats and try ChemDraw/CDXML/Molfile payloads that Chromium's paste event may not expose directly.

## Verification

- `npm --prefix web run test -- Molecule2DEditorDialog.test.tsx App.test.tsx --run` passed: 47 tests.
- `npm --prefix web run build` passed.
- Playwright rendered check opened the 2D editor and confirmed:
  - dialog size `1220×800`,
  - editor z-index `320` above inspector z-index `90`,
  - Ketcher host size `1176×643`,
  - 63 visible Ketcher controls, with zero bottom/right clipping,
  - visible titled Ketcher controls all received tooltip data,
  - active tab is in overlay mode with `9px 9px 0 0` bottom-straight radius.
- Playwright paste check dispatched a Molfile paste event into Ketcher, saw `defaultPrevented: true`, clicked Save, and confirmed the dialog closed with no console errors.
- Electron dev-shell check confirmed `window.rxnflowDesktop.readChemicalClipboard()` exists and returns `{ ok: true }`.
- `npm --prefix web run desktop:pack` passed.
- `npm --prefix web run desktop:runtime:smoke` passed.
- `npm --prefix web run desktop:release:smoke` passed.
- Repacked app: `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/Resources/app.asar`, timestamp `2026-06-27 13:55:00`.

## Remaining risk

The ChemDraw path now has both renderer paste-event parsing and Electron native clipboard fallback, but it still depends on what macOS exposes for the specific ChemDraw version. If a real ChemDraw paste still fails, the next debugging step is to inspect `readChemicalClipboard().formats` while ChemDraw content is on the clipboard and add that exact pasteboard flavor to the accepted format list.
