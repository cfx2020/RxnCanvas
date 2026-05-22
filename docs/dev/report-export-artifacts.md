---
doc_type: dev-guide
slug: report-export-artifacts
component: report-export-guides
status: current
summary: 如何生成、投影和持久化 RxnFlow PNG/CDXML/XLSX 报告导出 artifacts
tags: [report-export, artifacts, cdxml, xlsx, platform-shell, web]
last_reviewed: 2026-05-21
---

# Report Export Artifacts

## 概述

RxnFlow 报告导出当前支持三种 artifact：PNG 能量图、ChemDraw/CDXML 能量图和 XLSX 能量表工作簿。核心层负责生成 bytes 或写入目标目录，Platform Shell 负责把 artifact 投影成 JSON-safe response，Web 工作台只展示、下载和在 browser-local project 下持久化已有 inline bytes。

这份指南面向贡献者和集成方。它说明当前 API、字段、路径和边界，不覆盖未来组合报告、CSV、CDX 或报告预览。

## 前置依赖

- PNG writer 依赖 Pillow，XLSX writer 依赖 XlsxWriter；依赖在 writer 内延迟 import，缺失时返回 `export_failed target=dependency`。
- PNG 和 CDXML 导出需要 `EnergyProfile`。
- XLSX 导出至少需要 `EnergyProfile`、`ChemicalObject` 或显式 `EnergyTableRow`。
- Web download 和 browser-local persistence 需要 Shell artifact 带 `bytes_base64`，也就是 `include_bytes=true`。

## 快速上手

核心层直接导出 bytes：

```python
from rxnflow.export import ExportRequest, ReportExportService

service = ReportExportService()
result = service.export(
    "project-id",
    ExportRequest(
        formats=("png", "cdxml", "xlsx"),
        profile=profile,
        objects=objects,
        basename="rxnflow-profile",
        title="Relative energy profile",
    ),
)
assert result.ok, result.error
artifacts = result.value
```

写入本地项目目录的 `exports/`：

```python
from pathlib import Path
from rxnflow.export import ExportRequest, ReportExportService

project_path = Path("/path/to/project")
result = ReportExportService().export(
    "project-id",
    ExportRequest(
        formats=("png", "cdxml", "xlsx"),
        profile=profile,
        objects=objects,
        destination_dir=project_path / "exports",
        basename="rxnflow-profile",
    ),
)
```

通过 Platform Shell 获取 Web 可下载的 inline artifacts：

```python
from rxnflow.platform import AppKernel, PlatformShellService, ShellCommand

service = PlatformShellService(AppKernel())
response = service.run(
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
)
assert response.ok, response.error
```

## 核心概念

| 概念 | 说明 |
|---|---|
| `ExportRequest` | 核心导出请求，包含 formats、profile、objects、table_rows、destination_dir、basename、title 和 options。 |
| `ExportArtifact` | 核心运行时结果，可含 bytes 或本地 path；不是长期项目内容。 |
| `ShellArtifact` | Platform Shell JSON-safe 投影；`include_bytes=true` 时用 `bytes_base64` 承载 inline bytes。 |
| `ExportArtifactRecord` | Project Content 中的长期索引记录，只保存 id、format、`exports/...` path、checksum、metadata 和 created_at。 |
| Browser Export Object | Web Browser Project Repository 中的 `exports/{basename}.{format}` bytes object。 |

当前 `ExportFormat` 只允许：

- `png`
- `cdxml`
- `xlsx`

其他格式，包括 `csv` 和 `cdx`，当前返回 `invalid_input target=formats`。

## 接口参考

### `ExportRequest`

| 字段 | 类型 | 说明 |
|---|---|---|
| `formats` | `tuple[str, ...]` | 需要导出的格式，当前仅支持 `png`、`cdxml`、`xlsx`。 |
| `profile` | `EnergyProfile | None` | PNG/CDXML 必需；XLSX 可用来写 Energy Profile sheet。 |
| `objects` | `tuple[ChemicalObject, ...]` | XLSX energy table 的对象来源之一。 |
| `table_rows` | `tuple[EnergyTableRow, ...]` | 显式表格行，适合传入 basis function、shermo/Whitesides 等 parser 尚未结构化字段。 |
| `destination_dir` | `str | Path | None` | 存在时写出 `{basename}.{format}` 文件；不存在时只返回 bytes。 |
| `basename` | `str | None` | 文件名主体；必须是安全文件名。 |
| `title` | `str | None` | 写入图和 workbook 的显示标题。 |
| `options` | `dict` | 当前可用于 CDXML diagram options。 |

### Energy Table Contract

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

使用 helper 查询列：

```python
from rxnflow.export import energy_table_columns_by_key

columns = energy_table_columns_by_key()
assert columns["structure_name"].label == "Structure"
```

常见 workbook 表头可用 `normalize_energy_table_header()` 映射到 column key。`Sgau/Swhit/RT` 等 entropy 原始列当前返回 `None`，不要自动当作能量列。

### Artifact Metadata

每个 artifact metadata 至少包含：

- `project_id`
- `graph_id`
- `profile_id`
- `path_id`
- `object_count`
- `format`
- `bytes_length`
- `writer_id`
- `title`
- `basename`
- `warnings`

XLSX 额外包含：

- `energy_table_schema_version`
- `energy_table_column_count`

当前 writer ids：

- PNG：`pillow-energy-plot-v1`
- CDXML：`rxnflow-cdxml-energy-v1`
- XLSX：`xlsxwriter-energy-workbook-v1`

## 常见场景

### 添加手工表格行

```python
from rxnflow.export import EnergyTableRow, ExportRequest

manual_row = EnergyTableRow(
    "TS1",
    {
        "gas_basis_functions": 1234,
        "ggas_shermo_1m_hartree": -399.123456,
        "relative_energy": 18.2,
        "relative_unit": "kcal_mol",
    },
    node_id="node-ts1",
)

request = ExportRequest(
    formats=("xlsx",),
    profile=profile,
    table_rows=(manual_row,),
)
```

显式 `table_rows` 优先；profile merge 只补缺失的 relative 字段，不覆盖已有手工值。未提供字段保持空白/absent，不写 0。

### 让 Web 能下载 artifacts

Platform Shell 的 `export.profile` 默认不内联 bytes。Web 下载和 browser-local persistence 需要：

```python
{"include_bytes": True}
```

Shell artifact 会得到 `bytes_base64`；Web 再把它变成 data URL download link。Web 不在浏览器里生成 PNG/CDXML/XLSX bytes。

### 让项目内容索引记录导出文件

长期 `ExportArtifactRecord` 只记录已经位于项目 `exports/` 下的文件。核心保存 session 时会跳过 bytes-only、项目外路径或缺失文件，并返回 warning。

Web browser-local persistence 的路径固定为：

```text
exports/{basename}.png
exports/{basename}.cdxml
exports/{basename}.xlsx
```

同一 id 或 path 重复写入时 upsert，不创建历史版本。

## 已知限制与注意事项

- 当前不支持 `.cdx` binary。CDXML 是 XML 格式，可由 ChemDraw 打开和编辑能量图对象；它不是 ChemDraw 二进制 CDX。
- 当前 CDXML 只生成能量图对象，不生成 molecule-level CDXML、反应式结构、bond/atom 语义或 ChemDraw 编辑器。
- 当前不支持 CSV、PDF、PPTX、SVG、DOCX、HTML report 或组合报告。
- XLSX workbook 不读取用户私有模板；Energy Table 缺失字段留空。
- Web Report Export Panel 不调用 `project.save_content`，也不自动创建 Python filesystem artifact。
- Browser Project Repository 是 local-only，不是云备份。跨设备迁移仍依赖 `.rxnflow.zip` 手动备份路线。

## 相关文档

- `docs/user/report-export-artifacts.md`
- `docs/dev/web-runtime-boundary.md`
- `docs/dev/platform-project-open-save.md`
- `codestable/architecture/core-platform.md`
- `codestable/architecture/web-workbench.md`
- `codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-roadmap.md`
