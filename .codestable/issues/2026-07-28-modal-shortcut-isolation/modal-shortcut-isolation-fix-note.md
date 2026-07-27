---
doc_type: issue-fix
issue: 2026-07-28-modal-shortcut-isolation
status: fixed
path: fast-track
fix_date: 2026-07-28
tags: [ui, accessibility, keyboard, modal, command-palette]
---

# 模态快捷键隔离修复记录

## 1. 修复内容

- 全局快捷键处理器统一检查当前 DOM 中的 `aria-modal="true"`，不再依赖少数 App 状态特判。
- 打开其他模态窗口时，拦截 `Command/Ctrl+K`，避免叠加 Command Palette。
- 其他模态窗口打开时，阻止单键工作台命令穿透；普通无关按键不额外扫描 DOM。
- 保留 Command Palette 打开后再次使用 `Command/Ctrl+K` 关闭的行为。
- App 管理的业务模态与 Command Palette 在渲染层互斥；异步业务模态到达时立即卸载面板并清掉残留状态。

## 2. 回归覆盖

- 项目删除确认窗口打开时，Command Palette 和 Energy Table 均不会被快捷键打开。
- 3D Structure 窗口打开时，Command Palette 和 Energy Table 均不会被快捷键打开。
- 异步导入错误到达时，已打开的 Command Palette 会被替换，DOM 中始终只保留一个业务模态且错误窗口取得焦点。
- 既有 Command Palette 测试继续覆盖其自身的快捷键关闭行为。

## 3. 改动文件

- `web/src/app/App.tsx`
- `web/src/app/App.test.tsx`
- `.codestable/issues/2026-07-28-modal-shortcut-isolation/modal-shortcut-isolation-report.md`
- `.codestable/issues/2026-07-28-modal-shortcut-isolation/modal-shortcut-isolation-fix-note.md`

## 4. 验证结果

- `App.test.tsx` 定向测试通过：77 项。
- Web 全量测试通过：44 个测试文件、411 项测试。
- Web production build 通过。
- 浏览器验证项目删除确认和 3D Structure 打开时，`Command+K` 与 `T` 均不会打开 Command Palette 或 Energy Table。
- 浏览器验证普通状态下 Command Palette 仍可用 `Command+K` 打开和关闭，关闭后焦点返回原 Settings 按钮。
- 浏览器控制台无 error/warning，`git diff --check` 通过。
