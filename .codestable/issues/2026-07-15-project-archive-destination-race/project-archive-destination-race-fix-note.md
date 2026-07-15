---
doc_type: issue-fix
issue: 2026-07-15-project-archive-destination-race
path: fast-track
fix_date: 2026-07-15
tags: [electron, project-store, archive, destination-lock, concurrency]
---

# 不同项目并发导出同一 ZIP 路径修复记录

## 1. 问题描述

两个不同项目同时导出到同一个外部 ZIP 路径时，各自只持有自己的 project directory lock。两个 temporary ZIP 可以并行生成并竞争最终 rename，最终文件由压缩完成速度决定，而不是用户请求顺序；较早请求可能最后覆盖较新导出。

## 2. 根因

项目锁只保护源工作区的一致快照，没有保护共享的输出目标。Archive atomic replace 对单次请求安全，但多个项目对同一 destination 没有共同的串行化 authority。

## 3. 修复方案

- 增加独立 `archiveDestinationTails`，以规范化最终 ZIP 绝对路径作为锁 key。
- Destination lock 覆盖 temporary 创建、完整流式压缩、atomic rename 和失败 cleanup。
- 保持锁顺序为 project snapshot lock → archive destination lock，两层职责分离。
- 同一目标采用 request-order last-write-wins；允许覆盖，但结果稳定为最后一次请求。
- 不同目标使用不同 tail，仍可并行导出。
- Operation 失败后总会释放自己的 turn，后续同目标重试继续执行。
- 新增跨项目同目标 FIFO、最终 ZIP 内容、自动后缀规范化、失败释放、不同目标并行和临时文件清理测试。

## 4. 改动文件清单

- `web/electron/project-store.cjs`
- `web/electron/project-store.test.cjs`
- `.codestable/issues/2026-07-15-project-archive-destination-race/project-archive-destination-race-fix-note.md`

## 5. 验证结果

- Project store 定向测试通过：28 tests passed。
- Electron 全部 CJS 测试通过。
- Web production build 通过。
- Electron desktop smoke 与 packaged runtime smoke 通过。
- `git diff --check` 通过。

## 6. 遗留事项

- Destination key 当前使用 `path.resolve`；大小写不敏感文件系统上的大小写别名或 symlink 别名理论上仍可能指向同一文件却获得不同 key。
- Windows 上替换已经存在的 ZIP 依赖 Node/libuv 的 rename 行为，仍应在 Windows installer/runtime smoke 中增加真实覆盖测试。
