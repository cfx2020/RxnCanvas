---
doc_type: issue-fix
slug: project-rail-action-hitboxes-delete-confirm
status: fixed
severity: medium
tags:
  - ui
  - sidebar
  - hit-testing
  - destructive-action
fixed_at: 2026-06-27
---

# Project rail action hitboxes and delete confirmation fix note

## Symptom

The project row action menu felt visually detached from its hover/click layer: the delete row only highlighted from certain pointer positions, and the project heading plus button could flicker when moving around the sidebar. The delete-project secondary confirmation also looked like a generic small menu and did not clearly explain that the project is deleted from the workspace.

## Root cause

The project overflow button was hidden with both `opacity: 0` and `pointer-events: none`, so moving directly onto the visual action area could fail to establish a stable hover target. Menu rows were later compressed to 30px by cascade overrides, while the intended visual density was larger. Header actions were also opacity-gated by section hover, causing visible flicker.

## Fix

- Kept project/header action hit regions stable and pointer-active.
- Made project menu rows full-width 44px targets with child SVG/text pointer events disabled so the button owns the hit test.
- Raised the open project row above neighboring rows while its menu/confirmation is open.
- Redesigned the delete confirmation as a destructive popover: clearer title, project name, explicit workspace deletion copy, separate note that original source files on disk are not deleted, and clear Cancel/Delete actions.
- Added light/dark variants for the revised menu and confirmation surfaces.

## Verification

- In the in-app browser, the project overflow button center hit-tests to the button itself.
- In the project action menu, the left/center/right points of both `New canvas` and `Delete project` hit-test to their 44px button row.
- The delete confirmation popover renders at 316px width without viewport overflow; both action buttons hit-test to their buttons.
- `cd web && npm run test -- App.test.tsx` passed: 45 tests.
- `cd web && npm run build` passed.
