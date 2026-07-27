---
doc_type: issue-fix
issue: 2026-07-27-import-issue-dialog-focus
status: fixed
path: fast-track
fix_date: 2026-07-27
tags: [ui, accessibility, keyboard, import, focus]
---

# 导入错误弹窗焦点修复记录

## 1. 修复内容

- Import Issue 出现后自动聚焦 `Close import error`。
- Tab 和 Shift+Tab 在弹窗内的可用控件间循环。
- 弹窗本地处理 Escape，关闭后恢复到弹窗出现前仍存在的焦点元素。
- Import Issue 打开期间暂停工作台单键命令和 `Command/Ctrl+K`。
- 关闭按钮图标标记为装饰内容，避免重复朗读。

## 2. 改动文件

- `web/src/app/App.tsx`
- `web/src/app/App.test.tsx`
- `.codestable/issues/2026-07-27-import-issue-dialog-focus/import-issue-dialog-focus-report.md`
- `.codestable/issues/2026-07-27-import-issue-dialog-focus/import-issue-dialog-focus-fix-note.md`

## 3. 验证结果

- App 定向测试通过：76 项测试覆盖初始焦点、单控件正反 Tab 约束、背景快捷键隔离、Escape 和焦点返回。
- Web 全量测试通过：43 个测试文件、407 项测试。
- Web production build 通过。
- 浏览器通过临时桌面导入失败替身稳定复现 React fallback alertdialog；初始 active element 为 `Close import error`，且 `aria-modal=true`。
- 浏览器验证 Tab 和 Shift+Tab 均留在 Close，`T` 不打开能量表，`Command+K` 不打开 Command Palette。
- 浏览器验证 Escape 关闭后焦点返回 `Import files`；临时测试替身随后已删除并刷新页面。
- `git diff --check` 通过。

## 4. 审计遗留

- Command Palette、Candidate Review、3D/2D Structure dialog 仍需分别补齐焦点生命周期；不混入本次导入错误弹窗定点修复。
