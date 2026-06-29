---
doc_type: feature-ff-note
feature: node-source-delete-menu
date: 2026-06-29
requirement:
tags: [frontend, project-rail, canvas, context-menu]
---

## 做了什么

文件列表行不再显示右侧三点菜单；删除源文件及其关联节点的入口移动到画布节点右键菜单。

## 改了哪些

- `web/src/app/ProjectRail.tsx` — 移除文件行 action menu、删除入口和对应 props。
- `web/src/app/App.tsx` — 节点右键菜单新增 `Delete file and nodes`，复用现有 `deleteProjectFile()` 逻辑。
- `web/src/app/workbench.css` — 文件卡改成单列布局，进度条不再为旧三点按钮预留右侧空间。
- `web/src/app/App.test.tsx` — 更新文件行选择/拖拽、节点右键删除、候选 review 入口测试。

## 怎么验证的

`npm --prefix web run test -- App InspectorPanels fileDisplay CanvasWorkspace --run` 通过；`npm --prefix web run build` 通过。浏览器验证 `http://127.0.0.1:5173/`：文件行无 `More actions for ...` 按钮，节点右键菜单可删除 `orca.out` 及其节点，console 无 error/warn。
