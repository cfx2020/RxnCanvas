---
doc_type: issue-fix
issue: 2026-07-15-project-state-atomic-read-write
path: fast-track
fix_date: 2026-07-15
tags: [electron, project-store, atomic-write, project-read, crash-safety]
---

# 项目状态读取中间态与非原子写入修复记录

## 1. 问题描述

工作区正在保存时快速重新打开，读取逻辑可能在 source、manifest 和 `project.json` 尚未全部更新时读到旧或中间状态。权威 JSON 和 manifest 使用直接 `writeFile`，进程异常退出时还可能留下截断文件。

## 2. 根因

前一项只串行化了写操作，read path 没有加入同一 project mutation tail。metadata 文件也直接覆盖 live path，没有先生成完整临时文件再原子替换。

## 3. 修复方案

- 目录项目和 standalone JSON 的读取都加入对应 mutation tail；读取与已有写入按顺序执行，读取期间后续写入也会等待。
- standalone JSON 保存同样加入 path-level tail，避免并发保存完成顺序颠倒。
- 新增同目录临时文件写入 helper：完整写入隐藏 temporary file 后使用 rename 原子替换 live file，失败时清理 temporary。
- `.rxnflow/project.json`、workspace manifest、export manifest 和 standalone project JSON 全部使用原子替换。
- 保存顺序调整为先写派生 manifests，再最后原子提交权威 `project.json`；提交后再 prune orphan sources。崩溃时最多保留多余文件，不会让权威状态引用尚未提交的 manifest。
- 新增 read 等待、原子替换成功和替换失败清理测试。

## 4. 改动文件清单

- `web/electron/project-store.cjs`
- `web/electron/project-store.test.cjs`
- `.codestable/issues/2026-07-15-project-state-atomic-read-write/project-state-atomic-read-write-fix-note.md`

## 5. 验证结果

- Project store 定向测试通过：24 tests passed。
- Electron 全部 CJS 测试通过。
- Web production build 通过。
- Electron desktop smoke 与 packaged runtime smoke 通过。
- `git diff --check` 通过。

## 6. 遗留事项

- 多个 metadata 文件仍不是单次跨文件原子事务；当前以 `project.json` 作为最后的权威提交点，manifest 可由其重建。
- report artifact 的二进制文件写入和 archive 导出快照尚未完全加入统一 mutation transaction，需要后续单独加固。
