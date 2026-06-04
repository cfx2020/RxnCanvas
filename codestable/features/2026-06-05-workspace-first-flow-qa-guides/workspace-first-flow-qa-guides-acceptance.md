# workspace-first-flow-qa-guides 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-05
> 关联方案 doc：codestable/features/2026-06-05-workspace-first-flow-qa-guides/workspace-first-flow-qa-guides-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

- [x] `WorkspaceFirstQaScenario` 已落地为 `docs/dev/workspace-first-flow-qa.md` 的 QA Matrix table，包含 scenario id、mode、viewport、command/spec、proves 和 does not prove。
- [x] `WorkspaceFirstUserJourney` 已落地为 `docs/user/workspace-first-workbench.md` 的最小验收路线，覆盖 create/open browser project、raw file drop/select、canvas node、path connection、PES preview、Export tab、Save Bridge、Export Bundle、Import Bundle 和 Open Bridge restore。
- [x] 两个 contract 只作为文档/QA 组织方式存在；grep 和 diff 确认没有进入 TypeScript production model、Shell DTO、Project Content、Browser Repository 或 localStorage。
- [x] 流程图核对通过：read roadmap/e2e/docs -> define QA matrix -> strengthen fixture/local-http evidence -> write user guide -> write dev QA guide -> crosslink guides -> run verification，均有本次 diff 落点。

## 2. 行为与决策核对

- [x] 自动化目标落地：`openWorkbench()` 新增 Project Sidebar、Graph Canvas、Analysis Dock/PES/Export 可见断言；local-http bundle roundtrip 在 re-import + Open Bridge 后确认 raw input path 仍在 Project Sidebar。
- [x] 文档目标落地：用户指南从 Web 工作台第一屏开始说明主流程；开发者指南给出 fixture/local-http/manual/Python/Web/YAML/diff check 的 QA matrix。
- [x] 用户指南作为入口而非细节复制：report export、project bundle、open project、parser output support 继续由已有指南承载，workspace-first 指南只给顺序和边界，并增加相关链接。
- [x] 开发者 QA matrix 独立于 graph gesture guide：`docs/dev/graph-editor-e2e-qa.md` 只增加指向 workspace-first QA 总入口的说明。
- [x] fixture/local-http 分工不变：fixture 负责桌面/窄屏 UI 编排与复杂 graph gestures；local-http 负责真实 Python bridge 主链路和 bundle roundtrip。
- [x] 测试补强只加用户可见断言：没有直接 mutate WorkbenchDomainState、ShellResponse 或 repository bytes；bundle download entry readback 保持为测试产物检查。
- [x] 跨层纪律通过：未新增 Shell command、Python parser/core/report writer、Project Content schema、Browser Repository schema、localStorage key、生产 UI、依赖、cloud/auth/autosave/directory watcher 或 CDX writer。
- [x] 挂载点反向 grep 通过：本 feature 引用集中在新增用户/开发者指南、既有指南交叉链接、`web/e2e/workbench-helpers.ts`、`web/e2e/local-http-bridge.spec.ts` 和 CodeStable 回写；无清单外 runtime/schema/parser/export writer 挂入。
- [x] 拔除沙盘推演：删除新增两份指南、既有指南链接、E2E 辅助断言和 CodeStable 回写后，产品运行时能力不变，只会失去 workspace-first 主流程验收入口和补强证据。

## 3. 验收场景核对

- [x] S1-S4 用户指南与交叉链接：`docs/user/workspace-first-workbench.md` 存在，覆盖三栏主流程、导入/拖入、PES、Export、Save Bridge、Export/Import Bundle、Open Bridge restore，并链接 report/bundle/open-project/parser 指南。
- [x] S5-S6 开发者 QA guide：`docs/dev/workspace-first-flow-qa.md` 包含 fixture desktop/narrow、local-http bridge、manual user journey、Web unit/build、Python unittest、YAML 和 diff check 的命令矩阵，并明确 fixture/local-http 证明边界。
- [x] S7-S8 fixture E2E：`cd web && npm run test:e2e -- workbench-journey.spec.ts` 6 passed；桌面和 390px 窄屏均检查 framework overlay、console clean 和 no horizontal overflow。
- [x] S9 local-http E2E：`cd web && npm run test:e2e:local-http` 2 passed；覆盖 small file preview、Open Bridge、Save Bridge、energy compute、五格式 export persistence、bundle export/import/open restore 和 raw file retention。
- [x] S10-S11 QA evidence boundary：Playwright output 仍写入 gitignored `web/test-results*` / `web/playwright-report*`；未写入 Project Content、Browser Repository、bundle 或 report artifacts。
- [x] S12-S17 验证命令：Web test、build、fixture e2e、local-http e2e、Python unittest、YAML 和 `git diff --check` 均通过。
- [x] 反向检查通过：没有把 fixture parser 结果写成真实 Gaussian/ORCA/MAPLE/XYZ/extxyz 完整支持承诺；没有把 CDXML 写成 CDX 或 molecule-level ChemDraw 结构；用户指南明确不能用 `file://.../web/index.html` 预览。

## 4. 术语一致性

- `Workspace-First QA Matrix`：命中 design、checklist、acceptance 和 `docs/dev/workspace-first-flow-qa.md`，语义一致。
- `Workspace-First User Guide`：命中 design、checklist、acceptance 和 `docs/user/workspace-first-workbench.md`，语义一致。
- `Fixture Journey`：保留在 `workbench-journey.spec.ts` 语境，文档中表述为 fixture desktop/narrow workbench journey。
- `Local-HTTP Roundtrip`：保留在 `local-http-bridge.spec.ts` 和 QA matrix，明确不复制复杂 graph gestures。
- `QA Evidence Boundary`：文档、架构和 acceptance 均指向 Playwright output 不进入项目内容或导出 artifacts。
- 防冲突 grep 通过：没有新增同名 runtime model、Shell DTO、Project Content schema 或 Browser Repository type。

## 5. 架构归并

- [x] `codestable/architecture/web-workbench.md` 已更新：frontmatter 增加 workspace-first QA/guides tags；当前能力加入 Workspace-First Flow QA & Guides；QA section 记录用户/开发者指南入口、fixture/local-http 分工、E2E helper 断言和 QA evidence boundary。
- [x] `codestable/architecture/core-platform.md` 不需要更新：本 feature 未改变 core command、parser、energy、report writer、Project Content codec 或 Shell contract。
- [x] `codestable/architecture/ARCHITECTURE.md` 不需要更新：总入口已指向 `web-workbench`，本次是该子系统内部 QA/guides 现状补充。

## 6. requirement 回写

- [x] `codestable/requirements/web-workbench-shell.md` 已更新：补充“用户按一份指南验收 Web 工作台可用性”和“开发者/agent 按 QA matrix 选择回归命令”的用户故事。
- [x] requirement 的“怎么解决”已补 workspace-first 用户/开发者验收入口。
- [x] requirement 的边界已补：指南不替代细节指南、QA matrix 不新增产品能力、fixture/local-http 不承诺完整 parser 认证、Playwright output 不进入项目内容或导出 artifacts。
- [x] 本次不新增独立 requirement slug，仍归入 `web-workbench-shell`。

## 7. roadmap 回写

- [x] `roadmap: rxnflow-workspace-first-canvas-mvp`
- [x] `roadmap_item: workspace-first-flow-qa-guides`
- [x] `rxnflow-workspace-first-canvas-mvp-items.yaml` 已将 `workspace-first-flow-qa-guides` 从 `in-progress` 改为 `done`，feature id 保持 `2026-06-05-workspace-first-flow-qa-guides`。
- [x] `rxnflow-workspace-first-canvas-mvp-roadmap.md` 子 feature 清单已同步为 `done`，对应 feature id 已补齐。
- [x] 该 roadmap 全部 items 已完成，主文档状态改为 `completed`，`last_reviewed` 更新为 `2026-06-05`。
- [x] roadmap YAML 已通过校验。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。AGENTS.md 已有“Web 工作台开发预览必须从 `web/` 运行 `npm run dev`，不要直接用 file:// 预览”的规则；本次指南只是把同一规则面向用户验收再说明一遍。

## 9. 遗留

- 后续优化点：无本 feature 必需后续项；workspace-first-canvas-mvp roadmap 已全部完成。
- 已知限制：用户指南与 QA matrix 只固定当前主流程和证明边界，不扩大到完整真实计算输出兼容认证、云存储、自动保存、CDX 或 molecule-level CDXML。
- 实现阶段顺手发现：实验性把 `Save Bridge` 放在 local-http fixture graph/export 之后会触发现有 `Reaction graph project_id does not match section project_id` 校验错误；该路径来自 fixture graph 与 local-http project 的混用，不在本 QA/guides feature 范围内。若后续要让 local-http `Fixture Run` 后的 graph/export 也作为保存场景，应另起 issue 分析 project_id 归属。

## 验证记录

- `cd web && npm run test`：30 files / 269 tests passed。
- `cd web && npm run build`：通过。
- `cd web && npm run test:e2e -- workbench-journey.spec.ts`：6 passed。
- `cd web && npm run test:e2e:local-http`：2 passed。
- `python3 -m unittest discover`：361 tests passed。
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-06-05-workspace-first-flow-qa-guides/workspace-first-flow-qa-guides-checklist.yaml --yaml-only`：通过。
- `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-workspace-first-canvas-mvp/rxnflow-workspace-first-canvas-mvp-items.yaml --yaml-only`：通过。
- `git diff --check`：通过。
