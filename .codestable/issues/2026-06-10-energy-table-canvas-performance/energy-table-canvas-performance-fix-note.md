---
doc_type: issue-fix
date: 2026-06-10
slug: energy-table-canvas-performance
status: fixed
severity: medium
tags: [web-workbench, energy-table, graph-canvas, performance, solvation]
---

# Energy Table And Canvas Performance Fix Note

## Symptoms

- The workbench energy table did not follow the user-provided Excel template order or the latest requested `Structure / Charge / Multiplicity / Formula` leading columns.
- Gas and solution basis-function counts were collapsed into one generic basis column.
- Canvas nodes could show energy as missing even when the table had valid parsed energy.
- Dragging already imported project logs back onto the canvas could feel slow because graph-ready objects were rejected when they still needed nonessential hydration.
- Switching between canvas and table could recreate the graph canvas and 3D viewers.
- Canvas panning and wheel navigation could force avoidable node prop churn, contributing to visible stutter on molecule-heavy graphs.

## Root Cause

- `WorkbenchEnergyTable` was organized by internal UI convenience fields instead of the Excel template sequence.
- The first Relative table pass subtracted every structure from the first available object, which did not match the lower section of the user's workbook where rows are reaction expressions such as `product + reference - reactant`.
- Solution log pairing folded `Esol/Gsol` into the gas object but did not preserve the solution log basis-function count.
- `GraphCanvas` merged profile-derived relative energies ahead of object-derived relative energies, so stale or incomplete profile data could mask valid object energy values.
- Project-file reuse required `objectNeedsRawHydration` to be false, which was too strict for fast canvas node creation because a graph-ready electronic-energy object could be rejected only because it lacked gas free energy.
- Grouped project-file drags were still expanded into one import/register cycle per raw file, so a gas log could create a graph node before its paired solution log had been folded into the same object.
- Restored already-parsed solution log objects could store their single-point energy under generic `electronic`/`scf` keys instead of `Esol`, so the local reuse path could fail to pair them even though the first import/register path had enough information.
- `import.register_all` still returned transient solution-object ids even after fixture pairing removed those objects from the final registry projection.
- Canvas/table switching conditionally mounted either `GraphCanvas` or the table, forcing canvas teardown and remount.
- Multi-candidate `import.register_selection` returned the selected object ids at the response top level, but the import batch item could still carry stale/default ids. After project save or refresh reloaded file rows as `stored`, projection could not always reconnect the raw project file to all selected graph nodes.
- The project-file projection effect did not react when refreshed file rows reset from projected statuses back to stored status, so the left rail could stay stale until another workbench-state change occurred.
- Hidden canvas panes still kept node-level 3D WebGL previews mounted while the user was reading the table, which made heavy graph/table switching and browser screenshots more expensive than necessary.

## Fix

- Reordered the table around the user Excel template sequence and latest product wording: `Structure`, `Charge / Multiplicity`, `Formula`, `Egas`, gas `basis function`, `Egas × 627.5095`, `Ggas`, `Ggas × 627.5095`, `Ggas+1M`, `Ggas+1M × 627.5095`, `Ggas(shermo)`, `Ggas(shermo) × 627.5095`, `Ggas(shermo+1M)`, `Ggas(shermo+1M) × 627.5095`, `Esol`, solution `basis function`, `Esol × 627.5095`, `Sgau,tran`, `Swhit,tran`, `Sgau,tran - Swhit,tran`, `T*(Sgau,tran - Swhit,tran)/1000`, `RT*0.239006/1000`, and `Gsol`.
- The current UI intentionally moves each `basis function` column directly after its source energy column (`Egas` and `Esol`) per latest user instruction; charge/multiplicity and formula are factual leading identifiers instead of trailing supplemental fields.
- Added Absolute / Relative table modes. Relative mode keeps the same column layout but applies `Δ` to energy columns only; basis-function, charge/multiplicity, and formula columns remain factual metadata instead of meaningless deltas.
- Relative mode now detects non-unit node composition coefficients and evaluates them as reaction expressions, matching the workbook lower-section pattern such as `Product + Cl - Reactant`. Multiple all-positive composition terms are treated as a combined structure, not as an already-relative expression.
- Relative table mode now shares the canvas zero point instead of choosing an unrelated first object. If the user sets a structure as the zero point from the node menu, the table uses the same reference.
- Relative table rows are now derived from the main path rather than from every graph node. Intermediate side species such as released `Cl` or added `1` are folded into main-path formulas instead of appearing as separate Relative rows, matching the user-provided Ir workbook lower-section pattern.
- Automatic relative expressions are generated from graph topology when a node has no manual composition expression. Manual node composition still wins when present; otherwise the graph path supplies terms such as `4b+ + Cl - 4b-1` and `tsf - 1 + Cl - 4b-1`.
- Composition coefficients are normalized before deciding whether a node is a manual expression. Missing coefficients and string `"1"` are treated as ordinary unit coefficients, so restored projects do not accidentally display absolute multi-object sums as relative table values.
- Incoming edges that point directly into the selected zero point are not treated as consumed side species. This keeps tables sane when the user chooses a middle structure as the zero point.
- Added `solutionBasisFunctionCountFromObject` and stored paired solution-log basis data as `solution_basis_function_count`.
- Clarified the visible table headers to distinguish gas and solution basis columns: `Basis functions(gas)` appears immediately after `Egas`, and `Basis functions(sol)` appears immediately after `Esol`.
- Batch-imported grouped project-file drags through one `import.preview` and one `import.register_all`, then created graph nodes only for gas-phase primary objects. Solution logs now update project file state and paired energy metadata without creating duplicate graph nodes.
- Filtered fixture `registered_object_ids` to final graph-ready object ids after gas/solution pairing, so paired solution logs no longer leak a duplicate solution object id to the UI.
- Normalized `import.register_selection` batches so the selected item records the actual selected object ids. This keeps one raw file that yields multiple selected structures bound to all created graph nodes after save/refresh.
- Made project-file projection re-run when file rows are refreshed back to stored status, and broadened source-name matching to checksum-stripped and extension-stripped names.
- Made graph node relative energies prefer object-derived values and use profile values only as a supplement for nodes without object energy.
- Made the default canvas zero point skip path nodes that have no value for the selected energy mode. This avoids a valid later node showing `missing` or falling back to absolute Hartree only because the first path node lacks that channel.
- Made node cards fall back to the selected structure's absolute energy (`E`, `G`, `Gsol`, or `Ecorr`) when relative energy is intentionally filtered as chemically non-comparable. Absolute fallback now follows the selected canvas unit, so switching between `kcal/mol`, `Hartree`, and `kJ/mol` updates node cards consistently. Truly missing channels still show the relative symbol (`ΔE`, `ΔG`, `ΔGsol`, or `ΔEcorr`) with `missing`.
- Canvas energy-mode labels now use table-compatible channel names (`Egas`, `Ggas`, `Gsol`, `Corrected`) in both Chinese and English UI to avoid implying separate data sources.
- Energy-ranked canvas layout now treats the inferred main path as the ranked energy path. Side species can still participate in formulas, but they no longer produce misleading `layout_missing_energy` warnings simply because they are not main-path structures.
- Allowed already registered project files with renderable geometry and any compatible energy channel (`Egas`, gas free energy, `Esol`, `Gsol`, or `display_energy`) to be reused immediately when dragged onto the canvas. A missing gas free-energy channel no longer forces raw log reparse. Reuse now also falls back by source filename/raw id when `registeredObjectIds` projection is incomplete.
- Added a local gas/solution reuse fast path for grouped project rows when both parsed objects are already in the project state. It folds the solution object into the gas object and calls `workspace.add_node` directly, skipping `import.preview` and `import.register_all`.
- Local solution pairing now treats a solution-log object's generic `electronic`/`scf` energy as `Esol`, then normalizes the merged object to explicit `Esol/Gsol` fields. This keeps restored projects, the table, and canvas nodes on the same object data source.
- Kept canvas and table views mounted in separate panes and hid the inactive pane, reducing repeated graph setup when switching views.
- Paused heavy graph content and node-level 3D previews when the canvas pane is hidden, so table mode keeps graph state warm without keeping hidden node DOM, edge SVG, minimap, or WebGL molecule previews mounted.
- Cached stable graph node display-position props, reused an empty solution-candidate array, and stabilized graph history callbacks/controls so wheel/pan previews and table/canvas switching do not make every non-moving node look changed to React.
- Grouped gas/solution logs in the project tree as one structure row. Dragging the grouped row now imports the whole group, pairs solution data into the gas object, and creates only one gas-phase graph node.
- Project tree grouping and runtime pairing recognize solution-log suffixes `-sol`, `_sol`, `.sol`, ` sol`, `-solution`, `_solution`, `.solution`, ` solution`, `-solv`, `_solv`, `.solv`, ` solv`, `-smd`, `_smd`, `.smd`, and ` smd`, so common gas/solution file pairs collapse into one structure row instead of showing duplicate gas and solution files.
- Added project-open repair for older saved projects: if an existing graph node lacks `Gsol` but the project still contains matching raw gas and solution logs, RxnFlow re-registers that pair, folds `Esol/Gsol` into the gas object, and rewrites the node composition to the paired object. This fixes saved projects where the table or node could remain missing until the user manually dragged the row again.

## Solvation Pairing Policy

- Auto-pair by normalized basename when a solution log ends with a known solution suffix such as `-sol`, `_sol`, `.sol`, ` sol`, `-solution`, `_solution`, `.solution`, ` solution`, `-solv`, `_solv`, `.solv`, ` solv`, `-smd`, `_smd`, `.smd`, or ` smd`.
- This matches the current `Ir/` sample naming style, including `1.log` + `1-sol.log`, `4b+.log` + `4b+_sol.log`, and `i1N2fix14-ts.log` + `i1N2fix14-ts-sol.log`.
- The solution log remains a project file, but its parsed `Esol`, derived `Gsol`, solution basis count, and source metadata are folded into the corresponding gas-phase object.
- Graph nodes should be created from the gas-phase structure object; solution logs should not create duplicate structure nodes by default.
- If an automatic match is not possible, the UI exposes manual pairing from the structure node context. The intended interaction is: select/open the gas structure node, choose the candidate solution log, and fold only `Esol/Gsol` plus solution metadata into that structure rather than creating a second graph node.
- If a grouped gas/solution row is dragged from the project tree, RxnFlow treats the group as one import batch. Existing gas objects are reused only when the solution data is already paired; otherwise the grouped files are re-registered together so the canvas and table share the same object data.
- If both gas and solution objects are already parsed but not yet folded together, dragging the grouped row performs the fold locally and creates only the gas-phase canvas node. This is the fast path for saved projects and avoids rereading large raw logs.
- If only the gas structure is already parsed and has geometry plus electronic energy, dragging it back to the canvas reuses the object immediately. Missing solution data is surfaced as a pairing gap rather than triggering a slow raw-log reparse.

## Verification

- `cd web && npm run test -- src/app/ProjectSidebar.test.tsx --run`
- `cd web && npm run test -- src/app/GraphCanvas.test.tsx src/shell/ShellClient.test.ts --run`
- `cd web && npm run test -- src/app/GraphCanvas.test.tsx src/app/ProjectSidebar.test.tsx src/shell/ShellClient.test.ts --run`
- `cd web && npm run test -- src/app/WorkbenchShell.test.tsx src/shell/ShellClient.test.ts --run`
- `cd web && npm run test -- src/app/WorkbenchShell.test.tsx --run`
- `cd web && npm run test -- src/app/projectFiles.test.ts src/app/WorkbenchShell.test.tsx src/app/GraphCanvas.test.tsx src/app/ProjectSidebar.test.tsx src/shell/ShellClient.test.ts --run`
- `cd web && npm run test -- src/app/GraphCanvas.test.tsx src/app/WorkbenchShell.test.tsx --run`
- `cd web && npm run test -- src/app/WorkbenchShell.test.tsx src/app/ProjectSidebar.test.tsx src/app/GraphCanvas.test.tsx --run`
- `cd web && npm run test -- src/app/WorkbenchShell.test.tsx --run` after adding the restored gas/solution reuse regression.
- `cd web && npm run test -- src/app/WorkbenchShell.test.tsx --run` after adding the composition-expression relative table regression.
- `cd web && npm run test -- src/app/ProjectSidebar.test.tsx --run` after adding gas/solution suffix-variant grouping regression.
- `cd web && npm run test -- src/app/WorkbenchShell.test.tsx --run -t "repairs restored graph nodes"` after adding project-open repair for legacy nodes missing paired solution energy.
- `cd web && npm run test -- src/app/WorkbenchShell.test.tsx --run` after project-open repair.
- `cd web && npm run test -- src/app/GraphCanvas.test.tsx src/app/WorkbenchShell.test.tsx --run` after sharing the canvas zero point with the table, adding automatic main-path relative expressions, and making absolute fallback follow the selected canvas unit.
- `cd web && npm run test -- src/app/GraphCanvas.test.tsx src/app/WorkbenchShell.test.tsx --run` after normalizing missing/string unit coefficients and ignoring incoming edges into the selected zero point.
- `cd web && npm run test -- --run`
- `cd web && npm run build`
- `git diff --check`
- Browser smoke verification at `http://127.0.0.1:5173/`: page identity/title, nonblank workbench shell, no framework overlay, console health, DOM-level table switch, Shermo table headers, visible Ir table rows, hidden canvas pane with zero node-level WebGL canvases in table mode.
- Browser screenshot capture still timed out at the CDP `Page.captureScreenshot` call for the heavy local Ir project. DOM, console, and interaction checks passed; screenshot timeout remains a tooling/performance follow-up rather than a functional regression.

## Follow-Up

- Manual gas/solution pairing UX remains needed for ambiguous names or cases where several solution logs could match one gas structure.
- The table now supports lower-section style reaction expressions when a graph node carries composition terms. Follow-up UX should make those composition expressions easier to author from the canvas path instead of relying on low-level composition editing.
- Chunk splitting remains a build follow-up: Vite still warns that the main JS chunk is larger than 500 kB after minification.
- Browser screenshot timeout needs a separate performance/debugging pass if screenshot-based visual QA remains required for heavy Ir projects.
