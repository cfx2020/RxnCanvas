---
doc_type: issue-fix
issue: 2026-07-15-project-export-transaction-boundary
path: fast-track
fix_date: 2026-07-15
tags: [electron, export, artifact, archive, concurrency]
---

# Report artifact 与 archive 导出事务边界修复记录

## 1. 问题描述

报告 artifact 写入、artifact manifest 更新和项目 archive 压缩此前不在 project directory mutation tail 内。autosave、source import 或另一次导出可能在操作中间修改工作区，导致 artifact bytes 与 manifest checksum 不一致，或 archive 内的 `project.json`、manifest 和 source 来自不同时间点。

## 2. 根因

项目状态保存已经具备目录级串行化和原子 metadata 替换，但 `saveProjectReportArtifact()` 直接写 artifact，`exportProjectWorkspaceArchive()` 只在压缩前单独调用一次保存，随后释放目录锁再流式读取整个工作区。

## 3. 修复方案

- Report artifact 的 bytes 写入和 export manifest upsert 放入同一个 project mutation transaction。
- Artifact bytes 使用临时文件原子替换；manifest 继续使用原子替换，并基于实际持久化 buffer 记录 size/sha256。
- Archive export 从可选项目内容保存开始，到完整流式 ZIP 关闭为止始终持有 project directory lock；autosave、import、read 和其他 artifact 操作会等待一致快照完成。
- Archive 先写目标目录中的唯一 temporary file，流关闭后原子替换最终 ZIP；失败时 abort/destroy stream 并清理 temporary。
- 如果 ZIP 目标位于项目目录内，temporary 和既有最终 ZIP 都不会被收入自身快照。
- 新增 artifact 等待/manifest 校验、archive 等待/atomic replace/temporary cleanup 测试。

## 4. 改动文件清单

- `web/electron/project-store.cjs`
- `web/electron/project-store.test.cjs`
- `.codestable/issues/2026-07-15-project-export-transaction-boundary/project-export-transaction-boundary-fix-note.md`

## 5. 验证结果

- Project store 定向测试通过：26 tests passed。
- Electron 全部 CJS 测试通过。
- Web production build 通过。
- Electron desktop smoke 与 packaged runtime smoke 通过。
- `git diff --check` 通过。

## 6. 遗留事项

- 大型 archive 压缩期间会阻塞同一项目的 autosave/import，这是换取严格一致快照的有意行为；后续如需降低阻塞，可在锁内创建稳定 staging snapshot 后解锁压缩。
- 两个不同项目同时导出到同一个外部 ZIP 路径时，目前没有 destination-level lock，最终文件按底层 rename 完成顺序决定。
- Artifact bytes 与 manifest 是顺序原子提交而非单次跨文件事务；进程恰好在两次 rename 之间退出时可能留下 orphan/new bytes + old manifest，校验会报告不一致但不会产生截断文件。
