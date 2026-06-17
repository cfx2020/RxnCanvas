---
doc_type: feature-ff-note
feature: project-autosave-source-ingest
date: 2026-06-17
requirement: project-content-persistence
tags: [desktop, project-store, autosave, source-ingest]
---

## 做了什么
Electron 桌面端新增 active project 自动保存：导入后的 source 不再长期依赖外部 `sourcePath`，autosave 会把原始文件复制到当前 `.rxnflow/sources/`，并把 renderer 状态刷新为 `storedPath` / checksum。显式保存入口改为 `Export project`，用于分享或换电脑迁移项目副本。

## 改了哪些
- `web/electron/main.cjs` / `web/electron/preload.cjs` — 新增 `autosaveProjectPackage` IPC；无外部项目目录时写入 Electron `userData/projects/` 托管 `.rxnflow`，并在 runtime smoke 覆盖 source materialization。
- `web/src/app/App.tsx` / `web/src/app/appRuntimeEffects.ts` — 增加 debounced desktop autosave，保存返回后合并 `storedPath` / checksum，autosave 失败显示 project validation error。
- `web/src/app/WorkbenchToolbar.tsx` / `web/src/app/InspectorPanels.tsx` — Toolbar 改为 `Export project`，Source 面板显示项目副本状态。
- `.codestable/architecture/` / `.codestable/requirements/project-content-persistence.md` — 回写当前桌面项目 source ingest 与 autosave 语义。

## 怎么验证的
已跑 `python3 -m unittest discover`、`cd web && npm run test`、`npm run build`、`npm run desktop:smoke`、`npm run desktop:pack`、`npm run desktop:runtime:smoke`。浏览器 smoke 打开 `http://127.0.0.1:5173/`，确认 toolbar 显示 `Export project`，Source 面板显示 project copy 状态。

## 顺手发现
- 浏览器预览仍只能验证 UI 和 `.rxnflow` 打开流程，无法验证真实 `sourcePath` 复制；这类行为必须看 Electron IPC / packaged runtime smoke。
