# web-import-inbox 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-20
> 关联方案 doc：codestable/features/2026-05-20-web-import-inbox/web-import-inbox-design.md

## 1. 接口契约核对

对照方案第 2.1 节，本 feature 已新增 Import Inbox UI state、WebImportFile metadata projection、Import Preview/Register Shell DTO，并把 fixture transport 扩展为可返回 JSON-safe preview/register response。

接口示例逐项核对：

- [x] `WebImportFile`：`web/src/app/importInboxState.ts` 定义 id/name/size/mimeType/lastModified/storagePath；不包含 `File`、`Blob` 或 bytes。
- [x] `ImportPreviewState` / `ImportInboxState`：`importInboxState.ts` 定义 selectedFiles、expectedFormat、strict、activeBatch、registeredObjectIds、warnings 和 error。
- [x] `ImportItemSummary` / `ImportBatchSummary`：`web/src/shell/types.ts` 定义 item status、raw_resource、preview、registered ids、error 和 warnings。
- [x] `ImportPreviewData` / `ImportRegisterAllData`：`web/src/shell/types.ts` 定义 `import.preview` / `import.register_all` response data。
- [x] Shell args helper：`importPreviewArgs()` 生成 `session_id`、`source_paths`、`expected_format` 和 `strict`。
- [x] Register eligibility：`canRegisterImport()` 只在 active batch 有 `needs_confirmation` preview item 时允许登记。

名词层“现状 -> 变化”核对：

- [x] `fixtureTransport.ts` 从只支持 fixture/snapshot 扩展为支持 fixture `import.preview` 和 `import.register_all`。
- [x] Workbench 中间区域新增 `ImportInbox`，`GraphWorkspaceFrame` 下移为同列第二块。
- [x] WorkbenchShell 新增 Import Inbox local UI state，并把 preview/register response 回写到 `WorkbenchDomainState.imports/objects/counts`。
- [x] `messages.ts` 新增 Import Inbox 的 `zh-CN` / `en-US` 主文案。

流程图核对：

- [x] 用户选择文件 -> `filesToWebImportFiles()` 只保存 metadata/logical storagePath。
- [x] expected format / strict -> ImportInboxState 本地状态。
- [x] Preview click -> `shellClient.run({ command: "import.preview" })`。
- [x] preview response -> active batch、warnings 和 workbench imports/counts 更新。
- [x] needs_confirmation item -> Register All enabled。
- [x] register click -> `shellClient.run({ command: "import.register_all" })`。
- [x] register response -> registered ids、objects 和 object count 更新。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] 已定义前端 import file/state/projection 类型。
- [x] Import Inbox 支持文件选择、批量列表、expected format、strict、preview、register all 和 clear。
- [x] fixture transport 返回 success item、failed item、warning、error、raw resource 和 registered ids。
- [x] UI 原样展示 parser_id、parser_version、object_count、raw resource path/checksum、warnings 和 errors。
- [x] i18n catalog 已补 Import Inbox 双语文案。
- [x] preview/register 成功后 WorkbenchDomainState 的 imports/objects/counts 更新。
- [x] 真实浏览器 1280x720 和 390x840 布局验证通过。

明确不做逐项核对：

- [x] 未实现真实 browser File bytes 到 Python core parser 的桥接。
- [x] 未调用真实 `rxnflow.parsers`、cclib、ASE 或 MAPLE parser runtime。
- [x] 未新增 HTTP API、local-python-bridge、serverless route、Web Worker、OPFS chunking 或云上传。
- [x] 未实现对象级选择；register action 仍是 all。
- [x] 未修改 Python `ImportRegistryWorkflow`、PlatformShellService、parser plugins、ProjectStore 或 Import Ledger schema。
- [x] 未声明真实 Gaussian/ORCA/MAPLE/XYZ/extxyz 版本完整支持。
- [x] 未改变 Project Sidebar、Browser Project Repository、Graph Canvas、Energy/Profile 或 Report Export 行为。

关键决策落地：

- [x] 先做 UI/投影闭环，不伪造 bytes bridge：`WebImportFile` 不携带 bytes，fixture 使用 logical `inbox/<name>` path。
- [x] fixture transport 提供 import preview baseline：ShellClient tests 覆盖 JSON-safe preview/register。
- [x] Import Inbox 自有 UI state，Domain state 只收 ShellResponse 结果。
- [x] warnings/errors 原样显示：`missing_section`、`unit_assumed`、`parse_failed`、`session_id` 均可见。
- [x] register all 后刷新工作台投影：component test 断言 registered id 可见且 object count 更新。

跨层纪律核对：

- [x] Data boundary：selected browser file 只作为 UI metadata，不把 `File`、`Blob`、`ArrayBuffer` 传进 ShellClient。
- [x] Error visibility：preview/register command failure 显示 ShellError code/message/target。
- [x] Warning visibility：item warnings 和 response warnings 显示 code/message/target。
- [x] Idempotency：fixture repeated `import.register_all` 返回同一 registered ids。
- [x] Scope guard：未引入 parser runtime、OPFS、Worker、HTTP route、cloud SDK 或账号系统。
- [x] I18n：新增 Import Inbox 主文案已同步 `zh-CN` / `en-US`。
- [x] Responsive：长文件名、source path、checksum、warning/error message 使用 overflow-wrap；桌面/窄屏无水平溢出。

挂载点核对：

- [x] `web/src/app/ImportInbox.tsx`：新增可见 Import Inbox UI。
- [x] `web/src/app/importInboxState.ts`：新增文件 metadata、preview args、button eligibility、registered object merge 和 file size helper。
- [x] `web/src/app/WorkbenchShell.tsx`：挂载 Import Inbox，并编排 preview/register 到 ShellClient 和 WorkbenchDomainState。
- [x] `web/src/shell/types.ts` / `fixtureTransport.ts`：新增 import preview/register projection 和 fixture response。
- [x] `web/src/app/i18n/messages.ts`：新增 Import Inbox 双语文案。
- [x] `web/src/app/workbench.css`：新增 Import Inbox 响应式样式。
- [x] `codestable/architecture/web-workbench.md` / `ARCHITECTURE.md` / `requirements/web-workbench-shell.md`：已回写能力和真实 bytes bridge 边界。

反向核查：

- [x] scope grep 新增 Import Inbox 文件未命中 OPFS、Worker、HTTP API、cloud SDK、parser runtime 或 Python core import。
- [x] `web/src` 中 bytes/IndexedDB 命中来自既有 Browser Project Repository，不是本 feature 新增 parser bridge。
- [x] Python core 文件未修改。
- [x] 拔除沙盘推演：删除 `ImportInbox.tsx`、`importInboxState.ts`、WorkbenchShell 挂载、fixture import commands、import i18n keys 和 CSS 后，Import Inbox 能力消失；Project Sidebar、Browser Project Repository、Python import workflow 和 parser plugins 不受结构性影响。

## 3. 验收场景核对

- [x] S1 Import Inbox 首屏可见，显示 empty state、expected format、strict、Preview 和 Register All。
  - 证据：WorkbenchShell component test + Playwright 1280/390 viewport。
- [x] S2 用户选择多个文件后，UI 展示文件名、size、mime/lastModified 可用信息；动态文件名不翻译。
  - 证据：component test 选择 `water.xyz` / `bad-count.xyz`。
- [x] S3 没有 selected files 时 Preview disabled；没有 needs_confirmation batch 时 Register All disabled。
  - 证据：component test + Playwright layout check。
- [x] S4 点击 Preview 时通过 ShellClient 调用 `import.preview`，args 包含 session_id、source_paths、expected_format 和 strict。
  - 证据：ShellClient fixture tests + WorkbenchShell flow test。
- [x] S5 Preview 成功后显示 batch id、item status、parser_id、parser_version、object_count、raw resource path/checksum。
  - 证据：component test 查询 batch、`xyz-ase`、`fixture-web`、raw path。
- [x] S6 Preview item warnings 显示 code、message、target；warning code 不被隐藏或翻译。
  - 证据：component test 查询 `missing_section` 和 `unit_assumed`。
- [x] S7 Preview failed item 显示 error code、message、target。
  - 证据：component test 查询 `parse_failed`。
- [x] S8 Preview 成功后 WorkbenchDomainState 的 imports 和 counts.imports 更新。
  - 证据：component test 可见 import count `1`。
- [x] S9 有 needs_confirmation item 时 Register All enabled。
  - 证据：component test preview 后 Register All enabled。
- [x] S10 点击 Register All 时通过 ShellClient 调用 `import.register_all`，args 包含 active batch id。
  - 证据：ShellClient register test 使用 preview batch id；WorkbenchShell flow test 调用 Register All。
- [x] S11 Register 成功后显示 registered object ids，并更新 WorkbenchDomainState 的 objects 和 counts.objects。
  - 证据：component test 查询 `object-imported-water` 和 object count `3`。
- [x] S12 repeated register all 不产生前端异常，保持同一 registered ids。
  - 证据：ShellClient register idempotency test。
- [x] S13 中文 locale 下 Import Inbox 主 UI 文案变为简体中文；parser_id、warning/error code、文件名保持原样。
  - 证据：component test 查询 `解析预览`、`预览`、`xyz-ase`、`missing_section`、`water.xyz`。
- [x] S14 Shell command error 路径显示 error code/message/target。
  - 证据：未建立 fixture session 时 preview 显示 `invalid_input`、message 和 `session_id`。
- [x] S15 `npm run test` 通过。
  - 证据：8 files / 47 tests passed。
- [x] S16 `npm run build` 通过。
  - 证据：`tsc -b && vite build` passed。
- [x] S17 `python3 -m unittest discover` 通过。
  - 证据：217 tests passed。
- [x] S18 真实浏览器桌面 viewport 验证文件列表/preview/register/status 无重叠。
  - 证据：Playwright 1280x720，Import Inbox 可见、Preview/Register disabled、无 console warn/error、无水平溢出。
- [x] S19 真实浏览器窄屏 viewport 验证长文件名、warning/error、按钮不会水平溢出。
  - 证据：Playwright 390x840，Import Inbox 可见、无 console warn/error、无水平溢出。

## 4. 术语一致性

- Import Inbox：代码组件为 `ImportInbox`，文档语义为导入收件箱 UI，不等同 parser plugin。
- Web Import File：代码类型为 `WebImportFile`，只保存 metadata / logical path，不承载 bytes。
- Import Preview Projection：代码类型为 `ImportPreviewData` / `ImportBatchSummary` / `ImportItemSummary`。
- Import Registration Action：UI 文案为 Register All / 全部登记，对应 `import.register_all`。
- Import Bridge：本 feature 未实现；architecture 和 requirement 已明确后续单独决策。
- 防冲突：`Project Bundle import/export` 仍是 disabled 项目包入口，不作为 raw computational output import。

## 5. 架构归并

- [x] `codestable/architecture/web-workbench.md`：已归并 Import Inbox UI、fixture import preview/register projection、warnings/errors/raw resource display、WorkbenchDomainState imports/objects/count 更新和真实 bytes bridge 未实现边界。
- [x] `codestable/architecture/ARCHITECTURE.md`：已补充 Import Inbox / Web Import File 术语，并更新 Web Workbench 模块索引和硬边界。
- [x] 跨层纪律已写入 architecture：Import Inbox 不调用 parser runtime，不传 File/Blob/bytes 进 ShellClient，不声明真实格式完整支持。
- [x] `AGENTS.md`：不需要改；本 feature 未发现新的通用工作流规则。

## 6. requirement 回写

- [x] `requirement: web-workbench-shell` 存在。
- [x] 已更新 `codestable/requirements/web-workbench-shell.md`：补充 Import Inbox 用户故事、当前 fixture preview/register 能力和真实 browser File parser bridge 仍待后续。
- [x] requirement 明确 Import Inbox 不声明真实 Gaussian/ORCA/MAPLE/XYZ/extxyz 完整支持。

## 7. roadmap 回写

- [x] `roadmap: rxnflow-web-workbench-mvp` / `roadmap_item: web-import-inbox` 均存在。
- [x] `codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-items.yaml` 中 `web-import-inbox` 已改为 `status: done`，feature 保持 `2026-05-20-web-import-inbox`。
- [x] `codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-roadmap.md` 主文档对应模块和子 feature 清单状态已同步为 `done`。
- [x] roadmap items YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无新增候选。本 feature 继续沿用既有 `web/` dev server、test/build 和浏览器验证规则；未暴露需要写入 AGENTS.md 的新环境坑。

## 9. 遗留

- 后续优化点：
  - 下一步按 roadmap 进入 `web-object-registry-panel`，使用 Import Inbox register 后的 object summaries 展示对象列表和详情。
  - 真实 browser File bytes 到 Python parser preview 的 Import Bridge 需要独立 feature 决策，不能在 UI 层伪造。
  - 后续可增加对象级选择/部分确认，但应先扩展 core command 或明确 selection contract。
- 已知限制：
  - Import Inbox 当前使用 fixture transport，不解析真实用户文件。
  - `<input type=file>` 的选择文件在 component test 中覆盖；Playwright viewport 验证只检查初始布局和按钮状态。
  - 当前 expected format select 只是传参 UI，不代表真实格式支持矩阵。
- 实现阶段顺手发现：
  - Workbench 中间列现在已形成 Import Inbox + Graph Workspace 的纵向工作流，后续 Object Registry/Graph Canvas 需要注意中间区域密度和滚动策略。
