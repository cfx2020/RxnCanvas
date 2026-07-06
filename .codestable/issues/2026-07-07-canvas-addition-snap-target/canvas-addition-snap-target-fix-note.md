---
doc_type: issue-fix
issue: 2026-07-07-canvas-addition-snap-target
path: fast-track
fix_date: 2026-07-07
tags: [web, canvas, connection-draft, reaction-semantics]
---

# Canvas Addition Snap Target 修复记录

## 1. 问题描述

从一个节点向另一个节点的 addition 小点拖拽连线时，连接预览会被吸附到节点左侧中线的普通 input 点。用户实际想连接到 addition 点，但松手后容易生成普通 path / INT 连接。

## 2. 根因

`canvasConnectionMagnetism` 原来只把每个目标节点的普通 input port 作为磁吸候选，draft 只记录 `snapTargetId`，没有记录被吸住的是普通 input 还是 addition step connector。

同时完成连线时只根据 `connectionDraft.stepRole` 或 DOM 命中的整张节点卡片决定边语义，因此拖到 addition 小点附近也可能被普通 input 语义覆盖。

## 3. 修复方案

- 将连接磁吸候选扩展为普通 input port + addition step connector。
- draft 新增 `snapStepRole: "addition"`，在预览和完成连线阶段一路保留目标 handle 语义。
- 完成 window-level pointer release 时优先使用磁吸目标的 step role；直接落在节点卡片上时也会读取 draft 的 `snapStepRole`。
- 视觉反馈按目标 handle 区分：吸到 addition 时高亮 addition 小点；普通 input 吸附时才高亮中线点。

## 4. 改动文件清单

- `web/src/app/canvasConnectionMagnetism.ts`
- `web/src/app/canvasDragState.ts`
- `web/src/app/appCanvasPointerActions.ts`
- `web/src/app/CanvasWorkspace.tsx`
- `web/src/app/workbench.css`
- `web/src/app/canvasConnectionMagnetism.test.ts`
- `web/src/app/appCanvasPointerActions.test.ts`

## 5. 验证结果

- `cd web && npm run test -- --run src/app/canvasConnectionMagnetism.test.ts src/app/appCanvasPointerActions.test.ts src/app/appCanvasEffects.test.ts src/app/canvasDrawing.test.ts`：通过，23 tests passed。
- `cd web && npm run test -- --run src/app/CanvasWorkspace.test.tsx src/app/canvasEditState.test.ts`：通过，47 tests passed。
- `cd web && npm run test -- --run src/app/App.test.tsx -t "reaction edge|release connector|keyboard-accessible node handles"`：通过，3 tests passed。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 和 chunk size warning。
- 浏览器检查：在 `http://127.0.0.1:5173/` 读取真实画布 DOM，确认目标节点的 addition 点和普通 input 点是两个独立屏幕目标。

备注：`App.test.tsx` 全量当前仍有旧断言失败，失败点集中在左侧栏文件 aria-label 现在包含 sol 状态提示文本，如 `browser-open.log Gaussian, No paired solvation log`；该失败与本次 canvas addition 磁吸修复无关。

## 6. 遗留事项

无。本次只修 addition 目标磁吸和视觉反馈，没有改 reaction energy、step composition 或节点菜单语义。
