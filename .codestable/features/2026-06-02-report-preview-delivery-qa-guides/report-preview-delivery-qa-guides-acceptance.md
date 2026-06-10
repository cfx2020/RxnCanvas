# report-preview-delivery-qa-guides 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-02
> 关联方案 doc：`.codestable/features/2026-06-02-report-preview-delivery-qa-guides/report-preview-delivery-qa-guides-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层：

- [x] `ReportDeliveryQaItem` 没有作为 runtime API 落地；实际用 `docs/dev/report-export-artifacts.md` 的 QA matrix 表达 surface/risk/evidence/expected signal。
- [x] Artifact Delivery Surface 仍是 `png/cdxml/xlsx/csv/svg` 五种 artifact；E2E helper、fixture E2E 和 local-http E2E 已同步为 5 个 artifact / 5 个 download link。
- [x] Report Preview Surface 仍是 Web UI-only projection；本 feature 未改 `buildReportPreviewModel` 的生产接口，只补测试证据和指南入口。
- [x] Delivery Boundary Evidence 仍证明 `pdf/pptx/cdx` 只作为 unsupported capability；未加入 Web default formats、checkbox、download 或 persistence allowlist。
- [x] Bundle Roundtrip Evidence 已由 fixture/local-http E2E 和用户指南说明：browser-local `exports/...` 与 `.rxnflow/state/export-artifacts.json` 可随 `.rxnflow.zip` 迁移，导入后需要显式 Open Bridge。

流程图核对：Review tests/docs -> QA matrix -> guide hooks -> targeted checks -> build/E2E -> architecture/roadmap/acceptance 的落点分别是 docs、Web E2E specs、验证命令、architecture 回写和 roadmap done。

## 2. 行为与决策核对

- [x] 需求摘要：开发者现在能从 Report Preview Delivery QA Matrix 查到 CSV/SVG/preview/manifest/persistence/bundle/unsupported boundary 的证据入口。
- [x] 关键决策：本 feature 只收口 QA/guides，不新增 PDF/PPTX/CDX/HTML/DOCX writer，不新增 Web UI 面板，不改 Project Content schema。
- [x] E2E 分工保持不变：fixture E2E 覆盖 UI 编排、desktop/narrow、download/persistence 和 bundle backup/restore；local-http E2E 覆盖真实 Python bridge、真实 writer ids、persistence 和 bundle roundtrip。
- [x] 文档只写当前行为：用户指南说明 PNG/CDXML/XLSX/CSV/SVG、Preview 不生成文件、browser-local `exports/...`、`.rxnflow.zip` 备份/迁移，以及 PDF/PPTX/CDX 暂不支持。
- [x] Future writer discipline 已写入 dev guide：后续 delivery writer 必须从 `ReportDocument` / `ReportAsset` 输入开始，不得使用 Web DOM/state/screenshot。

明确不做逐项核对：

- [x] 未新增 PDF/PPTX/CDX/HTML/DOCX bytes writer。
- [x] 未新增 PDF/PPTX/CDX Web checkbox、download link 或 browser persistence。
- [x] 未改变当前 `png/cdxml/xlsx/csv/svg` writer 输出、MIME、extension 或 persistence path。
- [x] 未把 Web preview、DOM、canvas、Blob 或 Playwright screenshot 当作正式报告输出。
- [x] 未新增 Project Content schema、Shell command、cloud storage、account/auth 或 autosave。
- [x] 未把 QA artifacts 写入 `.rxnflow.zip`、Browser Project Repository 或 export-artifacts index。

挂载点反向核对：

- [x] 挂载点落在 `docs/dev/report-export-artifacts.md`、`docs/dev/graph-editor-e2e-qa.md`、`docs/user/report-export-artifacts.md`、`web/e2e/*`、architecture、roadmap 和本 feature 目录。
- [x] scope grep 显示新增 `pdf/pptx/cdx` 命中只在 docs/design/architecture/tests boundary 语境内；没有新增 supported union、writer dependency、persistence allowlist 或 Project Content schema。
- [x] 拔除沙盘推演：删除本 feature 目录、docs QA matrix、E2E 5-artifact 断言增强和 architecture/roadmap 回写后，本 feature 的 QA/guides 收口会消失；既有 runtime writer 和 Web panel 能力仍可保留。

## 3. 验收场景核对

- [x] S1：开发者指南包含 Report Preview Delivery QA Matrix，并按风险映射 Python unit、Web unit、build、fixture E2E、local-http E2E 和文档检查入口。证据：`docs/dev/report-export-artifacts.md`。
- [x] S2：Python targeted checks 覆盖 CSV/SVG export metadata、supported set、unsupported `pdf/pptx/cdx` validation 和 Report Composer Manifest no-bytes/JSON-safe contract。证据：`python3 -m unittest tests.test_report_export_baseline tests.test_report_manifest`，26 tests passed。
- [x] S3：Web targeted checks 覆盖 Report Preview readiness、export format capability、browser-local persistence、unsupported persistence skip 和 MIME/extension/writer helpers。证据：`cd web && npm run test -- exportFormatCapabilities.test.ts exportArtifactPersistence.test.ts reportPreviewModel.test.ts WorkbenchShell.test.tsx ShellClient.test.ts`，5 files / 116 tests passed。
- [x] S4：fixture E2E 覆盖 Report Export/Preview 主链路、desktop/narrow layout、browser-local artifact persistence、bundle backup/restore 和 no horizontal overflow。证据：`cd web && npm run test:e2e`，6 tests passed。
- [x] S5：local-http E2E 覆盖真实 Python bridge 下 import preview、energy compute、PNG/CDXML/XLSX/CSV/SVG export projection、browser-local persistence 和 bundle roundtrip。证据：`cd web && npm run test:e2e:local-http`，2 tests passed。
- [x] S6：用户指南说明当前可导出 PNG/CDXML/XLSX/CSV/SVG、Preview 不生成文件、保存位置是 browser-local `exports/...`、`.rxnflow.zip` 是当前手动备份/迁移方式。证据：`docs/user/report-export-artifacts.md`。
- [x] S7：用户指南说明 CDXML 是当前 ChemDraw 路径，CDX/PDF/PPTX 暂不可下载且不会出现在 Web 勾选项。证据：`docs/user/report-export-artifacts.md`。
- [x] S8：开发者指南说明后续 delivery writer 必须从 `ReportDocument` / `ReportAsset` 输入开始，不得使用 Web DOM/state/screenshot。证据：`docs/dev/report-export-artifacts.md`。
- [x] S9：scope grep 未发现方案外 writer/UI/schema。证据：验收期 `rg` 核对。
- [x] S10：YAML/docs validation。证据：feature checklist 和 roadmap items YAML 校验通过；`git diff --check` 通过。

前端浏览器验证：本 feature 修改了 E2E 断言和文档，不新增 UI 组件。浏览器用户路径由 Playwright Chromium fixture/local-http E2E 覆盖，包含 desktop/narrow、console/no overflow、download/persistence 和 bundle roundtrip。

## 4. 术语一致性

- `Report Preview Delivery QA Matrix` 只作为文档矩阵使用，不进入 runtime API。
- `Artifact Delivery Surface`、`Report Preview Surface`、`Delivery Boundary Evidence`、`Bundle Roundtrip Evidence` 与 docs/E2E/architecture 用词一致。
- `ReportDocument` / `ReportAsset` 仍指 core report composer manifest/reference，不等于 Web Preview，也不等于用户可下载完整报告。
- 禁用方向核对：`pdf/pptx/cdx` 没有进入 supported export union、Web default formats 或 browser persistence allowlist。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：新增 Report Preview Delivery QA & Guides 术语，并把 Web E2E QA Harness 扩展为覆盖 Report Export/Preview 五格式交付链路。
- [x] `.codestable/architecture/web-workbench.md`：更新 last_reviewed/tags/current capability，记录 Report Preview Delivery QA & Guides、QA matrix、fixture/local-http E2E、browser-local persistence、bundle roundtrip 和 unsupported boundary。
- [x] `.codestable/architecture/core-platform.md`：补充 report-preview-delivery-qa tag、指南入口中的 QA matrix 口径，并修正 ExportArtifactRecord 当前支持 `png/cdxml/xlsx/csv/svg`。
- [x] `docs/dev/report-export-artifacts.md`：新增 Report Preview Delivery QA Matrix。
- [x] `docs/dev/graph-editor-e2e-qa.md`：补报告导出/预览相关 E2E coverage 说明。
- [x] `docs/user/report-export-artifacts.md`：补保存、备份迁移和 unsupported format 说明。

## 6. requirement 回写

方案 frontmatter `requirement: null`。本 feature 不新增用户可操作 runtime 能力，只把已落地报告导出/预览/持久化/迁移能力的 QA 和指南收口；用户指南已更新，因此不新建 requirement。后续 PDF/PPTX/CDX writer 或完整报告下载 UI 落地时再回写用户需求。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-items.yaml`：`report-preview-delivery-qa-guides` 已从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-roadmap.md`：第 5/6 节同步为 final item done，并把 roadmap frontmatter `status` 改为 `completed`。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新环境、命令或工作流规则。现有 AGENTS.md 已包含 Web dev server、Web tests/build/E2E、Python unittest 和 CodeStable 流程约束。

## 9. 遗留

- PDF/PPTX/CDX writer 仍未实现，符合本 feature 明确不做。
- 当前完整组合报告仍只有 `ReportDocument` manifest，不是用户可下载的完整报告文件。
- 浏览器本地 project 仍不是云备份；迁移依赖 `.rxnflow.zip` 手动路径。
- 后续新增 delivery writer 时必须重新走 feature design，并从 ReportDocument / ReportAsset contract 开始。
