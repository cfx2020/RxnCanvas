# Web App Shell Client 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-16
> 关联方案 doc：.codestable/features/2026-05-16-web-app-shell-client/web-app-shell-client-design.md

## 1. 接口契约核对

对照方案第 2.1 节，本 feature 已新增 `web/` 前端工程、TypeScript Shell DTO、ShellClient、fixture transport、WorkbenchShellState 和基础 React component tree。

接口示例逐项核对：

- [x] `shellClient.run<FixtureRunData>({ command: "fixture.run", args: {} })`：`web/src/shell/ShellClient.test.ts` 覆盖，实际返回 `ok=true`、`data.command="fixture.run"`、`profile.id="profile-a-b-electronic"`、`object_count=2`，并可 `JSON.stringify`。
- [x] `fixtureTransport.run({ command: "missing.command", args: {} })`：`web/src/shell/ShellClient.test.ts` 覆盖，实际返回 `ok=false`、`error.code="invalid_input"`、`error.target="command"`。
- [x] `WorkbenchShellState` 投影：`web/src/app/workbenchState.ts` 将 fixture `ShellResponse` 投影为 status、session/project/graph/profile summary、object/profile/artifact counts、warnings 和 error。

名词层“现状 → 变化”逐项核对：

- [x] `web/package.json`：已新增前端 package，包含 `dev`、`build`、`test` scripts。
- [x] `ShellCommandPayload` / `ShellResponse` / `ShellArtifact` 等 DTO：已在 `web/src/shell/types.ts` 稳定定义。
- [x] `ShellTransport` / `ShellClient`：已在 `web/src/shell/types.ts` 和 `web/src/shell/ShellClient.ts` 落地；当前代码只声明已实现的 `in-process-test` transport，后续 bridge/http transport 留在 roadmap。
- [x] `FixtureRunData` / `fixtureTransport`：已在 `web/src/shell/fixtureTransport.ts` 落地。
- [x] `App` / `WorkbenchShell` / `ProjectRail` / `GraphWorkspaceFrame` / `InspectorPanel` / `CommandStatusPanel`：已在 `web/src/app/` 落地。

流程图核对：Browser loads `web/index.html` → React App mounts → create ShellClient with FixtureTransport → WorkbenchShell renders local-only workspace → user clicks fixture command → ShellClient.run → FixtureTransport returns success/error ShellResponse → projectFixtureResponse updates WorkbenchShellState → UI renders status/summary/error。对应代码分别落在 `web/index.html`、`web/src/main.tsx`、`web/src/app/App.tsx`、`web/src/app/WorkbenchShell.tsx`、`web/src/shell/ShellClient.ts`、`web/src/shell/fixtureTransport.ts` 和 `web/src/app/workbenchState.ts`。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] 独立 `web/` app skeleton 已创建，未把前端文件放进 Python package。
- [x] TypeScript 版 ShellClient DTO 和 transport 接口已落地。
- [x] `fixture.run` 成功路径和 unknown command 错误路径均由测试覆盖。
- [x] 第一屏直接进入工作台布局，显示 `Local-only`、command status、project/object/graph/profile summary 和后续面板占位。
- [x] 前端 `build/test/dev` scripts 可执行，桌面和窄屏浏览器验证已完成。

明确不做逐项核对：

- [x] 未新增真实 HTTP API、Vercel route、FastAPI、Flask、Django、Express 或 local-python bridge：scope grep 无命中。
- [x] 未实现 IndexedDB / OPFS Browser Project Repository：scope grep 无 `indexeddb` / `opfs` 命中。
- [x] 未实现真实项目新建/打开/保存、bundle import/export、文件导入、parser preview 或 object registry：UI 只有 fixture command 和摘要投影。
- [x] 未实现真实 graph canvas 编辑、自动布局、selection persistence、energy curve 或 report export UI：当前 path board 是占位预览，不是可拖拽画布。
- [x] 未调用 Python core，未复制 parser/registry/graph/energy/export 领域算法：`web/src` 无相关实现；领域文件 diff 为空。
- [x] 未新增账号、云存储、同步、权限、多人协作或外部量化计算任务调度：package dependencies 和 source grep 均无命中。
- [x] Fixture 数据未被描述为真实 Gaussian/ORCA/MAPLE 支持能力：架构和 requirement 均标明 fixture 只是壳层闭环。
- [x] 未创建 macOS/Windows/Linux desktop packaging。

关键决策落地：

- [x] 前端工程放在 `web/`：实际文件全部位于 `web/`。
- [x] ShellClient 先于业务面板：本 feature 只落 ShellClient/transport/state projection 和 shell UI。
- [x] Fixture Transport 是唯一 runtime：当前 `ShellTransportKind` 只包含 `in-process-test`。
- [x] 布局服务工作台而不是 landing：首屏为 project rail、graph workspace、inspector，不是 hero 或营销页。
- [x] 状态分 domain projection 和 UI-only state：当前只保存 ShellResponse 派生摘要；真实 ChemicalObject/ReactionGraph 不在 UI 内复制。
- [x] 测试和浏览器验证都是退出条件：`npm run test`、`npm run build`、`python3 -m unittest discover` 和桌面/窄屏浏览器验证均通过。

跨层纪律核对：

- [x] DTO 边界：Shell payload args 使用 `JsonObject`，response 只含 JSON-safe 字段。
- [x] Runtime 边界：fixture transport 不访问 Python、文件系统、网络或 cloud SDK。
- [x] State 边界：WorkbenchShellState 是 response projection，不是核心领域模型复制品。
- [x] Error 边界：unknown command 显示 `invalid_input` 和 message。
- [x] UX 边界：第一屏是工具型工作台；用户确认视觉风格后续可换，本次只确认结构方向。
- [x] 可卸载性：删除 `web/`、`web/package*.json` 和前端配置后，本 feature runtime surface 消失，Python core 不受影响。

挂载点核对：

- [x] `web/package.json` / `web/package-lock.json`：前端 package、依赖和 scripts。
- [x] `web/index.html` / `web/src/main.tsx`：浏览器 app mount。
- [x] `web/src/shell/`：Shell DTO、ShellClient、fixture transport 和测试。
- [x] `web/src/app/`：Workbench shell component tree、state projection、CSS 和测试。
- [x] `.gitignore`：忽略 node_modules、Vite build output 和 tsbuildinfo。
- [x] `.codestable/architecture/web-workbench.md`：Web Workbench 现状归并。
- [x] `.codestable/requirements/web-workbench-shell.md`：用户可见工作台壳层能力落档。
- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/`：item 和主文档状态回写。

反向核查：`git status --short` 中本 feature 的新增 runtime surface 只在 `web/` 和相关 CodeStable/architecture/requirement/roadmap 文档；`git diff --name-only -- rxnflow/parsers rxnflow/registry.py rxnflow/graph.py rxnflow/energy.py rxnflow/export.py` 无输出。

拔除沙盘推演：删除 `web/`、新增 `web-workbench` architecture、`web-workbench-shell` requirement、feature spec 和 roadmap 回写后，不会在 Python core、CLI、parser、registry、graph、energy、export 或 project content 中留下行为残留。

## 3. 验收场景核对

- [x] S1 `web/package.json` 存在，并包含 build/test/dev scripts。
  - 证据：`web/package.json` scripts 为 `dev`、`build`、`test`。
- [x] S2 `web/` app 使用 React + TypeScript + Vite + npm，且不修改 Python core package 边界。
  - 证据：`react` / `react-dom` / `vite` / `typescript` 依赖；领域文件 diff 为空。
- [x] S3 Shell DTO 在 TypeScript 中有稳定定义。
  - 证据：`web/src/shell/types.ts`。
- [x] S4 `fixture.run` 通过 fixture transport 返回 `ok=true`。
  - 证据：`web/src/shell/ShellClient.test.ts`。
- [x] S5 未知 command 返回 `ok=false` 且 `error.code == "invalid_input"`。
  - 证据：`web/src/shell/ShellClient.test.ts` 和 `web/src/app/WorkbenchShell.test.tsx`。
- [x] S6 fixture response 可投影为 `WorkbenchShellState`，UI 展示 session/profile/object/artifact summary。
  - 证据：`web/src/app/workbenchState.ts`、`web/src/app/WorkbenchShell.test.tsx`。
- [x] S7 App 首屏是工作台布局，不是 landing page、hero 页面或营销式介绍页。
  - 证据：浏览器验证和 component test 均以 `main[aria-label="RxnFlow web workbench"]` 为入口。
- [x] S8 UI 显示 local-only 状态，但不承诺云同步。
  - 证据：`Local-only` badge；无 cloud/auth/storage SDK。
- [x] S9 点击 fixture command 后，command status 从 idle/running 更新到 success 或 error。
  - 证据：浏览器验证点击 `Fixture Run` 后 `.run-state` 为 `Ready`；invalid command test 显示 error。
- [x] S10 `npm run build` 通过。
- [x] S11 前端测试通过。
- [x] S12 `python3 -m unittest discover` 继续通过。
- [x] S13 浏览器桌面 viewport 验证布局可用、无明显重叠。
  - 证据：Playwright desktop `1280x820` 验证通过，无水平溢出。
- [x] S14 浏览器窄屏 viewport 验证布局可用、无明显重叠。
  - 证据：Playwright narrow `390x840` 验证通过，无水平溢出，纵向可滚动。

前端肉眼/浏览器验证：已在本地 dev server `http://127.0.0.1:5173/` 验证。用户也在 in-app browser 中打开页面，并确认当前 shell 结构可继续作为 MVP 外壳；视觉风格不冻结。

## 4. 术语一致性

- Web App Shell：代码和架构文档均指 `web/` 浏览器工作台壳层。
- ShellClient：代码为 `web/src/shell/ShellClient.ts`，文档统一称 Frontend ShellClient / ShellClient。
- ShellTransport：当前代码只落地 `in-process-test`，roadmap 和 boundary 文档保留未来 `local-python-bridge` / `http-api`。
- Fixture Transport：代码为 `fixtureTransport`，文档明确只用于测试/演示闭环。
- Workbench Shell State：代码为 `WorkbenchShellState`，文档统一说明它是 ShellResponse projection。
- Workbench Layout：当前对应三栏 project rail / graph workspace / inspector。
- Local-only Indicator：UI 文本为 `Local-only`，requirement 和 architecture 均记录不承诺云同步。

防冲突 grep 通过：Web 代码中没有 `fastapi`、`flask`、`django`、`express`、`supabase`、`s3`、`r2`、`firebase`、`auth0`、`clerk`、`indexeddb`、`opfs`、`http-api`、`fetch(`、`XMLHttpRequest` 或真实 server/API route 实现。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md`：新增 Web Workbench 当前能力、模块职责、ShellClient/FixtureTransport/WorkbenchShellState 边界、当前不做范围和 QA 证据。
- [x] `.codestable/architecture/ARCHITECTURE.md`：新增 Web Workbench App Shell、Frontend ShellClient、WorkbenchShellState 等术语；模块索引增加 Web Workbench；关键架构决定改为当前 app shell 已采用 React + TypeScript + Vite + npm；约束补充视觉风格不冻结。
- [x] `.codestable/architecture/core-platform.md`：把旧的“没有真实 Web app”口径改为“Core Platform 本身没有 UI，独立 `web/` app shell 已存在但不属于 Python core”；Platform Shell 的 Web runtime boundary 说明同步当前只落地 `in-process-test` fixture transport。

归并后，未读过 design 的读者可以从 architecture 中知道：系统现在有独立 Web 工作台壳层，但它只接 fixture transport，不实现真实导入、图谱编辑、项目持久化、云同步或 HTTP API。

## 6. Requirement 回写

本 feature 新增了用户可见的 Web 工作台壳层能力，因此已 backfill requirement：

- [x] 新增 `.codestable/requirements/web-workbench-shell.md`
- [x] `implemented_by` 指向 `web-workbench`
- [x] 方案 frontmatter `requirement` 已从 `null` 回填为 `web-workbench-shell`

Requirement 文档只记录当前已存在能力：打开浏览器看到工作台雏形、fixture 命令闭环、local-only 提示和后续面板承载结构；未把未实现的导入、拖拽、画布、能量曲线、导出或云同步写成现状。

## 7. Roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-items.yaml`：`web-app-shell-client` 已从 `in-progress` 改为 `done`，feature 保持 `2026-05-16-web-app-shell-client`。
- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-roadmap.md`：Shell Client 模块和第 5 节子 feature 清单状态同步为 done。
- [x] roadmap frontmatter `related_requirements` 增加 `web-workbench-shell`，`related_architecture` 增加 `web-workbench`。
- [x] 第 6 节排期改为第二阶段已完成；第 7 节观察项改为当前 app shell 已采用 React + TypeScript + Vite + npm，但视觉风格、组件系统和长期框架选择仍可后续调整。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 暴露一个会反复踩到的环境候选：

- 候选 1：`web/index.html` 不能用 `file://` 直接打开；开发期需要 `cd web && npm run dev`，再访问 `http://127.0.0.1:5173/`。建议后续经用户同意后补入 AGENTS.md 的常用验证或 Web 工作流说明。

本阶段不擅自修改 AGENTS.md；是否写入留给用户确认。

## 9. 遗留

- 视觉风格、配色、组件库和 UI 密度没有冻结；后续可以重做皮肤，但应保留 ShellClient / Workbench state projection 边界。
- 左侧 object 指标目前不是可拖拽对象列表；对象列表和拖拽放入画布留给 `web-object-registry-panel` / `web-graph-canvas-mvp`。
- 中间 path board 不是真实图谱画布；真实 canvas、节点连线、selection、viewport 和 network preview 留给后续 feature。
- 当前没有 Browser Project Repository、IndexedDB / OPFS、project open/save、bundle import/export 或真实持久化 UI。
- 当前没有真实 parser preview、导入登记、energy curve 或 report export UI。
- React + TypeScript + Vite + npm 已成为当前 app shell 技术现状；是否沉淀为长期技术决定可走 `cs-decide`。
