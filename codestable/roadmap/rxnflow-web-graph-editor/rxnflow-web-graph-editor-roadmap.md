---
doc_type: roadmap
slug: rxnflow-web-graph-editor
status: completed
created: 2026-05-21
last_reviewed: 2026-05-22
tags: [rxnflow, web, graph-editor, canvas, interaction, persistence]
related_requirements: [web-workbench-shell, project-content-persistence]
related_architecture: [ARCHITECTURE, core-platform, web-workbench]
---

# RxnFlow Web Graph Editor

## 1. 背景

Web Workbench MVP 已经有 `GraphCanvas`，但它还是 click-driven 的最小闭环：用户需要先选 Object Registry 的 active object，再点 Add Node；连接也通过按钮和二次点击完成。它证明了 ShellClient / workspace command / WorkbenchDomainState 的边界，但还不是用户自然期待的图谱编辑器。

本 roadmap 的目标是把 Web Graph Canvas 从 MVP 推进到可持续扩展的反应图谱编辑交互层：对象可以拖入画布，节点可以拖动和选择，视口可以缩放平移，布局和 selection 能按 WorkspaceSnapshot 边界保存，并且所有图谱结构变化仍通过 Shell command / GraphPatch 边界进入核心层。它服务 RxnFlow 的“计算化学图谱编辑器”定位，不引入外部量化计算任务调度、云同步或前端复制领域模型。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- Graph canvas interaction layer：对象拖入画布、节点拖动、框选/多选、键盘删除、连接手势和基础快捷键。
- Canvas viewport：缩放、平移、fit-to-view、viewport reset，以及 viewport UI-only / WorkspaceSnapshot 边界。
- Layout persistence：节点位置、viewport、selection 与 active path 的保存/恢复协议，保持 ProjectSidebarState、WorkbenchDomainState 和 WorkspaceSnapshot 分离。
- Graph command adapter：把拖拽、移动、删除、连接、set path 等 UI event 规整成 Shell command 或后续 GraphPatch payload。
- Network preview synchronization：编辑时实时显示 disconnected diagnostics、active path、node/edge/path counts。
- Interaction QA：桌面和窄屏浏览器验证，覆盖拖拽、移动、缩放、连接、键盘操作、无水平溢出和 console clean。

### 明确不做

- 不实现自动反应路径搜索、化学合理性判定、过渡态猜测、构象搜索或微观动力学。
- 不在前端重新实现 ReactionGraphService、Energy Engine、ChemicalRegistry 或 parser。
- 不实现云同步、账号、多人实时协作、CRDT、权限或审计日志。
- 不实现完整图形设计软件能力，例如自由绘图、贝塞尔路径、图层系统、复杂自动排版或 ChemDraw 分子结构编辑器。
- 不改 Report Export PNG/CDXML/XLSX writer；图谱截图/报告预览另起 roadmap 或后续 feature。
- 不把 hover、drag ghost、pending edge、path draft 或 transient viewport 写入 ReactionGraph；可持久化 selection 只能作为 Workspace Selection 进入 WorkspaceSnapshot。
- 不一次性引入重型 canvas/diagramming 框架；若某 feature 需要引入库，必须先在 feature design 中证明和现有 React/Vite/ShellClient 边界兼容。

## 3. 模块拆分（概设）

```
RxnFlow Web Graph Editor
├── Interaction Model：统一 pointer/keyboard/selection/drag state
├── Object Drop Adapter：Object Registry / Import Result 到 canvas node creation 的拖入协议
├── Canvas Node Layout：节点 position、drag move、snap/grid 和布局投影
├── Edge And Path Editing：连接手势、删除边、active path 选择和 path order 编辑
├── Viewport Controller：pan/zoom/fit/reset 和响应式视口
├── Workspace Persistence Bridge：viewport/selection/layout 到 WorkspaceSnapshot 的保存/恢复
└── Graph Editor QA Harness：桌面/窄屏真实浏览器交互回归
```

### Interaction Model · 交互状态模型

- **职责**：把 hover、dragging、pending edge、rubber-band selection、keyboard focus 和 selection 的前端镜像统一管理，并定义哪些事件会提交 Shell command；可持久化 node/edge/path selection 的 authority 是 Workspace Selection。
- **承载的子 feature**：`graph-editor-interaction-state`
- **触碰的现有代码 / 模块**：`GraphCanvas`、`WorkbenchShell`、`workbenchState`、component tests。

### Object Drop Adapter · 对象拖入协议

- **职责**：让 Object Registry 中的已登记对象可拖入画布，drop 时生成 `workspace.add_node` command；pending/failed import item 不可直接创建节点。
- **承载的子 feature**：`graph-editor-object-drop`
- **触碰的现有代码 / 模块**：`ObjectRegistryPanel`、`GraphCanvas`、`WorkbenchShell`、workspace command DTO。

### Canvas Node Layout · 节点布局

- **职责**：在 UI 中维护并提交节点 position，支持节点拖动、坐标稳定显示、基础 snap/grid，并避免 hover/selection 造成布局跳动。
- **承载的子 feature**：`graph-editor-node-layout`
- **触碰的现有代码 / 模块**：Graph canvas rendering、workspace add/move command 或 GraphPatch extension、WorkspaceSnapshot projection。

### Edge And Path Editing · 边与路径编辑

- **职责**：用直接手势创建/删除 edge、编辑 active path 顺序，并把 disconnected diagnostics 与 path preview 实时展示给用户。
- **承载的子 feature**：`graph-editor-edge-path-editing`
- **触碰的现有代码 / 模块**：GraphCanvas、fixture/local-http workspace commands、ReactionGraph patch command 边界。

### Viewport Controller · 视口控制

- **职责**：提供 pan、zoom、fit-to-view、reset viewport 和窄屏适配；viewport 是 workspace-only state，不进入 ReactionGraph。
- **承载的子 feature**：`graph-editor-viewport-controls`
- **触碰的现有代码 / 模块**：GraphCanvas、WorkbenchUiState、WorkspaceSnapshot viewport projection。

### Workspace Persistence Bridge · 工作区保存桥

- **职责**：把 node positions、viewport、selection、active path 等 workspace-only 状态纳入 Project Content open/save 的恢复闭环，同时保持 GraphPatch 与 UI state 分离。
- **承载的子 feature**：`graph-editor-workspace-persistence`
- **触碰的现有代码 / 模块**：Platform Shell workspace projection、fixture/local-http transport、Project Content Bridge、Browser Project Repository。

### Graph Editor QA Harness · 交互验证

- **职责**：补真实浏览器 E2E，覆盖 drag/drop、node move、edge/path edit、viewport、save/open restore、desktop/narrow layout 和 console clean。
- **承载的子 feature**：`graph-editor-e2e-qa`
- **触碰的现有代码 / 模块**：Playwright tests、Browser plugin smoke、screenshots/traces/report output。

## 4. 模块间接口契约 / 共享协议（架构层详设）

本节是后续 feature design 的硬约束。若某条 feature 发现契约不合适，先 update 本 roadmap，再继续实现。

### 4.1 Graph Editor UI State

**方向**：GraphCanvas / WorkbenchShell 内部
**形式**：前端 UI-only state

**契约**：

```ts
type GraphEditorMode = "select" | "connect" | "pan"

type GraphEditorSelection = {
  nodeIds: string[]
  edgeIds: string[]
  pathIds: string[]
}

type GraphEditorInteractionState = {
  mode: GraphEditorMode
  selection: GraphEditorSelection
  hover?: { kind: "node" | "edge" | "path"; id: string } | null
  dragging?:
    | { kind: "node"; nodeIds: string[]; origin: CanvasPoint; current: CanvasPoint }
    | { kind: "canvas"; origin: CanvasPoint; current: CanvasPoint }
    | { kind: "object-drop"; objectId: string; current: CanvasPoint }
    | null
  pendingEdge?: { fromNodeId: string } | null
}

type CanvasPoint = {
  x: number
  y: number
}
```

**约束**：

- `GraphEditorInteractionState` 不进入 ShellResponse 或 ReactionGraph。
- 可持久化的 selection / viewport 必须转换到 WorkspaceSnapshot 协议，不能直接保存 transient drag state。
- selection 只能引用当前 WorkbenchDomainState 中存在的 node/edge/path；domain 更新后必须清理失效 selection。

### 4.2 Workspace Graph Command Payload

**方向**：GraphCanvas → ShellClient → Platform Shell / fixture transport
**形式**：JSON-safe command args

**契约**：

```ts
type WorkspaceAddNodeArgs = {
  session_id: string
  kind: "species" | "transition_state" | "group" | "annotation"
  label: string
  chemical_object_ids?: string[]
  position?: [number, number]
  metadata?: Record<string, JsonValue>
}

type WorkspaceMoveNodeArgs = {
  session_id: string
  node_id: string
  position: [number, number]
}

type WorkspaceRemoveArgs = {
  session_id: string
  node_ids?: string[]
  edge_ids?: string[]
}

type WorkspaceConnectArgs = {
  session_id: string
  from_node_id: string
  to_node_id: string
  label?: string
  metadata?: Record<string, JsonValue>
}

type WorkspaceSetPathArgs = {
  session_id: string
  path_id: string
  node_ids: string[]
  label?: string
}
```

**约束**：

- 结构变化必须通过 ShellClient command；GraphCanvas 不直接 mutate `WorkbenchDomainState.workspace.graph`。
- node position 是 workspace/layout 数据，不是 ChemicalObject 数据。
- 删除 node 时必须由 core / fixture transport 返回新的 graph projection；前端不能自己推断 edge/path cascade。
- 如果现有 Platform Shell 缺少 move/remove command，第一条相关 feature 必须补 shell contract 和 fixture/local-http tests。

### 4.3 Object Drop Contract

**方向**：ObjectRegistryPanel / Import result → GraphCanvas
**形式**：拖放 payload + Shell command

**契约**：

```ts
type GraphObjectDragPayload = {
  kind: "registered-object"
  objectId: string
  label: string
}

type GraphDropTarget = {
  graphId: string
  canvasPosition: [number, number]
}
```

**约束**：

- drag payload 只能引用 `WorkbenchDomainState.objects` 中已登记 object。
- Import Inbox pending/failed item、raw resource、parser preview item 不得直接成为 graph node。
- drop 成功后的可见节点必须来自 ShellResponse workspace projection；UI 可显示 drag ghost，但不得把 ghost 当 domain state。

### 4.4 Canvas Viewport Contract

**方向**：GraphCanvas ↔ WorkspaceSnapshot / Project Content
**形式**：workspace-only viewport projection

**契约**：

```ts
type CanvasViewportSummary = {
  x: number
  y: number
  zoom: number
}

type ViewportCommandArgs = {
  session_id: string
  viewport: CanvasViewportSummary
}
```

**约束**：

- viewport 不进入 ReactionGraph 或 GraphPatch。
- zoom 必须有限且在 UI 限制范围内，例如 `0.35 <= zoom <= 2.5`；超出范围的 incoming projection 应 clamp 或显示 validation warning。
- fit-to-view 和 reset viewport 是 UI 操作；只有显式保存 workspace/session 时才进入 Project Content。

### 4.5 Workspace Persistence Contract

**方向**：Graph editor UI → Project Content open/save bridge
**形式**：WorkspaceSnapshot projection

**契约**：

```ts
type WorkspaceLayoutSnapshot = {
  graph_id: string
  node_positions: Record<string, [number, number]>
  viewport?: CanvasViewportSummary
  selection?: {
    node_ids: string[]
    edge_ids: string[]
    path_ids: string[]
  }
  active_path_id?: string | null
}
```

**约束**：

- Workspace layout snapshot 只引用 existing graph/node/edge/path id；Project Content validation 负责发现引用缺失。
- 保存由现有 Project Sidebar / Save Bridge Session 触发，不由每次拖动自动写 Browser Project Repository。
- restore 后 GraphCanvas 从 WorkbenchDomainState / WorkspaceSummary 初始化可见布局；不能从 DOM 或 localStorage 私有副本恢复领域状态。

### 4.6 Graph Editor QA Contract

**方向**：E2E tests / Browser QA
**形式**：真实浏览器验证要求

**契约**：

- Desktop `1280x720` 至少覆盖 object drag/drop、node drag move、connect、delete、set path、zoom/pan、save/open restore。
- Narrow `390x840` 至少覆盖 toolbar 可用、canvas 可滚动/缩放、对象列表与图谱区域不重叠。
- 每条 E2E 必须检查 console clean、无 framework overlay、无水平溢出。
- local-http smoke 只验证真实 bridge 主链路，不复制所有交互矩阵；复杂手势优先在 fixture E2E 中稳定覆盖。
- Playwright output 继续写入 git ignored `web/test-results*/` 和 `web/playwright-report*/`。

## 5. 子 feature 清单

1. **graph-editor-interaction-state**：抽出 GraphCanvas interaction state 和 mode/selection/pending edge 模型，清理失效 selection，并保持现有 click-driven flow 不回退。
   - 所属模块：Interaction Model
   - 依赖：无
   - 状态：done
   - 对应 feature：2026-05-21-graph-editor-interaction-state
   - 备注：已落地 UI-only `GraphEditorInteractionState`、select/connect/prune helper、helper tests 和 Browser graph flow smoke；未实现 drag/drop、node dragging、viewport 或新 shell command。
2. **graph-editor-object-drop**：让 Object Registry 已登记对象可拖入画布，drop 后调用 `workspace.add_node(position)` 并显示来自 ShellResponse 的节点。
   - 所属模块：Object Drop Adapter
   - 依赖：`graph-editor-interaction-state`
   - 状态：done
   - 对应 feature：2026-05-21-graph-editor-object-drop
   - 备注：已落地 graph object drag payload helper、Object Registry drag source、Graph Canvas drop target、`workspace.add_node(position)` 编排、component/helper tests、Browser 页面健康检查和 Playwright DragEvent 渲染验证；pending/failed import item、raw resource、parser preview item 仍不能直接成为节点。
3. **graph-editor-node-layout**：支持节点拖动、位置更新、基础 snap/grid 和稳定布局显示；必要时补 `workspace.move_node` shell command。
   - 所属模块：Canvas Node Layout
   - 依赖：`graph-editor-interaction-state`
   - 状态：done
   - 对应 feature：2026-05-21-graph-editor-node-layout
   - 备注：已落地 `GraphEditorWorkspaceService.move_node`、Platform Shell/fixture `workspace.move_node`、`graphNodeLayout` helper、GraphCanvas pointer drag、ShellResponse authority、Python/Web tests 和 Playwright 鼠标拖动验证；position 是 workspace/layout 数据，不写 ChemicalObject，仍不做 viewport/persistence/auto layout。
4. **graph-editor-edge-path-editing**：补直接连线、删除节点/边、active path 顺序编辑和 disconnected diagnostics 同步；必要时补 remove command。
   - 所属模块：Edge And Path Editing
   - 依赖：`graph-editor-node-layout`
   - 状态：done
   - 对应 feature：2026-05-21-graph-editor-edge-path-editing
   - 备注：已落地 `workspace.remove`、edge/node selection delete、Path Order Draft 上移/下移并复用 `workspace.set_path`；删除 cascade 由 core/fixture projection 返回，前端不自行推断；Web/Python tests、build 和 Browser/Playwright edge delete/path reorder 验证通过。
5. **graph-editor-viewport-controls**：实现 pan/zoom/fit/reset、viewport clamp 和窄屏可用布局。
   - 所属模块：Viewport Controller
   - 依赖：`graph-editor-interaction-state`
   - 状态：done
   - 对应 feature：2026-05-21-graph-editor-viewport-controls
   - 备注：已落地 Platform Shell/fixture `workspace.set_viewport`、`WorkspaceSummary.viewport`、`graphViewport` helper、GraphCanvas Pan/Zoom/Fit/Reset toolbar、viewport transform、pan drag 和 viewport-aware object drop/node drag；viewport 是 workspace-only state，不进入 ReactionGraph，不自动保存 Project Content；Web/Python tests、build、Browser 页面健康检查和 Playwright zoom/fit/reset/pan 验证通过。
6. **graph-editor-workspace-persistence**：把 node positions、viewport、selection 和 active path 纳入 Project Content open/save bridge 的恢复闭环。
   - 所属模块：Workspace Persistence Bridge
   - 依赖：`graph-editor-node-layout`, `graph-editor-viewport-controls`, `graph-editor-edge-path-editing`
   - 状态：done
   - 对应 feature：2026-05-21-graph-editor-workspace-persistence
   - 备注：已落地 `workspace.select`、`WorkspaceSummary.selection`、fixture Project Content current graph/workspace save/open restore，以及 Save Bridge Session 对 node positions、viewport、selection、active path 的显式保存；不做自动保存、localStorage graph state、云同步或新 Project Content schema。
7. **graph-editor-e2e-qa**：补桌面/窄屏真实浏览器交互回归，覆盖 drag/drop、node move、edge/path edit、viewport 和 save/open restore。
   - 所属模块：Graph Editor QA Harness
   - 依赖：`graph-editor-object-drop`, `graph-editor-node-layout`, `graph-editor-edge-path-editing`, `graph-editor-viewport-controls`, `graph-editor-workspace-persistence`
   - 状态：done
   - 对应 feature：2026-05-21-graph-editor-e2e-qa
   - 备注：已落地默认 fixture E2E 的 desktop graph editor matrix，覆盖 object drag/drop、node drag、edge delete、path reorder、viewport controls、Save/Open Bridge restore；窄屏 journey 补 zoom/reset、preview、energy/report 可用和无水平溢出；local-http smoke 仍只验证真实 bridge 主链路。

## 6. 排期思路

先做 `graph-editor-interaction-state`，因为它不改变领域命令，但能让后续拖放、移动、视口和选择共享同一状态模型。随后并行推进 object drop 和 node layout；edge/path editing 依赖可移动节点后的 canvas 表达。viewport controls 可以在 interaction state 后独立做。最后把 layout/viewport/selection 接进 Project Content open/save bridge，再用 E2E QA 收束真实交互。

技术依赖之外的优先级不由本 roadmap 替用户决定；如果用户更想先看到“对象拖入画布”，可以在 interaction state 后优先启动 `graph-editor-object-drop`。

## 7. 观察项

- 已核实并补齐 `WorkspaceSummary` / Platform Shell 对 node positions、selection 和 viewport 的表达：node positions 仍在 `ReactionGraph.nodes[].position`，viewport/selection/active path 仍在 `WorkspaceSnapshot`，Web 通过 `workspace.select` 和显式 Project Content open/save bridge 恢复。
- 真实 drag/drop 在 in-app Browser 自动化里可能不稳定；验收时可使用 Browser 做页面健康检查，复杂手势以 Playwright 为主。
- 如果后续引入 diagramming/canvas 库，需要单独评估 bundle size、i18n、accessibility、SSR/Vite compatibility 和 ShellClient 边界。
- 图谱截图、报告预览、CDX/PDF/PPTX/SVG/CSV 导出仍不在本 roadmap 范围内。
