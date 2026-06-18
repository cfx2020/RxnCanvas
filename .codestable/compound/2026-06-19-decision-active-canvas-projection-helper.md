---
doc_type: decision
category: convention
date: 2026-06-19
slug: active-canvas-projection-helper
status: active
area: web-workbench
tags: [react, canvas, project-workspace, state, convention]
---

# Active canvas 投影转换逻辑放在纯状态 helper

## 背景

Web Workbench 的项目状态现在包含共享 source files、多个 Canvas Tab 和 active canvas。React 容器组件仍需要把 active canvas 投影成当前可编辑的 `nodes` / `edges` / `barriers` / `viewport` / selection，但项目保存和切换又必须把这个编辑态写回 `ProjectWorkspaceSnapshot.canvases[]`。

如果把这些转换逻辑继续内联在 `App.tsx`，容器组件会同时承担 UI 装配、runtime effect、项目恢复、canvas tab 切换和 project snapshot 归一化，后续 feature 很容易把不同层级的状态 authority 混在一起。

## 决定

项目级 snapshot 与当前 active 编辑投影之间的转换 helper，优先放在 `web/src/app/` 下的纯状态模块中；不要继续内联在容器组件里。

本次多画布持久化中，Canvas Tab runtime state、create/switch transition、Canvas Tab 与 project `canvases[]` 互转落在 `web/src/app/projectCanvasState.ts`；project-level snapshot clone/restore/active canvas resolve 落在 `web/src/app/projectWorkspace.ts`。

## 理由

- 纯 helper 可用无 DOM / 无 React render 的单元测试验证，能直接覆盖“切换画布前保存当前画布、切换后投影目标画布”的核心行为。
- 容器组件只负责把 React state / refs / runtime API 传入 helper，减少继续膨胀 `App.tsx` 的趋势。
- active canvas 是“当前编辑投影”，不是整个项目的 authority；把转换逻辑显式命名并集中放置，有助于防止 source files 被误复制到 canvas 内，或只保存当前画布而丢掉其他 tabs。
- 后续新增 rename/delete/reorder/duplicate canvas 时，可以先扩展状态 helper 的 contract 和测试，再接 UI。

## 后果

- 涉及 Project Workspace Snapshot 与 active canvas 编辑态互转的新代码，应优先检查 `projectCanvasState.ts` / `projectWorkspace.ts` 是否已有合适入口。
- `App.tsx` 不应重新承载大段纯状态转换；如果需要新增 helper，应优先保持无 UI、可测试、输入输出明确。
- 只有与 React lifecycle、DOM refs 或 desktop runtime API 强绑定的部分留在 `App.tsx` 或 app runtime effect 模块中。

## 相关文档

- `.codestable/features/2026-06-18-multi-canvas-persistence/multi-canvas-persistence-design.md`
- `.codestable/features/2026-06-18-multi-canvas-persistence/multi-canvas-persistence-acceptance.md`
- `.codestable/architecture/web-workbench.md`
- `web/src/app/projectCanvasState.ts`
- `web/src/app/projectWorkspace.ts`
