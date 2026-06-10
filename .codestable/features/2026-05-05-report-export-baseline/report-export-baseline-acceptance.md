# report-export-baseline 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-05
> 关联方案 doc：.codestable/features/2026-05-05-report-export-baseline/report-export-baseline-design.md

## 1. 接口契约核对

对照方案第 2.1 节，导出名词和服务入口已落地：

- [x] ExportFormat：`rxnflow/export.py:24`，允许格式为 `png`、`cdxml`、`xlsx`。
- [x] ExportArtifact：`rxnflow/export.py:32`，包含 id、format、path、bytes、created_at 和 metadata。
- [x] ExportRequest：`rxnflow/export.py:90`，包含 formats、graph、profile、objects、table_rows、destination_dir、basename、title 和 options。
- [x] EnergyTableColumn / EnergyTableRow：`rxnflow/export.py:42`、`:51`，第一列语义为 structure_name。
- [x] EnergyDiagramState / EnergyDiagramRoute / CdxmlDiagramOptions：`rxnflow/export.py:61`、`:70`、`:80`。
- [x] ReportExportService.export：`rxnflow/export.py:137`，返回 `Result[tuple[ExportArtifact, ...]]`。

接口示例核对：

- [x] PNG + XLSX bytes 导出由 `tests/test_report_export_baseline.py:182` 和 `:227` 覆盖。
- [x] CDXML 写入与 XML 结构由 `tests/test_report_export_baseline.py:88` 和 `:250` 覆盖。

流程图核对：`export(project_id, request)` 先校验 project/formats/input，再解析 basename 和 destination，按 formats 顺序调用 writer，最后构造 ExportArtifact 并可选写盘。实现落点集中在 `ReportExportService.export`、`_validate_export_request`、`_resolve_basename`、`_resolve_destination` 和 `_render_format`。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] 已计算好的 EnergyProfile 可导出 PNG energy plot。
- [x] EnergyProfile 可导出 ChemDraw 可编辑的 CDXML energy diagram。
- [x] ChemicalObject / EnergyProfile / table_rows 可导出 Excel `.xlsx` 结构能量表。
- [x] 支持内存 bytes 返回，也支持写入已有 destination_dir 并返回 artifact path。
- [x] 统一使用 ExportArtifact 和 Result 错误/警告语义。

明确不做核对：

- [x] 未新增 Web route、CLI 命令、桌面保存面板或真实报告预览 UI。
- [x] 未写 `.rxnflow/manifest.json`，未新增 ProjectResource，未持久化 graph/profile/export index。
- [x] 未调用 ParserRegistry、ProjectStore.add_raw_file、ImportRegistryWorkflow、ChemicalRegistry 或 GraphPatch。
- [x] 未调用 EnergyProfileEngine 重新计算能量。
- [x] PNG 不导出 graph canvas screenshot、组合报告整页或交互图表。
- [x] CDXML 不从 3D geometry 自动推断 bonds，不生成 molecule-level CDXML 或 generic reaction scheme。
- [x] XLSX 不读/改已有 Excel 模板，不生成宏、Excel chart 或图片嵌入。
- [x] 未实现 CDX、CSV、PDF、PPTX、SVG、JSON、SDF、MOL 或批量目录导出。

关键决策落地：

- [x] 导出消费已加载对象，不查项目持久化：ExportRequest 直接接收 graph/profile/objects/table_rows。
- [x] PNG/CDXML 共用 Energy Diagram Route：`build_energy_diagram_route` 供两类 writer 使用。
- [x] XLSX 以结构能量表为主：`ENERGY_TABLE_COLUMNS[0]` 为 Structure。
- [x] CDXML 来源固定为 EnergyProfile：state line、connector、label 和 relative value 来自 profile points。
- [x] CSV 和 CDX 暂不进入 baseline：请求 `csv` / `cdx` 返回 invalid_input。
- [x] Export Service 不反向修改核心状态：范围守护测试确认没有 ProjectStore、ParserRegistry、ImportRegistryWorkflow、ChemicalRegistry、GraphPatch、EnergyProfileEngine 依赖。
- [x] Pillow / XlsxWriter 在 writer 内延迟 import；缺依赖时返回 export_failed。

跨层纪律核对：

- [x] 错误语义：缺 project id、空 formats、缺 profile、缺 xlsx 数据返回 invalid_input；依赖或目标目录问题返回 export_failed。
- [x] 顺序性：artifact 顺序与 request.formats 一致。
- [x] 文件边界：destination_dir 必须存在且为目录；basename 不允许路径分隔符或 `..`。
- [x] 可观测点：artifact metadata 记录 graph/profile/path/object count/format/bytes length/writer id/title。
- [x] 依赖边界：service module import 不要求 Pillow / XlsxWriter 存在。

挂载点核对：

- [x] 新增挂载点限于 `rxnflow/export.py` 和 `tests/test_report_export_baseline.py`，后续 Platform Shell 只消费该核心服务。
- [x] 反向 grep 确认导出实现没有越界引用 parser/import/registry/graph patch/energy compute/UI。
- [x] 拔除沙盘推演：移除 `rxnflow/export.py` 和对应测试后，既有核心模型、parser、import、registry、graph、workspace、energy 仍保持独立。

## 3. 验收场景核对

对照方案第 3 节，关键场景已覆盖：

- [x] S1-S5：空 project id、空 formats、png/cdxml 缺 profile、xlsx 缺数据均返回 invalid_input；证据 `tests/test_report_export_baseline.py:45`。
- [x] S6-S7：有效 EnergyProfile 与 missing point 的 PNG 导出成功，PNG signature、尺寸、非空像素、warnings 和 metadata 均验证；证据 `tests/test_report_export_baseline.py:227`。
- [x] S8-S10：XLSX 是 zip workbook，含 Energy Table、Energy Profile、Warnings，并保留结构名称、相对能量和 warning；证据 `tests/test_report_export_baseline.py:182`。
- [x] S11-S12：CDXML XML well-formed，含 CDXML/page/colortable/fonttable/state labels/relative value/connectors；missing point 不生成伪 state line；证据 `tests/test_report_export_baseline.py:250`、`:272`。
- [x] S13-S16：多格式导出顺序、destination_dir 写盘、basename 安全校验和不存在目录错误已覆盖；证据 `tests/test_report_export_baseline.py:88`。
- [x] S17：Pillow / XlsxWriter 缺失时 writer 返回 export_failed，service import 不失败；证据 `tests/test_report_export_baseline.py:289`。
- [x] S18：请求 cdx 或 csv 返回 invalid_input；证据 `tests/test_report_export_baseline.py:45`。
- [x] S19：现有核心 fixture 回归通过；证据 `tests/test_report_export_baseline.py:304` 和 `python3 -m unittest discover`。

本 feature 没有前端视觉或浏览器 UI 改动，不需要浏览器肉眼验证。

## 4. 术语一致性

- Report Export Service / Export Request / Export Artifact / Energy Table / Energy Diagram Route / PNG Energy Plot / CDXML Energy Diagram / XLSX Energy Workbook 已在 design、architecture 和 implementation 中统一。
- CSV Energy Table 和 CDX Export 仅作为明确不做/后续候选存在，没有作为当前 ExportFormat 实现。
- scope guard 未发现 Web route、CLI 命令、桌面保存面板、ProjectResource 持久化或新导出格式的越界实现。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已补 Report Export Service、Energy Table、Energy Diagram Route，以及 PNG/CDXML/XLSX 能力边界。
- [x] `.codestable/architecture/core-platform.md`：已补第九类 Report Export、模块图、稳定协议、错误语义和约束边界。
- [x] AGENTS.md 不需要更新：本 feature 未新增每个后续 feature 都必须遵守的环境命令或工作流规约。

## 6. requirement 回写

- [x] design frontmatter 为 `requirement: null`。
- [x] 本 feature 是核心 API 能力，没有新增用户直接可点击/可运行入口；用户可感的统一入口已在后续 `platform-shell-entry` requirement 中落档。
- [x] 因此本 feature 不单独 backfill requirement，避免把内部导出服务写成独立产品需求。

## 7. roadmap 回写

- [x] design frontmatter 指向 `roadmap: rxnflow-core-platform` 和 `roadmap_item: report-export-baseline`。
- [x] `.codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-items.yaml` 中 `report-export-baseline` 已为 `done`，feature 为 `2026-05-05-report-export-baseline`。
- [x] `.codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-roadmap.md` 第 5 节已同步显示 `done`。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 没有新增通用终端命令、远端执行规则、浏览器验证步骤或每次都会踩的环境问题。

## 9. 遗留

- CDX、CSV、PDF、PPTX、SVG、JSON、SDF、MOL、批量目录导出和组合报告仍未实现。
- CDXML 当前只生成 energy diagram，不生成 molecule-level CDXML 或 generic reaction scheme。
- XLSX 当前不读/改用户模板，不生成宏、公式或 Excel chart。
- Pillow / XlsxWriter 的正式依赖锁定和包管理方式仍需后续 decision 或 packaging feature 拍板。
