# canvas-path-authoring-pes-preview 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-04
> 关联方案 doc：.codestable/features/2026-06-04-canvas-path-authoring-pes-preview/canvas-path-authoring-pes-preview-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

- [x] `PathAutoExtendResult`：已落地在 `web/src/app/graphPathAutoExtend.ts`，返回 `set-path` 或 `manual` intent；unit test 覆盖 create、append-tail、prepend-head、branch、cycle、internal-edge、stale-path 和 no-change。
- [x] `PesComputeSignature`：已落地在 `WorkbenchShell.tsx` 的 `pesComputeTarget` / `pesComputeSignature`，签名包含 session、path、node ids、unit、energy key/source、baseline 和 correction policy。
- [x] `PesPreviewPointSummary`：以 `EnergyProfilePanel.tsx` 的 normalized point view 形式落地，table/detail 显示 structure、node id、relative energy、step delta、unit、missing reason、correction count 和 warning marker。

流程图核对通过：`workspace.connect` 成功后才进入 path auto-extend；`set-path` 成功后由 active path projection 变化触发 `energy.compute`；profile projection 更新后只在面板内派生 step delta；curve/table point click 仍通过 `workspace.select` 联动画布。

## 2. 行为与决策核对

需求摘要已落地：用户从节点拖线创建 edge 后，Web 会在无歧义场景自动创建或延长 active path；分叉、内部边、重复节点和 stale path 只显示 manual path status。右侧 PES Preview 会随 active path 或能量选项变化自动 compute，并展示相对能量、相邻 step delta、missing reason、correction count 和 warnings。

关键决策已落地：

- [x] Direct Edge Gesture 是主入口，按钮式 Connect 和 Path Order Draft 仍保留。
- [x] active path 只做 create / append-tail / prepend-head 三类无歧义更新。
- [x] compute intent 使用 signature 去重，手动 Compute 仍可强制重算。
- [x] step delta 是展示派生，不进入 Shell DTO、Project Content 或 export artifact。
- [x] PES Preview 不生成 CDXML/PNG/XLSX/CSV/SVG，不改变 report writer。

挂载点反向核对通过：本 feature 的代码引用集中在 `WorkbenchShell.tsx`、`GraphCanvas.tsx`、`EnergyProfilePanel.tsx`、`graphPathAutoExtend.ts`、i18n、CSS 和对应 tests。拔除沙盘推演：删除 helper、WorkbenchShell auto-extend/auto-compute wiring、GraphCanvas status、EnergyProfilePanel step delta、文案/样式和测试后，系统会回到此前的 direct edge + 手动 set path + 手动 compute 状态；Python parser/core/energy/export/repository schema 无残留挂入。

## 3. 验收场景核对

- [x] **S1** 无 active path 时从 A 到 B：component test 覆盖先 `workspace.connect` 后 `workspace.set_path(path-web-main, [A, B])`。
- [x] **S2** `[A, B]` 后从 B 到 C：component test 覆盖 append-tail、自动 `energy.compute` 和 PES 中出现新节点。
- [x] **S3** `[B, C]` 前从 A 到 B：unit test 覆盖 prepend-head intent。
- [x] **S4** 内部边、重复节点、分叉：unit/component tests 覆盖不发送 `workspace.set_path`，GraphCanvas 显示 manual status。
- [x] **S5** connect 成功但 set_path 失败：WorkbenchShell 分支保留 edge 并显示 `workspace.set_path` error，不伪造 path/profile 成功。
- [x] **S6** active path/options 变化自动 compute 且签名去重：component test 覆盖 path 变化触发一次 compute；代码用 `pesComputeSignatureRef` / `pesComputeInFlightRef` 去重。
- [x] **S7** 手动 Compute 保留：EnergyProfilePanel 的按钮仍调用 `runEnergyCompute({ force: true })`。
- [x] **S8-S13** PES table/detail、step delta、missing、correction count、point selection 和中英文文案：component tests 与 i18n catalog completeness 覆盖。
- [x] **S14** 桌面与 390px 窄屏：浏览器 smoke 已验证 Graph Canvas、Network Preview、PES table/curve/detail 无整体水平溢出，console clean。
- [x] **S15-S18** 自动化与浏览器验证：`npm run test`、`npm run build`、`python3 -m unittest discover`、YAML 校验、`git diff --check` 和 Browser dev preview smoke 均通过。

## 4. 术语一致性

- `Path Auto-Extend Intent` 对应 `resolvePathAutoExtendIntent` 和 `PathAuthoringStatus`，未写入 core/Shell DTO。
- `PES Compute Intent` 对应 `pesComputeTarget` / `pesComputeSignature`，只负责 Web command orchestration。
- `Step Delta Energy` 对应 `EnergyProfilePanel` 的 `stepDeltaEnergy`，缺失值保持空，不显示 0。
- `correction count` 只来自 `point.expression.corrections.length`；未出现前端重算 correction contribution。

反向 grep 核对通过：未新增自动路径搜索、化学合理性判断、反应配平、守恒检查、CDXML/CDX writer、Project Content schema、Browser Project Repository schema、localStorage key 或新增图表库。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md`：已记录 Workspace-First Path Authoring、Path Auto-Extend Intent、PES compute signature 去重、step delta projection 和 UI-only 边界。
- [x] `.codestable/architecture/ARCHITECTURE.md`：不需要更新；本 feature 没有改变核心 command contract、Project Content schema 或 Report Export Service writer。
- [x] `.codestable/architecture/core-platform.md`：不需要更新；实现复用既有 `workspace.connect`、`workspace.set_path`、`energy.compute` 和 `workspace.select`。

## 6. Requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已补用户故事：拖线无歧义时形成/延长 active path，PES Preview 自动刷新并显示 step delta、missing reason 和 correction count。
- [x] 已补边界：Path Authoring 只做无歧义 create/append/prepend；Energy Profile Panel 不重算能量或 correction，missing step delta 不补 0。

## 7. Roadmap 回写

- [x] `.codestable/roadmap/rxnflow-workspace-first-canvas-mvp/rxnflow-workspace-first-canvas-mvp-items.yaml` 已将 `canvas-path-authoring-pes-preview` 从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-workspace-first-canvas-mvp/rxnflow-workspace-first-canvas-mvp-roadmap.md` 第 5 节已同步状态和对应 feature，并更新最小闭环说明。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新硬约束。现有 AGENTS.md 已要求前端画布/报告预览改动必须浏览器验证，并已说明 Web 预览必须从 `web/` 运行 `npm run dev`。

## 9. 遗留

- Minimal CDXML energy delta export 仍未实现，下一步 roadmap item 是 `minimal-cdxml-energy-delta-export`。
- Path Authoring 当前只处理无歧义 active path create/append/prepend，不做分叉路径选择、自动路径搜索或化学合理性判断。
- PES Preview 当前是 Web UI projection，不是报告导出模型；后续 CDXML feature 需要从 active path / EnergyProfile 建立 writer 侧 contract。
