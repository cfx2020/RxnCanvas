---
doc_type: issue-report
issue: 2026-07-15-project-confirm-focus
status: confirmed
severity: medium
path: fast-track
tags: [ui, accessibility, keyboard, project-rail, focus]
---

# 项目移除确认框未接管键盘焦点

## 1. 现象

通过项目操作菜单打开 `Remove from sidebar` 确认框后，触发菜单项立即卸载，浏览器焦点回落到页面主体。键盘用户无法直接感知确认框出现，也不能从安全操作开始继续操作。

## 2. 复现步骤

1. 使用键盘或辅助技术打开某个项目的操作菜单。
2. 激活 `Remove from sidebar`。
3. 检查当前焦点元素。
4. 按 Escape 关闭确认框并检查焦点返回位置。

## 3. 期望行为

- 确认框出现后自动聚焦非破坏性的 `Cancel` 按钮。
- Tab 与 Shift+Tab 在确认框的两个操作按钮之间循环，不落到背景界面。
- 在确认框内按 Escape 或点击 Cancel 后，焦点返回对应项目的操作按钮。
- 点击确认删除或点击确认框外部关闭时，不把焦点强制拉回旧按钮。

## 4. 根因与快速通道判定

`ProjectRailItem` 只根据 `confirmOpen` 条件渲染 alertdialog，没有初始焦点、焦点约束和关闭后的焦点恢复逻辑。问题局限于单个局部组件和对应交互测试，采用快速通道。
