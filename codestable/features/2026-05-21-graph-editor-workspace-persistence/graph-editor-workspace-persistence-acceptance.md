---
doc_type: feature-acceptance
feature: 2026-05-21-graph-editor-workspace-persistence
status: accepted
accepted_at: 2026-05-21
summary: 验收 Web Graph Canvas node positions、viewport、selection 和 active path 的显式 Project Content 保存/恢复闭环
tags: [web, graph-editor, workspace, persistence, project-content, acceptance]
---

# graph-editor-workspace-persistence 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：`codestable/features/2026-05-21-graph-editor-workspace-persistence/graph-editor-workspace-persistence-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `WorkspaceSelectArgs`：`session_id` 与 `selection.node_ids/edge_ids/path_ids` 已在 `rxnflow/platform.py`、`web/src/shell/types.ts` 和 `web/src/shell/fixtureTransport.ts` 落地。
- [x] `WorkspaceSelectionSummary`：`web/src/shell/types.ts` 定义 `node_ids`、`edge_ids`、`path_ids`，`rxnflow/platform.py` 的 `_workspace_summary` 返回同形状 JSON-safe projection。
- [x] `WorkspaceSummary.selection`：Platform Shell、fixture transport、workbench snapshot、workspace command response、project open/save response 都可携带 selection projection。
- [x] `project.save_content(include_content_files=true)` / `project.open(content_files)`：fixture transport 已按当前 `chemical-objects-v1`、`reaction-graphs-v1`、`workspaces-v1` state 生成和恢复 content files。

**名词层“现状 -> 变化”逐项核对**：

- [x] core `WorkspaceSelection` 仍是 workspace-only state，不写 ReactionGraph；node positions 仍在 `ReactionGraph.nodes[].position`，viewport/selection/active path 仍在 `WorkspaceSnapshot`。
- [x] Platform Shell 新增 `workspace.select` dispatcher / handler，缺失 selection 返回 `invalid_input target=selection`，未知 node/edge/path 返回 `graph_invalid target=node_id|edge_id|path_id`。
- [x] GraphEditorWorkspaceService 删除 graph item 或 apply patches 后会 prune selection，避免保存失效引用。
- [x] Web node/edge/path click 发送 `workspace.select`；connect target click 仍发送 `workspace.connect`，不被 selection command 抢占。
- [x] WorkbenchShell 从 `WorkspaceSummary.selection` 恢复 `GraphEditorInteractionState.selection`，旧 fallback 不再强制选第一个 node。

**流程图核对**：

- [x] `User selects node/edge/path -> workspace.select -> ShellResponse WorkspaceSummary.selection -> GraphEditorInteractionState` 有代码落点：`WorkbenchShell.tsx`、`fixtureTransport.ts`、`platform.py`、`workspace.py`。
- [x] `Save Bridge Session -> project.save_content(include_content_files=true) -> Browser Project Repository writes bytes` 复用 Project Sidebar bridge 路径，并通过 component test 验证 content files。
- [x] `Open Bridge -> project.open(content_files, load_content=true) -> workbench.snapshot -> GraphCanvas restored state` 有 component test 和 Playwright fallback 证据。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 用户选择 node、edge 或 path 后，Web 通过 `workspace.select` 写入 shell session。
- [x] `WorkspaceSummary.selection` 返回后，WorkbenchShell 用 projection 同步 GraphCanvas selection。
- [x] Save Bridge Session 生成的 content files 包含当前 node positions、viewport、selection 和 active path。
- [x] Open Bridge / restored snapshot 后，GraphCanvas 可恢复 node position、viewport、selected path 和 path order。
- [x] fixture transport 支持同一 open/save 语义，Web component tests 不依赖 Python bridge。

**明确不做逐项核对**：

- [x] 未实现自动保存、后台同步、云存储、账号、多端冲突合并或 CRDT。
- [x] 未保存 hover、dragging、pending edge、Path Order Draft、surface DOM size、toolbar pressed state 或 Object Registry active object。
- [x] 未新建浏览器私有 graph layout schema，未使用 localStorage 保存图谱状态。
- [x] 未改变 Project Content `project-content-v1` / `workspaces-v1` schema。
- [x] 未新增 undo/redo/history、完整 E2E 矩阵或 bundle import/export IO；真实浏览器矩阵仍由后续 `graph-editor-e2e-qa` 承接。

**关键决策落地**：

- [x] 复用 WorkspaceSnapshot：graph layout、viewport、selection、active path 均沿用现有 core schema。
- [x] 显式保存：拖动、缩放、选择、path order apply 只更新 shell session；只有 Save Bridge Session 写 Browser Project Repository。
- [x] ShellResponse authority：Web 可先更新交互态，但最终 graph、viewport、selection 和 active path 都以 workspace projection 为准。
- [x] 恢复不自动补选：restored workspace projection 缺失 selection 时只做 prune，不强制选择第一个 node。
- [x] fixture content files 可读写：fixture save/open 使用同 schema bytes 保存并恢复当前 graph/workspace。

**挂载点反向核对（可卸载性）**：

- [x] Platform Shell workspace command dispatcher：`workspace.select`、`_run_workspace_select`、`_required_workspace_selection`、`_workspace_summary.selection`。
- [x] Core workspace：selection validation、selection prune、remove/apply patches 后清理失效 selection。
- [x] Web shell DTO / fixture transport：`WorkspaceSelectionSummary`、fixture `workspace.select`、fixture content files save/open restore。
- [x] WorkbenchShell / graph interaction：node/edge/path selection command 编排、restored selection sync、connect target 不抢占。
- [x] Tests / docs：Python tests、ShellClient tests、WorkbenchShell tests、architecture/requirement/roadmap/acceptance 落档。
- [x] 反向 grep：`workspace.select|WorkspaceSelectionSummary|WorkspaceSummary.selection|localStorage|auto.?save|autosave|cloud|CRDT` 命中均落在上述挂载点、测试或设计边界内；scope grep 未发现实现层新增自动保存、localStorage graph state 或云同步。
- [x] 拔除沙盘推演：删除 Platform Shell select handler、core selection validation/prune、Web DTO/fixture select branch、WorkbenchShell selection command/sync 和对应 tests 后，可卸载本 feature；既有 `workspaces-v1` codec、viewport、move/remove/set_path 等前置能力保留。

## 3. 验收场景核对

- [x] **S1**：Platform Shell `workspace.select(selection={node_ids:[...]})` 返回 workspace projection 中相同 selection。
  - 证据来源：`tests/test_platform_shell_baseline.py`。
  - 结果：通过。
- [x] **S2**：Platform Shell 允许空 selection，并清空 workspace selection。
  - 证据来源：`tests/test_platform_shell_baseline.py`。
  - 结果：通过。
- [x] **S3**：Platform Shell 对未知 node/edge/path id 返回结构化错误，不更新 selection。
  - 证据来源：`tests/test_platform_shell_baseline.py`、`tests/test_graph_editor_workspace.py`。
  - 结果：通过。
- [x] **S4**：`WorkspaceSummary.selection` 在 fixture run、workbench snapshot、workspace command response 和 project open/save 后可见。
  - 证据来源：`web/src/shell/ShellClient.test.ts`、`web/src/app/WorkbenchShell.test.tsx`。
  - 结果：通过。
- [x] **S5**：Web fixture transport 支持 `workspace.select`，返回 JSON-safe `WorkspaceCommandData.command="workspace.select"`。
  - 证据来源：`web/src/shell/ShellClient.test.ts`。
  - 结果：通过。
- [x] **S6**：GraphCanvas 选择 node、edge、path 后会发送 `workspace.select`；connect 目标点击仍发送 `workspace.connect`。
  - 证据来源：`web/src/app/WorkbenchShell.test.tsx`。
  - 结果：通过。
- [x] **S7**：Save Bridge Session 生成的 Project Content files 能反映当前 node positions、viewport、selection 和 active path。
  - 证据来源：`web/src/app/WorkbenchShell.test.tsx`。
  - 结果：通过。
- [x] **S8**：Open Bridge / restored snapshot 后，GraphCanvas 恢复 node position、viewport、selected node/edge/path 和 path order。
  - 证据来源：`web/src/app/WorkbenchShell.test.tsx` 和 Playwright fallback。
  - 结果：通过。
- [x] **S9**：删除 node/edge 后 restored selection 不保留失效 id，cascade 仍来自 ShellResponse / fixture state。
  - 证据来源：`tests/test_graph_editor_workspace.py`、`web/src/shell/ShellClient.test.ts`。
  - 结果：通过。
- [x] **S10-S11 范围守护**：未保存 transient interaction state，未新增 schema、localStorage graph persistence、自动保存、云同步或账号系统。
  - 证据来源：代码 review、scope grep、完整测试。
  - 结果：通过。
- [x] **S12**：`npm run test` 通过。
  - 证据来源：`cd web && npm run test`。
  - 结果：通过，16 个测试文件 / 129 个测试通过；保留既有 `--localstorage-file` 无有效路径 warning。
- [x] **S13**：`npm run build` 通过。
  - 证据来源：`cd web && npm run build`。
  - 结果：通过。
- [x] **S14**：`python3 -m unittest discover` 通过。
  - 证据来源：Python unittest。
  - 结果：通过，244 tests OK。
- [x] **S15**：Browser dev preview 验证页面非空白、无 framework overlay、console error/warn clean；保存/恢复链路有可观察结果。
  - 证据来源：Browser 插件 + Playwright fallback。
  - 结果：Browser 插件可读取 `http://127.0.0.1:5173/` DOM，但点击路径在本地 Vite 页面触发 CDP `Runtime.evaluate` timeout。按前端 QA 流程 fallback 到 Playwright Chromium：页面标题 `RxnFlow Workbench`，body 非空白，Fixture loaded，Save Bridge 后 Open Bridge 恢复 `120%` zoom 和 selected path，`restoredSelected=true`、`hasPath=true`、`overlayText=false`、`consoleIssues=[]`，IndexedDB database `rxnflow-browser-projects` 存在。截图：`/tmp/rxnflow-workspace-persistence.png`。

## 4. 术语一致性

- `Workspace Selection` / `WorkspaceSelection` / `WorkspaceSelectionSummary`：均表示 node/edge/path id 集合，不等同于 hover、dragging、pending edge 或 Object Registry active object。
- `workspace.select`：代码命中在 Platform Shell、Web Shell DTO、fixture transport、WorkbenchShell 和 tests，均表示只更新 workspace selection projection。
- `Workspace Persistence Bridge`：文档和实现均指 Project Sidebar 显式 Save/Open Bridge Session，不表示自动保存。
- `Save Bridge Session`：只在用户显式触发时写 Browser Project Repository bytes，不是拖动实时写盘。
- 防冲突：未把本能力命名为 localStorage graph state、cloud sync、autosave、browser graph schema、GraphPatch selection 或 ReactionGraph selection。

## 5. 架构归并

- [x] `codestable/architecture/core-platform.md`：已归并 GraphEditorWorkspaceService `select`、selection 校验/prune、Platform Shell `workspace.select` command、`WorkspaceSummary.selection` projection 和错误语义。
- [x] `codestable/architecture/web-workbench.md`：已归并 Graph Canvas selection 通过 `workspace.select` 进入 workspace projection、Save/Open Bridge 恢复 node position / viewport / selection / active path、fixture content files restore，以及 transient UI state 不保存边界。
- [x] `codestable/architecture/ARCHITECTURE.md`：已同步总入口术语、PlatformShellService command list 和 Web Graph Canvas 当前能力，移除“Graph Canvas selection 完全 UI-only”的旧边界。

归并后，没读过 design 的读者可从 architecture 直接看到这个能力的存在、显式保存边界、WorkspaceSnapshot 复用策略和不自动保存约束。

## 6. requirement 回写

- [x] `codestable/requirements/web-workbench-shell.md` 已更新用户故事、解决方案和边界：用户可通过显式保存/打开恢复图谱节点位置、视口、selection 和 active path；Object Registry active object、hover、dragging、pending edge、Path Order Draft 等仍是 UI-only。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-web-graph-editor/rxnflow-web-graph-editor-items.yaml` 中 `graph-editor-workspace-persistence` 已标为 `done`。
- [x] `codestable/roadmap/rxnflow-web-graph-editor/rxnflow-web-graph-editor-roadmap.md` 第 5 节同步为 `done`，并把 observation 中 `WorkspaceSummary` 字段是否足够的疑问更新为已核实/已补齐。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新通用规则。已有“Web 工作台预览必须从 `web/` 运行 `npm run dev`”和“前端视觉/交互改动必须浏览器验证”的规则仍适用。

## 9. 遗留

- 后续优化点：真实桌面/窄屏完整 save/open restore E2E 矩阵由 `graph-editor-e2e-qa` 承接。
- 已知限制：Browser 插件当前可读页面和 DOM，但点击本地 Vite 页面时仍可能出现 CDP `Runtime.evaluate` timeout；本次已记录并使用 Playwright fallback 完成可观察保存/恢复验收。
- 实现阶段顺手发现：fixture transport 之前的 Project Content files 不是当前 workspace state 的真实序列化；本 feature 已修复为保存/恢复当前 chemical objects、reaction graphs 和 workspaces。
