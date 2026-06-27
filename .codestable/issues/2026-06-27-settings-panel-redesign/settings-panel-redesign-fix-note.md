---
doc_type: issue-fix
status: fixed
severity: medium
tags:
  - web-workbench
  - settings
  - ui-ux
  - preferences
fixed_at: 2026-06-27
---

# Settings panel redesign fix note

## Symptom

The lower-left Settings trigger looked like a bordered card/button, and the opened panel felt like a small popup menu rather than a normal application settings surface.

## Design direction

Using UI/UX Pro Max guidance, the settings surface was redesigned around a desktop preferences pattern:

- low-emphasis Settings trigger in the project rail;
- modal-style preferences sheet with a weak backdrop;
- grouped sections for Appearance, Energy display and External apps;
- row-based controls with explanatory helper text;
- matched light/dark styling and accessible close / select controls.

## Fix

- Rebuilt `web/src/app/SettingsPanel.tsx` into a structured Preferences dialog.
- Added grouped sections, icon tiles, helper copy and opener rows.
- Removed the Settings trigger border and heavy card treatment.
- Added responsive settings sheet behavior for narrow viewports.
- Preserved existing accessible labels for tests and keyboard/screen-reader navigation.

## Validation

- `cd web && npm run build` — passed.
- `cd web && npm run test -- App.test.tsx` — 1 file / 45 tests passed.
- Browser smoke at `http://127.0.0.1:5173/`:
  - Settings trigger has `border: 0px` and transparent background.
  - Opening Settings creates one `role="dialog"` with backdrop.
  - Dialog sections: Appearance, Energy display, External apps.
  - Energy unit select updates to `hartree`.
  - Close button dismisses the dialog.
  - Console errors/warnings: none.
