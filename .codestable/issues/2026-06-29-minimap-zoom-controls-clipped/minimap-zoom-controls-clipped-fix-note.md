---
doc_type: issue-fix-note
status: implemented
date: 2026-06-29
slug: minimap-zoom-controls-clipped
issue: Minimap zoom controls are clipped below the visible canvas after macOS window zoom
scope: web renderer CSS, packaged desktop app asar refresh
---

# minimap-zoom-controls-clipped 修复记录

## 背景

用户截图显示 macOS 窗口铺满屏幕后，画布右下角 minimap 仍可见，但放大 / 缩小控件消失在窗口底部附近。

## 根因

两个布局问题叠加：

1. 历史 CSS 给 `.app-shell` / `.workspace` / `.canvas-stage` 设置了较大的 `min-height`，并且 `.workspace` 的隐式 grid row 默认按内容最小尺寸撑开。窗口较矮或 macOS Dock 占用底部空间时，`.workbench-shell` 和 `.canvas-view-pane` 的实际布局底部会超过可视 viewport。
2. `.minimap-stack` 原本是 column 排列，zoom controls 在 minimap 下方。底部被裁剪时，最先消失的就是放大 / 缩小控件。

## 修复

- 在最终覆盖层取消 app / workspace / canvas stage 的旧 `min-height` floor。
- 给 `.workspace` 增加 `grid-auto-rows: minmax(0, 1fr)`，允许 workbench shell 收缩到真实窗口高度。
- 给 `.workbench-shell` 明确 `height/max-height: 100%`。
- 将 `.minimap-stack` 改为 `column-reverse`，让 zoom controls 位于 minimap 上方；即使底部空间紧张，也优先保留可操作的缩放控件。

## 验证

- `npm --prefix web run test -- App.test.tsx --run`：通过，59 tests。
- `npm --prefix web run build`：通过；仍有既有 3Dmol direct `eval` 和大 chunk warning。
- Playwright 几何验证 `http://127.0.0.1:5173/`：
  - 675×455：窄屏隐藏 minimap，但 zoom controls 位于 viewport 内，点击 `Zoom in` 后 58% -> 65%。
  - 1440×455：minimap 与 zoom controls 整组位于 viewport 内，zoom controls 在 minimap 上方，点击 `Zoom in` 后 58% -> 65%。
  - 1440×760 + 模拟 macOS zoomed class：整组位于 viewport 内，点击 `Zoom in` 后 72% -> 81%。
- `node web/electron/release-smoke.cjs`：通过。
- `node web/electron/smoke.cjs`：当前受限沙箱下未通过，原因是 PyInstaller onefile runtime 创建 sync semaphore 被系统拒绝：`semctl: Operation not permitted`。同一个 release app 内的 bundled engine 文件存在，且前一次非受限打包 smoke 已通过。

## 打包说明

当前受限沙箱阻止了完整 `desktop:pack` 的三个外部依赖步骤：

- `desktop:icons` 中 Playwright headless Chromium 注册 macOS Mach port 被拒绝。
- `desktop:engine` 中 `uv` 访问用户级 `~/.cache/uv` 被拒绝。
- `electron-builder` 尝试访问 GitHub 下载 Electron 时网络受限。

因此本次复用已有图标、已有 bundled engine、已有 Electron app 容器，重新 build 前端后直接刷新 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/Resources/app.asar`。刷新时间：2026-06-29 13:03:00。
