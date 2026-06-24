---
doc_type: issue-fix
issue: 2026-06-25-inactive-tab-hover-layers
path: fast-track
fix_date: 2026-06-25
tags: [web-workbench, titlebar, canvas-tabs, ui-regression]
---

# 未激活标签页 hover 双层高亮修复记录

## 1. 问题描述

用户截图反馈：鼠标滑到未打开的标签页时，标签文字区域出现一层高亮，移动到 `×` 关闭按钮又叠出另一层高亮，视觉上像两个胶囊叠在一起。

## 2. 根因

`workbench.css` 里未激活 tab 外层 `.canvas-tab-shell:not(.is-active):hover` 已经绘制整块 hover state layer；同时早期规则还让内部 `.canvas-tab:hover` 和 `.canvas-tab-close:hover` 各自绘制背景，因此 hover 从标题移动到关闭按钮时产生双层/多层圆角背景。

## 3. 修复方案

保留外层 tab shell 作为唯一 hover 背景；将未激活 tab 内部标题按钮和关闭按钮在 hover/focus-visible 下的背景重置为 transparent，只保留文字/图标颜色反馈，并同步处理 dark theme。

## 4. 改动文件清单

- `web/src/app/workbench.css:8337-8362` — 新增未激活 tab 内部 hover 背景清理规则，避免标题和 `×` 再绘制第二层 hover 胶囊。

## 5. 验证结果

- 浏览器打开 `http://127.0.0.1:5173/`，创建第二个 canvas tab 后 hover 未激活 tab 标题和关闭按钮：外层 shell 背景为 `rgba(68, 87, 103, 0.075)`，内部 `.canvas-tab` 与 `.canvas-tab-close` 背景均为 transparent。
- 截图检查：`/tmp/rxnflow-inactive-tab-hover-cleanup.png`。
- `cd /Users/linsay/Desktop/code/rxnflow/web && npm run build && npm run test` 通过。

## 6. 遗留事项

无。
