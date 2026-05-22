# report-export-guides 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：codestable/features/2026-05-21-report-export-guides/report-export-guides-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层：

- [x] Developer Guide：`docs/dev/report-export-artifacts.md` 已新增，frontmatter 为 `doc_type=dev-guide`、`status=current`、`slug=report-export-artifacts`。
- [x] User Guide：`docs/user/report-export-artifacts.md` 已新增，frontmatter 为 `doc_type=user-guide`、`status=current`、`slug=report-export-artifacts`。
- [x] Core export API：dev-guide 使用现有 `ReportExportService.export()`、`ExportRequest`、`EnergyTableRow` 示例，没有虚构 API。
- [x] Platform Shell export：dev-guide 说明 `export.profile`、`include_bytes` 和 `ShellArtifact.bytes_base64` 的关系。
- [x] Web persistence：两份指南说明 Web 只持久化已有 inline bytes，路径为 `exports/{basename}.{format}`。

流程图核对：`architecture/roadmap/accepted features -> dev guide + user guide -> docs/dev + docs/user -> search-yaml` 已有实际落点；两份文档均可被 `search-yaml.py` 检索。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] 开发者可从 dev-guide 查到 core export、Platform Shell export 和 Web browser-local persistence 的边界。
- [x] 开发者可查到 Energy Table `energy-table-v1`、第一列结构名称、常见列、manual row 和缺失值语义。
- [x] 用户可从 user-guide 查到 Web 工作台导出步骤：active path/profile、format、include bytes、basename/title、Export、Download。
- [x] 用户可理解 PNG/CDXML/XLSX 的用途，知道 `.cdxml` 可用 ChemDraw 打开，`.cdx` 当前不支持。
- [x] 用户可理解 Download、Persisted、Checksum、Metadata 和 Warnings 的含义。

明确不做逐项核对：

- [x] 不实现新导出格式或报告预览。
- [x] 不承诺 CSV、CDX、PDF、PPTX、SVG、ChemDraw 编辑器或云存储。
- [x] 不把内部 roadmap/design 原文搬进指南；指南按读者任务重写。
- [x] 不写虚构 API，不声明浏览器前端会生成导出 bytes。
- [x] 不加入截图或 Playwright report/trace 文件。

## 3. 验收场景核对

- [x] S1 dev-guide frontmatter：`search-yaml.py --dir docs/dev --filter slug=report-export-artifacts` 找到 `doc_type=dev-guide`、`status=current`。
- [x] S2 core/Shell API：dev-guide 包含 `ExportRequest`、`ReportExportService.export()` 和 `ShellCommand("export.profile", ...)` 示例。
- [x] S3 format/dependency boundary：dev-guide 明确 PNG/CDXML/XLSX 支持，`csv`/`cdx` unsupported，Pillow/XlsxWriter 缺失返回 `export_failed target=dependency`。
- [x] S4 Energy Table：dev-guide 说明 `energy-table-v1`、`structure_name` 第一列、Egas/Ggas/Ggas+1M/Shermo/Esol/Gsol/Profile 列和 manual row / missing value 语义。
- [x] S5 artifact persistence：dev-guide 说明 `ExportArtifact`、`ShellArtifact.bytes_base64`、`ExportArtifactRecord`、`exports/...`、checksum 和 upsert。
- [x] S6 user-guide frontmatter：`search-yaml.py --dir docs/user --filter slug=report-export-artifacts` 找到 `doc_type=user-guide`、`status=current`。
- [x] S7 Web 操作步骤：user-guide 从 Compute 到 Export、format、include bytes、basename/title 和 artifact card 字段逐步说明。
- [x] S8 格式用途和 CDXML/CDX：user-guide 表格说明 PNG/CDXML/XLSX 用途，并在 FAQ 中说明 CDXML 和 CDX 区别。
- [x] S9 UI 字段含义：user-guide 解释 Download、Persisted、Checksum、Metadata、Warnings。
- [x] S10 范围守护：grep 确认指南只把 CSV/CDX/PDF/PPTX/SVG、云同步和浏览器 bytes generation 写成不支持/不做。

证据：

- `python3 codestable/tools/search-yaml.py --dir docs/dev --filter slug=report-export-artifacts`：找到 1 份 dev-guide。
- `python3 codestable/tools/search-yaml.py --dir docs/user --filter slug=report-export-artifacts`：找到 1 份 user-guide。
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-21-report-export-guides/report-export-guides-checklist.yaml --yaml-only`：通过。
- `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-items.yaml --yaml-only`：通过。

## 4. 术语一致性

- Report Export Guide：只指 `docs/dev` / `docs/user` 的对外指南，不替代内部 spec。
- Developer Guide / User Guide：frontmatter `doc_type` 与路径一致。
- Artifact Persistence Path：两份指南均使用 `exports/{basename}.{format}`。
- CDXML Boundary：指南均说明当前支持 `.cdxml`，不支持 `.cdx` binary。
- 禁用范围核对：CSV/CDX/PDF/PPTX/SVG、云存储、自动保存、浏览器生成 bytes 均只作为当前不支持/不做出现。

## 5. 架构归并

- [x] `codestable/architecture/core-platform.md`：Report Export 现状补充开发者/用户指南入口，并在 `rxnflow.export` 模块说明中指向 dev-guide。
- [x] `codestable/architecture/web-workbench.md`：Report Export Panel QA 说明补充用户指南入口。
- [x] `codestable/architecture/ARCHITECTURE.md`：Report Export 总入口补充两份指南及其覆盖范围。

## 6. requirement 回写

- [x] `codestable/requirements/web-workbench-shell.md`：Report Export Panel 边界补充用户操作指南 `docs/user/report-export-artifacts.md`。用户故事本身未新增。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-items.yaml`：`report-export-guides` 已标为 `done`，feature 指向 `2026-05-21-report-export-guides`。
- [x] `codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-roadmap.md`：第 5 节子 feature 清单已同步 `done` 状态和落地说明。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新通用规则。现有规则已覆盖：指南文档放在 `docs/dev` / `docs/user`，前端预览需走 Vite dev server，测试产物不进版本控制。

## 9. 遗留

- 已知限制：用户指南暂未配截图；当前功能和布局仍在 MVP 阶段，后续 UI 稳定后再补截图更合适。
- 已知限制：指南只覆盖首轮 PNG/CDXML/XLSX artifact，不覆盖组合报告、报告预览、CSV、CDX、PDF/PPTX/SVG。
- 后续优化点：如果后续实现 CSV 或 CDX，需要先更新 roadmap/feature，再同步这两份指南。
