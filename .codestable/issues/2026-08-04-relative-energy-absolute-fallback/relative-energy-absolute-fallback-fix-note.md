---
doc_type: issue-fix
issue: 2026-08-04-relative-energy-absolute-fallback
path: fast-track
fix_date: 2026-08-04
tags: [web, relative-energy, hartree, reaction-path]
---

# 连线后相对能量回退为绝对能量修复记录

## 1. 问题描述

未连线时，节点卡片按同一零点显示相对 `ΔG`。补上一条普通路径线后，部分未参与该路径的节点显示类似 `-960075.08` 的数值，实际是 Hartree 绝对能量被换算成了 kcal/mol；相对能量不应因为画布连线而切换成绝对能量。

## 2. 根因

普通路径建立后，路径起点会使用空表达式表示相对零点。路径内节点使用“节点能量 - 路径起点能量”的表达式，但保持 `standalone` 角色的节点仍直接使用自身能量，并把空表达式的计算结果 `0` 当作基线，因此把绝对 Hartree 值直接渲染成了相对 `ΔG`。

## 3. 修复方案

- 当路径零点是空表达式时，`standalone` 节点改为减去零点节点自身能量。
- 自动选择零点和用户手动指定零点使用同一套处理规则。
- 已经属于断开路径片段、无法从当前零点推导的节点继续显示 `pending`，不跨路径拼接化学能量。
- 相对能量表同步使用修正后的基线表达式，避免表格和画布显示不一致。

## 4. 改动文件清单

- `web/src/app/energyDisplay.ts`
- `web/src/app/energyDisplay.test.ts`
- `.codestable/issues/2026-08-04-relative-energy-absolute-fallback/relative-energy-absolute-fallback-fix-note.md`

## 5. 验证结果

- 定向测试：`energyDisplay.test.ts` 8 个测试通过。
- Web 全量测试：44 个文件、426 个测试通过。
- Web production build：通过；保留既有 3Dmol `eval` 和大 chunk warning。
- 浏览器验证：刷新 `http://127.0.0.1:5173/` 后，已有画布保持相对 `ΔG` 显示；断开路径片段继续显示 `pending`，不会显示约 `-960000` 的绝对能量。

## 6. 遗留事项

无。本次只修复相对能量基线回退，不改变 Addition / Release / participant 路径语义。
