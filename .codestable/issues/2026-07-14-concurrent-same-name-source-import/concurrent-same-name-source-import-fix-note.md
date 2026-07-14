---
doc_type: issue-fix
issue: 2026-07-14-concurrent-same-name-source-import
status: fixed
path: fast-track
fix_date: 2026-07-14
severity: high
tags: [electron, source-import, concurrency, data-integrity]
---

# 同项目同名源文件原位更新修复记录

## 1. 问题描述

RxnFlow 的项目边界对应独立课题；同一项目内再次导入同名 log，产品语义应当是用新计算结果更新原 source，而不是创建 `-2` 副本。原流程会给重导文件生成新的临时 file ID，完成后同时保留新旧两条记录；节点仍引用旧 ID，同组又出现两个同角色 source，因此节点能量不会刷新。

## 2. 根因

- renderer 没有把项目中既有同名 source 的稳定 `file.id` / `storedPath` 与新的导入 operation 关联起来。
- `sourceFilesWithImportPlan` 只清理失败或 pending 占位，不会让新的 resolved source 原位更新既有 resolved source。
- 节点恢复逻辑只处理 gas/solution 配对能量，单个 log 重导后仍可能保留旧的来源字段。
- 并发重导缺少“后发任务获胜”的 generation，慢的旧任务可能在新任务之后落盘。

## 3. 修复方案

- renderer 按项目内标准化文件名查找既有 source；解析请求继续使用独立 operation ID，但携带既有 `storedPath` 作为更新目标。
- 解析成功后才采用既有稳定 `file.id`，从 files 列表移除临时 placeholder；节点与边继续引用原 file ID。
- Electron 按 `project + normalized filename` 记录 generation，提交前再次检查；旧任务返回 `source_import_superseded`，不会覆盖较新的请求。
- 新文件先复制到目标目录内的唯一临时文件，计算 size/checksum 后再 rename 原位替换；解析失败、复制失败、校验失败或任务过期都会保留旧文件。
- 同一目标路径的提交串行化，因此不会出现交叉写入、半文件或 checksum 对不上实际文件的情况。
- 同名 pending 任务共享确定性目标路径；需要清洗或截断的不同原始文件名会附加 16 位内容哈希，避免安全文件名碰撞导致误覆盖。
- source 更新后刷新所有画布中引用该 file ID 的节点来源字段；保留节点 ID、用户标签、类型、位置、尺寸、手动画结构和连线。

## 4. 改动文件清单

- `web/electron/project-store.cjs`
- `web/electron/project-store.test.cjs`
- `web/electron/smoke.cjs`
- `web/electron/main.cjs`
- `web/src/app/App.tsx`
- `web/src/app/importParseJobs.ts`
- `web/src/app/importParseJobs.test.ts`
- `web/src/app/importWorkspace.ts`
- `web/src/app/importRegistration.test.ts`
- `.codestable/issues/2026-07-14-concurrent-same-name-source-import/concurrent-same-name-source-import-fix-note.md`

## 5. 验证结果

- 同批、独立 IPC 等价并发和错峰顺序重导都使用同一个 `sources/shared.log`，不再生成 `shared-2.log`。
- 回归测试证明同目标写入按请求顺序串行，返回 checksum 对应各自完整版本，最终文件对应最后一次有效更新。
- 回归测试证明旧任务过期且最新任务失败时，项目内旧 source bytes 保持不变。
- renderer 测试证明同名请求携带既有 storedPath，只有成功结果才采用稳定 file ID；失败结果仍保留 operation ID 供 placeholder 回滚。
- workspace 测试证明重导后 files 只保留一份 source，旧 file ID、节点 ID、标签、位置、尺寸和手动画结构保持，能量、方法、分子式、电荷、多重度及 energy table 更新。
- `cd web && node --test electron/*.test.cjs`：20 项通过。
- `cd web && npm run desktop:smoke`：通过。
- `cd web && npm run test`：43 个文件、399 项测试通过。
- `cd web && npm run build`：通过；仅保留既有 3Dmol direct `eval` 与大 chunk 警告。
- `git diff --check`：通过。

## 6. 遗留事项

无。本次规则明确为：同一 RxnFlow 项目内，同名 source 表示同一个计算来源；不同课题通过不同 RxnFlow 项目隔离。
