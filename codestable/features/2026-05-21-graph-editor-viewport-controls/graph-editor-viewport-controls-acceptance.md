---
doc_type: feature-acceptance
feature: 2026-05-21-graph-editor-viewport-controls
status: accepted
accepted_at: 2026-05-21
summary: 验收 Web Graph Canvas viewport pan/zoom/fit/reset、workspace.set_viewport、坐标换算和范围守护
tags: [web, graph-editor, viewport, pan-zoom, platform-shell, acceptance]
---

# graph-editor-viewport-controls 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：`codestable/features/2026-05-21-graph-editor-viewport-controls/graph-editor-viewport-controls-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `WorkspaceSetViewportArgs`：`session_id` 和 `viewport: {x,y,zoom}` 已在 `rxnflow/platform.py`、`web/src/shell/types.ts` 和 `web/src/shell/fixtureTransport.ts` 落地。
- [x] `CanvasViewportSummary`：`web/src/shell/types.ts` 定义 `x`、`y`、`zoom`，`WorkspaceSummary.viewport` 已可选投影；`rxnflow/platform.py` 的 workspace summary 返回同形状 JSON-safe projection。
- [x] `WorkspaceCommandData.command`：已包含 `"workspace.set_viewport"`，Platform Shell 和 fixture transport 成功后均返回该 command。
- [x] `graphViewport.ts`：已提供 viewport fallback、zoom clamp、screen/graph 坐标换算、CSS transform、zoom、pan、fit 和 reset helper。

**名词层“现状 -> 变化”逐项核对**：

- [x] Platform Shell 已新增 `workspace.set_viewport` 分发，校验 viewport object、finite `x/y/zoom` 和 `zoom > 0`。
- [x] Workspace projection 已包含 `viewport`；旧响应缺失时 Web 通过 `normalizeGraphViewport` fallback 到 `{x:0,y:0,zoom:1}`。
- [x] Web fixture transport 已维护 workspace viewport state，并在 `workbench.snapshot` 和 workspace command response 中返回 viewport。
- [x] GraphCanvas 已把 nodes、edges、edge hitbox 放入 `.graph-viewport-layer`，用 viewport transform 显示。
- [x] object drop、node drag release 和 pan drag 都通过 `graphViewport` 坐标换算，提交的 position 仍是 graph/workspace 坐标。

**流程图核对**：

- [x] `Zoom/Fit/Reset -> Viewport Intent -> workspace.set_viewport -> ShellResponse projection -> GraphCanvas transform` 有代码落点：`GraphCanvas.tsx`、`WorkbenchShell.tsx`、`fixtureTransport.ts`、`platform.py`。
- [x] `Pan mode empty canvas drag -> transient canvas dragging -> release computes pan viewport -> workspace.set_viewport` 有代码落点：`graphEditorInteractionState.ts`、`GraphCanvas.tsx`、`WorkbenchShell.tsx`。

验收中发现真实浏览器里 `.graph-viewport-layer` 覆盖 canvas surface，原先只接受 `event.currentTarget === event.target` 的 pan start 判定会让空白拖动无效；已改为排除 `.graph-node-card` 和 `.graph-edge-hitbox` 后允许 viewport layer 作为 pan start target，component test 和 Playwright fallback 均通过。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 用户可通过 toolbar 执行 Zoom In、Zoom Out、Fit 和 Reset：`WorkbenchShell.test.tsx` 和 Playwright 验证通过。
- [x] Pan mode 下空白区域拖动画布，release 后提交 viewport：component test 覆盖 surface/layer pan，Playwright 观察到 transform 平移变化。
- [x] Web UI 使用当前 viewport 显示缩放/平移后的节点、边和 edge hitbox：`.graph-viewport-layer` 使用 `graphViewportCssTransform(viewport)`。
- [x] object drop、node drag 和 pan 共用 viewport 坐标换算：`GraphCanvas.tsx` 中 drop/drag/pan 均调用 `graphPointFromClientPoint` / `screenPointToGraphPoint`。
- [x] `workspace.set_viewport` 成功后只从 ShellResponse workspace projection 更新 viewport：`WorkbenchShell.setGraphViewport` 只发送 command 并调用 `applyWorkspaceResponse`。
- [x] 既有 object drop、node drag、edge delete、path order、energy/report 行为未回退：完整 Web/Python tests 和范围 review 覆盖。

**明确不做逐项核对**：

- [x] 未实现 minimap、惯性滚动、滚轮缩放、pinch、键盘快捷键、viewport undo/redo 或 viewport history。
- [x] 未实现自动布局、碰撞避让、edge rerouting、fit 后自动保存、拖动实时写盘或 Project Content schema 变更。
- [x] 未把 transient pan drag、viewport intent、surface DOM size 或 fit 中间值写入 Project Content、Browser Project Repository、localStorage 或 ShellResponse。
- [x] 未改变 ReactionGraph node position 语义；viewport 不调用 GraphPatch，不修改 nodes/edges/paths、active path、objects、imports、energy profile 或 report artifacts。
- [x] 未新增第三方 diagramming/canvas library。

**关键决策落地**：

- [x] 决策 1：viewport 使用 workspace 虚拟坐标，`x/y` 为虚拟画布 offset，`zoom` 为倍率；`graphViewport.ts` 与 Shell DTO 均保持 `{x,y,zoom}`。
- [x] 决策 2：ShellResponse authority；Web 只生成 intent，成功后以 ShellResponse `workspace.viewport` 为准。
- [x] 决策 3：Graph structure 不受影响；Python 和 ShellClient tests 断言 set viewport 后 graph state 不变。
- [x] 决策 4：坐标 helper 集中化；`graphViewport.ts` 承担 drop、node drag、pan 和 fit 的共享换算。
- [x] 决策 5：zoom clamp 第一版为 `0.35 <= zoom <= 2.5`；Web helper 先 clamp，Shell 拒绝 non-finite 和非正 zoom。

**挂载点反向核对（可卸载性）**：

- [x] Platform Shell workspace command dispatcher：`workspace.set_viewport` 和 `_run_workspace_set_viewport`。
- [x] Web shell DTO / fixture transport：`CanvasViewportSummary`、`WorkspaceSummary.viewport`、fixture `workspace.set_viewport` state。
- [x] Graph viewport helper：`web/src/app/graphViewport.ts`。
- [x] GraphCanvas / WorkbenchShell：viewport toolbar、transform layer、pan mode drag 和 set viewport command 编排。
- [x] i18n / styles / tests：viewport 文案、`.graph-viewport-*` 样式、ShellClient/helper/component tests。
- [x] 反向 grep：`workspace.set_viewport|CanvasViewportSummary|graphViewport|graph-viewport|startGraphEditorCanvasDrag` 命中均落在上述挂载点、既有 core workspace persistence、测试或文档内。
- [x] 拔除沙盘推演：删除 Platform Shell handler、Web DTO/fixture branch、`graphViewport.ts`、GraphCanvas toolbar/transform/pan props、WorkbenchShell `setGraphViewport` 和 tests 后，可移除本 feature 的运行态能力；既有 core `CanvasViewport` / Project Content codec 作为前置能力保留。

## 3. 验收场景核对

- [x] **S1**：Platform Shell `workspace.set_viewport(viewport={x,y,zoom})` 返回 workspace projection 中相同 viewport，graph nodes/edges/paths 不变。
  - 证据来源：`tests/test_platform_shell_baseline.py`。
  - 结果：通过。
- [x] **S2**：Platform Shell 对缺失 viewport、non-finite x/y/zoom 或 `zoom <= 0` 返回结构化 `invalid_input`，不更新 workspace viewport。
  - 证据来源：`tests/test_platform_shell_baseline.py`。
  - 结果：通过，target 分别为 `viewport` / `viewport.zoom`。
- [x] **S3**：Web fixture transport 支持 `workspace.set_viewport`，返回 JSON-safe `WorkspaceCommandData.command="workspace.set_viewport"`。
  - 证据来源：`web/src/shell/ShellClient.test.ts`。
  - 结果：通过。
- [x] **S4**：`WorkspaceSummary.viewport` 在 fixture run、workbench snapshot 和 workspace command response 中可见；缺失时 Web helper fallback 到默认 viewport。
  - 证据来源：`ShellClient.test.ts` 和 `graphViewport.test.ts`。
  - 结果：通过。
- [x] **S5**：GraphCanvas Zoom In/Out 按钮发送 clamped viewport；重复 zoom 不越过 `0.35..2.5`。
  - 证据来源：`graphViewport.test.ts` 和 `WorkbenchShell.test.tsx`。
  - 结果：通过。
- [x] **S6**：GraphCanvas Reset 发送 `{x:0,y:0,zoom:1}`；重复 reset 仍可用且无错误。
  - 证据来源：`WorkbenchShell.test.tsx` 和 Playwright reset 验证。
  - 结果：通过。
- [x] **S7**：GraphCanvas Fit 根据当前 nodes 生成有限 viewport，让 fixture node A/B 在桌面 viewport 中可见。
  - 证据来源：`graphViewport.test.ts` 和 Playwright。
  - 结果：通过，Playwright 观察到 Fit 后 zoom output 为 `179%`。
- [x] **S8**：Pan mode 下拖动画布空白区域发送 `workspace.set_viewport`；node drag 不发送 pan viewport command。
  - 证据来源：`WorkbenchShell.test.tsx` 和 Playwright。
  - 结果：通过。
- [x] **S9**：zoom/pan 后 object drop 和 node drag release 仍提交虚拟画布坐标，不提交 screen pixel 坐标。
  - 证据来源：`WorkbenchShell.test.tsx`。
  - 结果：通过。
- [x] **S10-S11 范围守护**：viewport controls 不改变 nodes/edges/paths、active path、object registry、import inbox、energy profile 或 report export state；未新增 auto layout、collision avoidance、Project Content schema、localStorage persistence、undo/redo、minimap、wheel/pinch 或第三方 diagramming/canvas library。
  - 证据来源：代码 review、scope grep、完整测试。
  - 结果：通过；`localStorage` 命中只来自既有 i18n locale preference，`undo/redo` 命中只来自既有 workspace persistence migration 测试。
- [x] **S12**：`npm run test` 通过。
  - 证据来源：`cd web && npm run test`。
  - 结果：通过。
- [x] **S13**：`npm run build` 通过。
  - 证据来源：`cd web && npm run build`。
  - 结果：通过。
- [x] **S14**：`python3 -m unittest discover` 通过。
  - 证据来源：Python unittest。
  - 结果：通过。
- [x] **S15**：Browser dev preview 验证页面非空白、无 framework overlay、console error/warn clean；zoom/fit/reset/pan 有可观察变化。
  - 证据来源：Browser 插件 + Playwright fallback。
  - 结果：Browser 插件在 `http://127.0.0.1:5173/` 验证标题 `RxnFlow Workbench`、页面非空白、console warn/error 为空；点击 `运行 Fixture` 时 CDP `Runtime.evaluate` timeout，按前端 QA 流程 fallback 到 Playwright。Playwright 验证 node A/B 可见、Zoom In transform 为 `matrix(1.2, 0, 0, 1.2, -43, -31.8)`、Fit 输出 `179%`、Reset identity、Pan mode `aria-pressed=true` 且 drag 后 transform 为 `matrix(1, 0, 0, 1, 64.5, -50.88)`、overlay=false、console messages=[]。截图：`/tmp/rxnflow-viewport-fixture.png`、`/tmp/rxnflow-viewport-zoom.png`、`/tmp/rxnflow-viewport-fit.png`、`/tmp/rxnflow-viewport-pan.png`。

## 4. 术语一致性

- `CanvasViewport` / `CanvasViewportSummary`：core 与 Web DTO 均表示 workspace-only `{x,y,zoom}`。
- `workspace.set_viewport`：代码命中在 Platform Shell、Web Shell DTO、fixture transport、WorkbenchShell 和 tests，均表示只更新 workspace viewport projection。
- `GraphViewport` / `graphViewport`：代码命中在 Web helper、GraphCanvas 和 helper tests，均表示 UI 坐标换算/intent helper，不是持久化 schema。
- `Pan Mode`：命中在 interaction state、GraphCanvas 和 tests，表示 canvas dragging，不等同于 node dragging。
- 防冲突：未把该能力命名为 GraphPatch、ReactionGraph viewport、Project Content autosave、browser window viewport、minimap 或 auto layout。

## 5. 架构归并

- [x] `codestable/architecture/core-platform.md`：已归并 Platform Shell `workspace.set_viewport` command、workspace viewport projection、非法 viewport error target 和 graph 不变约束。
- [x] `codestable/architecture/web-workbench.md`：已归并 Graph Canvas viewport controls、`graphViewport.ts` helper、pan mode、viewport transform、workspace.set_viewport authority、UI-only/transient 边界和 QA 证据。
- [x] `codestable/architecture/ARCHITECTURE.md`：已同步总入口中的 PlatformShellService command list 和 Web Graph Canvas 当前能力，避免总览继续停留在 click-driven MVP。

归并后，没读过 design 的读者可从 architecture 直接看到 viewport controls 的存在、ShellResponse authority、坐标换算边界和不自动持久化约束。

## 6. requirement 回写

- [x] `codestable/requirements/web-workbench-shell.md` 已更新用户故事、解决方案和边界：用户现在可缩放、平移、fit 和 reset 图谱画布；viewport intent/transient pan 仍是 UI-only，viewport 不自动保存，不提供 minimap、wheel/pinch、undo/redo/history 或自动布局。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-web-graph-editor/rxnflow-web-graph-editor-items.yaml` 中 `graph-editor-viewport-controls` 已标为 `done`。
- [x] `codestable/roadmap/rxnflow-web-graph-editor/rxnflow-web-graph-editor-roadmap.md` 第 5 节同步为 `done`，并把 Canvas Viewport Contract 的 zoom 范围更新为 `0.35 <= zoom <= 2.5`。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新通用规则。已有“前端改动必须浏览器验证”和“Web 预览从 `web/` 运行 `npm run dev`”规则仍适用。

## 9. 遗留

- 后续优化点：viewport 与 selection 的 Project Content open/save 恢复闭环由 `graph-editor-workspace-persistence` 承接；真实桌面/窄屏交互矩阵由 `graph-editor-e2e-qa` 承接。
- 已知限制：Browser 插件当前能做页面身份和 console 检查，但点击本地 Vite 页面按钮时仍可能出现 CDP `Runtime.evaluate` timeout；本次已记录并使用 Playwright fallback 完成可观察交互验收。
- 实现阶段顺手发现：真实浏览器 pan start target 会落在 `.graph-viewport-layer`，已在本 feature 内修复并补 component test 覆盖。
