---
doc_type: issue-report
slug: relative-energy-expression-cclib
status: fixed
severity: high
tags: [energy-table, relative-energy, parser, cclib, ir-regression]
created: 2026-06-18
---

# Issue Report: relative energy table ignores graph zero/expression semantics and parser lacks cclib backend

## User-visible problem

- Energy Table 的 Relative 模式仍按表格第一行做各列基准，用户在画布节点上切换 zero point 后表格 0 点不随设置变化。
- Ir 项目中画布节点和表格没有使用同一套图谱能量表达式：`4b-1`、`1`、`Cl` 等进入/放出的项应参与相对能量计算，但不应作为独立相对能量路径点显示。
- 当前 active Python engine 仍只走 lightweight regex parser，之前讨论的 cclib 后端没有落地。

## Reproduction evidence

- 当前 `web/src/app/ReportPanels.tsx` 在 `EnergyTableView` 内部用 `energyTableBaselines(rows)` 从第一条可用 row 取每列 baseline，绕开了 `web/src/app/energyDisplay.ts` 的 selected baseline 逻辑。
- 用户提供的 `/Users/linsay/Desktop/code/rxnflow/Ir/20260331-Ir-test.xlsx` 的 `Shermo_New` sheet 相对能量块使用 graph-like composition formulas，例如：
  - `4b+ = 4b+ + Cl - 4b-1`
  - `i1N2fix14-tsf = i1N2fix14-tsf + Cl - 1 - 4b-1`
  - `i1N2fix14-ts = i1N2fix14-ts + Cl - 1 - 4b-1`
  - `i1N2fix14-tsr = i1N2fix14-tsr + Cl - 1 - 4b-1`

## Expected behavior

- Python full-file import should use cclib when available as the primary source for standard computational fields, then use RxnFlow custom text extraction only to fill missing standard fields and provide app-specific metadata.
- Canvas relative labels, barrier defaults, export rows, and Table View should consume one shared derived energy row model.
- Relative table columns should be based on graph-derived energy expressions and the selected zero point, not on arbitrary table row order.
- Term-only species used in expressions should remain visible in absolute/source views but be omitted from relative path rows.
