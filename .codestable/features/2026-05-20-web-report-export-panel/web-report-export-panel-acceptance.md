# web-report-export-panel 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-20
> 关联方案 doc：.codestable/features/2026-05-20-web-report-export-panel/web-report-export-panel-design.md

## 1. 接口契约核对

对照方案第 2.1 节，Web shell DTO 已补齐 `ExportFormat` 和 `ExportProfileData`，`WorkbenchArtifactSummary.bytes_base64` 可承载 shell 返回的 inline base64。

- [x] `ExportFormat` 固定为 `"png" | "cdxml" | "xlsx"`。落点：`web/src/shell/types.ts`。
- [x] `ExportProfileData.command` 固定为 `export.profile`，包含 `session_id`、可选 `profile` 和 `artifact_count`。落点：`web/src/shell/types.ts`。
- [x] `ReportExportOptions` 是 UI-only state，包含 `formats`、`includeBytes`、`basename` 和 `title`，不写 Project Content。落点：`web/src/app/ReportExportPanel.tsx`、`web/src/app/WorkbenchShell.tsx`。
- [x] `ShellArtifact` 是 runtime projection；成功后只转为 `WorkbenchArtifactSummary` 并保留 `bytes_base64`、metadata、inline/persisted 状态。落点：`shellArtifactSummary` / `mergeArtifacts`。
- [x] fixture transport 支持 `export.profile` success/error/warning paths：PNG/CDXML/XLSX、多格式、inline bytes、include bytes disabled、missing profile、missing formats 和 `chemdraw_cdxml_only` warning。落点：`web/src/shell/fixtureTransport.ts`。

## 2. 行为与决策核对

- [x] Report Export Panel 只在有 session 和 profile 时启用 Export；无 session/profile 时显示空态并禁用。
- [x] 点击 Export 只调用 ShellClient `export.profile`；成功后只 merge `ShellResponse.artifacts`、更新 `counts.artifacts` 和 warnings。
- [x] Report Export Panel 不从 profile 在前端生成 PNG/CDXML/XLSX bytes，也不调用 core writer。
- [x] `bytes_base64` 存在时显示 data URL download link；没有 bytes 时显示不可下载状态。
- [x] ShellResponse warning `chemdraw_cdxml_only` 可见，不吞掉。
- [x] i18n 只覆盖静态 UI 文案；artifact id、format、path、metadata key/value、warning/error code 原样显示。
- [x] 范围守卫通过：未调用 `project.save_content`，未修改 Python `ReportExportService` / writer / `ExportArtifact` codec / Project Content codec / Project Bundle，未新增 Browser Project Repository 写入、file picker、File System Access API、OPFS、JSZip、云存储、账号系统、报告预览、ChemDraw 编辑器、CDX、PDF、PPTX、SVG 或 CSV。

## 3. 验收场景核对

- [x] 首屏无 session / profile 时 Report Export Panel 显示可见空态，Export disabled。证据：`web/src/app/WorkbenchShell.test.tsx`、Playwright QA。
- [x] Fixture Run 后默认选中 PNG/CDXML/XLSX，include bytes 默认开启。证据：`web/src/app/WorkbenchShell.test.tsx`、Playwright QA。
- [x] 点击 Export 调用 `export.profile`，成功后展示 3 个 artifacts，artifact count 更新为 `3 artifacts indexed`。证据：`web/src/app/WorkbenchShell.test.tsx`、Playwright QA。
- [x] Artifact list 显示 format、id、path、inline/persisted 状态和 metadata。证据：`web/src/app/ReportExportPanel.tsx`、`web/src/app/WorkbenchShell.test.tsx`。
- [x] `bytes_base64` 存在时显示 download link，href 为 data URL，download filename 为 `rxnflow-profile.png` 等 basename + format。证据：`web/src/app/WorkbenchShell.test.tsx`、Playwright QA。
- [x] include bytes 关闭后导出仍显示 artifacts，但没有 Download link，并显示 3 个 `Download unavailable`。证据：`web/src/app/WorkbenchShell.test.tsx`、Playwright QA。
- [x] basename 和 title 按原样进入 command args；fixture artifact metadata 保留 `basename` / `title`。证据：`web/src/shell/ShellClient.test.ts`。
- [x] 取消全部 format 时 Export disabled；fixture missing formats error 由 ShellClient test 覆盖。证据：`web/src/app/ReportExportPanel.tsx`、`web/src/shell/ShellClient.test.ts`。
- [x] 缺失 session / profile 的 `export.profile` error 保留 error code/message/target。证据：`fixtureTransport` 的 `invalidSessionResponse` / `invalidExportInput` 和 ShellClient error tests。
- [x] 中文 locale 下 Report Export Panel 静态文案为简体中文，动态 artifact/code 保持原样。证据：`web/src/app/WorkbenchShell.test.tsx`。
- [x] Browser 插件尝试连接 `http://127.0.0.1:5173/` 做 Report Export Panel QA；Browser screenshot CDP command 超时，按前端 QA 流程 fallback 到本地 Playwright。
- [x] Playwright Chromium `1280x720` 验证 Fixture Run -> Compute -> Export，3 个 artifacts、3 个 Download link、metadata、warning 可见，无 console warning/error、无水平溢出。截图：`/tmp/rxnflow-report-export-desktop.png`。
- [x] Playwright Chromium `390x840` 验证同一 report export flow，选项、artifact list、download link、metadata 和 warning 区域无重叠、无水平溢出。截图：`/tmp/rxnflow-report-export-narrow.png`。
- [x] Playwright Chromium `1280x720` 验证 include bytes disabled flow，导出仍显示 3 个 artifacts，Download link 为 0，`Download unavailable` 为 3。截图：`/tmp/rxnflow-report-export-no-bytes.png`。

## 4. 术语一致性

- Report Export Panel：代码命中集中在 `ReportExportPanel.tsx`、`WorkbenchShell` 挂载、i18n 文案和 CSS，语义一致。
- Export Profile Command：仅通过 ShellClient 提交 `export.profile`，fixture transport 只模拟 shell response。
- Inline Artifact Download：只由 `bytes_base64` 派生 data URL，不写 repository。
- Artifact Summary List：只展示 runtime `WorkbenchArtifactSummary`，不等同于长期 `ExportArtifactRecord`。
- Export Options：只作为 UI state 和 command args，不写 Project Content。
- 防冲突：grep 命中 `project.save_content` 仅来自 Shell command union；BrowserProjectRepository / `new File` / SVG 命中来自既有 sidebar、import 和 energy tests/CSS，不属于本 feature 新增导出写入或前端报告生成。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md`：记录 Report Export Panel、fixture `export.profile`、artifact list、inline download、UI-only options、warnings 和不持久化边界。
- [x] `.codestable/architecture/ARCHITECTURE.md`：补充 Web Report Export Panel、Web Report Export Options、Inline Artifact Download 术语和 Web Workbench 已落地能力；核心 Report Export Service 边界保持不变。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已补充用户可从 active profile 导出 PNG/CDXML/XLSX runtime artifacts、查看 metadata/warnings，并在 inline bytes 存在时下载。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-items.yaml` 中 `web-report-export-panel` 已由 `in-progress` 改为 `done`，下一项依赖保持 `web-workbench-e2e-qa`。
- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-roadmap.md` 中 Report Export Panel 子 feature 状态同步为 done；下一项为 `web-workbench-e2e-qa`。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无新增候选。现有 AGENTS.md 已记录 Web dev server 必须从 `web/` 运行、前端/画布/曲线/导出预览改动需浏览器验证、不要用 `file://` 预览 Vite app。

## 9. 遗留

- Report Export Panel 当前只接 fixture `export.profile`；真实 Python bridge / HTTP transport 仍待后续 runtime feature 接入。
- 当前不把 runtime artifacts 写入 Browser Project Repository，也不创建长期 `ExportArtifactRecord`；exports 持久化需要后续 Project Content / Browser Project Repository 集成。
- 当前只提供 artifact list 和 inline download，不提供报告预览、ChemDraw 编辑器、CDX、PDF、PPTX、SVG 或 CSV。
- 当前浏览器 QA 是 feature-level 覆盖；下一步 roadmap item 是 `web-workbench-e2e-qa`，用于收敛完整导入、图谱、能量、导出全链路回归。
