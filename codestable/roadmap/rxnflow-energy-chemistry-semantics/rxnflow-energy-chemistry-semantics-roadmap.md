---
doc_type: roadmap
slug: rxnflow-energy-chemistry-semantics
status: active
created: 2026-05-22
last_reviewed: 2026-05-22
tags: [rxnflow, energy, chemistry-semantics, stoichiometry, corrections, thermochemistry]
related_requirements: [project-content-persistence, web-workbench-shell]
related_architecture: [ARCHITECTURE, core-platform, web-workbench]
---

# RxnFlow Energy Chemistry Semantics

## 1. 背景

RxnFlow 当前已经能导入计算输出、登记对象、搭建反应图、计算基础相对能量并导出报告。但 Energy Engine 仍停留在最小语义：一个 reaction node 内的所有 ChemicalObject 按隐含系数 1 求和，校正项只能整体开关，热化学字段虽然能保存和导出表格，但还没有成为能量曲线计算的一等选择。

下一阶段需要把反应节点从"对象 id 列表"升级为"有化学计量和能量通道语义的组成表达式"。这会影响核心模型、GraphPatch、Project Content、Platform Shell、Web Graph Canvas、Object Registry、Energy Profile Panel 和 Report Export 的显示口径，因此先用 roadmap 固定跨 feature 的共享协议。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- ReactionNode composition terms：为每个节点明确 object id、stoichiometric coefficient、role 和可显示 label。
- 节点能量表达式：用 composition terms 计算节点绝对能量，保留旧 `chemical_object_ids` 的兼容读写路径。
- Energy channel selection：把 `energies` 与 `thermochemistry` 中的可用 key 统一为可选择的 energy channel，并记录来源 section。
- Correction selection policy：从整体 include corrections 过渡到可解释的 correction inclusion / kind filter 语义。
- Energy profile provenance：在 profile point 中输出节点组成、每项贡献、校正项贡献、单位换算、baseline 和 missing reason 细节。
- Platform Shell / Web DTO：让 agent 和 UI 可以通过结构化命令设置节点组成、添加校正项、选择能量通道并显示表达式。
- Project Content 迁移：保存/加载新 composition 和 profile provenance，同时兼容已有 `reaction-graphs-v1` / `energy-profiles-v1` 数据。

### 明确不做

- 不实现外部量化计算任务调度、自动反应路径搜索、构象搜索、频率计算或微观动力学。
- 不自动判断真实化学反应配平；第一版只提供用户/agent 明确输入的 coefficient，不从分子式推断。
- 不实现完整物种同一性、反应式规范化、原子映射或电荷守恒验证；这些属于后续化学校验 roadmap。
- 不在本 roadmap 中增加新的 parser 格式支持；parser 只继续产出 ChemicalObject 的 energies / thermochemistry 字段。
- 不把 UI 做成 ChemDraw 级结构编辑器；Web 只编辑 RxnFlow 反应图节点组成和能量选项。
- 不新增云存储、账号、多人协作或自动同步。

## 3. 模块拆分（概设）

```
RxnFlow Energy Chemistry Semantics
├── Reaction Node Composition：节点组成 term、计量系数和 graph patch 协议
├── Energy Channel Catalog：对象可用能量通道、section 来源和选择规则
├── Correction Policy：校正项追加命令、kind filter 和 inclusion 语义
├── Energy Expression Engine：节点能量表达式、单位换算和 missing diagnostics
├── Profile Provenance Projection：profile point 贡献明细和 Web/Shell 投影
├── Project Content Migration：graph/profile 新字段持久化与旧数据兼容
└── Web Workbench Integration：对象面板、画布节点组成、能量面板和表达式显示
```

### Reaction Node Composition · 节点组成语义

- **职责**：定义 ReactionNode 中的 composition terms，并提供 agent/UI 可调用的 patch/command 入口。它不负责计算能量，也不从分子式自动配平。
- **承载的子 feature**：`reaction-node-stoichiometry-contract`
- **触碰的现有代码 / 模块**：`rxnflow.models`、`rxnflow.graph`、`rxnflow.workspace`、`rxnflow.graph_workspace_codec`、Platform Shell workspace commands、Web Graph Canvas DTO。

### Energy Channel Catalog · 能量通道目录

- **职责**：把 ChemicalObject 的 `energies` 与 `thermochemistry` 可用 key 归一为 channel catalog，供 Energy Engine、Shell projection 和 Web option 选择。它不修改 parser 字段，也不猜测缺失热化学校正。
- **承载的子 feature**：`energy-channel-catalog`
- **触碰的现有代码 / 模块**：`rxnflow.models`、`rxnflow.energy`、Platform Shell object/profile projection、Web Object Registry / Energy Profile Panel。

### Correction Policy · 校正项策略

- **职责**：定义 correction inclusion 的结构化 policy，并把 ChemicalRegistry 的 correction 写入能力暴露到 Shell/Web。它只处理 append-only Correction，不重写 ChemicalObject 原始 energy。
- **承载的子 feature**：`correction-command-and-ui`
- **触碰的现有代码 / 模块**：`rxnflow.registry`、`rxnflow.platform`、Project Content chemical object codec、Web Object Registry Panel。

### Energy Expression Engine · 能量表达式计算

- **职责**：根据节点 composition、energy channel 和 correction policy 计算绝对/相对能量，输出缺失项诊断。它不修改 graph/object/profile 持久态，也不解析 raw output。
- **承载的子 feature**：`energy-expression-engine`
- **触碰的现有代码 / 模块**：`rxnflow.energy`、`rxnflow.models`、`tests/test_energy_profile_engine.py`、Platform Shell `energy.compute`。

### Profile Provenance Projection · 计算来源投影

- **职责**：把每个 profile point 的 expression、components、corrections、conversion 和 baseline 信息结构化输出给 Shell/Web/Export。它不改变 Energy Engine 的数值规则，只暴露可解释性。
- **承载的子 feature**：`energy-profile-provenance-details`
- **触碰的现有代码 / 模块**：`rxnflow.models`、`rxnflow.energy_profile_codec`、`rxnflow.platform`、Web Energy Profile Panel、Report Export metadata。

### Project Content Migration · 持久化兼容

- **职责**：保存和加载 ReactionNode composition 与 EnergyProfile provenance，并为旧项目提供无损兼容策略。它不做 silent destructive migration。
- **承载的子 feature**：`energy-semantics-project-content-migration`
- **触碰的现有代码 / 模块**：`rxnflow.graph_workspace_codec`、`rxnflow.energy_profile_codec`、`rxnflow.content_store` validation/migration tests。

### Web Workbench Integration · Web 工作台接入

- **职责**：在 Web 端让用户看见和编辑节点组成、添加校正项、选择能量通道并查看能量表达式；所有领域变更仍走 Shell Client。它不在前端重算能量。
- **承载的子 feature**：`web-energy-semantics-controls`、`energy-curve-interaction-polish`
- **触碰的现有代码 / 模块**：`web/src/app/ObjectRegistryPanel.tsx`、`GraphCanvas.tsx`、`EnergyProfilePanel.tsx`、Shell types/fixture transport/i18n/E2E。

## 4. 模块间接口契约 / 共享协议（架构层详设）

本节是后续 feature design 的硬约束输入。正式实现可用 Python dataclass 和 TypeScript interface 表达，但字段语义必须一致。

### 4.1 Reaction Node Composition Terms

**方向**：Reaction Graph / Workspace / Energy Engine / Project Content / Web DTO 共享
**形式**：共享数据结构

**契约**：

```ts
type StoichiometricCoefficient = number

type ReactionNodeCompositionTerm = {
  object_id: string
  coefficient: StoichiometricCoefficient
  role?: "reactant" | "reagent" | "catalyst" | "solvent" | "product" | "transition_state" | "spectator" | null
  label?: string | null
  metadata?: Record<string, JsonValue>
}

type ReactionNode = {
  id: string
  kind: "species" | "transition_state" | "group" | "annotation"
  label: string
  composition?: ReactionNodeCompositionTerm[]
  chemical_object_ids?: string[]
  position?: [number, number] | null
  metadata: Record<string, JsonValue>
}
```

**约束**：

- `composition` 是新权威字段；`chemical_object_ids` 是兼容字段。
- 读取旧节点时，若 `composition` 缺失且 `chemical_object_ids` 存在，应投影为 `chemical_object_ids.map(id => { object_id: id, coefficient: 1 })`。
- 写入新节点时应同时保留可兼容的 `chemical_object_ids` 投影，直到项目内容 schema 升级完成。
- `coefficient` 允许正数、负数和小数；0 非法，`NaN`/`Infinity` 非法。
- 同一节点内允许同一 object id 多次出现，但 Energy Expression Engine 必须按 term 顺序逐项计算并在 provenance 中保留；UI 可选择合并显示但不得改变核心计算。
- `group` / `annotation` 节点可没有 composition；如果作为 baseline 或需要计算能量，应返回 `missing_energy`。

### 4.2 GraphPatch / Workspace Composition Commands

**方向**：Web UI / agent → Platform Shell → Graph Editor Workspace → ReactionGraphService
**形式**：Shell command + GraphPatch patch

**契约**：

```ts
type WorkspaceSetNodeCompositionArgs = {
  session_id: string
  workspace_id?: string | null
  node_id: string
  composition: ReactionNodeCompositionTerm[]
}

ShellCommandName += "workspace.set_node_composition"

type GraphPatch =
  | { op: "update_node", id: string, patch: { composition: ReactionNodeCompositionTerm[] } }
```

**错误**：

- `invalid_input target=composition`：composition 为空但 node kind 需要对象，coefficient 非法，payload 不是数组。
- `graph_invalid target=node_id`：节点不存在。
- `graph_invalid target=object_id`：composition 引用未登记对象。

**约束**：

- 命令成功后 ShellResponse 必须返回更新后的 workspace projection。
- 前端不得直接 patch 本地 graph；可见 graph 仍以 ShellResponse 为准。
- 旧 `workspace.add_node(object_id)` 入口继续可用，默认创建单 term coefficient 1。

### 4.3 Energy Channel Catalog

**方向**：Chemical Registry / Platform Shell projection / Energy Engine / Web Energy Panel
**形式**：共享投影与选项

**契约**：

```ts
type EnergyChannelSource = "energies" | "thermochemistry"

type EnergyChannel = {
  key: string
  source: EnergyChannelSource
  label: string
  unit: "hartree" | "kcal_mol" | "kj_mol"
  reference?: string | null
  object_ids: string[]
}

type EnergyChannelSelection = {
  key: string
  source?: EnergyChannelSource | "auto"
}
```

**约束**：

- `source="auto"` 或缺失时，查找顺序为 `energies[key]`，再 `thermochemistry[key]`。
- 如果同一 object 的 `energies` 和 `thermochemistry` 同名且 caller 没有显式 source，应返回 `ambiguous_energy_channel target=energy_options.energy_key`。
- `EnergyOptions.energy_key` 保持兼容；新增 `energy_source?: "energies" | "thermochemistry" | "auto"`。
- Web Object Registry 应显示对象自身可用 channels；Energy Profile Panel 应基于当前 path composition 汇总可选 common/partial channels。

### 4.4 Correction Policy

**方向**：Web/Object Registry/Shell → ChemicalRegistry；Energy Engine 读取
**形式**：共享数据结构 + Shell command

**契约**：

```ts
type CorrectionKind = "resonance" | "solvation" | "manual"

type CorrectionPolicy = {
  mode: "none" | "all" | "kinds" | "ids"
  kinds?: CorrectionKind[]
  ids?: string[]
}

type RegistryApplyCorrectionArgs = {
  session_id: string
  object_id: string
  correction: {
    id?: string | null
    kind: CorrectionKind
    energy: { value: number; unit: "hartree" | "kcal_mol" | "kj_mol"; reference?: string | null }
    note?: string | null
  }
}

ShellCommandName += "registry.apply_correction"
```

**错误**：

- `invalid_input target=correction.kind`：kind 不在允许集合。
- `invalid_input target=correction.energy`：unit/value 非法。
- `invalid_input target=correction.id`：同 id 不同 payload 冲突。
- `invalid_input target=object_id`：对象不存在。

**约束**：

- `EnergyOptions.include_corrections=false` 等价于 `correction_policy={mode:"none"}`。
- `EnergyOptions.include_corrections=true` 且没有显式 policy 时等价于 `correction_policy={mode:"all"}`。
- `mode="kinds"` 只包含 kind 命中的 Correction；`mode="ids"` 只包含 id 命中的 Correction。
- Correction 正负号完全由 `energy.value` 表示，不按 kind 自动取反。
- Shell command 成功后必须返回更新后的 object summary 或 workbench snapshot projection，供 Web 刷新 Object Registry。

### 4.5 Energy Expression Engine

**方向**：Energy Engine 消费 ReactionGraph + ChemicalObject + EnergyOptions
**形式**：函数协议与 profile point 输出

**契约**：

```ts
type EnergyOptions = {
  output_unit: "kcal_mol" | "kj_mol"
  include_corrections: boolean
  correction_policy?: CorrectionPolicy | null
  energy_key: string
  energy_source?: "energies" | "thermochemistry" | "auto"
  baseline_node_id?: string | null
}

type EnergyComponent = {
  object_id: string
  object_label?: string | null
  coefficient: number
  energy_key: string
  energy_source: "energies" | "thermochemistry"
  raw_energy: EnergyValue
  converted_energy: EnergyValue
  contribution: EnergyValue
}

type CorrectionComponent = {
  object_id: string
  correction_id: string
  kind: CorrectionKind
  coefficient: number
  raw_energy: EnergyValue
  converted_energy: EnergyValue
  contribution: EnergyValue
}

type EnergyExpression = {
  node_id: string
  terms: EnergyComponent[]
  corrections: CorrectionComponent[]
  total: EnergyValue | null
  missing: { code: string; object_id?: string; energy_key?: string; energy_source?: string; message: string }[]
}
```

**约束**：

- 节点总能量为 `sum(term.coefficient * selected_object_energy) + sum(term.coefficient * included_correction_energy)`。
- 每个 term 和 correction 先转换到 output_unit，再乘 coefficient，再参与求和；显示时 raw_energy 和 converted_energy 都保留。
- baseline 节点如果 `total=null`，`compute_profile` 返回 `missing_energy` error。
- 非 baseline 节点如果 `total=null`，profile point 保留 `missing_reason`，warnings 包含缺失细节。
- 所有 relative energy 都以同一 output_unit 和同一 baseline total 计算；不得对缺失点补 0。

### 4.6 Energy Profile Provenance Projection

**方向**：Energy Engine → Project Content / Platform Shell / Web / Export
**形式**：profile point 新字段

**契约**：

```ts
type EnergyPoint = {
  node_id: string
  label: string
  absolute_energy?: EnergyValue | null
  relative_energy?: EnergyValue | null
  missing_reason?: string | null
  expression?: EnergyExpression | null
}

type EnergyProfile = {
  id: string
  graph_id: string
  path_id: string
  options: EnergyOptions
  points: EnergyPoint[]
  warnings: ShellWarning[]
}
```

**约束**：

- Project Content 允许旧 profile point 没有 `expression`；读取后 expression 为 null。
- 新计算的 profile point 必须包含 expression，包括 baseline point。
- Export Service 可读取 expression 作为 metadata / future report detail，但不得依赖它来重新计算数值。

### 4.7 Project Content Compatibility

**方向**：Project Content Store ↔ Reaction Graph / Energy Profile codecs
**形式**：JSON section schema 兼容规则

**契约**：

```ts
reaction-graphs-v1 node:
{
  "id": string,
  "kind": string,
  "label": string,
  "chemical_object_ids": string[],
  "composition"?: ReactionNodeCompositionTerm[],
  "position"?: [number, number] | null,
  "metadata": object
}

energy-profiles-v1 point:
{
  "node_id": string,
  "label": string,
  "absolute_energy"?: EnergyValue | null,
  "relative_energy"?: EnergyValue | null,
  "missing_reason"?: string | null,
  "expression"?: EnergyExpression | null
}
```

**约束**：

- 本 roadmap 第一阶段不强制升级 section schema version；新增字段应在 v1 中可选并由 validation 校验 shape。
- 写入新 graph 时 `composition` 与 `chemical_object_ids` 必须一致：`chemical_object_ids` 等于 composition 中 object_id 去重后的稳定顺序，或在兼容策略中明确采用 term 顺序投影。
- 旧数据加载不得丢失节点、路径、workspace selection、profile points 或 export records。
- migration plan 必须显式说明是否需要从 v1 到后续 v2；不得 silent destructive migration。

## 5. 子 feature 清单

1. **reaction-node-stoichiometry-contract** — 为 ReactionNode 增加 composition terms、workspace.set_node_composition 和旧 chemical_object_ids 兼容投影。
   - 所属模块：Reaction Node Composition / Project Content Migration / Web Workbench Integration
   - 依赖：无
   - 状态：done
   - 对应 feature：`2026-05-22-reaction-node-stoichiometry-contract`
   - 备注：已落地 ReactionNodeCompositionTerm、composition 权威字段、chemical_object_ids 兼容投影、workspace.set_node_composition、reaction-graphs-v1 可选 composition 保存/旧数据 coefficient 1 兼容读取、Shell/Web graph projection；未改变 Energy Engine coefficient 计算。

2. **energy-channel-catalog** — 统一 ChemicalObject energies / thermochemistry 的 channel catalog 与 EnergyOptions source 选择。
   - 所属模块：Energy Channel Catalog
   - 依赖：`reaction-node-stoichiometry-contract`
   - 状态：done
   - 对应 feature：`2026-05-22-energy-channel-catalog`
   - 备注：已落地 EnergyChannelSource/EnergyChannel、EnergyOptions.energy_source、energies/thermochemistry resolver、auto fallback、同名 ambiguity 错误、energy-profiles-v1 可选 energy_source 保存/旧数据 auto 兼容读取、Shell/Web object energy_channels 与 profile source 投影；未改变 composition coefficient 或 correction policy 计算。

3. **energy-expression-engine** — 让 Energy Engine 按 composition coefficient、energy channel 和 correction policy 计算节点能量。
   - 所属模块：Energy Expression Engine
   - 依赖：`reaction-node-stoichiometry-contract`、`energy-channel-catalog`
   - 状态：done
   - 对应 feature：`2026-05-22-energy-expression-engine`
   - 备注：已落地 EnergyOptions.correction_policy、composition coefficient 节点能量计算、重复 term 顺序求和、thermochemistry source 与 coefficient 组合、correction policy none/all/kinds/ids、energy-profiles-v1 可选 correction_policy 保存/旧数据 null 兼容读取、Shell/Web correction_policy 投影；EnergyPoint.expression/provenance 由后续 `energy-profile-provenance-details` 落地，Web selector UI 仍未落地。

4. **correction-command-and-ui** — 增加 registry.apply_correction Shell command 和 Web Object Registry 校正项表单。
   - 所属模块：Correction Policy / Web Workbench Integration
   - 依赖：`reaction-node-stoichiometry-contract`
   - 状态：done
   - 对应 feature：`2026-05-22-correction-command-and-ui`
   - 备注：已落地 registry.apply_correction、Shell payload validation、稳定缺省 correction id、同 id 幂等/冲突错误、Object Summary corrections 明细、Web Correction Entry Form、fixture transport 和桌面/窄屏浏览器 QA；不实现 correction 编辑/删除/排序/批量导入或自动保存 Project Content。

5. **energy-profile-provenance-details** — 在 EnergyProfile point 中输出 expression/components/corrections，并在 Web 面板显示表达式明细。
   - 所属模块：Profile Provenance Projection / Web Workbench Integration
   - 依赖：`energy-expression-engine`、`correction-command-and-ui`
   - 状态：done
   - 对应 feature：`2026-05-22-energy-profile-provenance-details`
   - 备注：已落地 EnergyExpression/EnergyComponent/CorrectionComponent、EnergyPoint.expression、Engine 同步物化 expression、energy-profiles-v1 可选 expression 读写/旧数据兼容、Shell/Web DTO 投影和 Web Expression Details；未新增 Web selector 或前端重算。

6. **energy-semantics-project-content-migration** — 为 reaction graph composition 和 profile expression 补持久化验证、兼容加载和 migration plan 说明。
   - 所属模块：Project Content Migration
   - 依赖：`reaction-node-stoichiometry-contract`、`energy-profile-provenance-details`
   - 状态：done
   - 对应 feature：`2026-05-22-energy-semantics-project-content-migration`
   - 备注：已落地 Project Content Validation 对 reaction-graphs-v1 composition 投影/系数/引用和 energy-profiles-v1 expression node/source/kind/unit/coefficient/missing 语义的只读校验；legacy no-composition/no-expression 数据合法，migration_plan 对 v1 energy semantics 保持 needed=false 且不写文件；未升级 schema、不写迁移器、不重算 profile、不新增 Web 深校验 UI。

7. **web-energy-semantics-controls** — 在 Web 中补节点组成编辑、energy channel selector、correction policy options 和 i18n 文案。
   - 所属模块：Web Workbench Integration
   - 依赖：`energy-channel-catalog`、`correction-command-and-ui`、`energy-profile-provenance-details`
   - 状态：done
   - 对应 feature：`2026-05-22-web-energy-semantics-controls`
   - 备注：已落地 Node Composition Editor、Composition Draft、`workspace.set_node_composition` UI handler、Energy Channel Selector、`energy_source` args、Correction Policy Controls none/all/kinds/ids、fixture expression projection、双语文案、桌面/窄屏浏览器 QA；不在前端重算能量、不写 Project Content/localStorage、不新增 schema 或导出格式。

8. **energy-curve-interaction-polish** — 强化能量曲线交互，显示 point tooltip、missing/correction 标记、选中节点联动和导出一致性检查。
   - 所属模块：Web Workbench Integration / Profile Provenance Projection
   - 依赖：`web-energy-semantics-controls`
   - 状态：done
   - 对应 feature：`2026-05-22-energy-curve-interaction-polish`
   - 备注：已落地 Energy Curve Point marker、Curve Point Detail、keyboard/click point interaction、missing/correction/selected 状态、曲线点/表格行通过 `workspace.select` 联动 Graph Canvas selected node、Report Export Readiness、双语文案和桌面/窄屏浏览器 QA；不前端重算能量、不保存 point UI state、不新增 shell command/schema/export format/chart dependency 或导出 writer 改动。

**最小闭环**：第 1 条 `reaction-node-stoichiometry-contract` 做完后，用户/agent 能在一个 reaction node 中表达 `A + 2B`，保存并重新打开后仍能看到 composition，旧单对象节点仍按 coefficient 1 计算。

## 6. 排期思路

先做 ReactionNode composition，是因为后续 energy channel、correction policy、expression provenance 和 Web 控件都需要稳定的节点组成字段。随后做 channel catalog 与 expression engine，把计算语义补齐；correction command 可以并行跟进，但 profile provenance 要等 expression 和 correction 都有稳定来源。最后做 Project Content 验证补强、Web 控件整合和曲线交互 polish。

技术依赖之外的产品优先级仍可调整：如果你更关心先能手动加溶剂化/谐振校正，可以把 `correction-command-and-ui` 提前到第二条；如果更关心热化学通道，则保持 `energy-channel-catalog` 优先。

## 7. 观察项

- 当前 architecture 已明确 Energy Engine 的多对象节点仍是隐含系数 1；本 roadmap 完成后需要由 feature acceptance 回写为 composition coefficient 语义。
- Parser support matrix 中 Gaussian/ORCA/MAPLE thermochemistry 多数仍是 unsupported/reference-only；energy channel catalog 只定义选择机制，不代表 parser 已能稳定产出这些字段。
- Report Export 的 Energy Table 已有 `ggas/gsol` 等列口径；本 roadmap 后续需要检查 profile expression 与 workbook 字段口径是否一致。
- Web Object Registry 的 Correction Entry Form 已可追加 manual/solvation/resonance correction；`web-energy-semantics-controls` 已把 correction policy options、energy channel selector 和 selected-node composition editor 接入 Web Workbench，但对象面板仍不是完整对象编辑器。
