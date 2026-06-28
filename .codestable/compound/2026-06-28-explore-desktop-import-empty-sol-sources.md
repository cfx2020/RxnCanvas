---
doc_type: explore
type: question
date: 2026-06-28
slug: desktop-import-empty-sol-sources
topic: 为什么正常 sol log 在桌面导入后显示解析失败
scope: Electron source import materialization and Python engine import.preview
keywords: [desktop, import, sources, sol, cclib, materialize]
status: active
confidence: high
---

## 问题与范围

用户反馈正常的 sol Gaussian log 通过外部拖入或窗口导入后，Project Rail 一直显示解析中或解析失败；问题聚焦在桌面导入把文件复制到项目 `sources/` 后，Python engine 为什么没有解析出结果。

## 速答

这次样本不是 cclib 不能解析 sol log。实际项目目录 `/Users/linsay/Documents/chemistry/Ir/sources/` 里的 `i1fix8p6-tsr-sol.log` 和 `i1fix8p6-tsf-sol.log` 是 0B，所以 engine 读完整文件时只能得到空文本，返回 `Raw / unsupported_format`。同名 OneDrive 原始文件分别约 312K / 310K，用同一个 `web/engine/rxnflow-engine` 可以正常解析为 `gaussian-log-cclib+rxnflow-text-full-file`。

桌面导入链路允许在既没有 `sourcePath` 也没有 `contentBase64` 时把空 `preview` 写入 `sources/`，这是后续需要修的导入 materialization 边界。

## 关键证据

- `rxnflow/engine.py:325`：`parse_source_file()` 有 `sourcePath` 时会读完整文件，再判断是否交给 cclib；因此桌面导入解析的是 `sources/` 里的实际副本，不只是 renderer preview。
- `web/electron/main.cjs:696`：Electron `rxnflow:import-source-files` 会把 materialized 文件的 `parseSourcePath` 作为 `sourcePath` 传给 `import.preview`。
- `web/electron/project-store.cjs:202`：materialization 优先用 `sourcePath` 执行 `fs.copyFile()`；有 inline bytes 时写 `contentBase64`。
- `web/electron/project-store.cjs:208`：如果没有 `sourcePath` / `contentBase64`，当前会把 `preview` 写进目标文件；桌面后台导入的 preview 可能是空字符串，于是可生成 0B source。
- `web/src/app/importParseJobs.ts:127`：外部拖入会尝试通过 Electron `filePathForFile()` 获取真实路径，失败时才用 `contentBase64` 兜底。

## 细节展开

本地复现结果：

- `/Users/linsay/Documents/chemistry/Ir/sources/i1fix18-ts-sol.log`：311K，engine 可解析，`parsed=true`。
- `/Users/linsay/Documents/chemistry/Ir/sources/i1fix8p6-tsr-sol.log`：0B，engine 返回 `Raw / unsupported_format`。
- `/Users/linsay/Documents/chemistry/Ir/sources/i1fix8p6-tsf-sol.log`：0B，engine 返回 `Raw / unsupported_format`。
- `/Users/linsay/Library/CloudStorage/OneDrive-汕头大学/Gaussian/Ir/i1fix8p6-tsr-sol.log`：312K，同一 engine 可解析。
- `/Users/linsay/Library/CloudStorage/OneDrive-汕头大学/Gaussian/Ir/i1fix8p6-tsf-sol.log`：310K，同一 engine 可解析。

因此“解析失败”是正确地反映了项目副本不可解析；真正的 bug 是导入阶段不该静默创建 0B source，也不该让这样的文件看起来只是 parser 失败。

## 未决问题

- 0B 文件最初来自外部拖入、窗口导入，还是重复导入时选中了已经损坏的 `sources/` 副本，需要用运行时日志或 UI 复现再确认。
- 导入修复应禁止空 fallback 写入，还是允许但标成 `source_materialize_failed`，需要按产品体验确定。

## 后续建议

已在 `.codestable/issues/2026-06-28-desktop-import-empty-source-files/desktop-import-empty-source-files-fix-note.md` 落地修复：文件型导入必须有可复制的 `sourcePath` 或非空 `contentBase64`，否则返回明确失败，不写 0B source。

## 相关文档

- `.codestable/issues/2026-06-28-desktop-import-progress-stuck/desktop-import-progress-stuck-fix-note.md`
