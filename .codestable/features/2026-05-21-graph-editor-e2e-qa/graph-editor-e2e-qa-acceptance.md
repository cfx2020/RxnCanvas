---
doc_type: feature-acceptance
feature: 2026-05-21-graph-editor-e2e-qa
status: accepted
accepted_at: 2026-05-21
summary: 验收 Web Graph Editor 桌面/窄屏真实浏览器回归矩阵
tags: [web, graph-editor, e2e, playwright, qa, acceptance]
---

# graph-editor-e2e-qa 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：`.codestable/features/2026-05-21-graph-editor-e2e-qa/graph-editor-e2e-qa-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] Graph Editor E2E helper 已落地在 `web/e2e/workbench-helpers.ts`，覆盖 registered object drag/drop、node drag、viewport controls、path reorder、edge delete、Save/Open Bridge restore 和 framework overlay 检查。
- [x] Desktop Graph Editor Journey 已落地在 `web/e2e/workbench-journey.spec.ts`，测试名为 `desktop graph editor matrix covers drag, edit, viewport, and bridge restore`。
- [x] Narrow Graph Editor Journey 已扩展，`390x840` 下覆盖 Graph Add/Connect/Set Path、Zoom/Reset、Network Preview、Energy Compute、Report Export、overlay/console/overflow/screenshot。
- [x] `npm run test:e2e` 仍使用默认 fixture config；`local-http-bridge.spec.ts` 仍由 `npm run test:e2e:local-http` 单独运行。

**名词层“现状 -> 变化”逐项核对**：

- [x] 既有 workbench E2E 主流程保留，新增 graph editor matrix 没删除原 desktop/narrow journey。
- [x] helper 使用 Playwright public API 和 DOM event，不 import runtime private state 或 React internals。
- [x] Save/Open Bridge restore 通过 UI button 和 Browser Project Repository 完成，不直接改 IndexedDB bytes 伪造状态。
- [x] 可观察断言覆盖 node id、edge count、path order、zoom output、active path、console clean、overlay absent 和 no horizontal overflow。

**流程图核对**：

- [x] `reset storage -> open workbench -> create project -> Fixture Run -> graph interactions -> Save Bridge -> reload/open project/Open Bridge -> restored graph assertions` 有代码落点：`workbench-journey.spec.ts` 和 `workbench-helpers.ts`。
- [x] `console clean + no framework overlay + no horizontal overflow + screenshot` 在新增/扩展 E2E 中均有落点。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] Desktop E2E 覆盖 Object Registry drag/drop 到 Graph Canvas、已有 node drag、edge selection/delete、path order draft/apply、Pan/Zoom/Fit/Reset 和 Save/Open Bridge restore。
- [x] Narrow E2E 覆盖 `390x840` 下 Graph Canvas、toolbar、preview、Energy Profile Panel 和 Report Export Panel 可用。
- [x] 每条新增/扩展 E2E 收集 console warning/error、检查 framework overlay、无水平溢出，并附 screenshot。
- [x] E2E helper 已封装真实浏览器图谱交互动作，spec 保持流程可读。
- [x] local-http smoke 未复制完整图谱手势矩阵。

**明确不做逐项核对**：

- [x] 未新增产品 UI、shell command、Project Content schema、localStorage graph state 或云同步能力。
- [x] 未删除已有 unit/component 覆盖。
- [x] 未在 local-http E2E 中复制完整 drag/drop/node move/viewport 矩阵。
- [x] 未引入第三方 diagramming/canvas library，未改 GraphCanvas runtime 交互语义。
- [x] Playwright screenshots/traces/report 仍写入 `web/test-results*/` / `web/playwright-report*/`，不进入 Project Content 或 Browser Project Repository。

**关键决策落地**：

- [x] 默认 E2E 仍用 fixture runtime；复杂图谱手势矩阵在 `npm run test:e2e` 中覆盖。
- [x] helper 优先：drag/drop、node drag、viewport、edge/path、restore 均在 `workbench-helpers.ts` 中封装。
- [x] 可观察断言优先：测试断言 DOM 可见文本、bounding box 有限移动、zoom output、edge count、active path 和 layout health。
- [x] Browser 插件只做 smoke；复杂手势由 Playwright 作为主证据。

**挂载点反向核对（可卸载性）**：

- [x] Playwright helper：删除新增 helper 后图谱矩阵能力消失。
- [x] Default fixture E2E：删除新增 desktop graph matrix 和 narrow 扩展后真实浏览器图谱回归回到旧 smoke 水平。
- [x] 文档：architecture / requirement / roadmap / acceptance 已记录覆盖矩阵。
- [x] 反向 grep：`localStorage|autosave|cloud|Project Content schema|runtime command` 命中均为测试清理或文档边界；运行时代码未新增相关能力。
- [x] 拔除沙盘推演：移除 `workbench-helpers.ts` 中 graph E2E helper、`workbench-journey.spec.ts` 新增/扩展用例和文档落档即可卸载本 feature；生产 runtime 不受影响。

## 3. 验收场景核对

- [x] **S1**：`npm run test:e2e` 默认 fixture 模式包含 Graph Editor desktop matrix，覆盖 drag/drop、node drag、edge delete、path reorder、viewport controls、Save/Open Bridge restore。
  - 证据来源：`npm run test:e2e`。
  - 结果：通过，3 tests passed。
- [x] **S2**：Desktop matrix 中 Object Registry registered object 能拖入 Graph Canvas，drop 后显示新 node，且 console clean。
  - 证据来源：`desktop graph editor matrix`。
  - 结果：通过，显示 `node-web-3` / `object-b`。
- [x] **S3**：Desktop matrix 中已有 graph node 鼠标拖动后 bounding box 有可观察变化，并继续显示 node id。
  - 证据来源：`dragGraphNode` helper + desktop matrix。
  - 结果：通过。
- [x] **S4**：Desktop matrix 中 edge selection + Delete Selected 后 edge count 变为 0，node 仍保留。
  - 证据来源：`deleteFixtureEdge` helper + desktop matrix。
  - 结果：通过。
- [x] **S5**：Desktop matrix 中 path order draft 上移/Apply 后 path order 文本变化，active path 可见。
  - 证据来源：`reorderFixturePathToReverse` helper + desktop matrix。
  - 结果：通过，显示 `node-b -> node-a` 和 active path `path-a-b`。
- [x] **S6**：Desktop matrix 中 Zoom/Fit/Reset/Pan 有可观察 viewport 变化，Reset 后 zoom 回到 `100%`。
  - 证据来源：`exerciseGraphViewportControls` helper + desktop matrix。
  - 结果：通过。
- [x] **S7**：Desktop matrix 中 Save Bridge Session 后 reload/open project/Open Bridge 能恢复 graph workspace 可见状态。
  - 证据来源：`saveReloadAndRestoreGraphWorkspace` helper + desktop matrix。
  - 结果：通过，恢复 `120%`、`node-b -> node-a` 和 active path。
- [x] **S8**：Narrow `390x840` graph editor journey 能完成核心 graph interaction smoke，关键区域可见，无水平溢出。
  - 证据来源：`narrow workbench layout keeps graph, energy, and report export usable`。
  - 结果：通过。
- [x] **S9**：每条新增/扩展 E2E 捕获 console warning/error、检查无 framework overlay、无水平溢出并附 screenshot。
  - 证据来源：`collectConsoleIssues`、`expectNoFrameworkOverlay`、`expectNoHorizontalOverflow`、`attachViewportScreenshot`。
  - 结果：通过。
- [x] **S10-S11 范围守护**：local-http E2E 未复制完整 graph editor matrix；未新增产品 runtime command、Project Content schema、localStorage graph state、自动保存、云同步或账号系统。
  - 证据来源：代码 review + scope grep。
  - 结果：通过。
- [x] **S12**：`npm run test` 通过。
  - 证据来源：Vitest。
  - 结果：通过，16 files / 129 tests passed；保留既有 `--localstorage-file` warning。
- [x] **S13**：`npm run build` 通过。
  - 证据来源：Vite build。
  - 结果：通过。
- [x] **S14**：`npm run test:e2e` 通过。
  - 证据来源：Playwright。
  - 结果：通过，3 tests passed。
- [x] **S15**：Browser dev preview 页面身份 / 非空白 / console smoke 有记录；复杂手势由 Playwright 作为主证据。
  - 证据来源：Browser 插件 + Playwright。
  - 结果：Browser 插件验证 `http://127.0.0.1:5173/` title 为 `RxnFlow Workbench`，body 非空白，`main` / `.graph-workspace` / `.graph-canvas-surface` 存在，framework overlay count 为 0，console warning/error 为 0。

## 4. 术语一致性

- `Graph Editor E2E Matrix`：只出现在 design/acceptance 和 E2E 描述中，表示测试矩阵，不是产品模块。
- `Desktop Graph Editor Journey` / `Narrow Graph Editor Journey`：均指 Playwright viewport 场景，不是 runtime layout mode。
- `Graph Editor E2E Helper`：仅在 `web/e2e/workbench-helpers.ts` 中实现，不进入 runtime app。
- 防冲突：未把测试 helper 命名为 Shell command、Project Content schema、GraphPatch 或 Browser Repository adapter。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md`：已归并默认 fixture E2E 的 desktop graph editor matrix、helper 覆盖、framework overlay 检查、local-http smoke 边界和验证证据。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已同步 Web E2E QA Harness 描述，说明默认 E2E 已覆盖 graph editor matrix。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已更新用户故事和解决方案：真实浏览器回归现在覆盖桌面/窄屏主流程、图谱编辑关键手势和 layout health。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-graph-editor/rxnflow-web-graph-editor-items.yaml` 中 `graph-editor-e2e-qa` 已标为 `done`。
- [x] `.codestable/roadmap/rxnflow-web-graph-editor/rxnflow-web-graph-editor-roadmap.md` 第 5 节同步为 `done`，备注写入已覆盖矩阵。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 没暴露新的通用开发规则。已有 Web 预览、前端验证和 Playwright output gitignore 规则仍适用。

## 9. 遗留

- 后续优化点：键盘删除、多选框选、path delete、edge label、wheel/pinch、minimap 等真实编辑能力仍不在本 roadmap 已完成范围内。
- 已知限制：node drag / pan helper 使用 DOM PointerEvent 触发浏览器事件，比裸鼠标坐标拖动更稳定；仍以可观察 DOM 变化做断言，不读取 React state。
- 实现阶段顺手发现：in-app Browser 当前适合页面身份和 console smoke；复杂本地 Vite 手势继续以 Playwright 作为主证据。
