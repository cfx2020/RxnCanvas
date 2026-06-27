---
doc_type: issue-fix
issue: 2026-06-28-narrow-project-rail-hover
status: fixed
severity: medium
tags: [web, responsive, project-rail, sidebar, visual-qa]
fixed_at: 2026-06-28
---

# narrow-project-rail-hover fix note

## 问题

当窗口缩窄时，左侧 project/file rail 会被压成 64px 左右的常驻 icon rail。项目、文件、设置等按钮文字被隐藏或挤压，用户无法辨认当前项目和文件。

## 根因

此前响应式规则在 `max-width: 1180px / 960px` 下把完整 project rail 改成窄 icon rail，并通过 `display: none` 隐藏项目/文件文本。这种模式在极窄窗口下仍占用左侧列宽，却无法提供足够信息密度。

## 修复

- 窄屏下不再保留常驻 icon rail 列；workspace 左列宽度改为 0，让画布/主区域占满。
- project rail 改为固定左侧 hover drawer：
  - 默认只露出 16px 左侧热区。
  - 鼠标 hover 或键盘 focus-within 后滑出完整 rail。
  - 展开后恢复项目、文件、设置文字，保持可读列表。
- 右侧 inspector 的窄屏 overlay 行为保持不变。

## 验证

- `npm --prefix web run test -- App --run` 通过：33 个测试文件、257 个测试。
- `npm --prefix web run build` 通过；仅保留 3Dmol 依赖 direct eval 和大 chunk 既有警告。
- Playwright fallback 浏览器验证 `http://127.0.0.1:5173/`：
  - 390px 宽：默认 rail `x=-270/right=16`，workspace grid 为 `0px 390px 0px`，canvas 从 `x=0` 开始；hover 后 rail `x=0/width=286`。
  - 220px 宽：默认 rail `right=16`；hover 后 rail `x=0/width=192`，项目和文件文字可读。
  - 两个视口均无错误 overlay、无 console error。
