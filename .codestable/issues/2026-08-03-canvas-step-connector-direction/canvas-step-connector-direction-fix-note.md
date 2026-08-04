---
doc_type: issue-fix
issue: 2026-08-03-canvas-step-connector-direction
status: fixed
path: fast-track
fix_date: 2026-08-03
tags: [canvas, connector, addition, release, edge-routing]
---

# Addition / Release 连接点方向修复记录

## 1. 问题描述

画布的 Addition / Release 曲线端点方向与目标反应图不一致：Addition 原来从普通中点出发并落到目标上方连接点，Release 原来从上方连接点出发并落到目标普通中点，导致曲线交叉且语义难以扫描。调整逻辑后，旧 CSS 又同时保留了 `left` 和 `right`，使两个上方热区实际挤到同一侧。

## 2. 根因

连接草稿、磁吸角色、完成连线逻辑、曲线锚点和 DOM 热区仍按旧的“Addition 是目标角色、Release 是来源角色”建模。改换语义后，多个历史样式层叠只覆盖了目标侧属性，没有清除对侧定位值，最终计算样式同时拥有左右偏移。

## 3. 修复方案

- Addition 改为从加入节点右上连接点出发，落到末端节点左侧中点。
- Release 改为从起始节点右侧中点出发，落到释放节点左上连接点。
- 草稿与磁吸只记录目标 Release 角色；Addition 角色由来源连接点保持，避免目标热区覆盖来源语义。
- 曲线使用右出左入控制柄，连接预览和正式边共享一致端点规则。
- 清理所有连接点 CSS 层叠中的对侧定位值，确保 Addition 只在右上、Release 只在左上。

## 4. 改动文件清单

- `web/src/app/App.tsx`
- `web/src/app/App.test.tsx`
- `web/src/app/CanvasWorkspace.tsx`
- `web/src/app/appCanvasPointerActions.ts`
- `web/src/app/appCanvasPointerActions.test.ts`
- `web/src/app/canvasConnectionMagnetism.ts`
- `web/src/app/canvasConnectionMagnetism.test.ts`
- `web/src/app/canvasDragState.ts`
- `web/src/app/canvasDrawing.ts`
- `web/src/app/canvasDrawing.test.ts`
- `web/src/app/canvasLinkState.ts`
- `web/src/app/workbench.css`

## 5. 验证结果

- 连接方向相关定向测试通过。
- `npm run test`：44 files、425 tests passed。
- `npm run build`：通过。
- 浏览器实拖验证：Release 从 TS 节点右侧中点出发并落到产物节点左上；Addition 热区位于节点右上，Release 热区位于节点左上。
- `npm run desktop:pack` 与 `npm run desktop:release:smoke`：通过。

## 6. 遗留事项

无。本次未改变 Addition / Release 的显式项目数据字段，只修正编辑器中的创建方向、磁吸与绘制。
