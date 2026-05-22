# Export XLSX Workbook Template 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：codestable/features/2026-05-21-export-xlsx-workbook-template/export-xlsx-workbook-template-design.md

## 1. 接口契约核对

- [x] Public `ReportExportService.export()` 和 `ExportRequest(formats=("xlsx", ...))` 未改变。
- [x] `_render_xlsx()` 已拆成 `_write_energy_table_sheet()`、`_write_group_header_row()`、`_write_energy_profile_sheet()`、`_write_warnings_sheet()`、`_write_export_metadata_sheet()` 等内部 helper。
- [x] `Energy Table` sheet 使用 title row、group header row、column label row、freeze pane、autofilter 和按列类型设置的 column widths。
- [x] `Export Metadata` sheet 已新增，记录 `energy_table_schema_version`、column count、row count、title、profile id、graph id 和 path id。

## 2. 行为与决策核对

- [x] Writer id 仍为 `xlsxwriter-energy-workbook-v1`，XLSX artifact 仍返回 `.xlsx` zip bytes。
- [x] Workbook 包含 `Energy Table`、`Energy Profile`、`Warnings` 和 `Export Metadata` sheets；无 warnings 时不强制创建空 `Warnings` sheet。
- [x] 既有数据字符串 `template-row`、`A`、`B`、`Check TS entropy` 仍在 workbook XML/shared strings 中可见。
- [x] 缺少 XlsxWriter 时仍返回 `export_failed target=dependency`，未改 import-time 依赖边界。

明确不做核对：

- [x] 未新增 CSV/CDX/PDF/PPTX/SVG ExportFormat。
- [x] 未读取用户 workbook 模板。
- [x] 未新增 Excel chart、宏、图片、公式重算或 pivot table。
- [x] 未修改 PNG/CDXML writer、Web Report Export Panel 或 Project Content schema。

挂载点反向核对：

- [x] 挂载点集中在 `rxnflow.export` 的 XLSX writer helpers 和 `tests/test_report_export_baseline.py` 的 workbook XML regression tests。
- [x] 拔除沙盘推演：移除 helper 和测试后，XLSX 模板增强消失；其他 export format 和 Web 投影不需要回退。

## 3. 验收场景核对

- [x] S1-S2：XLSX zip bytes、writer id、四张 sheet 存在由 `test_xlsx_writer_outputs_energy_profile_and_warning_sheets` 覆盖。
- [x] S3-S5：title/group header/label row、merged cells、autofilter、freeze pane、column widths 由 `test_xlsx_energy_table_layout_has_group_headers_filter_and_freeze_pane` 覆盖。
- [x] S6-S7：metadata sheet 和既有数据字符串由 `test_xlsx_writer_outputs_energy_profile_and_warning_sheets` 覆盖。
- [x] S8：无 warning 时不创建 `Warnings` sheet，由 `test_xlsx_warning_sheet_is_omitted_without_warnings` 覆盖。
- [x] S9：XlsxWriter dependency failure 由既有 `test_writer_dependency_failures_return_export_failed_without_import_breakage` 覆盖。

当前环境 `soffice` 和 `pdftoppm` 均不可用，未做真实 spreadsheet render 截图；本轮用 workbook zip/xml 结构检查替代 visual QA。

## 4. 术语一致性

- XLSX Workbook Template：设计、代码和 architecture 均指向 `ReportExportService` 的 XLSX workbook layout。
- Group Header Row：代码 helper 为 `_write_group_header_row()`，测试通过 merged cells 间接验证。
- Export Metadata Sheet：代码 helper 为 `_write_export_metadata_sheet()`，架构文档已归并。

## 5. 架构归并

- [x] `codestable/architecture/core-platform.md`：已补 XLSX group header、autofilter、freeze pane、列宽策略和 `Export Metadata` sheet。
- [x] `codestable/architecture/ARCHITECTURE.md`：已补 XLSX workbook 当前布局和 metadata sheet 现状。

## 6. requirement 回写

无新增用户故事。本 feature 增强现有 XLSX artifact 质量，不更新 requirement。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-items.yaml`：`export-xlsx-workbook-template` 已标为 `done`。
- [x] `codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-roadmap.md`：第 5 节子 feature 清单已同步状态和环境限制。

## 8. AGENTS.md / CLAUDE.md 候选盘点

当前环境没有 `soffice` / `pdftoppm`，但这属于可选 spreadsheet visual render 工具缺失，不需要写入 AGENTS.md。

## 9. 遗留

- 若后续需要真正视觉 QA，可安装 LibreOffice / Poppler 后补 render screenshot 检查。
- CSV 仍未开放；若做 CSV，应复用 `ENERGY_TABLE_COLUMNS` 和 `build_energy_table_rows`。

## 验证记录

- `python3 -m unittest tests.test_report_export_baseline`：13 tests OK。
- `python3 -m unittest discover`：248 tests OK。
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-21-export-xlsx-workbook-template/export-xlsx-workbook-template-checklist.yaml --yaml-only`：passed。
- `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-items.yaml --yaml-only`：passed。
