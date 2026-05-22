# web-object-registry-panel 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-20
> 关联方案 doc：codestable/features/2026-05-20-web-object-registry-panel/web-object-registry-panel-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层，`ObjectSummary` 已扩展为只读 UI projection，包含 `formula`、`charge`、`spin_multiplicity`、`method`、`thermochemistry_keys`、`provenance`、`correction_count` 和 `warnings`。落点：`web/src/shell/types.ts:69`。

- [x] `ObjectSummary` 示例字段与代码一致；仍是 JSON-safe summary，不是完整 `ChemicalObject` dataclass。
- [x] `ObjectRegistryPanelState` 以 `WorkbenchShell` 内的 `activeObjectId` UI state 落地，未进入 ShellResponse 或 Project Content。落点：`web/src/app/WorkbenchShell.tsx:42`。
- [x] fixture `workbench.snapshot` 和 `import.register_all` 都返回扩展后的 object summaries。落点：`web/src/shell/fixtureTransport.ts:45`、`web/src/shell/fixtureTransport.ts:169`。

## 2. 行为与决策核对

- [x] Object Registry Panel 只读展示 `WorkbenchDomainState.objects`，对象列表和详情由 props 驱动。落点：`web/src/app/ObjectRegistryPanel.tsx:5`。
- [x] 空对象时显示 empty state，并保留 disabled correction entry。落点：`web/src/app/ObjectRegistryPanel.tsx:31`。
- [x] 有对象时展示列表、active object detail、source、energy keys、thermochemistry keys、provenance 和 warnings。落点：`web/src/app/ObjectRegistryPanel.tsx:38`、`web/src/app/ObjectRegistryPanel.tsx:64`。
- [x] Active Object 是 UI-only；objects 更新后保持现有选择或自动选择第一个对象。落点：`web/src/app/WorkbenchShell.tsx:65`。
- [x] Correction Entry Point 可见但 disabled；没有 correction form，也没有 Shell command。落点：`web/src/app/ObjectRegistryPanel.tsx:163`。
- [x] i18n 只覆盖静态 UI 文案；object id、label、parser id/version、warning code/message/target 原样显示。落点：`web/src/app/i18n/messages.ts:55`。
- [x] 挂载点反向核查通过：本 feature 只挂入方案列出的 Web app、Shell DTO、fixture transport、i18n、CSS、测试和 CodeStable 文档。
- [x] scope grep 无命中：未引入 `apply_correction`、`ChemicalRegistry`、`ProjectContent`、HTTP/cloud SDK、file picker 或 drag/drop。

## 3. 验收场景核对

- [x] 首屏无对象时显示 empty state，`Add Correction` disabled。证据：`WorkbenchShell.test.tsx:10`。
- [x] Fixture Run 后显示 Object A / Object B，对象详情显示 `fixture-parser`、`fixture-source`、`electronic`。证据：`WorkbenchShell.test.tsx:43`。
- [x] 点击 Object B 只改变 active detail，显示 `H2`、`B3LYP/def2-SVP` 和 `unit_assumed` warning。证据：`WorkbenchShell.test.tsx:59`。
- [x] Import Inbox register all 后 imported object 出现在对象面板，可选中查看 `H2O`、`raw-water-xyz`、`xyz-ase`。证据：`WorkbenchShell.test.tsx:83`。
- [x] 中文 locale 下对象面板静态文案为简体中文，动态 code/id 保持原样。证据：`WorkbenchShell.test.tsx:217`。
- [x] 真实页面验证：`http://127.0.0.1:5173/` 在 Playwright Chromium `1280x720` 与 `390x840` 下运行 Fixture、选择 Object B；对象面板、warning、disabled correction entry 可见，无 console warning/error，无水平溢出。截图：`/tmp/rxnflow-object-registry-desktop.png`、`/tmp/rxnflow-object-registry-narrow.png`。
- [x] Browser 插件路径已先尝试；当前 in-app Browser 点击中文 Fixture 按钮超时，按前端调试流程 fallback 到普通 Playwright 完成桌面/窄屏验证。

## 4. 术语一致性

- Object Registry Panel：代码命中集中在 `ObjectRegistryPanel.tsx`、WorkbenchShell 挂载和 i18n 文案，语义一致。
- Object Summary Projection：落在 `ObjectSummary` DTO 和 fixture projection，未复制完整 core model。
- Active Object：只以 `activeObjectId` UI state 出现。
- Correction Entry Point：仅 disabled button，没有 correction command 或 registry write。
- Object Warning：使用 `ShellWarning` 投影，warning code/message/target 原样展示。

## 5. 架构归并

- [x] `codestable/architecture/web-workbench.md`：记录 Object Registry Panel、ObjectSummary projection、UI-only active object selection、disabled correction entry、浏览器 QA 证据。
- [x] `codestable/architecture/ARCHITECTURE.md`：补充 Web Object Registry Panel 术语、模块索引和边界；core ChemicalRegistry / corrections 仍保持核心层边界。

## 6. requirement 回写

- [x] `codestable/requirements/web-workbench-shell.md` 已补充用户可查看已登记对象列表与详情、warning/provenance/energy key 展示，以及校正写入仍未实现的边界。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-items.yaml` 中 `web-object-registry-panel` 已由 `in-progress` 改为 `done`。
- [x] `codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-roadmap.md` 中 Object Registry Panel 子 feature 状态同步为 done。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无新增候选。现有 AGENTS.md 已记录前端视觉/画布改动需浏览器验证、Web dev server 预览方式和常用 test/build 命令。

## 9. 遗留

- 真实 browser File bytes 到 Python parser preview bridge 仍未实现，沿用 Import Inbox feature 的既有边界。
- Object Registry Panel 不提供 correction 写入；真正 correction form / shell command 需要独立 feature。
- 对象拖入/放入画布不在本 feature 范围内，下一项 `web-graph-canvas-mvp` 处理。
