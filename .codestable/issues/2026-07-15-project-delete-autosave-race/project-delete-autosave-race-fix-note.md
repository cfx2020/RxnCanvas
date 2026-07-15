---
doc_type: issue-fix
issue: 2026-07-15-project-delete-autosave-race
path: fast-track
fix_date: 2026-07-15
tags: [renderer, electron, autosave, project-delete, concurrency]
---

# 删除项目后 autosave 迟到响应重新登记修复记录

## 1. 问题描述

项目 A 的 autosave 已经开始后从工作区删除 A，迟到响应仍可能在 renderer 重新记住 A 的目录，并在 Electron main process 重新写入 `projectDirectoriesById` 和 recent projects。删除 active A 触发切换到 B 时，离开项目的 flush effect 还可能再次提交旧 A 快照。

## 2. 根因

autosave 请求只绑定项目 ID，没有绑定该项目的生命周期。删除动作会清理当前 queue/key 和 recent 映射，但已经在途或由切换 effect 持有的旧 input 无法识别自己属于删除前的项目实例。

## 3. 修复方案

- Renderer 为每个项目维护 lifecycle generation，并将 generation 固化到创建时的 `ProjectAutosaveInput`。
- 删除项目时先递增 generation，再清理 queue/key 和本地目录映射；删除前构造的 queued、previous 或 in-flight input 全部自动失效。
- autosave 发送前、响应后和异常处理时均核对 generation；失效响应不再更新 directory、validation、files 或 workspace。
- Electron main process 同样维护 per-project generation；autosave 保存前捕获，forget handler 在目录查找或异步操作前使其失效。
- 失效的 Electron autosave 可以完成已经开始的物理保存，但不得重新登记目录、recent project 或触发 validation。
- 新增 renderer deferred 竞态测试和 Electron lifecycle/handler 契约测试。

## 4. 改动文件清单

- `web/src/app/App.tsx`
- `web/src/app/App.test.tsx`
- `web/electron/main.cjs`
- `web/electron/main-project-state.test.cjs`
- `.codestable/issues/2026-07-15-project-delete-autosave-race/project-delete-autosave-race-fix-note.md`

## 5. 验证结果

- Renderer 删除竞态定向测试通过。
- Electron lifecycle 定向测试通过。
- Web 完整测试通过。
- Electron 全部 CJS 测试通过。
- Web production build 通过。
- Electron desktop smoke 与 packaged runtime smoke 通过。
- `git diff --check` 通过。

## 6. 遗留事项

- 已经进入 `saveProjectContent()` 的物理磁盘写入无法由 response generation guard 取消。删除后立刻重新打开同一目录并编辑时，旧保存仍可能覆盖新快照；若要彻底消除，需要把 project save 改成 generation-aware temporary write + commit。
- `forgetProjectInRuntime()` 当前把 IPC 失败作为 best-effort 静默处理；失败时 recent store 可能仍保留该项目，需要后续增加重试或可见错误状态。
- 当前 UI 使用 `Delete project`，但实际语义是从工作区和 recent 列表移除，不删除磁盘目录。文案应另开 UI issue 统一为 `Remove from workspace/sidebar`。
