# graph-editor-node-layout 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：`.codestable/features/2026-05-21-graph-editor-node-layout/graph-editor-node-layout-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `WorkspaceMoveNodeArgs`：`session_id`、`node_id`、`position: [number, number]` 已在 `web/src/shell/types.ts`、`web/src/shell/fixtureTransport.ts` 和 `rxnflow/platform.py` 落地。
- [x] `WorkspaceCommandData.command`：已包含 `"workspace.move_node"`，fixture 和 Platform Shell response 均返回该 command。
- [x] `GraphNodeLayoutPosition` / `graphNodeLayoutBounds`：`web/src/app/graphNodeLayout.ts` 固定 `600 x 360` bounds 和 `20` grid，并提供 position、CSS percent、snap、clamp 和 move helper。

**名词层“现状 -> 变化”逐项核对**：

- [x] `GraphEditorWorkspaceService.move_node` 已新增，内部复用 `GraphPatch("update_node", id=node_id, patch={"position": position})`。
- [x] `PlatformShellService` 已分发 `workspace.move_node`，并用 `_required_position` 要求 position 是两个 finite number。
- [x] Web fixture transport 已支持 `workspace.move_node`，更新 fixture workspace graph 中目标 node 的 `position`。
- [x] `GraphCanvas` 不再只做粗略只读位置映射，现使用 `graphNodeLayout` helper 做显示、拖动 release position、snap 和 clamp。

**流程图核对**：

- [x] `Graph node pointer down` -> `onStartNodeDrag` -> `onUpdateNodeDrag` -> `onMoveNode` -> `ShellResponse workspace projection` 均有代码落点：`GraphCanvas.tsx`、`WorkbenchShell.tsx`、`fixtureTransport.ts`、`platform.py`。

未发现需要修正的接口偏差。

## 2. 行为与决策核对

对照方案第 1 节 + 第 2.2 节：

**需求摘要逐项验证**：

- [x] Graph Canvas 中已有 node card 可用 pointer/mouse 拖动：component test 和 Playwright 鼠标拖动均通过。
- [x] 拖动过程中使用 `GraphEditorInteractionState.dragging` 表达 transient node drag：`WorkbenchShell.startNodeDrag/updateNodeDrag/endNodeDrag` 已接入。
- [x] release 时目标位置 snap 到 grid 并 clamp 到 bounds：`moveGraphNodePosition` 调 `canvasPointToGraphNodePosition`，helper test 覆盖 snap/clamp。
- [x] 位置更新通过 `workspace.move_node` 进入 ShellClient / fixture / Platform Shell：ShellClient、Python 单测和 component test 覆盖。
- [x] 成功后只使用 ShellResponse workspace projection 更新可见 graph：`WorkbenchShell.moveGraphNode` 调 `applyWorkspaceResponse(response)`。
- [x] node card hover/selected/pending/path/dragging class 不改变节点布局尺寸，位置通过 helper 输出的 CSS percent 控制。

**明确不做逐项核对**：

- [x] 未新增自动布局、碰撞避让、edge rerouting、路径排序、删除节点/边、框选、多选、undo/redo 或键盘 nudging。
- [x] 未新增 pan/zoom/fit/reset、viewport persistence 或拖动时自动滚动画布。
- [x] 未把 transient drag state 写入 ShellResponse、Project Content、Browser Project Repository 或 localStorage。
- [x] 未把 node position 写入 ChemicalObject、Object Registry、Import Inbox、Energy Profile 或 Report Export。
- [x] 未新增第三方 diagramming/canvas library。

**关键决策落地**：

- [x] 决策 1：新增最窄 `workspace.move_node` command；已落地 `session_id/node_id/position`。
- [x] 决策 2：复用核心 patch 能力；`GraphEditorWorkspaceService.move_node` 仅生成 `update_node` patch。
- [x] 决策 3：前端不本地 patch graph；drag 期间只显示 transient position，release 后以 ShellResponse 更新 domain graph。
- [x] 决策 4：固定虚拟坐标系；Web 使用 `600 x 360` 和 `20` grid。
- [x] 决策 5：短 click 仍选择节点；component test 先 click `node-b` 并确认未发 move command。

**挂载点反向核对（可卸载性）**：

- [x] Platform Shell workspace command dispatcher：`platform.py` 中 `workspace.move_node` 分发、handler 和 `_required_position`。
- [x] GraphEditorWorkspaceService：`workspace.py` 中 `move_node`。
- [x] Web fixture transport：`fixtureTransport.ts` 中 `fixtureWorkspaceMoveNodeResponse`。
- [x] GraphCanvas node card：`GraphCanvas.tsx` 中 pointer down/move/up/cancel 编排。
- [x] WorkbenchShell：`WorkbenchShell.tsx` 中 move handler 和 interaction state 更新。
- [x] 反向 grep：`move_node|workspace.move_node|GraphPatch("update_node")` 命中均落在上述挂载点或测试内。
- [x] 拔除沙盘推演：移除 shell command、workspace method、fixture handler、GraphCanvas pointer handlers、WorkbenchShell move handler 和 tests 后不应残留运行态路径；`graphNodeLayout.ts` 是该 feature 独立 helper，可一并移除。

## 3. 验收场景核对

- [x] **S1**：Platform Shell 接收 `workspace.move_node` 后返回目标 node `position` 更新。
  - 证据来源：`python3 -m unittest tests.test_graph_editor_workspace tests.test_platform_shell_baseline`
  - 结果：通过，34 tests OK。
- [x] **S2**：缺失 node id、未知 node id 或 invalid position 返回结构化错误，不更新 graph。
  - 证据来源：Python 单测和 `web/src/shell/ShellClient.test.ts`
  - 结果：通过。
- [x] **S3**：Web fixture transport 支持 `workspace.move_node` 且返回 JSON-safe command。
  - 证据来源：`cd web && npm run test -- ShellClient.test.ts`
  - 结果：通过，23 tests OK。
- [x] **S4**：Graph Canvas 拖动已有 `node-b` 到新位置，发送 `workspace.move_node(node_id, position)`，成功后 node card 根据 ShellResponse 显示。
  - 证据来源：`WorkbenchShell.test.tsx` 和 Playwright 鼠标拖动。
  - 结果：通过；测试断言 payload `node-b/[420, 220]`，Playwright 确认 `node-b` style 从 `left 162px/top 709.406px` 变为 `left 252px/top 798.094px`。
- [x] **S5**：普通 click node 仍选择，不误发 move command。
  - 证据来源：`WorkbenchShell.test.tsx`
  - 结果：通过。
- [x] **S6**：position snap/grid 和 clamp 稳定。
  - 证据来源：`graphNodeLayout.test.ts`
  - 结果：通过。
- [x] **S7-S11 反向范围**：未新增 `workspace.remove`、edge/path edit、viewport command、auto layout、Project Content schema、localStorage persistence 或第三方 diagramming/canvas library；未改变 object drop / import inbox。
  - 证据来源：代码 review + grep。
  - 结果：通过。
- [x] **S12**：`npm run test` 通过。
  - 证据来源：`cd web && npm run test`
  - 结果：14 files / 104 tests passed。
- [x] **S13**：`npm run build` 通过。
  - 证据来源：`cd web && npm run build`
  - 结果：通过。
- [x] **S14**：`python3 -m unittest discover` 通过。
  - 证据来源：Python unittest。
  - 结果：239 tests OK。
- [x] **S15**：Browser dev preview 验证页面非空白、无 framework overlay、console clean；节点拖动有可观察变化。
  - 证据来源：Browser 插件 + Playwright fallback。
  - 结果：Browser 可连接页面但点击 `运行 Fixture` 时 CDP `Runtime.evaluate` timeout；按前端 QA fallback 到 Playwright。Playwright 在 `http://127.0.0.1:5175/` 验证标题 `RxnFlow Workbench`、`.workbench-shell` 存在、console issues `[]`、真实鼠标拖动 node-b 后位置变化。截图：`/tmp/rxnflow-node-layout-drag.png`。

## 4. 术语一致性

- `workspace.move_node`：代码命中在 Platform Shell、Web shell DTO、fixture transport、ShellClient test、WorkbenchShell test，语义一致。
- `move_node`：代码命中在 `GraphEditorWorkspaceService`、Platform Shell handler 和 Python tests，语义一致。
- `GraphNodeLayoutPosition` / `graphNodeLayoutBounds`：代码命中在 layout helper 与 GraphCanvas，均指 Web 虚拟布局坐标。
- 防冲突：未把该功能命名为 ChemicalObject layout、Project Content layout 或 viewport persistence。

## 5. 架构归并

- [x] `.codestable/architecture/core-platform.md`：已归并 `GraphEditorWorkspaceService.move_node`、Platform Shell `workspace.move_node`、position validation 和测试覆盖。
- [x] `.codestable/architecture/web-workbench.md`：已归并 `graphNodeLayout.ts`、Graph Canvas 节点拖动、ShellResponse authority、snap/clamp 和 Playwright fallback 验证。

归并后，没读过 design 的读者可从 architecture 直接看到节点布局移动能力、命令边界和不涉及持久化/viewport 的限制。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已补充用户可拖动已有 graph node 重新布局的故事、解决方案和边界。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-graph-editor/rxnflow-web-graph-editor-items.yaml` 中 `graph-editor-node-layout` 已标为 `done`。
- [x] `.codestable/roadmap/rxnflow-web-graph-editor/rxnflow-web-graph-editor-roadmap.md` 第 5 节子 feature 清单已同步状态、feature id 和备注。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新增通用工作流；已有“Web 预览必须从 `web/` 运行 `npm run dev`”规则仍适用。

## 9. 遗留

- 后续优化点：`graph-editor-edge-path-editing` 可复用 `workspace.move_node` 的 ShellResponse authority 和 node position 契约。
- 已知限制：节点移动不会实时保存到 Browser Project Repository 或 Project Content；保存/恢复闭环留给 `graph-editor-workspace-persistence`。
- 已知限制：当前无 auto layout、collision avoidance、viewport pan/zoom、undo/redo、多选和键盘 nudging。
- 实现阶段发现：in-app Browser 自动化对复杂点击/拖动仍可能 CDP timeout；复杂手势验收应继续用 Browser 做页面健康检查、Playwright 做交互证明。
