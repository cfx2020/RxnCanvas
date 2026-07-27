---
doc_type: issue-fix
issue: 2026-07-27-command-palette-focus
status: fixed
path: fast-track
fix_date: 2026-07-27
tags: [ui, accessibility, keyboard, command-palette, focus]
---

# Command Palette 焦点修复记录

## 1. 修复内容

- 打开时保存原焦点并聚焦 Search commands；普通关闭时恢复仍存在的来源控件。
- Tab 和 Shift+Tab 在搜索框及启用的命令按钮之间循环，自动跳过 disabled 命令。
- Escape 阻止默认行为和传播，只关闭 Command Palette。
- 结果区域改为带名称的 command group，命令恢复原生 button 语义，删除不完整的 listbox/option 角色。
- 搜索框使用 search 类型，`Esc` 提示不再混入可访问名称；空结果使用 status。
- 运行命令前先恢复来源焦点并移交所有权，修复 Command Palette 到 Settings 再返回的跨弹窗链路。

## 2. 改动文件

- `web/src/app/CommandPalette.tsx`
- `web/src/app/CommandPalette.test.tsx`
- `web/src/app/App.test.tsx`
- `.codestable/issues/2026-07-27-command-palette-focus/command-palette-focus-report.md`
- `.codestable/issues/2026-07-27-command-palette-focus/command-palette-focus-fix-note.md`

## 3. 验证结果

- Command Palette 组件测试与 App 定向集成测试通过：2 个测试文件、80 项测试。
- Web 全量测试通过：44 个测试文件、411 项测试。
- Web production build 通过。
- 浏览器验证搜索框初始获得焦点且名称严格为 `Search commands`，结果区域不存在 `listbox/option` 伪语义。
- 浏览器验证 Shift+Tab 从搜索框到最后一个启用命令，Tab 再回到搜索框；disabled Undo/Redo 不进入循环。
- 浏览器验证输入 `T` 只过滤命令，不打开背景能量表；`Command+K` 和 Escape 关闭后均返回侧栏 Settings 按钮。
- 浏览器验证 Open Settings 命令打开 Settings 后，关闭 Settings 最终仍返回最初的侧栏 Settings 按钮。
- 浏览器控制台无新增 error/warning，`git diff --check` 通过。

## 4. 审计遗留

- Candidate Review、3D/2D Structure dialog 打开期间仍可通过 `Command/Ctrl+K` 叠加 Command Palette；作为独立 modal-stack guard 问题处理，不混入本次局部焦点修复。
