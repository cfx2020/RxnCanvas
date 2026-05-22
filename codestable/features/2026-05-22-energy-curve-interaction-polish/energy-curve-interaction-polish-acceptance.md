# Energy Curve Interaction Polish 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：`codestable/features/2026-05-22-energy-curve-interaction-polish/energy-curve-interaction-polish-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `EnergyCurvePointState`：已在 `web/src/app/EnergyProfilePanel.tsx` 以 component state 保存 `activeNodeId` / `pinnedNodeId`；`useEffect` 会在 points 更新后 prune stale node id。该 state 未进入 Shell DTO、Project Content、Browser Repository 或 localStorage。
- [x] `EnergyCurvePointStatus`：已从 normalized point 派生 `hasRelativeEnergy`、`hasMissingReason`、`hasCorrections`、`isSelected`；correction 只使用 `expression.corrections.length`。
- [x] `EnergyProfilePanelProps.selectedNodeId` / `onSelectProfilePoint`：已加入 props，并由 `WorkbenchShell` 传入当前 `workspace.selection.node_ids[0]` 与 profile point selection handler。
- [x] `ExportReadinessSummary`：已在 `ReportExportPanel` 内从 `profile`、`options`、`hasActiveBrowserProject` 派生；只用于渲染静态摘要。

**名词层"现状 → 变化"逐项核对**：

- [x] `Energy Curve Point`：已成为曲线 marker、表格行状态和 detail 的统一 UI point 投影。
- [x] `Curve Point Detail`：已显示 label、node id、relative energy 或 missing reason、expression total、term count、correction count 和 missing code。
- [x] `Curve Point Marker`：已区分 valid、missing、correction、selected，并同时有文字/status label，不只靠颜色。
- [x] `Profile Node Linkage`：已通过 `workspace.select(node_ids=[nodeId])` 联动 Graph Canvas selected node。
- [x] `Export Readiness`：已显示 profile、missing、corrections、inline bytes、browser persistence 和 CDXML-only 摘要。

**流程图核对**：

- [x] `EnergyProfilePanel normalizes points` → `Build curve point statuses` → `Render SVG markers + table badges + detail panel` 已落在 `EnergyProfilePanel.tsx`。
- [x] `hover/focus` 更新 detail，`click point` 调用 `onSelectProfilePoint(node_id)` 已落在 curve marker/table row handlers。
- [x] `WorkbenchShell calls workspace.select` 已落在 `selectEnergyProfilePoint`。
- [x] `ReportExportPanel derives export readiness` 已落在 `exportReadinessFromProfile` 和 `ExportReadinessPanel`。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 曲线点可 hover/focus/click，detail 会跟随当前 point 显示。
- [x] missing/correction/selected 状态在 curve、table 和 detail 中可见。
- [x] 点击 curve point 或 table row 后，Graph Canvas 通过 ShellResponse selection 显示同一 node selected。
- [x] Report Export Panel 在导出按钮附近显示 missing/correction/bytes/persistence/CDXML 口径提示。

**明确不做逐项核对**：

- [x] 未新增 Shell command、Project Content schema、Browser Repository schema、ExportFormat 或 chart dependency。
- [x] 未在 Web 代码中 import Python core、`EnergyProfileEngine`、`ReportExportService`、`ProjectContentValidator` 或 parser modules。
- [x] 未调用 `project.save_content`、Browser Repository write 或 localStorage 保存 curve point UI state/readiness。
- [x] 未修改 PNG/CDXML/XLSX writer、CDXML/CDX 边界或导出文件内容。
- [x] 未把 missing point 补成 0，也未在前端生成 relative energy/correction totals。

**关键决策落地**：

- [x] D1：Curve Point Detail 使用 panel 内可访问详情，支持 hover/focus/click。
- [x] D2：missing point 保留 x 位置，用独立 marker 显示，不参与 polyline。
- [x] D3：correction 标记基于 `expression.corrections.length`。
- [x] D4：Graph linkage 复用 `workspace.select`，不本地伪改 workspace projection。
- [x] D5：Export Readiness 是静态摘要，不拦截导出。

**挂载点反向核对**：

- [x] Energy Profile Panel curve/table/detail 挂载点：新增引用集中在 `EnergyProfilePanel.tsx` 与 `workbench.css` 的 curve/detail/table 样式。
- [x] WorkbenchShell selection handler 挂载点：新增 `selectEnergyProfilePoint`，只调用既有 `selectGraphItems`。
- [x] Report Export readiness 挂载点：新增 props/rendering 在 `ReportExportPanel.tsx`，不改变 export command args。
- [x] i18n/CSS/test 挂载点：新增静态文案、样式和 component/browser QA；未扩散到 shell/core/writer。
- [x] 拔除沙盘推演：移除上述挂载点后，核心 profile compute、graph canvas selection、report export artifacts 仍按原接口运行；没有新 schema 或 writer 需要回滚。

## 3. 验收场景核对

- [x] S1 Fixture Run 后 Energy Curve 显示有效点 marker、相对能量 label，并可键盘 focus。
  - 证据：`npm run test -- --run`；Playwright desktop/narrow QA `pointButtons=2`。
- [x] S2 hover/focus/click point 后 Curve Point Detail 显示 label、node id、relative energy、expression total 和 composition term count。
  - 证据：in-app Browser 中文界面和 Playwright desktop/narrow QA 均显示 `点详情` / `Expression total`。
- [x] S3 有 correction contribution 的 point 显示 correction marker/count，来源为 `expression.corrections.length`。
  - 证据：component tests 覆盖 status/readiness copy；源码无前端 correction 求和。
- [x] S4 missing point 显示 missing marker 和 `missing_reason`，不显示假 relative energy，不连入 polyline。
  - 证据：`EnergyCurvePreview` 只对 `point.value !== undefined` 的 point 生成 polyline；missing marker 使用 baseline marker。
- [x] S5 点击 curve point 或 table row 后调用 `workspace.select` 并选中 Graph Canvas node。
  - 证据：`WorkbenchShell.test.tsx` 覆盖 profile point selection payload 和 selected node。
- [x] S6 profile 更新后原 pinned point 不存在时不保留 stale selected point。
  - 证据：`pruneCurvePointState` 在 points 更新时清理 stale ids。
- [x] S7-S10 Report Export Panel 显示 missing、include bytes off、无 active browser project 和 CDXML-only 提示，且不禁用导出。
  - 证据：`WorkbenchShell.test.tsx` readiness assertions；Playwright QA 检查 readiness copy。
- [x] S11 中文 locale 下新增静态文案为简体中文，动态 id/key/code/unit/format 原样显示。
  - 证据：`messages.ts` zh-CN/en-US key 同步；in-app Browser 中文界面显示 `不会浏览器本地持久化`、`仅 CDXML，无 CDX`。
- [x] S12 桌面浏览器无重叠/无水平溢出。
  - 证据：Playwright viewport `1280x900`：`overflow=false`，grid columns `320px 564px 340px`，curve/detail/readiness 可见，console errors 为空。
- [x] S13 窄屏浏览器无整体水平溢出。
  - 证据：Playwright viewport `390x900`：`overflow=false`，grid columns `370px`，curve/detail/readiness 可见，console errors 为空。

## 4. 术语一致性

- `EnergyCurvePoint`、`CurvePointDetail`、`energy-curve-point`、`ExportReadiness`、`export-readiness` 命中均集中在 Web UI 文件、CSS、i18n 和测试中。
- `workspace.select` 仍是 selection authority；新增 profile point linkage 没有自定义 selection 协议。
- `CDXML only; no CDX` / `仅 CDXML，无 CDX` 与既有 ChemDraw/CDXML 边界一致，没有新增 `cdx` format。
- 动态 node id、profile id、warning code、format、metadata key/value 仍原样显示，不进入 i18n 翻译。

## 5. 架构归并

- [x] `codestable/architecture/web-workbench.md`：已记录 Interactive Energy Curve、Curve Point Detail、Profile Node Linkage、Export Readiness、UI-only state 边界和 browser QA 证据。
- [x] `codestable/architecture/ARCHITECTURE.md`：已补 Web Energy Curve Point、Web Curve Point Detail、Web Profile Node Linkage 和 Web Export Readiness 的术语与约束。
- [x] `AGENTS.md`：本 feature 未暴露新的通用工作流规则；现有 Web QA 规则仍适用。
- [x] `core-platform.md`：不需要更新；本 feature 未改变 Python core、Energy Engine、Project Content 或 Report Export Service。

## 6. requirement 回写

- [x] `codestable/requirements/web-workbench-shell.md` 已更新用户故事：可交互能量曲线、曲线点定位 graph node、导出前 readiness 检查。
- [x] 已更新解决方案和边界：curve/detail state UI-only，missing 不补 0，correction marker 不重算，readiness 只提示不改变 export behavior。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-items.yaml` 中 `energy-curve-interaction-polish` 已从 `in-progress` 改为 `done`，并补实现备注。
- [x] `codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-roadmap.md` 第 3 节子 feature 清单已同步为 `done`。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 继续沿用既有 Web QA 规则：从 `web/` 运行 Vite dev server，访问 `http://127.0.0.1:5173/`，前端视觉/画布/报告预览类改动做桌面与窄屏浏览器验证。

## 9. 遗留

- 后续优化点：可在后续 roadmap 中考虑真正的报告预览、图谱/能量曲线联动高亮策略、曲线缩放/导出预览和更强的 path-level chemistry validation。
- 已知限制：Export Readiness 不是 validation command；missing/correction 只解释当前 profile projection，不修复数据。
- 实现阶段顺手发现：当前 curve marker 使用轻量 SVG/HTML，不引入 chart library；满足本阶段交互，但不是高级 plotting surface。

## 10. 验证记录

- `cd web && npm run test -- --run`：17 files / 146 tests passed。
- `cd web && npm run build`：通过。
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-22-energy-curve-interaction-polish/energy-curve-interaction-polish-checklist.yaml --yaml-only`：通过。
- `git diff --check`：通过。
- in-app Browser：`http://127.0.0.1:5173/` 中文窄屏状态，Fixture Run 后无水平溢出，curve/detail/readiness 可见。
- Playwright Chromium desktop/narrow QA：`1280x900` 与 `390x900` 均无水平溢出、curve/detail/readiness 可见、point/table buttons 可用、console errors 为空。
