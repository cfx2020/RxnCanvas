# web-report-export-verification 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：.codestable/features/2026-05-21-web-report-export-verification/web-report-export-verification-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层：

- [x] Fixture artifact metadata：`fixtureTransport.ts` 的 XLSX metadata 已包含 `energy_table_schema_version=energy-table-v1` 和 column count，CDXML/XLSX writer id 在 Web 测试和 E2E 中可见。
- [x] Inline Download Contract：`ReportExportPanel` 仍只基于 `ShellArtifact.bytes_base64` 生成 data URL；PNG/CDXML/XLSX download filename 和 MIME 由 `WorkbenchShell.test.tsx`、fixture E2E 和 local-http E2E 固定。
- [x] Browser Export Persistence Contract：`exportArtifactPersistence.test.ts` 覆盖 PNG/CDXML/XLSX 写入 `exports/...`、checksum、record upsert、重复导出不重复记录、缺 inline bytes skip 和 unsupported format skip。
- [x] Local HTTP Export Smoke：`local-http-bridge.spec.ts` 通过真实 Python bridge 检查 `pillow-energy-plot-v1`、`rxnflow-cdxml-energy-v1`、`xlsxwriter-energy-workbook-v1`、persisted path、checksum 和 download link。

流程图核对：`export.profile -> ShellResponse artifacts -> WorkbenchArtifactSummary -> persistExportArtifacts -> ReportExportPanel` 均有实际落点；fixture/local-http E2E 覆盖 runtime projection 和 browser-local persistence，两条路径未让 Web 生成导出 bytes。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] Fixture 模式下 PNG/CDXML/XLSX 三个 artifact 均显示，可下载，带 metadata 和 `chemdraw_cdxml_only` warning。
- [x] Active browser project 下 inline artifact 写入 `exports/rxnflow-profile.{format}`，显示 `persisted=yes` 与 `sha256:<64 hex>` checksum，并更新 `export-artifacts-v1`。
- [x] include bytes 关闭时只展示 runtime artifacts，没有 download link，也不写 browser-local exports。
- [x] browser persistence 失败时 runtime artifact 和 download link 保留，并显示 `artifact_persistence_failed` warning。
- [x] local-http 模式下真实 Python bridge 返回 writer metadata，Web 仍显示 persisted path、checksum 和 download link。
- [x] 窄屏路径由 Playwright E2E 覆盖 Report Export Panel 可见、Export 可点击、download link 可见、无水平溢出。

明确不做逐项核对：

- [x] 不在 Web 前端生成 PNG/CDXML/XLSX bytes；Web 只消费 `ShellArtifact.bytes_base64`。
- [x] 不新增 CSV/CDX/PDF/PPTX/SVG 或报告预览；Web `ExportFormat` 仍为 `png | cdxml | xlsx`。
- [x] 不修改 Python `ReportExportService` 导出语义；本 feature 只补 Web fixture metadata、测试和验收文档。
- [x] 不引入云存储、账号、File System Access API、OPFS 或自动保存。
- [x] 不把 Playwright report、trace 或 screenshot 加入版本控制。

## 3. 验收场景核对

- [x] S1 fixture export artifact / metadata / warning：`WorkbenchShell.test.tsx` 和 `web/e2e/workbench-helpers.ts` 断言三个 artifact、3 个 Download、writer metadata、`energy_table_schema_version` 和 `chemdraw_cdxml_only`。
- [x] S2 CDXML/XLSX MIME：component tests、fixture E2E 和 local-http E2E 断言 `chemical/x-cdxml` 与 spreadsheet MIME data URL。
- [x] S3 active browser project persistence：`WorkbenchShell.test.tsx`、`exportArtifactPersistence.test.ts` 和 fixture E2E 断言 `exports/rxnflow-profile.{png,cdxml,xlsx}`、persisted yes、checksum 和 `export-artifacts-v1`。
- [x] S4 include bytes off：`WorkbenchShell.test.tsx` 与 fixture E2E 验证没有 Download link、repository 未写入 exports。
- [x] S5 persistence failure：`WorkbenchShell.test.tsx` 验证 runtime artifacts/download 保留并显示 `artifact_persistence_failed`。
- [x] S6 unsupported format：`exportArtifactPersistence.test.ts` 用 `cdx` artifact 验证不写 `exports/rxnflow-profile.cdx`，不写 export artifact record。
- [x] S7 local-http writer metadata：`web/e2e/local-http-bridge.spec.ts` 验证真实 writer ids、persisted paths、checksum 和 download MIME。
- [x] S8 窄屏 E2E：`npm run test:e2e` 的 narrow Workbench Journey 覆盖 Report Export Panel，可见性、download link、console clean 和无水平溢出。
- [x] S9 Browser smoke：Browser plugin 在桌面中文界面验证 3 个 artifact cards、3 个 download links、CDXML/XLSX data URL、`energy-table-v1`、`chemdraw_cdxml_only`、无 Vite overlay、无 console issue、无水平溢出。当前 in-app Browser 窄屏点击/滚动自动化不稳定，窄屏交互以 Playwright E2E 作为验收证据。

证据：

- `python3 -m unittest tests.test_report_export_baseline`：15 tests OK。
- `python3 -m unittest discover`：250 tests OK。
- `cd web && npm run test -- WorkbenchShell exportArtifactPersistence`：41 tests OK。
- `cd web && npm run test:e2e`：3 tests OK。
- `cd web && npm run test:e2e:local-http`：1 test OK。
- `cd web && npm run test`：130 tests OK。
- `cd web && npm run build`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-21-web-report-export-verification/web-report-export-verification-checklist.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-items.yaml --yaml-only`：通过。

## 4. 术语一致性

- Web Report Export Verification：代码只补 Web 测试、E2E 和 fixture metadata，不扩展 core writer。
- Inline Download Contract：仍是 `bytes_base64 -> data URL + download filename`。
- Browser Export Persistence Contract：仍只接受 PNG/CDXML/XLSX inline bytes，路径仍为 `exports/{basename}.{format}`。
- Local HTTP Export Smoke：只验证真实 bridge 投影，不复制 fixture 全矩阵。
- 禁用词核对：`cdx` 只出现在 unsupported guard 测试；CSV、cloud、OPFS、File System Access 未作为新能力引入。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md`：Report Export Panel / Web Export Artifact Persistence / E2E QA 现状补充为 fixture/local-http 覆盖 writer id、MIME、schema metadata、persisted checksum、unsupported format guard 和窄屏 QA。
- [x] `.codestable/architecture/ARCHITECTURE.md`：Web Report Export 总入口补充 Web 端导出验证边界和 local-http writer metadata smoke。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已有 Web Report Export 用户故事；本次补充的是同一能力的验收强度，不新增独立 requirement。边界描述同步补充 fixture/local-http E2E 已覆盖 metadata、MIME、checksum 和窄屏布局。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-items.yaml`：`web-report-export-verification` 已标为 `done`。
- [x] `.codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-roadmap.md`：第 5 节子 feature 清单已同步 `done` 状态和落地说明。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新通用规则。既有规则已覆盖：Web 工作台必须从 `web/` 运行 Vite dev server，前端视觉/交互改动需要浏览器验证，测试产物不进版本控制。

## 9. 遗留

- 已知限制：当前 Browser plugin 窄屏交互自动化不稳定，窄屏验收以 Playwright Chromium E2E 为权威证据。
- 已知限制：Web Report Export Panel 仍不做报告预览、ChemDraw 编辑器、CDX、CSV、PDF/PPTX/SVG、云存储或自动保存。
- 后续优化点：`report-export-guides` 需要把表格字段、CDXML/ChemDraw 使用方式、CDX 边界、artifact 保存路径和常见 warnings 写成用户/开发者指南。
