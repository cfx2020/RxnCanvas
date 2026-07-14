---
doc_type: issue-fix
issue: 2026-07-14-strictmode-startup-restore
status: fixed
path: fast-track
fix_date: 2026-07-14
severity: high
tags: [web, electron, startup-restore, react-strict-mode]
---

# StrictMode 启动恢复丢失修复记录

## 1. 问题描述

开发模式启用 React StrictMode 时，应用首次挂载的启动恢复 effect 会经历一次“订阅、清理、重新订阅”。Electron 的启动恢复 payload 是 one-shot 数据；如果首次请求尚未完成就发生清理，第二次订阅重新请求主进程时可能拿不到原 payload，界面会一直停留在启动恢复状态或回不到最近工作区。

## 2. 根因

`web/src/app/appRuntimeEffects.ts` 的 `restoreStartupProjectFromRuntime` 把请求生命周期和单个 React effect 订阅绑定在一起。StrictMode 清理首次订阅后，首次 Promise 仍在运行，但重新挂载会再次调用 `getStartupProjectContent`，没有复用仍在途的 one-shot 请求。

## 3. 修复方案

- 以 `RxnflowDesktopApi` 实例为键，用 `WeakMap` 暂存尚未完成的启动恢复 Promise。
- 同一 desktop API 的多个订阅共享在途请求，Promise 成功或失败 settle 后立即清除缓存，之后仍可发起新的独立请求。
- 每个订阅保留自己的 `canceled` 状态；已清理的订阅不会收到 payload，也不会触发 `onSettled`，仍有效的订阅正常恢复并结束加载状态。
- Electron 主进程的 one-shot 行为保持不变。

## 4. 改动文件清单

- `web/src/app/appRuntimeEffects.ts`
- `web/src/app/appRuntimeEffects.test.ts`
- `web/src/app/App.test.tsx`
- `.codestable/issues/2026-07-14-strictmode-startup-restore/strictmode-startup-restore-fix-note.md`

## 5. 验证结果

- helper 生命周期测试覆盖：在途请求只调用一次、订阅取消相互独立、settle 后缓存清除并允许新请求。
- `<StrictMode><App /></StrictMode>` 集成测试覆盖：启动 payload 只读取一次，最近工作区正常恢复，加载状态正常结束。
- `cd web && npm run test -- src/app/appRuntimeEffects.test.ts src/app/App.test.tsx`：84 项通过。
- `cd web && npm run test`：396 项通过。
- `cd web && npm run build`：通过。
- `git diff --check`：通过。

## 6. 遗留事项

无。本次未改 Electron main one-shot 协议，也未包含其他启动流程优化。
