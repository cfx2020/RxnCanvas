---
doc_type: issue-fix
issue: 2026-06-30-file-context-delete-menu
path: fast-track
fix_date: 2026-06-30
tags: [frontend, project-rail, context-menu, source-files]
---

# 文件删除右键菜单入口修复记录

## 1. 问题描述

用户期望删除源文件及关联节点的入口在左侧文件栏：选中文件后右键文件行，通过文件右键菜单删除。上一版误把 `Delete file and nodes` 放到了画布节点卡片右键菜单里。

## 2. 根因

`web/src/app/App.tsx` 在 canvas node context menu 中根据 `node.sourceFileId` 注入了 `Delete file and nodes`，而 `web/src/app/ProjectRail.tsx` 文件行只保留了选择和拖拽，没有右键菜单。

## 3. 修复方案

- 从节点右键菜单移除 `Delete file and nodes`，节点菜单只保留节点自己的普通 `Delete`。
- 在 Project Rail 文件行上新增右键菜单；右键已选中的文件行时删除当前选中文件组，右键未选中的文件行时先选中该文件组再删除。
- 将 App 侧 source 删除 handler 扩展为批量文件删除，避免多选删除时逐个调用单文件删除造成状态闭包过期。

## 4. 验证结果

- `npm --prefix web run test -- App --run` 通过。
- `npm --prefix web run build` 通过；仍只有既有 3Dmol eval 和 large chunk warning。
- 浏览器验证 `http://127.0.0.1:5173/`：节点右键菜单不再出现 `Delete file and nodes`；左侧 `orca.out` 文件行右键菜单出现 `Delete file and nodes`，点击后删除文件行及 `Node Maleic Anhydride`，console 无 error/warn。
