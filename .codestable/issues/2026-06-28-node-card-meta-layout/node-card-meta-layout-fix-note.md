---
doc_type: issue-fix
issue: 2026-06-28-node-card-meta-layout
path: fast-track
fix_date: 2026-06-28
tags: [frontend, canvas, node-card, layout]
---

# 节点卡片状态灯与能量行布局修复记录

## 1. 问题描述

节点卡片底部状态灯占据 DeltaG 行左侧空间，导致 DeltaG 与 INT/TS 徽标被挤压，数值在窄卡片中看不清。右上角折叠结构预览按钮也不再需要。

## 2. 根因

节点卡片仍保留 `structureCollapsed` 本地状态和右上角折叠按钮；底部 meta row 被最新 CSS override 固定为 `32px + 1fr + auto`，状态灯即使只是缺 sol 指示也占用一列，能量 pill 则被 `minmax(0, 1fr)` 和 ellipsis 压缩。

## 3. 修复方案

- 删除节点结构预览折叠交互，结构预览始终显示。
- 把缺 sol 状态灯移动到节点 header actions 的右上角。
- 底部 meta row 按 `DeltaG/DeltaE + 数值`、`×1`、节点类型 pill 的顺序紧凑排列，系数控件不再放在 header。
- 右上角缺 sol 状态灯改为节点卡片内绝对定位，使用同一个 inset 控制 top/right，保证距离上边缘和右边缘等宽。
- 根据 `DeltaG/DeltaE + 数值 + 系数 + 类型徽标` 估算节点最小宽度，避免能量数值被 ellipsis 压掉。

## 4. 改动文件清单

- `web/src/app/CanvasWorkspace.tsx`
- `web/src/app/workbench.css`
- `web/src/app/App.test.tsx`
- `web/src/app/canvasGeometry.ts`

## 5. 验证结果

- `npm --prefix web run test -- App CanvasWorkspace --run` 通过。
- `npm --prefix web run build` 通过。
- Playwright 桌面视口验证：页面加载正常，节点数 6，折叠按钮数量为 0，状态灯位于 `.node-header-actions`，底部 `.node-card-meta-row` 没有状态灯，能量数值 `text-overflow: clip`。
- Playwright 窄屏视口验证：页面加载正常，折叠按钮数量为 0，能量数值未使用 ellipsis。
- 2026-06-28 18:41 追加验证：`npm --prefix web run test` 通过 303 项；`npm --prefix web run build` 通过；Playwright 桌面视口确认 meta row 顺序为 `ΔG -> ×1 -> R/TS/P/INT`，header 内无系数控件，右上灯 top/right inset 均为 19.46px；窄屏视口确认同样顺序，右上灯 top/right inset 均为 16.66px。

## 6. 遗留事项

构建仍有既有的 3Dmol direct eval warning 和大 chunk warning；与本次节点卡片布局改动无关。
