---
doc_type: dev-guide
slug: report-export-artifacts
component: report-export-guides
status: current
summary: RxnFlow 报告导出 artifact 的生成、投影、下载和持久化契约
tags: [report-export, artifacts, report-document, png, cdxml, xlsx, csv, svg, platform-shell, web]
last_reviewed: 2026-06-09
---

# Report Export Artifacts

## 概述

RxnFlow core 当前支持五种可执行导出格式：

- PNG energy diagram
- CDXML energy diagram
- XLSX energy table workbook
- CSV energy table
- SVG graph snapshot

Web 工作台的用户导出面板当前只暴露 PNG、CDXML 和 XLSX。CSV 和 SVG 仍是 core / shell supported formats，但不属于当前 Web 主 UI 默认格式。

Platform Shell 负责把 core artifact 投影为 JSON-safe `ShellArtifact`；Web 只显示可下载文件，不展示 writer id、checksum、metadata、readiness、Preview mode 或 artifact debug dashboard。

## 依赖与输入

- PNG writer 依赖 Pillow。
- XLSX writer 依赖 XlsxWriter。
- CSV 和 SVG writer 使用 Python 标准库。
- PNG 和 CDXML 需要 `EnergyProfile`。
- XLSX 和 CSV 至少需要 `EnergyProfile`、`ChemicalObject` 或显式 `EnergyTableRow`。
- SVG 需要 `ReactionGraph` 或 `WorkspaceSnapshot`。
- Web download 需要 Shell artifact 带 `bytes_base64`，也就是 `include_bytes=true`。

## 快速上手

核心层直接导出 bytes：

```python
from rxnflow.export import ExportRequest, ReportExportService

result = ReportExportService().export(
    "project-id",
    ExportRequest(
        formats=("png", "cdxml", "xlsx", "csv", "svg"),
        profile=profile,
        graph=graph,
        workspace=workspace,
        objects=objects,
        basename="rxnflow-profile",
        title="Relative energy profile",
    ),
)
assert result.ok, result.error
artifacts = result.value
```

Web 主界面只请求当前默认格式：

```python
ShellCommand(
    "export.profile",
    {
        "session_id": session_id,
        "formats": ["png", "cdxml", "xlsx"],
        "include_bytes": True,
        "basename": "rxnflow-profile",
        "title": "Relative energy profile",
    },
)
```

## 核心概念

| 概念 | 说明 |
|---|---|
| `ExportRequest` | 核心导出请求，包含 formats、graph、workspace、profile、objects、table_rows、destination_dir、basename、title 和 options。 |
| `ExportArtifact` | core runtime 结果，可含 bytes 或本地 path；不是长期项目内容。 |
| `ShellArtifact` | Platform Shell JSON-safe 投影；`include_bytes=true` 时用 `bytes_base64` 承载 inline bytes。 |
| `ExportArtifactRecord` | Project Content 中的长期索引记录，只保存 id、format、`exports/...` path、checksum、metadata 和 created_at。 |
| Browser Export Object | Web Browser Project Repository 中的 `exports/{basename}.{extension}` bytes object。 |
| Export Format Capability | 导出格式能力记录，包含 format、extension、MIME、writer、artifact kind、inline/persistence/default 状态和 supported/unsupported 状态。 |
| ReportDocument | core 侧组合报告 manifest，记录 section、JSON-safe data、asset references、metadata 和 warnings；不是 writer 输出文件。 |

当前 supported `ExportFormat`：

- `png`
- `cdxml`
- `xlsx`
- `csv`
- `svg`

当前 Web default export formats：

- `png`
- `cdxml`
- `xlsx`

PDF、PPTX 和 CDX 当前只是 capability table 中的 unsupported delivery boundary。请求这些格式返回 `invalid_input target=formats`；只有未来 writer 已进入 supported set 但运行时依赖缺失时，才使用 `export_failed target=dependency`。

## Format Capability

| format | core status | Web panel | artifact kind | writer |
|---|---|---|---|---|
| `png` | supported | visible | `energy_diagram` | `pillow-energy-plot-v1` |
| `cdxml` | supported | visible | `energy_diagram` | `rxnflow-cdxml-energy-v1` |
| `xlsx` | supported | visible | `energy_table` | `xlsxwriter-energy-workbook-v1` |
| `csv` | supported | hidden | `energy_table` | `python-csv-energy-table-v1` |
| `svg` | supported | hidden | `graph_snapshot` | `python-svg-graph-snapshot-v1` |
| `pdf` | unsupported | hidden | `report_document` | none |
| `pptx` | unsupported | hidden | `report_document` | none |
| `cdx` | unsupported | hidden | `external_conversion` | none |

`web/src/app/exportFormatCapabilities.ts` is the Web source of truth. `reportExportFormats()` must return only Web-visible formats, currently `["png", "cdxml", "xlsx"]`. `supportedExportFormats()` may still include CSV/SVG for shell tests, persistence helpers, and future advanced flows.

## Energy Table Contract

当前 schema version 是 `energy-table-v1`。第一列始终是结构名称：

| key | label | 说明 |
|---|---|---|
| `structure_name` | `Structure` | 第一列，人类可读结构名。 |
| `egas_hartree` / `egas_kcal_mol` | `Egas` | 气相电子能量成对列。 |
| `gas_basis_functions` | `Gas basis functions` | 由显式 `table_rows` 提供；当前不由 parser 自动填充。 |
| `ggas_hartree` / `ggas_kcal_mol` | `Ggas` | 气相 Gibbs 能量。 |
| `ggas_1m_hartree` / `ggas_1m_kcal_mol` | `Ggas+1M` | 1M 标准态口径。 |
| `ggas_shermo_*` | `Ggas(shermo)` | Shermo/Whitesides 相关口径，当前由 `table_rows` 显式提供。 |
| `esol_hartree` / `esol_kcal_mol` | `Esol` | 溶液相电子能量。 |
| `solution_basis_functions` | `Solution basis functions` | 由显式 `table_rows` 提供。 |
| `gsol_hartree` / `gsol_kcal_mol` | `Gsol` | 溶液相 Gibbs 能量。 |
| `relative_energy` / `relative_unit` / `missing_reason` | Profile | 能量剖面相对能量和缺失原因。 |

## Artifact Metadata

每个 artifact metadata 至少包含：

- `project_id`
- `graph_id`
- `profile_id`
- `path_id`
- `object_count`
- `format`
- `extension`
- `mime_type`
- `artifact_kind`
- `format_status`
- `bytes_length`
- `writer_id`
- `title`
- `basename`
- `warnings`

XLSX 和 CSV 额外包含 `energy_table_schema_version`、`energy_table_column_count` 和 `energy_table_row_count`。

SVG 额外包含 workspace、node/edge/path count、active path、selection、viewport 和 svg dimension metadata。

这些 metadata 用于 shell projection、browser-local persistence 和测试断言。普通 Web 导出面板不直接显示 metadata。

## Web Export Panel Contract

`web/src/app/ReportExportPanel.tsx` 只负责：

- 展示 Web-visible format checkbox。
- 编辑 basename / title。
- 触发 `export.profile`。
- 展示返回 artifact 的 format、文件名和 download link。

它不负责：

- Preview mode。
- readiness summary。
- warning/debug dashboard。
- checksum / writer metadata / persisted state display。
- 前端生成 PNG/CDXML/XLSX bytes。
- DOM/canvas screenshot。
- File System Access API、OPFS、JSZip、云存储或账号系统。

`WorkbenchShell` 仍把 inline artifacts 写入 active browser project 的 `exports/{basename}.{format}`，并维护 `export-artifacts-v1` browser-local index。这个 persistence 是项目恢复和内部校验能力，不应该反向污染普通导出 UI。

## Browser-local Persistence

Web browser-local persistence 的路径固定为：

```text
exports/{basename}.png
exports/{basename}.cdxml
exports/{basename}.xlsx
```

如果调用方显式请求 CSV/SVG，persistence helper 仍可处理 supported formats：

```text
exports/{basename}.csv
exports/{basename}.svg
```

同一 id 或 path 重复写入时 upsert，不创建历史版本。

## Report Composer Manifest

`rxnflow.report_manifest` 提供 core-only 组合报告中间层。它只消费调用方已经拥有的 `EnergyProfile`、显式 `EnergyTableRow`、`ExportArtifact` 和可选 `ExportArtifactRecord`，不调用 parser/import/register/energy compute，也不重新生成 PNG/CDXML/XLSX/CSV/SVG bytes。

`ReportDocument` 的 section 顺序固定为：

```text
summary -> graph -> energy_profile -> energy_table -> artifacts -> warnings
```

缺少 graph snapshot、energy table rows 或 profile 时，composer 不伪造资产；对应 section 会保留并标记 `data.status="unavailable"`，同时在 `document.warnings` 中给出 warning。

未来开放 PDF/PPTX/HTML writer 时必须从 `ReportDocument` / `ReportAsset` 输入开始，并定义 extension、MIME、writer id、metadata、persistence path 和 warning semantics。不要从 Web DOM、React state、Browser Blob 或 graph canvas screenshot 直接生成正式报告文件。

## QA Matrix

| 风险 | 推荐检查 | 覆盖信号 |
|---|---|---|
| Core export baseline | `python3 -m unittest tests.test_report_export_baseline` | PNG/CDXML/XLSX/CSV/SVG writer contract，PDF/PPTX/CDX unsupported boundary。 |
| Web format visibility | `cd web && npm run test -- exportFormatCapabilities.test.ts WorkbenchShell.test.tsx --run` | Web 面板只显示 PNG/CDXML/XLSX；CSV/SVG 不在普通 UI。 |
| Download MIME / file bytes | `cd web && npm run test -- ShellClient.test.ts WorkbenchShell.test.tsx --run` | PNG data URL MIME、CDXML XML text、XLSX zip bytes 均有效。 |
| Browser-local persistence | `cd web && npm run test -- exportArtifactPersistence.test.ts WorkbenchShell.test.tsx --run` | inline artifacts 写入 `exports/...` 和 `export-artifacts-v1`；unsupported formats 不写 object 或 record。 |
| E2E fixture / local-http | `cd web && npm run test:e2e`; `cd web && npm run test:e2e:local-http` | 真实页面导出只出现 PNG/CDXML/XLSX download links，Project Files 不显示导出物。 |
| Future delivery writer discipline | docs + scope grep | 新增 PDF/PPTX/HTML/CDX writer 前必须消费 ReportDocument / ReportAsset，不从 Web DOM/state/screenshot 生成正式报告。 |

基础命令：

```bash
python3 -m unittest tests.test_report_export_baseline tests.test_report_manifest
cd web && npm run test -- exportFormatCapabilities.test.ts exportArtifactPersistence.test.ts WorkbenchShell.test.tsx ShellClient.test.ts --run
cd web && npm run build
```

## 已知限制

- 当前 Web 面板不显示 CSV/SVG；core 仍保留 writer。
- 当前不支持 `.cdx` binary。CDXML 是 XML 格式，可由 ChemDraw 打开和编辑能量图对象。
- 当前 CDXML 只生成能量图对象和文本标注，不生成 molecule-level CDXML、反应式结构、bond/atom 语义或 ChemDraw 编辑器。
- SVG graph snapshot 是 core projection，不是 Web DOM/canvas screenshot。
- XLSX workbook 不读取用户私有模板；Energy Table 缺失字段留空。
- Web Report Export Panel 不调用 `project.save_content`，也不自动创建 Python filesystem artifact。
- Browser Project Repository 是 local-only，不是云备份。

## 相关文档

- `docs/user/report-export-artifacts.md`
- `docs/dev/web-runtime-boundary.md`
- `docs/dev/platform-project-open-save.md`
- `codestable/architecture/core-platform.md`
- `codestable/architecture/web-workbench.md`
