---
doc_type: roadmap
slug: rxnflow-report-preview-delivery
status: completed
created: 2026-05-24
last_reviewed: 2026-06-02
tags: [rxnflow, report-export, report-preview, csv, svg, graph-snapshot, report-composer, delivery-formats]
related_requirements: [web-workbench-shell, project-content-persistence]
related_architecture: [ARCHITECTURE, core-platform, web-workbench]
---

# RxnFlow Report Preview Delivery

## 1. 背景

RxnFlow 当前已完成第一轮报告导出质量路线：核心层可从已有 `EnergyProfile`、`ChemicalObject`、`EnergyTableRow` 和 graph/workspace projection 导出 PNG 能量图、CDXML 能量图、XLSX 能量表、CSV 能量表和 SVG graph snapshot；Platform Shell 可返回 JSON-safe `ShellArtifact`；Web Report Export Panel 可展示 runtime artifact、inline download、metadata、warnings，并把带 bytes 的 PNG/CDXML/XLSX/CSV/SVG 写入 browser-local project 的 `exports/...` 与 `export-artifacts-v1`。

剩余缺口已经不再是“能不能导出单个文件”，而是“用户能不能在提交/分享前预览一份完整报告，并选择合适交付格式”。下一阶段应把 Web 报告预览、组合报告 manifest、已落地 graph snapshot 资产复用和 PDF/PPTX/CDX 边界放到同一条规划里，避免各 feature 分别改格式枚举、artifact metadata、Web persistence 和文档口径。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- Export format capability matrix：统一记录格式 id、扩展名、MIME、writer 来源、是否可持久化、是否可内联、是否进入 Web 默认选择。
- CSV energy table：复用现有 `EnergyTableColumn` / `EnergyTableRow` 输出 CSV，不另起字段清单。
- Graph snapshot artifact：从保存后的 graph/workspace projection 生成可报告复用的图谱快照，优先 SVG，后续可按需 rasterize。
- Report preview model：在 Web 中把当前 profile、energy table summary、graph snapshot 和 artifact readiness 组合成可扫描预览，不在前端重算领域数据。
- Report composer manifest：定义组合报告的 section/block/asset manifest，让 HTML/PDF/PPTX 等后续 writer 共用同一结构。
- Delivery format boundary：已明确 PDF、PPTX 和 CDX 的进入条件、依赖策略和不支持时的 UI/错误码；SVG graph snapshot 已作为 supported artifact 落地，后续只处理它在组合报告中的复用边界。
- Docs / QA：同步开发者指南、用户指南、unit tests 和 Playwright 覆盖，固定下载、持久化、窄屏预览和 bundle roundtrip 行为。

### 明确不做

- 不把 PDF、PPTX 或 CDX 直接塞进 Web UI；必须先由 core/Shell/export artifact contract 支持，再进入 Web persistence。SVG graph snapshot 已完成这个前置条件，后续仍不得以 DOM/canvas capture 绕过 core contract。
- 不在 Web 前端生成能量表、能量图或 ChemDraw 文件；Web 只消费 ShellResponse 和已定义的 graph snapshot / report preview projection。
- 不把 GraphCanvas 的 hover、rubber-band、pending edge、minimap draft 或 history stack 写入报告；报告只使用已保存/可投影的 graph/workspace state。
- 不实现 molecule-level ChemDraw CDXML/CDX、分子 2D layout、bond/atom 编辑或 ChemDraw 内嵌编辑器。
- 不在第一轮引入云存储、账号、协作、自动发布链接或在线分享权限。
- 不保证 PDF/PPTX/CDX 在本 roadmap 第一条 feature 中落地；它们必须先经过 dependency/format boundary feature 明确可测策略。
- 不自动替用户解释计算化学结论；报告 composer 只组织已有对象、图谱、能量曲线、表格、warnings 和 metadata。

## 3. 模块拆分（概设）

```
RxnFlow Report Preview Delivery
├── Export Format Capability：格式能力表、MIME、扩展名、writer/persistence guard
├── CSV Energy Table Writer：复用 energy-table-v1 的 CSV 导出
├── Graph Snapshot Renderer：从 graph/workspace projection 输出报告用 SVG/PNG 资产
├── Report Preview Projection：Web 可扫描预览模型与 readiness
├── Report Composer Manifest：组合报告 section/block/asset 中间层
├── Delivery Format Adapters：PDF/PPTX/CDX 的依赖和错误边界
└── Report Delivery QA & Guides：E2E、文档、bundle/persistence 回归
```

### Export Format Capability · 导出格式能力表

- **职责**：把当前散落在 core `ALLOWED_EXPORT_FORMATS`、Web `exportFormats`、`exportArtifactPersistence` 和 docs 中的格式白名单收敛为可同步的能力表。
- **承载的子 feature**：`export-format-capability-matrix`
- **触碰的现有代码 / 模块**：`rxnflow.export`、`rxnflow.export_artifact_codec`、Platform Shell artifact projection、Web shell types、Report Export Panel、docs。

### CSV Energy Table Writer · CSV 能量表

- **职责**：从 `EnergyTableColumn` / `EnergyTableRow` 输出标准 CSV artifact，第一列仍为 structure name，缺失字段留空，warnings 和 metadata 保持 JSON-safe。
- **承载的子 feature**：`export-csv-energy-table`
- **触碰的现有代码 / 模块**：`ReportExportService`、energy table tests、Shell artifact projection、Web download/persistence allowlist、用户/开发者指南。

### Graph Snapshot Renderer · 图谱快照渲染

- **职责**：从 `ReactionGraph` / `WorkspaceSnapshot` 生成报告可复用的图谱快照资产；首轮 SVG 已采用 projection-based renderer 落地，因为它可测试、可嵌入、可后续转 PDF/PPTX。
- **承载的子 feature**：`export-graph-snapshot-svg`
- **触碰的现有代码 / 模块**：core graph/workspace DTO、export artifact metadata、Platform Shell export.profile、Web export format helper、browser-local artifact persistence、Playwright/Browser checks。

### Report Preview Projection · 报告预览投影

- **职责**：为 Web 提供报告预览所需的 section summary：项目 metadata、graph snapshot、energy curve/table、warnings、artifact readiness 和 missing data 状态。
- **承载的子 feature**：`web-report-preview-panel`
- **触碰的现有代码 / 模块**：WorkbenchShell、ReportExportPanel 或新 ReportPreviewPanel、i18n catalogs、CSS responsive layout、Playwright。

### Report Composer Manifest · 组合报告清单

- **职责**：定义组合报告中间层，让后续 HTML/PDF/PPTX writer 不直接读取 Web UI state 或各自重新理解 artifacts。
- **承载的子 feature**：`report-composer-manifest`
- **触碰的现有代码 / 模块**：`rxnflow.export`、Platform Shell、Project Content export artifact records、docs/dev。

### Delivery Format Adapters · 交付格式适配

- **职责**：把 PDF/PPTX/CDX 的可行性、依赖、运行位置和错误边界固定下来；能落地的格式按 manifest/asset contract 输出，不能落地的保持明确 unsupported。SVG graph snapshot 的后续工作仅限 report composer / delivery writer 如何引用既有 artifact。
- **承载的子 feature**：`delivery-format-boundary-spike`
- **触碰的现有代码 / 模块**：export dependency boundary、docs、Shell errors、Web disabled/unsupported UI。

### Report Delivery QA & Guides · 交付验证与指南

- **职责**：用 unit/component/E2E 固定 CSV、graph snapshot、preview、composer manifest 和 browser-local persistence 行为，并更新用户/开发者文档。
- **承载的子 feature**：`report-preview-delivery-qa-guides`
- **触碰的现有代码 / 模块**：tests、`web/e2e`、docs/user、docs/dev、CodeStable acceptance 回写。

## 4. 模块间接口契约 / 共享协议（架构层详设）

本节是后续 feature design 的硬约束。若某条 feature 发现契约不合适，先 update 本 roadmap，再继续实现。

### 4.1 Export Format Capability Contract

**方向**：core export registry → Shell artifact projection → Web UI/persistence
**形式**：JSON-safe capability table，core 为权威来源

```python
@dataclass(frozen=True)
class ExportFormatCapability:
    format: str
    extension: str
    mime_type: str
    writer_id: str | None
    artifact_kind: Literal["energy_table", "energy_diagram", "graph_snapshot", "report_document", "external_conversion"]
    supports_inline_bytes: bool
    supports_browser_persistence: bool
    web_default_enabled: bool
    status: Literal["supported", "experimental", "unsupported"]
    unsupported_reason: str | None = None
```

**首轮事实**：

- `png`、`cdxml`、`xlsx`、`csv`、`svg` 已支持；`svg` 当前 writer contract 是 projection-based graph snapshot，不是 energy diagram 或 DOM capture。
- `pdf`、`pptx`、`cdx` 在 dependency/format boundary feature 之前保持 unsupported。

**约束**：

- `ALLOWED_EXPORT_FORMATS`、Shell `ExportFormat`、Web `ExportFormat`、browser persistence allowlist 和 docs 必须从同一能力口径更新，不能只改一端。
- unsupported 格式返回 `invalid_input target=formats` 或 capability 中的 disabled/unsupported 状态；Web 不静默隐藏原因。
- MIME 与 extension 必须进入 artifact metadata，Web download 和 persistence 复用该口径，不在组件里散落 hard-coded mapping。

### 4.2 CSV Energy Table Contract

**方向**：`EnergyTableRow` → CSV writer → Shell/Web artifact
**形式**：UTF-8 CSV bytes

```python
ExportRequest(
    formats=("csv",),
    profile=profile,
    objects=objects,
    table_rows=manual_rows,
    basename="rxnflow-profile",
)
```

**输出规则**：

- 第一行为 `EnergyTableColumn.label`。
- 第一列必须是 `structure_name`。
- 列顺序完全复用 `ENERGY_TABLE_COLUMNS`。
- 空值写为空 cell，不写 `0`、`NA` 或 guessed text。
- 数字使用稳定 string formatting；不得受系统 locale 影响。
- metadata 至少包含 `energy_table_schema_version`、`energy_table_column_count`、`energy_table_row_count`、`writer_id`、`mime_type` 和 `extension`。

**约束**：

- CSV writer 不读用户私有 workbook，不调用 parser/registry/energy engine，不重新计算 relative energy。
- CSV 与 XLSX 必须共用 `build_energy_table_rows()`；字段新增必须同时更新 header normalization、docs 和 tests。
- Web persistence path 为 `exports/{basename}.csv`，checksum 由 Browser Project Repository 写入后返回。

### 4.3 Graph Snapshot Asset Contract

**方向**：workspace/graph projection → graph snapshot renderer → report composer/Web preview
**形式**：report asset bytes + JSON-safe metadata

```python
@dataclass(frozen=True)
class GraphSnapshotRequest:
    graph_id: str
    workspace_id: str | None
    graph: ReactionGraph
    viewport: CanvasViewport | None = None
    selection: WorkspaceSelection | None = None
    title: str | None = None
    format: Literal["svg", "png"] = "svg"

@dataclass(frozen=True)
class ExportArtifact:
    id: str
    kind: Literal["energy_diagram", "energy_table", "graph_snapshot", "report_document"]
    format: str
    bytes: bytes | None
    path: str | None
    metadata: dict[str, JsonValue]
```

**约束**：

- 首轮 graph snapshot 只使用已存在的 node position、edge label、path order、active path 和 selection projection；不读取 DOM、不读取 hover/pending/minimap/history。
- SVG renderer 必须可用 XML parser 解析；node/edge/path count、label escaping、viewport bounds 和 empty graph 行为要有测试。
- 如果 Web 做 DOM capture，只能作为独立 implementation；不能替代 projection-based contract，也不能把 transient UI state 写进 Project Content。
- Graph snapshot artifact 进入 `exports/{basename}.svg` 或 `exports/{basename}.png` 前，必须先进入 Export Format Capability。

### 4.4 Report Preview Projection Contract

**方向**：WorkbenchDomainState + Shell artifact/capability projection → Web preview UI
**形式**：Web UI-only preview model

```ts
type ReportPreviewModel = {
  project?: { id: string; name: string | null }
  graph?: {
    graphId: string
    nodeCount: number
    edgeCount: number
    pathCount: number
    activePathId?: string | null
    snapshotArtifactId?: string | null
  }
  profile?: {
    profileId: string
    pointCount: number
    missingPointCount: number
    correctionPointCount: number
    outputUnit: string
  }
  energyTable?: {
    schemaVersion: "energy-table-v1"
    columnCount: number
    rowCount?: number | null
  }
  artifacts: Array<{
    id: string
    format: string
    persisted: boolean
    hasInlineBytes: boolean
    checksum?: string | null
  }>
  warnings: Array<{ code: string; message: string; target?: string | null }>
}
```

**约束**：

- Report preview 是 UI-only projection，不写入 Project Content、Browser Project Repository 或 ShellResponse。
- Web 不在 preview 中重算能量、校正项、CSV rows 或 graph layout；只汇总已有 projection 和 Shell artifacts。
- 预览窄屏必须可扫描：graph summary、energy profile summary、format readiness 和 warnings 不能互相遮挡。
- 静态文案进入 i18n catalogs；artifact id、format、checksum、warning code、metadata key/value 原样显示。

### 4.5 Report Composer Manifest Contract

**方向**：profile/table/snapshot/artifacts → report document writers
**形式**：core JSON-safe manifest

```python
@dataclass(frozen=True)
class ReportDocument:
    id: str
    project_id: str
    title: str
    created_at: str
    sections: tuple[ReportSection, ...]
    assets: tuple[ReportAsset, ...]
    metadata: dict[str, JsonValue]
    warnings: tuple[RxnFlowWarning, ...] = ()

@dataclass(frozen=True)
class ReportAsset:
    id: str
    kind: str
    format: str
    source_artifact_id: str
    path: str | None = None
    checksum: str | None = None
    metadata: dict[str, JsonValue] = field(default_factory=dict)

@dataclass(frozen=True)
class ReportSection:
    id: str
    title: str
    kind: Literal["summary", "graph", "energy_profile", "energy_table", "artifacts", "warnings"]
    asset_ids: tuple[str, ...] = ()
    data: dict[str, JsonValue] = field(default_factory=dict)
```

**约束**：

- Composer manifest 不持有 Python object instances、React state、DOM nodes 或 browser `Blob`；只持有 JSON-safe data 和 artifact references。
- `ReportAsset` 是 manifest 内的 JSON-safe artifact reference，不保存 bytes；带 bytes 的运行时输出继续使用 `ExportArtifact`。
- Manifest writer 不调用 parser/import/register/energy compute；它只消费已经存在的 profile、rows、graph snapshot 和 artifacts。
- 后续 HTML/PDF/PPTX writer 必须先消费 `ReportDocument`，不能直接从 Web component 或 Project Sidebar state 取数。
- Manifest 可以作为 `report-manifest-v1` runtime artifact；是否进入 Project Content 长期 section 需另起 feature 决策。

### 4.6 Delivery Format Boundary Contract

**方向**：ReportDocument / ReportAsset → delivery writers
**形式**：明确 supported/unsupported/error strategy

**约束**：

- `svg`：当前已用于 graph snapshot 和可嵌入矢量资产；必须是 valid XML/SVG，禁止引用项目外远程资源、script、foreignObject 或 Web transient state。
- `pdf`：必须明确运行位置和依赖。若使用浏览器打印或外部 renderer，测试要能在 CI/本地稳定跳过或验证；缺依赖返回 `export_failed target=dependency`。
- `pptx`：必须明确 slide size、图片/表格嵌入策略和依赖；不能把 HTML 预览截图冒充可编辑 PPTX。
- `cdx`：在没有可靠 writer/converter 前保持 unsupported；如果引入转换链，必须记录第三方依赖、license、平台可用性和失败回退。CDXML 仍是当前 ChemDraw 首选交付格式。
- 所有新格式都必须定义 extension、MIME、writer_id、metadata、persistence path 和 warning semantics。

## 5. 子 feature 清单

1. `export-format-capability-matrix`：done。已建立导出格式能力表，统一 core/Shell/Web/docs 对 png/cdxml/xlsx/csv/svg/pdf/pptx/cdx 的状态、MIME、扩展名和 persistence guard。
2. `export-csv-energy-table`：done。已复用 `energy-table-v1` 输出 CSV artifact，接通 Shell/Web download/persistence，并补 table/schema/docs 回归。
3. `export-graph-snapshot-svg`：done。从 graph/workspace projection 生成报告用 SVG graph snapshot artifact，覆盖 escaping、空图、active path 和 viewport bounds。
4. `web-report-preview-panel`：done。已在 Report Export Panel 内新增 Preview mode，汇总 graph/profile/table/artifact readiness 与 warnings，并通过桌面/窄屏验收。
5. `report-composer-manifest`：done。已定义 `ReportDocument` / `ReportSection` / `ReportAsset` manifest，组合当前 energy diagram、table、graph snapshot 和 artifact metadata，且 `ReportAsset` 只保存 JSON-safe artifact reference，不持有 bytes。
6. `delivery-format-boundary-spike`：done。已调研并固定 PDF/PPTX/CDX 的依赖、运行位置、错误码和 unsupported UI 口径，并明确已落地 SVG graph snapshot 在组合报告中的复用边界；未开放 PDF/PPTX/CDX writer。
7. `report-preview-delivery-qa-guides`：done。已收口 unit/component/E2E、用户指南和开发者指南，固定 CSV、graph snapshot、report preview、composer manifest、browser-local persistence、bundle roundtrip 和暂不支持格式边界。

## 6. 排期 / 推进顺序

技术依赖顺序建议如下：

1. `export-format-capability-matrix` 已完成；后续每个格式应从现有 capability table、artifact metadata 和 Web helper 继续扩展。
2. `export-csv-energy-table` 已完成，复用现有 table contract，补上用户常见数据交换需求。
3. `export-graph-snapshot-svg` 已完成，让组合报告具备图谱资产，而不是只导出能量曲线和表格。
4. `web-report-preview-panel` 已完成，把已有 artifact readiness 和 graph/profile summary 变成可验收的预览体验。
5. `report-composer-manifest` 已完成，为 HTML/PDF/PPTX 等文档级导出建立共同中间层。
6. `delivery-format-boundary-spike` 已完成，PDF/PPTX/CDX 继续保持 unsupported，未开放格式请求为 `invalid_input target=formats`，已开放 writer 缺依赖才使用 `export_failed target=dependency`。
7. `report-preview-delivery-qa-guides` 已完成，报告预览交付路线的测试、文档和 bundle/persistence 回归已收口。本 roadmap 首轮完成。

## 7. 观察项

- 当前 `rxnflow.export.ExportFormat` 和 Web `ExportFormat` 已支持 `png/cdxml/xlsx/csv/svg`，core/Web Export Format Capability 表仍记录 `pdf/pptx/cdx` 的 unsupported 边界。新增 PDF/PPTX/CDX 时必须先更新 capability status、writer、metadata、tests 和文档，再进入 Web checkbox/persistence。
- 图谱快照首轮已采用 projection-based SVG renderer，以便测试、CLI 和多端复用。DOM capture 更贴近 Web 当前视觉但会绑定浏览器状态，后续不得替代 projection-based contract。
- PDF/PPTX 很可能需要额外依赖或浏览器渲染链，必须在 feature 中明确本地/CI/Vercel 的可用边界。
- CDX 仍应保持谨慎。当前 CDXML 已能服务 ChemDraw 可编辑能量图；CDX binary 或转换链不应在没有 license/平台/测试策略时开放为 supported。
- 组合报告未来可能需要用户模板、logo、作者、机构和章节排序。这些属于 report composer 的后续 UI/模板 feature，不要塞进第一轮 manifest。
