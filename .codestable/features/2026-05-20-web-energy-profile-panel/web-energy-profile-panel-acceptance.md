# web-energy-profile-panel 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-20
> 关联方案 doc：.codestable/features/2026-05-20-web-energy-profile-panel/web-energy-profile-panel-design.md

## 1. 接口契约核对

对照方案第 2.1 节，Web shell DTO 已补齐 `EnergyOutputUnit`、`EnergyValueSummary`、`EnergyProfilePointSummary`、`EnergyProfileSummary` 和 `EnergyComputeData`，profile point 不再是松散 `JsonValue[]`。

- [x] `EnergyProfileSummary` 仍是 Web shell projection，不是 core dataclass。落点：`web/src/shell/types.ts`。
- [x] `EnergyComputeData.command` 固定为 `energy.compute`，`session_id` 和 `profile` JSON-safe。落点：`web/src/shell/types.ts`。
- [x] `EnergyProfilePointSummary.relative_energy` 兼容 `{ value, unit, reference }` 和旧 fixture number；UI 只做展示规范化。落点：`web/src/app/EnergyProfilePanel.tsx`。
- [x] `EnergyPanelOptions` 是 UI-only state，不写入 Project Content。落点：`web/src/app/EnergyProfilePanel.tsx`、`web/src/app/WorkbenchShell.tsx`。
- [x] fixture transport 支持 `energy.compute` success/error/warning paths：`kj_mol`、`graph_invalid`、`corrections_empty`、`missing_energy`。落点：`web/src/shell/fixtureTransport.ts`。

## 2. 行为与决策核对

- [x] Energy Profile Panel 默认跟随 `workspace.active_path_id`，active path 改变后自动更新 selected path。落点：`WorkbenchShell` 的 `useEffect`。
- [x] 点击 Compute 只调用 ShellClient `energy.compute`；成功后只更新 `WorkbenchDomainState.profile`、`active.profileId` 和 `counts.profiles`。
- [x] Energy Panel 不从 graph node/object energy keys 在前端拼算能量，也不做单位换算；显示值来自 ShellResponse。
- [x] ShellResponse warnings、profile warnings 和 point warnings 都可见；`ok=false` 时进入 command error 状态。
- [x] missing point 显示 `missing_reason`，SVG curve 跳过 missing 点，不补 0。
- [x] i18n 只覆盖静态 UI 文案；node id、path id、profile id、unit、energy key、warning/error code 原样显示。
- [x] 范围守卫通过：未调用 `export.profile` 或 `project.save_content`，未新增 cloud/account/auth 相关逻辑，未修改 Python Energy Engine、Project Content codec 或 Report Export。

## 3. 验收场景核对

- [x] 首屏无 session / active path 时 Energy Profile Panel 显示空态，Compute disabled。证据：`web/src/app/WorkbenchShell.test.tsx`。
- [x] Fixture Run 后展示 fixture profile id、path id、output unit、baseline node 和 profile points。证据：`web/src/app/WorkbenchShell.test.tsx`。
- [x] 表格第一列显示 structure label，随后显示 node id、relative energy、unit 和 missing reason。证据：`web/src/app/EnergyProfilePanel.tsx`、`web/src/app/WorkbenchShell.test.tsx`。
- [x] 点击 Compute 后更新 profile id/path/unit/point count 和 active profile id。证据：`web/src/app/WorkbenchShell.test.tsx`。
- [x] output unit 切为 `kj_mol` 后 command args 使用 `kj_mol`，response 显示 `kj_mol` 和 `-51.882`。证据：`web/src/shell/ShellClient.test.ts`、`web/src/app/WorkbenchShell.test.tsx`。
- [x] include corrections checkbox 进入 command args，fixture warning `corrections_empty` 可见；UI 不解释校正公式。证据：`web/src/shell/ShellClient.test.ts`、`web/src/app/WorkbenchShell.test.tsx`。
- [x] baseline node 可选或留空；留空时不传 `baseline_node_id`。证据：`runEnergyCompute` 参数构造。
- [x] 缺失 path 返回 `graph_invalid` / `target=path_id`。证据：`web/src/shell/ShellClient.test.ts`。
- [x] 导入 water object 后设为 path，Compute 显示 `missing_energy`，missing row 不被画成 0。证据：`web/src/app/WorkbenchShell.test.tsx`。
- [x] 中文 locale 下静态文案为简体中文，动态 id/code/unit 原样显示。证据：`web/src/app/WorkbenchShell.test.tsx`。
- [x] Browser 插件验证 `http://127.0.0.1:5173/` 页面标题、Energy Panel、console clean；Browser 点击 Fixture Run 时 CDP evaluate 超时，按前端 QA 流程 fallback 到本地 Playwright。
- [x] Playwright Chromium `1280x720` 验证 Fixture Run -> `kj_mol` -> include corrections -> Compute，无 console warning/error、无水平溢出。截图：`/tmp/rxnflow-energy-panel-desktop.png`。
- [x] Playwright Chromium `390x840` 验证同一 energy compute flow，选项、表格、曲线和 warnings 无重叠、无水平溢出。截图：`/tmp/rxnflow-energy-panel-narrow.png`。
- [x] Playwright Chromium `1280x720` / `390x840` 验证 missing energy path，表格 3 行、missing row 为 `water.xyz node-web-3 missing_energy`，curve 只绘制 2 个非 missing 点。截图：`/tmp/rxnflow-energy-panel-missing-desktop.png`、`/tmp/rxnflow-energy-panel-missing-narrow.png`。

## 4. 术语一致性

- Energy Profile Panel：代码命中集中在 `EnergyProfilePanel.tsx`、`WorkbenchShell` 挂载、i18n 文案和 CSS，语义一致。
- Energy Compute Command：仅通过 ShellClient 提交 `energy.compute`，fixture transport 只模拟 shell response。
- Relative Energy Table：只在 Energy Panel 中展示，不等同于导出用 Excel table。
- Energy Curve Preview：基础 SVG preview，不生成 PNG/CDXML，不登记 artifact。
- Energy Compute Options：只作为 UI state 和 command args，不写 Project Content。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md`：记录 Energy Profile Panel、typed energy projection、fixture `energy.compute`、UI-only options、missing/warning 展示、基础 SVG curve 和 scope 边界。
- [x] `.codestable/architecture/ARCHITECTURE.md`：补充 Web Energy Profile Panel 术语、Web Workbench 已落地能力和边界；Energy Engine 算法仍在 core。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已补充用户可从 active path 计算相对能量，并查看表格、曲线、warnings 和 missing reason 的现状能力。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-items.yaml` 中 `web-energy-profile-panel` 已由 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-roadmap.md` 中 Energy Profile Panel 子 feature 状态同步为 done；下一项保持 `web-report-export-panel`。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无新增候选。现有 AGENTS.md 已记录 Web dev server 必须从 `web/` 运行、前端/画布/曲线改动需浏览器验证、不要用 `file://` 预览 Vite app。

## 9. 遗留

- Energy Profile Panel 当前只接 fixture `energy.compute`；真实 Python bridge / HTTP transport 仍待后续 runtime feature 接入。
- 当前 curve 是基础 SVG preview，不支持拖拽标注、多条曲线叠加、高级图表库或报告级排版。
- 当前不保存新 profile 到 Project Content，不调用 `project.save_content`；profile 持久化入口留给后续 shell/project content 集成。
- 当前不调用 `export.profile`，不生成 PNG/CDXML/XLSX；下一步 roadmap item 是 `web-report-export-panel`。
