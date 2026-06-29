---
doc_type: feature-ff-note
feature: energy-table-column-polish
date: 2026-06-29
requirement:
tags: [frontend, energy-table, roadmap]
---

## 做了什么

整理 Web Energy Table 视图列口径：隐藏 Formula 和 Shermo/Whitesides 校正相关占位列，缩短 charge/multiplicity 表头，并把 kcal/mol 换算列紧贴对应 Hartree 列显示。

## 改了哪些

- `web/src/app/ReportPanels.tsx` — 调整 Energy Table 渲染列、列顺序和表头文案。
- `web/src/app/App.test.tsx`、`web/src/app/ReportPanels.test.tsx` — 固定新表头顺序，并断言 Formula、`×627.5095`、Shermo/Whitesides 表头不再出现。
- `.codestable/roadmap/rxnflow-energy-chemistry-semantics/`、`.codestable/roadmap/rxnflow-report-export-quality/` — 记录 Shermo/Whitesides correction model 与导出列是后续新特性，当前 UI 不保留占位表头。

## 怎么验证的

`npm --prefix web run test -- ReportPanels App --run`、`npm --prefix web run build` 和两个 roadmap items YAML 校验通过。浏览器验证 `http://127.0.0.1:5173/`：Energy Table 表头顺序正确，旧 Formula、`×627.5095`、Shermo/Whitesides 表头均未出现，console 无 error/warn。
