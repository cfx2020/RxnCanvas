---
doc_type: issue-fix
issue: 2026-06-25-titlebar-control-overlap
path: fast-track
fix_date: 2026-06-25
tags: [web-workbench, titlebar, sidebar, ui-regression]
---

# 标题栏控制按钮错位与左栏折叠重叠修复记录

## 1. 问题描述

用户截图反馈：左侧栏折叠/展开按钮与右侧三个标题栏按钮的垂直位置不统一；左侧栏折叠后，预览侧栏按钮会压到画布标签页上。

## 2. 根因

`workbench.css` 中标题栏历史覆盖规则分散：左侧固定按钮/折叠 hover 区最终 `top: 8px`，右侧按钮簇最终 `top: 12px`；同时左侧栏折叠后 `.workspace-topbar-left` 未给固定在左上角的 `.project-rail-hover` 预留空间，导致标签页从窗口左侧开始排布并与触发按钮重叠。

## 3. 修复方案

新增后置标题栏控制变量，统一左侧控制和右侧按钮簇的 `top`；在 `.workspace.is-left-collapsed` 状态下给 `.workspace-topbar-left` 增加左内边距，避开折叠侧栏触发按钮。

## 4. 改动文件清单

- `web/src/app/workbench.css:8319-8335` — 新增统一标题栏按钮高度/位置和左栏折叠标签栏预留区规则。

## 5. 验证结果

- 浏览器打开 `http://127.0.0.1:5173/`，折叠左侧栏后量测：`.project-rail-hover` 右边界为 144px，active tab 左边界为 154px，无重叠；左侧按钮与右侧按钮簇 top 均为 8px，按钮高度均为 30px。
- 截图检查：`/tmp/rxnflow-left-collapsed-after-fix.png`。
- `cd /Users/linsay/Desktop/code/rxnflow/web && npm run build && npm run test` 通过。

## 6. 遗留事项

无。
