---
doc_type: feature-ff-note
feature: workspace-folder-projects
date: 2026-06-17
requirement: project-content-persistence
tags: [desktop, electron, project, workspace-folder, autosave, export]
---

## 做了什么
把桌面端项目持久化从隐藏托管 `.rxnflow` 目录改为 Codex/VS Code 式真实工作区文件夹：新建/打开的是文件夹，自动保存写回该文件夹，分享/迁移时导出 `.rxnflow.zip`。

## 改了哪些
- `web/electron/project-store.cjs` — 工作区布局改为 `.rxnflow/project.json` + 根目录 `sources/` / `exports/`，并新增工作区 zip 导出。
- `web/electron/main.cjs` / `web/electron/preload.cjs` — 新增 `createProjectFolder` IPC，打开文件夹、导出 zip、无工作区时 autosave 返回 warning。
- `web/src/app/App.tsx` / `web/src/app/ProjectRail.tsx` / `web/src/app/appRuntimeEffects.ts` — Project Rail 改为 `Workspaces`、`New Project Folder`、`Open Folder`，桌面新建项目先创建真实文件夹。
- `rxnflow/engine.py` / `web/electron/embedded-engine.cjs` — project open/save/validate 识别工作区根目录与 `.rxnflow/project.json` 元数据。
- `.codestable/architecture/`、`.codestable/requirements/`、`docs/`、`web/electron/README.md` — 同步当前项目持久化语义。

## 怎么验证的
已跑 `python3 -m unittest discover`、`cd web && npx tsc -b --pretty false`、`npm run test`、`npm run build`、`npm run desktop:smoke`、`npm run desktop:pack`、`npm run desktop:runtime:smoke`。
浏览器 smoke 在 `http://127.0.0.1:5173/` 验证工作区入口、创建表单、Inspector tabs 和窄屏无横向溢出。

## 顺手发现
- `web` build 仍会提示 3Dmol direct eval 与 Ketcher/3Dmol chunk 过大；这是既有依赖打包问题，不在本次工作区文件夹改造范围。
