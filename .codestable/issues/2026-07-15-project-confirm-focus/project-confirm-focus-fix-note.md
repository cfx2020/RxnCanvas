---
doc_type: issue-fix
issue: 2026-07-15-project-confirm-focus
status: fixed
path: fast-track
fix_date: 2026-07-15
tags: [ui, accessibility, keyboard, project-rail, focus]
---

# 项目移除确认框焦点修复记录

## 1. 修复内容

- 确认框打开后自动聚焦 `Cancel`，避免默认落在破坏性确认按钮。
- alertdialog 标记为 modal，并让 Tab/Shift+Tab 在 Cancel 与 Remove 两个按钮间循环。
- 确认框内部处理 Escape，阻止全局关闭逻辑抢先执行。
- Escape 或显式 Cancel 后，将焦点恢复到对应项目的操作按钮。
- 确认删除及外部指针关闭不启用焦点恢复，避免抢占用户的新焦点目标。

## 2. 改动文件

- `web/src/app/ProjectRail.tsx`
- `web/src/app/App.test.tsx`
- `.codestable/issues/2026-07-15-project-confirm-focus/project-confirm-focus-report.md`
- `.codestable/issues/2026-07-15-project-confirm-focus/project-confirm-focus-fix-note.md`

## 3. 验证结果

- 项目移除焦点定向测试通过：初始焦点、Tab/Shift+Tab 循环、Escape 关闭及触发按钮焦点恢复均有覆盖。
- 浏览器键盘验证通过：确认框打开后 active element 为 `Cancel`，`aria-modal=true`，焦点始终位于 alertdialog 内。
- 浏览器验证 Shift+Tab 从 Cancel 到 Remove、Tab 从 Remove 返回 Cancel。
- 浏览器验证 Escape 和点击 Cancel 均关闭确认框，并把焦点返回 `Project actions for {project}` 按钮。
- Web 完整测试通过：43 个测试文件、407 项测试。
- Web production build 通过。
- `git diff --check` 通过。

## 4. 顺手发现

> Command Palette、Settings、3D/2D 结构窗口和导入候选等其他 dialog 的焦点进入、约束与返回策略并不统一。该范围超出本次项目确认框定点修复，可后续单独做全局 dialog 无障碍审计。
