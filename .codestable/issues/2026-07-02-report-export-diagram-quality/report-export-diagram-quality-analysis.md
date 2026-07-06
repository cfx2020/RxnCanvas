---
doc_type: issue-analysis
slug: report-export-diagram-quality
status: fixed
severity: high
tags: [export, cdxml, png, xlsx, report]
created_at: 2026-07-02
---

# Report Export Diagram Quality Analysis

## Root Cause

The export layer had drifted from the current workbench models. CDXML and PNG used a separate card-like SVG/CDXML renderer with fixed dimensions and independent node ordering, while XLSX used old hard-coded energy headers and formulas instead of the Energy Table display model.

## Fix Direction

- Share Energy Table ordering, visibility, column labels, and cell formatting between the in-app table and export.
- Render CDXML/PNG as an energy-level diagram with ChemDraw line/text primitives rather than node-card snapshots.
- Keep formula/structure-heavy content out of the energy curve so labels remain readable.
