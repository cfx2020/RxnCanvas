---
doc_type: feature-acceptance
feature: 2026-05-25-export-graph-snapshot-svg
status: accepted
accepted_at: 2026-05-25
summary: SVG graph snapshot 导出已落地，core 从 graph/workspace projection 生成稳定 SVG artifact，并接入 Shell/Web 下载与 browser-local persistence
tags: [report-export, graph-snapshot, svg, workspace, shell-artifact, web-persistence]
---

# export-graph-snapshot-svg 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-25
> 关联方案 doc：`.codestable/features/2026-05-25-export-graph-snapshot-svg/export-graph-snapshot-svg-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] core `ExportFormat` / Web `ExportFormat` 已包含 `svg`，`supported_export_formats()` 和 Web `supportedExportFormats()` 返回 `png/cdxml/xlsx/csv/svg`；`pdf/pptx/cdx` 仍为 unsupported capability。
- [x] core SVG capability 已变为 `supported`，writer id 为 `python-svg-graph-snapshot-v1`，MIME 为 `image/svg+xml`，extension 为 `svg`，artifact kind 为 `graph_snapshot`。
- [x] `ExportRequest` 已新增可选 `workspace` 字段；`svg` 请求会优先使用 `WorkspaceSnapshot.graph/viewport/selection/active_path_id`，缺 workspace 时回退 `graph`。
- [x] `ReportExportService().export(... formats=("svg",), workspace=workspace ...)` 返回 UTF-8 SVG bytes，metadata 包含 graph/workspace/counts/selection/viewport/svg dimension/capability fields。
- [x] Web download / persistence 只消费 Shell inline bytes：SVG download 为 `data:image/svg+xml;base64,...`，browser-local persistence 写入 `exports/{basename}.svg`。

**名词层“现状 -> 变化”逐项核对**

- [x] `Graph Snapshot SVG` 已成为 supported export artifact；它不是 Web DOM screenshot、canvas screenshot 或 GraphCanvas transient state dump。
- [x] `Workspace-backed Export` 已通过 Platform Shell `export.profile` 把 active workspace 传入 core exporter，不新增 Shell command。
- [x] `export-artifacts-v1` 未升级 schema，只因 capability supported set 扩展而接受 SVG artifact record。

**流程图核对**

- [x] `export.profile formats includes svg -> Platform state resolves active workspace -> ExportRequest(... workspace) -> core validation -> projection renderer -> ExportArtifact metadata -> ShellArtifact bytes_base64 -> Web download/persistence` 均有代码落点。
- [x] 反查未发现 Web DOM/canvas capture 替代 core projection 的实现路径。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] core 可以独立导出 `svg` bytes；缺少 `graph/workspace` 时返回 `invalid_input target=graph`。
- [x] SVG renderer 覆盖 XML escaping、空图、fallback position、active path、selection 和 viewport metadata。
- [x] Platform Shell `export.profile` 可以返回 SVG `ShellArtifact`，且 include bytes 时带 base64 bytes。
- [x] Web Report Export Panel 默认 checkbox 包含 `png/cdxml/xlsx/csv/svg`，导出后展示 5 个 artifacts 和 5 个 download links。
- [x] active browser project 下导出 SVG 会写入 `exports/{basename}.svg`，并 upsert `export-artifacts-v1` record。

**明确不做逐项核对**

- [x] 未实现 PNG graph snapshot、PDF/PPTX/CDX/HTML report writer 或 Report Composer Manifest。
- [x] 未新增 Web DOM capture、canvas screenshot、Blob SVG builder、`foreignObject`、script 或远程资源引用。
- [x] 未新增 Shell command、HTTP route、Project Content schema 或 Web 前端 SVG bytes 生成逻辑。
- [x] 未把 hover、pending edge、rubber-band draft、minimap draft、history stack 或当前 DOM transform 写入 artifact。

**关键决策落地**

- [x] SVG renderer 位于 `rxnflow.export`，只消费 `ReactionGraph` / `WorkspaceSnapshot` projection。
- [x] `workspace` 存在时由 workspace 提供 graph、viewport、selection 和 active path；只传 graph 时使用默认 viewport/selection。
- [x] Web fixture transport 只模拟 Shell artifact bytes/metadata；真实 Web UI 不生成 SVG bytes。
- [x] browser persistence 的 extension/path 仍由 Web Export Format Capability helper 派生，不在组件内散落硬编码。

**挂载点反向核对**

- [x] Core report export：`rxnflow.export` 是 SVG capability、workspace-aware request、validation、projection renderer、metadata 和 artifact id/source 的核心挂载点。
- [x] Platform Shell export.profile：`rxnflow.platform` 只新增 `workspace=state.workspace` 传参，未复制 export 逻辑。
- [x] Project content export artifact codec：继续通过 `ALLOWED_EXPORT_FORMATS` 接受 supported `svg` record，无 schema 改动。
- [x] Web export surface：`exportFormatCapabilities.ts`、fixture transport、Report Export Panel 默认 formats 和 export artifact persistence 均已接入 SVG。
- [x] Public docs / CodeStable：用户/开发者导出指南、architecture、requirements 和 roadmap 已同步 SVG supported 现状。
- [x] grep 反查未发现方案外 Shell command、route、schema 或 Web SVG writer；拔除时按上述挂载点逆向移除即可回到 SVG unsupported 状态。

## 3. 验收场景核对

- [x] **S1**：core 查询 supported formats 包含 `svg`，但 PDF/PPTX/CDX 仍不 supported。
  - 证据：`tests/test_report_export_baseline.py` capability tests。
- [x] **S2**：core 导出 `formats=("svg",)` 且有 workspace 时，返回 valid UTF-8 SVG XML，root 可被 XML parser 解析，metadata graph/workspace/counts/viewport 正确。
  - 证据：`python3 -m unittest tests.test_report_export_baseline`。
- [x] **S3**：graph 为空时生成 valid empty graph SVG，metadata node/edge/path count 为 0，不报错。
  - 证据：`tests/test_report_export_baseline.py` empty graph SVG tests。
- [x] **S4**：node/edge/path label 含 XML 特殊字符时，SVG text/data attributes 可解析且语义保留。
  - 证据：`tests/test_report_export_baseline.py` XML escaping tests。
- [x] **S5**：node 缺 position 时使用 deterministic fallback position，不读取 Web layout helper 或 DOM。
  - 证据：`tests/test_report_export_baseline.py` fallback position tests。
- [x] **S6**：workspace 含 active path 和 selection 时，SVG 中有可观察 active/selected class 或 data attribute，metadata selected counts 正确。
  - 证据：`tests/test_report_export_baseline.py` active path / selection tests。
- [x] **S7**：Platform Shell `export.profile` formats 包含 svg 且 include_bytes=true 时，ShellArtifact 带 svg format、base64 bytes、writer/MIME/extension metadata。
  - 证据：`python3 -m unittest tests.test_platform_shell_baseline`。
- [x] **S8**：Web Report Export Panel 默认显示 `png/cdxml/xlsx/csv/svg` checkbox，SVG download href 为 `data:image/svg+xml;base64,...`。
  - 证据：`cd web && npm run test -- --run src/app/exportFormatCapabilities.test.ts src/app/exportArtifactPersistence.test.ts src/shell/ShellClient.test.ts src/app/WorkbenchShell.test.tsx`；Browser 桌面验收。
- [x] **S9**：active browser project 下导出 SVG 写入 `exports/{basename}.svg`，`export-artifacts-v1` record format/path/checksum 正确。
  - 证据：`web/src/app/exportArtifactPersistence.test.ts`、`web/src/app/WorkbenchShell.test.tsx`、Browser 桌面验收。
- [x] **前端桌面浏览器验证**：Vite dev server 从 `web/` 目录启动后，`http://127.0.0.1:5174/` 运行 Fixture -> Compute -> Export；看到 5 个 checkbox、5 个 download links、SVG `download="rxnflow-profile.svg"`、`data:image/svg+xml;base64`、`fixture-svg-graph-snapshot-v1`、`graph_snapshot`、workspace/selection/viewport metadata、persisted `exports/rxnflow-profile.svg` 和 checksum；console warning/error 为空，无水平溢出。
- [x] **前端窄屏浏览器验证**：Playwright `390x840` 同一导出链路显示 5 个 labels、5 个 downloads、SVG data URL、`graph_snapshot` metadata，`scrollWidth=clientWidth=390`，overlay 0，console messages 为空；截图 `/tmp/rxnflow-svg-export-narrow.png`。

## 4. 术语一致性

- `svg`：core/Web types、capability helper、fixture、persistence、docs 和 tests 均作为 supported graph snapshot export format 使用。
- `graph_snapshot`：只用于 SVG graph/workspace projection artifact，不与 energy diagram、energy table 或 report document 混用。
- `WorkspaceSnapshot`：只作为 export request 的 projection context，不改变 Project Content schema。
- `CDX/CDXML`：CDXML 仍是 supported ChemDraw XML energy diagram；CDX binary 仍 unsupported，未与 SVG graph snapshot 混淆。
- 禁用扩张：`PDF/PPTX/CDX/DOM capture/canvas screenshot/foreignObject/script/remote href` 均未进入 supported writer 路径。

## 5. 架构归并

- [x] `.codestable/architecture/core-platform.md`：Report Export supported set、Export Format Capability、SVG graph snapshot contract、workspace-backed projection、metadata 和 DOM-free 边界已更新。
- [x] `.codestable/architecture/web-workbench.md`：Report Export Panel、fixture transport、download MIME、browser persistence、QA 条目已更新为 PNG/CDXML/XLSX/CSV/SVG，且明确 Web 不生成 SVG bytes。
- [x] `.codestable/architecture/ARCHITECTURE.md`：总览中已记录 SVG 从 experimental 变为 supported，PDF/PPTX/CDX 仍未支持。
- [x] `docs/dev/web-runtime-boundary.md` 与 `docs/dev/graph-editor-e2e-qa.md`：已同步 report export / graph snapshot 的 Web runtime 与 QA 口径。
- [x] `AGENTS.md` 无需更新：既有 Web dev server、浏览器验证和结构化格式读写规则已覆盖本 feature。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md`：用户故事和边界已补 Web 直接导出 PNG/CDXML/XLSX/CSV/SVG、SVG download MIME、graph snapshot metadata、前端不生成 SVG bytes。
- [x] `.codestable/requirements/project-content-persistence.md`：已补 active browser project 下 SVG inline artifact 写入 `exports/...` 并复用 `export-artifacts-v1` index。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-items.yaml` 中 `export-graph-snapshot-svg` 已改为 `done`，feature 指向本目录。
- [x] `.codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-roadmap.md` 背景、模块拆分、Graph Snapshot Contract、后续 delivery boundary 已同步为 SVG supported 现状。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新通用工作流规则。现有 `web/` Vite dev server 和浏览器验证要求已经足够。

## 9. 遗留

- 后续优化点：roadmap 下一项是 `web-report-preview-panel`，用当前 CSV/SVG artifacts 组合报告预览 readiness。
- 已知限制：SVG graph snapshot 是 projection-based snapshot，不是 Web DOM/canvas capture；不包含 hover、pending edge、rubber-band、minimap draft、history stack 或当前 DOM transform。
- 已知限制：PDF/PPTX/CDX、HTML report、Report Composer Manifest、PNG graph snapshot 和 molecule-level ChemDraw CDX 仍未支持。
- 顺手发现：暂无需要单独开 issue 的新问题。

## 验证命令

- `python3 -m unittest tests.test_report_export_baseline tests.test_platform_shell_baseline tests.test_export_artifact_index_persistence`
- `python3 -m unittest discover`
- `cd web && npm run test -- --run src/app/exportFormatCapabilities.test.ts src/app/exportArtifactPersistence.test.ts src/shell/ShellClient.test.ts src/app/WorkbenchShell.test.tsx`
- `cd web && npm run build`
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-25-export-graph-snapshot-svg/export-graph-snapshot-svg-checklist.yaml --yaml-only`
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-items.yaml --yaml-only`
- `git diff --check`
