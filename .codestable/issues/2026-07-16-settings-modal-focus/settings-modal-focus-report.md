---
doc_type: issue-report
issue: 2026-07-16-settings-modal-focus
status: confirmed
severity: high
path: fast-track
tags: [ui, accessibility, keyboard, settings, modal]
---

# Settings 弹窗没有完整的模态焦点行为

## 1. 现象

打开 Settings 后，键盘焦点仍可能停留在背景触发按钮；Tab 可以离开弹窗，Escape 无法关闭，关闭后焦点不会返回。Settings 打开期间，全局单键命令和 `⌘/Ctrl+K` 仍会操作背景工作台或打开第二个 modal。

## 2. 复现步骤

1. 聚焦并打开左侧栏 Settings。
2. 检查初始焦点，连续按 Tab/Shift+Tab。
3. 按 Escape。
4. Settings 打开时按 `T`、`F`、`A` 或 `⌘/Ctrl+K`。

## 3. 期望行为

- Settings 打开后焦点进入 Close settings。
- Tab/Shift+Tab 在 Settings 的可用控件内循环。
- Escape 只关闭 Settings。
- 关闭后焦点返回打开 Settings 的控件。
- Settings 打开期间，全局画布命令和 Command Palette 快捷键全部暂停。

## 4. 根因与快速通道判定

`SettingsPanel` 虽声明 `aria-modal=true`，但没有焦点生命周期或本地键盘处理；App 全局快捷键监听也没有判断 `settingsOpen`。根因明确，修改集中于 Settings、快捷键 guard 和对应测试，采用快速通道。
