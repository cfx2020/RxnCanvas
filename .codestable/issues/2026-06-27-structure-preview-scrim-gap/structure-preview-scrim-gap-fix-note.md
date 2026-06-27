---
doc_type: issue-fix
issue: 2026-06-27-structure-preview-scrim-gap
status: fixed
fixed_at: 2026-06-27
severity: low
summary: 结构预览遮罩顶部使用旧 48px chrome 高度，紧凑 titlebar 改为 36px 后留下未覆盖画布白边；已改为跟随 --rxnflow-titlebar-height。
tags: [ui, structure-preview, css, overlay]
---

# structure-preview-scrim-gap fix note

## 现象

打开 Structure Preview 后，弹窗遮罩没有从画布顶部开始覆盖，标题栏下方露出一条浅色/白色边。

## 根因

`web/src/app/workbench.css` 中 `.structure-preview-scrim` 的 `--structure-top-chrome` 仍写死为 `48px`；后续 tabbar/标题栏压缩后实际 `--rxnflow-titlebar-height` 是 `36px`。遮罩伪元素从 48px 开始绘制，而画布从 36px 开始，所以中间留下 12px 未覆盖区域。

## 修复

将 `.structure-preview-scrim` 的 `--structure-top-chrome` 改为 `var(--rxnflow-titlebar-height, 48px)`，让结构预览遮罩和当前标题栏高度保持同源。

## 验证

- 浏览器验证：打开 `http://127.0.0.1:5173/`，打开 Structure Preview 后读取布局，`structure-preview-scrim::before.top = 36px`，与 `.canvas-stage.top = 36px` 对齐；不再有顶部未覆盖间隙。
- 同时确认 `Open 3D structure fullscreen` 按钮不存在。
