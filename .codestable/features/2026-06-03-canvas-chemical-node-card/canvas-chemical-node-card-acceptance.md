---
doc_type: feature-acceptance
feature: 2026-06-03-canvas-chemical-node-card
status: accepted
summary: 验收 raw file 多候选选择器、import.register_selection、Canvas Chemical Node 富摘要、架构/需求/roadmap 回写
tags: [web, graph-canvas, import-preview, candidate-chooser, chemical-node, workspace-first]
---

# canvas-chemical-node-card 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-04
> 关联方案 doc：.codestable/features/2026-06-03-canvas-chemical-node-card/canvas-chemical-node-card-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层：

- [x] `ParseCandidateSummary` 已落地在 `rxnflow/platform.py` 的 preview projection、`web/src/shell/types.ts` 的 DTO 和 fixture transport；实际 Shell DTO 沿用既有 snake_case，包含 `candidate_id`、`object_index`、label、formula、charge/spin、method、`display_energy`、`coordinate_preview`、`role_hint` 和 warnings。
- [x] `CoordinatePreviewSummary` 已落地到 candidate summary 与 `ObjectSummary`，字段为 atom count、has3d、elements 和 text/unavailable preview kind；无 geometry 时不编造结构。
- [x] `ImportRegisterSelectionData` / `import.register_selection` 已落地，Shell command 复用 `confirm_import(ImportSelection(object_indices=...))`，返回 batch、registered ids 和 object summaries。
- [x] `ParseCandidateChooserState` 已落地在 `GraphCanvas.tsx` / `WorkbenchShell.tsx`，只保存 UI-only 选择、状态和错误，不写 Project Content。
- [x] `CanvasChemicalNodeSummary` helper 已落地在 `GraphCanvas.tsx`，从 `GraphNodeSummary` 与 `ObjectSummary[]` 派生，不新增 core graph schema。

流程图核对通过：Raw file drop -> persist/reuse project raw file -> `import.preview` -> 单对象 auto path 或多候选 chooser -> `import.register_selection` -> `workspace.add_node` -> Canvas Chemical Node 渲染，均有代码落点。

## 2. 行为与决策核对

需求摘要已落地：多帧 / 多对象 preview 不再停在 `candidate_selection_required`，而是在画布落点附近显示候选选择器；节点卡直接显示结构名、对象组成、方法、电荷自旋、能量、warning 和轻量坐标摘要。

明确不做核对：

- [x] 未新增 2D/3D molecule renderer、OpenBabel/Mol*、CDXML/CDX 导出、PES preview、path authoring 或 `energy.compute` 新逻辑。
- [x] Web 未 import Python parser/core，也未在浏览器解析 Gaussian/ORCA/MAPLE/XYZ/extxyz。
- [x] 未新增 Project Content schema、Browser Project Repository interface、cloud storage、directory watcher 或 browser directory handle authority。
- [x] `role_hint` 当前只投影 `unknown`；Web 不凭文件名或顺序判断 TS/final。

关键决策已落地：

- [x] Candidate 摘要来自 Shell/Core projection，Web 只展示。
- [x] 选择登记使用独立 `import.register_selection`，单对象 auto path 保留 `import.register_all`。
- [x] 多选会按 drop position 附近 stack offset 创建多个节点，但必须用户确认。
- [x] register selection 或 add-node 失败后不伪造 node；已登记对象仍保留在 Object Registry。

挂载点反向核对：`rg` 命中集中在 `rxnflow/platform.py`、Web Shell DTO / fixture transport、`WorkbenchShell.tsx`、`GraphCanvas.tsx`、i18n/CSS/tests 和本 feature 文档；未挂入 parser plugins、Project Content codec、Energy Engine、Report Export/CDXML writer、cloud 或 watcher。

## 3. 验收场景核对

- [x] S1/S2/S3/S4：`import.preview` 返回 candidates，candidate count 与 object_count 一致，并包含 label/objectIndex/formula/charge/spin/method/displayEnergy/coordinatePreview/warnings；缺失 energy/geometry 为 null 或 unavailable。证据：`tests/test_platform_shell_baseline.py`、`web/src/shell/ShellClient.test.ts`。
- [x] S5/S6：多候选 raw drop 显示 chooser，不自动 register/add node；取消后不登记、不建节点，project file 保持 previewed。证据：`WorkbenchShell.test.tsx`。
- [x] S7/S8：单选创建一个 node，多选创建 stack nodes，位置来自落点附近偏移且不完全重叠。证据：`WorkbenchShell.test.tsx`。
- [x] S9：register selection 成功但 add-node 失败时显示 workspace error，不伪造 node，已登记对象保留。证据：`WorkbenchShell.test.tsx` 的 failing add-node transport。
- [x] S10：单对象 raw file drop 仍直接 register + add node，不需要 chooser。证据：既有 raw file drop component tests。
- [x] S11/S12/S13：节点卡显示结构名、object ids/composition、formula、charge/spin、method、display energy、atom count 和 warnings；多对象 composition 不只展示第一个 object；缺失 energy 显示 missing，不当作 0。证据：`GraphCanvas.test.tsx`、`WorkbenchShell.test.tsx`、browser smoke。
- [x] S14：zh-CN / en-US 文案完整；candidate id、object id、warning/error code 原样显示。证据：`messages.ts` 与 Web tests。
- [x] S15/S16：桌面 viewport 与 390px 窄屏下 chooser、node card、Network Preview 无重叠和水平溢出。证据：Playwright browser smoke。

验证命令：

- [x] `python3 -m unittest tests.test_platform_shell_baseline`：25 tests passed。
- [x] `cd web && npm run test -- WorkbenchShell.test.tsx ShellClient.test.ts GraphCanvas.test.tsx`：116 tests passed。
- [x] `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-06-03-canvas-chemical-node-card/canvas-chemical-node-card-checklist.yaml --yaml-only`：passed。
- [x] `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-workspace-first-canvas-mvp/rxnflow-workspace-first-canvas-mvp-items.yaml --yaml-only`：passed。
- [x] `python3 -m unittest discover`：358 tests passed。
- [x] `cd web && npm run test`：29 files / 264 tests passed。
- [x] `cd web && npm run build`：passed。
- [x] Playwright smoke：`http://127.0.0.1:5173/` 创建 browser-local project、Fixture Run、drop `multi.extxyz`、显示 Parse Candidate Chooser、选择两个 frame 后节点显示 `electronic -100.25 hartree` 和 `electronic -100.1 hartree`；390px viewport 下 document `scrollWidth=390`，无页面级水平溢出。

## 4. 术语一致性

- `Parse Candidate Summary` / `Parse Candidate Chooser` / `Import Register Selection` / `Canvas Chemical Node Summary` / `Coordinate Preview Summary` 与设计术语一致。
- Shell/Web DTO 字段使用 snake_case 是既有 ShellResponse 约定；设计里的 camelCase 示例视为说明性 TypeScript 口径，不构成偏差。
- 防冲突 grep：`role_hint` 只出现为 `unknown`；`CDXML/CDX`、`energy.compute`、`browser_storage` 等命中来自既有导出/能量/存储能力或设计守护，不是本 feature 新增范围。

## 5. 架构归并

- [x] `.codestable/architecture/core-platform.md` 已记录 `import.register_selection`、preview candidate projection、object summary 的 `display_energy` / `coordinate_preview`、错误 target 和 Shell contract。
- [x] `.codestable/architecture/web-workbench.md` 已记录 Parse Candidate Chooser、Canvas Chemical Node、multi-candidate register/add-node 编排、UI-only 边界、失败语义、i18n/CSS/QA 覆盖。
- [x] `.codestable/architecture/ARCHITECTURE.md` 已同步总入口术语、命令清单、Object Summary Projection 和 Web Graph Canvas 能力。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已更新：用户故事补多候选手动选择和节点卡快速扫描；现状说明改为候选选择器已落地；边界说明保留不做 2D/3D、前端能量计算和 Project Content schema。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-workspace-first-canvas-mvp/rxnflow-workspace-first-canvas-mvp-items.yaml` 中 `canvas-chemical-node-card` 已从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-workspace-first-canvas-mvp/rxnflow-workspace-first-canvas-mvp-roadmap.md` 主文档第 5 节已同步状态、feature id 和完成后的最小闭环描述；candidate / coordinate contract 已校准到本次落地字段。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露新的全局环境规则或每个 feature 都会重复踩的工作流问题；现有 AGENTS.md 的 Web dev server、前端视觉验证和核心/端侧解耦规则足够覆盖。

## 9. 遗留

- 后续优化点：`canvas-path-authoring-pes-preview` 继续接 active path 绘制和 PES 预览；`minimal-cdxml-energy-delta-export` 继续接最小 CDXML 能量差导出。
- 已知限制：当前节点卡只显示轻量坐标摘要，不做 2D/3D 分子图；`role_hint` 无 parser/core 明确信号时保持 `unknown`；真实 final/TS/path semantics 留给 parser/后续 feature。
- 实现阶段顺手发现：Web DTO snake_case 与设计示例 camelCase 需要在后续 design 中更明确标注“Shell DTO 用 snake_case，局部 helper 可用 camelCase”。
