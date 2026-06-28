---
doc_type: issue-fix
issue: 2026-06-28-desktop-import-progress-stuck
path: fast-track
fix_date: 2026-06-28
tags: [desktop, import, parser, project-rail, progress]
---

# 桌面导入进度条卡住修复记录

## 1. 问题描述

从 Electron dialog 或外部拖拽导入 log/sol log 后，文件已经复制到工作区 `sources/`，但 Project Rail 文件行的解析进度条一直动画，用户无法判断解析是否结束。

## 2. 根因

桌面导入先创建 `parse_deferred` placeholder，再由 background parser job 回填。若 Electron 后端 materialize 成功但 `import.preview` 没返回单文件 `parse`（例如 engine timeout / bad response / preview 整体失败），`mergeDesktopImportResult()` 会继续沿用 placeholder 的 `parse_deferred`，因此 `ProjectRail` 一直把文件判断为 pending。

## 3. 修复方案

在 `desktopParsedImportSourceFile()` 中把“job 已返回但缺少 parse”视为已完成的失败状态：保留 `storedPath` / `checksum`，但用后端 warning 或 `import_preview_missing` 替换 `parse_deferred`。这样文件仍留在列表和 `sources/`，但进度条停止，Inspector 可显示明确的解析失败 warning。

## 4. 改动文件清单

- `web/src/app/importParseJobs.ts` — parser job 返回无 parse 时替换为 failure parse result，不再保留 deferred warning。
- `web/src/app/importParseJobs.test.ts` — 覆盖 materialize 成功但无 parse 时 progress 应停止，并保留 storedPath/checksum。
- `web/src/app/App.test.tsx` — 覆盖 Electron dialog 导入无 parse 回包后 Project Rail progressbar 消失。

## 5. 验证结果

- `npm --prefix web run test -- importParseJobs App --run` 通过。
- `npm --prefix web run test` 通过。
- `npm --prefix web run build` 通过，仅保留既有 3Dmol eval 与 chunk size warning。
- `npm --prefix web run desktop:pack` 通过，重新生成 macOS app。
- `npm --prefix web run desktop:runtime:smoke` 通过，确认 packaged runtime 使用 bundled Python + `cclib=1.8.1`。
- `npm --prefix web run desktop:release:smoke` 通过，仅保留既有 Windows 旧产物提示。
- `npm --prefix web run desktop:smoke` 通过。
- 浏览器验证通过：mock Electron import 返回 `storedPath` / `checksum` 但无 `parse` 时，Project Rail 的 progressbar 从 1 个降为 0 个，截图保存于 `/tmp/rxnflow-progress-cleared.png`。

## 6. 遗留事项

若用户看到的是“parser job 真正长时间未返回”，这条修复不会缩短解析耗时；后续仍按 roadmap 的 `desktop-import-engine-pool` 做长驻 Python engine / 进程池优化。
