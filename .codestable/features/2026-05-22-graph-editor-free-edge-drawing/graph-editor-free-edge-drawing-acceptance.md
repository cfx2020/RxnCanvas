# graph-editor-free-edge-drawing 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：`.codestable/features/2026-05-22-graph-editor-free-edge-drawing/graph-editor-free-edge-drawing-design.md`

实现提交：

- `1727405 Design graph editor free edge drawing`
- `2a3dc85 Add pending edge gesture state`
- `2e8ca07 Add direct edge gesture UI`
- `792e41c Verify free edge drawing implementation`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `PendingEdgeDraft = { fromNodeId, pointerGraphPosition?, targetNodeId?, source }`：实际定义位于 `web/src/app/graphEditorInteractionState.ts`，`source="click"` 保留既有 fallback，`source="pointer"` 承载 Edge Connect Handle 拖线过程。
- [x] `DirectEdgeGestureResult = connect | cancel`：实际定义覆盖 `connect`、`empty-target`、`same-node`、`stale-source` 和 `pointer-cancel`，release 判定集中在 `resolveGraphEditorDirectEdgeGesture`。
- [x] `workspace.connect(from_node_id, to_node_id)`：direct gesture 和 click fallback 均复用 `WorkbenchShell.connectGraphNodes`，提交 payload 只包含 `session_id`、`from_node_id`、`to_node_id`，不传 label。

**名词层“现状 → 变化”逐项核对**：

- [x] `GraphEditorInteractionState.pendingEdge` 已由 `{ fromNodeId }` 扩展为可区分 click / pointer source、pointer graph position 和可选 target node 的 UI-only draft。
- [x] GraphCanvas 新增节点 Edge Connect Handle，node body 仍用于选择和 node drag，handle pointerdown 才进入 direct edge gesture。
- [x] GraphEdgeLayer 新增 transient pending preview line；可见正式 edge 仍只来自 `WorkbenchDomainState.workspace.graph.edges`。
- [x] WorkbenchShell 抽出共享 `connectGraphNodes`，direct gesture 与 click-driven Connect fallback 复用同一 ShellResponse projection 处理。

**流程图核对**：

- [x] User pointerdown on Edge Connect Handle → `startGraphEditorPointerEdge(source="pointer")`。
- [x] Pointer move → `updateGraphEditorPointerEdge(pointerGraphPosition, targetNodeId)`，GraphEdgeLayer 渲染 pending preview。
- [x] Pointer release valid target → `resolveGraphEditorDirectEdgeGesture(...).kind === "connect"` → `workspace.connect`。
- [x] ShellResponse workspace projection → `applyWorkspaceResponse` → GraphCanvas 渲染正式 edge。
- [x] Pointer release empty / same / stale / cancel → `clearGraphEditorPendingEdge`，不发送 shell command。

结论：接口契约与方案一致，无需修正设计或代码。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 用户可从 graph node 的 Edge Connect Handle 发起 pointer drag 连线手势。
- [x] 拖动中画布显示 transient pending edge preview，目标是当前 pointer 或 hit-tested target node。
- [x] pointer release 到另一个合法 node 时发送 `workspace.connect(from_node_id, to_node_id)`。
- [x] 成功后新 edge 只从 ShellResponse workspace projection 出现；GraphCanvas 不本地 append edge。
- [x] release 到空白、同一 source、缺失 target 或 stale source 时不发送 shell command，只清理 pending draft。
- [x] 既有 click-driven Connect fallback 保留。
- [x] 创建 edge 不改变 edge label 编辑；label 仍由 Edge Label Draft 后置处理。

**明确不做逐项核对**：

- [x] 未新增 Python core / Platform Shell command，未改 `workspace.connect` payload 契约。
- [x] 未实现 endpoint reconnect、direction flip、drag existing edge、edge deletion gesture 或 structured reaction condition form。
- [x] 未在拖线时弹出 label 输入，未把 label prompt 混入 direct edge gesture。
- [x] 未新增 GraphPatch op、Project Content schema、Browser Project Repository write、localStorage persistence、autosave 或第三方 diagramming library。
- [x] 未改变 node drag move、object drop、canvas pan、edge selection/delete、path order draft、Edge Label Draft、EnergyProfile 或 Report Export 行为。
- [x] 未实现多选框选、keyboard nudge、wheel/minimap 或 undo/redo。

**关键决策落地**：

- [x] D1 复用 `workspace.connect`：direct gesture 只是新的 Web 输入方式，没有 `workspace.draw_edge` 或新 core patch。
- [x] D2 node move 与 edge draw 分离：node body pointer drag 仍走 `workspace.move_node`；Edge Connect Handle 才启动 direct gesture。
- [x] D3 click fallback 保留：Connect button + target node click 的无鼠标/可测路径仍可用。
- [x] D4 preview 是 UI-only：pending line、target candidate 和 cancel state 不进入 shell/domain/persistence。
- [x] D5 release 才提交：pointer move 只更新 UI state，不调用 shell。
- [x] D6 label 后置编辑：创建 edge 不带 label UI，标注仍通过 selected edge 的 Edge Label Draft。

**编排层“现状 → 变化”逐项核对**：

- [x] GraphCanvas node card 新增 Edge Connect Handle，handle pointerdown stop propagation，避免误触发 node body drag。
- [x] GraphCanvas 维护 pointer session ref，pointermove / pointerup 基于 `document.elementsFromPoint` hit-test target node。
- [x] GraphEdgeLayer 增加 pending preview line，source 为 graph node center，target 为 hit-tested node center 或 pointer graph position。
- [x] WorkbenchShell 新增 direct pointer callbacks，并抽出 `connectGraphNodes` 供 click fallback 和 pointer release 共享。

**跨层纪律核对**：

- [x] Command authority：GraphCanvas 不 append edge，不本地修改 domain graph。
- [x] Gesture isolation：node drag、canvas pan 和 object drop 回归测试仍通过。
- [x] Error semantics：invalid target/source 在 UI 层 no-op；shell 返回错误仍进入既有 workbench error surface。
- [x] Persistence boundary：pending edge 不保存；正式 edge 只随既有 ShellResponse projection 和显式 Save Bridge Session 进入项目内容。
- [x] Accessibility：click-driven Connect fallback 保留；Edge Connect Handle 是 pointer affordance，不是唯一入口。

**挂载点反向核对（可卸载性）**：

- [x] Web interaction state：`web/src/app/graphEditorInteractionState.ts` 与 `graphEditorInteractionState.test.ts`。
- [x] GraphCanvas direct gesture UI：`web/src/app/GraphCanvas.tsx`、`workbench.css`、`messages.ts`。
- [x] WorkbenchShell connect orchestration：`web/src/app/WorkbenchShell.tsx` 与 `WorkbenchShell.test.tsx`。
- [x] 反向 grep：`PendingEdgeDraft`、`startGraphEditorPointerEdge`、`resolveGraphEditorDirectEdgeGesture`、`connectGraphNodes`、`workspace.connect` 命中均落在上述挂载点和测试/文档内。
- [x] 拔除沙盘推演：移除 handle、pointer helper、pending preview 与 WorkbenchShell pointer callbacks 后，系统会回到 click-driven Connect fallback；不需要清理 core、schema、repository、energy/export 代码。

结论：行为、决策和挂载点与方案一致。

## 3. 验收场景核对

- [x] **S1-S3**：helper 可创建 `source="pointer"` draft，pointer move 更新 preview position / targetNodeId，且不修改 domain graph。
  - 证据来源：`cd web && npm run test -- --run graphEditorInteractionState.test.ts`。
  - 结果：通过。
- [x] **S4-S5**：pointer release 到另一个 node 时发送 `workspace.connect(from_node_id, to_node_id)`；成功后新 edge 只由 ShellResponse workspace projection 出现。
  - 证据来源：`WorkbenchShell.test.tsx` direct edge test；浏览器 QA 桌面验证。
  - 结果：通过。
- [x] **S6-S8**：release 到空白、同一 source 或 stale source 不发送 command，pending draft 被清空或 prune。
  - 证据来源：`graphEditorInteractionState.test.ts` 与 `WorkbenchShell.test.tsx`。
  - 结果：通过。
- [x] **S9-S12**：node body drag、pan mode empty canvas drag、Object Registry drag/drop 和 click-driven Connect fallback 均未回退。
  - 证据来源：`WorkbenchShell.test.tsx` 回归测试。
  - 结果：通过。
- [x] **S13**：direct gesture 不创建 edge label；创建后仍通过 Edge Label Draft 编辑。
  - 证据来源：payload review、组件测试和 scope grep。
  - 结果：通过。
- [x] **S14**：不新增 core/platform/schema/repository/localStorage/autosave/energy/export 变更。
  - 证据来源：scope grep + git diff review。
  - 结果：通过。
- [x] **S15**：`cd web && npm run test -- --run WorkbenchShell.test.tsx graphEditorInteractionState.test.ts`。
  - 证据来源：本轮验证。
  - 结果：通过，74 tests passed。
- [x] **S16**：`cd web && npm run build`。
  - 证据来源：本轮验证。
  - 结果：通过。
- [x] **S17**：浏览器验证 `http://127.0.0.1:5173/` 页面非空白、无 framework overlay、console clean；direct edge gesture 在桌面/窄屏无明显重叠或水平溢出。
  - 证据来源：Chromium QA against Vite dev server，desktop `1366x900` 和 narrow `390x844`。
  - 结果：通过。验证了直接拖线创建 edge、pending preview 可见、无水平 overflow；旧浏览器日志残留不计入 fresh console issue。

## 4. 术语一致性

- `Direct Edge Gesture`：代码中对应 Edge Connect Handle pointer flow，不与 endpoint reconnect 或 existing edge drag 混用。
- `Pending Edge Draft` / `PendingEdgeDraft`：只表示 Web UI-only 连线草稿，未进入 ShellResponse、Project Content、Browser Project Repository 或 localStorage。
- `Edge Connect Handle`：只作为 node card 上的 pointer affordance；node body selection/drag 语义保持独立。
- `Click-driven Connect Fallback`：仍保留 Connect button + target node click 路径。
- `Connect Projection Authority`：正式 edge 可见性只以 `workspace.connect` 的 ShellResponse workspace projection 为准。
- 防冲突 grep：未新增 `workspace.draw_edge`、GraphPatch op、localStorage key、autosave 入口或 endpoint reconnect command。

结论：术语一致，无需修正。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md` 已更新：记录 Direct Edge Gesture、Edge Connect Handle、`source="pointer"` Pending Edge Draft、GraphEdgeLayer transient preview line、shared `connectGraphNodes`、click fallback 保留、projection authority 和持久化边界。
- [x] `.codestable/architecture/core-platform.md` 不需要更新：本 feature 复用既有 `workspace.connect`，未新增 core service、Platform Shell command、GraphPatch op 或 Project Content schema。
- [x] `AGENTS.md` 不需要更新：已有 Web 预览必须从 `web/` 运行 `npm run dev`、画布交互必须浏览器验证等规则足够覆盖本 feature。

归并后，未读过本 design 的人可以从 architecture 直接看到：系统现在支持从 node handle 直接拖线创建 edge，同时仍遵守 ShellResponse projection authority 和 UI-only pending draft 边界。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已新增用户故事：用户可从一个图谱节点直接拖线到另一个节点创建连接，而不是只能通过按钮式 Connect 流程。
- [x] “怎么解决”已补入 Edge Connect Handle、Pending Edge Draft、GraphEdgeLayer transient preview line、shared `connectGraphNodes`、`workspace.connect(from_node_id, to_node_id)`、no-op cancel 语义和无 label prompt 边界。
- [x] “边界”已更新：Graph Canvas 现在支持 direct edge gesture；仍不支持 endpoint reconnect、wheel/minimap、多选、undo/redo、autosave、localStorage graph persistence 或 structured reaction condition editor。

结论：requirement 已回写。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-items.yaml` 中 `graph-editor-free-edge-drawing` 已由 `in-progress` 改为 `done`，feature 保持 `2026-05-22-graph-editor-free-edge-drawing`。
- [x] `.codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-roadmap.md` 第 4.4 节已同步实际 `PendingEdgeDraft` shape 和 no-label `workspace.connect(from_node_id, to_node_id)` 契约。
- [x] roadmap 第 5 / 6 / 7 节已同步：free edge drawing 已完成，下一步可推进 `graph-editor-multiselect-keyboard` 或 `graph-editor-wheel-minimap`，剩余高级编辑手感集中在多选、键盘、wheel/minimap、endpoint reconnect 和 history。

结论：roadmap 已回写。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 没有暴露新的环境、端口、依赖安装或反复工作流坑。已有 `AGENTS.md` 中的 Vite dev server 和浏览器验证规则继续适用。

## 9. 遗留

- 后续优化点：`graph-editor-multiselect-keyboard` 可复用当前 Workspace Selection projection、Delete Selected 和 click/direct connect 边界。
- 后续优化点：`graph-editor-wheel-minimap` 可复用当前 `graphViewport` helper 和 fixed `600 x 360` workspace coordinate discipline。
- 已知限制：direct gesture 不支持 endpoint reconnect、drag existing edge、direction flip、edge deletion gesture、label prompt、structured reaction condition form、undo/redo 或 minimap。
- 已知限制：pending preview 是 UI-only，不自动保存；正式 edge 仍需通过显式 Save Bridge Session 进入 Browser Project Repository。
- 顺手发现：旧浏览器日志可能残留在 in-app browser 会话中；本验收使用 fresh console issue 判断本 feature 是否新增错误。
