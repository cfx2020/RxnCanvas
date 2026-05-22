# Export Energy Table Contract 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：codestable/features/2026-05-21-export-energy-table-contract/export-energy-table-contract-design.md

## 1. 接口契约核对

- [x] `ENERGY_TABLE_SCHEMA_VERSION` 已落地为 `energy-table-v1`。
- [x] `energy_table_columns_by_key()` 返回按 stable column key 索引的 `EnergyTableColumn`。
- [x] `normalize_energy_table_header(header, context=...)` 已落地，可映射 `Egas`、`basis function`、`Ggas+1M`、`Ggas(shermo+1M)`、`Esol`、`Gsol` 等稳定样表表头。
- [x] entropy 原始列如 `Sgau,tran`、`Swhit,tran`、`RT*0.239006/1000` 返回 `None`，不被自动推断成能量字段。
- [x] XLSX artifact metadata 对 `xlsx` 格式带出 `energy_table_schema_version` 和 `energy_table_column_count`。

流程图核对：`ENERGY_TABLE_COLUMNS` → schema helper / header mapping / row builder → XLSX writer 当前路径已在 `rxnflow.export` 中落地；CSV 仍只是后续复用方向，没有 runtime 分支。

## 2. 行为与决策核对

- [x] 第一列仍是 `structure_name` / `Structure`。
- [x] 所有 column key 唯一。
- [x] Manual `EnergyTableRow` 保持优先，profile merge 使用 `setdefault`，不会覆盖已有 `relative_energy`。
- [x] Profile-only 输入从 `EnergyPoint.label` 生成结构名行；missing point 保留 `missing_reason`，不写假 `relative_energy`。
- [x] ChemicalObject 只有 `electronic` energy 时只映射 `egas_*`，不写 basis function。
- [x] ChemicalObject 有 `thermochemistry["ggas_1m"]` 时映射 Ggas+1M 成对列。

明确不做核对：

- [x] 未新增 `csv` / `cdx` ExportFormat；`ALLOWED_EXPORT_FORMATS` 仍为 PNG/CDXML/XLSX。
- [x] 未读取或提交用户 workbook 原文件。
- [x] 未修改 PNG/CDXML writer、Web Report Export Panel、parser、ChemicalObject、Project Content 或 Web repository。
- [x] 缺失 basis/entropy/standard-state 字段保持 absent，不补 0。

挂载点反向核对：

- [x] 挂载点集中在 `rxnflow.export` 的 schema/helper/metadata 和 `tests/test_report_export_baseline.py` 的契约测试。
- [x] 拔除沙盘推演：删除新增 schema/helper/metadata 与对应 tests 后，本 feature 行为消失；PNG/CDXML/Web/parser/project schema 不需要回退。

## 3. 验收场景核对

- [x] S1-S3：schema version、column 唯一性和 `energy_table_columns_by_key()` 行为由 `test_export_contracts_and_input_validation` 覆盖。
- [x] S4-S7：用户 workbook header mapping 与 entropy 原始列 `None` 语义由 `test_energy_table_header_mapping_covers_user_workbook_headers` 覆盖。
- [x] S8-S9：ChemicalObject energy / thermochemistry 映射由 `test_energy_table_rows_are_structure_first_and_do_not_invent_missing_values` 覆盖。
- [x] S10-S11：manual row 优先和 profile-only missing point 由 `test_energy_table_row_merge_keeps_manual_values_and_profile_only_rows` 覆盖。
- [x] S12：`csv` / `cdx` 仍 `invalid_input target=formats`，由 `test_export_contracts_and_input_validation` 覆盖。

本 feature 无前端视觉改动，不需要浏览器肉眼验证。

## 4. 术语一致性

- Energy Table Contract：设计、代码和 architecture 使用同一含义。
- Energy Table Schema Version：代码为 `ENERGY_TABLE_SCHEMA_VERSION`，文档为 `energy-table-v1`。
- Workbook Header Mapping：代码 helper 为 `normalize_energy_table_header()`，架构文档已归并。
- CSV/CDX：仍只作为明确不做和后续方向出现，没有 runtime export format。

## 5. 架构归并

- [x] `codestable/architecture/core-platform.md`：已补 `EnergyTableColumn`、`ENERGY_TABLE_SCHEMA_VERSION`、列 key helper、header mapping、entropy 原始列不自动推断和缺失值不补 0。
- [x] `codestable/architecture/ARCHITECTURE.md`：已补 Energy Table `energy-table-v1`、Workbook Header Mapping 和 XLSX 导出 schema metadata 现状。

## 6. requirement 回写

无新增用户可见能力。`web-workbench-shell` 已记录 Web 导出入口，本 feature 是核心契约补强，不新增或更新 requirement。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-items.yaml`：`export-energy-table-contract` 已标为 `done`。
- [x] `codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-roadmap.md`：第 5 节子 feature 清单已同步状态和落地摘要。
- [x] roadmap YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的通用工作流信息。

## 9. 遗留

- `export-xlsx-workbook-template` 仍需强化 workbook 布局、公式/格式策略和 spreadsheet visual QA。
- `export-csv-energy-table` 如后续需要，应复用本 feature 的 `ENERGY_TABLE_COLUMNS` 和 `build_energy_table_rows`，不要单独维护字段清单。
- CDX 仍未开放，需单独调研二进制格式或转换策略后再起 feature。

## 验证记录

- `python3 -m unittest tests.test_report_export_baseline`：11 tests OK。
- `python3 -m unittest discover`：246 tests OK。
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-21-export-energy-table-contract/export-energy-table-contract-checklist.yaml --yaml-only`：passed。
- `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-items.yaml --yaml-only`：passed。
