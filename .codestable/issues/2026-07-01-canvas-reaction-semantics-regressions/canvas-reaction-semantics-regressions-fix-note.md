---
doc_type: issue-fix
issue: 2026-07-01-canvas-reaction-semantics-regressions
path: fast-track
fix_date: 2026-07-01
tags: [web, canvas, reaction-path, shortcuts, energy]
---

# 画布反应语义回归修复记录

## 1. 问题描述

explicit reaction path semantics 落地后，用户复测发现两个回归：

- `N2` 标记为 `participant` 且 edge 标记为 `release` 后，释放源节点 `i1N2fix14-tsr` 的相对能量从正确的 `3.83` 变成约 `-68722.46`。
- 按 macOS `Opt` / Windows `Ctrl` 拖动复制节点时，复制出的节点 label 变成 `3 copy`；但这个操作应等价于从左侧文件栏再次拖入同一个 source，保留原 label `3`。
- 两条候选反应路径汇合到同一个 `4b-1` 时，`4b-1` 的相对能量显示成离谱大数；是否把路径边标为 `branch` 不改变该错误。

## 2. 根因

- `release` participant 的能量项被应用到了释放源 path index 本身，导致 N2 的绝对能量被加进 `i1N2fix14-tsr` 的表达式。
- modifier-copy drag 复用了 clipboard paste 逻辑，而 clipboard paste 默认给节点 label 追加 `copy`。
- `addition` / `release` term 按主路径 index 全局累积。两条分叉路径汇合后，另一条候选路径上的 release term 和重复 addition term 会被并入同一个 product 表达式；`branch` 本身只是路径语义/显示分类，不应该也不会作为能量计算开关。

## 3. 修复

- `release` term 改为只作用于释放点之后的 path state，不再影响释放源节点自己。
- `pasteCanvasClipboard()` 增加 `preserveLabels` 选项；modifier-copy drag 使用该选项保留节点 label，普通 `Ctrl/Cmd+C`、`Ctrl/Cmd+V` 粘贴仍保留 `copy` 后缀。
- 相对能量表达式改为沿 path graph 传播 path-local participant context。分叉汇合时选择可完整求值、表达式更小的路径上下文，不再把所有分叉 term 合并到 product。
- 等价 participant term 按 label / formula / charge / spin 归一，只保留能量信息更完整的项；同一 product 汇合处的重复 `Cl` addition 不再重复扣除。

## 4. 验证

- `cd web && npm run test -- --run src/app/appCanvasPointerActions.test.ts src/app/canvasClipboardState.test.ts src/app/energyDisplay.test.ts` 通过，12 个测试通过。
- `cd web && npm run test -- --run src/app/energyDisplay.test.ts src/app/appCanvasPointerActions.test.ts src/app/canvasClipboardState.test.ts src/app/canvasGeometry.test.ts` 通过，22 个测试通过。
- `cd web && npm run test -- --run src/app/energyDisplay.test.ts` 通过，其中新增覆盖分叉汇合到 `4b-1` 时 participant term 保持 path-local 的用例。
- `cd web && npm run build` 通过；仍有既有 3Dmol direct eval 和大 chunk warning。
