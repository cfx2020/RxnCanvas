---
doc_type: issue-analysis
issue: 2026-06-18-notion-canvas-node-table-polish
status: analyzed
severity: medium
tags: [ui, canvas, node-card, table, minimap, multi-canvas]
---

# Notion-style canvas/node/table polish analysis

## 根因

- 当前顶栏只有 window chrome，画布/表格切换和工具条都在画布浮层里，缺少 Notion 式 page tabs。
- 端口始终显示且位于卡片边缘，edge anchor 虽已靠近边界，但没有根据连接状态/hover 控制显隐。
- 节点卡 footer 同时承担状态灯、Set zero、系数三个主控，导致视觉重且不符合“更多菜单承载低频动作”。
- `MiniMap` pointer move 只更新 draft viewport，commit 时才调用 `onViewportChange`。
- 表格 view 仍处于 `canvas-stage` 点阵背景下，密度和视觉层级像画布卡片而非数据表。
- `autoLayoutFlowNodes()` 只按相对能量排序，不保证选中 zero point 位于最左，且 x 坐标未直接表达相对能量尺度。

## 修复方案

- 加 Notion-style `CanvasTabBar`，上方展示当前 canvas tab 与加号入口；底部保留轻量工具栏，Canvas/Table 切换改为 pill segmented control。
- 节点卡重排：标题区左标题右独立 action buttons；Set zero 移入更多菜单；缺失溶剂化时才显示 warning light；端口按 connected/hover/keyboard active 显隐。
- 增加节点 rename action：更多菜单进入 inline title input，修改 `node.label`。
- Minimap drag 时同步调用 `onViewportChange`，实现实时移动。
- Table pane 使用实体背景，压缩 padding/字号，切换时加 slide/fade motion。
- Auto layout 根据 `energyTableRows(nodes, options, edges)` 的 relative 值布局，baseline zero 放最左。

## 范围说明

多画布完整持久化需要项目 package schema 支持多个 canvas graph。本次先落地顶栏 tab 结构和新增 canvas 的运行时入口；持久化契约应后续拆 feature 完成。
