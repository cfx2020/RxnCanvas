---
doc_type: feature-ff-note
feature: table-drawer-view
date: 2026-06-25
requirement:
tags: [web-workbench, canvas, table-view, toolbar, interaction]
---

## 做了什么
把能量表从独立工作台视图改成覆盖画布的底部抽屉：工具栏只保留进入表格的单按钮，表格从底部滑入并可用右上角 X、Escape 或点击表格行返回画布。

## 改了哪些
- `web/src/app/App.tsx:288-462,1737-1865` — 保持画布常驻，新增表格抽屉挂载/关闭动画状态、Escape 关闭与表格行选择回到画布。
- `web/src/app/WorkbenchToolbar.tsx:120-129` — 将 canvas/table 分段切换改成单个稳定命名的表格按钮。
- `web/src/app/ReportPanels.tsx:108-159` — 为能量表增加可选关闭按钮。
- `web/src/app/workbench.css:8561-8704` — 增加抽屉滑入/滑出、遮罩式面板、工具栏隐藏、深色模式和窄屏样式。
- `web/src/app/App.test.tsx:256-258` — 将旧 Canvas view 切回测试更新为抽屉关闭按钮。

## 怎么验证的
运行 `cd /Users/linsay/Desktop/code/rxnflow/web && npm run test`（32 files / 252 tests 通过）和 `npm run build` 通过。用 Playwright 打开 `http://127.0.0.1:5173/`，在 1180×760 与 980×720 下验证表格按钮打开抽屉、X/行选择/Escape 关闭、画布仍常驻且无 Vite overlay/console error，截图见 `/tmp/rxnflow-table-drawer-desktop-open.png`、`/tmp/rxnflow-table-drawer-desktop-closed.png`、`/tmp/rxnflow-table-drawer-narrow-open.png`。
