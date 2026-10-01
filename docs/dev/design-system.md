---
doc_type: design-system
slug: rxnflow-workbench-design-system
status: current
summary: Visual tokens, component rules and incremental CSS boundaries for the RxnFlow desktop workbench.
---

# RxnFlow Workbench Design System

RxnFlow is a desktop reaction-graph editor. Keep the canvas prominent, source navigation dense and inspector facts easy to scan. Narrow layouts serve resized desktop windows; the browser is a development preview, not a separate product. Use cool neutral surfaces, blue-grey text, restrained teal selection and amber attention states.

## Tokens

Shared values live in [`web/src/app/tokens.css`](../../web/src/app/tokens.css). `.theme-dark` overrides the same color and shadow tokens. Use the existing names below; do not add aliases or component-specific palettes for the same roles.

| Role | Tokens / values |
| --- | --- |
| Surface | `--rxn-bg`, `--rxn-surface`, `--rxn-surface-solid`, `--rxn-surface-raised`, `--rxn-surface-muted` |
| Text | `--rxn-ink`, `--rxn-ink-strong` |
| Muted text | `--rxn-ink-muted`, `--rxn-ink-faint` |
| Border | `--rxn-line`, `--rxn-line-strong` |
| Accent / selected | `--rxn-accent`, `--rxn-accent-strong`, `--rxn-accent-soft` |
| Error / destructive | `--rxn-danger`, `--rxn-danger-soft`; attention uses `--rxn-warning` / `--rxn-warning-soft` |
| Spacing | `--rxn-space-1…6`: 4 / 8 / 12 / 16 / 20 / 24px |
| Fonts | `--font-ui`: system UI stack; `--font-mono`: code and raw numerical expressions. No separate menu font. |
| Type scale | `--rxn-font-micro/caption/small/ui/body/label/large/subtitle/heading/title/display`: 9 / 10 / 11 / 12 / 13 / 14 / 15 / 16 / 18 / 19 / 24px |
| Weights | `--rxn-weight-regular/medium/strong`: 400 / 650 / 800 |
| Radii | `--rxn-radius-control/menu/sm/md/lg/pill`: 6 / 10 / 8 / 12 / 16 / 999px |
| Shadows | `--rxn-shadow-sm` for small controls, `--rxn-shadow-panel` for menus, `--rxn-shadow-float` for raised overlays |
| Control heights | `--rxn-control-height`: 34px; `--rxn-control-height-compact`: 30px |
| Motion | `--rxn-transition-fast/standard`: 140 / 180ms; respect `prefers-reduced-motion` |

Use 12px for dense menu labels, 10–11px for secondary metadata, 13px for inspector values and 19px for the selected-node title. Micro type is only for canvas annotations at their native scale. Existing optical exceptions such as 10.5px are retained until their component is redesigned. Prefer the spacing scale; small optical icon offsets may remain literal values.

## Layering and window widths

Global layer tokens are `--rxn-z-rail` (1400), `inspector` (1450), `file-menu` (1810), `rail-trigger` (2899), `rail-overlay` (2900), `editor` (2950), `titlebar` (3000), `settings` (3100) and `drag-tooltip` (9999), all with the `--rxn-z-` prefix. Values preserve current desktop ordering. Canvas ports, labels and selection affordances use local stacking contexts; their small local z-indices do not belong to this global ladder. A token alone cannot escape an ancestor stacking context.

| Window width | Layout contract |
| --- | --- |
| ≥1181px | Persistent project rail, canvas and resizable inspector columns |
| ≤1180px | Compact shell; project rail becomes an overlay. App.tsx and CSS must use the same threshold. |
| ≤960px | Narrow inspector/toolbar arrangements; overlays must remain inside the window |
| ≤760px | Compact native titlebar tabs |
| ≤580px | Settings submenus stack vertically |
| 320–390px | Minimum-width stress check: controls remain reachable, facts can wrap and tables scroll inside their panel |

These are the canonical thresholds for new work. Media queries keep literal widths because CSS custom properties cannot be used in `@media` conditions. When changing a threshold, update this table and its CSS/`matchMedia` consumers together. Older component-local queries (including 980px and 520px) remain in `workbench.css` and should be reconciled when that component is extracted, not silently changed during a file move.

## Component and interaction rules

- **Buttons:** use the shared UI font and Lucide icons (normally 15–16px). Keep labels action-oriented. Icon-only controls need an accessible name and a tooltip. Use teal for selected or primary actions, not every button.
- **Panels:** keep the inspector flat and quiet. Use spacing and subtle separators for grouping. Menus use a small radius and one restrained shadow; avoid nested cards or full-screen dimming for the settings popover.
- **Settings:** show one label per category. Current theme/unit appears only in the expanded options with a checkmark. Keep Gaussian and text opener entries in the client. No duplicated title, close button or summary line; outside click and Escape dismiss, then restore focus to the trigger.
- **Status:** normal/selected uses accent, attention/running uses amber, failed/destructive uses danger, unknown uses muted. Always pair color with text or an icon; never infer successful parsing merely from an unknown status.
- **Focus:** use `:focus-visible`, an accent outline (normally 2px) or `--rxn-focus` ring. Never remove the only focus indicator. Dialogs contain Tab navigation; Escape closes; opening and closing preserve a meaningful focus target.
- **Disabled:** use native `disabled` for buttons, `--rxn-disabled-opacity` (.45), default cursor and no hover/pressed treatment. For custom `aria-disabled` controls, block activation as well as styling. Explain unavailable capabilities near the control when the reason is not obvious.
- **Long content:** values may wrap, filenames may ellipsize with a full-name tooltip, tables scroll within their own container. Do not reduce font sizes to hide overflow.

## CSS boundaries and migration

`main.tsx` loads `shell.css` → `canvas.css` → `panels.css` → `workbench.css` → `tokens.css`. SettingsPanel imports `settings.css`. Keep this order during extraction: later rules still refine earlier base rules, and theme tokens retain their existing precedence.

- `tokens.css`: shared values only; no component layouts.
- `shell.css`: base document, window/workspace shell, project/file rail and shared shell primitives.
- `canvas.css`: base toolbar, canvas, nodes, edges, selection and zoom controls.
- `panels.css`: base inspector, structure preview, artifacts and energy table.
- `settings.css`: complete compact settings popover styles.
- `workbench.css`: remaining responsive/theme refinements and component overrides pending incremental extraction.

This is the first extraction, not a completed rewrite. New component rules belong beside their owning module. When migrating existing refinements, move the complete related selector/media-query group, preserve cascade order, replace matching literals with tokens, and remove superseded rules. Do not add a new “final override” at the end to work around an older rule.

## Verification

Run `npm run build` and `npm run test` from `web/`. Preview with `npm run dev` at `http://127.0.0.1:5173/`. Check light/dark themes at 1440px, both sides of the 1180px shell transition and a 390px narrow window. Exercise settings, sidebar collapse/resize, canvas selection and energy table; inspect focus, disabled controls, text overlap, horizontal overflow and console errors. For pure extraction, compare rendered geometry and computed styles before/after rather than relying on a successful build alone.
