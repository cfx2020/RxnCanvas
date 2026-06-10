# graph-editor-auto-layout 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：`.codestable/features/2026-05-22-graph-editor-auto-layout/graph-editor-auto-layout-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：
- [x] `GraphLayoutStrategy`（`web/src/app/graphAutoLayout.ts`）：实际定义为 `"layered-left-to-right" | "grid-compact"`，与方案一致。
- [x] `GraphLayoutWarning`（`web/src/app/graphAutoLayout.ts`）：实际包含 `code`、`message`、可选 `target`，与方案一致。
- [x] `GraphLayoutPlan`（`web/src/app/graphAutoLayout.ts`）：实际包含 `graphId`、`strategy`、`nodePositions`、`changedNodeIds`、可选 `viewportIntent` 和 `warnings`，与方案一致。
- [x] `createGraphLayoutPlan({ graph, viewport, fitAfterLayout })`（`web/src/app/graphAutoLayout.ts`）：实际 helper 接受 `graph`、可选 `viewport` 和 `fitAfterLayout`，当前布局计算不需要读取 viewport；输出契约与方案一致。

**名词层"现状 -> 变化"逐项核对**：
- [x] `GraphLayoutPlan`：新增为 Web helper value object，没有进入 ShellResponse、Project Content 或 Python core。
- [x] `Layout Strategy`：实现 directed edge 分层布局和 grid fallback；cycle / no edge 有 warning。
- [x] `Apply Layout`：`GraphCanvas` 生成 plan，`WorkbenchShell` 顺序提交 `workspace.move_node`。
- [x] `Layout Fit Intent`：helper 使用 `fitGraphViewportToNodes` 生成可选 viewport intent，应用节点移动成功后才提交 `workspace.set_viewport`。

**流程图核对**：
- [x] `User clicks Apply Layout -> GraphCanvas creates GraphLayoutPlan`：`GraphCanvas.tsx` 调用 `createGraphLayoutPlan({ graph })`。
- [x] `changedNodeIds empty? -> no-op`：`WorkbenchShell.tsx` 在 `plan.changedNodeIds.length === 0` 时设置 no-op 状态并直接返回。
- [x] `workspace.move_node returns workspace projection`：`applyGraphAutoLayout` 每个 move 都调用 `applyWorkspaceResponse(response)`。
- [x] `viewportIntent exists -> workspace.set_viewport`：所有 move 成功后才发送 `workspace.set_viewport`。

未发现需要修正的接口偏差；仅补齐了 `GraphLayoutPlanInput.viewport?: GraphViewport | null` 类型字段，让 helper 输入形状和 design 完全对齐。

## 2. 行为与决策核对

**需求摘要逐项验证**：
- [x] 用户可在 Graph Canvas 工具区点击 Apply Layout：`GraphCanvas` command bar 已新增按钮和中英文文案。
- [x] Web helper 只读取当前 graph summary：`graphAutoLayout.ts` 的输入只有 `GraphSummary`、可选 viewport 和 fit flag；未读取 DOM、repository、profile 或 Project Content。
- [x] Apply Layout 按稳定 node id 顺序调用 `workspace.move_node`：component test 断言 payload node ids 为 `node-a`、`node-b`。
- [x] 每个可见 position 以 ShellResponse workspace projection 为准：`applyWorkspaceResponse` 处理每次 move；GraphCanvas 不直接 patch domain state。
- [x] viewport intent 在 move 成功后提交：component test 断言 move payloads 后存在 `workspace.set_viewport`。
- [x] empty/single/disconnected/cycle 有稳定 fallback：helper tests 覆盖 empty、single、directed、cycle 和 no-op planned positions。

**明确不做逐项核对**：
- [x] 未新增 Python core layout engine、GraphPatch op、Shell command 或 Project Content schema：scope grep 只命中 Web helper/UI/orchestration 和已有 shell commands。
- [x] 未实现反应路径搜索、过渡态识别、化学合理性判定或自动配平：新增代码只处理 graph node coordinates。
- [x] 未实现复杂 edge routing、label collision 或 node collision avoidance：布局只有 layered/grid position planning。
- [x] 未新增 undo/redo/history、localStorage persistence、autosave、cloud sync 或 Browser Project Repository write：新增状态只在 React UI state。
- [x] 未引入第三方 diagramming/canvas/layout 库：package 依赖未新增。
- [x] 未改变 node composition、edge/path 数据、active path、selection、energy profile 或 report export：新增路径只调用 `workspace.move_node` 和可选 `workspace.set_viewport`。

**关键决策落地**：
- [x] D1 Web app 层 helper：`graphAutoLayout.ts` 位于 `web/src/app`。
- [x] D2 稳定简单优先：helper 使用 deterministic sort、layered fallback grid。
- [x] D3 ShellResponse authority：`WorkbenchShell` 应用每个 shell response；GraphCanvas 只显示 status。
- [x] D4 顺序提交：`for (const nodeId of plan.changedNodeIds)` 串行 await。
- [x] D5 Fit 是 viewport intent：layout 不保存项目，只在 move 成功后提交 viewport command。

**编排层"现状 -> 变化"逐项核对**：
- [x] `GraphCanvas` command bar 新增 Apply Layout 和 status row。
- [x] `WorkbenchShell` 新增 `applyGraphAutoLayout(plan)` 编排函数。
- [x] i18n/styles 新增中英文按钮、状态文案和稳定 status 样式。

**跨层纪律核对**：
- [x] Command authority：node positions / viewport 均等待 ShellResponse projection。
- [x] Error semantics：move 或 viewport command 失败时显示 error 状态，不伪装 helper warning 为 ShellError。
- [x] Idempotence：第二次 Apply Layout 在 changed nodes 为空时 no-op，不重复 move。
- [x] Persistence boundary：Apply Layout 不调用 Save Bridge Session，不写 Browser Project Repository。
- [x] Isolation：scope grep 确认未新增 energy/report/import/object/bundle 路径调用。

**挂载点反向核对（可卸载性）**：
- [x] 挂载点 M1 Graph layout helper：`web/src/app/graphAutoLayout.ts` 与 `graphAutoLayout.test.ts`。
- [x] 挂载点 M2 GraphCanvas command bar：`GraphCanvas.tsx` import helper、创建 plan、显示 status。
- [x] 挂载点 M3 WorkbenchShell orchestration：`WorkbenchShell.tsx` import plan type、维护 status、顺序 apply plan。
- [x] 挂载点 M4 Tests：helper test、WorkbenchShell component test、浏览器验证脚本。
- [x] 挂载点 M5 i18n/styles：`messages.ts` 和 `workbench.css` 新增 layout 文案/样式。
- [x] 反向核查：`rg "GraphLayoutPlan|createGraphLayoutPlan|onApplyAutoLayout|autoLayoutStatus|graphCanvas\\.applyLayout|layoutStatus"` 命中均落在清单内。
- [x] 拔除沙盘推演：删除 helper、GraphCanvas prop/button/status、WorkbenchShell status/apply 函数、i18n/css/test 即可移除本 feature；不会残留 core/schema/repository contract。

## 3. 验收场景核对

- [x] **S1**：同一 graph 多次调用返回稳定 plan。
  - 证据来源：`graphAutoLayout.test.ts`
  - 结果：通过。
- [x] **S2**：无 node graph 返回 empty plan，不抛异常，不发送 move。
  - 证据来源：helper test + no changed nodes 编排分支。
  - 结果：通过。
- [x] **S3**：单节点 graph 生成有限、snap/clamp 后的位置。
  - 证据来源：helper test 断言 `[300, 180]`。
  - 结果：通过。
- [x] **S4**：directed edges 使用 left-to-right layering。
  - 证据来源：helper test 断言 source x 小于 target x。
  - 结果：通过。
- [x] **S5**：cycle fallback grid 并返回 warning。
  - 证据来源：helper test 断言 `strategy=grid-compact` 和 `layout_cycle_fallback`。
  - 结果：通过。
- [x] **S6**：所有 position 在 `graphNodeLayoutBounds` 内并按 grid snap。
  - 证据来源：helper test 遍历 positions。
  - 结果：通过。
- [x] **S7**：Apply Layout disabled / no-op 不误发 move。
  - 证据来源：WorkbenchShell component test 第二次点击 move payload 数保持 2。
  - 结果：通过。
- [x] **S8**：changed nodes 按稳定顺序发送 move，position 来自 ShellResponse。
  - 证据来源：WorkbenchShell component test 断言 payload 顺序和 node style projection。
  - 结果：通过。
- [x] **S9**：第二次 Apply 不重复发送 move command。
  - 证据来源：WorkbenchShell component test。
  - 结果：通过。
- [x] **S10**：viewport intent 在节点移动成功后才发送。
  - 证据来源：WorkbenchShell component test 断言存在 `workspace.set_viewport`；源码顺序为 move loop 后 viewport。
  - 结果：通过。
- [x] **S11**：任一 move 失败时停止后续 moves，显示结构化错误，不回滚或伪造成功。
  - 证据来源：源码 review，失败分支设置 `state:error` 后 return；`applyWorkspaceResponse` 保留已成功 projection。
  - 结果：通过。
- [x] **S12**：范围守护不新增 core/schema/persistence/autosave/third-party layout lib。
  - 证据来源：scope grep + package diff review。
  - 结果：通过。
- [x] **S13**：不改变 composition、edge/path、active path、selection、energy profile、report export 或 project bundle。
  - 证据来源：scope grep + diff review。
  - 结果：通过。
- [x] **S14**：`cd web && npm run test -- --run` 通过。
  - 证据来源：实现阶段验证记录，22 files / 195 tests passed。
  - 结果：通过。
- [x] **S15**：`cd web && npm run build` 通过。
  - 证据来源：实现阶段验证记录。
  - 结果：通过。
- [x] **S16**：Python runtime 未触碰。
  - 证据来源：本 feature 只改 Web app 与 CodeStable 文档；未新增 Python core command/schema。
  - 结果：无需运行 `python3 -m unittest discover`。
- [x] **S17**：真实浏览器验证页面非空白、无 overlay、console clean，桌面/窄屏 layout 可用。
  - 证据来源：实现阶段 in-app browser + Playwright desktop `1280x720` / narrow `390x840` 验证记录；Apply Layout 可见，第二次 no-op，node-b 位于 node-a 右侧，无水平溢出。
  - 结果：通过。

## 4. 术语一致性

- `GraphLayoutPlan`：代码命中集中在 helper、GraphCanvas、WorkbenchShell 和 tests，命名一致。
- `GraphLayoutWarning`：只作为 layout helper warning 和 status 展示，不伪装成 ShellError。
- `Apply Layout` / `auto layout`：UI 文案和实现均描述为图谱布局整理，不描述为化学路径搜索、能量排序或自动机理推断。
- 防冲突：未新增 `GraphPatch`、Project Content schema、Browser Project Repository API、localStorage key 或 Python command。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md`：已记录 Graph Auto Layout 当前能力、`graphAutoLayout.ts` 模块职责、GraphCanvas Apply Layout 入口、WorkbenchShell sequential move/fit orchestration、UI-only status/warnings 以及 persistence / core boundary。
- [x] 架构总入口：本 feature 属于既有 Web Workbench 架构范围，不需要更新 `.codestable/architecture/ARCHITECTURE.md`。
- [x] `AGENTS.md`：已有 Web 预览和 UI 验证要求，本 feature 未暴露新的项目级硬约束。

归并后，未读过 design 的读者只看 `web-workbench.md` 即可知道自动布局能力已存在、位于 Web app helper、通过既有 workspace commands 生效，且不新增保存或 core schema。

## 6. requirement 回写

- [x] 对应 requirement：`web-workbench-shell`。
- [x] 已更新 `.codestable/requirements/web-workbench-shell.md`：新增一键自动整理图谱布局的用户故事；在解决方案和边界中说明 Apply Layout 的 projection authority、no-op、warning 和不自动保存边界。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-items.yaml`：`graph-editor-auto-layout` 已从 `in-progress` 改为 `done`，feature 保持 `2026-05-22-graph-editor-auto-layout`。
- [x] `.codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-roadmap.md`：第 5 节对应条目已改为 done，并记录已落地的 Web-side plan、Apply Layout、sequential move 和 optional fit。
- [x] YAML 校验将在验收收尾命令中执行。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新环境、工具或工作流约定。既有 `cd web && npm run dev` 和真实浏览器验证要求已覆盖。

## 9. 遗留

- 后续优化点：复杂 node collision avoidance、edge rerouting、label collision avoidance 可作为后续独立 feature，不属于本次最小闭环。
- 已知限制：auto layout 当前只读取 graph topology，不读取化学结构、能量、composition 或 DOM 尺寸；cycle / no edge 使用 compact grid fallback。
- 实现阶段顺手发现：未来 `graph-editor-wheel-minimap` 和 `graph-editor-lightweight-history` 可复用 `viewportIntent` 和 deterministic layout plan。
