# Web Energy Semantics Controls 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：`codestable/features/2026-05-22-web-energy-semantics-controls/web-energy-semantics-controls-design.md`

## 1. 接口契约核对

对照方案第 2.1 节，接口契约已落地：

- [x] `CompositionDraftRow` / `CompositionDraftState`：`web/src/app/compositionDraftState.ts:3` 定义 object/coefficient/role/label rows 和 nodeId/rows/dirty state；`compositionDraftFromSelectedNode` / `reconcileCompositionDraft` 在 `web/src/app/compositionDraftState.ts:22` 和 `web/src/app/compositionDraftState.ts:40` 落地 selected-node 初始化、切换和 stale prune。
- [x] `EnergyPanelOptions`：`web/src/app/EnergyProfilePanel.tsx:20` 已包含 `energySource`、`correctionPolicyMode`、`correctionKinds`、`correctionIds`。
- [x] `workspace.set_node_composition` args：`web/src/app/WorkbenchShell.tsx:656` 把 draft rows 转为 numeric coefficient payload，`web/src/app/WorkbenchShell.tsx:695` 调用 shell command；fixture 接收端在 `web/src/shell/fixtureTransport.ts:399` 更新 workspace projection。
- [x] `energy.compute` args：`web/src/app/WorkbenchShell.tsx:852` 映射 `energy_key`、`energy_source`、`include_corrections`、`correction_policy`；`correctionPolicyFromEnergyOptions` 在 `web/src/app/WorkbenchShell.tsx:1253` 将 kinds/ids 文本转为 shell policy。
- [x] `EnergyChannelSummary` / `ReactionNodeCompositionTermSummary` 继续从 shell DTO 导出，`web/src/shell/index.ts:16`、`web/src/shell/index.ts:42` 对 Web app 可见。

流程图核对：graph node selection -> Composition Draft -> Node Composition Editor -> `workspace.set_node_composition` -> ShellResponse workspace projection，和 Energy Channel Selector / Correction Policy Controls -> `energy.compute` -> profile/expression projection 的路径都在 `WorkbenchShell`、`GraphCanvas`、`EnergyProfilePanel` 和 fixture transport 中有实际落点。

## 2. 行为与决策核对

需求摘要已满足：

- [x] 选中 graph node 后可编辑节点 composition rows；UI 挂载在 Network Preview 侧区 `web/src/app/GraphCanvas.tsx:424`，编辑器本体在 `web/src/app/GraphCanvas.tsx:749`。
- [x] composition 编辑显式 Apply；未 Apply 前只改 Composition Draft，Apply 成功后只用 ShellResponse workspace projection 重建 draft，见 `web/src/app/WorkbenchShell.tsx:715`。
- [x] Energy Channel Selector 从 `objects[].energy_channels` 汇总候选，显示 source/key/unit/object count，见 `web/src/app/EnergyProfilePanel.tsx:114` 和 `web/src/app/EnergyProfilePanel.tsx:309`。
- [x] Correction Policy Controls 替换旧单 checkbox 语义，none/all/kinds/ids 控件见 `web/src/app/EnergyProfilePanel.tsx:180`。
- [x] UI 保持编辑器式密度；composition rows 和 energy controls 的响应式样式见 `web/src/app/workbench.css:1385`、`web/src/app/workbench.css:1554`、`web/src/app/workbench.css:2188`。

明确不做已守住：

- [x] 未新增 Python shell command、Project Content schema、Browser Project Repository schema 或 Web storage key。本次实现提交只改 Web app/shell fixture/types/test/i18n/CSS 和 checklist。
- [x] 未在 Web 代码 import Python core、EnergyProfileEngine、ProjectContentValidator 或 parser modules。范围 grep 中的 parser/project/export 命中均为既有 Import Inbox、Project Sidebar、Report Export 或 fixture 代码。
- [x] Composition Draft / energy options 未调用 `project.save_content`、Browser Repository write 或 localStorage 保存。相关命中均来自既有 Project Sidebar、Export Artifact Persistence 或 i18n locale preference，不属于本 feature 新路径。
- [x] 未新增图表库、ChemDraw/CDXML 导出逻辑、报告导出格式或 cloud/account SDK。
- [x] missing energy / invalid composition 未被前端自动修复；invalid coefficient 只显示 `invalid_input` 并阻止提交，missing energy 仍交由 shell/core diagnostics。

挂载点反向核对：

- [x] Graph Canvas selected-node inspector：新增 `NodeCompositionEditor` 挂载在 `web/src/app/GraphCanvas.tsx:424`，可通过移除 props、editor component 和 composition CSS 完整卸载。
- [x] WorkbenchShell orchestration：composition draft state、handlers 和 `workspace.set_node_composition` command 集中在 `web/src/app/WorkbenchShell.tsx:104`、`web/src/app/WorkbenchShell.tsx:631`、`web/src/app/WorkbenchShell.tsx:656`，可独立拔除。
- [x] Energy Profile Panel options：`EnergyPanelOptions`、channel selector 和 policy controls 集中在 `web/src/app/EnergyProfilePanel.tsx`，WorkBenchShell 只负责 options state 与 command args 映射。
- [x] Web fixture/test/i18n/CSS 的新增引用均在设计清单内，未发现清单外挂载点。

## 3. 验收场景核对

- [x] S1 Fixture Run 后选中 graph node，Node Composition Editor 显示 object/coefficient/role 和 Apply/Reset controls。证据：`web/src/app/WorkbenchShell.test.tsx:448`；浏览器 QA 可见中文“节点组成”。
- [x] S2 selected node 改成 `object-a * 1 + object-b * 2` 后调用 `workspace.set_node_composition`。证据：`web/src/app/WorkbenchShell.test.tsx:469`，浏览器 QA 后 node card 显示 `object-a + 2*object-b`。
- [x] S3 coefficient 为 0 时不发 shell command，UI 显示 code/target。证据：`web/src/app/WorkbenchShell.test.tsx:479`。
- [x] S4 删除 selected node 或切换 workspace 后 draft 不保留 stale node id。证据：`web/src/app/compositionDraftState.test.ts:59`。
- [x] S5 Energy Channel Selector 显示 Object Summary channels 的 key/source/unit。证据：`web/src/app/WorkbenchShell.test.tsx:660`。
- [x] S6 选择 `thermochemistry:gibbs` 后发送 `energy_source=thermochemistry` 和 `energy_key=gibbs`。证据：`web/src/app/WorkbenchShell.test.tsx:652`。
- [x] S7 自定义 energy key fallback 保留为文本输入。证据：`web/src/app/EnergyProfilePanel.tsx:141` 和 `web/src/app/EnergyProfilePanel.tsx:317`。
- [x] S8/S9/S10/S11 Correction policy none/all/kinds/ids 映射 shell args。证据：`web/src/app/WorkbenchShell.test.tsx:618`。
- [x] S12 Compute 成功后 Expression Details 展示 composition coefficient 和 energy source。证据：`web/src/app/WorkbenchShell.test.tsx:673`、`web/src/app/WorkbenchShell.test.tsx:693`；fixture expression projection 在 `web/src/shell/fixtureTransport.ts:1320`。
- [x] S13 新增静态文案进入 zh-CN/en-US，动态 id/key/source/unit/code 原样显示。证据：`web/src/app/i18n/messages.ts:67` 与 `web/src/app/i18n/messages.ts:341`。
- [x] S14 桌面浏览器无文字重叠/无水平溢出。证据：Browser QA `1280x900`，`scrollWidth=1280`、`overflow=false`、grid columns `320px 564px 340px`，profile id 和 graph composition 均可见，console error 为 0。
- [x] S15 窄屏浏览器 composition rows/channel selector/policy controls 无整体水平溢出。证据：Browser QA `390x900`，composition row width 314px，energy options 单列 314px，`scrollWidth=390`、`overflow=false`，policy controls 和 expression details 可见。

验证命令：

- `cd web && npm run test`：17 files / 145 tests passed。
- `cd web && npm run build`：passed。
- `python3 -m unittest discover`：298 tests passed。
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-22-web-energy-semantics-controls/web-energy-semantics-controls-checklist.yaml --yaml-only`：passed。

## 4. 术语一致性

- `Node Composition Editor`：组件和 aria 文案落在 `GraphCanvas.tsx` / i18n catalog；没有和 core `ReactionNodeCompositionTerm` 混名。
- `Composition Draft`：类型、helper 和 tests 使用统一命名；只存在 Web app state。
- `Energy Channel Selector`：UI 文案为 `Energy channel` / `能量通道`，候选来源为 `ObjectSummary.energy_channels`。
- `Correction Policy Controls`：UI 文案为 correction policy controls，shell args 使用既有 `correction_policy`。
- 防冲突 grep：未引入设计外长期领域模型名；新增概念均已在 design 第 0 节和架构文档回写。

## 5. 架构归并

- [x] `codestable/architecture/web-workbench.md`：已补 Node Composition Editor、Composition Draft、Energy Channel Selector、Correction Policy Controls、Shell authority、UI-only draft/options、fixture/browser QA 和模块职责。
- [x] `codestable/architecture/ARCHITECTURE.md`：已补 Web Node Composition Editor、Composition Draft、Web Energy Channel Selector、Web Correction Policy Controls，并更新 Web Graph Canvas / Energy Profile Panel 当前能力。
- [x] `AGENTS.md`：无需更新。Web 预览必须从 `web/` 跑 `npm run dev` 并打开 `http://127.0.0.1:5173/` 的规则已存在，本 feature 未暴露新的项目级硬约束。

## 6. Requirement 回写

- [x] `requirement: web-workbench-shell` 已更新 `codestable/requirements/web-workbench-shell.md`：补充用户故事，说明 Web 中可编辑节点组成、选择 energy channel/source 和 correction policy；边界同步注明不自动配平、不做前端重算、不保存 draft/options。

## 7. Roadmap 回写

- [x] `codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-items.yaml`：`web-energy-semantics-controls` 从 `in-progress` 改为 `done`，feature 保持 `2026-05-22-web-energy-semantics-controls`，notes 更新为已落地能力。
- [x] `codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-roadmap.md`：第 5 节对应子 feature 改为 `done`，观察项同步为已接入 Web Workbench。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 没有新增每个后续 feature 都会反复踩的环境/工具规则；已有 `AGENTS.md` 已覆盖 Web dev server 和浏览器验证要求。

## 9. 遗留

- 后续优化点：roadmap 中 `energy-curve-interaction-polish` 仍 planned，负责 tooltip、missing/correction 标记、选中节点联动和导出一致性检查。
- 已知限制：Energy Channel Selector 第一版不做 path-level common/partial channel 诊断；Correction IDs 第一版按逗号/空白切分，不验证 id 是否存在于每个 path node；Node Composition Editor 不做自动配平、元素守恒、电荷守恒或原子映射。
- 顺手发现：无未处理的实现阶段顺手发现。
