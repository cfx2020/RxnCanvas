---
doc_type: issue-fix
issue: 2026-07-13-narrow-sidebar-layout
status: verified
path: standard
fix_date: 2026-07-13
related: [narrow-sidebar-layout-analysis.md]
tags: [ui, responsive, sidebar, macos]
---

# 窄屏侧栏布局异常修复记录

## 1. 实际采用方案

采用方案 A：在样式文件末尾建立最终响应式侧栏契约。1180px 以下项目栏自动收起，仅保留 12px 左边缘热区，通过 hover 或键盘 focus 展开；展开后严格复用正常左栏的宽度、内部网格、间距、文字截断和顶部按钮。标签页在抽屉展开时移动到侧栏右侧，避免活动标签肩膀覆盖侧栏。

## 2. 改动文件清单

- `web/src/app/workbench.css`：增加最终窄屏四态、drawer、overlay 和 macOS 安全区规则。
- `web/src/app/App.test.tsx`：增加左右侧栏独立切换及四态组合回归测试。
- `.codestable/issues/2026-07-13-narrow-sidebar-layout/`：记录问题、根因和修复闭环。

## 3. 验证结果

- `cd web && npm run test -- --run src/app/App.test.tsx`：66 项通过。
- `cd web && npm run test`：42 个测试文件、373 项测试通过。
- `cd web && npm run build`：通过。
- `git diff --check`：通过。
- 浏览器在 951px 窄屏验证：212px 项目栏默认位于 `x=-200`，仅余 12px 边缘热区；画布占满可用 grid；左侧标题栏按钮隐藏。
- 浏览器宽屏验证：项目栏恢复完整宽度和正常位置，左侧标题栏按钮恢复显示。
- 浏览器强制 hover 视觉验证：抽屉为 212px，与正常左栏同宽；顶部按钮居中显示；标签页起点为 212px，肩膀不再进入侧栏区域。

## 4. 遗留事项

- `workbench.css` 存在多代重复响应式规则；本次为定点修复，没有扩大为全文件重构。
- Vite 构建仍报告第三方 3Dmol direct eval 和大 chunk 警告，与本 issue 无关。
