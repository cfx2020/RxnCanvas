# graph-editor-object-drop 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：.codestable/features/2026-05-21-graph-editor-object-drop/graph-editor-object-drop-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：
- [x] `GraphObjectDragPayload`（web/src/app/graphObjectDragPayload.ts）：只包含 `kind=registered-object`、`objectId`、`label`，与方案一致。
- [x] `serializeGraphObjectDragPayload` / `parseGraphObjectDragPayload`（web/src/app/graphObjectDragPayload.ts）：valid payload round-trip；malformed JSON、wrong kind、empty object id、empty label 均返回 `null`，与方案一致。
- [x] `AddObjectNodeRequest`（web/src/app/GraphCanvas.tsx）：`objectId?` 与 `position?` 可选，`GraphCanvas` drop path 会传入两者，toolbar click path 继续传空 request，与方案一致。

**名词层“现状 → 变化”逐项核对**：
- [x] Object Registry：对象按钮保留 click selection，同时新增 `draggable` 和 `application/x-rxnflow-graph-object` payload 写入。
- [x] Graph Canvas：surface 新增 `onDragOver` / `onDrop`，只接受 valid registered-object payload，并把 drop point 映射为 `[x, y]` position。
- [x] Workspace add node：`WorkbenchShell.addObjectNode` 复用 `workspace.add_node`，未新增 shell command。

**流程图核对**（第 2.2 节开头 mermaid 图）：
- [x] `ObjectRegistryPanel` dragstart → `GraphCanvas` dragover/drop → object id 存在性校验 → `workspace.add_node` → `applyWorkspaceResponse` 均有代码落点。

## 2. 行为与决策核对

**需求摘要逐项验证**：
- [x] 已登记对象按钮可拖拽，drag start 写入 `application/x-rxnflow-graph-object`。
- [x] drop 只接受 `kind=registered-object` 且 object id 存在于 `WorkbenchDomainState.objects`。
- [x] drop 位置由 canvas surface bounding rect 转为 `workspace.add_node.position`。
- [x] graph 可见更新只来自 ShellResponse workspace projection。
- [x] click-driven Add Node 保留，作为键盘/agent 友好备用路径。

**明确不做逐项核对**：
- [x] pending/failed import item、raw resource、parser preview item 和浏览器文件没有 graph object drag payload。
- [x] 未实现已有 graph node 拖动、snap/grid、自动布局、多选、undo/redo 或 viewport 持久化。
- [x] 未新增 `workspace.move_node`、`workspace.remove` 或 Python shell command；grep 只发现既有 core graph patch remove 测试。
- [x] 未把 drag payload、drop intent 或 transient pointer position 写入 ShellResponse、Project Content、Browser Project Repository 或 localStorage；localStorage 命中仅为既有 i18n locale preference 与 E2E 清理。

**关键决策落地**：
- [x] D1 自定义 MIME type：`graphObjectDragMimeType = "application/x-rxnflow-graph-object"`。
- [x] D2 payload 最小化：payload helper 只承载 `kind`、`objectId`、`label`，完整对象仍从 `WorkbenchDomainState.objects` 读取。
- [x] D3 drop command 复用 add_node：`WorkbenchShell.addObjectNode` 只扩展 request 参数，仍调用 `workspace.add_node`。
- [x] D4 坐标映射局限在 UI：`canvasPositionFromDrop` 只在 `GraphCanvas` 中计算 position，未写 ChemicalObject。

**挂载点反向核对（可卸载性）**：
- [x] 挂载点 M1：`ObjectRegistryPanel` 对象按钮新增 draggable 行为和 payload 写入。
- [x] 挂载点 M2：`GraphCanvas` surface 新增 drop target event handlers。
- [x] 反向 grep：`graphObjectDragPayload`、MIME type、drag/drop 引用均落在 helper、Object Registry、Graph Canvas、WorkbenchShell tests 和文档内。
- [x] 拔除沙盘推演：删除 helper、ObjectRegistryPanel dragstart、GraphCanvas drop handlers、WorkbenchShell drag tests 后，可回到原 click-driven graph canvas；无 route、schema、shell command 或 repository 残留。

## 3. 验收场景核对

- [x] **S1**：Fixture Run 后 `Object B` 按钮可拖拽，payload 为 `registered-object/object-b`。
  - 证据来源：WorkbenchShell component test。
  - 结果：通过。
- [x] **S2**：drop `Object B` 到 Graph Canvas 后调用 `workspace.add_node(position)`，并显示 ShellResponse 返回的 `node-web-3/object-b`。
  - 证据来源：WorkbenchShell component test；Playwright 渲染页 DragEvent 验证。
  - 结果：通过。
- [x] **S3**：malformed/wrong kind/unknown object id drop 不调用 shell command，不产生 graph node。
  - 证据来源：payload helper test；WorkbenchShell unknown object drop test。
  - 结果：通过。
- [x] **S4**：click-driven Add Node 仍可用。
  - 证据来源：WorkbenchShell component test。
  - 结果：通过。
- [x] **S5-S7**：范围守护项未越界。
  - 证据来源：scope grep 和代码 review。
  - 结果：通过。
- [x] **S8**：`npm run test` 通过。
  - 证据来源：13 files / 97 tests passed。
  - 结果：通过。
- [x] **S9**：`npm run build` 通过。
  - 证据来源：Vite build completed。
  - 结果：通过。
- [x] **S10**：Browser dev preview 页面非空白、无 framework overlay、console clean；HTML5 drag/drop 行为用 Playwright DragEvent fallback 验证。
  - 证据来源：Browser `http://127.0.0.1:5175/` 页面健康检查；Playwright DragEvent render validation。
  - 结果：通过；Browser CUA 鼠标拖动未稳定触发 HTML5 drop，记录为自动化限制。

补充验证：
- `npm run test -- graphObjectDragPayload.test.ts WorkbenchShell.test.ts`：2 files / 30 tests passed。
- `python3 -m unittest discover`：237 tests passed。
- Playwright DragEvent 验证：node count 2 → 3，新 node 文本为 `Object B / node-web-3 / object-b / H2`，console warning/error 为 0。

## 4. 术语一致性

- `GraphObjectDragPayload`：代码命中集中在 helper、tests、design/architecture/acceptance，含义一致。
- `graphObjectDragMimeType` / `application/x-rxnflow-graph-object`：代码命中集中在 helper、Object Registry、Graph Canvas 和 tests，含义一致。
- `AddObjectNodeRequest`：仅用于 `GraphCanvas` 与 `WorkbenchShell` 之间的前端 UI request，未外泄到 shell DTO。
- 防冲突：`workspace.move_node`、`workspace.remove` 未新增；`localStorage` 命中为既有 i18n/E2E 用途，不涉及 drag/drop persistence。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md`：已记录 Graph Object Drop 当前能力、`graphObjectDragPayload.ts` 模块职责、Object Registry drag source、Graph Canvas drop target、稳定边界和 QA 证据。
- [x] 架构边界确认：Graph Canvas 仍只读 `WorkbenchDomainState.workspace.graph`，结构变化只来自 ShellResponse；drop payload 不进入 Project Content / Browser Project Repository / ReactionGraph。
- [x] `AGENTS.md`：本 feature 未暴露需要补入项目硬约束的新内容。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md`：已补充“已登记对象可从对象面板拖入画布创建节点”的用户故事、解决方案和边界。
- [x] req 边界已明确：pending/failed import item、raw resource、parser preview item、浏览器文件不能直接拖成 graph node；已有节点自由拖动、自动布局、缩放/平移持久化、undo/redo、多选仍未实现。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-graph-editor/rxnflow-web-graph-editor-items.yaml`：`graph-editor-object-drop` 已从 `in-progress` 更新为 `done`，feature 指向 `2026-05-21-graph-editor-object-drop`。
- [x] `.codestable/roadmap/rxnflow-web-graph-editor/rxnflow-web-graph-editor-roadmap.md`：子 feature 清单已同步为 `done` 并补充验收备注。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的内容。既有 Web 预览命令、Browser/Playwright 验证边界和 CodeStable 流程规则足够覆盖后续工作。

## 9. 遗留

- 已有 graph node 自由拖动、位置更新、snap/grid 与稳定布局显示：进入后续 `graph-editor-node-layout`。
- 直接连线/删除节点边/path order 编辑：进入后续 `graph-editor-edge-path-editing`。
- pan/zoom/fit/reset 与 viewport persistence：进入后续 `graph-editor-viewport-controls` 和 `graph-editor-workspace-persistence`。
- 真实浏览器完整交互矩阵：进入后续 `graph-editor-e2e-qa`。
