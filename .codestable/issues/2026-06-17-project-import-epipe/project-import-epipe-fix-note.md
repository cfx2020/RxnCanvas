---
doc_type: issue-fix
issue: 2026-06-17-project-import-epipe
path: fast-track
fix_date: 2026-06-17
tags: [electron, project-open, engine-bridge, epipe]
---

# 大型 .rxnflow.json 项目导入触发 Electron main process EPIPE 修复记录

## 1. 问题描述
用户在 Electron 桌面端导入 `/Users/linsay/Downloads/ir-screening.rxnflow.json` 时，界面弹出 “A JavaScript error occurred in the main process”，错误为 `Uncaught Exception: Error: write EPIPE`。
该项目包约 22MB，包含 16 个真实 Ir source/node，部分 file preview 保存了 MB 级 Gaussian log 文本。

## 2. 根因
`web/electron/main.cjs` 打开项目后会调用 `project.validate` 校验 project content；对大型 `.rxnflow.json`，main 会把完整 JSON content 发给 `web/electron/engine-bridge.cjs`。
`engine-bridge.cjs` 原先直接 `child.stdin.end(JSON.stringify(request))`，没有监听 `child.stdin` 的 `error` 事件；当 Python engine 在写入期间提前退出或管道断开时，Node 触发 `write EPIPE` 且未被 promise 捕获，最终冒泡成 Electron main process uncaught exception。

## 3. 修复方案
- 在 `engine-bridge.cjs` 为 `child.stdin` 增加 `error` handler，并在 `stdin.end(..., callback)` 中处理写入失败，返回结构化 `engine_write_failed`。
- 将 `engine_write_failed` 纳入 embedded engine fallback 条件，避免 Python stdin 写入失败时中断用户流程。
- 在 `main.cjs` 对超过 1MB 的 project validation payload 使用 `preferEmbedded`，避免大型 project JSON 通过 Python stdin 传输。
- 在 `desktop:smoke` 增加“假 engine 立即退出 + 大 payload validate”的 broken-pipe fallback 回归测试。

## 4. 改动文件清单
- `web/electron/engine-bridge.cjs` — 捕获 stdin `EPIPE`/写入失败并 fallback 到 embedded engine。
- `web/electron/main.cjs` — 大 project content validation 改走 embedded engine。
- `web/electron/smoke.cjs` — 增加 engine write failure fallback smoke。

## 5. 验证结果
- 手动模拟 broken pipe：`RXNFLOW_ENGINE_COMMAND="node /tmp/rxnflow-exit-engine.cjs"` 调用 `project.validate` 大 payload，返回 embedded validation 和 `python_engine_unavailable: write EPIPE` warning，进程不崩溃。
- 浏览器项目包导入 smoke：打开 `/Users/linsay/Downloads/ir-screening.rxnflow.json`，恢复 `Ir screening` 项目、16 个节点、OpenChemLib 2D SVG，无 console error；截图 `/tmp/rxnflow-ir-project-open.png`。
- 自动验证通过：`npm run test`、`npm run build`、`npm run desktop:smoke`、`npm run desktop:runtime:smoke`、`npm run desktop:pack`、再次 `npm run desktop:runtime:smoke`。

## 6. 遗留事项
Vite build 仍有 3Dmol direct `eval` 与 3Dmol/OpenChemLib chunk size warning；与本次 EPIPE 无关，不阻塞项目导入修复。
