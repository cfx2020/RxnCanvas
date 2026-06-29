---
doc_type: issue-fix
issue: 2026-06-28-startup-restore-minimap
path: fast-track
fix_date: 2026-06-28
tags: [frontend, electron, startup-restore, canvas, minimap]
---

# 启动恢复首帧与 minimap 定位修复记录

## 1. 问题描述

打包后的本地 app 启动时先显示内置 `Diels-Alder Study` demo，过一会儿才切换到用户最近的本地 `Ir` 项目；这会让用户误以为本地数据没有恢复。恢复后 minimap/缩放控件还会跑到画布底部之外，底部内容被窗口裁掉。

## 2. 根因

- `App` 初始 state 直接来自 `initialProjects`，`restoreStartupProjectFromRuntime()` 在 React effect 中异步调用 `getStartupProjectContent()`，所以首帧必然先渲染 demo。
- autosave hydration 也在首帧 effect 阶段运行，启动恢复 pending 时不应把 demo 当作已恢复工作区参与 hydration。
- 之前为 macOS double-click zoom 加过一条最大化窗口专用 minimap bottom override，它试图猜测 Dock/窗口安全区；minimap 实际上应该始终相对 `.canvas-view-pane` 的可见区域定位。

## 3. 修复方案

- `restoreStartupProjectFromRuntime()` 增加 `onSettled` 回调，React 可以知道启动恢复已经完成、取消或失败。
- `App` 在桌面端 `getStartupProjectContent()` pending 时显示轻量 `Opening workspace` 状态，不渲染项目栏、文件栏、画布和 demo 数据。
- 启动恢复 pending 时暂停 autosave hydration；恢复完成后以真实项目作为 autosave baseline。
- 移除 macOS maximized 专用 minimap bottom override，改为把 `.minimap-stack` 固定在 `.canvas-view-pane` 右下角，并用 18px 右/下 inset 做验证基准。

## 4. 改动文件清单

- `web/src/app/appRuntimeEffects.ts`
- `web/src/app/App.tsx`
- `web/src/app/App.test.tsx`
- `web/src/app/workbench.css`

## 5. 验证结果

- `npm --prefix web run test -- App.test.tsx --run` 通过 59 项。
- `npm --prefix web run test` 通过 303 项。
- `npm --prefix web run build` 通过。
- `npm --prefix web run desktop:pack` 通过，重新输出 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `npm --prefix web run desktop:release:smoke` 通过。
- `npm --prefix web run desktop:smoke` 通过。
- Playwright 2016x1244 桌面视口验证：`.minimap-stack` 相对 `.canvas-view-pane` 的 `insetRight=18`、`insetBottom=18`，且 `fullyInside=true`。
- Playwright 模拟 Electron maximized class 后重复验证：`insetRight=18`、`insetBottom=18`，且 `fullyInside=true`。
- Playwright 注入 pending desktop startup restore 验证：首帧只显示 `Opening workspace`，`Diels-Alder Study` 和 `Project rail` 均未渲染。

## 6. 遗留事项

构建仍有既有的 3Dmol direct eval warning 和大 chunk warning；与本次启动恢复首帧和 minimap 定位改动无关。
