# graph-editor-edge-path-editing 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：`.codestable/features/2026-05-21-graph-editor-edge-path-editing/graph-editor-edge-path-editing-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `WorkspaceRemoveArgs`：`session_id`、`node_ids?: string[]`、`edge_ids?: string[]` 已在 `rxnflow/platform.py`、`rxnflow/workspace.py`、`web/src/shell/types.ts` 和 `web/src/shell/fixtureTransport.ts` 落地。
- [x] `WorkspaceCommandData.command`：已包含 `"workspace.remove"`，fixture 和 Platform Shell response 均返回该 command。
- [x] `GraphPathOrderDraft`：`web/src/app/graphPathOrderDraft.ts` 提供 `createGraphPathOrderDraft`、`moveGraphPathDraftNode` 和 `graphPathDraftChanged`，只在 Web UI 层使用，不进入 Shell DTO。

**名词层“现状 -> 变化”逐项核对**：

- [x] `GraphEditorWorkspaceService.remove_items` 已新增，空 selection 返回 `invalid_input target=selection`，node remove 会过滤 incident edge 防止重复 remove，最终复用 `GraphPatch("remove")`。
- [x] `PlatformShellService` 已分发 `workspace.remove`，并把 `node_ids` / `edge_ids` 转为 tuple 后调用 workspace service。
- [x] Web fixture transport 已支持 `workspace.remove`，删除 node 时同步 cascade edges/path，删除 edge 时保留 nodes 并重新派生 disconnected diagnostics。
- [x] `GraphEditorInteractionState` 已新增 edge/path selection helpers，保持 node/edge/path 单类互斥选择。
- [x] `GraphCanvas` 已支持 edge 选择、Delete Selected、path 选择、Path Order Draft 上移/下移和 Apply。

**流程图核对**：

- [x] `User selects node or edge -> Delete Selected -> WorkbenchShell sends workspace.remove -> ShellResponse updates graph` 有代码落点：`GraphCanvas.tsx`、`WorkbenchShell.tsx`、`fixtureTransport.ts`、`platform.py`、`workspace.py`。
- [x] `User selects path -> Path Order Draft -> Apply Path Order -> workspace.set_path -> ShellResponse updates path list` 有代码落点：`GraphCanvas.tsx`、`WorkbenchShell.tsx`、`graphPathOrderDraft.ts`、fixture `workspace.set_path`。

验收中发现 edge hit target 使用透明 SVG line 时 Playwright/ARIA 判为 hidden；已改为边线中点的真实 HTML button，SVG 只负责视觉线条，修复后 Browser fallback 验证通过。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] Edge line 可选择，选中状态可见，并进入 `selection.edgeIds`：component test 和 Playwright 验证通过。
- [x] Delete Selected 删除 node 或 edge 时 Web 只发送 `workspace.remove`，不本地推断 cascade：`WorkbenchShell.removeGraphItems` 只发 command 并调用 `applyWorkspaceResponse`。
- [x] 删除 node 时相关 edge/path 由 core/fixture projection 消失：Python 和 component test 覆盖。
- [x] 删除 edge 时 nodes 保留，NetworkPreview disconnected diagnostics 更新：Python、fixture 和 component test 覆盖。
- [x] Path list 可选择 path，Path Order Draft 可上移/下移并在 Apply 后复用 `workspace.set_path`。
- [x] 既有 connect mode、object drop、node dragging、energy/report panel 行为未回退：完整 Web/Python tests 和范围 review 覆盖。

**明确不做逐项核对**：

- [x] 未实现自由绘线、拖拽端点改边、edge rerouting、edge label 编辑或 path delete。
- [x] 未实现批量框选、多选快捷键、键盘 Delete、undo/redo、clipboard、viewport command 或自动拓扑排序。
- [x] 未把 path draft、selection、hover、edge hitbox 或 delete pending state 写入 Project Content、Browser Project Repository、localStorage 或 ShellResponse。
- [x] 未改变 Energy Profile 的 active path 消费规则。
- [x] 未新增第三方 diagramming/canvas library。

**关键决策落地**：

- [x] 决策 1：`workspace.remove` 使用 id arrays；已落地 `node_ids` / `edge_ids`，不支持 path ids。
- [x] 决策 2：删除 cascade 只信 core/fixture projection；前端不修改 domain graph。
- [x] 决策 3：node + incident edge 同请求时 workspace 层过滤 incident edge，避免重复 remove。
- [x] 决策 4：path order draft 是 UI-only；Apply 前未发送 `workspace.set_path`，component test 断言 payload count 不变。
- [x] 决策 5：路径顺序编辑只改 existing path；不创建任意子路径编辑器。

**挂载点反向核对（可卸载性）**：

- [x] Platform Shell workspace command dispatcher：`workspace.remove` 分发与 `_run_workspace_remove`。
- [x] GraphEditorWorkspaceService：`remove_items`。
- [x] Web fixture transport：`fixtureWorkspaceRemoveResponse`、`idsFromArgs` 和 cascade projection。
- [x] Graph Editor Interaction State：`selectGraphEditorEdge`、`selectGraphEditorPath`。
- [x] GraphCanvas / WorkbenchShell：edge/path selection、Delete Selected、Path Order Draft 和 apply 编排。
- [x] 反向 grep：`workspace.remove|selectGraphEditorEdge|selectGraphEditorPath|GraphPathOrderDraft|graph-path-draft|graph-edge-hitbox` 命中均落在上述挂载点、测试或文档内。
- [x] 拔除沙盘推演：删除 workspace service method、Platform Shell handler、fixture handler、selection/draft helpers、GraphCanvas/WorkbenchShell props 与 tests 后，不应残留运行态 remove/path draft 行为；`workspace.set_path` 作为既有能力保留。

## 3. 验收场景核对

- [x] **S1**：Platform Shell `workspace.remove(node_ids=[...])` 删除 node 后，目标 node 不存在，相关 edge/path 由 core cascade 消失。
  - 证据来源：`python3 -m unittest tests.test_graph_editor_workspace tests.test_platform_shell_baseline`
  - 结果：通过。
- [x] **S2**：Platform Shell `workspace.remove(edge_ids=[...])` 删除 edge 后，nodes 保留，NetworkPreview disconnected diagnostics 反映断开节点。
  - 证据来源：Python 单测和 Playwright edge delete。
  - 结果：通过。
- [x] **S3**：空 selection、未知 node id 或未知 edge id 返回结构化错误，不更新 workspace graph。
  - 证据来源：Python 单测和 `ShellClient.test.ts`。
  - 结果：通过。
- [x] **S4**：Web fixture transport 支持 `workspace.remove`，返回 JSON-safe `WorkspaceCommandData.command="workspace.remove"`。
  - 证据来源：`cd web && npm run test -- ShellClient.test.ts`。
  - 结果：通过。
- [x] **S5**：Graph Canvas 点击 edge 会选择 edge，Delete Selected 发送 `workspace.remove(edge_ids=[edgeId])`。
  - 证据来源：`WorkbenchShell.test.tsx` 和 Playwright。
  - 结果：通过。
- [x] **S6**：Graph Canvas 选择 node 后 Delete Selected 发送 `workspace.remove(node_ids=[nodeId])`，可见 graph 使用 ShellResponse cascade 结果。
  - 证据来源：`WorkbenchShell.test.tsx`。
  - 结果：通过。
- [x] **S7**：现有 Connect flow 仍可从 selected source 连接 clicked target，重复 connect 仍幂等。
  - 证据来源：完整 `npm run test`。
  - 结果：通过。
- [x] **S8**：Path list 选中 path 后，Path Order Draft 可把 node 顺序上移/下移；Apply 发送 `workspace.set_path(path_id, node_ids)`。
  - 证据来源：`WorkbenchShell.test.tsx` 和 Playwright。
  - 结果：通过，Playwright 观察到 `node-b -> node-a`。
- [x] **S9**：Path draft 调整期间不改变 domain graph；只有 ShellResponse 成功后可见 path order 更新。
  - 证据来源：component test 断言 Apply 前未新增 `workspace.set_path` payload。
  - 结果：通过。
- [x] **S10-S11 范围守护**：未新增 path delete、freehand edge draw、edge label edit、viewport command、undo/redo、Project Content schema、localStorage persistence 或第三方 diagramming/canvas library；未改变 object drop、node drag、import、energy 或 report 行为。
  - 证据来源：代码 review、scope grep、完整测试。
  - 结果：通过；grep 命中的 Project Content/localStorage/diagram 多为既有模块或文档引用，本 feature 未新增对应持久化或第三方库。
- [x] **S12**：`npm run test` 通过。
  - 证据来源：`cd web && npm run test`
  - 结果：15 files / 113 tests passed。
- [x] **S13**：`npm run build` 通过。
  - 证据来源：`cd web && npm run build`
  - 结果：通过。
- [x] **S14**：`python3 -m unittest discover` 通过。
  - 证据来源：Python unittest。
  - 结果：241 tests OK。
- [x] **S15**：Browser dev preview 验证页面非空白、无 framework overlay、console clean；edge delete 和 path reorder 有可观察变化。
  - 证据来源：Browser 插件 + Playwright fallback。
  - 结果：Browser 插件在 `http://127.0.0.1:5173/` 验证标题 `RxnFlow Workbench`、页面非空白、console warn/error 为空；点击 `运行 Fixture` 时 CDP `Runtime.evaluate` timeout，按前端 QA 流程 fallback 到 Playwright。Playwright 验证 edgeBefore=1、path reorder 显示 `node-b -> node-a`、Delete Selected 后 edgeAfter=0 且 Object A/Object B 仍可见、overlay=false、messages=[]。截图：`/tmp/rxnflow-edge-path-fixture.png`、`/tmp/rxnflow-edge-path-reordered.png`、`/tmp/rxnflow-edge-path-edge-deleted.png`。

## 4. 术语一致性

- `workspace.remove`：代码命中在 Platform Shell、Web Shell DTO、fixture transport、ShellClient tests、WorkbenchShell tests，均表示删除 graph node/edge，不删除 ChemicalObject 或 path。
- `GraphPathOrderDraft` / `Path Order Draft`：代码命中在 helper、GraphCanvas、WorkbenchShell 和 tests，均为 UI-only draft。
- `selectGraphEditorEdge` / `selectGraphEditorPath`：命中在 interaction helper 和 WorkbenchShell，保持 selection 单类互斥。
- 防冲突：未把该能力命名为 Project Content delete、ChemicalObject delete、path delete、edge label edit 或 viewport。

## 5. 架构归并

- [x] `.codestable/architecture/core-platform.md`：已归并 `GraphEditorWorkspaceService.remove_items`、Platform Shell `workspace.remove`、node/edge remove 语义、error boundary 和 cascade authority。
- [x] `.codestable/architecture/web-workbench.md`：已归并 edge selection/delete、Delete Selected、Path Order Draft、`graphPathOrderDraft.ts`、edge hitbox button、UI-only 边界和浏览器 QA。

归并后，没读过 design 的读者可从 architecture 直接看到删除 graph item、path 顺序草稿和 ShellResponse authority 的存在形态。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已更新用户故事、解决方案和边界：用户现在可删除选中 node/edge，并对已有 path 做受控顺序调整；仍不支持 path delete、自由绘边、edge label edit、undo/redo、viewport persistence 或自动保存。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-graph-editor/rxnflow-web-graph-editor-items.yaml` 中 `graph-editor-edge-path-editing` 已标为 `done`。
- [x] `.codestable/roadmap/rxnflow-web-graph-editor/rxnflow-web-graph-editor-roadmap.md` 第 5 节同步为 `done`，备注更新为已实现范围与验证结果。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新通用规则。已有“前端改动必须浏览器验证”和“Web 预览从 `web/` 运行 `npm run dev`”规则仍适用。

## 9. 遗留

- 后续优化点：键盘 Delete、多选/框选、edge endpoint dragging、path delete、viewport controls、workspace persistence 继续由 graph editor roadmap 后续 item 承载。
- 已知限制：Browser 插件当前能做页面身份和 console 检查，但点击本地 Vite 页面按钮时仍可能出现 CDP `Runtime.evaluate` timeout；本次已记录并使用 Playwright fallback 完成可观察交互验收。
- 实现阶段顺手发现：透明 SVG line 作为 `role=button` 会被 Playwright/ARIA 判为 hidden，已改成真实 HTML button；这属于本 feature 内修复，无需另开 issue。
