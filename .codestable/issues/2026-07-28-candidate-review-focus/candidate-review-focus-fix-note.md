---
doc_type: issue-fix
issue: 2026-07-28-candidate-review-focus
status: fixed
path: fast-track
fix_date: 2026-07-28
tags: [ui, accessibility, keyboard, candidate-review, focus]
---

# Candidate Review 模态焦点修复记录

## 1. 问题与根因

Candidate Review 声明了 `aria-modal="true"`，但挂载后焦点仍留在背景，Tab 可以离开弹窗，关闭后也不会返回原入口。Escape 由 App 的 window 监听直接清状态，没有消费事件。异步候选审阅在其他业务模态存在时还会同时渲染，并可能在被遮挡时抢走焦点。

根因位于 `InspectorPanels.tsx` 的 `CandidateReviewSheet` 焦点生命周期缺失，以及 `App.tsx` 对 Candidate Review 的全局 Escape 和无条件渲染。

## 2. 修复内容

- Candidate Review 打开后聚焦 `Close import candidates`，卸载时恢复仍连接的原焦点元素。
- Tab 和 Shift+Tab 只在当前启用的 checkbox/button 间循环。
- 登记开始后若当前焦点所在操作变为 disabled，焦点转移到仍可用的关闭按钮。
- Escape 在弹窗内部阻止默认行为和传播后关闭；删除 App 的 window 级 Escape 监听。
- Settings、Import Issue、3D 或 2D 模态存在时保留候选审阅状态但暂缓渲染，前一弹窗关闭后再显示。
- 用 review id 作为组件 key，避免不同异步审阅复用上一轮焦点生命周期。

## 3. 改动文件

- `web/src/app/InspectorPanels.tsx`
- `web/src/app/InspectorPanels.test.tsx`
- `web/src/app/App.tsx`
- `web/src/app/App.test.tsx`
- `.codestable/issues/2026-07-28-candidate-review-focus/candidate-review-focus-fix-note.md`

## 4. 验证

- Candidate Review 与 App 定向测试通过：2 个测试文件、85 项测试。
- Web 全量测试通过：44 个测试文件、412 项测试。
- Web production build 通过；仅保留 3Dmol direct `eval` 和既有大 chunk 警告。
- 浏览器导入临时双帧 XYZ 后，验证初始焦点为 `Close import candidates`。
- 浏览器验证 Shift+Tab 到 `Register all`、Tab 回到关闭按钮，DOM 中始终只有一个 `aria-modal="true"`。
- 浏览器验证 Escape 关闭后焦点返回原 `Review candidates` 按钮。
- 浏览器控制台无 error/warning；临时 XYZ 已删除。
- `git diff --check` 通过。

## 5. 后续边界

3D Structure 与 2D Editor 的初始焦点、Tab 约束和跨弹窗焦点所有权仍是独立问题，不混入本次修复。
