---
doc_type: issue-fix
issue: 2026-06-25-node-coefficient-badge-alignment
path: fast-track
fix_date: 2026-06-25
tags: [ui, canvas, node-card, typography]
---

# 节点计量系数徽标对齐修复记录

## 1. 问题描述

用户反馈节点卡片右上角计量系数徽标里的 `×1` 看起来不对齐：乘号和数字不在同一视觉中心线上，缩放后显得歪、粗糙。

## 2. 根因

节点卡片的计量系数按钮里，`×` 是一个 `span`，数字是按钮内的匿名文本节点；同时后续 CSS 将按钮压成 32×30 并设置 `line-height: 30px`。这让乘号和数字走不同的 inline/flex 排版路径，基线与光学中心不一致。

## 3. 修复方案

- 在 `CanvasWorkspace.tsx` 中将 `×` 和系数值分别包进明确的 glyph span，并放入统一的 `.node-coefficient-label` 容器。
- 在 `workbench.css` 中让 `.node-coefficient-control-header button` 使用居中的 inline-flex 排版，取消 30px 行高对文字的影响。
- 为乘号和数字统一 `line-height: 1`，数字启用 tabular numeric，并对整体标签做轻微 `translateY(-0.5px)` 光学校正。

## 4. 改动文件清单

- `web/src/app/CanvasWorkspace.tsx`
- `web/src/app/workbench.css`

## 5. 验证结果

- 浏览器截图验证：`/tmp/rxnflow-coefficient-after.png`。
- 浏览器测量验证：`×` 与 `1` 的 glyph center y 均为同一高度，按钮保持原有 `×1` 文本内容。
- 命令验证：`cd web && npm run build && npm run test` 通过，32 个测试文件、252 个测试全部通过。

## 6. 遗留事项

- 无。
