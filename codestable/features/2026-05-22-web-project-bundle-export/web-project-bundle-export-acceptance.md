# Web Project Bundle Export 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：`codestable/features/2026-05-22-web-project-bundle-export/web-project-bundle-export-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：
- [x] `ExportBrowserBundleRequest` / `ExportBrowserBundleResult`（`web/src/app/projectBundleExport.ts`）：实现包含 active project guard、固定 includePrefixes、Blob、fileName、summary 与结构化错误；错误码与 roadmap 保持一致。
- [x] `ExportBundleStatus`（`web/src/app/projectBundleExport.ts`、`ProjectSidebar.tsx`）：实现 idle/exporting/success/error UI-only 状态；状态只进 React UI，不写 Project Content 或 repository。
- [x] `bundleRootNameForProject` / `bundleFileNameForRootName`：project name 安全化后生成 rootName 与 `.rxnflow.zip` fileName；测试覆盖 slash、unicode combining mark 与已有 suffix。

**名词层“现状 -> 变化”逐项核对**：
- [x] Browser Bundle Export Action：新增 `exportBrowserProjectBundle`，读取 repository 当前 bytes 并调用 Browser Bundle Archive Adapter。
- [x] Export Bundle Download：`WorkbenchShell` 用 object URL 触发下载，并在 finally 中 revoke。
- [x] Current Repository Bytes：导出只收集 `.rxnflow`、`inputs/raw`、`exports` prefix，不从 ShellResponse、React state 或 runtime artifact 生成文件。
- [x] Unsaved Bridge Hint：bridge session open 时只提示先 Save Bridge Session，不阻止导出，也不自动保存。

**流程图核对**：
- [x] 图中 active project 判断、prefix listObjects、manifest 检查、entry mapping、archive adapter、Blob download、summary/error 展示都有代码落点。

## 2. 行为与决策核对

**需求摘要逐项验证**：
- [x] active browser-local project 点击 Export Bundle 后生成 `.rxnflow.zip` Blob，触发下载，并在 sidebar 展示 fileName、fileCount、rootName 和 checksum。
- [x] 缺 manifest、storage failure、archive validation failure 都映射为结构化错误；UI 显示 code/message/target。

**明确不做逐项核对**：
- [x] 未实现 Import Bundle、file picker、repository import writer、覆盖/合并或 roundtrip import。
- [x] 未自动调用 `project.save_content`、`project.export_bundle`、Python `ProjectBundleService` 或 local-http bridge bundle command。
- [x] 未生成缺失 `.rxnflow/state/*.json`、raw input 或 export artifact bytes。
- [x] 未做 Project Content deep validation、schema migration、cloud、OPFS、chunking、Worker 或 Service Worker。

**关键决策落地**：
- [x] D1 helper 独立：导出编排集中在 `projectBundleExport.ts`，React 组件只负责触发与渲染。
- [x] D2 repository 当前 bytes 为唯一数据源：`collectBrowserProjectBundleObjects` 只调用 `listObjects`。
- [x] D3 缺 manifest 返回 `project_content_missing`：单测和组件错误展示均覆盖。
- [x] D4 root/fileName 来自 active project name：测试覆盖安全化。
- [x] D5 Import Bundle 保持 disabled：组件测试覆盖，UI 文案已调整。
- [x] D6 download 副作用在 WorkbenchShell：`triggerBrowserBundleDownload` 创建临时 anchor 并 revoke URL。
- [x] D7 状态 UI-only：没有改 `ProjectSidebarState` repository-derived 字段。

**编排层“现状 -> 变化”逐项核对**：
- [x] ProjectSidebar 增加 `onExportBundle` / `exportBundleStatus` props，Export Bundle 在 active project 下可点击，Import Bundle 仍 disabled。
- [x] WorkbenchShell 增加 export status state 和 `exportSidebarBundle` callback，成功后触发 download，失败后显示 structured error。
- [x] action 固定 prefix 顺序为 `.rxnflow`、`inputs/raw`、`exports`，最终 path safety 仍由 archive adapter 执行。

**跨层纪律核对**：
- [x] Repository read-only：export helper 不调用 `writeObject` / `deleteObject`。
- [x] No shell side effect：export callback 不调用 `ShellClient.run`；测试断言无 `project.save_content` / `project.export_bundle`。
- [x] Single authority：zip 生成只经 `createBrowserProjectBundleArchive`，导出 action 不直接 import `fflate`。
- [x] Object URL lifecycle：`createObjectURL` / `revokeObjectURL` 成对调用，URL 不进 React state。
- [x] I18n completeness：`i18n/runtime.test.ts` catalog 完整性通过。
- [x] Uninstallability：本 feature 引用集中在 export helper、ProjectSidebar props/status、WorkbenchShell wiring、i18n/CSS 与测试。

**挂载点反向核对（可卸载性）**：
- [x] 挂载点 M1：`web/src/app/projectBundleExport.ts` 新增导出 action helper。
- [x] 挂载点 M2：`WorkbenchShell.tsx` 新增导出 callback 与 download helper。
- [x] 挂载点 M3：`ProjectSidebar.tsx` 新增 bundle section export UI 状态。
- [x] 挂载点 M4：`messages.ts` / `workbench.css` 新增中英文文案和状态样式。
- [x] 挂载点 M5：`projectBundleExport.test.ts` / `WorkbenchShell.test.tsx` 覆盖 helper 与 UI 编排。
- [x] 反向核查：grep `exportBrowserProjectBundle`、`ExportBundleStatus`、`createObjectURL`、`project.export_bundle`、`project.save_content` 后确认引用都落在清单内；Shell/save 命中仅来自既有 bridge save 流程和测试断言。
- [x] 拔除沙盘推演：删除 helper、Sidebar props/status、WorkbenchShell export callback、相关 i18n/CSS/tests 后，Project Sidebar 可退回 disabled bundle entry，Import Inbox、Report Export、Project Content 保存链路不受影响。

## 3. 验收场景核对

- [x] **S1**：active browser project 含 manifest、Project Content state、`inputs/raw/demo.xyz` 和 `exports/profile.png` 时点击 Export Bundle。
  - 证据来源：`projectBundleExport.test.ts`、`WorkbenchShell.test.tsx`、浏览器 QA。
  - 结果：通过，下载 `.rxnflow.zip`，summary 显示 fileCount、byteSize、checksum、rootName/projectName。
- [x] **S2**：zip 只包含一个 bundle root，root 下只含 `.rxnflow/`、`inputs/raw/` 和 `exports/` repository bytes。
  - 证据来源：`readBrowserProjectBundleArchive` roundtrip 断言 entries；outside path 被跳过。
  - 结果：通过。
- [x] **S3**：没有 active browser project 时不可用或返回 `active_project_required`，不创建 object URL。
  - 证据来源：action test 与 Workbench component disabled 状态。
  - 结果：通过。
- [x] **S4**：active project 缺 `.rxnflow/manifest.json` 时返回 `project_content_missing`，不下载。
  - 证据来源：action test 与 Workbench error test。
  - 结果：通过。
- [x] **S5**：repository `listObjects` 失败时返回 `storage_failed`。
  - 证据来源：`FailingListRepository` action test。
  - 结果：通过。
- [x] **S6**：archive adapter 返回 unsafe path / invalid bundle 时映射为 `bundle_invalid` 或 `zip_failed`，不下载。
  - 证据来源：`UnsafeListRepository` action test；archive adapter 自身 tests 覆盖 zip_failed。
  - 结果：通过。
- [x] **S7**：bridge session open 时显示 Save Bridge Session 提示；点击 Export Bundle 不自动调用 `project.save_content`。
  - 证据来源：Workbench component test。
  - 结果：通过。
- [x] **S8**：成功后 `URL.createObjectURL` 和 `URL.revokeObjectURL` 成对调用。
  - 证据来源：Workbench component test mock download。
  - 结果：通过。
- [x] **S9**：Import Bundle 仍 disabled，不触发 file picker、repository writer 或 import flow。
  - 证据来源：Workbench component test。
  - 结果：通过。
- [x] **S10**：导出不调用 `ShellClient.run`、Python `project.export_bundle`、local-http bridge 或 repository writer。
  - 证据来源：grep 与 component test payload assertions。
  - 结果：通过。
- [x] **S11**：新增 i18n key 在 `en-US` / `zh-CN` 中一致。
  - 证据来源：`web/src/app/i18n/runtime.test.ts`。
  - 结果：通过。
- [x] **S12**：Sidebar bundle section 在桌面与窄屏浏览器里无重叠。
  - 证据来源：Playwright browser smoke，desktop `1280x900` 与 narrow `390x900` 均无水平溢出，console error 为空。
  - 结果：通过。
- [x] **S13**：`npm run test -- --run` 和 `npm run build` 通过。
  - 证据来源：实现后全量 Web test/build；本验收文档落地后再次运行。
  - 结果：通过。

## 4. 术语一致性

- Browser Bundle Export Action：代码命中 `projectBundleExport.ts` 与架构/验收文档，含义一致。
- Export Bundle Status：代码类型与 UI 状态一致，未混入 repository state。
- Export Bundle Download：只指 Blob/object URL 下载动作。
- Current Repository Bytes：导出 helper 和文档都限定为 repository 当前 bytes。
- Unsaved Bridge Hint：UI 只提示 Save Bridge Session，不表达自动保存。
- 防冲突：`project.export_bundle` 仅在测试断言“不调用”中出现；Import Bundle 仍指后续导入 feature。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：已归并 Project Sidebar Export Bundle、Browser Bundle Export Action、Export Bundle Status、Export Bundle Download 和 read-only/不自动保存边界。
- [x] `codestable/architecture/web-workbench.md`：已归并 Browser Bundle Export Action、Project Sidebar export/import 当前状态、object URL lifecycle、测试覆盖和浏览器 QA。
- [x] `AGENTS.md`：不需要新增规则；已有 Web 预览和 UI 验证要求足够覆盖本 feature。

## 6. requirement 回写

- [x] `codestable/requirements/project-content-persistence.md` 已更新：记录 active browser project 可导出 `.rxnflow.zip`，导出只读取 repository 当前 bytes，Import Bundle 仍待后续功能，bridge session 变更需要显式 Save Bridge Session 后才会进入 bundle。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-web-project-portability/rxnflow-web-project-portability-items.yaml`：`web-project-bundle-export` 已从 `in-progress` 改为 `done`，feature 保持 `2026-05-22-web-project-bundle-export`。
- [x] `codestable/roadmap/rxnflow-web-project-portability/rxnflow-web-project-portability-roadmap.md`：第 3 节子 feature 清单已同步状态和完成说明，推进策略已指向下一步 `web-project-bundle-import`。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露新的长期环境、工具或工作流约束；现有 `AGENTS.md` 已记录 Web 工作台必须从 `web/` 运行 `npm run dev` 并在浏览器验证。

## 9. 遗留

- 后续优化点：`web-project-bundle-import` 需要启用 Import Bundle，从安全 `.rxnflow.zip` 创建新的 browser-local project 并写入 bundle entries。
- 已知限制：Export Bundle 不自动保存 open bridge session，不生成缺失 raw/export/project content bytes，不做 Project Content deep validation。
- 实现阶段顺手发现：Project Sidebar 目前只有保守 bridge open hint，没有精确 dirty tracking；后续如要更细提示应另起 feature。
