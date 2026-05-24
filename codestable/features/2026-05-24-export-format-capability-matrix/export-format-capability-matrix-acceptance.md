---
doc_type: feature-acceptance
feature: 2026-05-24-export-format-capability-matrix
status: accepted
accepted_at: 2026-05-24
summary: 导出格式能力矩阵已落地，core/Web/docs 共享当前 supported 与 unsupported/experimental 格式边界
tags: [report-export, export-format, shell-artifact, web-persistence, capability-matrix]
---

# export-format-capability-matrix 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-24
> 关联方案 doc：`codestable/features/2026-05-24-export-format-capability-matrix/export-format-capability-matrix-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `export_format_capability("cdxml")` 返回 extension=`cdxml`、MIME=`chemical/x-cdxml`、status=`supported`：`rxnflow/export.py` 已实现 `ExportFormatCapability` / `EXPORT_FORMAT_CAPABILITIES` / `export_format_capability()`；`tests/test_report_export_baseline.py` 已断言。
- [x] `supported_export_formats()` 不包含 `csv`：`ALLOWED_EXPORT_FORMATS = supported_export_formats()`，测试断言 supported set 仍为 `png/cdxml/xlsx`。
- [x] `_artifact_metadata()` 补 `extension`、`mime_type`、`artifact_kind`、`format_status`：PNG/CDXML/XLSX artifact metadata 单测已覆盖。
- [x] Web helper 提供 report defaults、MIME、extension、writer id 和 persistence guard：`web/src/app/exportFormatCapabilities.ts` 已实现，`web/src/app/exportFormatCapabilities.test.ts` 已覆盖。

**名词层“现状 -> 变化”逐项核对**

- [x] `ExportFormat` 仍只代表可执行格式集合：core/Web type 仍为 `png/cdxml/xlsx`，未加入 CSV/SVG/PDF/PPTX/CDX。
- [x] `ShellArtifact` 未新增顶层必填字段：新增信息只进入 metadata 和 Web helper，Shell response shape 未变。
- [x] Browser Persistence Allowlist 从 helper 派生：`exportArtifactPersistence.ts` 使用 `supportsBrowserPersistence()` 和 `extensionForExportFormat()`。

**流程图核对**

- [x] `ExportRequest.formats -> supported_export_formats() validation -> render existing writer -> metadata enriched -> ShellArtifact -> Web download/persistence` 均有代码落点；未新增 Shell command、HTTP route 或 Web bytes writer。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] core、fixture、ReportExportPanel、browser persistence 和 docs 使用同一格式能力口径：core 有权威能力表，Web 有镜像 helper 与 tests，开发者/用户指南已说明当前矩阵。
- [x] 本 feature 不开放新导出格式：UI checkbox 仍只有 `png/cdxml/xlsx`；`csv/svg/pdf/pptx/cdx` 不进入 supported set。

**明确不做逐项核对**

- [x] 未实现 CSV writer，未把 `csv` 加入 Web checkbox。
- [x] 未实现 SVG/PDF/PPTX/CDX writer。
- [x] 未修改 `export-artifacts-v1` schema。
- [x] 未新增 Shell command 或 HTTP route。
- [x] 未在 Web 前端生成导出 bytes。

**关键决策落地**

- [x] core 为 authority：`rxnflow.export.EXPORT_FORMAT_CAPABILITIES` 是核心来源，`ALLOWED_EXPORT_FORMATS` 从 supported helper 派生。
- [x] Web helper 是只读镜像：用于 UI/persistence/fixture，测试固定与当前 core/docs 口径一致。
- [x] MIME/extension/status 进入 artifact metadata，不破坏 ShellArtifact 顶层 shape。

**挂载点反向核对**

- [x] Core export registry：`rxnflow.export` 新增 capability table/helper 和 metadata enrichment。
- [x] Web export format helper：`web/src/app/exportFormatCapabilities.ts` 被 ReportExportPanel、fixture transport、persistence 和 WorkbenchShell 默认 options 使用。
- [x] Public docs：`docs/dev/report-export-artifacts.md` 与 `docs/user/report-export-artifacts.md` 已更新能力矩阵和 unsupported 边界。
- [x] grep 反查未发现方案外系统级挂载点；测试文件只作为验证证据。
- [x] 拔除沙盘：移除 core capability/helper、Web helper、docs 更新即可回到旧白名单散落形态；无 schema/route/command 残留。

## 3. 验收场景核对

- [x] core 查询能力表返回 `png/cdxml/xlsx/csv/svg/pdf/pptx/cdx`，supported set 仍只有 `png/cdxml/xlsx`。
  - 证据：`python3 -m unittest tests.test_report_export_baseline`、`python3 -m unittest discover`。
- [x] core 导出 PNG/CDXML/XLSX metadata 包含 capability 字段与既有 writer id。
  - 证据：`tests/test_report_export_baseline.py`。
- [x] core 请求 `formats=("csv",)` 仍返回 `invalid_input target=formats`，supported 不包含 csv。
  - 证据：`tests/test_report_export_baseline.py`。
- [x] Web Report Export Panel 默认 checkbox 仍只有 png/cdxml/xlsx，download MIME 来自 helper。
  - 证据：`web/src/app/exportFormatCapabilities.test.ts`、`web/src/app/WorkbenchShell.test.tsx`、浏览器桌面验证。
- [x] Web persistence 遇到 unsupported artifact format 会 skip，不写 `exports/...` 或 `export-artifacts-v1` record。
  - 证据：`web/src/app/exportArtifactPersistence.test.ts`。
- [x] fixture `export.profile` writer_id、mime_type、extension metadata 与 helper 对齐。
  - 证据：`web/src/shell/ShellClient.test.ts`。
- [x] 前端浏览器验证：Vite dev server 下运行 Fixture -> Compute -> Export，Report Export 面板显示 3 个 checkbox、3 个 artifact card、3 个 download link，CSV/SVG/PDF/PPTX/CDX 不出现在 checkbox；控制台 error 为 0，桌面无水平溢出。
- [x] 前端窄屏验证：Playwright Chromium 390x840 运行同一 export flow，labels 为 `png/cdxml/xlsx/Basename/Report title/Include bytes`，3 个 artifact、3 个 download link，`scrollWidth=clientWidth=390`，无 Vite overlay 和 console error/warning。

## 4. 术语一致性

- `Export Format Capability`：core 类型、Web helper、docs 和 architecture 均使用同一概念。
- `ExportFormat`：仍只表示可执行格式集合，没有混用为能力记录。
- `Browser Persistence Allowlist`：落到 Web helper 派生 guard，没有继续保留独立 hard-coded set。
- 禁用扩张：`csv/svg/pdf/pptx/cdx` 只出现在 capability/docs/tests/roadmap 边界说明中，没有 writer 或 UI checkbox。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：术语表和 Report Export 约束已补 Export Format Capability、metadata enrichment 和未支持格式边界。
- [x] `codestable/architecture/core-platform.md`：Report Export 当前能力、模块职责、稳定协议和边界已补 capability authority、supported set 派生和 CSV/SVG/PDF/PPTX/CDX 非 supported 现状。
- [x] `codestable/architecture/web-workbench.md`：模块树、WorkbenchShell、Report Export Panel、fixture transport、persistence 和 QA 说明已补 Web helper 消费边界。
- [x] `AGENTS.md` 无需更新：既有“文件格式读写优先结构化解析/生成、前端必须浏览器验证、Web dev server 预览”规则已经覆盖本 feature。

## 6. requirement 回写

- [x] 本 feature 是既有 Report Export / Web persistence 能力的格式契约收敛，不新增独立用户可感能力；`web-workbench-shell` 与 `project-content-persistence` 的用户故事仍成立。
- [x] 用户/开发者指南已更新当前可执行格式与 unsupported/experimental 边界，因此不新增 requirement 文档。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-items.yaml` 中 `export-format-capability-matrix` 已从 `in-progress` 改为 `done`，feature 仍指向本目录。
- [x] `codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-roadmap.md` 子 feature 清单、推进顺序和观察项已同步。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新通用工作流规则。

## 9. 遗留

- 后续优化点：`export-csv-energy-table`、`export-graph-snapshot-svg`、`delivery-format-boundary-spike` 仍按 roadmap 后续 feature 推进。
- 已知限制：CSV/SVG/PDF/PPTX/CDX 仍不可执行；Web helper 目前是 core capability 的手写镜像，后续可考虑由 core 生成 JSON/TS 常量以减少双维护。
- 顺手发现：无。

## 验证命令

- `python3 -m unittest tests.test_report_export_baseline`
- `python3 -m unittest discover`
- `cd web && npm run test -- --run src/app/exportFormatCapabilities.test.ts src/app/exportArtifactPersistence.test.ts src/shell/ShellClient.test.ts src/app/WorkbenchShell.test.tsx`
- `cd web && npm run build`
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-24-export-format-capability-matrix/export-format-capability-matrix-checklist.yaml --yaml-only`
- `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-items.yaml --yaml-only`
- `git diff --check`
