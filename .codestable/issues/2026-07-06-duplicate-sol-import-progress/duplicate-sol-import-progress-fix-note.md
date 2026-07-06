---
doc_type: issue-fix
issue: 2026-07-06-duplicate-sol-import-progress
path: fast-track
fix_date: 2026-07-06
tags: [desktop, import, parser, project-rail, solvation]
---

# 重复导入 sol 后文件进度条不消失修复记录

## 1. 问题描述

批量拖入 `7a-1fix-tsf` 相关 log 后，其他文件解析结束，左侧文件栏只有 `7a-1fix-tsf` 一直显示解析进度条。用户再次拖入同一个 sol log 后，文件组已经显示 gas / sol 配对，但进度条仍然不消失。

## 2. 根因

文件栏进度条按 source display group 判断：只要同组里还有任意 `parse_deferred` / `parse_queued` / `parse_running` 的 staged 文件，就继续显示 progressbar。

当用户在旧 sol parser job 尚未完成时再次导入同名 sol，第二次导入成功后会新增一个 parsed sol，但旧的同名 pending sol 占位不会被移除。因为 `sourceFilesWithImportPlan()` 之前只会清理“同名失败占位”，不会清理“同名 pending 占位被后来的成功结果取代”的情况。同组已经有 parsed gas + parsed sol，所以看起来配对成功；但旧 pending 还藏在同组里，导致 progressbar 一直存在。

## 3. 修复方案

- `sourceFilesWithImportPlan()` 改为按同组 / 同 gas-sol 角色 / 同文件名的 replacement key 找到新导入结果。
- 当新结果已经 resolved（parsed、已落盘，或 parse 明确完成）时，允许它接管旧的同名 pending 占位。
- 如果更早的旧 parser job 之后才返回，而当前同名同组已经有 resolved 文件，则不再把这个 stale 完成结果重新插回文件栏。
- 保留失败占位替换规则，继续覆盖之前的坏 sol / stale placeholder 场景。

## 4. 改动文件清单

- `web/src/app/importWorkspace.ts` — 修正 source 文件合并和 stale parser completion 去重规则。
- `web/src/app/importRegistration.test.ts` — 增加状态层回归，覆盖同名 pending 被后来的成功 sol 替换，以及旧 job 迟到不再回插。
- `web/src/app/App.test.tsx` — 增加文件栏级回归，复现批量导入 gas+sol、旧 sol pending、重复 sol 先解析成功后 progressbar 消失。

## 5. 验证结果

- `cd web && npm run test -- --run src/app/importRegistration.test.ts` 通过，26 项。
- `cd web && npm run test -- --run src/app/App.test.tsx -t "clears grouped file progress"` 通过。
- `cd web && npm run test -- --run src/app/App.test.tsx` 通过，65 项。
- `cd web && npm run test -- --run src/app/importParseJobs.test.ts src/app/importRegistration.test.ts src/app/fileDisplay.test.ts` 通过，46 项。
- `cd web && npm run build` 通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- 浏览器冒烟通过：`http://127.0.0.1:5173/` 能加载 RxnFlow Workbench，项目栏和文件栏正常渲染，当前页面无挂起 progressbar。

## 6. 遗留事项

如果某个 parser job 真的长时间不返回且用户没有再次导入同名文件，本次修复不会改变 engine 超时策略；Electron 主进程已有 `import.preview` 60 秒超时，后续若仍观察到单个 job 超时后不回收，需要另开 issue 检查主进程/renderer IPC 是否有丢回包。
