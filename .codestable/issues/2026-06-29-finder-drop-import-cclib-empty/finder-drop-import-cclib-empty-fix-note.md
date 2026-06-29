---
doc_type: issue-fix
issue: 2026-06-29-finder-drop-import-cclib-empty
path: fast-track
fix_date: 2026-06-29
tags: [desktop, import, drag-drop, parser, autosave]
---

# Finder 拖入正常 log 却报 cclib 空解析修复记录

## 1. 问题描述

用户从 Finder 拖入 `i1fix8p6-tsf-sol.log` 后，侧栏文件进入失败红灯，tooltip 显示 `cclib did not return parsed data; standard cclib fields were left empty.`。同一个 sol log 通过窗口导入可以正常复制、解析和配对；直接用 bundled engine 解析原始路径与临时复制文件也都能成功。

## 2. 根因

Finder / 侧栏 drop 的占位文件只用于先入栏，之前没有把 Electron `webUtils.getPathForFile(file)` 取到的 native `sourcePath` 写入占位文件；后台 import job 虽然会在 payload 里再取一次路径，但 React 状态和 autosave 看到的是一个没有 `sourcePath/storedPath` 的空 preview 占位文件。

这会让保存/自动保存路径在后台解析完成前把刚复制到 `sources/` 但尚未被项目文件记录引用的 log 当作未引用文件清理掉。engine 已经从该路径读到过 Gaussian 文本并进入 cclib 分支，但 cclib 再打开文件时可能遇到已被清理/不可读的路径，于是 UI 最终显示误导性的 `cclib_parse_empty`。

另一个问题是主进程 materialize 单文件失败后仍会继续把该文件送进 engine preview，导致真实的复制失败被 parser warning 覆盖。

## 3. 修复方案

- 把 Electron 原生文件路径提取封成 `desktopSourceFilePathForRawFile()`，后台 import job 和拖入占位文件共用同一逻辑。
- Electron 文件列表拖入和画布拖入在 staging 占位文件时立即写入 native `sourcePath`；不传大文件 `contentBase64`。
- 主进程 `rxnflow:import-source-files` 对 materialize 失败的文件不再调用 engine preview，直接返回 `source_materialize_failed`。
- Python engine 的 cclib 失败 warning 保持数组/tuple 形状，避免前端读 warning 时遇到非数组结构。

## 4. 改动文件清单

- `web/src/app/App.tsx`
- `web/src/app/appImportActions.ts`
- `web/src/app/appImportActions.test.ts`
- `web/src/app/importSources.ts`
- `web/src/app/importParseJobs.ts`
- `web/electron/main.cjs`
- `rxnflow/engine.py`

## 5. 验证结果

- 原始 OneDrive `i1fix8p6-tsf-sol.log` 可由 `web/engine/rxnflow-engine` 正常解析，`parserId=gaussian-log-cclib+rxnflow-text-full-file`。
- 临时复制后的 `i1fix8p6-tsf-sol.log` sha256 与原始文件一致，也可由 bundled engine 正常解析。
- `npm --prefix web run test -- importParseJobs App appImportActions --run` 通过。
- `python3 -m unittest discover` 通过。
- `node --check web/electron/main.cjs && node --check web/electron/preload.cjs` 通过。
- `npm --prefix web run build` 通过；仍有既有 3Dmol eval 和大 chunk warning。
- `npm --prefix web run desktop:smoke` 通过。

## 6. 遗留事项

需要重新打包并用 Finder 实拖一次确认运行包路径已经吃到新代码。若仍失败，新的红灯/原生弹窗应优先暴露 `source_materialize_failed` 或具体文件系统错误，而不是 cclib 空解析误报。
