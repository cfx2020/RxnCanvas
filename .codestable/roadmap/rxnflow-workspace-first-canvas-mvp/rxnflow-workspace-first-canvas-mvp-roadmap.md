---
doc_type: roadmap
slug: rxnflow-workspace-first-canvas-mvp
status: completed
created: 2026-06-03
last_reviewed: 2026-06-06
tags: [rxnflow, web, workspace-first, canvas, local-first, project-files, cdxml, energy-profile]
related_requirements: [web-workbench-shell, project-content-persistence, platform-shell-entry]
related_architecture: [core-platform, web-workbench]
---

# RxnFlow Workspace-First Canvas MVP

## 1. 背景

当前 Web Workbench 已经具备项目侧边栏、旧导入面板、对象列表、图谱画布、势能预览和导出面板，但用户验收时暴露出主流程心智模型不对：界面把能力摊在多个面板里，用户需要先理解“导入、登记、对象、画布、能量、导出”的内部步骤，才知道下一步怎么走。

本 roadmap 的目标是把初版收束成更直觉的工作流：用户先打开或创建一个 RxnFlow project，再用本地文件夹入口快速选择 Gaussian / ORCA / MAPLE / XYZ / extxyz 等外部计算输出；文件被拖到画布并使用后，必须进入当前项目文件区；画布节点直接显示结构名称、结构预览、能量和解析摘要；用户手动画线串成反应路径；右侧实时预览势能面；最后可保存项目，并通过右侧导出面板导出最小 ChemDraw CDXML 能量图等报告 artifact。

本 roadmap 在产品体验层面取代此前 `rxnflow-web-workbench-mvp`、`rxnflow-web-graph-editor` 和 `rxnflow-web-graph-editor-advanced` 的未来推进口径：那些 completed roadmap 仍作为已实现能力和可复用模块的历史记录，但不再作为初版主流程的设计约束。后续 feature 可以复用其中的 ShellClient、Browser Project Repository、transient import helper、Object Registry、Graph Canvas 和 Export Panel 能力，也可以隐藏、合并或删除不符合 workspace-first 心智模型的旧 UI 入口。2026-06-06 后续清理已删除旧 `ImportInbox.tsx` / Source Tray UI。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- Workspace-first 主流程：项目是持久权威，本地文件夹入口只是快速选择外部文件的 picker。
- 旧 UI 编排收束：允许重构、隐藏或合并此前面板式流程中的入口，让画布和项目文件成为第一主线。
- Project Files 面板：左侧只显示当前项目已经拥有的计算输出文件，并允许项目内 raw file 再次拖到画布；`exports/...` 报告 artifacts 归右侧 Export 面板管理。
- 本地文件夹 / 文件选择入口：用于快速找到外部 log/out/xyz/extxyz 文件，拖到画布后写入项目。
- Raw file drop to canvas：文件拖到画布后触发 parse preview、登记对象、创建 graph node 的最小闭环。
- 多对象 / 多帧解析选择：单对象文件直接生成节点；多对象或多帧文件在落点附近显示候选选择器，再按用户选择创建节点。
- Canvas chemical node：节点展示结构名称、来源文件、方法、电荷自旋、可用能量、warning 和轻量结构预览。
- Path authoring + PES preview：用户拖线连接节点形成 active path，右侧预览相对能量、相邻 step delta 和 missing/correction 信息。
- Minimal CDXML export：基于 active path 导出结构名称、相对能量、相邻能量差和必要 warning marker。
- QA / Guides：固定新主流程的桌面、窄屏和 local-http 验收脚本。

### 明确不做

- 不做 ChemDraw `.cdx` binary writer。
- 不做 molecule-level CDXML、原子/键语义、反应式结构或 ChemDraw 编辑器。
- 不做外部量化计算任务提交、队列、远程作业或自动运行 Gaussian / ORCA / MAPLE。
- 不做云同步、账号、权限、团队协作、CRDT 或冲突合并。
- 不做完整文件夹 watcher、后台自动解析整个目录或大文件 chunking。
- 不在 Web 前端复制 parser、registry、reaction graph、energy engine 或 export writer 逻辑。
- 不把浏览器本地文件夹 handle 当作长期项目权威；项目内容仍由 Browser Project Repository / Project Content / `.rxnflow.zip` 承担。
- 不删除或重写核心领域能力；本 roadmap 调整的是用户可见编排和 UI 信息架构，核心 parser / registry / graph / energy / export 仍复用既有边界。

## 3. 模块拆分（概设）

```
RxnFlow Workspace-First Canvas MVP
├── Workspace Source：本地文件夹 / 文件选择 / browser project / local bridge path 的入口归一
├── Project Files Panel：展示项目已拥有 raw files 的左侧文件区
├── Raw File Drop Adapter：外部或项目内文件拖到画布后的 parse/register/add-node 编排
├── Parse Candidate Chooser：多对象 / 多帧解析结果的落点候选选择器
├── Canvas Chemical Node：结构名称、结构预览、能量和解析摘要节点
├── Path Authoring：从节点拖线形成 reaction path
├── PES Preview：右侧势能面、相对能量、step delta、missing/correction 展示
├── Minimal CDXML Export：active path 的最小 ChemDraw CDXML 能量图
└── Workspace-First QA & Guides：端到端验收、文档和边界说明
```

### Workspace Source · 工作区文件入口

- **职责**：提供外部本地文件夹 / 文件选择入口，并和现有 browser-local project、local-http bridge 入口区分清楚。它只负责帮助用户快速找到文件，不是项目持久化权威。
- **承载的子 feature**：`workspace-file-drop-minimal-loop`
- **触碰的现有代码 / 模块**：Project Sidebar、Browser Project Repository、transient import state、Shell runtime indicator、local-http transport。

### Project Files Panel · 项目文件面板

- **职责**：展示当前项目已保存的 `inputs/raw/...` 计算输出文件，显示 import/used 状态，让项目内 raw file 可再次拖到画布。导出的 CDXML/CSV/PNG/XLSX/SVG 等 artifacts 不进入左侧项目文件树。
- **承载的子 feature**：`workspace-file-drop-minimal-loop`、`workspace-first-flow-polish`
- **触碰的现有代码 / 模块**：Browser Project Repository、Project Sidebar、raw input persistence、export artifact persistence、i18n。

### Raw File Drop Adapter · 文件到画布编排

- **职责**：把外部文件或项目内 raw file drop 转换为“保存到项目、parse preview、register object、workspace.add_node”的顺序流程。成功后可见节点必须来自 ShellResponse workspace projection。
- **承载的子 feature**：`workspace-file-drop-minimal-loop`
- **触碰的现有代码 / 模块**：GraphCanvas、WorkbenchShell、transient import payload helper、Platform Shell `import.preview` / `import.register_all` / `workspace.add_node`。

### Parse Candidate Chooser · 解析候选选择器

- **职责**：当一个文件解析出多个 ChemicalObjectDraft、多个 frame 或 path-family 结构时，不自动把所有候选扔到画布，而是在落点附近展示候选列表，由用户选择要创建的节点。
- **承载的子 feature**：`canvas-chemical-node-card`
- **触碰的现有代码 / 模块**：ParsePreview projection、GraphCanvas overlay、Object Registry projection、i18n。

### Canvas Chemical Node · 化学节点卡

- **职责**：让画布节点承担主流程信息展示：结构名称、来源文件、方法、电荷自旋、能量 key/value、warning 和轻量结构预览。节点不成为独立的 ChemicalObject 数据源，只展示 core projection。
- **承载的子 feature**：`canvas-chemical-node-card`
- **触碰的现有代码 / 模块**：GraphCanvas node renderer、WorkbenchDomainState object/workspace projection、structure coordinate summary。

### Path Authoring · 路径绘制

- **职责**：用户从一个节点拖线到另一个节点创建 edge，并把连接顺序用于 active path；该模块只负责图谱编辑交互，不自动推断化学合理性。
- **承载的子 feature**：`canvas-path-authoring-pes-preview`
- **触碰的现有代码 / 模块**：GraphCanvas direct edge gesture、`workspace.connect`、`workspace.set_path`、Network Preview。

### PES Preview · 势能面预览

- **职责**：右侧基于 active path 调用 `energy.compute`，展示相对能量、相邻 step delta、缺失原因、校正项 marker 和可扫描曲线。前端不重算能量。
- **承载的子 feature**：`canvas-path-authoring-pes-preview`
- **触碰的现有代码 / 模块**：EnergyProfilePanel、Energy Curve、EnergyExpression projection、i18n。

### Minimal CDXML Export · 最小 CDXML 导出

- **职责**：基于 active path / EnergyProfile 生成 ChemDraw 可打开的 CDXML 能量图，只包含结构名称、相对能量、相邻能量差和必要 warning marker。
- **承载的子 feature**：`minimal-cdxml-energy-delta-export`
- **触碰的现有代码 / 模块**：ReportExportService CDXML writer、Energy Diagram Route、Report Export Panel、Export Format Capability、docs。

### Workspace-First QA & Guides · 验收与指南

- **职责**：用真实浏览器和 local-http bridge 固定新主流程，避免再次出现功能都在但用户不知道怎么跑的状态。
- **承载的子 feature**：`workspace-first-flow-qa-guides`
- **触碰的现有代码 / 模块**：Playwright、docs/user、docs/dev、i18n catalog。

## 4. 模块间接口契约 / 共享协议（架构层详设）

本节是后续 feature design 的硬约束。若实现时发现契约不合适，先 update 本 roadmap，再继续实现。

### 4.1 Workspace Source Contract

**方向**：Project Sidebar / Workspace Source UI → Project Files Panel / Raw File Drop Adapter
**形式**：Web UI + Browser Project Repository + optional local-http filesystem path

```ts
type WorkspaceSourceMode =
  | "browser-directory"
  | "browser-file-picker"
  | "browser-project"
  | "local-bridge-path"

type WorkspaceSourceRef = {
  mode: WorkspaceSourceMode
  id: string
  displayName: string
  rootLabel: string
  capabilities: {
    canListFiles: boolean
    canReadBytes: boolean
    canPersistHandle: boolean
    canUseFilesystemPath: boolean
  }
}
```

**约束**：

- `browser-directory` / `browser-file-picker` 只是外部文件选择入口，不是项目权威。
- `browser-project` 是当前 RxnFlow project 的 Browser Project Repository ref，承载项目文件。
- `local-bridge-path` 只能在 local-http / desktop / CLI 壳层中使用，Web 不把它伪造成浏览器可直接读写路径。
- 浏览器不支持目录 handle 或用户未授权时，UI 必须降级为 file picker 或现有 browser project 操作。

### 4.2 Project File Entry Contract

**方向**：Browser Project Repository / Project Content → Project Files Panel → GraphCanvas
**形式**：项目相对文件投影

```ts
type ProjectFileKind =
  | "gaussian-log"
  | "orca-output"
  | "maple-output"
  | "xyz"
  | "extxyz"
  | "export-artifact"
  | "unknown"

type ProjectFileEntry = {
  id: string
  projectRef: string
  path: string
  name: string
  kind: ProjectFileKind
  byteSize?: number
  checksum?: string
  status: "stored" | "previewed" | "registered" | "used-in-graph" | "exported" | "error"
  rawResourceId?: string | null
  registeredObjectIds: string[]
  graphNodeIds: string[]
  artifactIds: string[]
  warnings: string[]
}
```

**约束**：

- 文件被拖到画布并进入导入流程后，必须写入项目 `inputs/raw/...`，再创建或更新 `ProjectFileEntry`。
- Project Files Panel 展示的是项目内文件，不展示仅被本地 folder picker 看见但未进入项目的外部文件。
- 同一 checksum 的 raw file 可复用已有 project file entry，不重复写入多个 raw resource，除非用户明确改名/另存。

### 4.3 Raw File Drop To Canvas Contract

**方向**：外部 source 或 Project Files Panel → GraphCanvas → ShellClient
**形式**：拖放 intent + shell command sequence

```ts
type CanvasRawFileDropIntent = {
  source:
    | { kind: "external-file"; sourceRefId: string; fileName: string }
    | { kind: "project-file"; projectFileId: string }
  canvasPosition: [number, number]
  importMode: "single-object-auto" | "choose-when-multiple"
}

type CanvasRawFileDropResult = {
  projectFileId: string
  registeredObjectIds: string[]
  createdNodeIds: string[]
  warnings: string[]
}
```

**命令顺序**：

1. 外部文件 source：先写入 Browser Project Repository `inputs/raw/{sha12}-{safeName}` 并 merge manifest raw resource。
2. 调用 `import.preview`，得到 ParsePreview。
3. 单对象 preview：调用 `import.register_all` 或等价 selection，登记对象。
4. 多对象 / 多帧 preview：进入 Parse Candidate Chooser，用户选择后再登记。
5. 调用 `workspace.add_node(position, composition)`，成功后使用 ShellResponse workspace projection 更新画布。

**约束**：

- GraphCanvas 不直接读取 parser，不本地创建 ChemicalObject，不直接 patch domain graph。
- 如果任一步失败，UI 显示 error，并保留 project file 的 error/status；不得创建半成功的可见 graph node。
- 成功后的 node 来源必须可追溯到 `projectFileId`、`rawResourceId` 和 `registeredObjectIds`。

### 4.4 Parse Candidate Chooser Contract

**方向**：ParsePreview → GraphCanvas overlay → Raw File Drop Adapter
**形式**：UI-only selection

```ts
type ParseCandidateSummary = {
  candidateId: string
  objectIndex: number
  label: string
  frameIndex?: number | null
  roleHint?: "final" | "intermediate" | "path-point" | "unknown"
  method?: string | null
  charge?: number | null
  spinMultiplicity?: number | null
  displayEnergy?: { key: string; source: "energies" | "thermochemistry"; value: number; unit: string } | null
  coordinatePreview?: { atomCount: number; has3d: boolean; elements: string[]; previewKind: "text" | "unavailable" } | null
  warnings: string[]
}

type ParseCandidateSelection = {
  projectFileId: string
  selectedCandidateIds: string[]
  placement: "stack-near-drop" | "single-at-drop"
}
```

**约束**：

- 单对象 preview 不显示 chooser，直接创建一个节点。
- 多对象 / 多帧 preview 默认展示 chooser；如果 parser 能可靠标记 `roleHint="final"`，UI 可默认高亮 final，但仍让用户改选。
- 选择器是 UI-only，不写 Project Content；只有用户确认后的 registered objects 和 graph nodes 进入项目状态。

### 4.5 Canvas Chemical Node Contract

**方向**：WorkbenchDomainState objects/workspace → GraphCanvas
**形式**：节点展示投影

```ts
type CanvasChemicalNodeSummary = {
  nodeId: string
  objectIds: string[]
  projectFileIds: string[]
  structureName: string
  formula?: string | null
  charge?: number | null
  spinMultiplicity?: number | null
  method?: string | null
  displayEnergy?: {
    key: string
    source: "energies" | "thermochemistry" | "auto"
    value: number
    unit: "hartree" | "kcal_mol" | "kj_mol"
  } | null
  coordinatePreview?: {
    atomCount: number
    has3d: boolean
    elements: string[]
    previewKind: "text" | "unavailable"
  }
  warnings: string[]
}
```

**约束**：

- 节点标题优先使用用户可识别的结构名称；缺失时使用 project file basename + object index。
- 结构预览只消费 parser/core 提供的坐标摘要或坐标数据；不做 ChemDraw 2D 分子布局。
- 组合节点仍可显示多个 object ids，但初版 raw file drop 默认创建单对象节点。

### 4.6 PES Preview Contract

**方向**：GraphCanvas active path → EnergyProfilePanel / PES Preview
**形式**：Shell `energy.compute` result projection

```ts
type PesPreviewPoint = {
  nodeId: string
  structureName: string
  absoluteEnergy?: number | null
  relativeEnergy?: number | null
  stepDeltaEnergy?: number | null
  unit: "kcal_mol" | "kj_mol"
  missingReason?: string | null
  correctionCount: number
  warnings: string[]
}
```

**约束**：

- PES Preview 可在 active path 变化后触发 compute intent，但实际能量仍由 Shell/Core 返回。
- `stepDeltaEnergy` 从相邻有效 EnergyProfile point 派生；缺失点不能当 0。
- 点击 PES point 仍通过 `workspace.select(node_ids=[nodeId])` 联动画布，不直接 mutate selection。

### 4.7 Minimal CDXML Energy Delta Contract

**方向**：EnergyProfile / PesPreviewPoint → ReportExportService CDXML writer
**形式**：CDXML artifact

```python
@dataclass(frozen=True)
class MinimalCdxmlEnergyDeltaOptions:
    include_structure_name: bool = True
    include_relative_energy: bool = True
    include_step_delta_energy: bool = True
    include_missing_marker: bool = True
    include_correction_marker: bool = True
```

**约束**：

- CDXML 初版输出能量图对象，不输出 molecule atoms/bonds。
- label 至少包含结构名称和相对能量；相邻点可显示 step delta。
- missing point 必须显示缺失 marker 或 warning，不编造相对能量。
- `.cdx` 仍保持 unsupported。

## 5. 子 feature 清单

1. **workspace-file-drop-minimal-loop** — 打开本地工作区文件夹或选择文件，左侧展示项目文件区，拖单个输出文件到画布后保存入项目、解析登记并创建一个节点。
   - 所属模块：Workspace Source / Project Files Panel / Raw File Drop Adapter
   - 依赖：无
   - 状态：done
   - 对应 feature：`2026-06-03-workspace-file-drop-minimal-loop`
   - 备注：最小闭环已落地：external file 或 project raw file drop -> project file -> preview/register -> canvas node；多对象 / 多帧仍留给候选选择器。

2. **canvas-chemical-node-card** — 完善画布节点的信息密度和多对象 / 多帧候选选择器。
   - 所属模块：Parse Candidate Chooser / Canvas Chemical Node
   - 依赖：`workspace-file-drop-minimal-loop`
   - 状态：done
   - 对应 feature：`2026-06-03-canvas-chemical-node-card`
   - 备注：单对象直接建节点；多对象在落点附近选择；无 core/parser 明确信号时 role hint 保持 unknown，不自动全放画布。

3. **canvas-path-authoring-pes-preview** — 用画布拖线手动连接节点形成 active path，并在右侧预览势能面、相对能量和 step delta。
   - 所属模块：Path Authoring / PES Preview
   - 依赖：`canvas-chemical-node-card`
   - 状态：done
   - 对应 feature：`2026-06-04-canvas-path-authoring-pes-preview`
   - 备注：拖线后只在无歧义 create/append/prepend 场景更新 active path；分叉/重复/内部连接保留 edge 并提示手动整理。PES Preview 自动 compute 仍只消费 ShellResponse，不做前端能量重算或化学合理性判断。

4. **minimal-cdxml-energy-delta-export** — 基于 active path 导出最小 CDXML，包含结构名称、相对能量、相邻能量差和 missing/correction marker。
   - 所属模块：Minimal CDXML Export
   - 依赖：`canvas-path-authoring-pes-preview`
   - 状态：done
   - 对应 feature：`2026-06-04-minimal-cdxml-energy-delta-export`
   - 备注：CDXML 输出结构名、relative value + unit、相邻 `dE`、missing reason 和 `corr xN` marker；仍不是 CDX，不包含 molecule-level atoms/bonds。

5. **workspace-first-flow-polish** — 收束当前复杂三栏流程，把项目文件、画布、势能面和导出整理成 workspace-first 主界面。
   - 所属模块：Project Files Panel / GraphCanvas / PES Preview / Report Export UI
   - 依赖：`workspace-file-drop-minimal-loop`、`canvas-path-authoring-pes-preview`
   - 状态：done
   - 对应 feature：`2026-06-04-workspace-first-flow-polish`
   - 备注：已形成 Project Rail / Canvas Stage / Analysis Dock 主界面；2026-06-06 后续清理已删除 Source Tray / Import Inbox，导入入口收束为项目树 `+` / drop 与画布 drop；Diagnostics 收纳 command status 和 dev commands。

6. **workspace-first-flow-qa-guides** — 补桌面、窄屏、local-http E2E 和用户指南，固定新主流程验收脚本。
   - 所属模块：Workspace-First QA & Guides
   - 依赖：`minimal-cdxml-energy-delta-export`、`workspace-first-flow-polish`
   - 状态：done
   - 对应 feature：`2026-06-05-workspace-first-flow-qa-guides`
   - 备注：已补 workspace-first 用户指南、开发者 QA matrix、桌面/窄屏 fixture E2E 和 local-http bundle roundtrip 证据；固定 local-only、CDXML-not-CDX、fixture/local-http 证明边界和 Playwright output boundary。

**最小闭环**：第 1 条 `workspace-file-drop-minimal-loop` 已完成。第 2 条 `canvas-chemical-node-card` 已完成后，用户能创建或打开 active browser project，把一个单对象 log/out/xyz/extxyz 类文件拖到画布，看到该文件进入 Project Files Panel，并看到画布出现来自 ShellResponse 的富摘要节点；多对象 / 多帧 preview 会先显示候选选择器，用户确认后才登记选择对象并创建 stack nodes。第 3 条 `canvas-path-authoring-pes-preview` 已完成后，用户可以从节点拖线连接，在无歧义时自动形成或延长 active path，并在右侧看到相对能量、相邻 step delta、missing reason 和 correction count。

## 6. 排期思路

本 roadmap 已完成。实际推进顺序为：先做 `workspace-file-drop-minimal-loop` 固定项目文件权威、左侧文件列表和画布拖入；再补 `canvas-chemical-node-card` 解决节点信息密度和多对象候选选择；随后通过 `canvas-path-authoring-pes-preview` 把拖线 active path 与右侧势能面绑定；接着用 `minimal-cdxml-energy-delta-export` 固定 CDXML 能量图的名称、相对能量、相邻 `dE`、missing/correction marker；最后由 `workspace-first-flow-polish` 和 `workspace-first-flow-qa-guides` 收束主界面与验收/指南。

## 7. 观察项

- 现有 `web-workbench-shell` requirement 已经记录大量面板能力，但没有把“项目文件是权威、本地文件夹只是 picker”作为主流程要求；本 roadmap 完成后应由 acceptance 回写 requirement。
- 现有 completed Web / Graph Editor roadmaps 的 UI 顺序和面板心智模型已不再符合当前产品要求；后续 feature design 应把它们视为实现库存，不作为新交互路线的优先级依据。
- 旧 Web 架构中 Project Sidebar 和 Import Inbox 分离较明显；后续 feature 已按项目树导入 + 画布 drop 收束 UI，同时仍不应破坏 Browser Project Repository / Project Content 边界。
- 浏览器 File System Access API 的可用性受浏览器和权限限制影响；Web feature design 必须设计 fallback，而桌面 app / local bridge 可以使用 filesystem path 形态。
- Parser 对 MAPLE path-family、多帧 extxyz 和优化轨迹的“final candidate”判定仍有限；候选选择器应先支持人工选择，不依赖 parser 完全理解化学路径。
