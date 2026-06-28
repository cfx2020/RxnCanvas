---
doc_type: feature-ff-note
feature: desktop-import-parse-queue
date: 2026-06-28
requirement:
tags: [desktop, import, parser, project-rail, performance, electron]
---

## 做了什么
桌面导入改成“先入栏、再后台解析”：dialog/drop 后立即创建 source 占位行和进度条，文件先复制到工作区 `sources/`，解析结果再按文件陆续回填。这样批量导入时 Project Rail 不再等大 log 全部解析完才出现。

## 改了哪些
- `web/electron/main.cjs:637` — 文件选择只返回 metadata 和 `sourcePath`，不再读 64KB preview。
- `web/electron/main.cjs:658` — Electron import IPC 先 materialize 到项目 `sources/`，再调用 engine `import.preview`。
- `web/src/app/importParseJobs.ts:5` — 新增桌面导入限并发队列，默认 3 个单文件 job 并行，每个文件解析完成后触发回填 callback。
- `web/src/app/appImportActions.ts:33` — import staging 传递 `parseMode`，支持 placeholder 先进入项目。
- `web/src/app/ProjectRail.tsx:634` — 文件行识别 `parse_deferred` / `parse_queued` / `parse_running` 并显示 pending progressbar。

## 怎么验证的
跑过 `npm --prefix web run test`、`npm --prefix web run build`、`python3 -m unittest discover` 和三条 desktop smoke。Playwright fallback 验证过导入后先看到 pending 文件行 progressbar，再看到解析完成的文件行，截图留在 `/tmp/rxnflow-import-pending.png` 与 `/tmp/rxnflow-import-parsed.png`。
