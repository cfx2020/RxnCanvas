---
doc_type: issue-analysis
issue: 2026-06-18-topbar-fulltable-performance-polish
status: confirmed
severity: medium
tags: [ui, topbar, sidebar, table-view, performance]
---

# Topbar / full-table / performance polish analysis

## 根因

- 当前 `window-bar` 作为全宽顶栏，导致左右侧栏被顶栏切开，形成 T 型结构。
- `CanvasTabBar` 放在画布区内，而不是中间工作区顶栏。
- `WorkbenchToolbar` 仍使用浮动定位和玻璃卡片样式，不符合“静态工具栏”要求。
- `EnergyTableView` 仍用浮动卡片式容器，而非全页数据区布局。
- 画布与表格两个 pane 同时挂载并通过 opacity/transform 切换，导致切换时有额外布局/绘制成本。
- 画布拖动每个 pointermove 都直接写 React state，整棵 App 频繁重渲染；同时大表格和侧栏也会跟随更新，造成卡顿。

## 修复方案

- 把整体工作区改为三列两行：左侧栏与右侧栏贯穿全高，中间列拥有独立 topbar + toolbar + content，不再使用全宽 window bar。
- 顶部中间栏放 canvas tabs；右侧放 theme / engine / export / collapse 控件；移除 `RxnFlow` 顶栏标题和 traffic lights。
- `WorkbenchToolbar` 改为静态工具栏行，不再 absolute/floating。
- `EnergyTableView` 改为占满中间内容区的全页表格布局。
- 视图切换改为条件渲染 active pane，仅挂载当前 view，减少切换开销。
- 对 pointer move 引入 requestAnimationFrame 节流，避免每个原始事件都 setState。
- 为重型侧栏/表格组件增加 memo 边界，减少拖动画布时无关区域重渲染。

## 影响范围

- `web/src/app/App.tsx`
- `web/src/app/WorkbenchToolbar.tsx`
- `web/src/app/ProjectRail.tsx`
- `web/src/app/InspectorPanels.tsx`
- `web/src/app/ReportPanels.tsx`
- `web/src/app/CanvasWorkspace.tsx`
- `web/src/app/appCanvasPointerActions.ts`
- `web/src/app/workbench.css`
- 相关测试与 smoke 脚本
