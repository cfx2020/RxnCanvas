---
doc_type: feature-ff-note
feature: project-status-notices
date: 2026-06-06
requirement: web-workbench-shell
tags: [web, project-sidebar, ui, codestable]
---

## 做了什么

Project Sidebar 不再把正常 saved / valid / checksum 当作常驻用户信息展示。侧边栏只在未保存、保存失败、项目内容缺失或浅校验错误时显示 Project notices，让左侧更像项目文件树而不是调试面板。

## 改了哪些

- `web/src/app/ProjectSidebar.tsx` — 删除常驻 persistence / validation 状态卡，新增按需显示的 Project notices。
- `web/src/app/i18n/messages.ts` — 补充中英文 notice 文案，移除旧常驻状态标签文案。
- `web/src/app/ProjectSidebar.test.tsx` / `web/src/app/WorkbenchShell.test.tsx` — 固定正常状态隐藏、异常状态提醒的组件断言。
- `docs/user/workspace-first-workbench.md`、`docs/dev/web-runtime-boundary.md`、`.codestable/architecture/`、`.codestable/requirements/` — 同步当前 UI 口径。

## 怎么验证的

已运行 `cd web && npm run test`、`cd web && npm run build`、相关 roadmap YAML 校验和 `git diff --check`。浏览器在 `http://127.0.0.1:5173/` 验证桌面与 `390x840` 窄屏：active project 展开后不显示保存状态、校验状态、saved/valid、checksum 或 backend/runtime 实现名，无水平溢出，console warn/error 为空。
