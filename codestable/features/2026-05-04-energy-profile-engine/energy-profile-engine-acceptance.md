# energy-profile-engine 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-04
> 关联方案 doc：`codestable/features/2026-05-04-energy-profile-engine/energy-profile-engine-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `EnergyProfileEngine().compute_profile(project_id, graph, path_id, objects, options)` 存在并返回 `Result[EnergyProfile]`。代码落点：`rxnflow.energy.EnergyProfileEngine.compute_profile`；证据：`tests/test_energy_profile_engine.py::test_compute_profile_matches_fixture_relative_energy`。
- [x] 指定 path 计算 kcal/mol profile：profile 保留 `graph_id`、`path_id`、resolved options，并按 path 顺序返回 points。证据：`test_compute_profile_matches_fixture_relative_energy`。
- [x] 计入 correction 并输出 kJ/mol 的接口行为可用。证据：`test_kj_mol_output_converts_absolute_and_relative_energy`、`test_multi_object_node_and_corrections_are_additive_when_enabled`。
- [x] 非 baseline 缺失能量返回 ok profile、缺失点和 warning。证据：`test_non_baseline_missing_energy_returns_missing_point_and_warning`。

**名词层"现状 → 变化"逐项核对**：

- [x] 复用现有 `EnergyOptions`、`EnergyPoint`、`EnergyProfile` dataclass，没有新增并行模型。
- [x] 新增通用 Energy Engine 入口 `EnergyProfileEngine`，fixture-only `compute_fixture_profile` 保持兼容。
- [x] 新增通用单位换算，支持 `hartree`、`kcal_mol`、`kj_mol` 输入到 `kcal_mol` / `kj_mol` 输出。
- [x] 新增 node total energy 语义：多 ChemicalObject 求和，可选叠加 corrections。
- [x] `compute_fixture_profile` 行为保持兼容，fixture vertical slice 回归测试通过。

**流程图核对**：

- [x] `validate project_id / graph project / options` 落在 `_validate_profile_inputs`。
- [x] `lookup selected ReactionPath` 落在 `_select_path`。
- [x] `build node and object indexes` 落在 `compute_profile` 的 `node_by_id` / `object_by_id`。
- [x] `resolve baseline node` 落在 `baseline_node_id = options.baseline_node_id or path.node_ids[0]`。
- [x] `compute baseline node total energy` 和逐点 node total 落在 `_node_total_energy`。
- [x] 缺失点分支落在 `compute_profile` 中 `total.error.code == "missing_energy" and node_id != baseline_node_id`。
- [x] profile 返回落在 `EnergyProfile(...)` 构造和 `ok(profile, warnings=...)`。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 从指定 `ReactionGraph` 的指定 `ReactionPath` 读取节点顺序：单测覆盖 `path_id` 成功和缺失 path 失败。
- [x] 根据 ChemicalObject 和 `energy_key` 计算每个点总能量：单测覆盖 hartree、kcal/mol、多对象节点和缺失 energy key。
- [x] 按 baseline 计算相对能量：单测覆盖缺省 baseline 和中间节点 baseline。
- [x] 支持 `kcal_mol` 和 `kj_mol` 输出：单测覆盖两种输出单位。
- [x] `include_corrections` 显式控制校正项叠加：单测覆盖 raw/corrected 结果不同，且原始 energy channel 不被改写。
- [x] 缺失对象、缺失能量、缺失 baseline 和非能量节点均有可诊断结果：单测覆盖 `graph_invalid`、`missing_energy`、missing point 和 annotation/group。

**明确不做逐项核对**：

- [x] 未新增 UI、CLI、Web route、画布交互、图表绘制或报告预览代码。
- [x] 未写 Project Store，未新增 manifest resource，未持久化 EnergyProfile。
- [x] 未调用 ParserRegistry、GaussianLogPlugin、OrcaOutputPlugin、XyzPlugin 或 Maple parser。
- [x] 未调用 ChemicalRegistry.apply_correction，未修改 ChemicalObject。
- [x] 未调用 ReactionGraphService.apply_patch，未修改 ReactionGraph。
- [x] 未生成 ExportArtifact、PNG、CDXML 或 Excel。
- [x] 未新增热化学表达式、计量系数字段、反应配平、速率模型或自动路径搜索。

**关键决策落地**：

- [x] Energy Engine 是 core service，不是 UI 图表层：实现只返回 `EnergyProfile` 数据。
- [x] 计算输入使用已加载领域对象：入口接收 `graph` 和 `objects`，不依赖 Project Store。
- [x] `absolute_energy` 使用输出单位下的节点总能量：单测断言 `EnergyValue(..., "kcal_mol")` / `"kj_mol"`。
- [x] 相对能量 = 当前节点总能量 - baseline 节点总能量：baseline offset 单测通过。
- [x] correction 是加性项：单测中 `-0.5 kcal_mol + 0.001 hartree` 被直接叠加。
- [x] 多对象节点按系数 1 求和：单测中 `object-b + object-c` 得到 `3.0 kcal_mol` raw relative。
- [x] 非 baseline 缺失点保留 profile：单测断言 missing point 和 warning。

**挂载点核对与拔除沙盘**：

- [x] Energy Engine 入口：`rxnflow.energy.EnergyProfileEngine`。
- [x] Node total energy 语义：`rxnflow.energy._node_total_energy`。
- [x] Unit conversion helper：`rxnflow.energy._to_output_unit`、`_to_kcal_mol` 和 `rxnflow.constants.KCAL_MOL_TO_KJ_MOL`。
- [x] Fixture 兼容入口：`compute_fixture_profile` 保留，`run_core_fixture_vertical_slice()` 行为不变。
- [x] 反向 grep：本 feature 代码引用集中在 `rxnflow/energy.py`、`rxnflow/constants.py` 和 `tests/test_energy_profile_engine.py`；清单外挂载点无新增。
- [x] 拔除推演：删除 `EnergyProfileEngine`、unit conversion helper、新常量和新测试后，旧 fixture helper 仍可按原行为存在；无 Project Store / Parser / Export 持久化残留。

## 3. 验收场景核对

- [x] **S1**：两节点 hartree 输入输出 kcal/mol，相对能量为 `12.55018948 kcal_mol`。证据：单测。
- [x] **S2**：请求 `output_unit="kj_mol"` 时 absolute 和 relative 都以 kJ/mol 输出。证据：单测。
- [x] **S3**：`baseline_node_id` 为空时 path 第一个 node 的 relative energy 为 0。证据：单测。
- [x] **S4**：baseline 指向中间节点时该节点 relative energy 为 0，前后节点按该节点偏移。证据：单测。
- [x] **S5**：baseline 不属于 selected path 时返回 `graph_invalid`。证据：单测。
- [x] **S6**：selected path id 不存在时返回 `graph_invalid`。证据：单测。
- [x] **S7**：path 引用缺失 node 或 node 引用缺失 ChemicalObject 返回 `graph_invalid`。证据：单测。
- [x] **S8**：baseline node 缺少 `options.energy_key` 返回 `missing_energy`。证据：单测。
- [x] **S9**：非 baseline node 缺少 `options.energy_key` 返回 ok profile、缺失点和 warning。证据：单测。
- [x] **S10**：species / transition_state 多对象节点按对象能量求和。证据：单测。
- [x] **S11**：`include_corrections=False` 忽略 Correction，原始 energy channel 不被改写。证据：单测。
- [x] **S12**：`include_corrections=True` 叠加所有 Correction.energy 并换算单位。证据：单测。
- [x] **S13**：annotation/group 在 path 中非 baseline 生成缺失点，作为 baseline 返回 `missing_energy`。证据：单测。
- [x] **S14**：unsupported energy unit 或 output unit 返回 `invalid_input`。证据：单测。
- [x] **S15**：现有 `run_core_fixture_vertical_slice()` profile id、points 和 relative energy 行为不变。证据：单测和全量测试。

本 feature 无前端改动，不需要浏览器验证。

## 4. 术语一致性

- Energy Engine：代码新增 `EnergyProfileEngine`，含义一致。
- Energy Profile：代码复用 `EnergyProfile`，含义一致。
- Energy Point：代码复用 `EnergyPoint`，含义一致。
- Baseline Node：代码使用 `baseline_node_id` 和 resolved `EnergyOptions`，含义一致。
- Node Total Energy：代码落在 `_node_total_energy`，含义一致。
- Correction Inclusion：代码使用 `include_corrections` 控制，含义一致。
- Missing Energy Diagnostic：代码使用 `missing_energy` error、point `missing_reason` 和 warning，含义一致。
- 防冲突：未新增 `EnergyGraph`、`EnergyCurve`、stoichiometric coefficient、thermal expression 等方案外概念。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：补入 Energy Engine 术语、Core Platform 当前能力说明，以及 Energy Engine 的 baseline、单位、correction inclusion、缺失能量诊断和跨模块边界。
- [x] `codestable/architecture/core-platform.md`：补入第六类当前能力、EnergyProfileEngine 模块职责、数据状态、错误语义、约束边界和仍未实现的热化学/计量/绘图能力。
- [x] 架构归并后，未读过 design 的读者可以从 architecture 了解 Energy Engine 的输入、输出、单位、baseline、correction 和缺失诊断语义。

## 6. requirement 回写

- [x] 方案 frontmatter `requirement: null`。
- [x] 本 feature 是核心服务/API 能力，没有 UI/CLI 用户入口；它是后续 Graph Editor 和 Report Export 的前置，因此本阶段不 backfill 用户需求文档。

## 7. roadmap 回写

- [x] 方案 frontmatter `roadmap: rxnflow-core-platform`、`roadmap_item: energy-profile-engine`。
- [x] `codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-items.yaml` 中该条已从 `in-progress` 改为 `done`，feature 保持 `2026-05-04-energy-profile-engine`。
- [x] `codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-roadmap.md` 子 feature 清单已同步为 `done` 并填写对应 feature。
- [x] roadmap YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露新的环境命令、代理配置、本地服务步骤或反复会踩的仓库工作流约定。

## 9. 遗留

- 后续优化点：EnergyProfile 的内容持久化格式仍待后续 feature 决策。
- 后续优化点：Graph Editor 的实时曲线 UI、图表绘制和报告预览留给后续 feature。
- 后续优化点：热化学表达式、计量系数字段、反应配平、速率模型、自动路径搜索和微观动力学不在本 feature 范围。
- 已知限制：EnergyProfileEngine 当前读取调用方传入的内存 graph/object 集合，不跨进程持久化状态。
- 实现阶段顺手发现：无。
