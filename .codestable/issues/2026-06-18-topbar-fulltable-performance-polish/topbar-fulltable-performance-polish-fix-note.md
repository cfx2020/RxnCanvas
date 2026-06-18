---
doc_type: issue-fix
issue: 2026-06-18-topbar-fulltable-performance-polish
path: standard
fix_date: 2026-06-18
related:
  - .codestable/issues/2026-06-18-topbar-fulltable-performance-polish/topbar-fulltable-performance-polish-analysis.md
tags: [ui, topbar, table-view, performance, desktop]
---

# Topbar / full-table / performance polish 修复记录

## 1. 实际采用方案

按本轮 analysis 落地了三件事：

- **布局改造**：去掉全宽 `window-bar` 对工作区的 T 型切割，把中间工作区改成独立 `workspace-topbar + toolbar + content`；画布 tab 移到中间顶栏；左/右侧栏保留为贯穿全高的独立列。
- **表格视图改造**：画布 / 表格切换改为只挂载 active pane；表格视图改成占满中间工作区的整页表格，不再是悬浮卡片。
- **交互性能改造**：pointer move 改成“首帧立即响应 + 后续 `requestAnimationFrame` 节流”，并把 `ProjectRail` / `InspectorPanel` / `WorkbenchToolbar` / `EnergyTableView` 做 `memo` 边界，减少画布拖动时的无关重渲染。

同时按用户补充反馈一并收口：

- 左侧栏去掉 `RxnFlow / Reaction canvas` 品牌块，更接近 Notion / Codex 式侧栏。
- macOS Electron window 在启动时调用 `setWindowButtonVisibility(false)`，隐藏左上角原生红黄绿按钮。
- 顶栏/工具栏真实验证后保留右上角 export trigger，工具栏不再浮在画布上。

## 2. 改动文件清单

- `web/src/app/App.tsx`
  - 修复 pointer move / endDrag 断点。
  - 把 topbar 迁入中间工作区。
  - active pane 改条件渲染。
  - relative zero node 改回显式 `relativeEnergyZeroNode(...)` 计算。
  - pointer move 改为首帧立即执行 + rAF 节流。
- `web/src/app/appCanvasPointerActions.ts`
  - `handlePointerMoveAction` 从 React PointerEvent 入参改为 `{ pointerId, clientX, clientY }` 原始坐标参数。
- `web/src/app/WorkbenchToolbar.tsx`
  - 包装为 `memo`，继续沿用 toolbar 结构但由 CSS 改成静态工具栏。
- `web/src/app/ReportPanels.tsx`
  - `EnergyTableView` 包装为 `memo`。
- `web/src/app/ProjectRail.tsx`
  - `ProjectRail` 包装为 `memo`。
  - 删除侧栏品牌块。
- `web/src/app/InspectorPanels.tsx`
  - `InspectorPanel` 包装为 `memo`。
- `web/src/app/workbench.css`
  - 增加 `workbench-shell / workspace-topbar` 新布局。
  - 把 toolbar 从 absolute/floating 改为静态行。
  - 表格页改整页铺满 + sticky header。
  - 调整左侧栏去品牌后的顶部留白。
- `web/electron/main.cjs`
  - 桌面 smoke 去掉对可见 `RxnFlow` 文本的依赖，改查结构节点。
  - macOS BrowserWindow 初始化后隐藏 traffic lights。

## 3. 验证结果

通过：

- `python3 -m unittest discover`
- `cd /Users/linsay/Desktop/code/rxnflow/web && npm run test -- --run`
- `cd /Users/linsay/Desktop/code/rxnflow/web && npm run build`
- `cd /Users/linsay/Desktop/code/rxnflow/web && npm run desktop:smoke`
- `cd /Users/linsay/Desktop/code/rxnflow/web && npm run desktop:runtime:smoke`
- `cd /Users/linsay/Desktop/code/rxnflow/web && npm run desktop:pack`

浏览器 smoke（in-app browser, `http://127.0.0.1:5173/`）：

- 中间工作区存在 `.workspace-topbar`，顶部包含 `画布 1` tab、theme、engine、export、左右侧栏开关。
- 顶栏和左侧栏都不再显示 `RxnFlow` / `Reaction canvas` 文案。
- `Table view` 点击后 `aria-pressed` 正确切换，`.table-view-pane` 可见且 `.canvas-view-pane` 未挂载。
- 表格视图截图确认是整页表格，不再是悬浮卡片。
- 浏览器 console 无新增 app 级报错。

打包产物：

- 新桌面包时间：`Jun 18 17:01:59 2026 /Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`

## 4. 遗留事项

- `desktop:pack` 本次因本机缺少 electron 缓存，重新下载了 `electron-v42.4.0-darwin-arm64.zip`；不影响产物，只是耗时较长。
- 目前多画布 tab 仍是运行时态，没有进入项目 schema 的持久化结构；下一步应拆独立 feature 做项目级多画布持久化。
- 3Dmol / Ketcher 带来的大 chunk 与 direct eval warning 仍在，本次未处理。
