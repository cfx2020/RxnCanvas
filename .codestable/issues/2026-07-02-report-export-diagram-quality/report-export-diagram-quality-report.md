---
doc_type: issue-report
slug: report-export-diagram-quality
status: fixed
severity: high
tags: [export, cdxml, png, xlsx, report]
created_at: 2026-07-02
---

# Report Export Diagram Quality

## Problem

- Export panel looks too bare for the workbench.
- Exported CDXML and PNG are not readable as energy diagrams because labels and lines collapse together.
- XLSX export does not match the current Energy Table headers or displayed values.

## Expected

- CDXML opens in ChemDraw as a clean relative energy diagram.
- PNG uses the same readable energy-diagram layout.
- XLSX uses the same Energy Table columns and display formatting as the in-app table.

## References

- liyuanhe211/Energy_Diagram_Plotter_CDXML for ChemDraw primitive energy-level rendering ideas.
- giacomomarchioro/PyEnergyDiagrams for horizontal level/link diagram structure.
