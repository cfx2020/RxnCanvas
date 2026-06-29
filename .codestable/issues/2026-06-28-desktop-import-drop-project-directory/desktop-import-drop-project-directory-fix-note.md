---
doc_type: issue-fix
issue: 2026-06-28-desktop-import-drop-project-directory
path: fast-track
fix_date: 2026-06-28
tags: [desktop, import, drag-drop, sources, parser]
---

# Finder 拖入未复制到 sources 修复记录

## 1. 问题描述

用户从 Finder 把正常 log 拖入 RxnFlow 后，文件在侧栏进入解析流程，但过一会儿停在红灯失败状态；项目 `sources/` 目录没有出现新的 log 文件。窗口导入同类文件可以正常解析。

## 2. 根因

Finder / 文件列表拖入是 renderer 先拿到 `File`，再调用 Electron 主进程 `rxnflow:import-source-files`。该 payload 之前只带 `projectId`，如果主进程此时没有当前 project 的目录映射，就会退化为 preview-only parser 路径，无法把原始文件 materialize 到项目 `sources/`。

另一个小问题是 cclib 失败路径把 warning 包成了二维 tuple，JSON 到前端后变成嵌套数组，导致 UI 无法稳定读取失败 code/message。

## 3. 修复方案

- renderer 侧维护 `projectId -> projectDirectory` 映射，来源包括启动恢复、打开项目、新建项目、手动保存和自动保存。
- `desktopParsedImportSourceFiles()` 在每个后台 import job payload 中带上 `projectDirectory`。
- Electron 主进程 `rxnflow:import-source-files` 在自己的映射缺失时，用 payload 中的 `projectDirectory` 重新验证项目身份并绑定，然后再复制到 `sources/` 后交给 engine 解析。
- engine 的 cclib 失败结果改为一维 warning tuple，前端可以读到 `cclib_parse_empty`。

## 4. 改动文件清单

- `web/src/app/App.tsx`
- `web/src/app/appRuntimeEffects.ts`
- `web/src/app/importParseJobs.ts`
- `web/src/app/importRegistrationTypes.ts`
- `web/src/app/App.test.tsx`
- `web/src/app/importParseJobs.test.ts`
- `web/electron/main.cjs`
- `rxnflow/engine.py`
- `tests/test_engine.py`

## 5. 验证结果

- `npm --prefix web run test -- importParseJobs App --run` 通过。
- `npm --prefix web run test` 通过，37 个测试文件 / 303 个测试。
- `python3 -m unittest discover` 通过，27 个测试。
- `node --check web/electron/main.cjs` 通过。
- `node --check web/electron/preload.cjs` 通过。
- `npm --prefix web run build` 通过。
- `npm --prefix web run desktop:smoke` 通过。
- `npm --prefix web run desktop:pack` 通过，已重新生成 `web/release/mac-arm64/RxnFlow.app`。
- `npm --prefix web run desktop:runtime:smoke` 通过，包内 engine 为 `bundled-python cclib=1.8.1`。
- `npm --prefix web run desktop:release:smoke` 通过。
- `git diff --check` 通过。

## 6. 遗留事项

本次修复保证后续 Finder 拖入会带项目目录并复制到 `sources/`。用户项目里之前已经失败且没有 `storedPath/checksum` 的记录，需要重新拖入原始 log 来生成正确 source 文件。
