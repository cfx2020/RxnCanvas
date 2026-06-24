---
doc_type: feature-ff-note
feature: toolbar-docking
date: 2026-06-24
requirement:
tags: [web-workbench, canvas, toolbar, interaction]
---

## 做了什么
让画布工具栏从固定顶部胶囊变成可拖动的悬浮工具栏：可在画布内自由拖拽，靠近左右边缘时吸附为竖向工具条，并可从贴边状态拖回横向悬浮状态。

## 改了哪些
- `web/src/app/toolbarPlacement.ts:1-94` — 新增工具栏位置模型、边界约束、贴边吸附与窄画布动态吸附阈值。
- `web/src/app/App.tsx:406-522` — 接入工具栏位置测量、localStorage 保存、拖拽开始/移动/释放逻辑。
- `web/src/app/WorkbenchToolbar.tsx:1-88` — 增加拖拽把手、布局/吸附状态 class 与可访问标签。
- `web/src/app/workbench.css:8175-8310` — 增加横向/竖向工具栏样式、贴边形态、窄屏 sticky 拖拽把手与竖向滚动限制。
- `web/src/app/toolbarPlacement.test.ts:1-99` — 覆盖默认位置、边界、左右吸附、贴边拖回悬浮和宽工具栏窄画布场景。

## 怎么验证的
运行 `cd /Users/linsay/Desktop/code/rxnflow/web && npm run test -- src/app/toolbarPlacement.test.ts --run && npm run build`、`cd /Users/linsay/Desktop/code/rxnflow/web && npm run test` 均通过。用 Playwright 打开 `http://127.0.0.1:5173/`，在 1440×960 与 920×760 下验证“初始悬浮 → 右吸附 → 拖回悬浮 → 左吸附”，截图见 `/tmp/rxnflow-toolbar-desktop-final.png` 与 `/tmp/rxnflow-toolbar-narrow-final.png`。
