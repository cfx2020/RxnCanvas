---
doc_type: issue-fix
issue: 2026-07-16-settings-modal-focus
status: fixed
path: fast-track
fix_date: 2026-07-16
tags: [ui, accessibility, keyboard, settings, modal]
---

# Settings 模态焦点修复记录

## 1. 修复内容

- Settings 打开链路显式保存触发元素；弹窗挂载后聚焦 Close settings。
- Tab/Shift+Tab 在所有启用的 Settings 按钮和 select 之间循环。
- Settings 本地处理 Escape，阻止事件继续影响背景界面。
- Settings 卸载后将焦点恢复到仍存在的触发元素。
- App 全局快捷键在 `settingsOpen` 时直接暂停，包括单键工具命令和 `⌘/Ctrl+K`。

## 2. 改动文件

- `web/src/app/SettingsPanel.tsx`
- `web/src/app/ProjectRail.tsx`
- `web/src/app/App.tsx`
- `web/src/app/App.test.tsx`
- `.codestable/issues/2026-07-16-settings-modal-focus/settings-modal-focus-report.md`
- `.codestable/issues/2026-07-16-settings-modal-focus/settings-modal-focus-fix-note.md`

## 3. 验证结果

- Settings 定向集成测试通过：initial focus、Tab/Shift+Tab 循环、Escape、焦点返回及背景快捷键隔离均有覆盖。
- 浏览器验证 Settings 打开后 active element 为 `Close settings`，且 `aria-modal=true`。
- 浏览器验证 Shift+Tab 从 Close 到最后一个 Energy unit select，Tab 返回 Close。
- 浏览器验证 Settings 打开时 `T` 不打开能量表，`⌘K` 不打开 Command Palette。
- 浏览器验证 Escape 关闭后焦点返回侧栏 Settings 按钮。
- Web 完整测试通过：43 个测试文件、407 项测试。
- Web production build 通过。
- `git diff --check` 通过。

## 4. 审计遗留

本次按最新 Web Interface Guidelines 完成 dialog 焦点审计，未混入以下独立问题：

- Import Issue alertdialog 缺少完整焦点闭环，异步错误出现时焦点仍留在背景，优先级最高。
- Command Palette 缺少焦点约束和返回，Escape 会继续冒泡，且命令列表 ARIA 模型不完整。
- Candidate Review、3D/2D Structure dialog 也缺少统一焦点生命周期；3D→2D 还需要跨弹窗焦点所有权设计。
