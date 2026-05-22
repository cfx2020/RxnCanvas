# Web Raw Input Persistence 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：`codestable/features/2026-05-22-web-raw-input-persistence/web-raw-input-persistence-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层核查：

- [x] `RawPersistenceState`：落地于 `web/src/app/rawInputPersistence.ts`，并挂入 `WebImportFile.rawPersistence`；包含 `idle/persisted/skipped/error`，error 使用 `BrowserProjectRepositoryErrorPayload`。
- [x] `BrowserRawResource`：落地于 `web/src/app/rawInputPersistence.ts`，shape 与 core `ProjectResource` JSON 兼容，字段包含 `id/kind/path/checksum/metadata`。
- [x] `PersistRawInputResult`：落地于 `persistRawInputFile`，成功返回 raw resource、raw object receipt 和 manifest receipt，失败返回结构化 repository error payload。
- [x] `Browser Raw Input Object`：`persistRawInputFile` 写入 `inputs/raw/{sha12}-{safeName}`，metadata 为 `kind=raw_file`、source name、byte size、mime type、last modified。
- [x] `Raw Persistence Summary`：`ImportInbox.tsx` 的 `RawPersistenceSummary` 展示 persisted/skipped/error、raw id/path/checksum 或 error code/target。
- [x] 流程图核对：实现顺序为 `importPreviewArgsFromFiles` payload 校验 → raw persistence best-effort → `import.preview`。为满足 oversized 不读写 raw 的验收场景，方案第 2.2 节已回填为该顺序。

## 2. 行为与决策核对

- [x] 需求摘要：active browser project 下 selected `File` 会保存为 `inputs/raw/...` raw object，并 merge manifest raw resource；preview 仍走既有 fixture path 或 local-http inline payload。
- [x] 明确不做：未实现 bundle IO、OPFS/chunking/Worker/cloud、Python bridge 读取 IndexedDB、前端 parser、auto register、raw cleanup、Project Manifest schema 改动或 Open Bridge 自动调用。
- [x] 关键决策 D1：raw persistence 是 preview 前 best-effort side effect。实现中 raw persistence error 只进入 selected file UI，shell preview 仍继续。
- [x] 关键决策 D2：raw id/path 与 Python 对齐。`browserRawResourceForFile` 使用 sha256 前 12 位生成 `raw-{sha12}` 和 `inputs/raw/{sha12}-{safeName}`。
- [x] 关键决策 D3：manifest merge 幂等。`mergeBrowserRawResource` 按 `kind=raw_file && checksum` 查重；重复 preview 不重复追加 resource。
- [x] 关键决策 D4：preview payload authority 不变。`import.preview` args 仍来自 `importPreviewArgsFromFiles`，raw object 不作为 parser source。
- [x] 关键决策 D5：错误可见但不扩大阻断面。repository error 显示为 Raw Persistence Summary，不伪装成 parser warning。
- [x] 挂载点核对：本 feature 引用集中于 `ImportInbox.tsx`、`WorkbenchShell.tsx`、`rawInputPersistence.ts`、`importInboxState.ts`、i18n/CSS/tests，均在方案第 2.3 节清单内。
- [x] 拔除沙盘推演：移除 `rawInputPersistence.ts` import 与 `WebImportFile.rawPersistence` UI 可回到原 preview/register 流程；未改 Shell command、repository interface 或 parser/core。

## 3. 验收场景核对

- [x] S1 active browser project + `water.xyz` Preview 写入 `inputs/raw/{sha12}-water.xyz`。证据：`WorkbenchShell.test.tsx` active project test 与 Playwright browser QA。
- [x] S2 manifest 追加 `raw_file` resource，id/path/checksum/metadata 对齐。证据：`rawInputPersistence.test.ts` 和 `WorkbenchShell.test.tsx` manifest assertion。
- [x] S3 重复 Preview 不重复 manifest resource。证据：`WorkbenchShell.test.tsx` repeated preview test。
- [x] S4 无 active project Preview 仍运行且显示 skipped。证据：`WorkbenchShell.test.tsx` skipped test。
- [x] S5 raw persisted 与 parser warning/error 分离。证据：fixture preview warning 仍来自 ShellResponse，raw persisted status 独立显示。
- [x] S6 raw object/manifest 写入失败显示 raw persistence error code/target。证据：`FailingRawInputProjectRepository` component test。
- [x] S7 oversized inline file 返回 `payload_too_large`，不读写 raw object。证据：`WorkbenchShell.test.tsx` oversized active project test。
- [x] S8 selected file list 显示 raw id/path/checksum，动态 path/checksum 原样显示。证据：component tests 与 browser QA。
- [x] S9 中英文文案可见。证据：`messages.ts` catalog key completeness、WorkbenchShell 中文测试。
- [x] S10 桌面无重叠/无水平溢出。证据：Playwright Chromium `1280x900` raw input QA，overflow=false，consoleErrors=[]。
- [x] S11 窄屏无整体水平溢出。证据：Playwright Chromium `390x900` raw input QA，overflow=false，consoleErrors=[]。

浏览器验证：`http://127.0.0.1:5173/`，desktop `1280x900` 与 narrow `390x900` 均完成 create project、Fixture Run、选择 `water.xyz`、Preview，raw status/path/checksum 可见。

## 4. 术语一致性

- `BrowserRawResource`、`RawPersistenceState`、`PersistRawInputResult`、`RawPersistenceSummary` 命名与 design 第 0/2.1 节一致。
- `Browser Raw Input Object` 未作为新 runtime class 引入，只以 repository object contract 落在 `persistRawInputFile`。
- grep 核对无前端 parser/core import；`rxnflow.parsers`、cclib、ASE/MAPLE parser 未进入 Web 代码。

## 5. 架构归并

- [x] `codestable/architecture/web-workbench.md`：已记录 Browser Raw Input Store、`rawInputPersistence.ts`、manifest raw resource merge、UI-only Raw Persistence Summary、inline preview 与 raw object 的区别、oversized 不读写 raw、QA 证据。
- [x] `codestable/architecture/ARCHITECTURE.md`：已补 Browser Raw Input Object、Browser Raw Resource、Raw Persistence Summary、Inline Preview Payload 术语，并更新 Web Workbench 模块索引和 Web Import Inbox 边界。
- [x] `AGENTS.md`：本 feature 未暴露新的项目级硬约束；已有 Web 预览/QA 规则足够覆盖。

## 6. requirement 回写

- [x] `codestable/requirements/web-workbench-shell.md` 已更新：新增用户故事，说明 active browser project 下导入预览会保存 raw input anchor，并补边界：不自动确认导入、不登记 ChemicalObject、不云同步、不读写 oversized raw。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-web-project-portability/rxnflow-web-project-portability-items.yaml`：`web-raw-input-persistence` 从 `in-progress` 改为 `done`。
- [x] `codestable/roadmap/rxnflow-web-project-portability/rxnflow-web-project-portability-roadmap.md`：第 5 节对应条目状态改为 `done`。
- [x] YAML 校验通过：feature checklist 与 roadmap items。

## 8. AGENTS.md / CLAUDE.md 候选盘点

无候选。本 feature 没有新增会让后续 agent 反复踩坑的环境或工作流规则；`AGENTS.md` 已经要求 Web 从 `web/` 运行 Vite 并验证桌面/窄屏。

## 9. 遗留

- `.rxnflow.zip` browser import/export 仍在 roadmap 后续 feature 中，不属于本次。
- 大 raw output 的 OPFS/chunking/StorageManager.persist 仍未实现。
- raw input cleanup/rename/replace UI 未实现。
- Browser Raw Input Object 目前是 bundle anchor，不是 parser source；local-http bridge 仍只消费 path/inline preview payload。
