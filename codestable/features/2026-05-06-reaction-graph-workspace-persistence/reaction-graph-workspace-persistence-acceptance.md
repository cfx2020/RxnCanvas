---
doc_type: feature-acceptance
feature: 2026-05-06-reaction-graph-workspace-persistence
status: accepted
summary: 验收 ReactionGraph、ReactionPath 和 workspace-only 画布状态持久化
tags: [persistence, reaction-graph, workspace, graph-codec, acceptance]
---

# reaction-graph-workspace-persistence 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-06
> 关联方案 doc：codestable/features/2026-05-06-reaction-graph-workspace-persistence/reaction-graph-workspace-persistence-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查。

**接口示例逐项核对**：

- [x] graph/workspace snapshot 到 ProjectContentSnapshot：`ReactionGraphService.list_graphs`、`GraphEditorWorkspaceService.list_workspaces` 均已落地，返回 tuple 可放入 `ProjectContentSnapshot` 并由 ProjectContentStore 保存。证据：`rxnflow/graph.py:72`、`rxnflow/workspace.py:147`、`tests/test_reaction_graph_workspace_persistence.py:473`。
- [x] 从 ProjectContentSnapshot 恢复运行态：`ReactionGraphService.restore_graphs` 和 `GraphEditorWorkspaceService.restore_workspaces` 可把 loaded graph/workspace 恢复为可继续编辑的 service state。证据：`rxnflow/graph.py:83`、`rxnflow/workspace.py:157`、`tests/test_reaction_graph_workspace_persistence.py:322`、`tests/test_reaction_graph_workspace_persistence.py:380`。
- [x] workspace section 不保存 derived data：`workspaces-v1` 只写 workspace-only 状态；加载后 palette 和 preview 由 ChemicalObject / ReactionGraph 派生。证据：`rxnflow/graph_workspace_codec.py:99`、`rxnflow/graph_workspace_codec.py:510`、`tests/test_reaction_graph_workspace_persistence.py:182`。

**名词层“现状 → 变化”逐项核对**：

- [x] Graph / Workspace section codec 已抽出，提供 `reaction-graphs-v1` 与 `workspaces-v1` 的 serialize/deserialize/validate 边界。证据：`rxnflow/graph_workspace_codec.py:25`、`rxnflow/graph_workspace_codec.py:99`。
- [x] ProjectContentStore 的 `reaction_graphs` 和 `workspaces` sections 已改用长期 codec。证据：`rxnflow/content_store.py:438`、`rxnflow/content_store.py:447`、`rxnflow/content_store.py:497`、`rxnflow/content_store.py:511`。
- [x] `ReactionGraphService.list_graphs` / `restore_graphs` 已公开。证据：`rxnflow/graph.py:72`、`rxnflow/graph.py:83`。
- [x] `GraphEditorWorkspaceService.list_workspaces` / `restore_workspaces` 已公开。证据：`rxnflow/workspace.py:147`、`rxnflow/workspace.py:157`。
- [x] `ProjectContentSnapshot.reaction_graphs/workspaces` 已作为长期 graph/workspace section 的数据入口使用。证据：`rxnflow/content_store.py:94`、`rxnflow/content_store.py:438`。

**流程图核对**：

- [x] save flow：service list → codec validate/serialize → ProjectContentStore 写 `reaction-graphs.json` / `workspaces.json`。证据：`rxnflow/content_store.py:438`、`rxnflow/content_store.py:447`。
- [x] load flow：先加载 ChemicalObject ids，再校验 ReactionGraph，最后校验 Workspace 并派生 snapshot。证据：`rxnflow/content_store.py:493`、`rxnflow/content_store.py:497`、`rxnflow/content_store.py:511`。
- [x] restore flow：ChemicalRegistry restore 后，ReactionGraphService restore，再 GraphEditorWorkspaceService restore。证据：`tests/test_reaction_graph_workspace_persistence.py:322`、`tests/test_reaction_graph_workspace_persistence.py:380`。

结论：接口契约与 design 一致。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 真实 ReactionGraph / ReactionNode / ReactionEdge / ReactionPath 可保存为 `reaction-graphs-v1`。证据：`tests/test_reaction_graph_workspace_persistence.py:37`。
- [x] WorkspaceSnapshot 的 `workspace_id`、`graph_id`、`selection`、`viewport`、`active_path_id`、`updated_at` 可保存为 `workspaces-v1`。证据：`tests/test_reaction_graph_workspace_persistence.py:182`。
- [x] ProjectContentStore load 可恢复 graph tuple 和 workspace tuple，workspace palette/preview 为派生数据。证据：`tests/test_reaction_graph_workspace_persistence.py:473`。
- [x] ReactionGraphService 与 GraphEditorWorkspaceService 均有 project-level snapshot/restore 入口。证据：`tests/test_reaction_graph_workspace_persistence.py:322`、`tests/test_reaction_graph_workspace_persistence.py:380`。
- [x] 坏 schema、project id mismatch、重复 id、缺失 object/node/edge/path/workspace 引用和非法 viewport 均返回 structured error。证据：`tests/test_reaction_graph_workspace_persistence.py:57`、`tests/test_reaction_graph_workspace_persistence.py:218`、`tests/test_reaction_graph_workspace_persistence.py:348`、`tests/test_reaction_graph_workspace_persistence.py:427`。
- [x] ProjectContentStore 不改 manifest、不登记 ProjectResource、不读 raw file、不调用 parser/import/energy/export。证据：`tests/test_reaction_graph_workspace_persistence.py:473`、`tests/test_reaction_graph_workspace_persistence.py:520`。

**明确不做逐项核对**：

- [x] 未持久化 GraphPatch history、undo/redo、operation log、CRDT 或协同编辑 schema。
- [x] 未把 ChemicalObject 内容复制进 `reaction-graphs.json`；node 只保存 `chemical_object_ids`。
- [x] 未把 ObjectPaletteItem 或 NetworkPreview 写入 `workspaces.json`。
- [x] 未新增 stoichiometry、reaction side、auto layout、auto path search 或化学合理性判断字段。
- [x] 未持久化 ImportBatch、ParsePreview、ExportArtifact index 或 EnergyProfile 新 schema。
- [x] 未新增 CLI/Web/desktop command、browser storage adapter、cloud adapter、project bundle、migration、增量保存、并发锁或冲突合并。
- [x] 未改变 EnergyProfileEngine 的 profile 计算规则。

**关键决策落地**：

- [x] ReactionGraph 是持久化的唯一 graph 真相；workspace section 只引用 graph_id，不复制 nodes/edges/paths。证据：`rxnflow/graph_workspace_codec.py:260`、`tests/test_reaction_graph_workspace_persistence.py:182`。
- [x] Workspace 只保存不可从 graph 推导的画布状态；palette/preview 在加载后派生。证据：`rxnflow/graph_workspace_codec.py:510`。
- [x] graph/workspace codec 已从 ProjectContentStore 私有函数中独立出来。证据：`rxnflow/graph_workspace_codec.py:1`、`rxnflow/content_store.py:18`。
- [x] graph restore 不回放 GraphPatch；workspace restore 从 graph service list 读取已恢复 graph，不触发 patch 语义。证据：`rxnflow/graph.py:83`、`rxnflow/workspace.py:169`。
- [x] 引用损坏是 hard error，不静默丢弃 selection 或 active path。证据：`rxnflow/graph_workspace_codec.py:614`、`rxnflow/workspace.py:460`。
- [x] 实际 JSON 字段沿用 snake_case。证据：`rxnflow/graph_workspace_codec.py:260`、`rxnflow/graph_workspace_codec.py:312`。

**编排层变化核对**：

- [x] save workflow：从 graph/workspace service 或 caller snapshot 获取 tuple，经 codec 校验后写入 section。
- [x] load workflow：先加载 ChemicalObject，再校验 ReactionGraph，最后校验 Workspace。
- [x] graph restore workflow：直接恢复 graph map，保留 graph id/path id，不调用 create_graph 或 apply_patch。
- [x] workspace restore workflow：基于已恢复 graph service 和 loaded objects 重建 workspace state，保留 selection、viewport、active_path_id。

**跨层纪律核对**：

- [x] 错误语义：section / restore 错误均返回 `Result` error，不抛异常。
- [x] 幂等性：重复 save checksum/path 稳定；重复 restore 不追加重复 graph/workspace。
- [x] 顺序性：load 顺序为 ChemicalObject → ReactionGraph → Workspace。
- [x] 来源边界：graph node 只保存 ChemicalObject id，不读取 raw file 或 import ledger。
- [x] UI 状态边界：selection/viewport/active_path 属于 workspace，不写入 ReactionGraph。
- [x] 扩展点：后续 EnergyProfile 持久化可基于已恢复 graph/path 做引用校验；Platform Shell restore 可按 snapshot → service restore 接线。

**挂载点反向核对（可卸载性）**：

- [x] 挂载点 M1：Graph / Workspace section codec。证据：`rxnflow/graph_workspace_codec.py:25`、`rxnflow/graph_workspace_codec.py:99`。
- [x] 挂载点 M2：ProjectContentStore `reaction_graphs` / `workspaces` sections。证据：`rxnflow/content_store.py:438`、`rxnflow/content_store.py:447`。
- [x] 挂载点 M3：ReactionGraphService public API。证据：`rxnflow/graph.py:72`、`rxnflow/graph.py:83`。
- [x] 挂载点 M4：GraphEditorWorkspaceService public API。证据：`rxnflow/workspace.py:147`、`rxnflow/workspace.py:157`。
- [x] 挂载点 M5：derived snapshot builder。证据：`rxnflow/graph_workspace_codec.py:510`。
- [x] 反向 grep：本 feature 的代码引用集中在 `graph_workspace_codec.py`、`content_store.py`、`graph.py`、`workspace.py` 和新增测试，均落在挂载点清单内。
- [x] 拔除沙盘推演：删除 `graph_workspace_codec.py`、回退 ProjectContentStore codec 接入、移除 graph/workspace service list/restore、移除 WorkspaceSnapshot.updated_at 和新增测试即可卸载本 feature；parser/import/energy/export 无业务依赖残留。

结论：行为与决策与 design 一致。

## 3. 验收场景核对

- [x] S1 保存含多个 nodes/edges/paths 的 ReactionGraph，`reaction-graphs.json` 保留关键 graph 字段。证据：`tests/test_reaction_graph_workspace_persistence.py:37`、`tests/test_reaction_graph_workspace_persistence.py:473`。
- [x] S2 加载上述 snapshot 后 `ProjectContentSnapshot.reaction_graphs` 与保存前关键字段一致。证据：`tests/test_reaction_graph_workspace_persistence.py:473`。
- [x] S3 graph node 引用已加载 ChemicalObject id 时 load 成功；缺失 id 返回 error。证据：`tests/test_reaction_graph_workspace_persistence.py:57`。
- [x] S4 species / transition_state node 缺少 `chemical_object_ids` 返回 `graph_invalid`。证据：`tests/test_reaction_graph_workspace_persistence.py:57`。
- [x] S5 edge 引用缺失 from_node / to_node 返回 structured error。证据：`tests/test_reaction_graph_workspace_persistence.py:57`。
- [x] S6 path 为空或引用缺失 node 返回 structured error。证据：`tests/test_reaction_graph_workspace_persistence.py:57`。
- [x] S7 重复 graph/node/edge/path id 返回 `invalid_input`。证据：`tests/test_reaction_graph_workspace_persistence.py:57`。
- [x] S8 `workspaces.json` 只保存 workspace_id、project_id、graph_id、selection、viewport、active_path_id、updated_at。证据：`tests/test_reaction_graph_workspace_persistence.py:182`。
- [x] S9 加载 workspace section 后 palette 和 preview 为派生数据。证据：`tests/test_reaction_graph_workspace_persistence.py:182`。
- [x] S10 workspace graph_id 引用缺失 graph 返回 `invalid_input`。证据：`tests/test_reaction_graph_workspace_persistence.py:218`。
- [x] S11 workspace selection 引用缺失 node/edge/path 返回 `invalid_input`。证据：`tests/test_reaction_graph_workspace_persistence.py:218`。
- [x] S12 workspace active_path_id 引用缺失 path 返回 `invalid_input`。证据：`tests/test_reaction_graph_workspace_persistence.py:218`。
- [x] S13 viewport zoom 小于等于 0 或不可转 number 返回 `invalid_input`。证据：`tests/test_reaction_graph_workspace_persistence.py:218`。
- [x] S14 重复 workspace_id 返回 `invalid_input`。证据：`tests/test_reaction_graph_workspace_persistence.py:218`。
- [x] S15 ReactionGraphService.list_graphs 返回项目 graph，未知项目返回空 tuple。证据：`tests/test_reaction_graph_workspace_persistence.py:322`。
- [x] S16 ReactionGraphService.restore_graphs 后新 service 可 list_paths 并继续 apply_patch。证据：`tests/test_reaction_graph_workspace_persistence.py:322`。
- [x] S17 GraphEditorWorkspaceService.list_workspaces 返回项目 snapshots，未知项目返回空 tuple。证据：`tests/test_reaction_graph_workspace_persistence.py:380`。
- [x] S18 GraphEditorWorkspaceService.restore_workspaces 后可 snapshot，selection、viewport、active_path_id 保留。证据：`tests/test_reaction_graph_workspace_persistence.py:380`。
- [x] S19 重复 save 时 reaction-graphs/workspaces section checksum 稳定，index path/kind 不变。证据：`tests/test_project_content_store_v1.py:118` 和 `tests/test_reaction_graph_workspace_persistence.py:473`。
- [x] S20 save/load 不修改 manifest、不新增 ProjectResource、不读 inputs/raw。证据：`tests/test_reaction_graph_workspace_persistence.py:473`。
- [x] S21 不调用 ParserRegistry、ImportRegistryWorkflow.confirm_import、EnergyProfileEngine 或 ReportExportService。证据：`tests/test_reaction_graph_workspace_persistence.py:520`。
- [x] S22 现有全量测试继续通过：`python3 -m unittest discover` 通过，127 tests OK。

前端改动：本 feature 无 UI / 浏览器改动，不需要浏览器肉眼验证。

执行过的验证命令：

- `python3 -m unittest tests.test_reaction_graph_workspace_persistence`：10 tests OK
- `python3 -m unittest tests.test_project_content_store_v1`：4 tests OK
- `python3 -m unittest tests.test_chemical_object_persistence`：4 tests OK
- `python3 -m unittest tests.test_graph_editor_workspace`：14 tests OK
- `python3 -m unittest tests.test_reaction_graph_protocol`：12 tests OK
- `python3 -m unittest tests.test_platform_shell_baseline`：6 tests OK
- `python3 -m unittest discover`：127 tests OK
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-06-reaction-graph-workspace-persistence/reaction-graph-workspace-persistence-checklist.yaml --yaml-only`：passed
- `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml --yaml-only`：passed

## 4. 术语一致性

- Reaction Graph Persistence：代码以 `reaction_graphs_section_*` 和 `reaction-graphs-v1` 表达，没有另起平行 graph repository。
- Stored ReactionGraph：代码仍用 `ReactionGraph` dataclass 表达领域对象，JSON section 是持久化表达。
- Workspace Persistence / Stored Workspace：代码以 `workspaces_section_*` 和 `WorkspaceSnapshot` 表达，section 只保存 workspace-only 状态。
- Graph Reference Validation：代码校验 object/node/edge/path 引用。证据：`rxnflow/graph_workspace_codec.py:614`。
- Workspace Reference Validation：代码校验 graph/selection/active path/viewport。证据：`rxnflow/graph_workspace_codec.py:614`、`rxnflow/workspace.py:460`。
- `reaction-graphs-v1` / `workspaces-v1`：schema version 常量与 JSON section 一致。

防冲突核对：

- [x] 未把 GraphPatch history 命名或实现为持久化 graph state。
- [x] 未把 ObjectPaletteItem / NetworkPreview 写入 Stored Workspace。
- [x] 未把 ReactionGraph / Workspace section 写入 ProjectManifest。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：已补 Project Content 当前覆盖、Graph / Workspace Section Codec、WorkspaceSnapshot updated_at、graph/workspace restore 决策和 section 错误语义。
- [x] `codestable/architecture/core-platform.md`：已补 ReactionGraphService list/restore、GraphEditorWorkspaceService list/restore、`rxnflow.graph_workspace_codec`、`reaction-graphs-v1` / `workspaces-v1` 字段、错误语义、引用校验和范围边界。
- [x] AGENTS.md：不更新。理由：本 feature 不新增通用命令、环境依赖或每个后续 feature 都会重复踩的工作流约束。

结论：没读过 design 的后续协作者只看 architecture，即可知道系统已支持 ReactionGraph / WorkspaceSnapshot 的长期 sections、service restore 入口和引用校验边界。

## 6. requirement 回写

- [x] 方案 frontmatter `requirement: null`。
- [x] 本 feature 是项目内容持久化的内部领域基础能力，没有新增用户/agent 直接命令、UI 或端侧打开项目流程。
- [x] 本次不新建 requirement。后续 `platform-shell-state-restore` 或真正的 project open/save 用户可见流程落地时，应 backfill 或更新对应 requirement。

结论：无 requirement 回写。

## 7. roadmap 回写

- [x] 方案 frontmatter 有 `roadmap: rxnflow-project-persistence` 和 `roadmap_item: reaction-graph-workspace-persistence`。
- [x] `codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml` 中该 item 已从 `in-progress` 改为 `done`，feature 保持 `2026-05-06-reaction-graph-workspace-persistence`。
- [x] `codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-roadmap.md` 第 5 节子 feature 清单已同步为 `状态：done` 和对应 feature。
- [x] roadmap items YAML 已通过校验。

结论：roadmap 已回写。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的内容。

理由：没有新增安装命令、长期环境约束、跨 feature 必踩坑或端侧启动步骤。现有 AGENTS.md 的 unittest 和 YAML 校验命令仍覆盖本次验证。

## 9. 遗留

后续优化点：

- 后续 `energy-profile-persistence` 需要把 EnergyProfile 从基础 snapshot 提升为长期 schema，并校验 graph/path 引用。
- 后续 `import-ledger-persistence` 需要保存 ParsePreview / ImportBatch，并与 ChemicalObject.source_file_id 建立恢复语义。
- 后续 `project-content-validation-migration` 需要集中校验跨 section 引用和 schema migration。
- 后续 `platform-shell-state-restore` 需要把 ProjectContentSnapshot 接入真实 project.open/save_content 命令。

已知限制：

- `reaction-graphs-v1` 不保存 GraphPatch history、undo/redo 或协同编辑 operation log。
- `workspaces-v1` 不保存 palette/preview 缓存；加载时从当前对象和图谱派生。
- 当前不新增 UI、CLI/Web/desktop command、browser storage adapter、cloud adapter、project bundle 或 migration。
- 当前不新增化学计量系数、reaction side、auto layout、auto path search 或化学合理性判断。

实现阶段顺手发现：

- `WorkspaceSnapshot.updated_at` 已作为可选字段落地；未来真实更新时间策略仍需要系统时钟 adapter 或调用方传入策略，当前保持 deterministic 测试风格。
