# graph-editor-workspace 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-05
> 关联方案 doc：`.codestable/features/2026-05-05-graph-editor-workspace/graph-editor-workspace-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `GraphEditorWorkspaceService.open_workspace(project_id, label=...)` 可创建空 ReactionGraph，并返回默认 viewport、空 selection、空 preview。证据：`tests/test_graph_editor_workspace.py::test_open_workspace_creates_empty_graph_snapshot_and_defaults`。
- [x] `GraphEditorWorkspaceService.add_node(..., NodePlacement(...))` 可创建带 object id、position 和 metadata 的 species node。证据：`test_add_node_preserves_object_position_and_metadata`。
- [x] `connect_nodes`、`set_active_path` 和 `snapshot` 能同步返回包含 edge/path/active path 的 NetworkPreview。证据：`test_connect_nodes_and_set_active_path_update_preview`。
- [x] `select` 和 `set_viewport` 只改 workspace state，不改变 graph。证据：`test_selection_and_viewport_do_not_change_graph`。

**名词层"现状 → 变化"逐项核对**：

- [x] `CanvasViewport`、`WorkspaceSelection`、`ObjectPaletteItem`、`NetworkPreview`、`WorkspaceSnapshot`、`NodePlacement` 均在 `rxnflow/workspace.py` 落地。
- [x] `WorkspaceSnapshot` 包含 `workspace_id`、`project_id`、`graph`、`palette`、`selection`、`viewport`、`active_path_id` 和 `preview`。
- [x] `ObjectPaletteItem` 包含 `object_id`、`label`、`formula`、`charge`、`spin_multiplicity`、`method`、`source_file_id` 和 `energy_keys`。
- [x] `GraphEditorWorkspaceService` 提供 `open_workspace`、`add_node`、`connect_nodes`、`set_active_path`、`apply_patches`、`select`、`set_viewport` 和 `snapshot`。

**流程图核对**：

- [x] open workspace workflow：创建或绑定 graph → 收集 Object Palette → 派生 NetworkPreview → 存储内存 WorkspaceState → 返回 WorkspaceSnapshot。
- [x] graph edit workflow：workspace 高层动作 → GraphPatch[] → ReactionGraphService.apply_patch → 成功后更新 workspace graph/active path → 返回 snapshot。
- [x] workspace-only workflow：selection / viewport 只改 workspace state，不触发 graph patch。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 可打开或创建围绕 ReactionGraph 的编辑 workspace。
- [x] 可从已登记 ChemicalObject 生成 Object Palette。
- [x] 可通过 workspace API 添加对象节点、annotation/group 节点、连接节点、设置路径和应用原始 GraphPatch。
- [x] selection、viewport、active path 等画布编辑状态保存在 workspace 层。
- [x] NetworkPreview 可供平台壳层读取 nodes、edges、paths、active path 和 diagnostics。
- [x] ReactionGraphService、ImportRegistryWorkflow 和 EnergyProfileEngine 边界保持清晰。

**明确不做逐项核对**：

- [x] 未新增真实 UI 组件、Web route、CLI 命令、桌面窗口、canvas 渲染或拖拽事件代码。
- [x] 未选择 React、Next.js、Electron、Tauri、SwiftUI 或其它端侧框架。
- [x] 未持久化 Workspace Snapshot、Viewport、Selection 或 ReactionGraph 到 Project Manifest。
- [x] 未导入 raw file、未调用 ParserRegistry、未确认 ImportItem。
- [x] 未调用 EnergyProfileEngine，未绘制能量曲线，也未生成 EnergyProfile。
- [x] 未生成 ExportArtifact、PNG、CDXML 或 Excel。
- [x] 未新增自动布局算法、自动反应路径搜索、化学合理性判断或计量系数字段。

**关键决策落地**：

- [x] Workspace 是 GraphPatch 的壳层，不是平行 graph 实现；graph 结构变化只通过 ReactionGraphService.apply_patch。
- [x] ReactionNode.position 保存节点坐标；CanvasViewport、WorkspaceSelection 和 active_path_id 保存在 workspace state。
- [x] Object Palette 只暴露已登记对象；needs_confirmation / failed item 不可直接建 graph node。
- [x] Network Preview 是结构化快照，不是渲染层或能量曲线。
- [x] 能量曲线暂不进入 workspace。
- [x] Workspace 当前为内存状态。

## 3. 验收场景核对

- [x] **S1**：不提供 graph id 时 `open_workspace` 创建空 ReactionGraph，返回默认 viewport、空 selection、空 preview。证据：`test_open_workspace_creates_empty_graph_snapshot_and_defaults`。
- [x] **S2**：提供已有 graph id 时绑定既有 graph，不重复创建 graph。证据：`test_open_workspace_binds_existing_graph_without_creating_duplicate`。
- [x] **S3/S4**：confirmed import object 出现在 Object Palette，needs_confirmation / failed item 不出现。证据：`test_palette_uses_confirmed_import_objects_and_filters_pending_or_failed_items`。
- [x] **S5**：`add_node` 使用 palette 中 object id 时创建 species node，并保留 label、object ids、position、metadata。证据：`test_add_node_preserves_object_position_and_metadata`。
- [x] **S6**：annotation/group 不传 object id 时成功。证据：`test_add_annotation_and_group_nodes_without_objects`。
- [x] **S7**：不存在 object id 返回 `graph_invalid`，workspace graph 不改变。证据：`test_add_node_with_missing_object_returns_graph_invalid_without_state_change`。
- [x] **S8/S10**：连接节点、设置 active path 后 graph 和 preview 同步更新。证据：`test_connect_nodes_and_set_active_path_update_preview`。
- [x] **S9**：connect 指向 missing node 返回 `graph_invalid`，workspace graph 不改变。证据：`test_connect_missing_node_returns_graph_invalid_without_state_change`。
- [x] **S11**：多次 set_active_path 不同 path 时 graph 保存多条 paths，preview 可列出分叉路径。证据：`test_multiple_active_paths_are_kept_for_branch_preview`。
- [x] **S12**：select / set_viewport 只更新 workspace state，不改变 graph。证据：`test_selection_and_viewport_do_not_change_graph`。
- [x] **S13**：删除节点后读取 snapshot，preview 不再包含被级联删除的 edge/path，diagnostics 更新。证据：`test_remove_node_updates_preview_after_graph_service_cascade`。
- [x] **S14**：多个孤立节点返回 disconnected_node_ids。证据：`test_network_preview_reports_disconnected_nodes`。
- [x] **S15**：fixture、ReactionGraphService、ImportRegistryWorkflow 和 EnergyProfileEngine 行为不变。证据：`test_existing_core_services_still_pass` 和 `python3 -m unittest discover`。

本 feature 无前端改动，不包含真实画布、图表或报告预览，因此不需要浏览器验证。

## 4. 术语一致性

- Graph Editor Workspace：代码入口为 `GraphEditorWorkspaceService`，含义和方案一致。
- Workspace Snapshot：代码为 `WorkspaceSnapshot`，包含 graph、palette、selection、viewport、active path 和 preview。
- Object Palette：代码为 `ObjectPaletteItem`，只暴露 ChemicalObject 引用和对象摘要字段。
- Canvas Viewport / Workspace Selection：代码为 `CanvasViewport` 和 `WorkspaceSelection`，均为 workspace-only state。
- Network Preview：代码为 `NetworkPreview`，包含 graph structure 和 disconnected diagnostics，不包含渲染或能量数据。
- Active Path：代码字段为 `active_path_id`，path 本体仍在 `ReactionGraph.paths`。
- 防冲突：范围守护测试确认 `rxnflow/workspace.py` 未引入 ParserRegistry、ProjectStore.add_raw_file、ImportRegistryWorkflow.import_files / confirm_import、EnergyProfileEngine、ExportArtifact、PNG、CDXML、Excel、FastAPI、click、Next.js、Electron、Tauri、SwiftUI、Three.js 等方案外依赖。由于 `ReactionNode` 包含 `React` 子串，范围守护检查具体框架名而不是裸 `React` 字符串。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已补 Graph Editor Workspace、Workspace Snapshot、Object Palette、Canvas Viewport、Workspace Selection、Network Preview、Active Path 术语，并写入 workspace 与 GraphPatch、ReactionGraphService、EnergyProfileEngine 的边界。
- [x] `.codestable/architecture/core-platform.md`：已把当前能力从七类扩展为八类，新增 GraphEditorWorkspaceService 模块职责、workspace 数据状态协议、错误语义和约束边界。
- [x] 架构归并后，未读过 design 的读者可以从 architecture 了解 workspace 的输入、输出、状态边界、preview 语义和明确不做。

## 6. requirement 回写

- [x] 方案 frontmatter `requirement: null` 保持不变。
- [x] 本 feature 仍是核心服务/API 能力，没有真实 Web/CLI/desktop 用户入口；用户可见的图谱编辑需求应在后续 platform shell 或真实 graph editor UI 落地时 backfill requirement。

## 7. roadmap 回写

- [x] 方案 frontmatter `roadmap: rxnflow-core-platform`、`roadmap_item: graph-editor-workspace`。
- [x] `.codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-items.yaml` 中该条已从 `in-progress` 改为 `done`，feature 保持 `2026-05-05-graph-editor-workspace`。
- [x] `.codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-roadmap.md` 子 feature 清单已同步为 `done` 并填写对应 feature。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露新的环境命令、远端执行方式、浏览器服务步骤或需要长期固化的协作规则。

## 9. 遗留

- 真实 Web/桌面 graph editor、canvas 渲染、拖拽、缩放手势和端侧交互协议未实现。
- WorkspaceSnapshot、CanvasViewport、WorkspaceSelection、ReactionGraph 和 ChemicalObject 内容仍不持久化。
- Object Palette 当前来自调用方传入对象或 confirmed import batches；项目级对象列表和跨进程恢复待后续 project state 持久化。
- NetworkPreview 当前不做自动布局、路径几何排布、化学合理性判定或自动路径搜索。
- EnergyProfileEngine 和能量曲线暂未接入 workspace；path-energy 联动留给后续 graph energy panel 或 report/export feature。
- PNG、CDXML 和 Excel 导出仍留给 `report-export-baseline`。
