---
doc_type: issue-fix
issue: 2026-06-28-desktop-import-empty-source-files
path: fast-track
fix_date: 2026-06-28
tags: [desktop, import, sources, parser, project-rail]
---

# 桌面导入写出空 source 文件修复记录

## 1. 问题描述

用户把正常 Gaussian sol log 拖入 App 后，项目 `sources/` 中出现 0B 同名文件，导致后台 parser 读到空文本并返回 unsupported / unparsed。原始 OneDrive log 可被同一个 bundled engine 正常解析。

## 2. 根因

桌面导入为了先入栏，把 renderer preview 设为空字符串并把解析交给后台 job。如果 Electron 拖拽文件没有可用 native path，旧实现可能退回 inline bytes 或空 preview 路径；空 preview 会让 `materializeImportSourceFile()` 静默制造 0B source，inline bytes 则会让大 log 在 renderer 和 IPC 之间复制一遍，性能不可接受。

追加复查发现另一条同源路径：文件先入栏后，autosave / project save 会调用 `persistSourceFile()`；如果后台 parser job 尚未 materialize 完整文件，`persistSourceFile()` 也会把空 `preview` 写入 `sources/`。这解释了“dialog 导入正常，但外部拖入仍看到 0B”的现象。

另外，materialize 失败后如果 parser 又对空 preview 返回 `unsupported_format`，前端可能把真实的复制失败误显示成格式不支持。

## 3. 修复方案

- `materializeImportSourceFile()` 不再用 preview / inline bytes 兜底写项目 source；项目目录导入必须有可读 native `sourcePath`，否则 per-file 返回 `source_materialize_failed`。
- `persistSourceFile()` 不再把空 preview 写成 source 文件；没有可读源且 preview 为空时保留 file 记录但不写 `storedPath` / `checksum`。
- 前端 parser job 对 `file.error` 赋予高优先级，避免被后续 parser fallback warning 覆盖。
- Electron 拖拽无法取得 native path 时，前端不再读取原始 `File` bytes，也不再传 `contentBase64`；该文件进入失败状态并提示 native file path 不可用。
- unsupported format / materialize failure / import preview missing 会弹出导入错误弹窗，弹窗复用 2D/3D 结构预览的 modal 视觉体系。
- Project Rail 对非 pending 的解析失败显示红色状态灯，tooltip 同时保留 sol 配对提示和失败原因；gas-only 和 sol-only 都显示橙色缺配对灯，配对后消失。

## 4. 改动文件清单

- `web/electron/project-store.cjs`
- `web/electron/smoke.cjs`
- `web/src/app/importParseJobs.ts`
- `web/src/app/ProjectRail.tsx`
- `web/src/app/App.tsx`
- `web/src/app/workbench.css`
- `web/src/app/importParseJobs.test.ts`
- `web/src/app/App.test.tsx`
- `web/src/app/fileDisplay.test.ts`

## 5. 验证结果

- `npm --prefix web run test -- importParseJobs App --run` 通过。
- `npm --prefix web run test -- App importParseJobs fileDisplay --run` 通过。
- `npm --prefix web run desktop:smoke` 通过。
- 浏览器验证通过：unsupported 弹窗 class 为 `structure-preview-dialog import-issue-dialog`，close button 使用 `structure-preview-close-button`；sol-only 文件显示 `No paired gas log`，导入对应 gas 后该组橙灯数量为 0。
- `node --check web/electron/project-store.cjs && node --check web/electron/smoke.cjs` 通过。
- 2026-06-28 追加调整：桌面 drop/import job 移除 `contentBase64` fallback；`npm --prefix web run test` 和 `npm --prefix web run build` 通过。

## 6. 遗留事项

本次修复不会自动修复用户项目中已经存在的 0B source 文件；需要删除损坏的 source 记录后，从原始路径重新导入。
