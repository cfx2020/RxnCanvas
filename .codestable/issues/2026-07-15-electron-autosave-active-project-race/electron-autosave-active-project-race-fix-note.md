---
doc_type: issue-fix
issue: 2026-07-15-electron-autosave-active-project-race
path: fast-track
fix_date: 2026-07-15
tags: [electron, autosave, recent-projects, concurrency]
---

# Electron autosave 迟到后切回旧 active project 修复记录

## 1. 问题描述

项目 A 的 Electron autosave 尚未完成时切换到项目 B，A 保存完成后会把主进程的 `currentProjectId`、`currentProjectDirectory` 和 recent store 的 `activeProjectPath` 切回 A。应用在窗口期关闭时，下次启动可能恢复 A，而不是用户最后选择的 B。

## 2. 根因

`web/electron/main.cjs` 的 `rxnflow:autosave-project-package` handler 在保存完成后无条件调用 `activateProjectDirectory()` 和默认 active 的 `rememberRecentProject()`。autosave 本应只是持久化操作，却同时执行了项目选择操作。

## 3. 修复方案

- autosave 完成后只更新请求项目的 `projectId → projectDirectory` 映射。
- autosave 不再调用 `activateProjectDirectory()`，因此不会改变当前项目。
- `rememberRecentProject()` 支持透传 options；autosave 使用 `{ active: false }`，把项目保留在 recent 列表中但不改变用户选择。
- 新增 main process 状态回归测试，锁定 autosave handler、目录映射和 recent active 语义。

## 4. 改动文件清单

- `web/electron/main.cjs`
- `web/electron/main-project-state.test.cjs`
- `.codestable/issues/2026-07-15-electron-autosave-active-project-race/electron-autosave-active-project-race-fix-note.md`

## 5. 验证结果

- Electron main 定向测试通过：6 tests passed。
- Electron 全部 CJS 测试通过：26 tests passed。
- Web production build 通过。
- Electron desktop smoke 通过。
- Electron packaged runtime smoke 通过。
- `git diff --check` 通过。

## 6. 遗留事项

- `persistRecentProjects()` 的并发写入仍可能发生旧状态后写覆盖；这是 recent store 原子性问题，应作为独立 issue 处理。
