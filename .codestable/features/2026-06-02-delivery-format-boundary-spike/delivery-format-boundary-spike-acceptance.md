# delivery-format-boundary-spike 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-02
> 关联方案 doc：`.codestable/features/2026-06-02-delivery-format-boundary-spike/delivery-format-boundary-spike-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层：

- [x] `rxnflow.export.ExportFormat` 仍只包含 `png/cdxml/xlsx/csv/svg`，未加入 `pdf/pptx/cdx`。证据：`rxnflow/export.py` 与 `tests/test_report_export_baseline.py::test_export_contracts_and_input_validation`。
- [x] Web `ExportFormat` 仍只包含 `png/cdxml/xlsx/csv/svg`，`reportExportFormats()` 默认不返回 `pdf/pptx/cdx`。证据：`web/src/shell/types.ts` 与 `web/src/app/exportFormatCapabilities.test.ts`。
- [x] `EXPORT_FORMAT_CAPABILITIES` / Web capability table 继续记录 `pdf/pptx/cdx` 的 extension、MIME、artifact kind 和 unsupported reason，且 `writer_id` / `fixtureWriterId` 为 null。证据：core/Web capability tests。
- [x] Delivery Format Boundary 当前以 design、docs 和 architecture 形式落地，不新增 runtime writer module；字段含义可追溯到 capability table。

流程图核对：`ReportDocument / ReportAsset -> Delivery format request -> capability status -> invalid_input / dependency check / writer output` 中，当前落点是 capability table、`ReportExportService` unsupported validation、Web capability helper 和 docs/architecture；future writer 分支保持文档边界，未实现代码。

## 2. 行为与决策核对

- [x] 需求摘要：PDF/PPTX/CDX 的依赖候选、运行位置、进入条件、错误码和 Web unsupported 口径已固定在 design、docs 和 architecture 中。
- [x] 关键决策：`pdf/pptx/cdx` 继续 `status="unsupported"`，不进入 supported format union、不进入 Web checkbox、不写 browser-local export artifacts。
- [x] 错误语义：未开放格式仍返回 `invalid_input target=formats`；只有未来 supported writer 缺运行时依赖才使用 `export_failed target=dependency`。证据：`tests/test_report_export_baseline.py` 和 `docs/dev/report-export-artifacts.md`。
- [x] PDF/PPTX 后续路线未提前拍板，只记录候选依赖和进入条件；CDX 继续要求可靠 writer/converter、license、平台和回归测试。
- [x] CDXML 继续作为当前 ChemDraw 交付格式，未被 CDX 边界降级或替换。
- [x] SVG graph snapshot 继续作为 supported `graph_snapshot` asset，可被未来 writer 引用；valid XML/SVG、无 remote resource/script/foreignObject 的约束在既有 SVG test 和 docs 中可追溯。

明确不做逐项核对：

- [x] 未新增 PDF/PPTX/CDX bytes writer。证据：`rg` 只显示 capability/docs/tests/spec 命中，`ExportFormat` 未扩展。
- [x] 未新增 PDF/PPTX/CDX Web checkbox、download link 或 browser persistence。证据：Web capability/persistence tests。
- [x] 未引入 Playwright、WeasyPrint、ReportLab、python-pptx、Open Babel、RDKit、ChemScript、ChemDraw 或 Revvity 运行时依赖；本 feature 只做调研引用和文档边界。
- [x] 未把 HTML preview screenshot 当作 PDF/PPTX 正式报告输出；docs/user 与 docs/dev 均明确禁止该路线。
- [x] 未降低或替换现有 CDXML writer；CDXML 仍是 supported energy diagram writer。

挂载点反向核对：

- [x] 挂载点为 design/checklist/acceptance、core/Web guard tests、docs/dev、docs/user、architecture、roadmap。grep 命中均落在这些范围内或既有 CDXML/SVG/export 能力内。
- [x] 拔除沙盘推演：删除本 feature 目录、测试新增断言、docs/architecture boundary 段落和 roadmap done 回写后，本 feature 的 boundary 工作消失；runtime supported writer 不受影响。

## 3. 验收场景核对

- [x] S1：core 查询 capability table 包含 `pdf/pptx/cdx`，但 supported set 仍为 `png/cdxml/xlsx/csv/svg`。证据：`tests/test_report_export_baseline.py::test_export_contracts_and_input_validation`。
- [x] S2：core 请求 `pdf/pptx/cdx` 返回 `invalid_input target=formats`，`details.supported` 不包含它们。证据：同一 Python 测试。
- [x] S3：Web `reportExportFormats()` 默认不包含 `pdf/pptx/cdx`。证据：`web/src/app/exportFormatCapabilities.test.ts`。
- [x] S4：Web persistence 收到 unsupported `pdf/pptx/cdx` artifact projection 时不写 `exports/...`，不写 `export-artifacts-v1` record。证据：`web/src/app/exportArtifactPersistence.test.ts`。
- [x] S5：开发者文档说明 PDF/PPTX/CDX 的候选依赖、当前不支持原因、未来进入条件和 dependency error 语义。证据：`docs/dev/report-export-artifacts.md` 的 Delivery Format Boundary 节。
- [x] S6：用户文档 FAQ 说明当前可导出 PNG/CDXML/XLSX/CSV/SVG，CDXML 是当前 ChemDraw 路径，PDF/PPTX/CDX 暂不可下载。证据：`docs/user/report-export-artifacts.md`。
- [x] S7：后续 writer feature 必须从 `ReportDocument` / `ReportAsset` 输入开始，并定义 extension、MIME、writer_id、metadata、persistence path 和 warning semantics。证据：design、docs/dev、architecture/core-platform。

前端浏览器验证：本 feature 只改 Web helper tests 和文档，不改 UI 组件、布局、画布或报告预览视觉；未运行浏览器肉眼验证。

## 4. 术语一致性

- Delivery Format Boundary、Delivery Writer、Unsupported Capability、Dependency Failure、SVG Asset Reuse 均在 design 中定义；architecture/docs 使用 Delivery Format Boundary / Delivery Writer 口径一致。
- `ReportDocument` / `ReportAsset` 仍作为 future delivery writer 输入，不改现有 `ReportExportService` writer 名词。
- `rg` 核对显示 `pdf/pptx/cdx` 只作为 unsupported capability、guard tests、docs/architecture/spec 和既有 CDXML/CDX 边界出现，没有进入 `ExportFormat` supported union。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：术语表新增 Delivery Format Boundary / Delivery Writer；Report Composer Manifest 段补充 unsupported/dependency error 分界。
- [x] `.codestable/architecture/core-platform.md`：Report Export 稳定协议补 Delivery Format Boundary；约束节记录 PDF/PPTX/CDX 的进入条件和当前 unsupported 状态。
- [x] `docs/dev/report-export-artifacts.md`：新增 Delivery Format Boundary 节，说明 PDF/PPTX/CDX 依赖边界、SVG 复用边界和 future writer 准入 checklist。
- [x] `docs/user/report-export-artifacts.md`：用户 FAQ 更新当前可导格式、CDXML/CDX 区别、PDF/PPTX/CDX 暂不可下载。
- [x] `.codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-roadmap.md`：子 feature 清单和推进顺序同步 boundary done。

## 6. requirement 回写

方案 frontmatter `requirement: null`。本 feature 固定交付格式边界和后续准入条件，不新增用户可操作的导出格式或 UI；用户文档只说明边界，因此不新建 requirement。后续 PDF/PPTX/CDX writer 或完整报告导出 UI 落地时再回写用户需求。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-items.yaml`：`delivery-format-boundary-spike` 已从 `in-progress` 改为 `done`，feature 指向 `2026-06-02-delivery-format-boundary-spike`。
- [x] `.codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-roadmap.md`：主文档第 2 / 5 / 6 节同步为 boundary done，下一步只剩 `report-preview-delivery-qa-guides`。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新环境、命令或工作流约束。现有 AGENTS.md 中关于 Web 预览从 `web/` 运行、前端视觉改动需浏览器验证、以及常用 Python/Web 验证命令的规则仍适用。

## 9. 遗留

- PDF/PPTX/CDX writer 仍未实现，符合本 feature 的明确不做。
- PDF 后续需先决策 HTML/print renderer 或 direct PDF layout，以及本地/CI/Vercel 可用性。
- PPTX 后续需先定义 slide size、editable table/image/diagram 策略和 SVG 嵌入/栅格化策略。
- CDX 后续需可靠 writer/converter、license、平台可用性和 ChemDraw 兼容回归。
- 下一 roadmap item 是 `report-preview-delivery-qa-guides`，用于收口测试、文档和 bundle/persistence 回归。
