# web-graph-canvas-mvp 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-20
> 关联方案 doc：.codestable/features/2026-05-20-web-graph-canvas-mvp/web-graph-canvas-mvp-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层，Web shell DTO 已补齐 `GraphNodeSummary`、`GraphEdgeSummary`、`GraphPathSummary`、`GraphSummary`、`NetworkPreviewSummary`、`WorkspaceCommandData`，`WorkspaceSummary.graph` / `preview` 不再是松散 `JsonObject`。

- [x] Graph projection 类型保持 JSON-safe，仍是 Web projection，不是 core dataclass。落点：`web/src/shell/types.ts`。
- [x] `fixtureTransport` 支持 `workspace.open`、`workspace.add_node`、`workspace.connect`、`workspace.set_path`，并维护最小 fixture workspace state。落点：`web/src/shell/fixtureTransport.ts`。
- [x] `workspace.connect` 对重复 node pair 幂等；缺失 node 返回 `graph_invalid` / `target=node_id`。证据：`web/src/shell/ShellClient.test.ts`。
- [x] Graph Canvas UI state 以 `selectedGraphNodeId` / `pendingConnectionFromId` 落在 `WorkbenchShell`，未进入 ShellResponse 或 Project Content。

## 2. 行为与决策核对

- [x] Graph Canvas 只从 `WorkbenchDomainState.workspace.graph` 渲染 nodes/edges/paths，从 `workspace.preview` 渲染 counts 和 disconnected diagnostics。落点：`web/src/app/GraphCanvas.tsx`。
- [x] Graph 结构变化只来自 ShellClient response；`WorkbenchShell` 不直接 patch `workspace.graph`，只在 command success 后替换 `workspace` projection。
- [x] 添加节点只使用已登记 active object；pending/failed import item 不会生成 graph node。
- [x] Connect 使用 UI-only pending connection；成功后清空 pending state。
- [x] Set Path 使用当前 graph node 顺序提交 `path-web-main`，返回后展示 active path 和 path node order。
- [x] i18n 只覆盖静态 UI 文案；node id、object id、path id、warning/error code 原样显示。
- [x] 明确不做项守住：未调用 `energy.compute`、`export.profile`、`project.save_content`；未改 Python core graph / energy / export / Project Content codec；未新增 HTTP/cloud/account/sync。

## 3. 验收场景核对

- [x] 首屏无 session 时 Graph Canvas 显示空态，workspace commands disabled。证据：`web/src/app/WorkbenchShell.test.tsx`。
- [x] Fixture Run 后显示 `graph-a-b`、`node-a`、`node-b`、`path-a-b`、preview counts 和 no disconnected nodes。证据：`web/src/app/WorkbenchShell.test.tsx`。
- [x] Open Workspace 可重复刷新，不丢失已有 nodes/edges。证据：`web/src/app/WorkbenchShell.test.tsx`。
- [x] 选择已登记对象后 Add Node 生成 `node-web-3`，object id 原样可见。证据：`web/src/app/WorkbenchShell.test.tsx`。
- [x] 选择 `node-b` 后 Connect，再点击 `node-web-3` 可提交 edge；重复 connect 不新增重复 edge。证据：`web/src/app/WorkbenchShell.test.tsx`、`web/src/shell/ShellClient.test.ts`。
- [x] Set Path 后显示 `path-web-main` 和 `node-a -> node-b -> node-web-3`。证据：`web/src/app/WorkbenchShell.test.tsx`。
- [x] workspace command error 显示 error code/message/target。证据：`web/src/shell/ShellClient.test.ts` 和现有 command status UI。
- [x] 中文 locale 下 Graph Canvas 静态文案为简体中文，动态 id/code 原样显示。证据：`web/src/app/WorkbenchShell.test.tsx`。
- [x] Browser 插件验证：`http://127.0.0.1:5174/` 页面可读、非空白、无 console warning/error；Browser 点击 Fixture Run 时 CDP click 两次超时，按前端 QA 流程 fallback 到本地 Playwright。
- [x] Playwright Chromium `1280x720` 完成 Fixture Run -> Object B -> Add Node -> Connect -> Set Path，最终无断开节点、无水平溢出、节点无重叠。截图：`/tmp/rxnflow-graph-canvas-desktop.png`。
- [x] Playwright Chromium `390x840` 完成同一交互链，toolbar/canvas/preview 纵向布局无水平溢出、节点无重叠。截图：`/tmp/rxnflow-graph-canvas-narrow.png`。

## 4. 术语一致性

- Graph Canvas：代码命中集中在 `GraphCanvas.tsx`、WorkbenchShell 挂载、i18n 文案和 CSS，语义一致。
- Canvas Node：对应 `GraphNodeSummary` 渲染的 `.graph-node-card`，不本地生成 ChemicalObject。
- Active Graph Node / Pending Connection：只以 React UI state 出现。
- Active Canvas Path：由 `workspace.set_path` response 的 `workspace.active_path_id` 和 paths 渲染。
- Network Preview Panel：只显示结构 counts、active path 和 disconnected diagnostics，不是能量曲线或报告预览。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md`：记录 Graph Canvas MVP、workspace command projection、UI-only selection/pending connection、click-driven 边界、QA 证据和限制。
- [x] `.codestable/architecture/ARCHITECTURE.md`：补充 Web Graph Canvas 术语、模块索引和边界；core ReactionGraph / GraphEditorWorkspace / Energy Engine 语义仍保持核心层边界。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已补充用户可在 Web 工作台添加节点、连接节点、设置 active path 和查看 network preview 的现状能力。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-items.yaml` 中 `web-graph-canvas-mvp` 已由 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-roadmap.md` 中 Graph Canvas 子 feature 状态同步为 done；下一项 `web-energy-profile-panel` 保持 planned。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无新增候选。现有 AGENTS.md 已记录 Web dev server 必须从 `web/` 运行、前端/画布改动需浏览器验证、不要用 `file://` 预览 Vite app。

## 9. 遗留

- 真实 drag/drop、自由拖动、自动布局、缩放/平移持久化、撤销/重做、多选框选仍未实现。
- Graph Canvas 当前只接 fixture workspace commands；真实 Python bridge / HTTP transport 仍待后续 runtime 接入。
- Graph Canvas 不保存 Project Content，不调用 `project.save_content`；持久化格式和同步边界仍是后续决策项。
- Energy Profile Panel 仍未实现；下一步 roadmap item 是 `web-energy-profile-panel`。
