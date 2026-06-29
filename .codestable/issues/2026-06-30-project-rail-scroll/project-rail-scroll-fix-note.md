---
doc_type: issue-fix
issue: 2026-06-30-project-rail-scroll
path: fast-track
fix_date: 2026-06-30
tags: [frontend, project-rail, layout, scrolling]
---

# 左侧文件栏无滚动条修复记录

## 1. 问题描述

用户在左侧文件栏有大量文件时，列表底部文件被窗口裁掉，侧栏没有可用滚动条，无法继续查看下面的文件。

## 2. 根因

窄窗口 hover drawer 样式为了让侧栏内容完整展开，在 `.workspace:not(.is-left-collapsed) > .project-rail` 上设置了 `overflow: visible !important`。文件列表数量增多时，rail 内容超过 viewport 高度后不会形成自己的滚动容器，底部内容被外层布局裁掉。

## 3. 修复方案

在 `web/src/app/workbench.css` 末尾添加更晚的 project rail 滚动约束，并把文件右键菜单移到 viewport 层：

- `.project-rail` 和窄窗口固定 rail 都使用 `overflow-y: auto`、`overflow-x: hidden`。
- 设置 `min-height: 0` 和 `overscroll-behavior: contain`，让 flex/grid 子项在 rail 内部滚动。
- 添加轻量 scrollbar 样式，保证文件很多时有清晰的滚动入口。
- 文件右键菜单通过 React portal 挂到 `document.body`，保持真正的 viewport fixed，避免被 rail 的滚动和 hover drawer `transform` 裁剪。
- 文件右键菜单的 z-index 提升到 rail hover drawer 之上，避免菜单左侧被侧栏层级盖住。

## 4. 改动文件清单

- `web/src/app/ProjectRail.tsx`
- `web/src/app/workbench.css`

## 5. 验证结果

- `npm --prefix web run test -- App --run` 通过，34 个 test files / 282 个 tests passed。
- `npm --prefix web run build` 通过；仍只有既有 3Dmol direct eval 和 large chunk warning。
- 浏览器验证 `http://127.0.0.1:5173/`，430x360 短视口下 `.project-rail` 为 `overflowY=auto`，`scrollTop` 可从 0 滚到 156；文件右键菜单显示 `Delete file and nodes`，挂载在 `BODY` 下，z-index 为 1810，左右两侧都能命中且未超出 viewport。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/issues/2026-06-30-project-rail-scroll/project-rail-scroll-fix-note.md --require doc_type --require issue --require path` 通过。

## 6. 遗留事项

无。
