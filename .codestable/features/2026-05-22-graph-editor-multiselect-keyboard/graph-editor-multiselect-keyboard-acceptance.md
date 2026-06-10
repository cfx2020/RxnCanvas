---
doc_type: feature-acceptance
feature: 2026-05-22-graph-editor-multiselect-keyboard
status: accepted
summary: Graph Canvas 已支持 mixed multi-selection、rubber-band node selection、Delete/Escape shortcuts 和 selected node nudge
tags: [web, graph-editor, multi-select, keyboard, acceptance]
---

# Graph Editor Multiselect Keyboard 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：.codestable/features/2026-05-22-graph-editor-multiselect-keyboard/graph-editor-multiselect-keyboard-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `GraphEditorSelectionMode = "replace" | "add" | "toggle"` 已在 `web/src/app/graphEditorInteractionState.ts` 落地，node/edge/path selection helper 均支持 mode 参数。
- [x] `GraphEditorDraggingState` 已包含 `rubber-band` draft，且 draft 只存在于 Web interaction state。
- [x] `GraphEditorKeyboardIntent` 已包含 delete-selection、clear-selection 和 nudge-selection，`resolveGraphEditorKeyboardIntent` 只解析 Delete/Backspace/Escape/Arrow keys。
- [x] Rubber-band selection 通过 `resolveGraphEditorRubberBandNodeIds` 选择中心点落在矩形内的 nodes，首轮未做 edge/path hit testing。
- [x] `NudgeGraphNodesRequest` 已在 `WorkbenchShell.tsx` 内部编排，按 selected node ids 顺序复用 `workspace.move_node`，没有新增 shell/core command。
- [x] `Connect` fallback 只在纯单个 selected node 时可用，multi/mixed selection 不产生 source 歧义。

流程图核对：

- [x] Click / Shift-click item → Selection Intent → `workspace.select` → ShellResponse projection 已落在 `GraphCanvas.tsx` 与 `WorkbenchShell.tsx`。
- [x] Delete / Backspace / Delete Selected → `workspace.remove`，Escape → empty `workspace.select`，Arrow → sequential `workspace.move_node` 均已落地。
- [x] Empty select-mode canvas drag → Rubber-band draft → release node ids → `workspace.select` 已落地。

## 2. 行为与决策核对

- [x] 普通点击 node/edge/path 替换 selection；Shift-click 对 node/edge/path add/toggle，允许 mixed selection。
- [x] Rubber-band 只在 select mode 空白画布 drag 启动；无 Shift 时 replace node selection，Shift 时 add nodes。
- [x] Delete Selected button 和 Delete/Backspace 都复用当前 selection 的 node/edge/path ids 调用 `workspace.remove`。
- [x] Escape 调用 empty `workspace.select`，并清理 pending edge / rubber-band draft。
- [x] Arrow keys 只对 selected nodes 发送 `workspace.move_node`，edge/path selection 不产生 nudge command。
- [x] 多选或 mixed selection 下 Node Composition、Edge Label Draft、Path Order Draft 均不初始化可编辑 draft。

明确不做核对：

- [x] 未新增 Python core / Platform Shell command、GraphPatch op、Project Content schema、Browser Project Repository write、localStorage persistence、autosave 或第三方 diagramming library。
- [x] 未新增 `workspace.move_nodes`、`workspace.keyboard`、`workspace.multiselect` 或 batch selection command。
- [x] 未实现 undo/redo/history、minimap、wheel/pinch、endpoint reconnect、edge/path nudge、edge/path rubber-band hit testing、freeform lasso 或 snapping preference UI。
- [x] Keyboard shortcuts 未注册为全局 app 快捷键，editable target 内不拦截。
- [x] 未改变 direct edge gesture、click-driven Connect fallback、node body drag、object drop、canvas pan、Edge Label Draft、Path Order Draft、EnergyProfile 或 Report Export 领域行为。

关键决策落地：

- [x] D1 复用 Workspace Selection 数组协议：`workspace.select(selection.node_ids/edge_ids/path_ids)` 仍是 authority。
- [x] D2 Shift-click toggle、rubber-band replace/add：helper tests 和 component tests 均覆盖。
- [x] D3 键盘范围限定 Graph Canvas：`GraphCanvas` root focusable，keydown 只在 graph scope target 内生效。
- [x] D4 nudge 复用 `workspace.move_node`：`WorkbenchShell.nudgeGraphNodes` 顺序发送，失败即停止。
- [x] D5 single-item editors 保守启用：composition / edge label helper 只接受纯单选。
- [x] D6 projection authority 不变：可见结果只从 ShellResponse workspace projection 更新。

挂载点反向核对：

- [x] 挂载点均落在 `graphEditorInteractionState.ts`、`GraphCanvas.tsx`、`WorkbenchShell.tsx`、`compositionDraftState.ts`、`edgeLabelDraftState.ts`、相关 tests 和 `workbench.css`。
- [x] grep 未发现本 feature 挂入 Python core、Platform Shell、Project Content Store、Browser Project Repository、EnergyProfilePanel、ReportExportPanel、localStorage 或第三方 graph library。
- [x] 拔除沙盘推演：移除上述 Web interaction/UI/orchestration/test/style 挂载点后，只会回到原单选/无快捷键行为，不留下 core/schema/autosave 残留。

## 3. 验收场景核对

- [x] S1-S4 helper selection/rubber-band/prune：`web/src/app/graphEditorInteractionState.test.ts` 覆盖 replace/add/toggle、toggle empty、stale prune 和 rectangle node selection。
- [x] S5-S9 GraphCanvas selection/rubber-band 回归：`web/src/app/WorkbenchShell.test.tsx` 覆盖普通点击、Shift toggle、rubber-band release、pan mode 不误触发和 direct edge gesture 保持可用。
- [x] S10-S15 keyboard/delete/nudge：`web/src/app/WorkbenchShell.test.tsx` 覆盖 Delete/Backspace、empty delete no-op、Escape、Arrow nudge、edge/path no nudge 和 input 内按键不触发。
- [x] S16-S17 single-item editor guard / Connect fallback：component tests 覆盖 multi/mixed selection 不初始化单对象 draft，Connect fallback 只在纯单 node selection 可用。
- [x] S18 scope guard：`git show --stat` 和 grep 核对未新增 core/schema/autosave/energy/export 变更。
- [x] S19 `cd web && npm run test -- --run` 通过。
- [x] S20 `cd web && npm run build` 通过。
- [x] S21 浏览器验证通过：Vite dev server 因 5173-5175 被占用实际运行在 `http://127.0.0.1:5176/`；desktop 验证 fixture、Shift 多选、Arrow nudge、Escape clear，narrow `390x844` 验证页面级 graph/canvas 无水平溢出，当前 5176 console clean。

## 4. 术语一致性

- `Multi-target Selection` / `WorkspaceSelection`：代码继续使用 `WorkspaceSummary.selection` / `workspace.select` 数组字段，无 Web-only authority。
- `Selection Intent` / `GraphEditorSelectionMode`：replace/add/toggle 命名与 design 一致。
- `Rubber-band Selection Draft`：只以 `dragging.kind === "rubber-band"` 存在于 Web interaction state 和 CSS overlay。
- `Graph Keyboard Intent`：`resolveGraphEditorKeyboardIntent` 命名与 design 一致，未出现全局 shortcut 命名。
- `Node Nudge`：只出现在 Web orchestration request 和 selected node move 逻辑，不引入 batch move command。
- 防冲突：grep 未发现 `workspace.move_nodes`、`workspace.keyboard`、`workspace.multiselect` 或新的 history/autosave schema。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md` 已归并 Graph Editor Multi-select / Keyboard 当前能力、UI-only draft 边界、single-item editor guard、keyboard scope、nudge sequencing 和仍不做的 edge/path nudge、wheel/minimap/history 等限制。
- [x] core / platform architecture 无需更新：本 feature 复用既有 `workspace.select`、`workspace.remove` 和 `workspace.move_node`，没有改变 Python contract。
- [x] `AGENTS.md` 无需更新：现有 Web 预览与验证命令已覆盖本 feature。

## 6. Requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已更新用户故事、解决方案和边界：用户可多选、框选、Delete/Backspace/Escape、方向键微调 selected nodes；仍不做 undo/redo、minimap、wheel/pinch、edge endpoint reconnect、autosave 或全局快捷键。

## 7. Roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-items.yaml` 中 `graph-editor-multiselect-keyboard` 已从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-roadmap.md` 第 5 节已同步状态、feature 目录和完成备注；第 6/7 节已更新下一步候选与观察项。
- [x] YAML 已用 `.codestable/tools/validate-yaml.py` 校验。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- 无候选。本 feature 未暴露新的通用环境、工具或工作流约束；现有 AGENTS.md 已要求 Web dev server 从 `web/` 启动并做浏览器验证。

## 9. 遗留

- 后续优化点：`graph-editor-wheel-minimap` 可继续补 wheel/pinch zoom 和 minimap navigation。
- 后续优化点：`graph-editor-lightweight-history` 可复用本 feature 的 selection / nudge 边界做 runtime-only undo/redo。
- 已知限制：Rubber-band 首轮只选择 nodes，不做 edge/path hit testing；nudge 只移动 nodes；多选下不做批量编辑 composition/edge label/path order。

## 10. 验证记录

- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-22-graph-editor-multiselect-keyboard/graph-editor-multiselect-keyboard-checklist.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-items.yaml --yaml-only`：通过。
- `cd web && npm run test -- --run`：通过，22 files / 218 tests。
- `cd web && npm run build`：通过。
- `python3 -m unittest discover`：通过，304 tests。
- `git diff --check`：通过。
