---
doc_type: issue-fix
issue: 2026-06-25-titlebar-drag-region
path: fast-track
fix_date: 2026-06-25
tags: [ui, electron, titlebar, drag-region]
---

# 标题栏高度与拖拽区域修复记录

## 1. 问题描述

用户反馈工作台标签页栏仍偏高，并且 macOS/Electron 桌面壳不像 Codex 那样可以在标题栏空白、侧栏顶部空白和按钮缝隙拖动窗口；只有少数顶部区域可拖，侧边栏和按钮之间的空隙不能拖。

## 2. 根因

RxnFlow 桌面壳使用 `titleBarStyle: hidden`，隐藏原生标题栏后 Electron 不会自动把自定义 DOM 当作窗口拖拽区，必须通过 `-webkit-app-region: drag/no-drag` 显式声明。既有 `workbench.css` 中多次追加了互相覆盖的 app-region 规则，后续紧急修复又把 `.workspace-topbar`、`.project-rail`、`.inspector-panel` 等关键 chrome 容器设成 `no-drag`，导致只有局部 tabbar 或单独 gap 能拖。标题栏视觉高度也仍停在 46px / tab 40px，显得偏厚。

## 3. 修复方案

- 将标题栏全局高度收紧为 40px，标签页高度收紧为 36px，加号按钮收紧为 34px。
- 统一 Electron 隐藏标题栏的拖拽契约：顶栏、标签栏空白、右侧按钮组空隙、左右侧栏顶区设为 `drag`；真实按钮、输入框、标签页本身、浮动工具栏和侧栏内容设为 `no-drag`。
- 侧栏顶区 padding 从 46px 同步到 40px，左右标题栏按钮继续保持 30px 高并统一 top=5px。
- 修复 1100px 以下窄版左侧栏进入 72px 宽时，左侧折叠按钮与第一个标签页重叠的问题，为标签栏增加 72px 左侧预留。

## 4. 改动文件清单

- `web/src/app/workbench.css`

## 5. 验证结果

- 浏览器运行时检查 `getComputedStyle(...).webkitAppRegion`：
  - `.workspace-topbar`、`.workspace-topbar-left`、`.canvas-tab-bar`、`.canvas-tab-list`、`.workspace-topbar-actions`、`.window-action-drag-gap`、`.project-rail`、`.inspector-panel` 为 `drag`。
  - `.canvas-tab-shell`、`.canvas-tab`、`.canvas-tab-add`、`.workspace-topbar-actions > button`、`.left-sidebar-fixed-toggle`、`.project-rail-item`、`.project-rail-main`、`.inspector-panel .node-inspector-stack` 为 `no-drag`。
- 浏览器视觉验证：
  - 1180px：标题栏高度为 40px，标签为 36px，左右按钮 top=5px、高度 30px，对齐正常。
  - 1040px / 980px：窄版左侧栏与左侧折叠按钮不再覆盖第一个标签页。
  - 左侧栏折叠后：触发按钮右边缘 144px，第一个标签页左边缘 154px，保留 10px 间距。
  - inactive tab hover：只有 tab shell 绘制 hover 背景，内部 tab 与 close 背景保持透明，无双层高亮。
- 截图留存：
  - `/tmp/rxnflow-titlebar-compact-final-1180.png`
  - `/tmp/rxnflow-titlebar-compact-final-1040.png`
  - `/tmp/rxnflow-titlebar-compact-final-980.png`
  - `/tmp/rxnflow-titlebar-compact-hover.png`
  - `/tmp/rxnflow-titlebar-compact-left-collapsed.png`
- 命令验证：`cd web && npm run build && npm run test` 通过，32 个测试文件、252 个测试全部通过。

## 6. 遗留事项

- 真实窗口拖动行为依赖 Electron/macOS 原生 hit-test，自动化浏览器只能验证 CSS app-region 映射；最终手感仍建议在打包后的 macOS app 中拖动确认。
