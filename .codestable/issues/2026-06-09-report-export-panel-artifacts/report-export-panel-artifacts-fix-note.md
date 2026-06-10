---
doc_type: issue-fix-note
slug: report-export-panel-artifacts
component: web-report-export
status: fixed
fixed_at: 2026-06-09
tags: [web-workbench, report-export, cdxml, xlsx, png, qa]
---

# Report Export Panel Artifacts Fix Note

## Problem

用户验收右侧报告导出面板时指出：

- 面板仍显示旧的 Preview / Artifacts / readiness / metadata 类 UI，信息层级混乱。
- 普通 Web 导出面板不应展示 CSV / SVG；当前只需要面向用户的 PNG、CDXML 和 XLSX。
- 点击导出的文件后，PNG 损坏、SVG 空白、CDXML 打不开、XLSX 没有数据。

## Fix

- `ReportExportPanel` 收敛为纯导出面板：只保留格式选择、basename/title、Export command 和导出文件 download link。
- 删除旧 `reportPreviewModel` 及相关 preview/readiness UI、样式和测试入口。
- Web-visible export formats 改为只返回 `png/cdxml/xlsx`；CSV/SVG 仍保留为 core supported writer / persistence helper 的底层能力，不进入普通 Web 面板。
- Fixture transport 的 PNG/CDXML/XLSX artifact bytes 改为真实可识别 payload：
  - PNG 使用合法 PNG bytes。
  - CDXML 输出带 `<CDXML>` 的 XML 文档。
  - XLSX 使用 `fflate` 生成最小合法 workbook zip，并包含 worksheet 数据。
- Workbench fixture / local-http E2E 改为解码 data URL，验证 PNG 文件头、CDXML 文本和 XLSX zip / worksheet 内容，而不是只看链接是否存在。
- local-http smoke 拆清职责：真实 Python bridge 的 fixture path 验证 core writer/download bytes；真实 raw file 导入 path 验证 browser-local 项目导入、保存和恢复。

## Verification

- `python3 -m unittest tests.test_report_export_baseline tests.test_report_manifest`
- `cd web && npm run test -- --run`
- `cd web && npm run build`
- `cd web && npm run test:e2e -- workbench-journey.spec.ts`
- `cd web && npm run test:e2e:local-http`
- `git diff --check`
- Browser verification at `http://127.0.0.1:5173/?qa=export-panel-qa`:
  - Report Export panel only shows PNG, CDXML and XLSX.
  - Panel text no longer contains CSV, SVG or Preview.
  - Export produces 3 download links.
  - PNG data URL decodes to header `89 50 4E 47 0D 0A 1A 0A`.
  - CDXML data URL contains `<CDXML`.
  - XLSX data URL starts with `PK` and contains workbook / worksheet entries.
  - Browser console has no relevant error or warning.

## Remaining Boundary

- Build still reports the existing Vite large chunk warning; this is a future code-splitting task and does not affect report export correctness.
- Browser screenshot capture through the current in-app browser CDP path timed out during verification. DOM, interaction, console and decoded file-byte evidence were used instead.
