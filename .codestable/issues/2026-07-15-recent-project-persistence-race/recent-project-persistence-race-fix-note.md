---
doc_type: issue-fix
issue: 2026-07-15-recent-project-persistence-race
path: fast-track
fix_date: 2026-07-15
tags: [electron, recent-projects, persistence, concurrency]
---

# Recent projects 并发旧状态回写修复记录

## 1. 问题描述

两个 recent-project 状态更新接近发生时，较早的磁盘写入可能较晚完成，并把它保存前捕获的旧 `projectPaths` / `activeProjectPath` 重新写回主进程内存。最终 recent 列表、当前启动恢复项目和磁盘状态可能与用户最后一次操作不一致。

## 2. 根因

`persistRecentProjects()` 允许多个 `saveRecentProjectsState()` 并发运行，并在每个异步写入完成后无条件采用其返回状态。异步完成顺序与用户操作顺序不保证一致，因此旧请求可以覆盖新状态。

## 3. 修复方案

- 使用单一 Promise 队列串行执行 recent-project 状态写入，保证磁盘提交顺序与调用顺序一致。
- 每次入队捕获不可变状态快照，避免后续操作修改当前数组时影响已排队写入。
- 写入完成后只有在内存状态仍与该请求快照一致时才回填规范化结果；如果已有更新状态，则保留新状态等待下一项队列落盘。
- 队列会在前一次写入失败后继续处理后续请求，同时把当前调用的真实失败返回给调用方。
- 新增可控 deferred 写入测试，验证旧写入完成时不能覆盖较新的 active project。

## 4. 改动文件清单

- `web/electron/main.cjs`
- `web/electron/recent-project-persistence.test.cjs`
- `.codestable/issues/2026-07-15-recent-project-persistence-race/recent-project-persistence-race-fix-note.md`

## 5. 验证结果

- recent-project persistence 定向测试通过：3 tests passed。
- Electron 全部 CJS 测试通过。
- Web production build 通过。
- Electron desktop smoke 通过。
- Electron packaged runtime smoke 通过。
- `git diff --check` 通过。

## 6. 遗留事项

- 无。
