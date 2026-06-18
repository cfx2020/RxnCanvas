---
doc_type: issue-fix
issue: 2026-06-18-startup-active-workspace-persistence
path: fast-track
fix_date: 2026-06-18
tags: [desktop, workspace, persistence, sidebar]
---

# 桌面端重启后未恢复最后工作区修复记录

## 1. 问题描述

用户在桌面端打开 `/Users/linsay/Documents/chemistry/Ir` 项目并确认可用后，关闭 app 再打开，界面又回到内置的三个 demo / placeholder 项目，无法稳定保留上次打开的工作区状态。同时用户希望新建项目默认从 Documents 选目录，并将项目侧边栏入口改成 Codex 式“新建空白项目 / 使用现有文件夹”菜单。

## 2. 根因

- 桌面端只保存 recent project 列表，没有单独保存“最后激活的工作区”。启动恢复依赖 recent 顺序推断，用户在多个项目间切换或从 UI 移除项目时，主进程无法可靠知道最后 active 的项目。
- UI 侧删除项目只修改 renderer 内存状态，没有通知 Electron 从 recent store 移除对应工作区；重启后 recent store 仍可能把已从侧边栏移除的工作区恢复回来。
- recent store 里可能混入旧的托管 runtime-smoke 项目或 legacy `.rxnflow.json` 文件。当前产品模型已切换成 Codex/VS Code 式工作区文件夹，这类旧条目不应作为桌面启动工作区自动恢复。
- 创建项目的系统目录选择器没有设置 `defaultPath`，不会默认打开 Documents。

## 3. 修复方案

- 扩展 Electron recent store 为 `{ activeProjectPath, projectPaths }`，保留旧数组 / 旧对象格式兼容读取。
- 启动恢复时按“旧工作区在前、active 工作区最后”的顺序恢复多个真实工作区文件夹，active 项目最终被选中；同时跳过并清理旧托管项目和非工作区文件条目。
- 新增 renderer → Electron IPC：`setActiveProject` 在项目切换时持久化最后 active 工作区，`forgetProject` 在侧边栏移除项目时清理 recent store。
- 新建 / 打开项目文件夹的桌面系统对话框默认打开 `app.getPath("documents")`。
- 将 ProjectRail 的项目区入口改成 Codex 风格的加号菜单，提供 “New blank project” 和 “Use existing folder”，并把危险的 “Delete project” 文案改为更准确的 “Remove from sidebar”。

## 4. 改动文件清单

- `web/electron/recent-projects.cjs`：新增 active project state 的读写、记录、移除工具，兼容旧 recent store。
- `web/electron/main.cjs`：启动恢复使用 active 工作区；新增 `rxnflow:set-active-project` / `rxnflow:forget-project`；Documents 默认目录；清理非工作区启动项。
- `web/electron/preload.cjs`：暴露新增 IPC 给 renderer。
- `web/electron/smoke.cjs`、`web/electron/runtime-smoke.cjs`：覆盖 active recent store 和 startup restore。
- `web/src/app/appRuntimeEffects.ts`、`web/src/app/App.tsx`：项目切换 / 移除时通知桌面端持久化状态。
- `web/src/app/ProjectRail.tsx`、`web/src/app/workbench.css`：Codex 式项目加号菜单与移除文案 / 样式。
- `web/src/app/App.test.tsx`、`web/src/app/appRuntimeEffects.test.ts`：更新 UI 入口断言并覆盖新增 runtime persistence helper。

## 5. 验证结果

- `python3 -m unittest discover`：通过，21 个 Python 测试。
- `cd web && npm run test`：通过，29 个测试文件 / 232 个前端测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol eval 与大 chunk 构建 warning。
- `cd web && npm run desktop:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，生成 `web/release/mac-arm64/RxnFlow.app`。
- `cd web && npm run desktop:runtime:smoke`：通过，packaged runtime smoke OK。
- 浏览器实际 smoke：通过，验证 `Workspace actions` 加号菜单、`New blank project` 创建流程与深色模式切换无白屏/无 console error。
- 额外 packaged active-restore 调试：用临时 userData 启动时可恢复 `/Users/linsay/Documents/chemistry/Ir` 和 `/Users/linsay/Documents/chemistry/Ni`，并会清理旧 managed/runtime 与 legacy json recent 条目；进一步 active 切换自动化受当前用户已有 packaged RxnFlow 进程影响，未强杀用户进程。

## 6. 遗留事项

- 当前侧边栏已实现 Codex 式项目菜单；按父目录分组显示（如 screenshot 中 `code` / `chemistry` / `CentOS7`）还需要在 renderer 保留 workspace path 元数据，建议后续作为独立 UI feature 处理。
