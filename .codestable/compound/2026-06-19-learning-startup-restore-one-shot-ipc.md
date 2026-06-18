---
doc_type: learning
track: pitfall
date: 2026-06-19
slug: startup-restore-one-shot-ipc
component: desktop-runtime
severity: medium
tags: [electron, react, startup-restore, ipc, autosave, project-workspace]
---

# Startup restore one-shot IPC 不能绑在会重建的 React effect 上

## 问题

Electron main process 的 startup restore payload 是 one-shot：renderer 第一次调用 `getStartupProjectContent()` 后，main process 会把这批 recent project payload 标记为 consumed。React 侧如果把 restore effect 依赖在会随 state 变化重建的 callback 上，effect cleanup 可能在 payload 返回后、真正 apply restore 前把这次恢复取消掉。

## 症状

打包应用启动时 main process 已经读到了最近工作区，但 renderer 最终回到 demo 项目或空默认状态。后续 autosave 也可能因为 project id 没重新绑定到 project directory，而认为当前项目没有工作区目录。

## 没用的做法

- 只检查 recent-projects store 或 main process startup payload：payload 本身可能没问题，问题发生在 renderer effect lifecycle。
- 只把 restore callback 加进 dependency array：这会让 effect 更容易因 state/callback 更新而 cleanup。
- 只在 renderer 内恢复项目内容，不把 `projectDirectory` 同步回 main process：恢复后 autosave 仍可能找不到 active project 的工作区目录。

## 解法

- startup restore effect 只运行一次，避免 one-shot payload 被多次 effect 生命周期消费。
- 用 `useRef` 保存最新 `restoreProjectPackage` handler，effect 内调用 ref，而不是把易变 callback 直接放进 dependency array。
- restore payload 要携带并透传 `projectDirectory`；renderer 恢复成功后调用 `setActiveProject`，让 Electron main process 重新建立 project id → project directory 映射。

## 为什么有效

one-shot IPC 的消费点保持稳定后，main process payload 不会被一个已经 cleanup 的旧 effect 吞掉。目录绑定回 main process 后，startup restore、Open Recent、Open Folder 和 autosave 使用同一套 active project directory authority，打包应用重启后能继续写回原工作区。

## 预防

凡是 Electron main process 只返回一次的 startup / deep-link / recent / restore payload，renderer 侧都应避免绑定到频繁重建的 callback dependency。优先使用“稳定 effect + latest handler ref”模式，并在 restore 成功后同步 native runtime 的 active resource binding。

## 相关文档

- `.codestable/features/2026-06-18-multi-canvas-persistence/multi-canvas-persistence-acceptance.md`
- `.codestable/architecture/web-workbench.md`
- `web/src/app/App.tsx`
- `web/src/app/appRuntimeEffects.ts`
- `web/electron/main.cjs`
