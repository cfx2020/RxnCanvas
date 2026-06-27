---
doc_type: feature-ff-note
feature: drag-drop-import
date: 2026-06-28
requirement:
tags: [web, workbench, import, drag-drop, canvas]
---

## 做了什么
支持从系统直接把 log/out 等 source 文件拖到画布或左侧 Files 区。拖到画布会登记到项目文件列表并在落点生成节点；拖到 Files 区只登记文件；图片拖到画布会作为图片注释放在落点，不进入 source 列表。

## 改了哪些
- `web/src/app/App.tsx:1739` — 图片导入支持指定画布坐标，并把画布外部 drop 分流为图片注释与 source import。
- `web/src/app/ProjectRail.tsx:313` — Files rail section 接收外部文件 drop，复用项目文件导入动作。
- `web/src/app/App.test.tsx:633` — 覆盖 Files 区 drop source 文件和画布 drop 图片两条用户路径。

## 怎么验证的
跑过 `npm --prefix web run test -- App appImportActions importRegistration fileDisplay --run`、`npm --prefix web run build` 和 `git diff --check`。用 Playwright fallback 在 `http://127.0.0.1:5173/` 验证桌面画布/Files 拖放和窄屏画布拖放，console/page error 为空。
