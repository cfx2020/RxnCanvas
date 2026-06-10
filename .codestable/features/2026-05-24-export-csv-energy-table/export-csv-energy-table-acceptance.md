---
doc_type: feature-acceptance
feature: 2026-05-24-export-csv-energy-table
status: accepted
accepted_at: 2026-05-25
summary: CSV 能量表导出已落地，复用 energy-table-v1 与 Shell/Web artifact persistence，SVG/PDF/PPTX/CDX 仍保持未支持边界
tags: [report-export, csv, energy-table, shell-artifact, web-persistence]
---

# export-csv-energy-table 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-25
> 关联方案 doc：`.codestable/features/2026-05-24-export-csv-energy-table/export-csv-energy-table-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] core `ExportFormat` / Web `ExportFormat` 已包含 `csv`，`supported_export_formats()` 和 Web `supportedExportFormats()` 返回 `png/cdxml/xlsx/csv`。
- [x] `ReportExportService().export(... formats=("csv",) ...)` 返回 `format="csv"` artifact，writer id 为 `python-csv-energy-table-v1`，MIME 为 `text/csv`，extension 为 `csv`。
- [x] CSV header 使用 `ENERGY_TABLE_COLUMNS[*].label`，第一列为 `Structure`，列顺序与 XLSX Energy Table Contract 一致。
- [x] CSV metadata 包含 `energy_table_schema_version=energy-table-v1`、`energy_table_column_count`、`energy_table_row_count`、`writer_id`、`mime_type`、`extension`、`artifact_kind` 和 `format_status`。
- [x] Web download / persistence 只消费 Shell inline bytes：CSV download 为 `data:text/csv;base64,...`，browser-local persistence 写入 `exports/{basename}.csv`。

**名词层“现状 -> 变化”逐项核对**

- [x] `CSV Energy Table` 已成为 supported export format；它不是 CSV import，也不是用户私有 Excel/CSV 模板读取。
- [x] `Energy Table Contract` 仍为 `energy-table-v1`，未新增或重排 `ENERGY_TABLE_COLUMNS`。
- [x] `export-artifacts-v1` 未升级 schema，只因 `ALLOWED_EXPORT_FORMATS` 增加 supported `csv` 而接受 CSV artifact record。

**流程图核对**

- [x] `ExportRequest.formats includes csv -> validation -> build_energy_table_rows() -> _render_csv() -> ExportArtifact metadata -> ShellArtifact -> Web download/persistence` 均有代码落点。
- [x] Platform Shell 未新增 command；`export.profile` 继续透传 runtime artifacts。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] CSV 已从 capability matrix 的 unsupported 变为 supported，并进入 core/Web 默认报告导出集合。
- [x] CSV 与 XLSX 共用 `build_energy_table_rows()` 和 `ENERGY_TABLE_COLUMNS`，没有另起字段清单。
- [x] 空值保持空 cell，float 使用稳定 `"{value:.12g}"` 字符串化，字符串由 Python `csv.writer` 负责 quoting，不补 `0` 或 `NA`。
- [x] Web Report Export Panel 默认 checkbox 包含 `png/cdxml/xlsx/csv`，导出后展示 4 个 artifacts 和 4 个 download links。

**明确不做逐项核对**

- [x] 未实现 CSV import、Excel 模板读取、公式、多 sheet 或 warnings sidecar 文件。
- [x] 未新增或开放 SVG/PDF/PPTX/CDX writer、supported set 或 Web checkbox。
- [x] 未新增 Shell command、HTTP route、Project Content schema 或 Web 前端 CSV bytes 生成逻辑。
- [x] 未读取用户 Excel/CSV 模板，也未用 CSV writer 反向导入数据。

**关键决策落地**

- [x] CSV writer 位于 `rxnflow.export`，只消费 `EnergyTableRow` tuple，不调用 parser、registry、energy engine 或 workbook reader。
- [x] `ExportArtifactRecord` / `export-artifacts-v1` 继续复用既有 codec 和 schema。
- [x] Web fixture transport、capability helper、download MIME 和 browser persistence guard 使用同一 Web capability 口径。

**挂载点反向核对**

- [x] Core report export：`rxnflow.export` 是 CSV writer、validation、capability 和 metadata 的唯一核心挂载点。
- [x] Project content export artifact codec：通过 `ALLOWED_EXPORT_FORMATS` 接受 CSV record，无 schema 改动。
- [x] Web helper/UI/persistence：`exportFormatCapabilities.ts`、fixture transport、Report Export Panel 默认 formats 和 export artifact persistence 均已接入 CSV。
- [x] Public docs / CodeStable：用户指南、开发者指南、architecture、requirements 和 roadmap 已同步 CSV supported 现状。
- [x] grep 反查未发现方案外 Shell command、route、schema 或 Web CSV writer；拔除时按上述挂载点逆向移除即可回到 CSV unsupported 状态。

## 3. 验收场景核对

- [x] **S1**：core 查询 supported formats 包含 `csv`，但 SVG/PDF/PPTX/CDX 仍不 supported。
  - 证据：`tests/test_report_export_baseline.py`，guard grep。
- [x] **S2**：core 导出 `formats=("csv",)` 且有 profile/objects/table_rows 时，UTF-8 CSV 第一行为 `ENERGY_TABLE_COLUMNS` labels，第一列为结构名称。
  - 证据：`python3 -m unittest tests.test_report_export_baseline`。
- [x] **S3**：CSV rows 含 float/string/None/missing profile 时，数字稳定、字符串按 CSV quoting 转义、缺失字段为空。
  - 证据：`tests/test_report_export_baseline.py` CSV writer tests。
- [x] **S4**：core 同时导出 `("csv", "xlsx")` 时，两者共用 row count 和 energy table metadata，顺序保持请求顺序。
  - 证据：`tests/test_report_export_baseline.py` shared metadata/order test。
- [x] **S5**：Platform Shell `export.profile` formats 包含 csv 且 include_bytes=true 时，ShellArtifact 带 csv format、base64 bytes、writer/MIME/extension metadata。
  - 证据：`python3 -m unittest tests.test_platform_shell_baseline`。
- [x] **S6**：Web Report Export Panel 默认显示 `png/cdxml/xlsx/csv` checkbox，CSV download href 为 `data:text/csv;base64,...`。
  - 证据：`cd web && npm run test -- --run src/app/WorkbenchShell.test.tsx src/app/exportFormatCapabilities.test.ts src/app/exportArtifactPersistence.test.ts src/shell/ShellClient.test.ts`；Browser 插件桌面验收。
- [x] **S7**：active browser project 下导出 CSV 写入 `exports/{basename}.csv`，`export-artifacts-v1` record format/path/checksum 正确。
  - 证据：`web/src/app/exportArtifactPersistence.test.ts`、`web/src/app/WorkbenchShell.test.tsx`。
- [x] **前端浏览器验证**：`http://127.0.0.1:5173/` 下运行 Fixture -> Compute -> Export；桌面 `1280x720` 显示 4 个 artifacts、4 个 download links、CSV `data:text/csv;base64`、`energy-table-v1` metadata，console warn/error 为空，`scrollWidth=clientWidth=1280`。
- [x] **窄屏浏览器验证**：`390x840` 下同一导出链路显示 CSV artifact、CSV MIME、energy-table metadata，无 SVG/PDF/PPTX/CDX checkbox，console warn/error 为空，`scrollWidth=clientWidth=390`。

## 4. 术语一致性

- `csv`：core/Web types、capability helper、fixture、persistence、docs 和 tests 均作为 supported energy table export format 使用。
- `energy-table-v1`：未升级；XLSX/CSV metadata 均使用同一 schema version、column count 和 row count 口径。
- `CSV Browser Persistence`：只指 Web 保存 Shell inline bytes 到 browser-local `exports/...`，没有前端生成 CSV bytes。
- 禁用扩张：`svg/pdf/pptx/cdx` 仍只作为 unsupported/experimental 能力边界存在。

## 5. 架构归并

- [x] `.codestable/architecture/core-platform.md`：Report Export supported set、CSV writer、Energy Table Contract、metadata 和错误边界已更新。
- [x] `.codestable/architecture/web-workbench.md`：Report Export Panel、fixture transport、download MIME、browser persistence、QA 条目已更新为 PNG/CDXML/XLSX/CSV。
- [x] `.codestable/architecture/ARCHITECTURE.md`：总览中已记录 Report Export PNG/CDXML/XLSX/CSV 基线导出和 SVG/PDF/PPTX/CDX 未支持边界。
- [x] `AGENTS.md` 无需更新：既有 Web dev server、浏览器验证和结构化格式读写规则已覆盖本 feature。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md`：用户故事和边界已补 Web 直接导出 PNG/CDXML/XLSX/CSV、CSV download MIME、前端不生成 CSV bytes。
- [x] `.codestable/requirements/project-content-persistence.md`：已补 active browser project 下 CSV inline artifact 写入 `exports/...` 并复用 `export-artifacts-v1` index。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-items.yaml` 中 `export-csv-energy-table` 已改为 `done`，feature 指向本目录。
- [x] `.codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-roadmap.md` 子 feature 清单、推进顺序和观察项已同步。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新通用工作流规则。

## 9. 遗留

- 后续优化点：`export-graph-snapshot-svg` 是 roadmap 下一项，用于补报告中的图谱资产。
- 已知限制：CSV 是 UTF-8 单表 artifact，不包含公式、多 sheet、样式、warnings sidecar 或用户模板；SVG/PDF/PPTX/CDX 仍未支持。
- 顺手发现：Report Export 空态 i18n 文案仍只列 PNG/CDXML/XLSX，验收中已同步补上 CSV。

## 验证命令

- `python3 -m unittest tests.test_report_export_baseline`
- `python3 -m unittest tests.test_export_artifact_index_persistence`
- `python3 -m unittest tests.test_platform_shell_baseline`
- `python3 -m unittest discover`
- `cd web && npm run test -- --run src/app/WorkbenchShell.test.tsx src/app/exportFormatCapabilities.test.ts src/app/exportArtifactPersistence.test.ts src/shell/ShellClient.test.ts`
- `cd web && npm run build`
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-24-export-csv-energy-table/export-csv-energy-table-checklist.yaml --yaml-only`
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-items.yaml --yaml-only`
- `git diff --check`
