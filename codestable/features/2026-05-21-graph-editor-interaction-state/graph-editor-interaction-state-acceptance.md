# graph-editor-interaction-state 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：codestable/features/2026-05-21-graph-editor-interaction-state/graph-editor-interaction-state-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层：

- [x] `GraphEditorInteractionState` 已落地在 `web/src/app/graphEditorInteractionState.ts`，包含 `mode`、`selection`、`hover`、`dragging`、`pendingEdge`。
- [x] `GraphEditorSelection` 使用 `nodeIds` / `edgeIds` / `pathIds` 数组协议；当前 UI 单选只消费 `nodeIds[0]`，类型不锁死为裸 string。
- [x] `selectGraphEditorNode`、`startGraphEditorConnection`、`completeGraphEditorConnection`、`clearGraphEditorPendingEdge`、`pruneGraphEditorInteractionState` 都是纯函数，不读取 DOM、不调用 ShellClient、不 import repository/runtime。
- [x] `GraphCanvas` props 已从 `selectedNodeId` / `pendingConnectionFromId` 改为 `interactionState`，selected / pending node 从 interaction state 派生。

## 2. 行为与决策核对

- [x] 需求摘要 1/2：新增 interaction state 类型和 helper，并有 `graphEditorInteractionState.test.ts` 覆盖 selection、pending edge、prune。
- [x] 需求摘要 3/4：`WorkbenchShell` 用单个 `graphEditorInteraction` state 替代旧的 `selectedGraphNodeId` / `pendingConnectionFromId`，现有 Open Workspace、Add Node、Connect、Set Path flow 仍通过测试和浏览器验证。
- [x] 需求摘要 5：workspace projection 更新后调用 `pruneGraphEditorInteractionState` 清理 stale node/edge/path 引用，并保留当前 MVP 的 fallback first node 行为。
- [x] 关键决策落地：helper 独立于组件；connect 命令仍由 `WorkbenchShell` 调用 `workspace.connect`；graph 结构变化仍只来自 ShellResponse。
- [x] 挂载点反向核对：本 feature 没有新增路由、shell command、repository schema、Project Content section、runtime env 或第三方注册项；代码引用集中在 `WorkbenchShell`、`GraphCanvas` 和新 helper/test。

## 3. 验收场景核对

- [x] Fixture Run 后 Graph Canvas 仍显示 fixture nodes/path/no disconnected nodes。证据：`WorkbenchShell.test.tsx` 和 Browser smoke。
- [x] Connect 前已选 node 可作为 pending edge source，点击另一个 node 后提交 `workspace.connect`。证据：`WorkbenchShell.test.tsx` 和 Browser smoke。
- [x] 重复 connect 同一 node pair 保持幂等。证据：`WorkbenchShell.test.tsx`。
- [x] Add Node 后新 node 出现在画布，selection/pending state 不引用不存在 node。证据：`WorkbenchShell.test.tsx`、helper prune tests。
- [x] stale selected node、pending edge、hover、dragging node ids 会被清理。证据：`graphEditorInteractionState.test.ts`。
- [x] 反向检查：未新增 `workspace.move_node`、`workspace.remove` 或 Python shell command；未把 interaction state 写入 ShellResponse、Project Content、Browser Project Repository 或 localStorage。
- [x] Browser 验证：`http://127.0.0.1:5175/`，中文界面完成 `运行 Fixture -> 添加节点 -> 连接 -> 设为路径`，最终显示 `path-web-main`、`node-a -> node-b -> node-web-3` 和 `无断开节点`，console warning/error 为 0。截图：`/tmp/rxnflow-graph-interaction-state.png`。

## 4. 术语一致性

- `GraphEditorInteractionState`、`GraphEditorSelection`、`pendingEdge` 命名与 roadmap 第 4.1 节一致。
- 旧局部状态名 `selectedGraphNodeId` / `pendingConnectionFromId` 已从 `WorkbenchShell.tsx` / `GraphCanvas.tsx` 的实现边界移除；`pendingConnectionFromId` 仅作为局部临时变量映射现有 command args。
- `WorkspaceSelection`、`CanvasViewport`、Project Content 等 core / persistence 术语未被前端 helper 重定义。

## 5. 架构归并

- [x] `codestable/architecture/web-workbench.md` 已记录 Graph Editor Interaction State 当前能力、模块职责、稳定边界和 QA 证据。
- [x] `codestable/architecture/ARCHITECTURE.md` 不需要新增入口；本 feature 是 Web Workbench 内部 UI-only state 收敛，不改变系统级模块关系。

## 6. requirement 回写

- `requirement: web-workbench-shell` 已存在。本 feature 没改变用户可见能力边界，只把 Graph Canvas 内部 interaction state 收敛为可复用模型，因此 requirement 无需更新。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-web-graph-editor/rxnflow-web-graph-editor-items.yaml` 中 `graph-editor-interaction-state` 已从 `in-progress` 改为 `done`。
- [x] `codestable/roadmap/rxnflow-web-graph-editor/rxnflow-web-graph-editor-roadmap.md` 第 5 节对应条目已同步为 `done`，对应 feature 填为 `2026-05-21-graph-editor-interaction-state`。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新通用规则。已有 `AGENTS.md` 中的 Web dev server 和浏览器验证要求仍适用。

## 9. 遗留

- 真实 object drag/drop、节点拖动、edge/path 直接编辑、viewport controls 和 workspace persistence 仍按 `rxnflow-web-graph-editor` roadmap 后续条目推进。
- 当前 Browser smoke 只覆盖桌面当前视口；窄屏完整手势矩阵留给后续 `graph-editor-e2e-qa`。

## 10. 验证命令

- `cd web && npm run test -- graphEditorInteractionState.test.ts WorkbenchShell.test.ts`：2 files / 32 tests passed。
- `cd web && npm run build`：通过。
- `cd web && npm run test`：12 files / 93 tests passed。
- `python3 -m unittest discover`：237 tests passed。
- Browser plugin：`http://127.0.0.1:5175/` page identity、非空白、无 overlay、console warning/error 0、Graph Canvas 主链路通过。
