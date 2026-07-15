---
doc_type: issue-fix
issue: 2026-07-15-project-forget-persistence-failure
path: fast-track
fix_date: 2026-07-15
tags: [renderer, electron, recent-projects, project-removal, retry]
---

# Recent Projects 清除失败被静默忽略修复记录

## 1. 问题描述

用户从侧栏移除项目时，renderer 立即删除 UI 项目并 fire-and-forget 调用 `forgetProject`。如果 recent-projects 持久化失败，错误被吞掉，项目虽然暂时从界面消失，但重启后仍会被 startup restore 恢复。主进程还会在持久化前删除 projectId→directory 映射，使后续仅凭 projectId 的重试无法成功。

## 2. 根因

删除 UI 状态和 recent store 持久化没有成功条件；Electron forget handler 也先破坏可重试的目录 authority，再执行可能失败的磁盘写入。IPC payload 不携带 renderer 已知目录，缺少幂等 fallback。

## 3. 修复方案

- Renderer 改为先持久清除 Recent Projects，成功后才从项目列表移除；失败时项目保持可见、可编辑，不产生“假删除”。
- `forgetProjectInRuntime()` 改为 async boolean contract，携带 projectId + projectDirectory，并进行有限退避重试；rejected Promise 和 `{ok:false}` 都视为失败。
- 自动重试耗尽后，当前项目显示明确错误：项目尚未移除，可再次执行删除重试。
- Electron forget handler 先 invalidate 旧 autosave lifecycle，但在 recent 持久化成功前保留目录映射和 current state，保证失败可重试。
- 当 main mapping 缺失时，使用 payload directory 读取项目内容并校验 projectId，作为安全的幂等 fallback。
- Recent 持久化错误返回结构化 `{ok:false, projectDirectory, error}`，不再用未处理 IPC rejection 丢失上下文。
- 新增 helper retry/exhaustion、App 保留项目/再次删除成功和 main handler 顺序契约测试。

## 4. 改动文件清单

- `web/src/app/appRuntimeEffects.ts`
- `web/src/app/appRuntimeEffects.test.ts`
- `web/src/app/App.tsx`
- `web/src/app/App.test.tsx`
- `web/electron/main.cjs`
- `web/electron/main-project-state.test.cjs`
- `.codestable/issues/2026-07-15-project-forget-persistence-failure/project-forget-persistence-failure-fix-note.md`

## 5. 验证结果

- Runtime helper、App 删除失败/重试与 Electron main handler 契约测试通过。
- Web 完整测试通过：43 个测试文件、407 项测试。
- Electron 全部 CJS 测试通过：41 项测试。
- Web production build 通过。
- Electron desktop smoke 与 packaged runtime smoke 通过。
- 浏览器验证通过：普通 Web 模式确认删除后目标项目消失，当前项目保留，控制台无错误。
- `git diff --check` 通过。

## 6. 遗留事项

- `recent-projects.json` 本身仍使用直接 `writeFile`，进程崩溃时缺少 temporary + atomic rename；应作为下一项磁盘一致性修复。
- 当前 UI 文案仍使用 `Delete project`，实际语义是从当前工作区和 Recent Projects 移除，不删除磁盘工作区；应另开 UI 文案修复。
