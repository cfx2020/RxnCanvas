# web-project-sidebar 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-20
> 关联方案 doc：codestable/features/2026-05-19-web-project-sidebar/web-project-sidebar-design.md

## 1. 接口契约核对

对照方案第 2.1 节，本 feature 已新增 Project Sidebar state、repository-backed actions、Web Project Content Stub helper，并把 Browser Project Repository 注入 WorkbenchShell。

接口示例逐项核对：

- [x] `ProjectPersistenceState`：`web/src/app/projectSidebarState.ts` 定义 `empty | dirty | saving | persisted | error`。
- [x] `SidebarValidationStatus`：`web/src/app/projectSidebarState.ts` 定义 `unknown | missing | valid | error`，并包含 message、checksum 和 checkedAt 投影。
- [x] `ProjectSidebarState`：`web/src/app/projectSidebarState.ts` 定义 projects、activeProjectRef、activeProject、persistence、validation、lastWrite 和 repository error，不替代 `WorkbenchDomainState`。
- [x] `ProjectSidebarActions`：`web/src/app/projectSidebarActions.ts` 落地 `refreshProjects`、`createProject`、`openProject` 和 `saveProjectStub`。
- [x] Web Project Content Stub：`webProjectContentStubPath` 为 `.rxnflow/state/project-content.json`，schema version 为 `web-project-content-stub-v1`，metadata kind 为 `web-project-content-stub`。

名词层“现状 -> 变化”核对：

- [x] `App` 现在创建 `createBrowserProjectRepository()` 并传入 `WorkbenchShell`。
- [x] `WorkbenchShell` 维护独立 `ProjectSidebarState`，Workbench snapshot 投影仍由 `WorkbenchDomainState` 承载。
- [x] 旧左侧 `ProjectRail` 已升级为 `ProjectSidebar`，保留 workbench snapshot/object metrics，但项目入口来自 Browser Project Repository。
- [x] `MemoryBrowserProjectRepository` 可注入测试，component tests 不依赖真实 IndexedDB。

流程图核对：

- [x] App 创建 ShellClient 和 BrowserProjectRepository：`web/src/app/App.tsx`。
- [x] WorkbenchShell owns ProjectSidebarState：`web/src/app/WorkbenchShell.tsx`。
- [x] refresh/list/create/open/save 均经 `web/src/app/projectSidebarActions.ts` 调用 repository。
- [x] create/save 写入 `.rxnflow/state/project-content.json` stub，并返回 checksum/updatedAt 到 validation。
- [x] bundle import/export 只显示 unavailable 状态，未进入 file picker、download 或 zip IO。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] Web app 中已创建 Browser Project Repository 实例，并把 repository 注入 WorkbenchShell。
- [x] Project Sidebar 可列出 browser-local projects，并显示 active project、local-only、backend、persistence、validation 和 checksum。
- [x] 新建 browser-local project 后写入最小 `.rxnflow/state/project-content.json` stub；component test 已断言 object 存在。
- [x] 打开已有 browser-local project 只切换 active project，不伪造 Python `PlatformSession`。
- [x] Save Stub 覆盖当前 active project 的同一路径 stub，并更新 checksum。
- [x] Project Bundle import/export 入口可见但 disabled / unavailable。

明确不做逐项核对：

- [x] 未实现真实 `.rxnflow.zip` import/export、JSZip、download 或 file picker。scope grep 只命中既有 `web/src/shell/types.ts` shell command type 声明。
- [x] 未实现 `project.create` / `project.open` / `project.save_content` 到 Python core 的真实 bridge。
- [x] 未实现 parser preview、文件导入、drag/drop 或 raw file bridge。
- [x] 未把 IndexedDB project 伪装成 Python `PlatformSession`，打开 browser project 不自动运行 `workbench.snapshot`。
- [x] 未实现完整 ProjectContentSnapshot serializer、Python ProjectContentValidator、schema migration、云存储、账号或同步。
- [x] 未修改 Python parser、registry、graph、energy、export、ProjectContentStore、ProjectBundleService 或 PlatformShellService。

关键决策落地：

- [x] 先接 Browser Project Repository，不接 Python Shell bridge：Project Sidebar actions 直接调用 repository，ShellClient 仍只用于 fixture/workbench snapshot。
- [x] 新建项目写最小 stub：`createProject` 创建 project 后立即调用 `writeObject` 写入 stub。
- [x] validation status 先做 shallow repository validation：读取 stub 成功为 valid，缺失为 missing，repository error 为 error。
- [x] bundle import/export 第一版 disabled：按钮存在且 disabled，文案说明 unavailable。
- [x] Project Sidebar state 独立于 WorkbenchDomainState：二者在 WorkbenchShell 中分开维护。

跨层纪律核对：

- [x] UI state 来源清晰：ProjectSidebarState 来自 Browser Project Repository，WorkbenchDomainState 来自 ShellResponse。
- [x] Local-only 可见：顶栏和 sidebar 均显示 local-only / browser-local backend。
- [x] Error visibility：repository error 在 UI 中显示 code、message 和 target。
- [x] Idempotency：重复 `saveProjectStub` 覆盖同一 `.rxnflow/state/project-content.json` logical path。
- [x] Scope guard：新增 UI 不调用 parser/import/register/energy/export core，不新增 HTTP API 或 cloud SDK。
- [x] Responsive layout：桌面和 390px 窄屏浏览器验证无水平溢出。

挂载点核对：

- [x] `web/src/app/ProjectSidebar.tsx`：新增可见 Project Sidebar UI。
- [x] `web/src/app/projectSidebarState.ts`：新增 sidebar state、validation/persistence 和 stub helper。
- [x] `web/src/app/projectSidebarActions.ts`：新增 repository-backed actions。
- [x] `web/src/app/WorkbenchShell.tsx` / `App.tsx`：接入 Browser Project Repository 和 sidebar actions。
- [x] `web/src/app/*.test.tsx` / `*.test.ts`：覆盖 list/create/open/save/error/disabled bundle。
- [x] `codestable/architecture/web-workbench.md` / `ARCHITECTURE.md`：已回写 Project Sidebar 当前能力和边界。
- [x] `codestable/requirements/project-content-persistence.md` / `web-workbench-shell.md`：已回写 Web 项目侧边栏现状。

反向核查：

- [x] grep `ProjectSidebar|ProjectSidebarState|webProjectContentStub` 命中均落在 app code、tests、feature docs、architecture/requirements/roadmap 中。
- [x] scope grep `JSZip|showOpenFilePicker|showSaveFilePicker|createObjectURL|download|drag|drop|FileReader|input type="file"|local-python-bridge|http-api` 在 `web/src` 中只命中既有 shell command type names。
- [x] 拔除沙盘推演：移除 `ProjectSidebar.tsx`、`projectSidebarState.ts`、`projectSidebarActions.ts`、WorkbenchShell/App 接线和对应 tests 后，Browser Project Repository、ShellClient、fixture transport 与 Python core 仍可独立存在。

## 3. 验收场景核对

- [x] S1 App 创建并向 WorkbenchShell 提供 Browser Project Repository；测试可注入 Memory repository。
  - 证据：`App.tsx` 装配真实 repository；`WorkbenchShell.test.tsx` 用 `MemoryBrowserProjectRepository`。
- [x] S2 首屏 Project Sidebar 显示 local-only、IndexedDB/browser-local 状态和已有 project list。
  - 证据：component test + 浏览器 DOM snapshot。
- [x] S3 用户输入项目名并点击新建后，repository 产生 `BrowserProjectRef`，项目出现在列表中并成为 active project。
  - 证据：component test `creates a browser-local project and shows persisted validation status`。
- [x] S4 新建项目后写入 `.rxnflow/state/project-content.json` stub，receipt checksum 为 `sha256:<64 hex>`，persistence 显示 persisted。
  - 证据：component test 断言 checksum 和 `listObjects(...webProjectContentStubPath)`。
- [x] S5 打开已有项目后 active project 切换；stub 存在时 validation 显示 valid 和 checksum。
  - 证据：浏览器桌面验证打开已有 `Sidebar Smoke...` project 后显示 Persisted / Valid / checksum。
- [x] S6 打开已有项目但 stub 缺失时不崩溃，validation 显示 missing，用户仍可保存 stub。
  - 证据：component test `opens a project with a missing stub and saves it from the sidebar`。
- [x] S7 点击保存 active project 时覆盖同一路径 stub，更新 checksum / updatedAt，不创建重复 object。
  - 证据：actions test + 浏览器 Save Stub 后 checksum 从 `sha256:a7a4...` 更新为 `sha256:c9b2...`。
- [x] S8 repository error 显示 code、message 和 target，UI 不吞错。
  - 证据：component test 空项目名创建显示 `invalid_input`、message 和 `name` target。
- [x] S9 Bundle import/export 入口可见但 disabled / unavailable。
  - 证据：component test + 浏览器验证 Import Bundle / Export Bundle 均 disabled。
- [x] S10 Project Sidebar 不调用 `project.create` / `project.open` / `project.save_content` shell commands，不创建 Python session。
  - 证据：scope grep；sidebar actions 只依赖 Browser Project Repository。
- [x] S11 WorkbenchDomainState 仍只来自 fixture / shell snapshot；Project Sidebar 不手写 ChemicalObject、ReactionGraph 或 EnergyProfile。
  - 证据：WorkbenchShell 中 state 分离；scope review 未发现领域模型构造。
- [x] S12 `npm run test` 通过。
  - 证据：7 files / 34 tests passed。
- [x] S13 `npm run build` 通过。
  - 证据：`tsc -b && vite build` passed。
- [x] S14 真实浏览器桌面 viewport 验证 sidebar open/save 状态可见，无明显重叠。
  - 证据：1280x720 下 open/save stub、Persisted/Valid/checksum、bundle disabled、无 console warn/error、无水平溢出。
- [x] S15 真实浏览器窄屏 viewport 验证 actions/list/status 可用，无水平溢出。
  - 证据：390x840 下单列布局、buttons fit、bundle disabled、无 console warn/error、无水平溢出。

前端浏览器验证说明：

- [x] 真实浏览器桌面和窄屏验证均已完成。当前 in-app Browser 自动化对输入框填充存在环境限制；create flow 已由 Testing Library component test 覆盖，浏览器侧验证 open/save/layout/disabled actions。

## 4. 术语一致性

- Project Sidebar：代码组件为 `ProjectSidebar`，文档语义为 Web 左侧项目入口；不再等同旧 `ProjectRail` summary。
- Active Browser Project：代码中为 `activeProjectRef` / `activeProject`，不等同于 Python `PlatformSession`。
- Project Repository State / ProjectSidebarState：只在 Web app state 层出现，不进入 ShellResponse。
- Web Project Content Stub：代码常量为 `webProjectContentStub*`，schema/kind 与 design 一致。
- Sidebar Validation Status：代码类型为 `SidebarValidationStatus`，仅表达 shallow repository validation。
- 防冲突：grep 未发现 sidebar 调用 Python core project open/save bridge；`ProjectContentSnapshot` 只在文档边界中作为“不等同”出现。

## 5. 架构归并

- [x] `codestable/architecture/web-workbench.md`：已归并 Project Sidebar UI、repository-backed list/create/open/save stub、local-only / validation / checksum / error 状态、disabled bundle entry 和仍未接 bridge/bundle IO/parser import 的边界。
- [x] `codestable/architecture/ARCHITECTURE.md`：已新增 Project Sidebar、ProjectSidebarState、Web Project Content Stub、Sidebar Validation Status 术语，并把 Web Workbench 已落地能力更新为包含 Project Sidebar。
- [x] 跨层纪律已写入 architecture：ProjectSidebarState 不替代 WorkbenchDomainState，不创建 PlatformSession，不调用 Python project shell commands。
- [x] `AGENTS.md`：不需要改；Vite dev server 预览要求和前端浏览器验证要求已存在。

## 6. requirement 回写

- [x] `requirement: project-content-persistence` 存在。
- [x] 已更新 `codestable/requirements/project-content-persistence.md`：补充 Web Project Sidebar 可 list/create/open/save Web Project Content Stub，并明确 stub 不是完整 ProjectContentSnapshot。
- [x] 已更新 `codestable/requirements/web-workbench-shell.md`：补充左侧项目栏已是可操作 Project Sidebar，并明确 bundle import/export 当前只是 disabled / unavailable。

## 7. roadmap 回写

- [x] `roadmap: rxnflow-web-workbench-mvp` / `roadmap_item: web-project-sidebar` 均存在。
- [x] `codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-items.yaml` 中 `web-project-sidebar` 已改为 `status: done`，feature 保持 `2026-05-19-web-project-sidebar`。
- [x] `codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-roadmap.md` 主文档对应模块和子 feature 清单状态已同步为 `done`。
- [x] roadmap items YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无新增候选。本 feature 没暴露新的每个后续 feature 都会重复踩的通用工作流规则；`web/` 下 `npm run dev` 和 `http://127.0.0.1:5173/` 的预览要求已在 AGENTS.md 中存在。

## 9. 遗留

- 后续优化点：
  - 继续 roadmap 下一项 `web-i18n-foundation`，把当前硬编码英文 UI 文案迁移到 `zh-CN` / `en-US` typed message catalog。
  - 后续 feature 需要接真实 `.rxnflow.zip` Web import/export、file picker/download 和 bundle adapter。
  - 后续 feature 需要明确 Browser Project Repository 与 Python `project.open` / `project.save_content` bridge 的 session lifecycle。
- 已知限制：
  - Project Sidebar 当前保存 Web Project Content Stub，不保存完整 ChemicalObject、Import Ledger、ReactionGraph、WorkspaceSnapshot、EnergyProfile 或 ExportArtifact index。
  - Sidebar validation 是 shallow repository validation，不调用 Python ProjectContentValidator。
  - 浏览器本地数据仍 local-only，不是云备份；清浏览器数据或 origin/profile 变化会丢失。
  - 当前 in-app Browser 自动化输入限制使 create flow 未在浏览器中自动填充复验；create 行为由 component test 覆盖。
- 实现阶段顺手发现：
  - Web UI 文案已经明显增长，Import Inbox 前应优先落地 `web-i18n-foundation`，该 roadmap item 已插入。
