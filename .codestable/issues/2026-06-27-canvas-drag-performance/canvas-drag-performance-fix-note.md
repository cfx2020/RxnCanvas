---
doc_type: issue-fix
status: fixed
severity: high
tags:
  - web-workbench
  - canvas
  - performance
  - interaction
fixed_at: 2026-06-27
---

# Canvas drag performance fix note

## Symptom

After importing a realistic desktop project with about 8 graph nodes and 16 log files, canvas panning / node dragging and connection-draft dragging felt visibly laggy.

## Root cause

Canvas pointer movement had two avoidable costs:

1. `handlePointerMove` applied the first pointer event immediately and also scheduled a `requestAnimationFrame` flush for the latest pending event. During active drags this could produce more React state work than necessary per visual frame.
2. `CanvasSurface` re-rendered node cards, edges and labels broadly whenever transient canvas state changed. Panning, connection previews and node movement therefore caused unrelated node cards / edge labels to run render work even when their own data had not changed.

## Fix

- Coalesced canvas pointermove handling so the latest pointer payload is applied once per animation frame.
- Added an immediate final flush on pointerup/cancel so very short drags still commit the last movement before finishing.
- Memoized reaction node cards, edges, edge labels, barrier arrows and barrier labels with data-aware comparators.
- Added stable latest-callback wrappers in `CanvasSurface`, so memoized canvas children can keep stable handlers while still invoking the latest selection / context-menu / edit logic.
- Updated tests that asserted immediate same-tick drag preview to wait for the next frame-backed update.
- Updated the source-inspector test to match the current accepted behavior: selected source files show source details even when no node is selected.

## Validation

- `cd web && npm run test` — 36 files / 267 tests passed.
- `cd web && npm run desktop:pack` — passed; packaged app written to `web/release/mac-arm64/RxnFlow.app`.
- Browser smoke:
  - Node drag changed the node transform correctly.
  - Connector drag created a new edge.

## Follow-up fix: remove React state churn from live drag preview

The first pass reduced unnecessary renders, but user validation still reported visible lag when panning the canvas and dragging nodes in a realistic project.

Additional root cause:

- Panning still called `setViewport(...)` on every animation frame.
- Node dragging still called `setNodes(...)` on every animation frame.
- Because `nodes` and `viewport` are top-level workspace state, every live drag frame still invalidated derived maps, energy rows, minimap props, edge geometry and nearby shell state. Memoization reduced child work but did not remove the top-level React scheduling cost.

Additional fix:

- Added an imperative live-preview path for pan and node drag:
  - canvas pan updates `.canvas-world.style.transform` directly during pointer movement;
  - node drag updates the dragged node's DOM transform directly during pointer movement;
  - React state is committed once on pointerup / pointercancel.
- Kept React state as the source of truth after the drag completes, so autosave, undo snapshots, minimap and edge geometry still settle through the normal state pipeline.
- Added live-drag CSS hints (`will-change: transform`) for the actively previewed surface / node.

Follow-up validation:

- `cd web && npm run test` — 36 files / 268 tests passed.
- `cd web && npm run build` — passed.
- Browser smoke at `http://127.0.0.1:5173/`:
  - page identity: `RxnFlow Workbench`;
  - no console errors / warnings;
  - node drag updated `TS1 (Endo)` from `translate3d(10px, -140px, 0px)` to `translate3d(96px, -88px, 0px)`;
  - pan tool drag updated `.canvas-world` from `translate3d(245px, 279px, 0px) scale(0.58)` to `translate3d(305px, 329px, 0px) scale(0.58)`.

## Follow-up fix: trackpad wheel preview and connected geometry during node drag

User validation found two remaining interaction problems after the live-preview pass:

- two-finger trackpad panning still felt janky because wheel navigation still drove viewport state updates directly;
- while a node was dragged with the mouse, connected SVG edges and labels stayed in their old positions until pointer release.

Additional root cause:

- `subscribeCanvasWheel()` still called `setViewport(...)` from wheel input, so dense trackpad bursts could schedule React work repeatedly on the top-level workspace state.
- The node drag preview intentionally moved only the dragged node DOM element and deferred `nodes` state until pointerup. Connected `ReactionEdge`, edge label, and barrier DOM still derived from the old React `nodeMap`, so they had no live geometry update to follow the node preview.

Additional fix:

- Added a wheel preview path that coalesces wheel deltas to one animation-frame preview and imperatively updates the `.canvas-world` transform. React viewport state is committed once after the wheel burst settles, keeping the canvas visually responsive without paying top-level React state cost on every trackpad event.
- Kept a live viewport ref for screen-to-world conversions so wheel preview, pointer pan preview, and later interactions read the latest visual viewport.
- Added stable DOM data attributes for edges, edge labels, barriers, and barrier labels.
- Extended node drag preview to recompute connected edge/barrier geometry against a temporary node map and imperatively update the connected SVG paths plus label anchors during the drag. Pointerup still commits snapped node position through the normal React state path.

Additional validation:

- `npm --prefix web run test -- App.test.tsx appCanvasEffects.test.ts CanvasWorkspace.test.tsx --run` — passed, 54 tests.
- `npm --prefix web run test -- --run` — passed, 36 files / 271 tests.
- `npm --prefix web run build` — passed; only existing 3Dmol direct-eval and large Ketcher chunk warnings.
- `git diff --check` — passed.
- Playwright browser smoke at `http://127.0.0.1:5173/`:
  - page title `RxnFlow Workbench`, nonblank workbench, no framework overlay, no console warnings/errors;
  - while holding the mouse down on `TS1 (Endo)`, node transform changed from `translate3d(10px, -140px, 0px)` to `translate3d(109.629px, -81.2445px, 0px)` and connected edge `edge-1` path changed before mouseup;
  - wheel burst preview changed `.canvas-world` from `translate3d(392px, 291px, 0px) scale(0.782906)` to `translate3d(476px, 339px, 0px) scale(0.782906)`, then the delayed React commit kept the same transform.
  - Screenshot: `/tmp/rxnflow-canvas-perf-after.png`.

## Follow-up fix: remove cold-start DOM scans from node drag

User validation found that single-node dragging could still feel laggy at the start of a drag and only become smooth after moving the node around a few times.

Additional root cause:

- The previous live node-drag fix made connected edges follow the dragged node, but `previewNodePosition()` still discovered connected SVG paths and label anchors by repeatedly scanning DOM with `querySelectorAll()` during live movement.
- Drag start also re-applied identical canvas selection arrays, which could schedule avoidable React work when the user was already dragging the selected node.
- Native pointer defaults were not explicitly prevented on node drag start, leaving the browser more room to do text-selection / default pointer bookkeeping during the same gesture.

Additional fix:

- Added a node-drag preview cache built on pointerdown:
  - dragged node element;
  - connected edge SVG hit/visible paths;
  - connected edge label anchors and measured label widths;
  - connected barrier paths and label anchors.
- Live pointermove now updates only cached DOM references. It no longer scans for connected edge/label/barrier elements every frame.
- `applyCanvasSelectionState()` now uses functional setters that return the current array when the requested ordered selection is unchanged, avoiding no-op selection renders at drag start.
- Node pointerdown now calls `preventDefault()` before pointer capture / drag state setup.

Additional validation:

- `npm --prefix web run test -- App.test.tsx appCanvasEffects.test.ts CanvasWorkspace.test.tsx --run` — passed, 54 tests.
- `npm --prefix web run build` — passed; only existing 3Dmol direct-eval and Ketcher large-chunk warnings.
- `npm --prefix web run test -- --run` — passed, 36 files / 271 tests.
- `git diff --check` — passed.
- Playwright smoke at `http://127.0.0.1:5173/`:
  - dragged `TS1 (Endo)` through 24 mouse moves;
  - node transform changed live before mouseup;
  - connected edge `edge-1` path changed live before mouseup;
  - flow DOM selector lookup counts stayed stable during mouse moves (`[data-flow-edge-id]`: 4, `[data-flow-edge-label-id]`: 4 before and after moves), proving connected geometry was cached rather than rediscovered every frame;
  - no console warnings/errors.
  - Screenshot: `/tmp/rxnflow-node-drag-cache-check.png`.

## Follow-up fix: reduce canvas compositor memory pressure

User validation later showed that Activity Monitor memory could climb into the GB range after only panning the canvas and dragging nodes, even without using the 3D structure preview. Opening a 3D preview could sometimes reduce memory, suggesting Chromium memory pressure / compositor cleanup rather than a 3Dmol-only leak.

Additional root cause:

- The canvas world and every reaction node carried permanent `will-change: transform`.
- Canvas, node, annotation and label positioning used `translate3d(...)` even for persistent non-animated layout.
- Combined with node `backdrop-filter`, those hints encouraged Chromium to keep large compositor / GPU backing layers alive. This matches the user-observed Activity Monitor growth better than JS heap growth.

Additional fix:

- Removed permanent `will-change: transform` from `.canvas-world` and `.reaction-node`.
- Kept `will-change` only while `.canvas-surface.is-live-pan` or `.canvas-surface.is-live-node-drag` is present.
- Replaced persistent and live-preview canvas transforms from `translate3d(...)` with 2D `translate(...)`:
  - canvas world pan transform;
  - node card transform;
  - image / text annotations;
  - edge / barrier label anchors;
  - imperative live pan / node drag previews.
- Added test assertions that the rendered canvas uses 2D transforms and does not emit inline `translate3d` styles.

Additional validation:

- `npm --prefix web run test -- App.test.tsx CanvasWorkspace.test.tsx appCanvasEffects.test.ts --run` — passed, 54 tests.
- `npm --prefix web run build` — passed; only existing 3Dmol direct-eval and Ketcher large-chunk warnings.
- `npm --prefix web run desktop:pack` — passed.
- `npm --prefix web run desktop:runtime:smoke` — passed.
- `npm --prefix web run desktop:release:smoke` — passed.
- Packaged `app.asar` timestamp after compositor-memory fix: `2026-06-27 16:35:33`.
- Playwright smoke at `http://127.0.0.1:5173/`:
  - after repeated canvas pans and node drags, live drag classes were removed;
  - inline `translate3d` style count stayed `0`;
  - JS heap / DOM counters remained stable after forced GC (`before` ~8.89MB heap / 243 listeners; after 30 node drags ~11.07MB heap / 273 listeners);
  - no console errors / warnings.
  - Screenshots: `/tmp/rxnflow-canvas-memory-layer-fix-gc.png`, `/tmp/rxnflow-node-drag-memory-layer-fix.png`.
