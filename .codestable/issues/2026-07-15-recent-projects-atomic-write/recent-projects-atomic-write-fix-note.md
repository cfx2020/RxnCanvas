---
doc_type: issue-fix
issue: 2026-07-15-recent-projects-atomic-write
status: fixed
path: fast-track
fix_date: 2026-07-15
tags: [electron, persistence, recent-projects, atomic-write]
---

# Recent Projects 原子写入修复记录

## 1. 根因

`saveRecentProjectsState()` 直接覆盖 `recent-projects.json`。进程异常退出或写入失败可能留下截断 JSON，后续加载会回退为空 Recent Projects 状态。

## 2. 修复方案

- 在目标文件同目录生成唯一临时文件。
- 先完整写入临时文件，再通过 `rename` 原子替换 live JSON。
- 无论写入或替换成功失败，都清理临时文件。
- 保持现有函数签名、状态规范化、错误传播和主进程写入队列不变。

## 3. 改动文件

- `web/electron/recent-projects.cjs`
- `web/electron/recent-projects.test.cjs`
- `.codestable/issues/2026-07-15-recent-projects-atomic-write/recent-projects-atomic-write-report.md`
- `.codestable/issues/2026-07-15-recent-projects-atomic-write/recent-projects-atomic-write-fix-note.md`

## 4. 验证结果

- 新增 3 项原子持久化测试通过：正常替换、替换失败保留旧文件并清理临时文件、首次创建嵌套存储目录。
- Electron 全部 CJS 测试通过：44 项测试。
- Electron desktop smoke 通过。
- `git diff --check` 通过。

## 5. 边界

- 本修复保护 Recent Projects 元数据，不改变或迁移任何 `.rxnflow` 项目和源文件。
- 原子替换不等同于断电级 `fsync`；本次只修复直接覆盖导致的半截 JSON 风险。
- 多个独立 Electron 进程同时运行仍采用最后一次成功替换的状态；单进程内顺序继续由现有 Promise 队列保证。
