---
doc_type: feature-ff-note
feature: native-import-dialog
date: 2026-06-28
requirement:
tags: [desktop, electron, import, ui]
---

## 做了什么

桌面版导入失败 / unsupported format 不再默认显示 React 页面内弹窗，改为调用 macOS / Windows 原生消息框。浏览器环境或旧桌面桥接缺少 native API 时，仍保留原来的页面内 fallback。

## 改了哪些

- `web/electron/main.cjs` — 新增 `rxnflow:show-import-issues` IPC，用 `dialog.showMessageBox` 展示导入失败列表。
- `web/electron/preload.cjs` / `web/src/app/appRuntimeEffects.ts` — 暴露并声明 `showImportIssues` 桌面 API。
- `web/src/app/App.tsx` — parser job 发现导入错误时优先调用 native dialog，失败时回落到原弹窗。
- `web/src/app/App.test.tsx` — 覆盖 native dialog API 被调用且不再显示页面内 alertdialog。

## 怎么验证的

`npm --prefix web run test`、`npm --prefix web run build`、`npm --prefix web run desktop:smoke` 均通过；构建仍仅保留既有 3Dmol eval 与 chunk size warning。
