---
doc_type: issue-fix
issue: 2026-06-28-file-sol-status-badges
path: fast-track
fix_date: 2026-06-28
tags: [web, project-rail, import, gas-sol, ui]
---

# 文件行 gas/sol 状态指示丢失修复记录

## 1. 问题描述

左侧 Files 列表里，导入单独 gas/source log 后不再显示缺少 sol 的状态指示；节点卡片上的缺 sol 状态灯也容易被后续样式隐藏。用户希望只有缺 sol 时显示灯点，配对后灯点消失，配对状态改为 hover tooltip。

## 2. 根因

`fileDisplay.ts` 仍然计算 `hasGasLog` / `hasSolutionLog`，但 `ProjectFileRow` 已不再渲染 `project-file-phase-badges`；同时后续 rail polish CSS 规则把旧徽标类隐藏了。

## 3. 修复方案

在 `ProjectFileRow` 中只为有 gas 无 sol 的文件行渲染 `has-missing-solution` 灯点，配对文件不渲染可见徽标，只保留原生 title tooltip。补充高优先级 CSS，确保文件行灯点在桌面与窄屏 hover rail 都能显示；节点卡片的缺 sol 灯点放到 DeltaG/节点类型同一行左侧预留列，DeltaG 和类型徽标靠右对齐。

## 4. 改动文件清单

- `web/src/app/ProjectRail.tsx:496` — 从现有 group 字段派生缺 sol 状态和配对 tooltip。
- `web/src/app/ProjectRail.tsx:566` — 文件行仅在缺 sol 时渲染无文字灯点。
- `web/src/app/CanvasWorkspace.tsx:981` — 节点卡片 meta 行按缺 sol 灯点、DeltaG、节点类型的顺序渲染。
- `web/src/app/workbench.css:14121` — 把文件行状态改为缺 sol 灯点，并覆盖节点卡片 meta 行布局。
- `web/src/app/App.test.tsx:653` — 覆盖单独 source drop 的缺 sol 灯点、配对行无灯点和画布节点缺 sol 灯点。

## 5. 验证结果

- `npm --prefix web run test -- App CanvasWorkspace fileDisplay --run` 通过。
- `npm --prefix web run build` 通过；仅保留既有 3Dmol eval 和大 chunk warning。
- `git diff --check` 通过。
- Playwright fallback 验证 `http://127.0.0.1:5173/`：桌面下单独 log 行只有一个 6px 缺 sol 灯点，gas+sol 配对行无灯点但 title 为 `Solvation log paired`；画布节点缺 sol 灯点位于 DeltaG 行左侧预留列，DeltaG 与节点类型靠右对齐；窄屏 hover rail 下缺 sol 文件行灯点仍显示；console/page error 为空。
- 追加节点 meta 行布局验证：桌面 1440x900 与窄屏 430x760 下，`.node-energy-strip.node-card-meta-row` 都为 grid，灯点左偏移 2px，灯点、DeltaG、节点类型同一行且从左到右有序；console/page error 为空。

## 6. 遗留事项

无。
