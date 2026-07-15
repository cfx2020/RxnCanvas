---
doc_type: issue-fix
issue: 2026-07-15-project-removal-wording
status: fixed
path: fast-track
fix_date: 2026-07-15
tags: [ui, project-rail, wording, accessibility]
---

# 项目移除文案修复记录

## 1. 修复内容

- 项目菜单操作改为 `Remove from sidebar`。
- 确认框标题改为 `Remove project from sidebar?`。
- alertdialog 无障碍名称改为 `Remove {project} from sidebar`。
- 确认按钮改为 `Remove from sidebar`。
- 垃圾桶图标改为文件夹减号图标。
- 明确说明原始源文件和已保存的 `.rxnflow` 文件夹不会被删除。

## 2. 改动文件

- `web/src/app/ProjectRail.tsx`
- `web/src/app/App.test.tsx`
- `.codestable/issues/2026-07-15-project-removal-wording/project-removal-wording-report.md`
- `.codestable/issues/2026-07-15-project-removal-wording/project-removal-wording-fix-note.md`

## 3. 验证结果

- 项目移除相关 3 项定向测试通过。
- Web 完整测试通过：43 个测试文件、407 项测试。
- Web production build 通过。
- 浏览器桌面宽度验证通过：菜单、确认框、文件夹减号图标、无障碍名称和取消流程均正确，旧 `Delete project` 文案不再出现。
- `git diff --check` 通过。

## 4. 顺手发现

> 窄屏下侧栏进入悬浮模式后，项目确认框仍按展开侧栏定位，左侧可能超出视口。该问题与本次文案替换独立，未混入本修复，应作为下一项响应式布局 bug 处理。
