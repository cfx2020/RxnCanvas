# Web Project Bundle Import 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：codestable/features/2026-05-22-web-project-bundle-import/web-project-bundle-import-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `ImportBrowserBundleRequest`（`web/src/app/projectBundleImport.ts`）：接收 `file: File` 与 `conflictPolicy: "create_new_project"`；非该 policy 在读取 zip 前返回 `unsupported_bundle`。单测 `rejects unsupported conflict policies before reading or writing` 覆盖。
- [x] `ImportBrowserBundleResult`（`web/src/app/projectBundleImport.ts`）：成功分支返回 `project`、`summary`、`receipts`；失败分支返回 `code/message/target/details`。单测覆盖 success、invalid bundle、createProject failure、writeObject partial failure。
- [x] `ImportBundleStatus`（`web/src/app/projectBundleImport.ts` + `ProjectSidebar.tsx`）：UI-only 状态包含 idle/importing/success/error，success 带 project/summary/receiptCount，error 带 structured error；不进入 Project Content 或 WorkbenchDomainState。

**名词层“现状 → 变化”逐项核对**：

- [x] Browser Bundle Import Action：已新增 `web/src/app/projectBundleImport.ts`，负责 File bytes、archive read、project name fallback、create project、write entries、metadata mapping、receipts 和 structured errors。
- [x] Bundle Import File Picker：`ProjectSidebar.tsx` 已启用 hidden file input，`accept=".rxnflow.zip,application/zip"`，选择文件后触发 import，并在 handler 后清空 input value。
- [x] Create New Project Policy：`importBrowserProjectBundle` 只支持 `create_new_project`，成功导入时调用 `repository.createProject` 获得新 `projectRef`，不写 active project。
- [x] Import Write Receipts：成功结果返回 repository `writeObject` receipts，Sidebar success summary 显示 receipt count。
- [x] Partial Import Risk：write failure 分支返回 `storage_failed`，details 包含 `partialProjectRef`、`writtenCount`、`fileName` 和 `storageTarget`；UI 展示 partial risk。

**流程图核对**：

- [x] User click → hidden file input → importing：`ProjectSidebar.tsx` 已落点。
- [x] File bytes → `readBrowserProjectBundleArchive` → create project → write entries：`importBrowserProjectBundle` 已落点。
- [x] Success → refresh/open imported project → shallow validation：`WorkbenchShell.tsx` 的 import callback 成功后调用现有 `openProject` 路径。
- [x] Error → structured status：invalid bundle、createProject failure、writeObject failure 均有单测和 UI 分支。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 用户选择安全 `.rxnflow.zip` 后，Web 读取 zip、复用 archive adapter safety、创建新的 browser-local project、写入 entries、刷新 Sidebar 并激活新 project。证据：`projectBundleImport.test.ts` safe import；`WorkbenchShell.test.tsx` import creates new active browser project。
- [x] Import summary 展示 rootName、fileCount、byteSize、checksum、receiptCount。证据：component test 与 Playwright smoke 均观察到 Bundle imported、project name、rootName、sha256。
- [x] 失败时展示 structured error，partial write failure 展示 partial risk。证据：`invalid bundle UI error no project` 与 `shows partial import risk when bundle object writes fail`。

**明确不做逐项核对**：

- [x] 不覆盖、合并、改名或写入当前 active project：实现只调用 `createProject` 后用新 `project.projectRef` 写入；测试确认原 active project objects 不变。
- [x] 不自动 Open Bridge，不调用 `project.open`、`project.save_content`、`project.import_bundle` 或 Python `ProjectBundleService`：import action 不接收 ShellClient；WorkbenchShell import tests 断言这些 shell commands 未调用。
- [x] 不做 Project Content deep validation、schema migration、跨 section 引用校验或自动修复：导入只搬运 archive adapter 返回的 bytes，成功后只触发 Project Sidebar shallow validation。
- [x] 不重新解析 raw files、不登记 ChemicalObject、不计算 energy profile、不生成/刷新 report export artifacts：实现未接 parser、registry、energy 或 report export command。
- [x] 不实现 cloud、OPFS、chunking、Worker、Service Worker、后台同步或 repository transaction API：未新增相关依赖或入口；partial risk 已作为非事务限制展示。
- [x] 不改变 archive adapter allowed roots、安全路径或核心 `.rxnflow.zip` 语义：本 feature 只消费 `readBrowserProjectBundleArchive`。

**关键决策落地**：

- [x] D1 新增导入 action helper：`projectBundleImport.ts` 独立于 React 组件。
- [x] D2 固定 create_new_project：unsupported policy guard 已落地。
- [x] D3 project name fallback：`importedProjectName` 按 manifest name → rootName → fileName → `Imported Project`。
- [x] D4 先完整读取并校验 archive，再创建 project：archive error 分支在 createProject 之前返回，invalid bundle 单测确认 projects 为 0。
- [x] D5 metadata 窄分类：`importedBundleObjectMetadata` 区分 manifest、project content index、section、raw file、export artifact。
- [x] D6 Partial import risk 显式可见：写入失败返回 partialProjectRef/writtenCount，ProjectSidebar 渲染 partial warning。
- [x] D7 导入成功刷新并激活新 project，不 Open Bridge：WorkbenchShell 成功后调用 `openProject` browser path，shell payload 断言无 bridge command。
- [x] D8 Export 与 Import 状态分离：ProjectSidebar 接收 `importBundleStatus` 与 `exportBundleStatus`，busy 状态互相禁用但 summary/error 各自渲染。

**挂载点反向核对（可卸载性）**：

- [x] Browser Bundle Import Action module：新增 `projectBundleImport.ts` 与 `projectBundleImport.test.ts`。
- [x] WorkbenchShell import orchestration：新增 import status state、import callback 和 ProjectSidebar prop wiring。
- [x] ProjectSidebar bundle section：新增 file input、Import button enabled、success/error/partial risk view。
- [x] I18n catalog and CSS：新增 en-US / zh-CN keys、`.visually-hidden` 与 import bundle summary/error 样式。
- [x] Component/unit tests：新增 action tests 与 WorkbenchShell import/invalid/partial tests。
- [x] 反向 grep：`rg "importBundle|projectBundleImport|partialProjectRef"` 命中均落在上述挂载点内；未发现清单外功能挂入。
- [x] 拔除沙盘推演：删除 import action/helper、ProjectSidebar file input/status、WorkbenchShell import wiring、i18n/CSS keys 与 tests 后，可回到 Import Bundle disabled 状态；Export Bundle、Import Inbox、ReportExportPanel 不依赖 import helper。

## 3. 验收场景核对

- [x] **S1**：包含 `.rxnflow/manifest.json`、Project Content state、`inputs/raw/demo.xyz`、`exports/profile.png` 的 bundle 能创建新 project、写入 entries、激活新 project 并展示 summary。证据：unit/component tests；Playwright desktop/narrow smoke。
- [x] **S2**：repository object paths 不包含 bundle root 前缀。证据：safe import test 的 receipts 为 `.rxnflow/manifest.json`、`.rxnflow/state/project-content.json`、`exports/profile.png`、`inputs/raw/demo.xyz`。
- [x] **S3**：project name fallback 顺序为 manifest name、rootName、fileName、`Imported Project`。证据：`uses root name and file name fallbacks for imported project names`。
- [x] **S4**：取消 file picker 保持 idle，不创建 project、不写 repository。证据：ProjectSidebar handler 在无 files 时直接返回；hidden input change only uses `files?.[0]`。
- [x] **S5**：非 zip、坏 zip、multi-root、missing manifest、unsafe path、`inputs/` 非 raw、duplicate、symlink bundle 返回 `invalid_bundle` 或 `zip_failed`，且不创建 project。证据：archive adapter 既有 safety tests；import invalid bytes test 断言 projects 为 0。
- [x] **S6**：repository `createProject` 失败时返回 `storage_failed`，不写 object，错误可见。证据：`maps createProject storage failures without writing objects`。
- [x] **S7**：repository `writeObject` 中途失败时返回 `storage_failed`，展示 partial import risk、partialProjectRef、writtenCount，不自动删除已写 objects。证据：action test 与 WorkbenchShell partial UI test。
- [x] **S8**：Import 成功不调用 ShellClient / Python bridge commands。证据：WorkbenchShell import test 断言 `project.open`、`project.import_bundle`、`project.save_content` payload 数量为 0。
- [x] **S9**：Import 不覆盖 current active project，新 projectRef 不同。证据：WorkbenchShell import test 验证导入后 active project 为新 project，原 project objects 保持。
- [x] **S10**：导入成功不自动 Open Bridge；用户仍需显式 Open Bridge。证据：import callback 只走 browser `openProject`，未触发 shell command。
- [x] **S11**：Export Bundle 仍可用；Import/Export busy 状态互相禁用，summary/error 不互相覆盖。证据：ProjectSidebar props/status 分离，原 export tests 仍通过。
- [x] **S12**：新增 i18n key 在 `en-US` / `zh-CN` 中一致，中英文可渲染。证据：i18n completeness tests 仍通过。
- [x] **S13**：Sidebar bundle section 桌面与窄屏不重叠。证据：Playwright Chromium desktop `1280x900` 与 narrow `390x900` smoke，无水平溢出、console error 为空。
- [x] **S14**：`npm run test -- --run` 和 `npm run build` 通过。证据：实现阶段已通过；本验收提交前重新执行。

## 4. 术语一致性

- Browser Bundle Import Action：architecture、design、acceptance 与代码模块 `projectBundleImport.ts` 一致。
- Import Bundle Status：类型名 `ImportBundleStatus`、ProjectSidebar prop `importBundleStatus` 与文档术语一致。
- Bundle Import File Picker：实现为隐藏 file input + visible Import Bundle button，未引入 drag/drop 或 multi-file 命名。
- Create New Project Policy：常量 `browserProjectBundleImportConflictPolicy = "create_new_project"` 与文档一致。
- Import Write Receipts：成功结果 `receipts` 与 UI `receiptCount` 一致。
- Partial Import Risk：error details `partialProjectRef` / `writtenCount` 与 UI 文案、architecture、requirement 一致。
- 防冲突：import feature 未新增 `project.import_bundle` shell command 调用，未把 Python `ProjectBundleService.import_bundle` 接入 Web import。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：已归并 Project Sidebar Import/Export 均启用、Browser Bundle Import Action、Import Bundle Status、Partial Import Risk，以及 Import Bundle 不自动 Open Bridge / 不调用 Python import 的约束。
- [x] `codestable/architecture/web-workbench.md`：已归并 Browser Bundle Import Action、Project Sidebar bundle section、module tree、cross-layer discipline、QA/test/Playwright evidence、当前 non-goals。
- [x] `AGENTS.md`：无需补新硬约束。已有要求已经覆盖 Web preview 必须从 `web/` 跑 Vite、UI 改动必须浏览器验证；本 feature 未暴露新的通用流程坑。

## 6. requirement 回写

- [x] `codestable/requirements/project-content-persistence.md` 已更新：Project Bundle 现在同时支持 export 和 import；Import Bundle 从安全 `.rxnflow.zip` 创建新的 browser-local project，不覆盖当前项目、不自动 Open Bridge，不替代 Project Content deep validation；partial import risk 已记录为当前边界。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-web-project-portability/rxnflow-web-project-portability-items.yaml`：`web-project-bundle-import` 已从 `in-progress` 更新为 `done`，feature 指向保持 `2026-05-22-web-project-bundle-import`。
- [x] `codestable/roadmap/rxnflow-web-project-portability/rxnflow-web-project-portability-roadmap.md`：第 3 节对应子 feature 已更新为 done，并把下一步推进焦点切到 `web-project-portability-roundtrip`。
- [x] roadmap YAML 在验收提交前重新校验。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 沿用了已有 Vite preview、Web UI browser validation、CodeStable roadmap/feature/acceptance 规则；没有发现每个后续 feature 都会重复踩的新环境或工具坑。

## 9. 遗留

- 后续优化点：`web-project-portability-roundtrip` 需要验证 import 后 Open Bridge、编辑/导出、Save Bridge Session、Export Bundle 的 repository/core session 同步口径。
- 已知限制：Web Import Bundle 当前没有跨 object transaction；createProject 成功后 writeObject 失败会留下部分 project/object，由 UI 显示 partial risk。
- 已知限制：Import Bundle 只恢复 Browser Project Repository bytes，不做 Project Content deep validation、schema migration、raw reparse、对象登记、能量计算或 report artifact 生成。
- 实现阶段顺手发现：用户指南仍应在 portability QA/guides 收口时统一补，而不是在本 feature 单独写半套导入/导出指南。
