---
doc_type: feature-acceptance
feature: 2026-05-25-web-report-preview-panel
status: accepted
accepted_at: 2026-06-01
summary: Web Report Export Panel 已新增 UI-only Preview mode，可扫描 graph/profile/table/snapshot/artifact readiness 与 warnings，且不改变 core/Shell/schema 边界
tags: [web, report-preview, report-export, artifact-readiness, acceptance]
---

# Web Report Preview Panel 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-01
> 关联方案 doc：`.codestable/features/2026-05-25-web-report-preview-panel/web-report-preview-panel-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `ReportPreviewModel` 已落地：`web/src/app/reportPreviewModel.ts` 定义 project、graph、profile、energyTable、assets、artifacts、warnings，字段与方案第 2.1 节一致。
- [x] `buildReportPreviewModel(input)` 已落地：输入只包含 workspace/profile/artifacts/warnings/active browser project/include bytes/selected formats，输出 JSON-safe view model。
- [x] `ReportExportPanel` 已接入 `viewMode: "preview" | "export"` 内部 UI state，默认 `preview`；Export mode 保留原有导出控件和 artifact list。
- [x] `ReportPreviewPanel` 只接收 `ReportPreviewModel` 渲染，不直接读取 ShellClient、Browser Project Repository 或 core writer。

**名词层变化核对**

- [x] Report Preview Mode：落在 `ReportExportPanel.tsx` 的 Preview/Export segmented control。
- [x] Report Preview Model：落在 `reportPreviewModel.ts`，component tests 和 helper tests 可直接断言。
- [x] Asset Readiness：energy diagram / energy table / graph snapshot 均映射为 ready / pending / warning / unavailable。
- [x] Artifact Match：按 format 与 metadata 匹配 energy table 和 graph snapshot artifacts，显示 artifact ids、format、inline/persisted/path/checksum。

**流程图核对**

- [x] `WorkbenchDomainState + ReportExportOptions + active browser project + artifacts -> buildReportPreviewModel -> ReportExportPanel Preview mode` 已落地。
- [x] `Export mode -> export.profile -> merge artifacts -> Preview mode readiness 更新` 已通过 component tests 和浏览器验收确认。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] 用户可在导出前扫描 profile id、output unit、points、missing/corrections、graph id、node/edge/path count、active path 和 persistence label。
- [x] 用户可在导出前看到 energy diagram、energy table、graph snapshot 的 pending/ready 状态；导出后 Preview 自动从 `state.artifacts` 更新 ready。
- [x] warnings 原样展示 code/message/target，动态 artifact id、path、checksum 和 metadata 不翻译。
- [x] 桌面和 `390x840` 窄屏经真实浏览器验收，无文档级水平溢出；长 artifact id 已改为可读换行布局。

**明确不做逐项核对**

- [x] 未新增 core report composer、Shell command、HTTP route、Project Content schema 或 persistence section。
- [x] 未在 Web 生成 PNG/CDXML/XLSX/CSV/SVG bytes，未做 DOM/canvas capture、Blob SVG builder 或 graph layout。
- [x] 未新增 PDF/PPTX/CDX/HTML report supported set、file picker、云分享或账号 UI。
- [x] 未把 Report Preview Model、view mode、readiness 或 warnings 写入 Project Content、Browser Project Repository、localStorage 或 ShellResponse。

**关键决策落地**

- [x] 预览形态采用 Report Export Panel 内的 Preview/Export 两段式切换，而不是新建独立 inspector。
- [x] Preview helper 只消费 Web projection；energy table readiness 只读取 `energy_table_schema_version=energy-table-v1` metadata；graph snapshot readiness 只读取 `artifact_kind=graph_snapshot` metadata。
- [x] i18n 已覆盖 `en-US` 与 `zh-CN`；错误 code、artifact id、checksum、path 等动态数据保持原样。

**挂载点反向核对**

- [x] 挂载点 M1：`web/src/app/reportPreviewModel.ts`。
- [x] 挂载点 M2：`web/src/app/ReportExportPanel.tsx`。
- [x] 挂载点 M3：`web/src/app/WorkbenchShell.tsx` 仅传入 `workspace`。
- [x] 挂载点 M4：`web/src/app/i18n/messages.ts` 与 `web/src/app/workbench.css`。
- [x] 挂载点 M5：`web/src/app/reportPreviewModel.test.ts` 与 `web/src/app/WorkbenchShell.test.tsx`。
- [x] 反向 grep：`ReportPreviewModel|buildReportPreviewModel|reportPreview|report-preview` 命中集中在上述 Web app、i18n、CSS、tests 和文档；未进入 `rxnflow/` core、`web/src/shell` 或 repository。
- [x] 拔除沙盘推演：删除 helper、ReportExportPanel preview branch、i18n/CSS/test 挂载后，Preview mode 消失；既有 Export mode、Shell `export.profile`、browser-local persistence 和 Project Content schema 不需要回退。

## 3. 验收场景核对

- [x] S1 workspace/profile 但无 artifacts：Preview 显示 graph/profile summary，energy table 与 graph snapshot 为 pending export。证据：browser Fixture -> Compute 初始 Preview；WorkbenchShell tests。
- [x] S2 profile 含 missing/corrections：Preview 显示 missing/correction count，missing 不按 0 处理。证据：`reportPreviewModel.test.ts`。
- [x] S3 CSV/XLSX `energy-table-v1` metadata：energy table ready，并显示 row/column count 和 artifact id。证据：`reportPreviewModel.test.ts`、浏览器导出后 Preview。
- [x] S4 SVG `artifact_kind=graph_snapshot` metadata：graph snapshot ready，并显示 snapshot artifact id。证据：`reportPreviewModel.test.ts`、浏览器导出后 Preview。
- [x] S5 artifact 缺 inline bytes / include bytes 关闭：artifact reuse list 显示 `hasInlineBytes=false`，不写 persistence。证据：`reportPreviewModel.test.ts`。
- [x] S6 active browser project 下导出 artifacts：Preview 显示 persisted path/checksum，Export mode artifact list 仍可下载。证据：WorkbenchShell tests。
- [x] S7 `chemdraw_cdxml_only` / persistence warnings：Preview warning list 保留 code/message/target。证据：browser 验收和 component tests。
- [x] S8 切换 Preview/Export mode：格式选择、basename/title/include bytes 不丢失，Export button 行为不变。证据：WorkbenchShell tests。
- [x] S9 窄屏 `390x840`：preview matrix、artifact ids、warnings 不重叠、不产生水平滚动。证据：Playwright Chromium screenshot `/tmp/rxnflow-report-preview-narrow.png`。

前端浏览器验证：

- [x] in-app Browser：`http://127.0.0.1:5173/` 运行 Fixture -> Compute -> Export -> Preview，console warn/error 为空，`scrollWidth == clientWidth`。
- [x] Playwright Chromium `1280x760`：同流程通过，截图 `/tmp/rxnflow-report-preview-desktop.png`。
- [x] Playwright Chromium `390x840`：同流程通过，截图 `/tmp/rxnflow-report-preview-narrow.png`。

## 4. 术语一致性

- [x] `ReportPreviewModel`、`buildReportPreviewModel`、Report Preview Mode、Asset Readiness、Artifact Match 与 design 第 0 / 2.1 节一致。
- [x] `Preview mode` / `Export mode` i18n key 与 segmented control aria label 一致。
- [x] 防冲突：未引入 `ReportDocument`、`ReportComposerManifest`、PDF/PPTX/CDX writer、DOM screenshot 或 browser storage writer 等方案外术语。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md`：已记录 Report Preview Mode、`reportPreviewModel.ts`、Preview/Export segmented control、UI-only readiness 边界和 QA。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已补 Web Report Preview Mode / Report Preview Model 术语，并明确它不是 core report composer。
- [x] `docs/dev/report-export-artifacts.md`：已补 Web Report Preview 投影、readiness 规则和不生成 bytes 边界。
- [x] `docs/dev/web-runtime-boundary.md`：已补 Preview mode 仍只消费 Web projection、不读写 repository / Project Content / Shell 的运行时边界。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已更新：新增导出前总览用户故事，记录 Preview 只扫描已有 projection 和 artifact metadata，不保存、不生成 bytes。
- [x] `docs/user/report-export-artifacts.md` 已更新：新增 Preview 使用步骤和 Ready / Pending export / Needs review / Unavailable 状态含义。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-items.yaml` 中 `web-report-preview-panel` 已从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-roadmap.md` 第 5/6 节已同步为 done，并把下一步推进改为 `report-composer-manifest`。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- 无候选。Web 预览必须从 `web/` 运行 `npm run dev`、前端改动需要浏览器验证等规则已在 `AGENTS.md` 中存在；本 feature 未暴露新的通用环境命令或协作约束。

## 9. 遗留

- 后续 roadmap：`report-composer-manifest` 仍需定义真正的 `ReportDocument` / `ReportSection` / `ReportAsset` manifest。
- 已知限制：Preview 不是组合报告 writer，不导出 PDF/PPTX/CDX/HTML，不支持云分享或账号同步。
- 实现阶段顺手发现：初次桌面截图发现长 artifact id 在右侧窄面板逐字换行；已在 `workbench.css` 中修复并重新验收。

## 验证记录

- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-25-web-report-preview-panel/web-report-preview-panel-checklist.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-items.yaml --yaml-only`：通过。
- `cd web && npm run test -- --run src/app/reportPreviewModel.test.ts src/app/i18n/runtime.test.ts src/app/WorkbenchShell.test.tsx`：通过，82 tests。
- `cd web && npm run build`：通过。
- `git diff --check`：通过。
- Browser / Playwright 手工验收：desktop、narrow、in-app Browser 均通过，console clean，无文档级水平溢出。
