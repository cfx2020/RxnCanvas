---
doc_type: roadmap
slug: rxnflow-core-platform
status: active
created: 2026-05-01
last_reviewed: 2026-05-01
tags: [rxnflow, core, platform, reaction-graph, computational-chemistry]
related_requirements: []
related_architecture: [ARCHITECTURE]
---

# RxnFlow Core Platform

## 1. 背景

RxnFlow 要先建立一条从"计算输出文件"到"化学对象登记、反应图谱、能量曲线、报告导出"的核心链路。该 roadmap 规划的是可被 Web、桌面 app 和 CLI 复用的核心平台层，不直接绑定单一前端或运行时。

这个规划的目标不是一次性完成全部产品，而是先把领域模型、模块边界和跨模块接口定到后续 feature 可以复用的程度。后续每条 feature design 都应把本 roadmap 的接口契约当作硬约束输入；若发现契约不合理，应先回到 roadmap update 修订。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- Project、Raw Output、Chemical Object、Reaction Graph、Energy Profile、Export Artifact 等核心领域模型。
- 项目创建、加载、保存、资源索引和最小持久化格式。
- 解析器插件协议，以及 Gaussian log、ORCA output、XYZ fixture 的首批解析入口。
- 化学对象登记、来源追踪、校正项记录和基础去重。
- 反应图节点、边、路径、分叉和 GraphPatch 协议。
- 相对能量表与能量曲线数据计算。
- PNG、ChemDraw/CDXML、Excel 能量表格的基础导出能力。
- Web / CLI 优先的薄壳层适配方式，为后续 macOS app、Windows exe、Linux CLI 分发留接口。

### 明确不做

- 外部量化计算软件的任务调度、队列管理和远程作业提交。
- 完整云同步、多人协作、权限系统和账号系统。
- ChemDraw 的完整编辑能力复刻；本阶段只规划 CDXML 导出。
- 微观动力学、反应速率模型、自动反应路径搜索和构象搜索。
- 一次性支持所有计算软件输出格式；首批格式只作为解析器插件协议的基线验证。
- 对具体前端框架、桌面框架或后端部署平台做不可逆绑定。

## 3. 模块拆分（概设）

```
RxnFlow Core Platform
├── Domain Model：Project / ChemicalObject / Graph / EnergyProfile 共享模型
├── Project Store：项目创建、加载、保存和资源索引
├── Parser Plugins：Gaussian / ORCA / XYZ 等解析插件入口
├── Chemical Registry：对象登记、校正项、去重和引用
├── Reaction Graph：节点、连线、路径、分叉和 patch 协议
├── Energy Engine：相对能量表和能量曲线数据
├── Export Service：PNG / CDXML / Excel 导出
└── Platform Shells：Web、桌面、CLI 的薄适配层
```

### Domain Model · 共享领域模型

- **职责**：定义跨模块共享的数据结构和术语，包括 Project、RawFile、ChemicalObject、Correction、ReactionGraph、EnergyProfile、ExportArtifact 等。它只描述领域对象和约束，不包含 UI 状态和平台 API。
- **承载的子 feature**：`core-fixture-vertical-slice`
- **触碰的现有代码 / 模块**：全新

### Project Store · 项目与资源存储

- **职责**：管理项目目录、资源文件索引、项目元数据、保存/加载 API。它负责把领域对象持久化为可版本化、可迁移的项目状态，不负责解析化学格式或渲染 UI。
- **承载的子 feature**：`project-storage-model`
- **触碰的现有代码 / 模块**：全新

### Parser Plugins · 计算输出解析插件

- **职责**：提供统一解析器接口，并把 Gaussian、ORCA、XYZ 等格式实现隔离在插件中。它输出 ChemicalObjectDraft 和解析警告，不直接登记进项目。
- **承载的子 feature**：`parser-plugin-baseline`
- **触碰的现有代码 / 模块**：全新

### Chemical Registry · 化学对象登记

- **职责**：把解析结果登记为项目内可复用的 ChemicalObject，维护来源追踪、校正项、对象引用和基础去重策略。它不关心图谱布局，也不执行导出。
- **承载的子 feature**：`chemical-registry-corrections`、`import-registry-workflow`
- **触碰的现有代码 / 模块**：全新

### Reaction Graph · 反应图谱

- **职责**：定义反应节点、连线、路径、分叉和图谱 patch 协议，支撑 UI 和 agent 以同一套操作修改图谱。它不直接计算能量，只提供路径和对象引用。
- **承载的子 feature**：`reaction-graph-protocol`、`graph-editor-workspace`
- **触碰的现有代码 / 模块**：全新

### Energy Engine · 能量计算

- **职责**：根据 ReactionPath 和 ChemicalObject 计算相对能量表、曲线数据和缺失数据诊断。它只处理已登记对象和明确校正项，不解析原始输出文件。
- **承载的子 feature**：`energy-profile-engine`
- **触碰的现有代码 / 模块**：全新

### Export Service · 报告导出

- **职责**：把项目状态、图谱、能量曲线和表格转换为外部文件格式，包括 PNG、CDXML 和 Excel。它依赖领域模型和计算结果，不反向修改项目状态。
- **承载的子 feature**：`report-export-baseline`
- **触碰的现有代码 / 模块**：全新

### Platform Shells · 端侧适配

- **职责**：为 Web、CLI、macOS、Windows 等入口提供薄适配层，负责文件选择、窗口/路由、命令参数、目标端权限和用户交互接线。它调用核心服务，不复制核心业务逻辑。
- **承载的子 feature**：`platform-shell-baseline`
- **触碰的现有代码 / 模块**：全新

## 4. 模块间接口契约 / 共享协议（架构层详设）

本节定义后续 feature 必须共同遵守的核心协议。具体语言和框架尚未拍板，下面用 TypeScript 风格伪类型表达字段和边界；正式实现可映射到选定语言的等价类型。

### 4.1 共享标识与错误协议

**方向**：所有核心模块共享
**形式**：类型约定

**契约**：

```ts
type ID = string
type ISODateTime = string

type RxnFlowErrorCode =
  | "invalid_input"
  | "unsupported_format"
  | "parse_failed"
  | "missing_energy"
  | "graph_invalid"
  | "export_failed"
  | "internal_error"

type RxnFlowError = {
  code: RxnFlowErrorCode
  message: string
  target?: string
  details?: Record<string, unknown>
}

type Result<T> =
  | { ok: true; value: T; warnings?: RxnFlowWarning[] }
  | { ok: false; error: RxnFlowError; warnings?: RxnFlowWarning[] }
```

**约束**：

- 跨模块调用不得直接抛出未分类错误；必须映射到 `RxnFlowErrorCode`。
- `target` 用于指向文件、对象、节点、边或导出请求中的具体位置。
- `warnings` 表示流程可以继续但需要向用户展示或记录的问题。

### 4.2 Project Store 协议

**方向**：Platform Shells / Core Services → Project Store
**形式**：服务接口

**契约**：

```ts
type ProjectManifest = {
  id: ID
  name: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  schemaVersion: string
  resources: ProjectResource[]
}

type ProjectResource = {
  id: ID
  kind: "raw_file" | "chemical_object" | "reaction_graph" | "energy_profile" | "export_artifact"
  path?: string
  checksum?: string
  metadata?: Record<string, unknown>
}

interface ProjectStore {
  createProject(input: { name: string; location?: string }): Result<ProjectManifest>
  loadProject(projectIdOrPath: string): Result<ProjectManifest>
  saveProject(projectId: ID): Result<ProjectManifest>
  addRawFile(projectId: ID, file: RawFile): Result<ProjectResource>
}
```

**约束**：

- `schemaVersion` 必须随持久化格式变更升级。
- `addRawFile` 只登记文件和资源元数据，不解析化学内容。
- 资源路径应使用项目相对路径，避免绑定某台机器的绝对路径。

### 4.3 Parser Plugin 协议

**方向**：Import Workflow → Parser Plugins
**形式**：插件接口

**契约**：

```ts
type RawFile = {
  id: ID
  name: string
  path?: string
  content?: Uint8Array | string
  mimeType?: string
  size?: number
}

type ParserCapability = {
  supported: boolean
  format?: "gaussian-log" | "orca-output" | "xyz" | "unknown"
  confidence: number
  reason?: string
}

type ParseOptions = {
  expectedFormat?: string
  strict?: boolean
}

type Provenance = {
  sourceFileId: ID
  parserId: string
  parserVersion: string
  parsedAt: ISODateTime
}

type ParseWarning = {
  code: "partial_parse" | "missing_section" | "ambiguous_value" | "unit_assumed"
  message: string
  target?: string
}

interface ParserPlugin {
  id: string
  version: string
  canParse(file: RawFile): ParserCapability
  parse(file: RawFile, options?: ParseOptions): Result<ParseResult>
}

type ParseResult = {
  objects: ChemicalObjectDraft[]
  provenance: Provenance
}
```

**约束**：

- `parse` 输出 draft，不直接写 Project Store 或 Chemical Registry。
- 插件必须在 provenance 中记录 parser id/version。
- 格式识别置信度低时，调用方需要让用户确认或走显式格式选择。

### 4.4 Chemical Object 与 Registry 协议

**方向**：Parser Plugins → Chemical Registry；Reaction Graph / Energy Engine → Chemical Registry
**形式**：共享数据结构 + 服务接口

**契约**：

```ts
type EnergyUnit = "hartree" | "kcal_mol" | "kj_mol"

type EnergyValue = {
  value: number
  unit: EnergyUnit
  reference?: string
}

type Atom3D = {
  element: string
  x: number
  y: number
  z: number
  unit: "angstrom"
}

type Correction = {
  id: ID
  kind: "resonance" | "solvation" | "manual"
  energy: EnergyValue
  note?: string
  createdAt: ISODateTime
}

type ChemicalObjectDraft = {
  label?: string
  formula?: string
  charge?: number
  spinMultiplicity?: number
  method?: string
  geometry?: Atom3D[]
  energies: Record<string, EnergyValue>
  thermochemistry?: Record<string, EnergyValue>
}

type ChemicalObject = ChemicalObjectDraft & {
  id: ID
  sourceFileId: ID
  corrections: Correction[]
  provenance: Provenance
}

interface ChemicalRegistry {
  register(projectId: ID, result: ParseResult): Result<ChemicalObject[]>
  getObject(projectId: ID, objectId: ID): Result<ChemicalObject>
  applyCorrection(projectId: ID, objectId: ID, correction: Correction): Result<ChemicalObject>
}
```

**约束**：

- 能量值必须显式携带单位。
- registry 不隐式修改 parser 输出；用户校正项必须作为 `Correction` 追加记录。
- 基础去重只能合并明确相同来源或用户确认的对象，不能基于分子式自动合并。

### 4.5 Reaction Graph 协议

**方向**：Graph Editor / Agent Commands → Reaction Graph
**形式**：GraphPatch 操作协议 + 服务接口

**契约**：

```ts
type ReactionNodeKind = "species" | "transition_state" | "group" | "annotation"

type ReactionNode = {
  id: ID
  kind: ReactionNodeKind
  label: string
  chemicalObjectIds: ID[]
  position?: { x: number; y: number }
  metadata?: Record<string, unknown>
}

type ReactionEdge = {
  id: ID
  from: ID
  to: ID
  label?: string
  metadata?: Record<string, unknown>
}

type ReactionGraph = {
  id: ID
  projectId: ID
  nodes: ReactionNode[]
  edges: ReactionEdge[]
  paths: ReactionPath[]
}

type ReactionPath = {
  id: ID
  label: string
  nodeIds: ID[]
}

type GraphPatch =
  | { op: "add_node"; node: ReactionNode }
  | { op: "update_node"; id: ID; patch: Partial<ReactionNode> }
  | { op: "add_edge"; edge: ReactionEdge }
  | { op: "update_edge"; id: ID; patch: Partial<ReactionEdge> }
  | { op: "remove"; id: ID }
  | { op: "set_path"; path: ReactionPath }

interface ReactionGraphService {
  createGraph(projectId: ID, input?: { label?: string }): Result<ReactionGraph>
  applyPatch(projectId: ID, graphId: ID, patches: GraphPatch[]): Result<ReactionGraph>
  listPaths(projectId: ID, graphId: ID): Result<ReactionPath[]>
}
```

**约束**：

- patch 操作必须可由 UI 和 agent 共同生成。
- Reaction Graph 只引用 ChemicalObject id，不复制完整化学对象。
- `listPaths` 不负责能量计算，只返回路径结构。

### 4.6 Energy Engine 协议

**方向**：Reaction Graph / UI → Energy Engine
**形式**：服务接口

**契约**：

```ts
type EnergyOptions = {
  baselineNodeId?: ID
  outputUnit: "kcal_mol" | "kj_mol"
  includeCorrections: boolean
  energyKey: string
}

type EnergyPoint = {
  nodeId: ID
  label: string
  absoluteEnergy?: EnergyValue
  relativeEnergy?: EnergyValue
  missingReason?: string
}

type EnergyProfile = {
  id: ID
  graphId: ID
  pathId: ID
  options: EnergyOptions
  points: EnergyPoint[]
  warnings: RxnFlowWarning[]
}

interface EnergyEngine {
  computeProfile(projectId: ID, graphId: ID, pathId: ID, options: EnergyOptions): Result<EnergyProfile>
}
```

**约束**：

- 缺失能量时返回 `missing_energy` 或带 `missingReason` 的点，不得静默填 0。
- 相对能量必须记录 baseline 和输出单位。
- 校正项是否计入由 `includeCorrections` 明确控制。

### 4.7 Export Service 协议

**方向**：UI / CLI → Export Service
**形式**：服务接口

**契约**：

```ts
type ExportFormat = "png" | "cdxml" | "xlsx"

type ExportRequest = {
  projectId: ID
  graphId?: ID
  energyProfileId?: ID
  formats: ExportFormat[]
  destination?: string
  options?: Record<string, unknown>
}

type ExportArtifact = {
  id: ID
  format: ExportFormat
  path?: string
  bytes?: Uint8Array
  createdAt: ISODateTime
}

interface ExportService {
  export(projectId: ID, request: ExportRequest): Result<ExportArtifact[]>
}
```

**约束**：

- Export Service 不修改 Reaction Graph 或 EnergyProfile。
- CDXML 导出策略需要在具体 feature 中确认第三方依赖和兼容边界。
- PNG 导出必须明确来源是图谱视图、能量曲线还是组合报告。

## 5. 子 feature 清单

1. **core-fixture-vertical-slice** — 用内置 fixture 跑通项目创建、对象登记、两节点反应图、相对能量表的最小闭环
   - 所属模块：Domain Model / Project Store / Chemical Registry / Reaction Graph / Energy Engine
   - 依赖：无
   - 状态：planned
   - 对应 feature：未启动
   - 备注：建立共享模型和服务边界，允许内部实现先保持最小

2. **project-storage-model** — 定义项目目录/持久化格式、资源索引和加载保存 API
   - 所属模块：Project Store
   - 依赖：`core-fixture-vertical-slice`
   - 状态：planned
   - 对应 feature：未启动

3. **parser-plugin-baseline** — 建立解析器插件协议，并实现 Gaussian log、ORCA output、XYZ fixture 的首批解析
   - 所属模块：Parser Plugins
   - 依赖：`project-storage-model`
   - 状态：planned
   - 对应 feature：未启动

4. **chemical-registry-corrections** — 实现化学对象登记、校正项记录、来源追踪和基础去重
   - 所属模块：Chemical Registry
   - 依赖：`parser-plugin-baseline`
   - 状态：planned
   - 对应 feature：未启动

5. **reaction-graph-protocol** — 实现反应图节点/边/路径/分叉数据结构和 GraphPatch 协议
   - 所属模块：Reaction Graph
   - 依赖：`chemical-registry-corrections`
   - 状态：planned
   - 对应 feature：未启动

6. **energy-profile-engine** — 基于反应路径计算相对能量表和能量曲线数据
   - 所属模块：Energy Engine
   - 依赖：`reaction-graph-protocol`
   - 状态：planned
   - 对应 feature：未启动

7. **import-registry-workflow** — 实现项目侧边栏、单文件/批量导入、解析结果确认和登记流程
   - 所属模块：Chemical Registry / Platform Shells
   - 依赖：`chemical-registry-corrections`
   - 状态：planned
   - 对应 feature：未启动

8. **graph-editor-workspace** — 实现可编辑反应图画布、节点连接、路径选择和实时网络预览
   - 所属模块：Reaction Graph / Platform Shells
   - 依赖：`reaction-graph-protocol`、`import-registry-workflow`
   - 状态：planned
   - 对应 feature：未启动

9. **report-export-baseline** — 实现 PNG、CDXML 和 Excel 能量表格的基础导出
   - 所属模块：Export Service
   - 依赖：`energy-profile-engine`、`graph-editor-workspace`
   - 状态：planned
   - 对应 feature：未启动

10. **platform-shell-baseline** — 建立 Web/CLI 优先的薄壳层适配方式，为后续 macOS/Windows/Linux 分发留接口
    - 所属模块：Platform Shells
    - 依赖：`report-export-baseline`
    - 状态：planned
    - 对应 feature：未启动

**最小闭环**：第 1 条 `core-fixture-vertical-slice` 做完后，系统能在没有真实 UI 和真实解析器的前提下，用内置 fixture 创建项目、登记两个化学对象、组成一条简单反应路径，并输出相对能量表。这是后续解析器、UI 和导出功能的共同骨架。

## 6. 排期思路

拆解顺序采用 domain-core-first：先建立共享模型和服务边界，再引入持久化、解析器、登记、图谱、能量计算，最后接 UI workflow、导出和平台壳层。这样可以在最早阶段避免前端组件、解析器实现和导出格式各自发明数据结构。

`core-fixture-vertical-slice` 被选为最小闭环，因为它不依赖真实文件格式、不依赖 UI，也不依赖导出库，但能迫使核心模型、服务边界和错误协议先对齐。这个 feature 完成后，后续每个模块都可以替换其中一段 mock 能力，而不是重新定义整条链路。

产品优先级上，`import-registry-workflow`、`graph-editor-workspace` 和 `report-export-baseline` 的顺序可以在核心协议稳定后按用户价值调整；当前依赖关系只表达技术前置，不替代产品排序决策。

## 7. 观察项

- 需要另起 `cs-decide` 或 roadmap update 拍板主技术栈、包管理方式、运行时语言和多端共享核心边界。
- 需要用户提供或确认可作为 fixture 的 Gaussian、ORCA、XYZ 样例文件，以及期望提取的字段优先级。
- CDXML 导出的兼容目标需要进一步确认：面向 ChemDraw 打开、面向出版图编辑，还是仅作为交换格式。
- `codestable/requirements/` 目前为空；后续开始实现前建议补一份核心产品需求，记录为什么要有这些能力和用户边界。
- 计算化学领域细节需要用户持续把关，特别是能量单位、热化学项、校正项语义、过渡态/中间体表示和多构象/多自旋态处理。
