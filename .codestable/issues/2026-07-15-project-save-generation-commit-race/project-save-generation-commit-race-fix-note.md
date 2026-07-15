---
doc_type: issue-fix
issue: 2026-07-15-project-save-generation-commit-race
path: fast-track
fix_date: 2026-07-15
tags: [electron, project-store, autosave, sources, concurrency]
---

# 同一工作区旧保存最后覆盖新快照修复记录

## 1. 问题描述

项目删除后快速重新打开同一目录时，删除前已经进入 `saveProjectContent()` 的旧保存和新生命周期保存可能并发执行。新保存如果先完成，旧保存随后仍可覆盖 `project.json` / manifest，并按旧引用集合 prune 新 source，造成状态回退或源文件丢失。

## 2. 根因

Renderer 和 main process 的 lifecycle generation 只在保存响应落地时生效，无法撤销已经开始的磁盘 I/O。`project-store.cjs` 对同一 project directory 没有事务级顺序控制，保存 source、state、manifest 和 prune 可以互相交错；source import 也没有与 project save 共享目录级锁。

## 3. 修复方案

- 为规范化后的 project directory 增加独立保存 tail，同一目录的完整保存事务严格按请求顺序串行执行。
- 锁覆盖 source persistence、project state、project/export manifest 和 orphan source prune，保证较新的请求最后提交。
- 前一次保存失败时释放 tail，后续保存继续执行，不会永久卡死工作区。
- 不同 project directory 使用不同 tail，仍可并行保存。
- source materialization 与 project save 共享同一目录锁，避免旧保存 prune 新导入 source 或读取到正在替换的 source bytes。
- 增加 deferred 顺序、失败恢复、跨目录并行、import 等待和最终磁盘快照测试。

## 4. 改动文件清单

- `web/electron/project-store.cjs`
- `web/electron/project-store.test.cjs`
- `.codestable/issues/2026-07-15-project-save-generation-commit-race/project-save-generation-commit-race-fix-note.md`

## 5. 验证结果

- Project store 定向测试通过：22 tests passed。
- Electron 全部 CJS 测试通过。
- Web production build 通过。
- Electron desktop smoke 与 packaged runtime smoke 通过。
- `git diff --check` 通过。

## 6. 遗留事项

- 读取工作区目前不会等待同目录的在途保存，快速重开时仍可能短暂读取到保存过程中的旧/中间状态；后续应让 read path 等待 save tail。
- `project.json` 和 manifest 仍使用直接 `writeFile`，进程崩溃时缺少 temporary file + atomic rename 保护。
- report artifact manifest 和 archive snapshot 尚未全部纳入同一个目录事务边界，应单独检查导出与 autosave 并发。
