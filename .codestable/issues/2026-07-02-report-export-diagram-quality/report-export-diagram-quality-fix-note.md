---
doc_type: issue-fix
slug: report-export-diagram-quality
status: fixed
severity: high
tags: [export, cdxml, png, xlsx, report]
created_at: 2026-07-02
---

# Report Export Diagram Quality Fix Note

## Fixed

- Replaced the export PNG/CDXML renderer with a shared relative energy-level diagram model.
- CDXML now emits ChemDraw line/text primitives for horizontal levels and connecting lines, with a white background and page bounds sized for readable labels.
- PNG now rasterizes the same energy diagram SVG instead of the old node-card report layout.
- XLSX now exports `Energy Table Relative` and `Energy Table Absolute` sheets using the same column labels, row ordering, row visibility, and cell formatting as the in-app Energy Table.
- Export menu now uses a workbench-style floating panel with icons and format descriptions instead of bare text buttons.
- Follow-up fix: graph layout now uses reaction-edge depth instead of linear node order, so branch paths are placed in branch columns instead of drawing long cross-figure links.
- Follow-up fix: CDXML lines now use ChemDraw-style `graphic` plus `arrow` primitive pairs, and energy/tag text uses larger ChemDraw font sizes.
- Follow-up fix: CDXML no longer wraps the entire diagram in one integral group; title, axis, grid, levels, labels, dashed guides, and structures are emitted as editable page objects.
- Follow-up fix: exported nodes now carry structure molfiles from either manual sketches or parsed coordinate previews, and the CDXML writer converts those molfiles into editable ChemDraw `<fragment>/<n>/<b>` structures instead of raster images.
- Follow-up fix: CDXML energy levels/connectors now use ChemDraw-style atom anchors plus bond objects, matching the reference generator's editable bond-line model; the large plot border was removed and text now writes real local bounding boxes.
- Follow-up fix: tightened CDXML compatibility after ChemDraw rejected the generated file: removed unsupported `LineWidth` attributes from bond objects and switched the document header/font table to the ChemDraw 17-style template used by the reference generator.
- Follow-up fix: CDXML export now sources molecule structures from Ketcher/Indigo CDXML conversion. The app export layer converts node KET/manual molfile/parsed coordinate previews with Ketcher's no-render struct service before calling the report writer; the domain writer now only lays out those editable Ketcher fragments beside the energy profile.
- Follow-up fix: removed XML comments from generated CDXML. Real project exports can include node ids with `--`, which is illegal inside XML comments and caused ChemDraw to open the app without creating a document.
- Follow-up fix: replaced the report CDXML string-splice path with `chemdrawCdxmlComposer`. The report writer now builds a structured ChemDraw document, imports Ketcher page fragments through DOM parsing, remaps all fragment ids in two passes, normalizes imported font/color references to the document tables, transforms coordinates as structured attributes, and preflights before returning data.
- Follow-up fix: CDXML preflight now rejects bad output before an artifact is written. It checks XML well-formedness, forbids comments, enforces unique `id` values, validates every bond `B`/`E` endpoint reference, and verifies font/color table references.
- Follow-up fix: export failure status now includes the thrown reason, so a CDXML preflight or malformed embedded-structure failure is visible in the app instead of only landing in the developer console.
- Follow-up fix: updated CDXML styling to match the user's ChemDraw ACS-style reference: Arial/Arial Bold 10 pt, ACS-like document attributes, no report title/subtitle, no kcal/mol axis or measurement guide lines, short black bold-bond energy levels, dashed-bond connectors between levels, wider CDXML spacing, and stronger high/low offsets for branch structures.
- Follow-up fix: addition/release participant nodes now appear in CDXML exports as side species with ChemDraw arc/arrow primitives, using the participant structure when available or a bold text label otherwise. Side-species placement is clamped to the page bounds.
- Follow-up fix: tightened the ChemDraw energy layout after visual review. Node structures now sit near their own energy level instead of being forced into a bottom row, energy-level bold bonds are capped to a ChemDraw-default-like short length, and side-species CW/CCW arrows are anchored to the nearest dashed connector segment.

## Verification

- `cd web && npm run test -- --run src/domain/reportExports.test.ts src/app/ReportPanels.test.tsx src/app/reportExportWorkflow.test.ts src/app/appReportExport.test.ts src/app/energyDisplay.test.ts`
- `cd web && npm run build`
- Opened `http://127.0.0.1:5173/`, verified the export panel visually, and downloaded PNG/CDXML/XLSX through Playwright.
- Follow-up verification: `cd web && npm run test -- --run src/domain/reportExports.test.ts src/app/App.test.tsx src/app/ReportPanels.test.tsx`
- Follow-up verification: `cd web && npm run test -- --run src/domain/reportExports.test.ts src/app/appReportExport.test.ts src/app/ReportPanels.test.tsx src/app/reportExportWorkflow.test.ts`
- Follow-up verification: `cd web && npm run build`
- Follow-up verification: generated `/tmp/rxnflow-current.cdxml`, checked XML well-formedness with `xmllint --noout`, and launched it with `/Applications/ChemDraw 25.0.2.app`.
- Follow-up verification: `cd web && npm run test -- --run src/domain/reportExports.test.ts src/app/appReportExport.test.ts src/app/ReportPanels.test.tsx src/app/reportExportWorkflow.test.ts`
- Follow-up verification: `cd web && npm run build`
- Follow-up verification: browser-smoked `exportSelectedReportFormats` through Vite at `http://127.0.0.1:5173/`; the generated `/tmp/rxnflow-ketcher-browser-smoke.cdxml` contains Ketcher `<fragment>/<n>/<b>` structure objects and editable energy-line objects.
- Follow-up verification: `xmllint --noout /tmp/rxnflow-ketcher-browser-smoke.cdxml`
- Follow-up verification: launched `/tmp/rxnflow-ketcher-browser-smoke.cdxml` with `/Applications/ChemDraw 25.0.2.app`.
- Follow-up verification: confirmed `/Users/linsay/Documents/chemistry/Ir/exports/rxnflow-report.cdxml` failed `xmllint` on illegal comment `--`; removing comments made the file well-formed.
- Follow-up verification: `cd web && npm run test -- --run src/domain/reportExports.test.ts src/app/appReportExport.test.ts src/app/ReportPanels.test.tsx src/app/reportExportWorkflow.test.ts`
- Follow-up verification: `cd web && npm run build`
- Follow-up verification: `cd web && npm run test -- --run src/domain/reportExports.test.ts src/app/appReportExport.test.ts src/app/ReportPanels.test.tsx src/app/reportExportWorkflow.test.ts`
- Follow-up verification: `cd web && npm run build`
- Follow-up verification: browser-smoked `buildCdxmlReport` through Vite at `http://127.0.0.1:5173/`; generated `/tmp/rxnflow-cdxml-composer-smoke.cdxml` with editable fragment/n/b structure objects and energy-line bond objects.
- Follow-up verification: `xmllint --noout /tmp/rxnflow-cdxml-composer-smoke.cdxml`
- Follow-up verification: launched `/tmp/rxnflow-cdxml-composer-smoke.cdxml` with `/Applications/ChemDraw 25.0.2.app`.
- Follow-up verification: `cd web && npm run test -- --run src/domain/reportExports.test.ts src/app/appReportExport.test.ts src/app/ReportPanels.test.tsx src/app/reportExportWorkflow.test.ts`
- Follow-up verification: `cd web && npm run build`
- Follow-up verification: browser-smoked the styled CDXML path through Vite at `http://127.0.0.1:5173/`; generated `/tmp/rxnflow-cdxml-style-smoke.cdxml` and confirmed it contains bold bonds, dash bonds, Arial Bold text, and arc arrows while omitting `kcal/mol` and `Relative energy diagram`.
- Follow-up verification: `xmllint --noout /tmp/rxnflow-cdxml-style-smoke.cdxml`
- Follow-up verification: `cd web && npm run test -- --run src/domain/reportExports.test.ts src/app/appReportExport.test.ts src/app/ReportPanels.test.tsx src/app/reportExportWorkflow.test.ts`
- Follow-up verification: `cd web && npm run build`
- Follow-up verification: regenerated `/tmp/rxnflow-cdxml-style-smoke.cdxml` through Vite and checked exported bold-bond lengths; max generated energy-level bond length is 22.4 CDXML units.
- Follow-up verification: `xmllint --noout /tmp/rxnflow-cdxml-style-smoke.cdxml`

## Notes

- Build still reports the existing 3Dmol direct `eval` warning and large chunk warnings; they are unrelated to this export fix.
