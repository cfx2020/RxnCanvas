---
doc_type: feature-acceptance
feature: 2026-05-22-graph-editor-wheel-minimap
status: accepted
summary: Graph Canvas 已支持 graph surface wheel zoom、pinch-like wheel input 和 Graph Minimap navigation
tags: [web, graph-editor, viewport, minimap, acceptance]
---

# Graph Editor Wheel Minimap 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-24
> 关联方案 doc：.codestable/features/2026-05-22-graph-editor-wheel-minimap/graph-editor-wheel-minimap-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `ViewportInputIntent` 已在 `web/src/app/graphViewport.ts` 落地，覆盖 wheel-zoom、minimap-center 和 minimap-drag 三类 Web-only intent；它不是 shell command。
- [x] `zoomGraphViewportAtScreenPoint` 已落地 anchor-preserving wheel zoom，最终仍走 `0.35..2.5` zoom clamp。
- [x] `GraphMinimapGeometry` / `GraphMinimapBounds` / `GraphMinimapRect` 已落地，能从当前 nodes、viewport 和 minimap size 派生 node dots、graph bounds 与 viewport window。
- [x] `graphPointFromMinimapPoint`、`graphViewportFromMinimapCenter` 和 `graphViewportFromMinimapPoint` 已落地，minimap click/drag 只改变 viewport x/y 并保留 current zoom。
- [x] 方案中的 `GraphMinimapDraft` 以 `GraphCanvas.tsx` 内部 `MinimapDragSession` 表达，包含 origin/current/center/geometry/dragging，仍是 UI-only state。
- [x] `GraphMinimap` 子视图已落地，显示 node dots、viewport window、draft window 和 zoom percent；可见文案走 `zh-CN` / `en-US` i18n messages。

流程图核对：

- [x] Wheel / pinch-like wheel on graph surface → viewport helper computes anchored zoom → `onSetViewport` → `workspace.set_viewport` → ShellResponse projection 已落在 `GraphCanvas.tsx` / `WorkbenchShell.tsx` / fixture transport 既有链路。
- [x] Minimap click / drag → minimap graph center mapping → drag draft during move → release calls `workspace.set_viewport` once 已落地。
- [x] Zoom / Fit / Reset / Pan buttons 仍走既有 `workspace.set_viewport` 编排。

## 2. 行为与决策核对

- [x] Graph surface 内 wheel 会按 pointer anchor 计算新 viewport 并发送一次 `workspace.set_viewport`。
- [x] ctrl/meta wheel 走 pinch-like scale path，不绕过 zoom clamp。
- [x] Graph surface 外 wheel 不发送 shell command，也不阻止页面滚动。
- [x] no session / no workspace / no nodes 时 wheel 是 no-op。
- [x] Graph Minimap 显示 graph bounds、node dots、active viewport window 和 zoom percent。
- [x] 点击 minimap graph 区域发送一次 `workspace.set_viewport`，viewport center 对应点击处 graph point。
- [x] 拖动 minimap 时显示 transient draft，drag 过程中不发送 shell command，pointer release 后发送一次。
- [x] Minimap pointer 坐标按实际 DOM rect 缩放回固定 minimap 坐标，窄屏 CSS 缩放时 mapping 仍稳定。
- [x] React wheel passive listener 的真实浏览器 console error 已通过原生 non-passive `addEventListener("wheel", ..., { passive: false })` 修复。

明确不做核对：

- [x] 未新增 Python core / Platform Shell command、Project Content schema、Browser Project Repository write、localStorage persistence、autosave、history stack、EnergyProfile 或 Report Export 变更。
- [x] 未新增 `workspace.zoom`、`workspace.minimap`、batch viewport command 或 third-party minimap / diagramming dependency。
- [x] 未实现 inertial scroll、persistent minimap preferences、multi-touch PointerEvent pinch、minimap node selection、minimap edge drawing、viewport undo/redo 或 graph layout state persistence。
- [x] 未改变 `workspace.set_viewport` contract、zoom clamp、`600 x 360` virtual graph coordinate system 或 `ReactionNode.position`。

关键决策落地：

- [x] D1 复用 Workspace viewport authority：可见 viewport 只从 ShellResponse projection 更新。
- [x] D2 新增 Web-only viewport intent helper：wheel/minimap geometry 集中在 `graphViewport.ts`。
- [x] D3 Wheel 只在 graph surface 内拦截：component test 覆盖 graphCanvas region wheel 不发 command。
- [x] D4 Minimap 不持久化：geometry、draft 和 wheel delta 均未进入 ShellResponse / Project Content / repository / localStorage。
- [x] D5 Minimap drag release 才提交 command：component test 和 E2E 覆盖 draft 期间无 command、release 后一次 command。
- [x] D6 保留按钮 fallback：Zoom In/Out、Fit、Reset、Pan 既有测试和 E2E 仍通过。

挂载点反向核对：

- [x] 挂载点均落在 `web/src/app/graphViewport.ts`、`GraphCanvas.tsx`、`workbench.css`、`WorkbenchShell.test.tsx`、`graphViewport.test.ts`、`messages.ts` 和 `web/e2e/workbench-helpers.ts`。
- [x] grep 未发现本 feature 挂入 Python core、Platform Shell、Project Content Store、Browser Project Repository、EnergyProfilePanel、ReportExportPanel、localStorage、autosave、history 或第三方 graph library。
- [x] 拔除沙盘推演：移除上述 Web helper/UI/test/style/i18n 挂载点后，只会回到 toolbar/pan viewport controls；无需清理 core/schema/repository/autosave 残留。

## 3. 验收场景核对

- [x] S1-S4 helper 行为：`web/src/app/graphViewport.test.ts` 覆盖 wheel zoom clamp、anchor 保持、ctrl/meta factor、minimap geometry 和 center mapping。
- [x] S5-S8 wheel 编排：`web/src/app/WorkbenchShell.test.tsx` 覆盖 graph surface wheel 发送 `workspace.set_viewport`、surface 外 no-op、no workspace no-op、ctrl wheel zoom。
- [x] S9-S11 回归：`WorkbenchShell.test.tsx` 和 desktop graph matrix E2E 覆盖 viewport buttons、pan、node drag、rubber-band、direct edge、object drop 不回退。
- [x] S12-S14 minimap：component tests 覆盖 node dots、viewport window、zoom percent、click navigation、drag draft 和 release command。
- [x] S15 responsive：Browser QA desktop `1280x720` / narrow `390x840` 验证 minimap 可见、无 framework overlay、console clean、无页面级水平溢出。
- [x] S16 scope guard：`git show --name-only 43ad00f` 与 grep 核对只改 Web app / E2E / CodeStable checklist。
- [x] S17 `cd web && npm run test -- --run` 通过，22 files / 226 tests。
- [x] S18 `cd web && npm run build` 通过。
- [x] S19 浏览器验证通过：从 `web/` 启动 Vite，5173 被既有服务占用时临时运行在 `http://127.0.0.1:5174/`；Browser 插件验证 desktop/narrow 页面非空白、minimap/surface 存在、overlay 为 0、console warning/error 为空、无水平溢出。临时 5174 服务验收后已停止。

## 4. 术语一致性

- `Viewport Input Intent`：代码中以 `ViewportInputIntent` type 和 `zoomGraphViewportAtScreenPoint` / minimap mapping helpers 表达，未变成 shell command。
- `Wheel Zoom` / `Pinch Zoom`：代码中只实现 wheel event 与 ctrl/meta wheel pinch-like path，未引入低层多指 PointerEvent 概念。
- `Graph Minimap` / `Minimap Navigation`：UI、CSS、tests 和 i18n keys 均使用 minimap 命名；无 repository/schema 侧命名。
- `Viewport Authority`：代码仍通过 `onSetViewport` → `workspace.set_viewport` → ShellResponse projection；未出现前端本地 domain state patch。
- 防冲突：grep 未发现 `workspace.zoom`、`workspace.minimap`、batch viewport command、minimap persistence、localStorage key 或 third-party minimap dependency。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md` 已归并 Graph Editor Wheel/Minimap Navigation 当前能力、`graphViewport.ts` helper 范围、GraphCanvas minimap/wheel UI、non-passive wheel listener、projection authority、UI-only minimap draft / wheel delta / geometry 边界和 E2E 覆盖。
- [x] core / platform architecture 无需更新：本 feature 复用既有 `workspace.set_viewport`，没有改变 Python shell contract。
- [x] `AGENTS.md` 无需更新：现有 Web 预览和浏览器验证要求已覆盖本 feature；本次未暴露新的通用环境约束。

## 6. Requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已更新用户故事、解决方案和边界：用户可用 wheel / pinch-like wheel / minimap navigation 导航图谱；仍不做 viewport history、autosave、persistent minimap preference、inertial scroll 或完整多指手势识别。

## 7. Roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-items.yaml` 中 `graph-editor-wheel-minimap` 已从 `in-progress` 改为 `done`，feature 保持 `2026-05-22-graph-editor-wheel-minimap`。
- [x] `.codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-roadmap.md` 第 5/6/7 节已同步状态、feature 目录、完成备注、下一步候选和观察项。
- [x] YAML 已用 `.codestable/tools/validate-yaml.py` 校验。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- 无候选。本 feature 未暴露新的通用环境、工具或工作流约束；现有 AGENTS.md 已要求 Web dev server 从 `web/` 启动并做浏览器验证，且明确不要用 `file://` 预览 Vite app。

## 9. 遗留

- 后续优化点：`graph-editor-lightweight-history` 可复用 viewport intent、selection 和 nudge 作为 runtime-only 可逆操作样本。
- 后续优化点：未来如果要完整 trackpad pinch，可另起 feature 评估 PointerEvent 多指手势，不塞进当前 wheel path。
- 已知限制：minimap 不做 node selection、edge drawing、persistent preference 或独立 graph layout state；wheel zoom 不实现惯性滚动；viewport 仍不自动保存，保存继续由显式 Save Bridge Session 承担。

## 10. 验证记录

- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-22-graph-editor-wheel-minimap/graph-editor-wheel-minimap-checklist.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-items.yaml --yaml-only`：通过。
- `cd web && npm run test -- --run`：通过，22 files / 226 tests。
- `cd web && npm run build`：通过。
- `python3 -m unittest discover`：通过，304 tests。
- `cd web && npx playwright test e2e/workbench-journey.spec.ts --grep "desktop graph editor matrix"`：通过，1 test。
- Browser 插件 desktop `1280x720` / narrow `390x840`：页面非空白、fixture 可运行、Graph Canvas / minimap / surface 存在、overlay=0、console warning/error=[]、无水平溢出。
- `git diff --check`：通过。
