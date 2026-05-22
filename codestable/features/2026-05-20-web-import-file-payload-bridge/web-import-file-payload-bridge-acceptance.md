---
doc_type: feature-acceptance
feature: 2026-05-20-web-import-file-payload-bridge
status: accepted
summary: import.preview inline bytes source 与 Web local-http 文件预览桥接验收
tags: [web, import-inbox, runtime-bridge, platform-shell, parser-preview]
accepted_at: 2026-05-20
---

# web-import-file-payload-bridge 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-20
> 关联方案 doc：`codestable/features/2026-05-20-web-import-file-payload-bridge/web-import-file-payload-bridge-design.md`

## 1. 接口契约核对

- [x] `ImportPreviewSource`：`path` / `inline_bytes` / `browser_storage` 三类 source 已在 `rxnflow.platform` 的 source resolution 层落地；`browser_storage` 明确返回 `storage_object_missing`。
- [x] `ImportPreviewArgs.source/sources`：`source` 单项和 `sources` 多项均可进入 `_import_file_requests`；旧 `source_path/source_paths/source_files` 仍保留。
- [x] `WebImportFile.file/sourceKind`：Web file input 保留 `File` 引用，并在 local-http inline mode 下标记 `sourceKind=inline_bytes`。
- [x] `importPreviewArgsFromFiles`：fixture mode 仍返回 `source_paths`；local-http mode 返回 `sources[].kind=inline_bytes`。

## 2. 行为与决策核对

- [x] 小文件 inline bytes 复用现有 Import Workflow，未复制 parser、Project Store 或 registry 逻辑。
- [x] inline 临时文件在 preview 返回前清理；session 无 core `project_path` 时创建 Temporary Preview Project，只作为进程内 preview 项目。
- [x] 大文件、`browser_storage`、前端解析、云上传、chunking、OPFS 和 Worker 均未实现。
- [x] 挂载点均落在方案清单内：`rxnflow/platform.py`、相关 tests、`ImportInbox`、`WorkbenchShell`、`importInboxState`、fixture transport、architecture / requirement / roadmap / dev guide。

## 3. 验收场景核对

- [x] S1 inline `.xyz` 成功：`tests.test_platform_shell_baseline` 覆盖 `parser_id=xyz-ase`、`object_count=1`。
- [x] S2 多 inline 文件成功：同一 batch 多 item 测试已覆盖。
- [x] S3 fixture session + inline bytes：Temporary Preview Project 测试覆盖，`workbench.snapshot` imports 计数更新。
- [x] S4/S5/S6 错误语义：`payload_too_large`、invalid base64 / missing field、`storage_object_missing` 均有单测。
- [x] S7 local bridge 透传：`tests.test_local_http_shell_bridge` 覆盖 `project.create` session + inline `import.preview`。
- [x] S8/S9 Web inline args 与前端超限：`web/src/app/importInboxState.test.ts` 和 `WorkbenchShell.test.tsx` 覆盖。
- [x] S10 fixture 默认 Import Inbox 不回退：WorkbenchShell 既有 preview/register 测试仍通过。
- [x] S11 local-http 浏览器 smoke：Browser evaluate 确认 local-http 页面渲染且 console clean；Playwright 选择 `h2-inline.xyz` 后显示 `xyz-ase`、文件名和 inline bytes 状态，桌面/窄屏均无水平溢出；截图在 `/tmp/rxnflow-inline-import-local-http-desktop.png` 和 `/tmp/rxnflow-inline-import-local-http-narrow.png`。
- [x] S12 完整测试：`python3 -m unittest discover` 230 tests passed；`cd web && npm run test` 9 files / 72 tests passed；`cd web && npm run build` passed。

## 4. 术语一致性

- [x] `Import Preview Source`、`Inline Bytes Source`、`Inline Import Limit`、`Browser Import File`、`Temporary Preview Project` 均已在 design 和 architecture 中使用一致。
- [x] 禁用范围词检查：未引入 `browser_storage` adapter、chunking、OPFS payload store、Worker pool 或云上传实现。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：记录 `import.preview source/sources`、inline bytes、Temporary Preview Project 和 Web Import Inbox local-http 行为。
- [x] `codestable/architecture/core-platform.md`：记录 Platform Shell source contract、inline limit 和 Temporary Preview Project。
- [x] `codestable/architecture/web-workbench.md`：记录 Import Inbox fixture/path 与 local-http/inline bytes 分流。
- [x] `docs/dev/web-runtime-boundary.md`：补充 Import Preview Payload、inline limit、临时文件清理和非长期 storage 边界。

## 6. requirement 回写

- [x] `codestable/requirements/web-workbench-shell.md` 已更新用户故事、解决方式和边界：local-http 小文件 inline preview 已接入；Project Content bridge 和大文件协议仍未接。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-web-runtime-bridge/rxnflow-web-runtime-bridge-items.yaml` 中 `web-import-file-payload-bridge` 已改为 `done`。
- [x] `rxnflow-web-runtime-bridge-roadmap.md` 子 feature 清单已同步为 `done` 并记录剩余限制。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 候选：local-http browser smoke 需要先启动 `python3 -m rxnflow.local_bridge`，再以 `VITE_RXNFLOW_SHELL_TRANSPORT=local-http` 启动 Web dev server；这已在 `AGENTS.md` 常用命令中部分覆盖，本 feature 不擅自改项目级硬约束。

## 9. 遗留

- `browser_storage` source adapter、Project Content bridge、大文件 chunking / OPFS payload store、Worker pool 仍是后续 feature。
- local-http inline preview 当前使用 Temporary Preview Project；它不是长期项目保存机制。
