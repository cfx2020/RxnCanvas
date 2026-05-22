---
doc_type: roadmap
slug: rxnflow-web-graph-editor-advanced
status: active
created: 2026-05-22
last_reviewed: 2026-05-22
tags: [rxnflow, web, graph-editor, advanced-editing, auto-layout, path-editing, edge-label, keyboard, viewport]
related_requirements: [web-workbench-shell, project-content-persistence]
related_architecture: [ARCHITECTURE, core-platform, web-workbench]
---

# RxnFlow Web Graph Editor Advanced

## 1. 背景

Web Graph Canvas 已经完成第一轮可用闭环：已登记对象可以拖入画布，已有节点可以移动，节点/边可以删除，path 顺序可以用草稿调整，viewport 可以 pan/zoom/fit/reset，并且 node position、selection、viewport 和 active path 可通过显式 Save Bridge Session / Open Bridge 保存恢复。

当前缺口在“真实编辑器手感”：用户搭稍复杂的反应网络时，还需要自动整理布局、删除 path、给 edge 标注、用拖线创建连接、多选/键盘操作，以及更自然的滚轮缩放和局部导航。本 roadmap 的目标是把画布从“基础可编辑”推进到“高频编辑可用”，同时继续遵守现有 ShellClient / WorkspaceSnapshot / Browser Project Repository 边界：图谱结构变化仍通过 shell command 返回的 workspace projection 生效，UI transient state 不写项目内容。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- Auto layout：基于当前 graph nodes/edges 生成确定性 layout plan，并通过既有 workspace position command 应用。
- Path delete：让用户可选择并删除 ReactionPath，删除后 active path、selection、network preview 和 energy panel 联动保持一致。
- Edge label editing：让用户可编辑 edge label，便于表达反应步骤、条件、催化剂或分叉说明。
- Free edge drawing：从源节点拖到目标节点创建 edge，替代纯按钮式连接流程。
- Multi-select / keyboard editing：支持 shift/rubber-band selection、Delete、Escape、nudge 等高频键盘操作。
- Wheel / pinch / minimap navigation：补更自然的 viewport 输入和小图导航，但继续复用 `workspace.set_viewport`。
- Lightweight history：仅为布局、viewport 和 selection 等可逆编辑提供有限 undo/redo，不做持久化操作日志。
- Advanced graph editor QA：用真实浏览器覆盖桌面/窄屏关键交互，固定 console clean、无水平溢出和保存恢复边界。

### 明确不做

- 不实现自动反应路径搜索、反应机理推断、过渡态猜测、元素/电荷守恒自动校验或自动配平。
- 不引入重型 diagramming/canvas 框架；若后续确需引入，必须另起 decision / roadmap update。
- 不实现 ChemDraw 分子结构编辑、分子 2D layout、bond 编辑或 molecule-level CDXML。
- 不实现多人协作、CRDT、云同步、账号、权限、实时冲突合并或持久化操作日志。
- 不新增 Project Content schema；node positions 仍在 `reaction-graphs-v1`，viewport/selection/active path 仍在 `workspaces-v1`。
- 不把 hover、drag ghost、rubber-band rectangle、pending edge、keyboard focus、undo stack、minimap drag transient state 写入 ShellResponse、Project Content、Browser Project Repository 或 localStorage。
- 不自动保存项目；保存仍由 Project Sidebar 的显式 Save Bridge Session 触发。
- 不做图谱截图、报告预览、CDX/PDF/PPTX/SVG/CSV 导出；这些属于 report/export 方向。

## 3. 模块拆分（概设）

```
RxnFlow Web Graph Editor Advanced
├── Layout Planner：确定性自动布局 plan、apply 和 fit intent
├── Path Lifecycle Adapter：path 选择、删除、active path/selection 修剪
├── Edge Detail Adapter：edge label draft、update command 和可访问编辑入口
├── Direct Edge Gesture：拖线连接、pending edge preview 和 connect fallback
├── Selection Keyboard Model：多选、框选、键盘 delete/nudge/escape
├── Viewport Navigation Layer：wheel/pinch/minimap 到 viewport intent 的转换
├── Local Reversible History：有限 undo/redo runtime stack
└── Advanced Graph Editor QA Harness：桌面/窄屏真实浏览器交互回归
```

### Layout Planner · 自动布局计划

- **职责**：从当前 `GraphSummary` 生成稳定 `GraphLayoutPlan`，把 nodes 放入固定虚拟画布坐标，应用时只提交 position intent。
- **承载的子 feature**：`graph-editor-auto-layout`
- **触碰的现有代码 / 模块**：`GraphCanvas`、`graphNodeLayout`、`graphViewport`、fixture/local-http workspace commands、Playwright。

### Path Lifecycle Adapter · 路径生命周期

- **职责**：补 `path_ids` 删除协议，让 path 与 node/edge 一样可选择、可删除，并清理 active path/selection。
- **承载的子 feature**：`graph-editor-path-delete`
- **触碰的现有代码 / 模块**：`ReactionGraphService.remove`、`GraphEditorWorkspaceService.remove_items`、Platform Shell、fixture transport、GraphCanvas。

### Edge Detail Adapter · 边详情编辑

- **职责**：提供 edge label draft 和提交入口，把 label 更新映射为 workspace edge update command。
- **承载的子 feature**：`graph-editor-edge-label-edit`
- **触碰的现有代码 / 模块**：`ReactionGraphService.update_edge`、Graph Editor Workspace、Platform Shell、GraphCanvas、i18n。

### Direct Edge Gesture · 直接连线手势

- **职责**：把 pointer drag from node to node 转为 pending edge preview，并在 drop 到合法目标后调用 `workspace.connect`。
- **承载的子 feature**：`graph-editor-free-edge-drawing`
- **触碰的现有代码 / 模块**：`GraphCanvas`、`graphEditorInteractionState`、edge hitbox、Playwright gesture tests。

### Selection Keyboard Model · 选择与键盘模型

- **职责**：让 Workspace Selection 的数组协议真正承载多选，支持 shift/rubber-band selection、Delete、Escape 和节点 nudge。
- **承载的子 feature**：`graph-editor-multiselect-keyboard`
- **触碰的现有代码 / 模块**：`GraphCanvas`、`graphEditorInteractionState`、`workspace.select`、`workspace.remove`、`workspace.move_node`。

### Viewport Navigation Layer · 视口导航层

- **职责**：把 wheel、trackpad pinch 和 minimap drag 转换为 viewport intent，并通过 `workspace.set_viewport` 生效。
- **承载的子 feature**：`graph-editor-wheel-minimap`
- **触碰的现有代码 / 模块**：`graphViewport`、`GraphCanvas`、CSS responsive layout、Playwright wheel tests。

### Local Reversible History · 本地可逆历史

- **职责**：为 layout、viewport、selection 和 node nudge 等可逆操作提供 bounded runtime undo/redo；不可逆删除默认不入栈或显示不可撤销。
- **承载的子 feature**：`graph-editor-lightweight-history`
- **触碰的现有代码 / 模块**：`WorkbenchShell` UI state、GraphCanvas command orchestration、toolbar controls、tests。

### Advanced Graph Editor QA Harness · 高级交互验证

- **职责**：收束 E2E、文档和回归矩阵，覆盖新增高级交互的桌面/窄屏可用性和保存恢复边界。
- **承载的子 feature**：`graph-editor-advanced-e2e-qa`
- **触碰的现有代码 / 模块**：`web/e2e`、docs、CodeStable acceptance 回写。

## 4. 模块间接口契约 / 共享协议（架构层详设）

本节是后续 feature design 的硬约束。若某条 feature 发现契约不合适，先 update 本 roadmap，再继续实现。

### 4.1 Graph Layout Plan Contract

**方向**：GraphCanvas helper → ShellClient workspace commands  
**形式**：Web helper intermediate，JSON-safe

```ts
type GraphLayoutStrategy = "layered-left-to-right" | "grid-compact"

type GraphLayoutPlan = {
  graphId: string
  strategy: GraphLayoutStrategy
  nodePositions: Record<string, [number, number]>
  changedNodeIds: string[]
  viewportIntent?: { x: number; y: number; zoom: number } | null
  warnings: Array<{ code: string; message: string; target?: string | null }>
}
```

**约束**：

- Layout plan 只读取当前 `WorkspaceSummary.graph`；不读取 ChemicalObject geometry、EnergyProfile 或 DOM layout。
- 应用 layout 时按稳定 node id 顺序提交 `workspace.move_node(node_id, position)`；可选 viewport fit 仍通过 `workspace.set_viewport`。
- 任何可见 position 更新必须来自 ShellResponse workspace projection；GraphCanvas 不直接 patch `WorkbenchDomainState.workspace.graph.nodes`。
- Auto layout 不生成/删除 node、edge 或 path，不做 edge rerouting，也不改变 node composition。

### 4.2 Workspace Remove Path Contract

**方向**：GraphCanvas → ShellClient → Platform Shell / fixture transport  
**形式**：扩展既有 `workspace.remove` args

```ts
type WorkspaceRemoveArgs = {
  session_id: string
  node_ids?: string[]
  edge_ids?: string[]
  path_ids?: string[]
}
```

**约束**：

- `node_ids` / `edge_ids` / `path_ids` 至少一个非空；全部为空继续返回 `invalid_input target=selection`。
- 删除 path 不删除 node 或 edge；删除 node 时仍由 core cascade 移除包含该 node 的 path。
- 如果 active path 被删除，`WorkspaceSummary.active_path_id` 必须变为 `null` 或 shell 选择的仍存在 path；前端不得本地猜测。
- 删除后 selection 必须由 workspace projection 修剪，前端只展示 ShellResponse 结果。

### 4.3 Workspace Edge Update Contract

**方向**：GraphCanvas / Edge Detail Adapter → ShellClient → Platform Shell  
**形式**：新增 workspace edge update command

```ts
type WorkspaceUpdateEdgeArgs = {
  session_id: string
  edge_id: string
  label?: string | null
  metadata?: Record<string, JsonValue>
}
```

**约束**：

- 首轮只承诺 `label` 更新；`metadata` 允许透传但不在 UI 中做复杂编辑。
- 命令不得改变 `from_node` / `to_node`；端点重连属于后续 feature。
- 空字符串 label 归一化为 `null`，避免保存无意义空白。
- 失败时返回 `graph_invalid target=edge_id` 或 `invalid_input target=edge_label`，GraphCanvas 不本地伪造 label。

### 4.4 Direct Edge Gesture Contract

**方向**：GraphCanvas pointer events → `workspace.connect`  
**形式**：UI-only pending edge draft

```ts
type PendingEdgeDraft = {
  fromNodeId: string
  pointerGraphPosition: [number, number]
  targetNodeId?: string | null
  label?: string | null
}
```

**约束**：

- Pending edge draft 不进入 ShellResponse、Project Content、Browser Project Repository 或 localStorage。
- 只有 pointer release 到合法 target node 时才发送 `workspace.connect(from_node_id, to_node_id, label?)`。
- source 和 target 相同、target 不存在或 graph 已没有 source 时，UI 清空 draft 并显示可恢复错误或 no-op，不创建 edge。
- 既有 click-driven connect fallback 不能被删除，除非后续 feature 明确替代并补无鼠标可访问路径。

### 4.5 Selection / Keyboard Intent Contract

**方向**：GraphCanvas keyboard/pointer UI → ShellClient commands  
**形式**：UI command intent + existing Workspace Selection

```ts
type GraphEditorSelectionMode = "replace" | "add" | "toggle"

type GraphEditorKeyboardIntent =
  | { kind: "delete-selection" }
  | { kind: "clear-selection" }
  | { kind: "nudge-selection"; delta: [number, number] }
  | { kind: "apply-layout" }
```

**约束**：

- 多选 authority 仍是 `WorkspaceSummary.selection` 的数组字段；UI 本地 selection draft 只能作为提交前 transient state。
- Delete selection 必须发送 `workspace.remove`，并包含当前 selection 中的 node/edge/path ids。
- Nudge selection 只移动 selected node ids；edge/path 本身不产生 position。
- Keyboard shortcuts 必须有按钮或菜单 fallback，保证可访问和可测。

### 4.6 Viewport Navigation Contract

**方向**：wheel / pinch / minimap → viewport intent → `workspace.set_viewport`  
**形式**：Web viewport helper

```ts
type ViewportInputIntent =
  | { kind: "wheel-zoom"; anchor: [number, number]; deltaY: number }
  | { kind: "pinch-zoom"; anchor: [number, number]; scale: number }
  | { kind: "minimap-pan"; center: [number, number] }
```

**约束**：

- 最终 viewport 仍必须满足既有 zoom clamp 和固定虚拟画布坐标换算。
- Minimap 只读取 graph node bounds 与 current viewport；不另存 graph layout state。
- Wheel/pinch 输入不能阻止页面必要滚动到不可用；窄屏需要可访问 fallback。

### 4.7 Lightweight History Contract

**方向**：WorkbenchShell / GraphCanvas UI state  
**形式**：bounded runtime-only history stack

```ts
type GraphEditorHistoryEntry = {
  id: string
  label: string
  kind: "layout" | "viewport" | "selection" | "nudge"
  before: unknown
  after: unknown
  createdAt: string
}
```

**约束**：

- History stack 不写 Project Content、Browser Project Repository、ShellResponse 或 localStorage。
- 首轮只覆盖可逆的 layout、viewport、selection 和 nudge；path/edge/node delete 默认不入栈，除非 feature design 给出可靠 inverse command。
- Undo/redo 执行后仍必须通过 shell command 或 workspace projection 生效；不能直接 mutate domain state。
- Stack 必须 bounded，例如最多 20 条，避免长期 session 内存无界增长。

### 4.8 Advanced Graph Editor QA Contract

**方向**：Playwright / Browser QA  
**形式**：真实浏览器验证要求

- Desktop `1280x720` 覆盖 auto layout apply、path delete、edge label edit、free edge draw、多选 delete/nudge、wheel zoom/minimap 和有限 undo/redo。
- Narrow `390x840` 覆盖 toolbar/menu 可达、画布可导航、文本不溢出、无水平滚动。
- 每条 E2E 继续检查 console clean、framework overlay absent、关键区域可见和无水平溢出。
- local-http smoke 只覆盖 shell contract 主链路，不复制所有复杂手势；复杂交互优先 fixture E2E。
- Playwright output 继续写入 git ignored `web/test-results*/` 和 `web/playwright-report*/`。

## 5. 子 feature 清单

1. **graph-editor-auto-layout**：新增确定性 auto layout plan 和 Apply Layout 入口，将当前 graph nodes 整理到固定虚拟画布坐标，并可选 fit viewport。
   - 所属模块：Layout Planner
   - 依赖：无
   - 状态：done
   - 对应 feature：`2026-05-22-graph-editor-auto-layout`
   - 备注：已落地 Web-side `GraphLayoutPlan`、Apply Layout 入口、顺序 `workspace.move_node` 和可选 `workspace.set_viewport` fit；不新增 shell command，不改 Project Content schema，不做 edge rerouting。
2. **graph-editor-path-delete**：扩展 `workspace.remove` 支持 `path_ids`，让 selected path 可删除，并由 ShellResponse 修剪 active path 和 selection。
   - 所属模块：Path Lifecycle Adapter
   - 依赖：无
   - 状态：done
   - 对应 feature：`2026-05-22-graph-editor-path-delete`
   - 备注：已落地 `GraphEditorWorkspaceService.remove_items(path_ids)`、Platform Shell / fixture `workspace.remove(path_ids)` 和 Graph Canvas Delete Selected selected path 删除；删除 path 不删除 node/edge，active path 和 selection 由 ShellResponse projection 修剪。
3. **graph-editor-edge-label-edit**：新增 edge label draft 和 workspace edge update command，让 selected edge 可编辑 label。
   - 所属模块：Edge Detail Adapter
   - 依赖：无
   - 状态：in-progress
   - 对应 feature：`2026-05-22-graph-editor-edge-label-edit`
4. **graph-editor-free-edge-drawing**：新增从节点拖到节点的直接连线手势，保留 click-driven connect fallback。
   - 所属模块：Direct Edge Gesture
   - 依赖：`graph-editor-edge-label-edit`
   - 状态：planned
   - 对应 feature：无
5. **graph-editor-multiselect-keyboard**：支持多选、框选、Delete、Escape 和 selected node nudge，并复用 Workspace Selection 数组协议。
   - 所属模块：Selection Keyboard Model
   - 依赖：`graph-editor-path-delete`
   - 状态：planned
   - 对应 feature：无
6. **graph-editor-wheel-minimap**：补 wheel/pinch zoom 和 minimap navigation，继续通过 `workspace.set_viewport` 更新 viewport。
   - 所属模块：Viewport Navigation Layer
   - 依赖：`graph-editor-auto-layout`
   - 状态：planned
   - 对应 feature：无
7. **graph-editor-lightweight-history**：为 layout、viewport、selection 和 nudge 提供 bounded runtime undo/redo，不持久化、不覆盖 destructive delete。
   - 所属模块：Local Reversible History
   - 依赖：`graph-editor-auto-layout`, `graph-editor-multiselect-keyboard`, `graph-editor-wheel-minimap`
   - 状态：planned
   - 对应 feature：无
8. **graph-editor-advanced-e2e-qa**：补高级图谱编辑桌面/窄屏 E2E、local-http shell contract smoke 和用户/开发者说明。
   - 所属模块：Advanced Graph Editor QA Harness
   - 依赖：`graph-editor-free-edge-drawing`, `graph-editor-lightweight-history`
   - 状态：planned
   - 对应 feature：无

## 6. 排期思路

先做 `graph-editor-auto-layout`，因为它不需要新 core command 或 schema，就能立刻改善画布可读性，也能为后续 minimap 和 history 提供可逆布局操作样本。

`graph-editor-path-delete` 已完成，下一步可推进 `graph-editor-edge-label-edit`，补齐 edge detail 的编辑入口和 shell contract。`graph-editor-free-edge-drawing` 依赖 edge label 的命令语义稳定后再做，这样拖线创建边时可选择是否带 label。`graph-editor-multiselect-keyboard` 现在可复用已落地的 node/edge/path remove contract。`graph-editor-wheel-minimap` 可在 auto layout 后推进。最后用 `graph-editor-lightweight-history` 和 `graph-editor-advanced-e2e-qa` 收束高频编辑体验与回归矩阵。

技术依赖之外的产品优先级不由本 roadmap 替用户决定；如果用户更想先补 edge label 或 wheel/minimap，可以在不违反依赖的前提下调整启动顺序。

## 7. 观察项

- Core `ReactionGraphService`、`GraphEditorWorkspaceService.remove_items`、Platform Shell、fixture transport 和 Web `workspace.remove` 当前已经暴露 `path_ids` path 删除协议；后续多选/键盘删除可复用同一 node/edge/path selection contract。
- Core `ReactionGraphService` 当前已经支持 `update_edge` patch，但 Web/Shell 还没有专门的 `workspace.update_edge` command。
- 当前 GraphCanvas 的 edge hit target 是 HTML button，适合继续承载 edge selection 和 label edit；自由拖线仍需要补 pointer draft 和可访问 fallback。
- Auto layout 若未来要服务 CLI/agent，可把纯计算 helper 移到共享 TypeScript-independent 或 Python core；本 roadmap 首轮只承诺 Web helper，避免让 core domain 依赖 UI layout 假设。
- Undo/redo 是高风险扩展点；首轮只覆盖可逆 UI/workspace 操作，不碰 destructive delete、Project Content history、CRDT 或协作。
