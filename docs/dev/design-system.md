---
doc_type: design-system
slug: rxnflow-workbench-design-system
status: current
summary: Shared visual tokens and interaction rules for the RxnFlow desktop workbench.
---

# RxnFlow Workbench Design System

RxnFlow uses a compact scientific workbench language: cool neutral surfaces, dark blue ink, restrained teal actions, and amber status signals. The interface should keep enough density for graph editing and source inspection while retaining the calm hierarchy of a native desktop tool.

## Foundations

The shared tokens live in `web/src/app/design-tokens.css`. Components should use these variables instead of adding a new literal color, radius, shadow, or control height.

- Surface: `--rxn-bg`, `--rxn-surface`, `--rxn-surface-solid`, `--rxn-surface-raised`, `--rxn-surface-muted`
- Text: `--rxn-ink`, `--rxn-ink-strong`, `--rxn-ink-muted`, `--rxn-ink-faint`
- State: `--rxn-accent`, `--rxn-accent-soft`, `--rxn-warning`, `--rxn-warning-soft`, `--rxn-danger`, `--rxn-danger-soft`
- Layout: `--rxn-space-1` through `--rxn-space-6`
- Shape: `--rxn-radius-sm`, `--rxn-radius-md`, `--rxn-radius-lg`, `--rxn-radius-pill`
- Elevation: `--rxn-shadow-sm`, `--rxn-shadow-panel`, `--rxn-shadow-float`

Dark mode overrides the same tokens under `.theme-dark`; components should not need separate color decisions for ordinary surfaces.

## Component rules

- Use sentence case for user-facing labels.
- Use icon-only buttons for familiar actions and provide a tooltip or accessible label.
- Keep standard controls at `--rxn-control-height`; use the compact height only in dense toolbars and file rows.
- Use accent color for current selection, primary actions, and successful engine state. Do not use it as a decorative fill everywhere.
- Use amber for parsing attention and red for destructive or failed states.
- Keep panels visually quiet. Borders and one subtle inset highlight should establish grouping before shadows.
- Reserve pill shapes for status, filter, and compact selection controls. Use small or medium radii for panels and buttons.
- Preserve visible keyboard focus with `--rxn-focus`; reduced motion remains respected.

## Workbench hierarchy

1. Window chrome identifies the current canvas and global actions.
2. Project Rail provides project, canvas, and source navigation.
3. Canvas is the primary editing surface and owns graph tools.
4. Inspector presents selected-node facts and structure actions.

New UI should fit this hierarchy before introducing a new visual container or navigation level.

## Validation

Visual changes should be checked at a desktop viewport and at the narrow responsive viewport. Confirm that the canvas remains the largest surface, text stays inside controls, the sidebars do not overlap the work area, and dark mode preserves the same hierarchy.
