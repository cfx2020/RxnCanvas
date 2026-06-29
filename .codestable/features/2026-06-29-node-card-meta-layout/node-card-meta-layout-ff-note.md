---
doc_type: feature-ff-note
feature: node-card-meta-layout
date: 2026-06-29
requirement:
tags: [frontend, canvas, node-card]
---

## 做了什么

调整节点卡片信息行布局：把化学计量系数控件放回标题右侧，底部保留 `ΔG` 和节点类型标记，让能量值随节点宽度自适应。

## 改了哪些

- `web/src/app/CanvasWorkspace.tsx` — 将 coefficient control 从底部 meta 行移到标题行，并用新宽度估算保持 `ΔG` / type 行可读。
- `web/src/app/workbench.css` — 更新节点 header、coefficient control、status light 和底部 meta row 布局。
- `web/src/app/App.test.tsx` — 更新节点卡片布局断言，确认 `×1` 不再占用底部 `ΔG` / `INT` 行。

## 怎么验证的

随同本轮 UI 回归跑过 `npm --prefix web run test -- ReportPanels App --run` 和 `npm --prefix web run build`。浏览器验证 Energy Table 时未发现 console error/warn；节点布局变更由 App 回归断言覆盖。
