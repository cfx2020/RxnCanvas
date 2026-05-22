# graph-editor-path-delete 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：`codestable/features/2026-05-22-graph-editor-path-delete/graph-editor-path-delete-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：
- [x] `GraphEditorWorkspaceService.remove_items(project_id, workspace_id, node_ids=(), edge_ids=(), path_ids=())`（`rxnflow/workspace.py`）：实际已接受 `path_ids`，并交给 `_remove_item_ids` 生成 remove patches。
- [x] `WorkspaceRemoveArgs.path_ids?: string[]`（`rxnflow/platform.py`、`web/src/shell/fixtureTransport.ts`）：真实 Platform Shell 和 fixture transport 均解析 `path_ids`。
- [x] `RemoveGraphItemsRequest.pathIds`（`web/src/app/WorkbenchShell.tsx`、`web/src/app/GraphCanvas.tsx`）：Delete Selected payload 已包含 selected path ids，WorkbenchShell 转换为 shell args `path_ids`。

**名词层"现状 -> 变化"逐项核对**：
- [x] Workspace Remove Path Contract：复用 `workspace.remove`，未新增 `workspace.delete_path`。
- [x] Path Delete：删除 `ReactionGraph.paths` 中指定 path；单测和浏览器验证确认 nodes / edges 保留。
- [x] Selected Path Delete：Graph Canvas 选中 path 后 Delete Selected 可用，并发送 `workspace.remove(path_ids=[...])`。
- [x] Path Cascade Projection：active path、selection、PathList 和 Network Preview 均等待 ShellResponse workspace projection。

**流程图核对**：
- [x] `User selects path -> workspace.select(path_ids=[path_id])`：既有 PathList selection 仍通过 `workspace.select`。
- [x] `Delete Selected -> WorkbenchShell sends workspace.remove`：GraphCanvas 传入 pathIds，WorkbenchShell 发送 `path_ids`。
- [x] `Platform Shell -> GraphEditorWorkspaceService -> ReactionGraphService`：`workspace.remove` handler 调用 `remove_items(..., path_ids=...)`，最终复用 `GraphPatch("remove")`。
- [x] `Workspace snapshot prunes active_path_id and selection`：core / fixture tests 覆盖 active path 与 selection 修剪。

未发现需要修正的接口偏差。

## 2. 行为与决策核对

**需求摘要逐项验证**：
- [x] 选中 path 后可点击 Delete Selected 删除 path：WorkbenchShell component test 和浏览器验证通过。
- [x] Shell command 复用 `workspace.remove`：代码中未新增 `workspace.delete_path`。
- [x] 删除 path 不删除 node/edge：core test、component test 和浏览器验证均覆盖。
- [x] 删除 active path 后 active path 和 selection 由 projection 修剪：core workspace test 与 fixture transport test 覆盖。
- [x] unknown path 返回 `graph_invalid target=path_id`：core / platform shell / fixture tests 覆盖。
- [x] 空 selection 仍返回 `invalid_input target=selection`：既有 remove 空 selection 行为保留，checklist 已核对。

**明确不做逐项核对**：
- [x] 未新增 `workspace.delete_path`、GraphPatch op、Project Content schema、Browser Project Repository write、localStorage key、autosave 或第三方库。
- [x] 未删除 path 上的 nodes / edges，未做路径搜索、自动重连或能量 profile 删除。
- [x] 未新增 undo/redo/history、多选框选、键盘 Delete、批量管理菜单或确认弹窗。
- [x] 未修改 Path Order Draft reorder/apply 语义。
- [x] 未改变 report export、energy compute、object registry、import inbox 或 project bundle 行为。

**关键决策落地**：
- [x] D1 复用 `workspace.remove`：path ids 与 node/edge ids 共享统一 remove command。
- [x] D2 由 core projection 表达删除后状态：Web 不本地过滤 graph paths 或清空 active path。
- [x] D3 path delete 不碰 node/edge：显式测试与浏览器验证覆盖。
- [x] D4 Web 只提交 selection intent：GraphCanvas 只把 selection pathIds 交给 WorkbenchShell。
- [x] D5 不提前做键盘/多选：本次只扩展现有 Delete Selected button。

**编排层"现状 -> 变化"逐项核对**：
- [x] GraphCanvas `canRemoveSelection` 纳入 `selection.pathIds`。
- [x] Delete Selected payload 增加 `pathIds`。
- [x] WorkbenchShell remove guard 和 shell args 增加 `path_ids`。
- [x] Platform Shell `_run_workspace_remove` 读取 `path_ids`，空 selection 判断包含三类 ids。
- [x] Fixture transport 支持 `path_ids` missing 校验、path 删除和 projection 清理。

**跨层纪律核对**：
- [x] Command authority：GraphCanvas / WorkbenchShell 不直接 mutate `workspace.graph.paths`、`active_path_id` 或 selection。
- [x] Error semantics：unknown path 统一 `graph_invalid target=path_id`，空 selection 仍为 `invalid_input target=selection`。
- [x] Idempotence：删除已不存在 path 是 error；node cascade 已移除的 path 不造成重复 missing error。
- [x] Persistence boundary：path 删除不自动保存，长期落盘仍依赖显式 Save Bridge Session。
- [x] Isolation：未调用 EnergyProfileEngine、ReportExportService、Browser Project Repository、Project Content writer 或 import/object registry。

**挂载点反向核对（可卸载性）**：
- [x] 挂载点 M1 Core workspace：`GraphEditorWorkspaceService.remove_items` 和 `_remove_item_ids`。
- [x] 挂载点 M2 Platform Shell：`workspace.remove` args 解析和 error target。
- [x] 挂载点 M3 Fixture transport：fixture `workspace.remove` path id support。
- [x] 挂载点 M4 Web orchestration：`GraphCanvas` Delete Selected 和 `WorkbenchShell.removeGraphItems`。
- [x] 挂载点 M5 Tests：core workspace、platform shell、ShellClient fixture、WorkbenchShell component 和浏览器验证。
- [x] 反向核查：`rg "path_ids|pathIds|workspace.delete_path"` 命中均落在设计清单内，`workspace.delete_path` 无新增命中。
- [x] 拔除沙盘推演：移除 `path_ids` 参数解析、fixture 分支、GraphCanvas payload、WorkbenchShell args 和对应 tests 即可撤回本 feature；不涉及 schema、repository、energy/export 或第三方依赖残留。

## 3. 验收场景核对

- [x] **S1**：`remove_items(path_ids=(path_id,))` 删除 path 后 graph nodes 和 edges 保留。
  - 证据来源：`tests/test_graph_editor_workspace.py`。
  - 结果：通过。
- [x] **S2**：删除 active path 后 `active_path_id` 为 `None`，`selection.path_ids` 被修剪为空。
  - 证据来源：core workspace tests。
  - 结果：通过。
- [x] **S3**：删除非 active path 不改变仍存在 active path。
  - 证据来源：core workspace tests。
  - 结果：通过。
- [x] **S4**：同时传 node/edge/path ids 时，node cascade 与显式 path delete 不产生重复 missing error。
  - 证据来源：core workspace tests。
  - 结果：通过。
- [x] **S5**：空 remove args 返回 `invalid_input target=selection`。
  - 证据来源：platform shell / fixture remove tests。
  - 结果：通过。
- [x] **S6**：unknown path id 返回 `graph_invalid target=path_id`，state 不变化。
  - 证据来源：core / platform shell / fixture tests。
  - 结果：通过。
- [x] **S7**：Platform Shell `workspace.remove` 接受 `path_ids` 并返回 `command=workspace.remove` workspace projection。
  - 证据来源：`tests/test_platform_shell_baseline.py`。
  - 结果：通过。
- [x] **S8**：fixture transport `workspace.remove` 接受 `path_ids`，删除 path 后 path list / active path / selection projection 更新。
  - 证据来源：`web/src/shell/ShellClient.test.ts`。
  - 结果：通过。
- [x] **S9**：Web GraphCanvas 选中 path 后 Delete Selected 启用并发送 `workspace.remove(path_ids=[selected])`。
  - 证据来源：`web/src/app/WorkbenchShell.test.tsx`。
  - 结果：通过。
- [x] **S10**：Web 删除 selected path 后 PathList 不再显示该 path，Network Preview path count 更新，node/edge 仍显示。
  - 证据来源：浏览器 desktop / narrow 验证。
  - 结果：通过。
- [x] **S11**：Energy panel 不直接处理删除动作；active path 消失后的显示只来自 workspace projection。
  - 证据来源：scope review；未改 EnergyProfilePanel / energy command。
  - 结果：通过。
- [x] **S12-S13**：范围守护不新增 schema/persistence/autosave/third-party，不改变 node/edge delete 行为。
  - 证据来源：diff review + grep。
  - 结果：通过。
- [x] **S14**：`python3 -m unittest discover` 通过。
  - 证据来源：实现阶段验证记录，301 tests passed。
  - 结果：通过。
- [x] **S15**：`cd web && npm run test -- --run` 通过。
  - 证据来源：实现阶段验证记录，22 files / 196 tests passed。
  - 结果：通过。
- [x] **S16**：`cd web && npm run build` 通过。
  - 证据来源：实现阶段验证记录。
  - 结果：通过。
- [x] **S17**：浏览器验证页面非空白、无 overlay、console clean；selected path 删除后桌面/窄屏无重叠或水平溢出。
  - 证据来源：Vite `http://127.0.0.1:5176/` desktop 和 `390x840` narrow 验证记录。
  - 结果：通过。

## 4. 术语一致性

- `path_ids`：Python shell/core 和 fixture shell args 使用 snake_case，与 Shell Command args 一致。
- `pathIds`：Web component request 使用 camelCase，与既有 `nodeIds` / `edgeIds` request shape 一致。
- `Path Delete`：文档和代码均限定为删除 `ReactionPath`，不描述为删除路径上的 node/edge 或 energy profile。
- 防冲突：`workspace.delete_path` 无新增；未新增 `GraphPatch` op、Project Content schema、Browser Project Repository API、localStorage key 或第三方依赖。

## 5. 架构归并

- [x] `codestable/architecture/core-platform.md`：已记录 `workspace.remove` 支持 `path_ids`，`GraphEditorWorkspaceService.remove_items` 支持三类 ids，path delete 保留 nodes/edges，active path/selection 由 projection 修剪。
- [x] `codestable/architecture/web-workbench.md`：已记录 Graph Canvas Delete Selected 支持 selected path，Web 只发送 `workspace.remove(path_ids)` 并等待 ShellResponse；QA 条目补充 path delete test/browser evidence。
- [x] 架构总入口：本 feature 属于既有 Web Workbench / Core Platform 边界，不需要更新 `codestable/architecture/ARCHITECTURE.md`。
- [x] `AGENTS.md`：已有 Web dev server 和浏览器验证要求，本 feature 未暴露新的项目级硬约束。

## 6. requirement 回写

- [x] 对应 requirement：`web-workbench-shell`。
- [x] 已更新 `codestable/requirements/web-workbench-shell.md`：新增 selected path delete 用户故事；解决方案与边界说明 `workspace.remove(path_ids?)`、不删除 nodes/edges、不删除或重算 EnergyProfile、不自动保存。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-items.yaml`：`graph-editor-path-delete` 已从 `in-progress` 改为 `done`，feature 保持 `2026-05-22-graph-editor-path-delete`。
- [x] `codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-roadmap.md`：第 5 节对应条目已改为 done，并记录已落地 core/shell/fixture/Web path delete 链路。
- [x] checklist 与 roadmap items YAML 校验已通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新环境、工具或工作流约定。

## 9. 遗留

- 后续优化点：`graph-editor-multiselect-keyboard` 可复用 node/edge/path remove contract，把 keyboard Delete 和多选删除接到同一协议。
- 已知限制：当前不支持键盘 Delete、框选、多选管理菜单、undo/redo 或删除确认弹窗；path delete 不处理 EnergyProfile stale profile 的语义刷新。
- 实现阶段顺手发现：Energy panel 可能仍显示旧 profile 文本，这是既有 profile projection 行为，不属于 path delete 直接处理范围。
