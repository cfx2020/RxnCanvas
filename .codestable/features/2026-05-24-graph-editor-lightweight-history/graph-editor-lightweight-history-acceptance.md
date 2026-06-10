---
doc_type: feature-acceptance
feature: 2026-05-24-graph-editor-lightweight-history
status: accepted
summary: Graph Canvas 已支持 layout、viewport、selection 和 selected node nudge 的 runtime-only bounded undo/redo
tags: [web, graph-editor, history, undo-redo, acceptance]
---

# Graph Editor Lightweight History 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-24
> 关联方案 doc：.codestable/features/2026-05-24-graph-editor-lightweight-history/graph-editor-lightweight-history-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `GraphEditorHistoryEntry` 已在 `web/src/app/graphEditorHistory.ts` 落地，类型区分 `layout`、`viewport`、`selection` 和 `nudge`。
- [x] `GraphEditorHistoryState` 已落地 `undo` / `redo` / `running` / `error` / `limit`，默认 limit 为 20。
- [x] `GraphEditorNodePositionSnapshot`、`GraphEditorSelectionSnapshot` 已落地，node position、selection 和 viewport snapshot 不使用 loose dict 在 UI 编排里扩散。
- [x] `pushGraphEditorHistoryEntry` 会跳过 no-op、清空 redo，并把 undo stack 限制在 20 条。
- [x] `staleGraphEditorHistoryReference` 在 replay 前检查 node / edge / path id 是否仍存在。
- [x] `replayGraphEditorHistoryEntry` 位于 `WorkbenchShell.tsx`，Undo/Redo 仍发送既有 `workspace.move_node`、`workspace.set_viewport` 和 `workspace.select`，不直接 patch `WorkbenchDomainState.workspace`。

流程图核对：

- [x] Reversible graph edit succeeds -> capture before/after -> push bounded history entry 已落在 viewport、selection、nudge 和 layout 四条成功路径。
- [x] Destructive / unsupported edit succeeds -> clear graph editor history 已落在 add node、connect、delete、path order、edge label、node composition、Energy Profile point selection、Fixture Run / Open Bridge / workspace scope change。
- [x] Undo/Redo -> preflight refs -> replay via workspace commands -> ShellResponse projection -> entry transfer 已落地；stale 或 command failed 时显示错误并保留 entry。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] Graph Canvas 显示 Undo / Redo buttons，按钮 disabled/enabled 跟随 history stack 和 replay running state。
- [x] Graph focus scope 内 `Ctrl/Cmd+Z` 触发 Undo，`Ctrl/Cmd+Shift+Z` 和 `Ctrl+Y` 触发 Redo；输入框内不劫持原生编辑。
- [x] History stack bounded 到 20，push 新 entry 清空 redo。
- [x] 首轮只记录 layout、viewport、selection 和 selected node nudge。
- [x] layout / nudge replay 按 stable node id 顺序调用 `workspace.move_node`。
- [x] viewport replay 调用 `workspace.set_viewport`，selection replay 调用 `workspace.select`。
- [x] unsupported graph edits 清空 history，不提供误导性 undo。
- [x] history 不参与 Save Bridge Session、Project Content、Browser Project Repository、ShellResponse 或 localStorage。

明确不做核对：

- [x] 未新增 Python core / Platform Shell command、Project Content schema、Browser Project Repository write、localStorage persistence、autosave 或第三方 history dependency。
- [x] 未实现 delete、add node、connect、path order、edge label、node composition、correction、energy compute、report export 的 undo/redo。
- [x] 未实现跨 workspace、跨 session、跨 reload、跨浏览器 tab、协作或 CRDT history。
- [x] 未新增 `workspace.undo`、`workspace.redo` 或 batch history shell command。

关键决策落地：

- [x] D1 History 放在 WorkbenchShell UI state：`graphEditorHistory` / refs 只存在于 Web runtime。
- [x] D2 只在命令成功后入栈：失败路径直接返回，不 push entry。
- [x] D3 Replay 仍走 shell command：Undo/Redo 可见结果来自 ShellResponse projection。
- [x] D4 结构修改清空 history：destructive / unsupported edits 调用 reset。
- [x] D5 entry 类型化快照：helper type 覆盖 node positions、selection 和 viewport。
- [x] D6 buttons 是主 fallback，快捷键是增量：UI button 和 keyboard intent 都有测试覆盖。

挂载点反向核对：

- [x] 本 feature 挂载点为 `graphEditorHistory.ts` / tests、`WorkbenchShell.tsx` / tests、`GraphCanvas.tsx`、`graphEditorInteractionState.ts` / tests、`messages.ts`、`workbench.css`。
- [x] grep / diff 核对未挂入 Python core、Platform Shell、Project Content Store、Browser Project Repository、EnergyProfileEngine、ReportExportService、localStorage 或第三方 history library。
- [x] 拔除沙盘推演：移除上述 Web helper/UI/test/style/i18n 挂载点后，系统回到无 history 的 Graph Canvas；core/schema/repository/autosave 无残留需要清理。

## 3. 验收场景核对

- [x] S1-S2 helper stack / no-op：`graphEditorHistory.test.ts` 覆盖 bounded push、redo clear、viewport / selection / node position no-op。
- [x] S3-S6 viewport / selection / nudge / layout replay：`WorkbenchShell.test.tsx` 覆盖 Undo/Redo 发送既有 workspace commands 并由 projection 更新可见状态。
- [x] S7 layout no-op / failure 不入栈：component tests 覆盖 no-op 和失败路径不产生 history entry。
- [x] S8-S10 unsupported edits 和 scope 切换清空：component tests 覆盖 delete、add/connect/path order/edge label/node composition/Energy Profile point selection、Fixture Run / Open Bridge 清空或不记录 history。
- [x] S11 stale reference：helper 与 component tests 覆盖 stale node/edge/path preflight，不发送 shell command，entry 保留。
- [x] S12 replay running：component tests 覆盖 running 时 Undo/Redo disabled，成功后才移动 entry。
- [x] S13-S14 shortcuts：`graphEditorInteractionState.test.ts` 覆盖 graph scope undo/redo shortcuts 和 editable target guard。
- [x] S15 responsive UI：Browser 插件 desktop `1280x720` 与 narrow `390x840` 验证 Undo/Redo controls 可见、无重叠、无水平溢出。
- [x] S16-S17 scope guard：代码 review 和 grep 确认没有 history persistence、core/shell/schema/repository/autosave/third-party dependency 变更。
- [x] S18 `cd web && npm run test -- --run` 通过，23 files / 238 tests。测试进程仍输出既有 `--localstorage-file` warning，但 suite 全绿。
- [x] S19 `cd web && npm run build` 通过。
- [x] S20 浏览器验证通过：从 `web/` 启动 Vite 临时 `http://127.0.0.1:5178/`，页面非空白、无 framework overlay、console warning/error 为空；Zoom In 后 Undo 回到 `100%`，Redo 回到 `120%`。

## 4. 术语一致性

- Graph Editor History：代码、i18n、架构文档均指 Web Graph Canvas runtime history，不是 Project Content history。
- History Entry：代码中以 discriminated union 表达四类 entry，和方案术语一致。
- History Replay：`replayGraphEditorHistoryEntry` 只重放 shell commands，不直接 patch domain state。
- Runtime-only Stack：`GraphEditorHistoryState` 只在 WorkbenchShell React state/ref 中维护。
- Stale Entry：`staleGraphEditorHistoryReference` 和 ShellError `graph_history_stale` 表达一致。
- Destructive Edit：delete / add / connect / path order / edge label / composition 等成功后清空 history，不编造 inverse。
- 防冲突：grep 未发现 `workspace.undo`、`workspace.redo`、history localStorage key、Project Content history schema 或 third-party history package。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md` 已归并 Graph Editor Lightweight History：runtime-only stack、四类 entry、20 条上限、shell command replay、stale/error 语义、unsupported edits clear、不写 Project Content / repository / ShellResponse / localStorage，以及 Browser QA 记录。
- [x] core / platform architecture 无需更新：本 feature 复用既有 `workspace.move_node`、`workspace.set_viewport` 和 `workspace.select`，没有改变 Python shell contract。
- [x] `AGENTS.md` 无需更新：现有 Web 预览和浏览器验证要求已覆盖本 feature；本次未暴露新的通用环境约束。

## 6. Requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已更新用户故事：用户可撤销或重做最近一次 layout、viewport、selection 或节点微调。
- [x] 解决方案已补充 Undo/Redo buttons、graph scoped shortcuts、20 条 runtime undo entry、shell command replay 和失败/stale 行为。
- [x] 边界已更新：仍不支持删除撤销、add/connect/path order/edge label/composition 撤销、跨 reload history、持久化 history 或 viewport auto persistence。

## 7. Roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-items.yaml` 中 `graph-editor-lightweight-history` 已从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-roadmap.md` 第 5/6/7 节已同步状态、完成备注、下一步候选和观察项。
- [x] Roadmap YAML 已用 `.codestable/tools/validate-yaml.py` 校验。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- 无候选。本 feature 未暴露新的通用环境、工具或工作流约束；现有 AGENTS.md 已明确 Vite 预览命令和浏览器验证要求。

## 9. 遗留

- 后续优化点：`graph-editor-advanced-e2e-qa` 可把 Undo/Redo 纳入 Playwright desktop graph editor matrix，而不只依赖 component tests + Browser 手工验证。
- 后续优化点：未来若要支持 delete undo、operation log、跨 reload history 或协作 undo，需要另起 roadmap / feature，不应扩展当前 runtime-only stack。
- 已知限制：history 只覆盖当前 Web runtime 内的 layout、viewport、selection 和 selected node nudge；fixture run、open bridge、workspace/session 切换会清空 history。

## 10. 验证记录

- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-24-graph-editor-lightweight-history/graph-editor-lightweight-history-checklist.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-items.yaml --yaml-only`：通过。
- `cd web && npm run test -- --run`：通过，23 files / 238 tests。
- `cd web && npm run build`：通过。
- `python3 -m unittest discover`：通过，304 tests。
- Browser 插件 desktop `1280x720` / narrow `390x840`：Fixture Run、Zoom In、Undo、Redo、console clean、无水平溢出、Undo/Redo controls 无重叠。
- `git diff --check`：通过。
