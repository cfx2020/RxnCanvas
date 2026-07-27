---
doc_type: issue-report
issue: 2026-07-28-modal-shortcut-isolation
status: confirmed
severity: high
path: fast-track
tags: [ui, accessibility, keyboard, modal, command-palette]
---

# 模态窗口没有隔离工作台快捷键

## 1. 现象

项目删除确认、候选审阅、2D 编辑和 3D 查看等模态窗口打开时，`Command/Ctrl+K` 仍会在其上方打开 Command Palette，`V/H/X/I/T/F/A` 等单键命令也会继续修改背景工作台。

反向时序也会出错：Command Palette 已打开时，异步解析结果仍可能随后挂载导入错误或候选审阅窗口，形成两个无关的 `aria-modal="true"`。较高层级的 Command Palette 会遮住新窗口，而焦点可能已经被新窗口获取。

## 2. 期望行为

- 任意 `aria-modal="true"` 窗口存在时，不得打开新的 Command Palette。
- 模态窗口存在时，不得执行背景工作台的单键命令。
- Command Palette 自身打开时，仍可用 `Command/Ctrl+K` 将其关闭。
- 异步业务模态到达时应立即替换 Command Palette，关闭后也不得让旧面板重新出现。

## 3. 根因与快速通道判定

`App.tsx` 的全局键盘处理器只特判 Settings 和导入错误状态，没有覆盖由子组件管理的其他模态窗口；Command Palette 的渲染也未与异步业务模态互斥。问题集中在 App 的模态协调入口，根因明确，采用快速通道。
