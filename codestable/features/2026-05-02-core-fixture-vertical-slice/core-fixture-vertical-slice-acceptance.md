# core-fixture-vertical-slice 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-02
> 关联方案 doc：codestable/features/2026-05-02-core-fixture-vertical-slice/core-fixture-vertical-slice-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查。

**接口示例逐项核对**：

- [x] `runCoreFixtureVerticalSlice` 正常路径：`rxnflow.fixture.run_core_fixture_vertical_slice()` 输入默认 fixture，返回 `ok=True`，输出包含 ProjectManifest、两个 ChemicalObject、ReactionGraph、EnergyProfile。证据：`tests/test_core_fixture_vertical_slice.py::test_default_fixture_returns_core_objects`。
- [x] `runCoreFixtureVerticalSlice` 缺失 energy key 错误路径：把 `energy_key` 改为 `gibbs`，返回 `ok=False`、`error.code=missing_energy`、`target=node-a`。证据：`tests/test_core_fixture_vertical_slice.py::test_missing_energy_key_returns_missing_energy`。

**名词层"现状 → 变化"逐项核对**：

- [x] `FixtureScenario` / `CoreFixtureResult`：已在 `rxnflow.models` 落地为 dataclass；字段与方案最小子集一致。
- [x] `ProjectManifest` / `ChemicalObject` / `ReactionGraph` / `EnergyProfile`：已在 `rxnflow.models` 落地，并由默认 fixture 端到端构造。
- [x] `Result<T>`：已在 `rxnflow.result` 落地；核心编排入口和模块节点返回 Result。

**流程图核对**：

- [x] `FixtureScenario -> createProject -> register objects -> create/build graph -> compute profile -> CoreFixtureResult` 在 `rxnflow.fixture.run_core_fixture_vertical_slice` 中逐步落地。
- [x] `invalid_input`、`graph_invalid`、`missing_energy` 分支均有实际落点和测试证据。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 内置 fixture 创建项目：`rxnflow.project.create_project` 返回稳定 ProjectManifest。
- [x] 登记两个 ChemicalObject：`rxnflow.registry.register_fixture_objects` 返回 `object-a`、`object-b`。
- [x] 构造两节点 ReactionGraph：`rxnflow.graph.build_fixture_graph` 返回两个节点、一条边、一条 path。
- [x] 计算相对能量表：`rxnflow.energy.compute_fixture_profile` 返回两个 EnergyPoint，第二个相对能量为 `12.55018948 kcal_mol`。

**明确不做逐项核对**：

- [x] 不解析 Gaussian、ORCA、XYZ：grep 命中仅来自测试/文档范围守护，`rxnflow/` 中没有真实文件解析入口。
- [x] 不实现持久化项目目录、SQLite、数据库或文件保存格式：代码只有内存 ProjectManifest，没有文件/数据库写入。
- [x] 不实现 Web UI、画布、CLI 产品命令或报告导出：未新增路由、组件、命令入口或 ExportArtifact 输出。
- [x] 不处理多组分态、过渡态、分叉路径、校正项计算、热化学表达式或溶剂化公式：模型保留 roadmap 字面量，但实际 workflow 只接受单对象 species 节点，并拒绝 `include_corrections=True`。
- [x] 不把 fixture 数据当成真实化学体系或推荐示例反应：architecture 和 design 均明确 fixture 只表达数据流。

**关键决策落地**：

- [x] 非真实内置 fixture：`default_core_fixture_scenario` 提供 toy 数据，不从文件读取。
- [x] 基线固定为第一个节点：默认 `baseline_node_id=node-a`，测试断言第一个点相对能量为 0。
- [x] hartree 到 kcal/mol：`rxnflow.constants.HARTREE_TO_KCAL_MOL = 627.509474`，测试断言第二个点为 `12.55018948`。
- [x] 内存实现：Project Store 只创建 dataclass manifest，不承诺磁盘格式。
- [x] 错误走 Result 协议：graph 和 energy 错误都返回 `Result(ok=False, error=...)`。

**编排层"现状 → 变化"逐项核对**：

- [x] 原先无应用代码；现在有 `rxnflow.fixture.run_core_fixture_vertical_slice` 串联 project、registry、graph、energy 四个节点。

**跨层纪律核对**：

- [x] 错误语义：模块节点不静默吞错；`graph_invalid` 和 `missing_energy` 有测试覆盖。
- [x] 幂等性：重复运行默认 fixture 输出完全相等，测试覆盖。
- [x] 顺序约束：registry 先于 graph，graph 先于 energy profile，代码顺序明确。
- [x] 扩展点位置：parser、持久化、UI、导出服务都未插入本编排。
- [x] 可观测点：正常/错误结果均为结构化 dataclass。

**挂载点反向核对（可卸载性）**：

- [x] Core fixture scenario：`rxnflow.fixture.default_core_fixture_scenario`。
- [x] Core workflow entry：`rxnflow.fixture.run_core_fixture_vertical_slice`，并由 `rxnflow.__init__` 导出。
- [x] Energy conversion constant：`rxnflow.constants.HARTREE_TO_KCAL_MOL`。
- [x] 反向 grep：本 feature 代码引用集中在 `rxnflow/` 和 `tests/test_core_fixture_vertical_slice.py`；没有额外产品入口。
- [x] 拔除沙盘推演：删除 `rxnflow.fixture` 入口、default scenario、energy constant 和测试后，本 feature 在系统视角消失；其他模块只是基础类型骨架。

## 3. 验收场景核对

- [x] **S1**：输入默认 fixture scenario → 返回 `ok=True`，结果包含一个 ProjectManifest、两个 ChemicalObject、一个 ReactionGraph、一个 EnergyProfile。
  - 证据来源：单测 `test_default_fixture_returns_core_objects`
  - 结果：通过
- [x] **S2**：默认 fixture 第一个点 `relativeEnergy.value = 0 kcal_mol`。
  - 证据来源：单测 `test_default_fixture_relative_energy_points`
  - 结果：通过
- [x] **S3**：默认 fixture 第二个点 `relativeEnergy.value = 12.55018948 kcal_mol`。
  - 证据来源：单测 `test_default_fixture_relative_energy_points`
  - 结果：通过
- [x] **S4**：path 引用不存在 node → 返回 `graph_invalid`，不继续计算 EnergyProfile。
  - 证据来源：单测 `test_missing_path_node_returns_graph_invalid`
  - 结果：通过
- [x] **S5**：请求缺失 `energyKey=gibbs` → 返回 `missing_energy`，不把缺失值当作 0。
  - 证据来源：单测 `test_missing_energy_key_returns_missing_energy`
  - 结果：通过
- [x] **S6**：重复运行同一 fixture scenario → 输出关键 id、路径顺序和能量点顺序稳定。
  - 证据来源：单测 `test_fixture_output_is_deterministic`
  - 结果：通过

本 feature 无前端改动，无需浏览器验证。

## 4. 术语一致性

- Core Fixture：代码命中 `default_core_fixture_scenario` 和 fixture module，含义一致。
- Vertical Slice：代码入口为 `run_core_fixture_vertical_slice`，含义一致。
- Chemical Object：代码使用 `ChemicalObject` / `ChemicalObjectDraft`，含义一致。
- Reaction Graph：代码使用 `ReactionGraph` / `ReactionNode` / `ReactionEdge` / `ReactionPath`，含义一致。
- Energy Profile：代码使用 `EnergyProfile` / `EnergyPoint`，含义一致。
- 防冲突：仓库无旧应用代码，未发现同名异义实现。

## 5. 架构归并

- [x] `codestable/architecture/core-platform.md`：已新增当前状态文档，记录核心 fixture 能力、模块职责、数据状态、错误语义和边界。
- [x] `codestable/architecture/ARCHITECTURE.md`：已更新为当前状态，并新增 Core Platform 索引与已落地架构决定。

归并后，未读过 design 的读者可以从 architecture 中知道：系统现在有一条内置 fixture 的核心链路、它如何编排、哪些错误语义已稳定、哪些计算化学能力尚未实现。

## 6. requirement 回写

- [x] `requirement` 为空，本 feature 是开发/测试用核心链路，不是直接用户可见能力；跳过 requirement backfill。
- [x] 后续面向用户的导入、图谱编辑、能量曲线和导出能力启动时，再分别补对应 requirement。

## 7. roadmap 回写

- [x] `roadmap=rxnflow-core-platform`、`roadmap_item=core-fixture-vertical-slice` 字段完整。
- [x] `codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-items.yaml` 已将 `core-fixture-vertical-slice` 更新为 `status: done`，`feature: 2026-05-02-core-fixture-vertical-slice`。
- [x] `codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-roadmap.md` 主文档第 5 节已同步状态为 done。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 有候选，暂不擅自写入。
  - 候选 1：建议在 `AGENTS.md` 记录当前测试命令：`python3 -m unittest discover`。
  - 候选 2：建议记录 CodeStable YAML 校验命令：`python3 codestable/tools/validate-yaml.py --file <path> --yaml-only`。

## 9. 遗留

- 后续优化点：
  - 后续 `project-storage-model` 需要定义真实持久化格式和 schemaVersion 迁移策略。
  - 后续 `parser-plugin-baseline` 需要接入 Gaussian、ORCA、XYZ 的真实 fixture 文件。
  - 后续 `energy-profile-engine` 需要扩展多组分态、过渡态、校正项、热化学表达式和溶剂化公式。
- 已知限制：
  - 当前只支持内置 toy fixture。
  - 当前只支持单对象 species 节点。
  - 当前只支持 `electronic` energy key 的默认 fixture 场景和 `kcal_mol` 输出。
- 实现阶段顺手发现：
  - 无。
