---
doc_type: roadmap
slug: rxnflow-path-tabs-energy-sheets
status: active
created: 2026-06-11
last_reviewed: 2026-06-11
tags: [rxnflow, web, graph-editor, reaction-path, energy-table, multi-sheet]
related_requirements: [web-workbench-shell, project-content-persistence]
related_architecture: [ARCHITECTURE, core-platform, web-workbench]
---

# RxnFlow Path Tabs And Energy Sheets

## 1. 背景

当前 Web Graph Canvas 已能在一张画布上编辑节点、连线、路径和相对能量，但用户开始把多个候选反应路径画在同一项目里时，一张画布会同时承担“编辑空间”和“路径语义”两件事。这样会带来三个问题：不同路径的零点可能不同；相对能量表无法清楚地区分主路径、中途释放/加入的 side species 和其它路径；画布上的节点越来越多时，能量布局容易互相干扰。

本 roadmap 将路径提升为一等 UI 工作区：一页画布对应一条反应路径，表格视图像 Excel 多 sheet 一样按路径展示相对能量，同时保留一个绝对数据 sheet。目标是让用户在同一个项目里维护多条路径，但每次只编辑和计算一条清晰路径。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- Canvas Path Tabs：Graph Canvas 顶部或底部提供路径标签页，一页画布对应一条 active path。
- Per-path zero point：每条 path 独立保存零点节点，切换 path 后相对能量和能量布局使用该 path 的零点。
- Path-scoped canvas projection：画布标签页只突出当前 path 相关节点/边；其它路径不干扰当前相对视图。
- Stoichiometric side species：用“化学计量数 / side species”结构表达路径中释放或加入的物种，而不是让用户编辑完整能量表达式。
- Energy table sheets：表格视图提供 Absolute sheet + 每条 path 的 Relative sheet；Relative sheet 只列该 path 主路径节点，side species 参与计算但不作为主路径行展示（首尾节点除外）。
- Persistence：path tabs、path zero point、path-scoped sheet 选择必须能随项目保存恢复。

### 明确不做

- 不自动推断反应机理、过渡态归属、side species 化学角色或主路径正确性。
- 不做多用户协作、云同步、CRDT 或路径冲突合并。
- 不替代底层 `ReactionGraph`；本 roadmap 只定义 Web 工作台如何组织多 path 编辑和表格投影。
- 不在第一阶段实现复杂公式编辑器；用户只设置路径零点和必要的化学计量数。
- 不把原始 log 重新作为计算 authority；计算仍使用导入后统一对象。

## 3. 模块拆分（概设）

```
RxnFlow Path Tabs And Energy Sheets
├── Path Tab Model：路径标签页、active path 和 path-local UI state
├── Path Reference Model：每条 path 的 zero point 与相对能量基准
├── Path Composition Model：side species / stoichiometric coefficient 数据结构
├── Canvas Path Projection：按 active path 过滤、突出和布局画布内容
├── Energy Sheet Projection：Absolute sheet 与每条 path Relative sheet
└── Persistence And Restore：项目保存恢复 path tabs / zero points / sheet state
```

### Path Tab Model · 路径标签模型

- **职责**：把 `workspace.graph.paths[]` 投影为用户可见标签页，并维护当前 active path；新建/删除/重命名 path 时同步标签页。
- **承载的子 feature**：`path-tabs-model`
- **触碰的现有代码 / 模块**：`WorkbenchShell`、`GraphCanvas`、`graphPathAutoExtend`、`WorkspaceSummary.active_path_id`。

### Path Reference Model · 路径零点模型

- **职责**：为每条 path 保存独立 zero point node id；没有显式设置时默认 path 第一个主路径节点。
- **承载的子 feature**：`path-zero-reference`
- **触碰的现有代码 / 模块**：`GraphCanvas`、`energyValues`、`graphRelativeEnergy`、fixture/local-http workspace projection。

### Path Composition Model · 路径化学计量模型

- **职责**：用轻量结构记录主路径节点的 side species 增减和 coefficient；该结构生成相对能量计算 terms，但 UI 不暴露完整表达式编辑器。
- **承载的子 feature**：`path-stoichiometry-terms`
- **触碰的现有代码 / 模块**：`compositionDraftState`、`graphRelativeEnergy`、`workspace.set_node_composition` 或后续 path-scoped command。

### Canvas Path Projection · 画布路径投影

- **职责**：切换 active path 时，只突出当前 path 主节点/边，能量布局以 path 顺序向右排，以 path zero point 为基准；其它节点可淡化、隐藏或作为 side species 显示。
- **承载的子 feature**：`path-scoped-canvas`
- **触碰的现有代码 / 模块**：`GraphCanvas`、`graphNodeLayout`、`graphViewport`、edge/path rendering。

### Energy Sheet Projection · 能量表多 sheet 投影

- **职责**：表格视图提供 Absolute sheet 和每条 path 的 Relative sheet。Relative sheet 只列当前 path 主路径行；side species 只进入组合公式，不作为中间主路径行展示。
- **承载的子 feature**：`energy-table-path-sheets`
- **触碰的现有代码 / 模块**：`WorkbenchEnergyTable`、`graphRelativeEnergy`、`energyValues`、i18n。

### Persistence And Restore · 保存恢复

- **职责**：把 path tabs、path zero points、当前 sheet/path 选择和必要的 path-scoped composition metadata 纳入项目保存恢复。
- **承载的子 feature**：`path-tabs-persistence`
- **触碰的现有代码 / 模块**：Project Content bridge、fixture transport、local-http shell projection、Workbench restore tests。

## 4. 模块间接口契约 / 共享协议（架构层详设）

### 4.1 Path Tab Projection

**方向**：Shell workspace projection → WorkbenchShell / GraphCanvas  
**形式**：JSON-safe DTO projection

```ts
type PathTabProjection = {
  pathId: string
  label: string
  nodeIds: string[]
  active: boolean
  zeroNodeId: string | null
  missingZeroReason?: string | null
}
```

**约束**：
- `pathId` 必须来自 `WorkspaceSummary.graph.paths[]`。
- `active=true` 最多一条；没有 active path 时 Web 可默认选择最长 path，但必须通过 workspace projection 确认后显示为 active。
- `zeroNodeId=null` 表示使用 path 第一个可用主路径节点作为默认零点。

### 4.2 Path Stoichiometry Term

**方向**：GraphCanvas / Energy table → graph relative energy evaluator  
**形式**：Web helper DTO，后续可映射到 Shell command

```ts
type PathStoichiometryTerm = {
  pathId: string
  nodeId: string
  objectId: string
  coefficient: number
  placement: "main" | "side-input" | "side-output"
}
```

**约束**：
- `placement="main"` 的 term 对应主路径节点自身。
- `side-input` / `side-output` 可参与相对能量表达式，但默认不在 Relative sheet 中独立成行，除非该 side species 是 path 首尾节点。
- `coefficient` 不能为 0、NaN 或 Infinity。

### 4.3 Path Energy Sheet

**方向**：WorkbenchShell / WorkbenchEnergyTable → UI table renderer  
**形式**：Web helper DTO

```ts
type EnergySheetProjection = {
  sheetId: "absolute" | `path:${string}`
  label: string
  kind: "absolute" | "relative-path"
  pathId?: string
  zeroNodeId?: string | null
  rows: EnergySheetRow[]
}

type EnergySheetRow = {
  nodeId: string
  label: string
  formulaText: string
  relativeValue: number | null
  unit: "kcal_mol" | "kj_mol" | "hartree"
  missingReason?: string | null
}
```

**约束**：
- Absolute sheet 必须包含项目中已登记/已上画布的对象绝对能量信息。
- Relative path sheet 必须按 active path 主路径顺序排序，并把 zero point 放在第一位。
- 释放或加入的 side species 进入 `formulaText` / evaluator，不作为普通中间行展示。

## 5. 子 feature 清单

1. **path-tabs-model** — 在 Graph Canvas 增加 path tabs，并把 active path 选择收束到标签页。
   - 所属模块：Path Tab Model
   - 依赖：无
   - 状态：planned
   - 对应 feature：未启动

2. **path-zero-reference** — 每条 path 支持独立 zero point，切换 path 后节点相对能量和能量布局跟随该 zero point。
   - 所属模块：Path Reference Model
   - 依赖：path-tabs-model
   - 状态：planned
   - 对应 feature：未启动

3. **path-stoichiometry-terms** — 把“设置化学计量数”扩展为 path-aware side species 结构，替代手动能量表达式 UI。
   - 所属模块：Path Composition Model
   - 依赖：path-zero-reference
   - 状态：planned
   - 对应 feature：未启动

4. **path-scoped-canvas** — 切换 path tab 时按当前 path 突出/布局主路径节点，减少多路径互相干扰。
   - 所属模块：Canvas Path Projection
   - 依赖：path-tabs-model, path-zero-reference
   - 状态：planned
   - 对应 feature：未启动

5. **energy-table-path-sheets** — 表格视图新增 Absolute sheet + 每条 path Relative sheet，Relative sheet 按 path 主路径计算。
   - 所属模块：Energy Sheet Projection
   - 依赖：path-stoichiometry-terms
   - 状态：planned
   - 对应 feature：未启动

6. **path-tabs-persistence** — 保存恢复 path tabs、path zero points、sheet selection 和 path-scoped stoichiometry。
   - 所属模块：Persistence And Restore
   - 依赖：path-zero-reference, energy-table-path-sheets
   - 状态：planned
   - 对应 feature：未启动

**最小闭环**：第 1 条 `path-tabs-model` 做完后，用户可以在同一个项目里通过标签页切换现有 paths，后续 zero point / table sheet 才有明确挂载点。

## 6. 排期思路

先做 path tabs，是因为它只改变路径选择和可见组织方式，不先改能量公式；然后做每条 path 的 zero point，建立相对能量基准；再把 side species / 化学计量数接入 path-aware evaluator；最后做表格多 sheet 和保存恢复。这样每一步都能单独验证，不会一次性把画布、表格和持久化一起改乱。

## 7. 观察项

- 现有 `GraphNodeSummary.composition` 是 node-scoped；path-aware side species 可能需要 path-scoped metadata 或新 command，不能在单个 feature 里偷偷扩展。
- 如果一个节点被多条 path 共享，节点显示名称、结构预览和绝对能量可以共享，但相对能量和 zero point 必须由当前 path 决定。
- `rxnflow-energy-chemistry-semantics` roadmap 中仍使用“energy expression”作为底层计算术语；UI 层不应继续把这个术语直接暴露给普通用户。

## 8. 变更日志

- 2026-06-11：根据用户关于多路径画布标签页、每条路径独立零点、表格多 sheet 和化学计量数替代手动表达式的反馈创建 roadmap。
