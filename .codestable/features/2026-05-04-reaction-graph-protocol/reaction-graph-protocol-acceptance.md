# reaction-graph-protocol 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-04
> 关联方案 doc：`.codestable/features/2026-05-04-reaction-graph-protocol/reaction-graph-protocol-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `GraphPatch("add_node", node=...)` 可构造并被 service 接收。代码落点：`rxnflow.models.GraphPatch`、`rxnflow.graph.ReactionGraphService.apply_patch`；证据：`tests/test_reaction_graph_protocol.py::test_add_node_preserves_fields`。
- [x] `ReactionGraphService.create_graph(project_id, label)` 返回空 `ReactionGraph`，并按 project id / graph id 存入内存 state。证据：`test_create_graph_returns_empty_graph_and_list_paths`。
- [x] `ReactionGraphService.apply_patch(project_id, graph_id, patches, object_ids)` 按顺序应用 patch，返回完整 `ReactionGraph`。证据：`test_add_edge_set_path_and_list_paths`、`test_failed_patch_batch_does_not_write_back_state`。
- [x] `ReactionGraphService.list_paths(project_id, graph_id)` 只返回 path，不计算能量。证据：`test_create_graph_returns_empty_graph_and_list_paths`、`test_add_edge_set_path_and_list_paths`。
- [x] 无效 edge/path 引用返回 `graph_invalid`。证据：`test_invalid_references_return_graph_invalid`。

**名词层"现状 → 变化"逐项核对**：

- [x] 复用现有 `ReactionNode`、`ReactionEdge`、`ReactionPath`、`ReactionGraph` dataclass，没有并行模型。
- [x] 新增 `GraphPatchOp` 和 `GraphPatch`，覆盖 add/update node、add/update edge、remove、set_path。
- [x] 新增 `ReactionGraphService`，通用 graph workflow 与 `build_fixture_graph` fixture helper 并存。
- [x] `build_fixture_graph` 行为保持兼容，fixture vertical slice 回归测试通过。

**流程图核对**：

- [x] `create_graph -> validate project_id -> create ReactionGraph -> store -> return` 在 `ReactionGraphService.create_graph` 中落地。
- [x] `apply_patch -> lookup graph -> apply patches in order -> fail returns error / success writes state` 在 `ReactionGraphService.apply_patch` 中落地。
- [x] `list_paths -> lookup graph -> return graph.paths` 在 `ReactionGraphService.list_paths` 中落地。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 创建空 `ReactionGraph`：单测覆盖 project_id、id、空 nodes/edges/paths。
- [x] 通过 `GraphPatch[]` 添加/更新/删除节点和边：单测覆盖 add/update/remove。
- [x] `set_path` 支持多条 ReactionPath：单测覆盖两条 path 表达分叉。
- [x] node/object/edge/path 引用校验：单测覆盖重复 id、缺失 node、缺失 object。
- [x] UI 和 agent 可共用结构化 patch：GraphPatch 是领域 dataclass，不包含 UI 状态。

**明确不做逐项核对**：

- [x] 未新增 UI、CLI、Web route、画布交互或自动布局代码。
- [x] 未调用 ProjectStore 或写 `.rxnflow/manifest.json`。
- [x] 未调用 ChemicalRegistry；object id 只通过 `object_ids` 集合校验。
- [x] 未调用 Parser Plugins，不解析原始输出文件。
- [x] 未调用 Energy Engine，不计算能量或校正项。
- [x] 未生成 ExportArtifact、PNG、CDXML 或 Excel。
- [x] 未新增 stoichiometric coefficient 字段或自动反应路径搜索。

**关键决策落地**：

- [x] GraphPatch 是核心协议，不是 UI 状态：模型中只有 graph 领域 payload。
- [x] Reaction Graph 只引用 ChemicalObject id：节点保存 `chemical_object_ids`，不复制 ChemicalObject。
- [x] 分叉用多条 ReactionPath 表达：多 path 测试通过。
- [x] 删除节点级联删除 edge/path：remove node 测试通过。
- [x] annotation/group 节点允许空 `chemical_object_ids`：单测覆盖。

**挂载点核对与拔除沙盘**：

- [x] GraphPatch 类型：`rxnflow.models.GraphPatch`。
- [x] ReactionGraphService 入口：`rxnflow.graph.ReactionGraphService`。
- [x] Graph service state：`ReactionGraphService._projects`。
- [x] Fixture 兼容入口：`build_fixture_graph` 保留。
- [x] 反向 grep：本 feature 代码引用集中在 `rxnflow/models.py`、`rxnflow/graph.py` 和 `tests/test_reaction_graph_protocol.py`，无清单外挂载点。
- [x] 拔除推演：删除 `GraphPatch`、`ReactionGraphService`、helper 和新测试后，fixture vertical slice 仍可依赖 `build_fixture_graph` 工作；没有持久化残留。

## 3. 验收场景核对

- [x] **S1**：输入 project id → `create_graph` 返回空 ReactionGraph。证据：单测。
- [x] **S2**：创建 graph 后 `list_paths` → 空 tuple。证据：单测。
- [x] **S3**：add_node 保留 kind、label、object ids、position、metadata。证据：单测。
- [x] **S4**：add_edge 引用已存在 nodes 时成功。证据：单测。
- [x] **S5**：set_path 引用已存在 nodes 时成功，`list_paths` 可返回。证据：单测。
- [x] **S6**：多条 set_path 保存多条 path 表达分叉。证据：单测。
- [x] **S7**：update_node / update_edge 只更新指定字段。证据：单测。
- [x] **S8**：remove node 级联删除相关 edge 和 path。证据：单测。
- [x] **S9**：重复 node id、缺失 edge node、缺失 path node 返回 `graph_invalid`。证据：单测。
- [x] **S10**：species / transition_state 缺失 object id 校验返回 `graph_invalid`。证据：单测。
- [x] **S11**：annotation / group 可不引用 ChemicalObject。证据：单测。
- [x] **S12**：patch 批次中途失败不写回 state。证据：单测。
- [x] **S13**：未知 graph id 或空 project id 返回 `invalid_input`。证据：单测。
- [x] **S14**：`run_core_fixture_vertical_slice()` 行为不变。证据：单测和全量测试。

本 feature 无前端改动，不需要浏览器验证。

## 4. 术语一致性

- Reaction Graph：代码复用 `ReactionGraph`，含义一致。
- Reaction Node：代码复用 `ReactionNode`，含义一致。
- Reaction Edge：代码复用 `ReactionEdge`，含义一致。
- Reaction Path：代码复用 `ReactionPath`，含义一致。
- GraphPatch：新增 `GraphPatch`，用于结构化 graph 修改操作。
- ReactionGraphService：新增 `ReactionGraphService`，承担 create/apply/list paths workflow。
- 防冲突：没有新增 UI node、branch node、branch edge、stoichiometric coefficient 等方案外概念。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：补入 GraphPatch 术语、Core Platform 当前能力说明、GraphPatch 关键架构决定和分叉路径表达边界。
- [x] `.codestable/architecture/core-platform.md`：补入第五类当前能力、ReactionGraphService 模块职责、GraphPatch 数据状态、错误语义、顺序写回纪律和约束边界。
- [x] 架构归并后，未读过 design 的读者可以从 architecture 了解 Reaction Graph 的输入、输出、patch 操作、分叉表达、错误语义和跨模块边界。

## 6. requirement 回写

- [x] 方案 frontmatter `requirement: null`。
- [x] 本 feature 仍是核心服务/API 协议能力，没有 UI/CLI 用户入口；它是后续 graph editor、energy engine 和 report export 的前置，因此不在本阶段 backfill 用户需求文档。

## 7. roadmap 回写

- [x] 方案 frontmatter `roadmap: rxnflow-core-platform`、`roadmap_item: reaction-graph-protocol`。
- [x] `.codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-items.yaml` 中该条已从 `in-progress` 改为 `done`，feature 保持 `2026-05-04-reaction-graph-protocol`。
- [x] `.codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-roadmap.md` 子 feature 清单已同步为 `done` 并填写对应 feature。
- [x] roadmap YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露新的环境命令、代理配置、本地服务步骤或反复会踩的仓库工作流约定。

## 9. 遗留

- 后续优化点：ReactionGraph 的内容持久化格式仍待后续 feature 决策。
- 后续优化点：图谱编辑 UI 状态、画布布局、拖拽、缩放和选择态留给 `graph-editor-workspace`。
- 后续优化点：复杂化学计量、多组分能量表达式和过渡态化学判定留给后续 feature。
- 已知限制：ReactionGraphService 当前为内存 state，不跨进程持久化。
- 实现阶段顺手发现：无。
