---
doc_type: feature-ff-note
feature: full-file-import-parsing
date: 2026-06-17
requirement: platform-shell-entry
tags: [desktop, import, parser, energy-table, source-preview]
---

## 做了什么
桌面导入不再把 64KB preview 当作解析输入；Electron 传 `sourcePath` 给 local engine，由 Python/embedded engine 读取完整文件解析。解析结果新增 `parseScope`、`confidence`、warnings provenance 和 energyTable，使表格能显示 Egas/Ggas/Ggas+1M/Esol/Gsol 等真实字段。

## 改了哪些
- `rxnflow/engine.py` / `rxnflow/engine_ipc.py` — `import.preview` 支持 `sourcePath` full-file parse，Gaussian/ORCA 输出能量表字段，登记对象保留 energyTable。
- `web/electron/main.cjs` / `web/electron/embedded-engine.cjs` — Electron 选择文件与 embedded fallback 都传/读 `sourcePath`，renderer 仍只保存 preview sample。
- `web/src/domain/sourceParsers.ts`、`web/src/app/importWorkspace.ts`、`web/src/app/energyDisplay.ts`、`web/src/app/ReportPanels.tsx` — 浏览器 fallback/节点/pairing/表格消费结构化 energyTable，gas/solution log 配对后计算 Gsol。
- `web/src/app/InspectorPanels.tsx` / `web/src/app/workbench.css` — Source 面板显示 parser、version、parse scope、confidence、warning count 和“当前显示的是 preview sample 还是完整文本”。
- `.codestable/architecture/*`、`.codestable/requirements/platform-shell-entry.md` — 同步当前 full-file import parse 现状和仍未 active 的 cclib/log viewer 边界。

## 怎么验证的
跑过 `python3 -m unittest discover`、`cd web && npx tsc -b --pretty false`、`npm run test`、`npm run build`、`npm run desktop:smoke`、`npm run desktop:runtime:smoke`。浏览器 smoke 使用 `/Users/linsay/Desktop/code/rxnflow/Ir/4b-1.log` + `4b-1-sol.log` 验证 gas/sol 合并为 1 个节点，表格出现完整文件末尾能量和 Gsol，Source 面板明确显示 preview sample。

## 顺手发现
- 完整虚拟滚动 log viewer、搜索/跳转 SCF Done / Standard orientation / thermochemistry / warning 行，以及生产级 cclib parser backend 仍是后续 roadmap-only；本次只把底层 full-file parse、表格结构化数据和 provenance 先修正。
