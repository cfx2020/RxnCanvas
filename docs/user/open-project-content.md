---
doc_type: user-guide
slug: open-project-content
component: platform-shell-state-restore
status: current
summary: 如何用 CLI 打开 RxnFlow 项目并恢复已保存的项目内容
tags: [project, cli, persistence, restore]
last_reviewed: 2026-06-05
---

# 打开并恢复项目内容

## 功能简介

RxnFlow 项目可以把已登记对象、导入记录、反应图、workspace、能量 profile 和导出索引保存在项目目录的 `.rxnflow/state/` 中。重新打开项目时，CLI 可以恢复这些已保存内容，并返回一个结构化摘要。

## 前置条件

- 项目目录已经创建过，并包含 `.rxnflow/manifest.json`。
- 如果要恢复内容，项目目录还需要包含 `.rxnflow/state/` 下的 Project Content 文件。

## 如何使用

1. 打开项目并恢复已保存内容：

   ```bash
   python3 -m rxnflow.cli project open --json --project-path /path/to/project
   ```

2. 查看返回摘要中的数量字段：

   - `object_count`
   - `graph_count`
   - `workspace_count`
   - `profile_count`
   - `artifact_count`

3. 只打开项目 manifest，不读取 `.rxnflow/state/`：

   ```bash
   python3 -m rxnflow.cli project open --json --project-path /path/to/project --manifest-only
   ```

4. 如果返回 `project_content_invalid`，说明项目内容文件存在缺失、checksum 不一致、JSON 损坏或引用断裂。此时不会部分恢复内容，需要先查看返回的 `error.details.issues`。

## 常见问题

Q: `project open` 和 `project load` 有什么区别？

A: `project load` 只读 manifest。`project open` 默认会恢复 `.rxnflow/state/` 中保存的项目内容。

Q: 为什么 CLI 没有 `project save-content`？

A: 当前 CLI 是一次性进程，命令结束后 session 就不存在。保存当前 session 内容需要由同一进程内的 Platform Shell 或未来端侧壳层调用 `project.save_content`。

Q: 导出的报告文件会自动进入项目索引吗？

A: 只有保存 session 时，位于当前项目 `exports/` 目录下的 runtime export artifact 才会被登记为长期 `ExportArtifactRecord`。项目外文件和内联 bytes 不会写入项目内容 JSON。

## 相关功能

- Web 工作台主流程验收：`docs/user/workspace-first-workbench.md`
- 项目内容验证：打开项目时会先校验 `.rxnflow/state/`。
- 报告导出：导出的 PNG、CDXML、XLSX、CSV 文件应放在项目 `exports/` 目录下，便于后续登记和校验。
