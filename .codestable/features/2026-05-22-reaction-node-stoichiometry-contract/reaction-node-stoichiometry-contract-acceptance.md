# Reaction Node Stoichiometry Contract 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：.codestable/features/2026-05-22-reaction-node-stoichiometry-contract/reaction-node-stoichiometry-contract-design.md

## 1. 接口契约核对

- [x] `ReactionNodeCompositionTerm` 已落地：`rxnflow.models` 新增 term dataclass，字段覆盖 object_id、coefficient、role、label、metadata。
- [x] `ReactionNode.composition` 已成为权威字段：显式 composition 会投影 `chemical_object_ids`；旧 `chemical_object_ids` 会补 coefficient 1 composition。
- [x] `NodePlacement.composition` 已接入 workspace add_node；旧 `chemical_object_ids` add_node 仍兼容。
- [x] `workspace.set_node_composition` 已落地：Platform Shell → Workspace → GraphPatch update_node → ShellResponse projection。
- [x] `reaction-graphs-v1` node JSON 已新增可选 `composition`，并继续写 `chemical_object_ids`。

## 2. 行为与决策核对

- [x] composition 是权威字段，`chemical_object_ids` 是兼容投影：代码和 codec 均按此规则处理。
- [x] 旧节点自动补 coefficient 1：旧 JSON 缺 composition 的加载测试已覆盖。
- [x] coefficient 允许负数和小数，禁止 0 / NaN / Infinity：graph/workspace/shell tests 覆盖非法 0；非有限值由校验逻辑拒绝。
- [x] 同一 object id 可重复出现：核心投影按首次出现顺序去重，composition term 顺序保留。
- [x] 失败不写回 graph state：graph、workspace、shell tests 均覆盖错误后 state 保持。
- [x] 未改 Energy Engine coefficient 计算，后续 `energy-expression-engine` 处理。

## 3. 验收场景核对

- [x] S1 创建 `ReactionNode(composition=[A, 2B])`：`tests/test_reaction_graph_protocol.py` 覆盖 term 保存和 id 投影。
- [x] S2 旧 `chemical_object_ids` 节点兼容：core 旧测试继续通过，Project Content legacy load 测试覆盖 coefficient 1。
- [x] S3 shell 更新 composition：`tests/test_platform_shell_baseline.py` 覆盖 `workspace.set_node_composition` projection。
- [x] S4 非法 coefficient：graph/workspace/shell tests 覆盖 `invalid_input target=composition`。
- [x] S5 缺失 object：graph/workspace tests 覆盖 `graph_invalid` 且不写回。
- [x] S6 新 graph 保存：`tests/test_reaction_graph_workspace_persistence.py` 覆盖 `composition` + `chemical_object_ids` 双写。
- [x] S7 旧 graph 读取：同文件覆盖缺失 composition 的 legacy JSON load。

## 4. 术语一致性

- `ReactionNodeCompositionTerm`、`composition`、`chemical_object_ids`、`coefficient`、`workspace.set_node_composition` 与 design 术语一致。
- 防冲突：没有引入 EnergyChannel、CorrectionPolicy、ReactionBalance 等后续 roadmap 名词。

## 5. 架构归并

- [x] `.codestable/architecture/core-platform.md`：已归并 ReactionNode composition 字段、Project Content JSON 兼容、Workspace/Shell command、错误语义和 Energy Engine 未变边界。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已归并总入口约束、PlatformShellService command 和 Web Graph Canvas shell command 列表。

## 6. requirement 回写

- `web-workbench-shell` 用户视角不需要本轮改写；本 feature 只是为后续 Web 表单和能量语义提供核心契约。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-items.yaml` 已将 `reaction-node-stoichiometry-contract` 标为 done。
- [x] roadmap 主文档第 5 节已同步状态、feature 目录和完成备注。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- 无候选。本 feature 没暴露新的环境命令或通用协作规约。

## 9. 遗留

- `energy-expression-engine`：Energy Engine 仍按旧 `chemical_object_ids` 隐含系数 1 计算，未使用 coefficient。
- `web-energy-semantics-controls`：Web 尚无节点组成编辑表单，只更新了 Shell DTO / fixture transport。
- `energy-channel-catalog`：thermochemistry channel 选择未在本轮实现。

## 验证

- `python3 -m unittest tests.test_project_content_validation_migration tests.test_reaction_graph_workspace_persistence tests.test_reaction_graph_protocol tests.test_graph_editor_workspace tests.test_platform_shell_baseline`
- `python3 -m unittest discover`
- `cd web && npm run test -- ShellClient.test.ts`
- `cd web && npm run build`
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-22-reaction-node-stoichiometry-contract/reaction-node-stoichiometry-contract-checklist.yaml --yaml-only`
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-items.yaml --yaml-only`
