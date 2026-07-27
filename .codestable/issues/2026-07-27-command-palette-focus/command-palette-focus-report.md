---
doc_type: issue-report
issue: 2026-07-27-command-palette-focus
status: confirmed
severity: high
path: fast-track
tags: [ui, accessibility, keyboard, command-palette, focus]
---

# Command Palette 焦点和 ARIA 模型不完整

## 1. 现象

Command Palette 打开后虽然会聚焦搜索框，但 Tab 可以离开模态窗口，Escape 会继续传播到背景界面，关闭后也不会回到打开前的控件。命令结果同时声明为 `listbox/option`，却没有该模型要求的选中状态和方向键交互。

从 Command Palette 运行 Open Settings 时，Settings 还会把即将卸载的命令按钮记作返回目标，导致最终关闭 Settings 后焦点可能落到页面主体。

## 2. 复现步骤

1. 聚焦任意工作台按钮并按 `Command/Ctrl+K`。
2. 按 Tab、Shift+Tab 和 Escape，检查焦点及背景界面状态。
3. 使用辅助技术检查搜索框名称、结果角色和键盘模型。
4. 重新打开并运行 Open Settings，再关闭 Settings。

## 3. 期望行为

- 搜索框获得初始焦点，Tab 和 Shift+Tab 只在搜索框与可用命令按钮间循环。
- Escape 只关闭 Command Palette，所有关闭路径均恢复打开前焦点。
- 命令结果使用与实际交互一致的原生按钮语义，不声明未实现的 listbox 模型。
- `Esc` 视觉提示不混入搜索框名称，无匹配结果可被辅助技术感知。
- 运行会打开下一层界面的命令前先把焦点交还稳定来源，使下一层关闭后仍能正确返回。

## 4. 根因与快速通道判定

`CommandPalette.tsx` 只有初始聚焦和简单 Escape 回调，没有焦点约束、返回或事件隔离；结果区域又覆盖了原生按钮角色。问题集中于单个组件及 App 集成测试，根因明确，采用快速通道。
