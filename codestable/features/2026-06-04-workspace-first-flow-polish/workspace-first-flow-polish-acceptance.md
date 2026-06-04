# workspace-first-flow-polish 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-05
> 关联方案 doc：codestable/features/2026-06-04-workspace-first-flow-polish/workspace-first-flow-polish-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

- [x] `AnalysisDockTab` 已落地于 `web/src/app/WorkbenchShell.tsx`，取值为 `pes | export | object | diagnostics`，只控制右侧 tab 可见性。
- [x] `WorkspaceFlowShellState` 已落地于 `WorkbenchShell.tsx`，只保存 `analysisDockTab`、`projectRailDensity`、`sourceTrayOpen` 和 `devToolsOpen` 这类 Web UI-only state。
- [x] `AnalysisDockModel` 已落地为 `analysisDockModelFromState()`，从当前 profile、artifacts、objects、warnings/error 派生 badge/status。
- [x] `SourceTrayModel` 已落地于 `ImportInbox.tsx` 与 `sourceTrayModelFromState()`，只展示 active project、raw file count、drop/preview status 和 accepted extensions。
- [x] 流程图核对通过：Project Rail 创建/打开项目 -> Canvas Stage drop/raw preview/register/add node -> GraphCanvas 连接 active path -> Analysis Dock PES/Export -> Project Rail 展示 exports，均有代码与 e2e 落点。

## 2. 行为与决策核对

- [x] Canvas Stage 是第一主界面：`GraphCanvas` 位于中间最大区域，`ImportInbox` 降级为 Source Tray。
- [x] Project Rail 只负责项目权威和文件：`ProjectSidebar` 突出 active project、Project Files、save/bundle actions；不展示未进入项目的 loose file。
- [x] Analysis Dock 用任务 tabs 收束右侧：PES、Export、Object、Diagnostics 均用 `role="tab"` / `aria-selected`。
- [x] Dev Commands 从主流程降级：Fixture Run / Invalid command 位于 Diagnostics，默认主流程不直接暴露 Invalid command。
- [x] 现有面板只是重挂：EnergyProfilePanel、ReportExportPanel、ObjectRegistryPanel、ImportInbox 继续复用原有 command / projection。
- [x] 跨层纪律通过：未新增 Shell command、Project Content schema、Browser Repository schema、localStorage key、autosave、cloud/auth 或第三方 UI/chart dependency。
- [x] 挂载点反向 grep 通过：本 feature 引用集中在 `WorkbenchShell`、`ProjectSidebar`、`ImportInbox`、i18n、CSS、tests/e2e 和文档；无 Python core/parser/report writer 挂入。
- [x] 拔除沙盘推演：移除 WorkbenchShell layout state、ProjectSidebar compaction、Source Tray、Analysis Dock、CSS/i18n/tests 后，系统会回到旧三栏面板排列；底层导入、图谱、PES、导出命令仍独立存在。

## 3. 验收场景核对

- [x] S1-S4：桌面三语义区、Project Files 主列表、project create/open/save/bundle、Source Tray 入口。证据：component tests、e2e desktop journey。
- [x] S5-S8：外部 raw drop、project raw drop、candidate chooser、Canvas Chemical Node 富摘要。证据：`workbench-journey.spec.ts`、`workbench-helpers.ts`、component tests。
- [x] S9-S12：拖线 active path、PES step delta/missing/correction count、Export 五格式、Object/Diagnostics tabs。证据：component tests、fixture e2e、local-http e2e。
- [x] S13：中英文新增文案可切换。证据：i18n tests 与 WorkbenchShell 中文文案用例。
- [x] S14-S15：桌面与 390px 窄屏无 page-level horizontal overflow，主动作可达。证据：Playwright desktop/narrow e2e。
- [x] S16-S19：`npm run test`、`npm run build`、`python3 -m unittest discover`、fixture/local-http browser smoke 均通过。

## 4. 术语一致性

- `Workspace-First Flow Shell`：文档与代码语义一致，代码以 `workbench-grid workspace-flow-shell` / Project Rail / Canvas Stage / Analysis Dock 表达。
- `Project Rail`：代码 aria label 与 i18n key 已落地；只显示项目与项目内文件。
- `Canvas Stage`：代码 aria label 与 Source Tray / GraphCanvas 主体已落地。
- `Analysis Dock`：代码 aria label、tabs 和 `AnalysisDockTab` 已落地。
- `Source Tray`：`SourceTrayModel` 与 i18n 文案已落地；不进入持久化。
- `Dev Commands`：作为 Diagnostics 内部工具呈现，不作为主 CTA。
- 防冲突 grep 通过：未出现这些 UI-only 名词进入 ShellResponse、Project Content、Browser Repository 或 localStorage。

## 5. 架构归并

- [x] `codestable/architecture/web-workbench.md` 已更新：新增 Workspace-First Flow Shell、Project Rail、Canvas Stage、Analysis Dock、Source Tray、Dev Commands 降级边界，并更新 WorkbenchShell 模块落点。
- [x] `codestable/architecture/ARCHITECTURE.md` 不需要更新：总入口已经指向 `web-workbench`，本 feature 未改变核心平台命令、Project Content schema 或 parser/export writer。
- [x] `AGENTS.md` 不需要更新：已有 Web 预览和前端验证规则足够覆盖本次暴露的工作流约束。

## 6. requirement 回写

- [x] `codestable/requirements/web-workbench-shell.md` 已更新：补充 workspace-first 用户故事、Source Tray、Analysis Dock、Dev Commands 可见层级，以及 UI-only / project authority 边界。
- [x] 本次没有新增独立 requirement slug；仍归入已有 `web-workbench-shell` 能力。

## 7. roadmap 回写

- [x] `roadmap: rxnflow-workspace-first-canvas-mvp`
- [x] `roadmap_item: workspace-first-flow-polish`
- [x] `rxnflow-workspace-first-canvas-mvp-items.yaml` 已将 `workspace-first-flow-polish` 从 `in-progress` 改为 `done`，feature id 保持 `2026-06-04-workspace-first-flow-polish`。
- [x] `rxnflow-workspace-first-canvas-mvp-roadmap.md` 子 feature 清单已同步为 `done`，并补充 Project Rail / Canvas Stage / Analysis Dock 当前口径。
- [x] roadmap YAML 已通过校验。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露每个 feature 都会重复踩的新环境、工具或工作流类信息；现有 AGENTS.md 已说明 Web 预览必须从 `web/` 运行 `npm run dev`，前端视觉/画布/报告预览改动必须浏览器验证。

## 9. 遗留

- 后续优化点：`workspace-first-flow-qa-guides` 仍是 roadmap 下一项，用于固定新主流程的用户指南和更完整验收脚本。
- 已知限制：当前视觉风格仍是工作台初版，不是品牌终稿；后续可继续替换密度、配色和组件细节。
- 实现阶段顺手发现：`web/e2e/workbench-helpers.ts` 中 edge label 编辑 helper 使用 DOM click 绕过 Playwright 在 auto-layout 后的 hit-test 拦截；真实 edge hitbox 层级如果后续用户感觉不顺，应另起 issue 定点处理。

## 验证记录

- `cd web && npm run test`：30 files / 269 tests passed。
- `cd web && npm run build`：通过。
- `cd web && npm run test:e2e -- workbench-journey.spec.ts`：6 passed。
- `cd web && npm run test:e2e:local-http`：2 passed。
- `python3 -m unittest discover`：361 tests passed。
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-06-04-workspace-first-flow-polish/workspace-first-flow-polish-checklist.yaml --yaml-only`：通过。
- `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-workspace-first-canvas-mvp/rxnflow-workspace-first-canvas-mvp-items.yaml --yaml-only`：通过。
- `git diff --check`：通过。
