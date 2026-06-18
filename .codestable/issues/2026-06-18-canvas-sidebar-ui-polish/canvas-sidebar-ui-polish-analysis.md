---
doc_type: issue-analysis
issue: 2026-06-18-canvas-sidebar-ui-polish
status: analyzed
severity: medium
tags: [ui, canvas, inspector, desktop]
---

# Canvas/sidebar UI polish analysis

## 根因

1. 当前 `ReactionNodeCard` 同时展示 kind 全称、结构预览、绝对气相/溶液能和相对能，信息层级不清。
2. 节点 source/solvation 状态只用 `nodeFooterText` 文本表达，缺少 compact status indicator。
3. `canvasDrawing.ts` 的 edge label 使用简单几何中点，barrier 只画单向 markerEnd，和用户期望的线段锚点/双箭头/虚线引导不一致。
4. `InspectorPanel` 用 Node/Source/Export 三 tab，把 source 和 export 都塞进右栏；不符合当前工作区侧边栏 + 浮动 export 的布局。
5. `MiniMap` 是左下角大卡片，只支持 pointer commit，不支持 wheel/trackpad 直接移动画布。
6. `WorkbenchToolbar` 仍保留 Import/Project/Export 文本按钮，与 ProjectRail 和 Codex 风格浮动入口重复。

## 修复方案

- 节点卡改为 compact chemistry card：kind 缩写、q/m、电荷多重度、相对能量 `ΔG/ΔE`、source/solvation 指示灯；绝对能量移到 Node panel。
- Edge/barrier geometry 以端口锚点和 Bezier 路径点为准，标签贴近路径中点；barrier 使用 marker-start + marker-end 双箭头，虚线 guide 对齐节点端口。
- Inspector 删除 Source/Export tabs；Node panel 内嵌 source metadata + 外部打开 raw log 动作；Export 改 canvas 右上角 floating panel。
- Toolbar 删除 Import/Project，合并 zoom controls，Export 右上角 icon trigger。
- Minimap 改右下角轻量卡片，增加 wheel handler。
- 同步 Electron preload/main 暴露安全的 storedPath/sourcePath external-open API。
