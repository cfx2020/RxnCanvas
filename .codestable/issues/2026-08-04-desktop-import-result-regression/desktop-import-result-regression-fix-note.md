---
doc_type: issue-fix
issue: 2026-08-04-desktop-import-result-regression
path: fast-track
fix_date: 2026-08-04
tags: [desktop, import, react-state, concurrency, autosave]
---

# 并发导入单个文件永久停留在解析中修复记录

## 1. 问题描述

一次导入多组 Gaussian gas/sol 日志时，绝大多数文件正常解析，但个别文件会永久显示解析进度，节点保持 `2D pending`。问题文件本身可以被 bundled engine 独立正常解析；项目状态中对应 gas 文件仍是 `parse_deferred`，而同组 sol 文件已完成。

## 2. 根因

侧边栏导入结果按 animation frame 分批回填。每批调用都从 React 最近一次已提交渲染创建项目快照；当连续两批在 React 提交新渲染前完成时，后一批会基于旧快照更新其他文件，从而把前一批已经完成的文件覆盖回 `parse_deferred`。后续 autosave 按回退后的状态保存并清理未引用 source 副本，因此表现为单个文件永久转圈且结构缺失。

## 3. 修复方案

- 在同一桌面导入任务内累计所有已经完成的成功解析结果。
- 每次分帧回填都提交“截至当前的全部完成结果”，而不是只提交当前帧新增结果。
- 保留既有并发解析、同帧批处理、失败占位回滚和最新文件选择行为。

## 4. 改动文件清单

- `web/src/app/App.tsx`
- `web/src/app/App.test.tsx`
- `.codestable/issues/2026-08-04-desktop-import-result-regression/desktop-import-result-regression-fix-note.md`

## 5. 验证结果

- bundled engine 独立解析 `7a-1fix-tsf.log` 与 `7a-1fix-tsf_sol.log` 均成功，确认原始 Gaussian 文件和解析器正常。
- 旧打包 App 在完整 Ni 项目副本中复现：同批 12 个真实 gas/sol 日志导入后，2 个文件超过 90 秒仍是 `parse_deferred`，对应 source 副本已被清理。
- 新增累计导入结果回归测试，确认后一帧只增加新完成文件，不会丢失或回退前一帧结果。
- Web 全量测试：44 个文件、428 个测试通过。
- Electron project-store 测试：30 个测试通过。
- Web production build：通过；保留既有 3Dmol `eval` 和大 chunk warning。
- 修复后源码在完整 Ni 项目副本中导入同批 12 个真实日志，6 秒内全部解析并落盘，无 pending、无缺失 source。
- `npm run desktop:pack` 通过，重新生成未签名 macOS App。
- `npm run desktop:runtime:smoke` 与 `npm run desktop:release:smoke` 通过。
- 新打包 App 再次在完整 Ni 项目副本中导入同批 12 个真实日志，5 秒内 12/12 完成；UI 进度条为 0，project state 无 pending，sources 无缺失。

## 6. 遗留事项

已经保存为 `parse_deferred` 且 source 副本被清理的历史条目无法从项目目录自行恢复，需要删除该条目后重新导入原始日志。
