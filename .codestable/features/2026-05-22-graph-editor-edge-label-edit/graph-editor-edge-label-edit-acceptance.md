# graph-editor-edge-label-edit 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：`.codestable/features/2026-05-22-graph-editor-edge-label-edit/graph-editor-edge-label-edit-design.md`

实现提交：

- `adabc2f Implement edge label core update`
- `bf05e19 Add edge label shell command`
- `14abacb Implement edge label draft UI`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `GraphEditorWorkspaceService.update_edge(project_id, workspace_id, edge_id, label, metadata=None)`：代码实际落点在 `rxnflow/workspace.py`，只组装 `GraphPatch("update_edge")` 的 `label` / 可选 `metadata` patch；测试覆盖 set / clear / unknown edge / endpoint unchanged。
- [x] `WorkspaceUpdateEdgeArgs = { session_id, edge_id, label?, metadata? }`：前端 DTO 已把 `workspace.update_edge` 纳入 command union，Platform Shell 和 fixture transport 都支持该 command。
- [x] `EdgeLabelDraft = { edgeId, label, dirty }`：Web 侧新增 `edgeLabelDraftState.ts`，由 selected edge projection 初始化，dirty 只用于 UI 表单状态。

**名词层“现状 → 变化”逐项核对**：

- [x] `ReactionEdge.label` 已存在，本功能没有新增 graph schema；`reaction-graphs-v1` 继续保存 edge label。
- [x] `GraphEditorWorkspaceService` 由无 edge label update method 变为暴露 label-only `update_edge`，并限制不传 `from_node` / `to_node`。
- [x] Platform Shell 新增 `workspace.update_edge` handler，负责 edge id、label、metadata 参数检查和 label normalization。
- [x] fixture transport 新增 `workspace.update_edge`，和真实 shell 保持 set / clear / missing edge / invalid label 行为对齐。
- [x] Graph Canvas 由只可选择/删除 edge，变为 selected edge 可显示 Edge Label Draft、Apply、Reset Label、Clear。

**流程图核对**：

- [x] User selects edge hitbox → `workspace.select(edge_ids=[edge_id])`：既有 GraphCanvas edge button selection 继续沿用。
- [x] ShellResponse projects selected edge → Web initializes draft：`WorkbenchShell` 从 workspace projection reconcile `edgeLabelDraft`。
- [x] User edits draft → Apply：GraphCanvas 只回调 draft change；Apply 才触发 `workspace.update_edge`。
- [x] Platform Shell → GraphEditorWorkspaceService → ReactionGraphService：真实 shell handler 调用 workspace service，workspace service 继续通过 `GraphPatch("update_edge")` 落到 ReactionGraphService。
- [x] Updated workspace projection refreshes UI：`applyWorkspaceResponse` 后从 response workspace 重建 clean draft，SVG label / hitbox / detail 都来自 projection。

结论：接口契约与方案一致，无需修正设计或代码。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 选中 edge 后在 Network Preview 侧区显示 Edge Label Draft：组件测试和浏览器验证通过。
- [x] 修改 label 只改 UI draft，不立即修改 `WorkbenchDomainState.workspace.graph.edges`：组件测试断言 Apply 前可见 graph label 未变化且未发送 `workspace.update_edge`。
- [x] Apply 后发送 `workspace.update_edge(session_id, edge_id, label)`：组件测试捕获 payload；浏览器验证 Apply 后 label 可见。
- [x] 空字符串或全空白 label 归一化为 `null`：Platform Shell / fixture tests 覆盖 whitespace clear，Web Clear 发送 `label: null`。
- [x] 成功后只用 ShellResponse workspace projection 刷新：GraphCanvas 不直接 patch domain graph；`WorkbenchShell` 走 `applyWorkspaceResponse`。
- [x] 命令不改变 `from_node` / `to_node`，不新增或删除 edge/path/node：core test 明确断言 endpoint 保持；scope grep 未发现 update_edge UI/shell 接收 endpoint 参数。
- [x] error target：missing edge id → `invalid_input target=edge_id`；invalid label → `invalid_input target=edge_label`；unknown edge → `graph_invalid target=edge_id`。

**明确不做逐项核对**：

- [x] 未实现 edge endpoint 重连、edge direction 反转、edge type、结构化 reaction condition 或复杂 metadata 编辑。
- [x] 未改变 `workspace.connect`、`workspace.remove`、`workspace.set_path` 或 node/path delete 语义。
- [x] 未新增 GraphPatch op、Project Content schema、Browser Project Repository write、localStorage persistence、autosave 或第三方图谱库。
- [x] 未让 GraphCanvas 本地 patch edge label；可见 label 来自 ShellResponse projection。
- [x] 未更新或删除 EnergyProfile，未重新计算能量，未改变 Report Export。
- [x] 未新增自由绘线手势；该能力仍留给 `graph-editor-free-edge-drawing`。

**关键决策落地**：

- [x] D1 新增 `workspace.update_edge`：真实 shell、fixture transport 和 Web DTO 均新增同名 command。
- [x] D2 workspace 层限制端点：workspace service 的 patch 只包含 label / metadata，不把 endpoint patch 暴露到 shell command。
- [x] D3 label 清空用 `null`：shell/fixture/Web 全部支持 null clear，空白字符串归一化为 null。
- [x] D4 Edge Label Draft 是 UI-only：draft helper 不进入 ShellResponse、Project Content、Browser Project Repository 或 localStorage。
- [x] D5 label 可见性轻量处理：当前只在 SVG edge label、edge hitbox accessible name 和 selected edge detail 中显示；未做 label collision avoidance。

**编排层“现状 → 变化”逐项核对**：

- [x] Edge selection 保持既有 workspace selection flow。
- [x] 新增 draft 初始化/reconcile，edge 删除或 selection 切换时清理 stale draft。
- [x] GraphCanvas 增加 Edge Label Editor 表单，包含 Apply、Reset Label、Clear。
- [x] WorkbenchShell 增加 apply orchestration，成功后以 ShellResponse workspace projection 更新 domain state。
- [x] Platform Shell 与 fixture transport 均新增 update edge adapter。

**跨层纪律核对**：

- [x] Command authority：GraphCanvas 不直接 mutate graph。
- [x] Error semantics：shell 和 fixture error code/target 对齐。
- [x] Endpoint integrity：`workspace.update_edge` 不接受 endpoint 参数。
- [x] Persistence boundary：label 更新不自动保存；显式 Save Bridge Session 后由既有 content bridge 保存已投影 graph state。
- [x] Isolation：未调用 EnergyProfileEngine、ReportExportService、Browser Project Repository、Project Content writer 或 import/object registry。

**挂载点反向核对（可卸载性）**：

- [x] Core workspace edge update contract：`rxnflow/workspace.py` 与 `tests/test_graph_editor_workspace.py`。
- [x] Platform Shell command adapter：`rxnflow/platform.py` 与 `tests/test_platform_shell_baseline.py`。
- [x] Fixture transport：`web/src/shell/fixtureTransport.ts`、`web/src/shell/types.ts` 与 `web/src/shell/ShellClient.test.ts`。
- [x] Web draft orchestration：`web/src/app/edgeLabelDraftState.ts`、`WorkbenchShell.tsx`、`GraphCanvas.tsx`、`messages.ts`、`workbench.css` 与 `WorkbenchShell.test.tsx`。
- [x] 反向 grep：`workspace.update_edge`、`edgeLabelDraft`、`Edge Label` 命中均落在上述挂载点和测试/文档内。
- [x] 拔除沙盘推演：移除上述挂载点后会回到 edge 只能选择/删除的状态；不需要清理 schema、repository、localStorage、energy/export 代码。

结论：行为、决策和挂载点与方案一致。

## 3. 验收场景核对

- [x] **S1**：`GraphEditorWorkspaceService.update_edge(edge_id, label="TS search")` 更新 edge label 并保持 endpoints。
  - 证据来源：`python3 -m unittest tests.test_graph_editor_workspace`
  - 结果：通过。
- [x] **S2**：`update_edge(edge_id, label=None)` 清空 edge label。
  - 证据来源：core unit test。
  - 结果：通过。
- [x] **S3**：unknown edge id 返回 `graph_invalid target=edge_id`，state 不变化。
  - 证据来源：core unit test、platform shell test、fixture ShellClient test。
  - 结果：通过。
- [x] **S4-S8**：Platform Shell 与 fixture transport 支持 set / clear / missing edge id / invalid label，并返回 `command=workspace.update_edge` workspace projection。
  - 证据来源：`python3 -m unittest tests.test_platform_shell_baseline tests.test_graph_editor_workspace`、`cd web && npm run test -- --run ShellClient.test.ts`。
  - 结果：通过。
- [x] **S9-S13**：Web Edge Label Draft 初始化、draft-before-apply、Apply projection refresh、Clear、stale draft prune。
  - 证据来源：`cd web && npm run test -- --run WorkbenchShell.test.tsx`。
  - 结果：通过。
- [x] **S14-S15**：不新增 schema/repository/localStorage/autosave/energy/report 行为，不改变既有 workspace command 语义。
  - 证据来源：scope grep + code review。
  - 结果：通过。
- [x] **S16**：`python3 -m unittest discover`。
  - 证据来源：本轮验证。
  - 结果：304 tests passed。
- [x] **S17**：`cd web && npm run test -- --run`。
  - 证据来源：本轮验证。
  - 结果：22 files / 198 tests passed。
- [x] **S18**：`cd web && npm run build`。
  - 证据来源：本轮验证。
  - 结果：通过。
- [x] **S19**：浏览器验证页面非空白、无 framework overlay、console clean；edge label edit 桌面/窄屏布局无明显重叠或水平溢出。
  - 证据来源：Browser 插件连接 `http://127.0.0.1:5173/`。
  - 结果：通过。验证流为 Fixture Run → 选择 `Edge Object A to Object B` → 输入 `TS search` → Apply 前 SVG label 不出现 → Apply 后 label 出现 → Clear + Apply 后 label 移除；fresh console error 为空，窄屏按钮单列可用。

## 4. 术语一致性

- `workspace.update_edge`：命中 shell DTO、fixture transport、Platform Shell、测试、设计/验收/架构文档，语义一致。
- `GraphEditorWorkspaceService.update_edge`：只用于 workspace label-only contract，未与 ReactionGraphService 的 generic `GraphPatch("update_edge")` 混淆。
- `Edge Label Draft` / `edgeLabelDraft`：只表示 Web UI-only 草稿，不进入 Project Content、Browser Project Repository 或 ShellResponse。
- `Label Normalization`：Platform Shell、fixture transport 和 Web submit 均把 empty/blank clear 为 null。
- `Endpoint Integrity`：代码和文档均表述为不修改 from_node/to_node；未发现把 endpoint reconnect 混入本 feature 的引用。
- 防冲突 grep：未新增 `workspace.reconnect_edge`、未新增 GraphPatch op、未新增 localStorage key 或 autosave 入口。

结论：术语一致，无需修正。

## 5. 架构归并

- [x] `.codestable/architecture/core-platform.md`：已记录 `GraphEditorWorkspaceService.update_edge`、Platform Shell `workspace.update_edge`、label normalization、endpoint integrity、错误语义和 energy/export 隔离边界。
- [x] `.codestable/architecture/web-workbench.md`：已记录 Graph Edge Label Editing、Edge Label Draft UI-only state、Apply/Reset/Clear 编排、projection authority、持久化边界、QA 覆盖和当前仍不做 endpoint reconnect / free drawing / autosave。
- [x] `AGENTS.md`：本 feature 未暴露新的全局工作流约束；已有 Web 预览和 UI 验证要求足够。

归并后，未读过本 design 的人可以从 architecture 直接看到：系统现在有 selected edge label 编辑能力，core/shell/Web 的边界分别在哪里，以及它不等于端点重连。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已更新用户故事：用户可选中已有 edge 编辑 label，用于记录反应步骤、条件、催化剂或分叉说明。
- [x] “怎么解决”已补入 Edge Label Draft、`workspace.update_edge(edge_id, label)`、空白 label 归一化为 `null`、projection authority、显式 Save Bridge Session 后持久化 edge label。
- [x] “边界”已更新：Graph Canvas 现在支持 selected edge label draft；仍不支持 endpoint reconnect、free edge drawing、结构化反应条件编辑、autosave 或自动重算能量/报告。

结论：requirement 已回写。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-items.yaml` 中 `graph-editor-edge-label-edit` 已由 `in-progress` 改为 `done`，feature 保持 `2026-05-22-graph-editor-edge-label-edit`。
- [x] `.codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-roadmap.md` 第 5 节状态已同步为 `done`，并补充实现备注。
- [x] roadmap 第 6 / 7 节已同步：下一项可推进 `graph-editor-free-edge-drawing`，并复用本 feature 稳定后的 update edge 语义。

结论：roadmap 已回写。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 没有暴露新的环境、端口、依赖安装或工作流坑。已有 `AGENTS.md` 中“前端视觉/画布交互必须浏览器验证”和“Web 工作台预览必须从 `web/` 跑 `npm run dev`”规则继续适用。

## 9. 遗留

- 后续优化点：`graph-editor-free-edge-drawing` 可复用 `workspace.update_edge` 的 label/update 语义，但直接连线手势仍需单独 feature design。
- 后续优化点：edge label collision avoidance、edge rerouting、结构化 reaction condition 表单、endpoint reconnect 和 label 样式增强均未实现。
- 已知限制：edge label update 不自动保存项目；用户仍需显式 Save Bridge Session 才把已投影 graph state 写入 Browser Project Repository。
- 已知限制：metadata 目前只在 shell/core contract 中允许 JSON object 透传，Web UI 不提供 metadata 编辑。
- 顺手发现：in-app Browser 自动化有时会暴露旧 HMR log；使用 fresh timestamp 过滤后本功能验证无新 console error。
