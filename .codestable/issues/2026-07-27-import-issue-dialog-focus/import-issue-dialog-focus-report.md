---
doc_type: issue-report
issue: 2026-07-27-import-issue-dialog-focus
status: confirmed
severity: high
path: fast-track
tags: [ui, accessibility, keyboard, import, focus]
---

# 导入错误弹窗未接管键盘焦点

## 1. 现象

浏览器内置的 Import Issue alertdialog 异步出现后，焦点仍停在背景工作台。键盘用户无法直接感知错误弹窗，Tab 可以继续操作背景，全局画布快捷键和 Command Palette 快捷键也仍会响应。

## 2. 复现步骤

1. 聚焦 Project Rail 的 Import files 按钮并导入一个不支持的文件。
2. 等待后台解析完成并显示 `Unsupported import format`。
3. 检查当前焦点，按 Tab、Shift+Tab、单键工作台命令或 `Command/Ctrl+K`。
4. 按 Escape 关闭并检查焦点位置。

## 3. 期望行为

- alertdialog 出现后焦点进入 `Close import error`。
- Tab 和 Shift+Tab 始终约束在弹窗的可用控件内。
- 弹窗打开期间不响应背景工作台和 Command Palette 快捷键。
- Escape 只关闭错误弹窗，关闭后焦点返回弹窗出现前仍存在的控件。

## 4. 根因与快速通道判定

`App.tsx` 中的 `ImportIssueDialog` 只有 `role=alertdialog` 和 `aria-modal=true`，没有初始焦点、焦点循环、Escape 或焦点返回逻辑；App 全局快捷键监听也没有判断 `importIssueDialog`。根因明确，修改限于该局部组件、快捷键守卫和对应集成测试，采用快速通道。
