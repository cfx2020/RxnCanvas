---
doc_type: issue-fix
issue: 2026-07-15-narrow-project-confirm-offscreen
status: fixed
path: fast-track
fix_date: 2026-07-15
tags: [ui, responsive, project-rail, confirmation]
---

# 窄屏项目确认框定位修复记录

## 1. 修复内容

- 窄屏侧栏展开条件增加 `.project-rail-item.has-open-actions`。
- 项目菜单或确认框打开时，即使触发按钮卸载导致焦点丢失，侧栏仍保持 `translateX(0)`。
- 同步保持窄屏标题栏左侧按钮和 canvas tabs 的展开避让状态。
- 关闭弹层后继续沿用原有 hover/focus 自动隐藏行为。

## 2. 改动文件

- `web/src/app/workbench.css`
- `.codestable/issues/2026-07-15-narrow-project-confirm-offscreen/narrow-project-confirm-offscreen-report.md`
- `.codestable/issues/2026-07-15-narrow-project-confirm-offscreen/narrow-project-confirm-offscreen-fix-note.md`

## 3. 验证结果

- 浏览器窄屏验证通过：778px 视口中，侧栏无 hover、无 `:focus-within` 且确认框打开时，`.has-open-actions` 将 rail 保持为 `transform: matrix(..., 0, 0)`。
- 确认框边界为约 `left: 22px`、`right: 338px`，完整位于视口内，内部无横向或纵向溢出。
- 点击取消并等待 260ms 后，确认框消失，侧栏恢复约 12px 边缘热区和负向平移。
- 正常桌面宽度的项目菜单与确认框流程回归通过。
- Web 完整测试通过：43 个测试文件、407 项测试。
- Web production build 通过。
- `git diff --check` 通过。

## 4. 顺手发现

> 确认框打开后没有主动把键盘焦点移动到 alertdialog 或其操作按钮。该问题与本次响应式定位独立，应作为下一项无障碍焦点管理 bug 修复。
