# graph-editor-advanced-e2e-qa 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-24
> 关联方案 doc：.codestable/features/2026-05-24-graph-editor-advanced-e2e-qa/graph-editor-advanced-e2e-qa-design.md

## 1. 接口契约核对

对照方案第 2.1 节，本 feature 只扩展 E2E / QA helper / 文档，不新增生产 runtime contract。

**接口示例逐项核对**：
- [x] `AdvancedGraphEditorE2eMatrix.desktop`：`web/e2e/workbench-journey.spec.ts` 的 `desktop graph editor matrix covers advanced editing and bridge restore` 串起 auto layout、path delete、edge label、free edge、rubber-band multi-select、keyboard nudge/history、wheel/minimap、Save/Open Bridge restore；结果一致。
- [x] `AdvancedGraphEditorE2eMatrix.narrow`：`narrow graph editor keeps advanced controls reachable` 覆盖 advanced controls、minimap、Network Preview、Path list、Edge Label Editor 和 no horizontal overflow；结果一致。
- [x] `AdvancedGraphEditorE2eMatrix.localHttp`：`web/e2e/local-http-bridge.spec.ts` 仍只保留 Python local-http bridge smoke 与 bundle roundtrip；没有复制复杂 graph gestures；结果一致。

**名词层"现状 -> 变化"逐项核对**：
- [x] `web/e2e/workbench-helpers.ts` 新增高级图谱 helper，均通过 UI / DOM input 触发 Shell command，不直接写 React state、Project Content 或 ShellResponse。
- [x] `docs/dev/graph-editor-e2e-qa.md` 记录 fixture/local-http 命令、覆盖范围和输出边界。
- [x] `web/src/app/graphAutoLayout.ts` 与 `web/src/app/graphViewport.ts` 只调整窄屏 fit 可视边界，不新增 command/schema/dependency。

**流程图核对**：
- [x] Open fixture workbench -> Create browser-local project -> Run fixture workspace -> Exercise desktop graph matrix -> Save Bridge Session -> Reload/Open Bridge -> Assert restored projection：对应 desktop graph editor matrix。
- [x] Open narrow fixture workbench -> Run fixture workspace -> Assert advanced controls reachable -> Assert no overflow / overlay / console issues：对应 narrow graph editor spec。
- [x] Run local-http E2E -> Bridge smoke only：对应 local-http bridge spec。

## 2. 行为与决策核对

**需求摘要逐项验证**：
- [x] 默认 fixture E2E 在 `1280x720` 覆盖 auto layout、path delete、edge label edit、free edge drawing、multi-select / rubber-band、keyboard nudge、wheel / minimap、limited undo / redo 和 Save / Open Bridge restore。
- [x] 默认 fixture E2E 在 `390x840` 覆盖高级图谱控制入口可见、可操作、无水平溢出、无 framework overlay、console clean。
- [x] local-http E2E 仍只验证真实 Python bridge 主链路，没有复制复杂 gesture matrix。
- [x] helper 优先使用可访问入口；pointer/wheel/drag 只在浏览器自动化需要时使用局部 DOM event helper。
- [x] 开发者指南说明命令、fixture/local-http 边界和 Playwright 输出目录。

**明确不做逐项核对**：
- [x] 未新增生产 UI、Python core command、Platform Shell command、Project Content schema、Browser Project Repository API 或 localStorage graph persistence。
- [x] 未用 E2E 代替 parser、energy、export 领域算法单元测试。
- [x] 未把复杂 graph gesture 加进 local-http bridge smoke。
- [x] 未引入新的测试框架、视觉 diff 服务、云端矩阵、截图基线库或 CI 配置。
- [x] 未提交 Playwright screenshot、trace、HTML report、test-results 或 downloaded bundle 临时文件。
- [x] 未把 CDXML / ChemDraw 导出能力混进本 QA feature。

**关键决策落地**：
- [x] 复杂手势矩阵由默认 fixture 承担，见 `web/e2e/workbench-journey.spec.ts`。
- [x] local-http 只守 bridge 主链路，见 `web/e2e/local-http-bridge.spec.ts`。
- [x] Save/Open Bridge restore 验证 node position、edge label、viewport、active path，Graph Editor History reload 后为空。
- [x] QA 文档放在 `docs/dev/graph-editor-e2e-qa.md`，未增加用户面板说明。

**挂载点反向核对**：
- [x] 挂载点只落在 Playwright fixture spec/helper、local-http smoke 微调、dev guide、CodeStable 回写、窄屏 layout/viewport fit helper。
- [x] grep 核对：`web/e2e` 只在 `resetWorkbenchStorage` 清理测试上下文的 localStorage / IndexedDB；未直接 mutate WorkbenchDomainState、repository bytes、Project Content files 或 ShellResponse。
- [x] 拔除沙盘：删除本 feature 新增 helper/spec/doc/fit 调整和 CodeStable feature 目录后，不会遗留新生产 command、schema、dependency 或 persistence API。

## 3. 验收场景核对

- [x] S1 Apply Layout：`npm run test:e2e` desktop graph matrix 通过，layout 后 viewport projection 变化，并能 undo/redo。
- [x] S2 Path delete：desktop graph matrix 创建临时 path 后删除，Path list / active path / Network Preview 跟随 projection。
- [x] S3 Edge label edit：desktop graph matrix 将 fixture edge label 改为 `TS scan`，SVG/edge hitbox/restore 均可见。
- [x] S4 Free edge drawing：desktop graph matrix 从 `node-b` handle 拖到 `node-web-3` 创建临时 edge，diagnostics 更新为 no disconnected nodes。
- [x] S5 Multi-select / rubber-band：desktop graph matrix 框选临时 nodes 并 Delete，Network Preview 回到 fixture 主图。
- [x] S6 Keyboard nudge + history：desktop graph matrix 方向键移动 selected node，并通过 Undo/Redo 恢复/重放。
- [x] S7 Wheel / minimap / history：desktop graph matrix 覆盖 wheel zoom、minimap click/drag、viewport undo/redo。
- [x] S8 Save/Open Bridge restore：desktop graph matrix 保存后 reload/open，恢复 `120%` viewport、reordered path、edge label，Undo/Redo disabled。
- [x] S9 Narrow advanced controls：`390x840` E2E 通过；Browser DOM QA 复测显示 canvas `clientWidth=368`、`scrollWidth=368`、两个 node 左右 clear 均为正数、`horizontalOverflow=false`。
- [x] S10 全局健康：默认 fixture E2E 检查 framework overlay absent、console clean、no horizontal overflow。
- [x] S11 local-http smoke boundary：`npm run test:e2e:local-http` 2 tests passed，只覆盖 bridge 主链路与 bundle roundtrip。
- [x] S12 输出边界：`git status --short --untracked-files=all` 未出现 `web/test-results*` 或 `web/playwright-report*`。
- [x] S13 helper 不直改业务状态：grep 只发现测试隔离清理 localStorage/IndexedDB，没有写 WorkbenchDomainState / ShellResponse。
- [x] S14 no production dependency/schema：`web/package.json` 与 lockfile无 diff，未新增生产 API。

## 4. 术语一致性

- Advanced Graph Editor QA Harness：落在 roadmap、design、architecture、requirement、dev guide，语义为 QA harness，不是生产 runtime 模块。
- Desktop Graph Matrix：spec 名称和 dev guide 均指向 `desktop graph editor matrix covers advanced editing and bridge restore`。
- Narrow Graph Matrix：落地为 `narrow graph editor keeps advanced controls reachable`。
- Local HTTP Smoke Boundary：local-http spec 保持 smoke / bundle roundtrip 边界，未承载复杂 gestures。
- QA Output Boundary：dev guide 和 architecture 都声明 Playwright output 只进 gitignored output 目录。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md`：更新 E2E QA Harness 当前能力，记录 desktop advanced graph matrix、narrow advanced controls、local-http smoke 边界和 helper 职责。
- [x] 新增生产模块：无。
- [x] AGENTS.md：本 feature 未暴露新的项目级硬约束；现有 UI 验证和 dev server 规则已足够。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md`：更新 Web 工程两条真实浏览器回归入口，补充 desktop advanced graph matrix、narrow advanced controls、local-http smoke 不复制复杂 gesture 的当前边界。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-items.yaml`：`graph-editor-advanced-e2e-qa` 已改为 `done`，feature 指向 `2026-05-24-graph-editor-advanced-e2e-qa`。
- [x] `.codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-roadmap.md`：子 feature 清单改为 `done`，排期思路和观察项改写为当前 roadmap 已收束到可重复 QA。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 强化的命令和边界已写入 `docs/dev/graph-editor-e2e-qa.md`；项目级 `AGENTS.md` 已包含前端浏览器验证和 Web dev server 规则。

## 9. 遗留

- 后续优化点：endpoint reconnect、edge rerouting、label collision avoidance、视觉 diff / screenshot baseline 可作为独立后续 roadmap，不属于本 QA feature。
- 已知限制：local-http E2E 仍是 bridge smoke，不证明复杂 graph gesture 在真实 bridge 下逐项运行；这是本 feature 的刻意边界。
- 实现阶段发现：窄屏 Apply Layout 后节点曾横向裁切，已通过 auto layout padding 和 responsive viewport fit 修正，并用 E2E 与 Browser DOM QA 验证。

## 验证记录

- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-24-graph-editor-advanced-e2e-qa/graph-editor-advanced-e2e-qa-checklist.yaml --yaml-only`
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-web-graph-editor-advanced/rxnflow-web-graph-editor-advanced-items.yaml --yaml-only`
- `cd web && npm run test -- --run` -> 23 files / 238 tests passed
- `cd web && npm run build` -> passed
- `python3 -m unittest discover` -> 304 tests passed
- `cd web && npm run test:e2e` -> 6 passed
- `cd web && npm run test:e2e:local-http` -> 2 passed
- Browser plugin `http://127.0.0.1:5173/` narrow DOM QA -> no horizontal overflow, graph nodes horizontally within canvas after fixture run
- `git diff --check` -> passed
