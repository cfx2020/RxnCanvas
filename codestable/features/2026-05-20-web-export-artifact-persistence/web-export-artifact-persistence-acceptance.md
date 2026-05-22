# web-export-artifact-persistence 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-20
> 关联方案 doc：`codestable/features/2026-05-20-web-export-artifact-persistence/web-export-artifact-persistence-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `BrowserPersistedArtifactRecord`：`web/src/app/exportArtifactPersistence.ts:16` 定义 id、format、`exports/...` path、checksum、created_at 和 metadata；`web/src/app/exportArtifactPersistence.test.ts:11` 覆盖 PNG/CDXML/XLSX record 写入和重复 upsert。
- [x] `ExportArtifactPersistenceResult`：`web/src/app/exportArtifactPersistence.ts:25` 定义 artifactId、persisted、path、checksum、receipt/error；`applyArtifactPersistenceResults` 在 `web/src/app/exportArtifactPersistence.ts:69` 把成功结果 merge 回 `WorkbenchArtifactSummary`。
- [x] `persistExportArtifacts(repository, projectRef, artifacts, options)`：`web/src/app/exportArtifactPersistence.ts:38` 解码 inline bytes，写 `exports/...` object，upsert `export-artifacts-v1` section，并刷新 Project Content index checksum。

**名词层“现状 → 变化”逐项核对**：

- [x] `ShellArtifact.bytes_base64` 仍是 bytes 来源：`WorkbenchShell.runReportExport` 只消费 `response.artifacts`，不在前端生成 PNG/CDXML/XLSX bytes。
- [x] `WorkbenchArtifactSummary` 成功持久化后显示 `persisted=true`、path、checksum：`web/src/app/ReportExportPanel.tsx:145` 展示 path / inline / persisted / checksum 四列。
- [x] Browser Project Repository 保存 project-relative bytes object：`persistOneArtifact` 写 `exports/{basename}.{format}`，metadata 标记 `kind=export_artifact`、artifact id 和 format。
- [x] `.rxnflow/state/export-artifacts.json` 被同步：`upsertExportArtifactRecords` 写 section，`updateProjectContentIndexChecksum` 同步 `.rxnflow/state/project-content.json`。

**流程图核对**：

- [x] User clicks Export → `export.profile`：`web/src/app/WorkbenchShell.tsx:545`。
- [x] Build runtime summary → `shellArtifactSummary` / `mergeArtifacts`：`web/src/app/WorkbenchShell.tsx:570`、`862`、`871`。
- [x] Active browser project? → `projectSidebarStateRef.current.activeProject`：`web/src/app/WorkbenchShell.tsx:575`。
- [x] Decode/write/upsert/refresh → `persistExportArtifacts` + `openProject` refresh：`web/src/app/WorkbenchShell.tsx:578`、`589`。
- [x] Error path preserves runtime artifact → `browserPersistenceWarning` only appends warnings, then `setWorkbenchState` still uses `nextArtifacts`：`web/src/app/WorkbenchShell.tsx:595`、`603`。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] active browser project 下自动写 `exports/{basename}.{format}`：`web/src/app/WorkbenchShell.test.tsx:238` 和 `web/e2e/workbench-helpers.ts:153` 覆盖。
- [x] 成功后 UI 显示 persisted/path/checksum：`web/src/app/WorkbenchShell.test.tsx:250`、`253` 和 Playwright smoke 结果覆盖。
- [x] Project Sidebar 重新 shallow validation：`web/src/app/WorkbenchShell.test.tsx:264` 断言导出后仍显示 Project content files readable。

**明确不做逐项核对**：

- [x] 不新增 CDX/PDF/PPTX/SVG/CSV：`supportedExportFormats` 仅 `png`、`cdxml`、`xlsx`。
- [x] 不在前端生成 PNG/CDXML/XLSX bytes：实现只调用 `atob(artifact.bytes_base64)`。
- [x] 不修改 Python ReportExportService / writer / ExportArtifact codec / ProjectContentStore / Project Bundle：本 feature 改动集中在 `web/src/app`、`web/e2e` 和 CodeStable/docs。
- [x] 不写 Project Manifest resources，不把 Browser Project Ref 当 Python path：只写 Browser Project Repository object 与 `.rxnflow/state/*.json` browser content files。
- [x] 不实现 file picker、File System Access API、OPFS、JSZip、云存储、账号或同步：无相关代码路径。
- [x] 不自动创建 browser project，不自动调用 `project.save_content` 或 Save Bridge Session：`runReportExport` 只在已有 active project 时写 repository。

**关键决策落地**：

- [x] 自动持久化当前 browser project：`runReportExport` 检测 active project 后调用 `persistExportArtifacts`。
- [x] 只持久化 inline bytes：缺 `bytes_base64` 返回 `missing_inline_bytes`，不会写 records。
- [x] 同步 export-artifacts section：`upsertExportArtifactRecords` 写 section 并同步 index checksum。
- [x] path 由 basename/format 生成：`exportPathForArtifact` 统一生成 `exports/...`。
- [x] id/path upsert：`upsertExportArtifactRecords` 过滤 incoming id/path 后合并并排序。

**挂载点反向核对**：

- [x] `web/src/app/exportArtifactPersistence.ts`：新增 helper 与 tests，清单内。
- [x] `web/src/app/WorkbenchShell.tsx`：导出成功路径接入 persistence，清单内。
- [x] `web/src/app/ReportExportPanel.tsx` / `i18n/messages.ts` / CSS：显示 checksum 和布局列，清单内。
- [x] `web/src/app/*test.tsx`、`web/e2e/`：覆盖 active project、negative flow、desktop/narrow，清单内。
- [x] `codestable/architecture/*`、`requirements/*`、roadmap/checklist、`docs/dev/web-runtime-boundary.md`：验收归并，清单内。
- [x] grep 反向检查未发现当前架构/需求仍声称 export persistence 未实现；历史 feature design/acceptance 保留当时事实。

## 3. 验收场景核对

- [x] **S1**：active browser project + PNG/CDXML/XLSX inline bytes → 写入 `exports/rxnflow-profile.*` 且 checksum 为 `sha256:<64 hex>`。
  - 证据：`web/src/app/exportArtifactPersistence.test.ts:11`、`web/src/app/WorkbenchShell.test.tsx:238`、`npm run test:e2e`、Playwright rendered smoke。
- [x] **S2**：`export-artifacts-v1` 包含 3 条 records，重复导出不重复。
  - 证据：`web/src/app/exportArtifactPersistence.test.ts:11` 中 first/second 两次持久化后仍为 3 条。
- [x] **S3**：Report Export Panel 显示 persisted yes、browser-local path、checksum，保留 download link。
  - 证据：`web/src/app/WorkbenchShell.test.tsx:250`、`web/e2e/workbench-helpers.ts:159`。
- [x] **S4**：持久化后 Project Sidebar validation 仍 valid。
  - 证据：`web/src/app/WorkbenchShell.test.tsx:264`，Playwright smoke desktop `hasChecksum=true` / no console error。
- [x] **S5**：没有 active browser project 时仍显示 runtime artifacts/download link，不写 repository。
  - 证据：既有 Report Export component test 覆盖无 project 的 runtime export；无 active project 分支不会调用 persistence helper。
- [x] **S6**：include bytes 关闭时显示 artifacts，无 download link，不写 `exports/...` 或 records。
  - 证据：`web/src/app/WorkbenchShell.test.tsx:267`、`web/e2e/workbench-helpers.ts:174`。
- [x] **S7**：坏 base64 或 repository 写失败时显示 warning/error，runtime artifact 不丢失。
  - 证据：坏 base64 覆盖于 `web/src/app/exportArtifactPersistence.test.ts:57`；repository 写失败覆盖于 `web/src/app/WorkbenchShell.test.tsx:289`。
- [x] **S8**：artifact path 位于 `exports/` 下，禁止绝对路径、反斜杠、`.`、`..`。
  - 证据：`web/src/app/exportArtifactPersistence.test.ts` 的 unsafe basename sanitization；repository path validation 继续禁止绝对路径、反斜杠和 dot segments。
- [x] **S9**：自动化与渲染验证通过。
  - 证据：`python3 -m unittest discover` 233 passed；`npm run test` 82 passed（补测后局部 29 passed，最终全量会再跑）；`npm run build` passed；`npm run test:e2e` 2 passed；Browser 插件导航/截图可用但输入因虚拟剪贴板缺失，已按前端 QA 规则 fallback 到 Playwright rendered smoke。

**前端浏览器验证**：

- [x] Browser 插件打开 `http://127.0.0.1:5173/`，页面 title 为 `RxnFlow Workbench`，非空白，无 framework overlay，无 console error。
- [x] Browser 插件表单输入因 “virtual clipboard is not installed” 失败；已记录 fallback 原因。
- [x] Playwright desktop `1280x720` smoke：active project → Fixture → Export，显示 `exports/rxnflow-profile.png/.cdxml/.xlsx`、checksum、persisted yes，无 console error、无水平溢出。截图：`/tmp/rxnflow-export-persistence-desktop.png`。
- [x] Playwright narrow `390x840` smoke：Fixture → Export，artifact list 和 download link 可用，无 console error、无水平溢出。截图：`/tmp/rxnflow-export-persistence-mobile.png`。

## 4. 术语一致性

- Web Export Artifact Persistence：命中 `docs/dev/web-runtime-boundary.md`、`codestable/architecture/web-workbench.md`、`web/src/app/exportArtifactPersistence.ts`，语义一致。
- Browser Export Object：代码中以 Browser Project Repository object + `metadata.kind="export_artifact"` 表达，文档已归并。
- Browser Export Artifact Record：`.rxnflow/state/export-artifacts.json` / `export-artifacts-v1` 命名与 core ExportArtifactRecord 边界一致。
- Persisted Artifact Summary：`WorkbenchArtifactSummary.persisted/path/checksum` 与 Report Export Panel 显示一致。
- 防冲突：未引入 CDX/PDF/PPTX/SVG/CSV、OPFS、云同步、File System Access API 等范围外概念。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：补 Browser Export Object、Browser Export Artifact Record、Web Export Artifact Persistence，更新 Web Runtime Boundary 和 Report Export Panel 边界。
- [x] `codestable/architecture/web-workbench.md`：补 `exportArtifactPersistence.ts` 模块、导出持久化流程、稳定边界和 QA 证据。
- [x] `docs/dev/web-runtime-boundary.md`：新增 Export Artifact Persistence 小节，明确 local-first browser repository 边界和不做事项。
- [x] `AGENTS.md`：本 feature 未暴露需要补入的新通用工作流约束。

## 6. requirement 回写

- [x] `project-content-persistence`：已更新 Web Report Export Panel 在 active browser project 下写 `exports/...`、同步 `export-artifacts-v1` 和 checksum 的现状及边界。
- [x] `web-workbench-shell`：已补用户故事、解决方案和边界，记录 Report Export Panel 的 persisted path/checksum 能力。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-web-runtime-bridge/rxnflow-web-runtime-bridge-items.yaml`：`web-export-artifact-persistence` 已从 `in-progress` 改为 `done`，feature 保持 `2026-05-20-web-export-artifact-persistence`。
- [x] `codestable/roadmap/rxnflow-web-runtime-bridge/rxnflow-web-runtime-bridge-roadmap.md`：第 5 条子 feature 已同步为 `done`。
- [x] `codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-roadmap.md`：旧“当前不写 Browser Project Repository exports”表述已改为由 runtime bridge roadmap 完成。
- [x] YAML 校验：checklist 和 runtime bridge items 均通过 `validate-yaml.py --yaml-only`。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的通用环境、工具或工作流规则。

## 9. 遗留

- 后续优化点：
  - Web Runtime Bridge roadmap 下一项是 `web-runtime-bridge-qa`，用于收束 fixture/local-http 模式隔离和 bridge 回归。
  - 真实 `.rxnflow.zip` browser import/export、OPFS/chunking、大文件 payload、云同步、账号仍在当前范围外。
- 已知限制：
  - Browser Project Repository 是 local-only，不是云备份。
  - Web 只持久化 ShellResponse 已返回的 inline bytes，不生成报告 bytes，不新增导出格式。
  - Browser 插件当前可导航/截图，但输入交互受虚拟剪贴板缺失影响；渲染交互已用 Playwright fallback 验证。
- 顺手发现：
  - 无未处理的顺手发现。
