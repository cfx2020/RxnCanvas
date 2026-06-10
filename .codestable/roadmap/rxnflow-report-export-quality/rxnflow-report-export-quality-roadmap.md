---
doc_type: roadmap
slug: rxnflow-report-export-quality
status: active
created: 2026-05-21
last_reviewed: 2026-06-09
tags: [rxnflow, report-export, energy-table, energy-diagram, cdxml, xlsx, png]
related_requirements: [web-workbench-shell, project-content-persistence]
related_architecture: [ARCHITECTURE, core-platform, web-workbench]
---

# RxnFlow Report Export Quality

## 1. 背景

RxnFlow 已经有 `ReportExportService` baseline：它能从已加载的 `EnergyProfile`、`ChemicalObject` 和显式 `EnergyTableRow` 生成 PNG、CDXML 与 XLSX artifact，并通过 Platform Shell / Web Report Export Panel 返回 JSON-safe metadata 和 inline bytes。Web 端也已经可以把带 bytes 的 artifact 写入 browser-local project 的 `exports/...` 和 `export-artifacts-v1` index。

当前导出能力仍偏 baseline：能量表字段虽然参考了用户给的 workbook 表头，但还没有把模板口径、公式/单位、CSV 取舍和 visual QA 固化；CDXML 能生成 ChemDraw XML 形状，但缺少兼容性回归、布局重叠检查和 CDX 边界决策；PNG 与 CDXML 共用的 diagram route 还需要更接近论文/汇报可用的样式和缺失点语义。

本 roadmap 的目标是把报告导出从“能出文件”推进到“可被计算化学工作流稳定复用”：表格结构可追溯，图像和 CDXML 可读可编辑，Web 下载与 browser-local 持久化可验证，并明确首轮不做 CDX 和复杂报告排版。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- Energy table schema：以结构名称为第一列，覆盖 gas/solution energy、Hartree/kcal/mol 成对列、basis function、Ggas + 1M、shermo/Whitesides 修正、relative profile 和 warnings。
- XLSX/CSV 取舍：XLSX 作为首选 artifact，CSV 作为可选后续格式，先通过 table intermediate 保证两者不会各自发明字段。
- Energy diagram route：把 profile points 转成 PNG/CDXML 共用的 `EnergyDiagramRoute`，统一 y-axis、state line、连接线、missing point、label/value 和 warning 语义。
- CDXML compatibility：生成可由 ChemDraw 打开的 XML 文档，固定 `fonttable`、`colortable`、`page`、`graphic`、`arrow`、`t/s` 文本节点和 ID/BoundingBox 规则。
- Web report QA：验证 Report Export Panel 在 fixture 和 local-http 模式下对 PNG/CDXML/XLSX 的下载、persisted 状态、checksum、metadata 和 warnings 展示。
- Documentation / user guidance：记录表格字段口径、ChemDraw 打开方式、当前 CDX/CDXML 支持边界和 artifact 持久化路径。
- Ir-style gas/solution workbook template：用 `Ir/20260331-Ir-test.xlsx` 的 `Shermo_New` 结构作为通用模板页，支持 gas log + solution electronic log 配对后的 `Egas`、`Ggas`、`Ggas+1M`、`Esol`、`Gsol` 输出。

### 明确不做

- 不实现 CDX 二进制写入作为第一阶段能力；首轮只导出 CDXML。CDX 需要单独调研二进制格式和第三方转换策略后另起 feature。
- 不实现 ChemDraw 分子结构编辑器、反应式绘制、分子 2D layout 或 CDXML 分子结构导出；本 roadmap 只处理能量图形对象。
- 不生成 PDF、PPTX、SVG、DOCX、HTML report 或完整组合报告模板。
- 不在 Web 前端生成 PNG/CDXML/XLSX bytes；前端只展示和持久化 ShellResponse artifact projection。
- 不重新计算能量、校正项、单位换算或反应路径；导出层消费已经存在的 profile/object/table rows。
- 不引入云存储、账号、自动保存或跨设备同步。
- 不把用户提供的私有 workbook 原文件复制进仓库；只沉淀字段口径和可复现测试 fixture。

## 3. 模块拆分（概设）

```
RxnFlow Report Export Quality
├── Energy Table Contract：字段、单位、公式来源和 CSV/XLSX 共享中间层
├── XLSX Workbook Writer：工作簿布局、公式、warnings sheet 和 visual QA
├── Diagram Route Layout：PNG/CDXML 共用 route、坐标、label/value 避让和 missing point
├── CDXML ChemDraw Writer：可编辑 CDXML 对象、兼容性 fixture 和 CDX 边界
├── Web Export Verification：Report Export Panel 下载/持久化/metadata 回归
└── Export Documentation：开发者和用户指南
```

### Energy Table Contract · 能量表契约

- **职责**：把用户 workbook 表头沉淀为稳定 `EnergyTableColumn` / `EnergyTableRow` 字段；第一列始终是 structure name，数值列显式带 unit/source，缺失值不补 0。
- **承载的子 feature**：`export-energy-table-contract`
- **触碰的现有代码 / 模块**：`rxnflow.export`、report export tests、docs/dev。

### XLSX Workbook Writer · 工作簿导出

- **职责**：基于 table contract 输出审阅友好的 workbook，包含 Energy Table、Energy Profile、Warnings；公式与单位清晰，列宽冻结窗格稳定，后续可扩 CSV。
- **承载的子 feature**：`export-xlsx-workbook-template`
- **触碰的现有代码 / 模块**：`ReportExportService`、XLSX writer tests、spreadsheet render/inspection。

### Diagram Route Layout · 能量图路线布局

- **职责**：统一 PNG/CDXML 对 profile 的几何投影，处理多点、相同能量、缺失点、长 label 和 y-axis padding，避免 text/line 重叠。
- **承载的子 feature**：`export-energy-diagram-route-layout`
- **触碰的现有代码 / 模块**：`build_energy_diagram_route`、PNG writer、CDXML writer、image/CDXML tests。

### CDXML ChemDraw Writer · ChemDraw XML 导出

- **职责**：生成 ChemDraw 可编辑的 CDXML energy diagram，并通过 XML fixture 回归固定文档结构、颜色/字体、对象 ID、BoundingBox 和 missing point 行为。
- **承载的子 feature**：`export-cdxml-chemdraw-compat`
- **触碰的现有代码 / 模块**：`_render_cdxml`、CDXML tests、ChemDraw compatibility notes。

### Web Export Verification · Web 导出验证

- **职责**：覆盖 Web Report Export Panel 在桌面/窄屏、fixture/local-http 下导出 PNG/CDXML/XLSX、inline download、browser-local persisted object、checksum 和 warnings。
- **承载的子 feature**：`web-report-export-verification`
- **触碰的现有代码 / 模块**：`ReportExportPanel`、`exportArtifactPersistence`、Playwright E2E、Browser smoke。

### Export Documentation · 导出文档

- **职责**：为开发者和用户说明字段口径、单位、ChemDraw/CDXML 使用方式、CDX 不支持原因、artifact 保存路径和常见 warnings。
- **承载的子 feature**：`report-export-guides`
- **触碰的现有代码 / 模块**：`docs/dev`、`docs/user`、architecture/requirements acceptance 回写。

## 4. 模块间接口契约 / 共享协议（架构层详设）

本节是后续 feature design 的硬约束。若某条 feature 发现契约不合适，先 update 本 roadmap，再继续实现。

### 4.1 Energy Table Schema

**方向**：core export service → XLSX/CSV writers
**形式**：Python dataclass intermediate

**契约**：

```python
@dataclass(frozen=True)
class EnergyTableColumn:
    key: str
    label: str
    unit: str | None = None
    group: str | None = None
    source: str | None = None

@dataclass(frozen=True)
class EnergyTableRow:
    structure_name: str
    values: dict[str, Any]
    node_id: str | None = None
    object_id: str | None = None
    missing_reason: str | None = None
    warnings: tuple[RxnFlowWarning, ...] = ()
```

**首轮列组**：

- Structure：`structure_name`，来自对象 label、profile point label 或显式 row。
- Gas：`egas_hartree`、`egas_kcal_mol`、`gas_basis_functions`、`ggas_hartree`、`ggas_kcal_mol`、`ggas_1m_hartree`、`ggas_1m_kcal_mol`。
- Shermo / Whitesides：`ggas_shermo_hartree`、`ggas_shermo_kcal_mol`、`ggas_shermo_1m_hartree`、`ggas_shermo_1m_kcal_mol`。
- Solution：`esol_hartree`、`esol_kcal_mol`、`solution_basis_functions`、`gsol_hartree`、`gsol_kcal_mol`。
- Profile：`relative_energy`、`relative_unit`、`missing_reason`。

**约束**：

- 第一列必须是结构名称；不能把 object id 或 node id 放到第一列替代 structure name。
- Hartree → kcal/mol 使用 `HARTREE_TO_KCAL_MOL` 常量；不在 writer 内写魔法数。
- 未解析或未提供的字段保持 blank / absent；不得写 0 或猜测值。
- CSV 后续若支持，必须复用同一列定义和 row builder，不单独维护字段清单。

### 4.2 XLSX Workbook Contract

**方向**：`EnergyTableRow` / `EnergyProfile` → XLSX artifact bytes
**形式**：`ReportExportService` writer

**契约**：

```python
ExportRequest(
    formats=("xlsx",),
    objects=objects,
    profile=profile,
    table_rows=manual_rows,
    title="..."
)
```

输出 workbook 至少包含：

- `Energy Table`：结构表，第一行可选 title，下一行 column labels，冻结首列/表头。
- `Shermo_New`：面向计算化学审阅的模板页，保留 Egas/Ggas/Ggas+1M/Esol/Gsol 的列位置，并用 Excel 公式表达 kcal/mol 换算和 `Gsol = Ggas+1M - Egas + Esol`。
- `Energy Profile`：node id、label、absolute value/unit、relative value/unit、missing reason。
- `Warnings`：有 warnings 时才生成，列为 code/message/target。

**约束**：

- XLSX writer 只消费已构造的 rows/profile，不调用 parser、registry、graph 或 energy engine。
- workbook 中 derived kcal/mol 值可以写计算后的数值；后续若引入 Excel 公式，公式必须有测试覆盖，不能破坏 cached value 检查。
- `Shermo_New` 中尚未实现的 Shermo / Whitesides 熵校正列必须保持空白或显式占位说明，不得用普通自由能数据冒充校正后数据。
- writer dependency 缺失必须返回 `export_failed target=dependency`，不能 import-time 崩溃。

### 4.3 Energy Diagram Route Contract

**方向**：`EnergyProfile` → PNG/CDXML writers
**形式**：shared route intermediate

**契约**：

```python
@dataclass(frozen=True)
class EnergyDiagramState:
    node_id: str
    label: str
    relative_value: float | None
    unit: EnergyUnit
    missing_reason: str | None = None

@dataclass(frozen=True)
class EnergyDiagramRoute:
    profile_id: str
    path_id: str
    states: tuple[EnergyDiagramState, ...]
    color: str | None = None
    y_axis_label: str | None = None
    warnings: tuple[RxnFlowWarning, ...] = ()
```

**约束**：

- missing relative energy 生成 `missing_energy_point` warning，并且不画假 state line。
- y-axis unit 来自 `profile.options.output_unit`；单个 point 有 relative unit 时允许 state 保留自身 unit，但 route label 仍以 profile output unit 为准。
- PNG 和 CDXML 必须从同一个 route 构建，避免两种格式数值/缺失点语义不一致。

### 4.4 CDXML Writer Contract

**方向**：`EnergyDiagramRoute` → CDXML bytes
**形式**：UTF-8 XML document

**契约**：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE CDXML SYSTEM "http://www.cambridgesoft.com/xml/cdxml.dtd">
<CDXML CreationProgram="RxnFlow" ...>
  <colortable>...</colortable>
  <fonttable>...</fonttable>
  <page id="1" ...>
    <group Integral="yes">...</group>
  </page>
</CDXML>
```

**对象语义**：

- state horizontal line 使用 `graphic GraphicType="Line"`。
- state connector 使用 `arrow` 或等价 ChemDraw line object。
- label/value/missing 文本使用 `t` + `s` 节点。
- 所有 generated object id 必须在单文档内唯一且稳定。

**约束**：

- CDXML 输出必须能被 XML parser 解析；测试固定 root、page、fonttable、colortable、graphic、arrow、text 和 missing point。
- 本 roadmap 不输出 `.cdx`；UI 中若出现 CDX 入口，必须 disabled 并解释为 future / unsupported。
- 参考项目 `Energy_Diagram_Plotter_CDXML` 只作为布局和 CDXML 对象结构调研输入，不直接复制其 PyQt UI、全局状态或不可控脚本结构。

### 4.5 Shell / Web Artifact Contract

**方向**：Platform Shell → Web Report Export Panel → Browser Project Repository
**形式**：ShellResponse artifact projection

**契约**：

```ts
type ExportFormat = "png" | "cdxml" | "xlsx"

type ShellArtifact = {
  id: string
  format: ExportFormat
  path?: string | null
  bytes_base64?: string
  metadata: Record<string, JsonValue>
}
```

**约束**：

- Web 只持久化带 `bytes_base64` 的 PNG/CDXML/XLSX artifact；没有 inline bytes 时只能展示 runtime metadata。
- browser-local persisted path 使用 `exports/{basename}.{format}`，checksum 由 repository 写入后返回。
- metadata key/value 和 warning code 原样展示，不进入 i18n 翻译。
- Web 不新增 CSV/CDX 格式枚举；除非 core Shell 和 artifact persistence 已先支持。

## 5. 子 feature 清单

1. `export-energy-table-contract`：固定能量表列、row builder、单位/缺失语义和用户 workbook 字段映射。最小闭环。**状态：done**，已落地 `energy-table-v1`、列 key helper、样表 header normalization、manual/profile merge 契约和 XLSX artifact schema metadata；CSV/CDX 仍未开放。
2. `export-xlsx-workbook-template`：强化 XLSX workbook writer，补 visual/structure tests，明确 CSV 复用路径但不默认开放。**状态：done**，已落地 group header、autofilter、freeze pane、列宽策略、Export Metadata sheet 和 workbook XML 结构回归；当前环境缺少 `soffice`/`pdftoppm`，未做真实渲染截图。
3. `export-energy-diagram-route-layout`：提升 PNG/CDXML 共用 route layout，处理长 label、missing point、相同能量和 y-axis padding。**状态：done**，已落地 route padded energy bounds、state anchors、PNG/CDXML anchor consumption、same-energy/all-missing 回归；不做 label collision avoidance。
4. `export-cdxml-chemdraw-compat`：补 CDXML 兼容性 fixture 与 ChemDraw 对象结构回归，明确 CDX 不支持边界。**状态：done**，已落地 CDXML root/page/group document shape、generated id uniqueness、graphic/arrow/text 的 Z/BoundingBox/LineWidth/justification 回归、missing point 不生成假 state line、`cdx` unsupported guard；不引入 ChemDraw GUI、PyQt、Open Babel、RDKit、CDX 或 molecule-level CDXML。
5. `web-report-export-verification`：补 Web fixture/local-http 导出回归，覆盖 inline download、persisted checksum、warnings 和窄屏布局。**状态：done**，已落地 PNG/CDXML/XLSX download MIME、writer metadata、`energy-table-v1` schema metadata、browser-local persisted checksum、unsupported `cdx` persistence guard、include-bytes-off、persistence failure、local-http 真实 writer ids 和窄屏 E2E；Web 仍不生成导出 bytes。
6. `report-export-guides`：补开发者/用户指南，同步 acceptance 后的现状文档。**状态：done**，已补 `docs/dev/report-export-artifacts.md` 和 `docs/user/report-export-artifacts.md`，覆盖 core/Shell/Web artifact contract、Energy Table 字段口径、Web 操作、PNG/CDXML/XLSX 用途、CDXML/CDX 边界、Download/Persisted/Checksum/Metadata/Warnings 语义和 `exports/...` 保存路径。
7. `ir-gas-solution-workbook-template`：用 Ir 文件夹的真实 Gaussian gas/solution log 和 `Shermo_New` 样表补通用 XLSX 模板页，确保 `Gsol` 公式和 cached value 可验证。**状态：done**，已以 `rxnflow.solution_pairs` 和 `_write_shermo_template_sheet()` 落地，真实 Ir 导出验证通过；Shermo/Whitesides 仍不计算。
8. `shermo-whitesides-export-columns`：后续把 Shermo 与 Whitesides 校正数据接入表格显示和导出。**状态：planned**，依赖 energy chemistry semantics 中的校正模型；参考资料：`https://831447.xyz/p/2025/shermo`、`https://831447.xyz/p/2025/whitesides`。

## 6. 排期 / 推进顺序

技术依赖顺序建议如下：

1. 先做 `export-energy-table-contract`，因为 XLSX/CSV/Web 展示都依赖字段口径。
2. 再做 `export-xlsx-workbook-template`，把用户最关心的 workbook 模板稳定下来。
3. 然后做 `export-energy-diagram-route-layout` 和 `export-cdxml-chemdraw-compat`，先统一 route，再验证 CDXML。
4. 最后做 `web-report-export-verification` 和 `report-export-guides`，把端到端行为和使用说明补齐。

## 7. 观察项

- 用户提供的 workbook 表头显示多个历史版本：`Sheet1`、`shermo`、`Sheet2` 的列名和公式不同。首轮应优先吸收稳定列：structure name、Egas、basis function、Ggas、Ggas+1M、Ggas(shermo)、Ggas(shermo+1M)、Esol、Gsol、relative profile；更细的 entropy / Whitesides 原始列可先通过显式 `table_rows` 传入，不在 parser 里臆造。
- CDXML 官方生态同时存在 XML `.cdxml` 和二进制 `.cdx`。CDXML 可以用标准 XML writer 和 ChemDraw DTD 形状回归推进；CDX 二进制写入/转换风险更高，不应和首轮 CDXML 兼容混在一个 feature。
- 如果后续用户需要 CSV，建议作为 `export-csv-energy-table` 独立 feature，从 `EnergyTableColumn` / `EnergyTableRow` 直接写，不改 Web Report Export Panel 默认格式。
- 如果后续需要组合报告，应另起 `rxnflow-report-composer` roadmap，覆盖图谱截图、能量曲线、表格、项目 metadata 和多格式报告，不塞进当前导出质量路线。
- 2026-06-09 用户明确 Shermo / Whitesides 可先不实现，但必须进入 roadmap；因此本 roadmap 重新打开为 active，直到 Ir 模板输出和后续校正项规划完成验收。
