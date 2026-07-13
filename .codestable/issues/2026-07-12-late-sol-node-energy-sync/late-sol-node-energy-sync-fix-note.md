---
doc_type: issue-fix
issue: 2026-07-12-late-sol-node-energy-sync
path: fast-track
fix_date: 2026-07-12
tags: [web, canvas, import, solvation, energy-sync]
---

# 后补溶剂相文件时节点能量不更新修复记录

## 1. 问题描述

先用气相 log 创建并连接节点，之后再导入同结构的 sol log。左侧文件栏已显示气相/溶剂相配对，但已有节点的 ΔG 保持旧值，必须删除并重新创建节点才会更新。

## 2. 根因

文件栏配对状态直接从最新 `files` 派生，而节点能量来自创建节点时复制到 `FlowNode` 的快照。`projectWorkspaceWithImportPlan` 合并后导入文件时只更新文件列表并追加新节点，没有用新的 gas/sol 配对结果刷新已有节点。

## 3. 修复方案

导入计划合并完成后，对所有画布中带 `sourceFileId` 的节点按结构文件组重新核对。项目打开或切换时也执行同一核对，以自动修复已经保存的旧快照。仅在同组恰好存在一个可用气相文件和一个已解析溶剂相文件时刷新节点的气相/溶剂相能量、能量表和 solvent；节点 ID、标签、位置、尺寸、连线、修正项和手动结构保持不变。解析失败或配对不明确时不更新。

## 4. 改动文件清单

- `web/src/app/importWorkspace.ts` — 导入文件合并后刷新所有画布中已有节点的 source-derived 能量字段。
- `web/src/app/App.tsx` — 应用项目快照和项目切换时自动修复已保存的 stale paired nodes。
- `web/src/app/importRegistration.test.ts` — 覆盖后补 sol 原地更新、跨画布同步及失败 sol 不误更新。

## 5. 验证结果

- `cd web && npm run test`：42 个测试文件、372 项测试通过。
- `cd web && npm run build`：通过。
- 浏览器刷新后工作台正常渲染，控制台无 error。
- 回归测试确认节点 ID、布局、连线和手动结构不变，`energySolution` 与 `gsolHartree` 自动更新。

## 6. 遗留事项

无。
