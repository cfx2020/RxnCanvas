---
doc_type: issue-report
issue: 2026-07-15-narrow-project-confirm-offscreen
status: confirmed
severity: medium
path: fast-track
tags: [ui, responsive, project-rail, confirmation]
---

# 窄屏项目确认框移出视口

## 1. 现象

窗口宽度进入项目侧栏自动隐藏断点后，打开项目操作菜单并选择 `Remove from sidebar`，确认框左侧会随侧栏移到视口之外，只剩部分内容或完全不可操作。

## 2. 复现步骤

1. 将工作台窗口缩窄到 1180px 以下。
2. 悬浮或聚焦左侧项目栏，使其展开。
3. 打开项目操作菜单并选择 `Remove from sidebar`。
4. 观察确认框位置。

## 3. 期望行为

- 项目菜单或确认框打开期间，窄屏侧栏保持完整展开。
- 确认框全部位于视口内，可读取并操作。
- 关闭弹层且指针/焦点离开后，侧栏恢复自动隐藏。

## 4. 根因与快速通道判定

菜单项点击后菜单按钮卸载，侧栏失去 `:focus-within`。最终窄屏 CSS 仅用 hover/focus 保持展开，于是立即重新执行负向平移；确认框作为侧栏子元素一起移出视口。组件已经通过 `.project-rail-item.has-open-actions` 表达菜单或确认框打开状态，补齐 CSS 状态即可，采用快速通道。
