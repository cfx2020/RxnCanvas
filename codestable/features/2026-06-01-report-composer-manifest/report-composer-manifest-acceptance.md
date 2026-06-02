# report-composer-manifest 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-01
> 关联方案 doc：`codestable/features/2026-06-01-report-composer-manifest/report-composer-manifest-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层：

- [x] `ReportAsset` / `ReportSection` / `ReportDocument` / `ReportComposerRequest` 已落地在 `rxnflow/report_manifest.py`，字段与 design 一致；`ReportAsset` 没有 `bytes` 字段。
- [x] `ReportComposerService.compose(request) -> Result[ReportDocument]` 已落地，输入可包含 profile、table_rows、runtime artifacts 和 artifact_records。
- [x] `report_document_to_dict()` 已提供 JSON-safe manifest 投影，warnings 会转为 `{code, message, target}` 对象列表。
- [x] 方案示例的 section 顺序已由 `REPORT_SECTION_ORDER` 与 `tests/test_report_manifest.py::test_composer_builds_json_safe_document_from_existing_artifacts` 固定。

流程图核对：`Existing profile / table rows / export artifacts -> ReportComposerService.compose -> ReportDocument` 的落点分别是 `ReportComposerRequest`、`_build_assets()`、`_build_sections()` 和 `ReportDocument`。

## 2. 行为与决策核对

- [x] 需求摘要：core 侧现在能把已有 energy diagram、energy table、graph snapshot 和 artifact metadata 组合成 `ReportDocument`。
- [x] 关键决策：manifest contract 放在独立 `rxnflow.report_manifest` module，未继续膨胀 `rxnflow.export` writer module。
- [x] `ReportAsset` 是 JSON-safe reference，runtime bytes 仍在 `ExportArtifact.bytes` 或 `exports/...` 文件中；测试显式断言 `ReportAsset` 无 bytes。
- [x] 首轮不新增 Web UI、checkbox、Shell command、Project Content section 或 PDF/PPTX/HTML/CDX writer；grep 命中只在 core module、tests、docs、CodeStable 文档和 roadmap。
- [x] 错误语义：非 JSON-safe metadata 返回 `invalid_input`，缺 profile/table/graph snapshot 进入 warnings / unavailable section，不让 compose 失败。
- [x] 幂等性：重复 compose 同一输入时 document id、section ids、asset ids 和 section order 稳定。
- [x] 挂载点反向核对：本 feature 的实际挂载点为 `rxnflow.report_manifest`、`rxnflow.export` metadata JSON-safe 小修、`tests/test_report_manifest.py`、`tests/test_report_export_baseline.py`、report export docs 和 CodeStable 文档，均在 design 第 2.3 节范围内或属于 acceptance 回写。

拔除沙盘推演：删除 `rxnflow/report_manifest.py`、`tests/test_report_manifest.py`、docs 中的 Report Composer Manifest 段落、roadmap item 状态和 checklist/acceptance 文档后，本 feature 在 runtime 侧消失；`rxnflow.export` 的 `warnings` list 小修仍是 JSON-safe metadata 兼容改动，不引入新 composer 依赖。

## 3. 验收场景核对

- [x] S1：profile + PNG/CDXML + CSV/XLSX + SVG artifacts -> `ReportDocument` 含 summary、graph、energy_profile、energy_table、artifacts、warnings sections，assets 指向已有 artifact ids。证据：`tests/test_report_manifest.py::test_composer_builds_json_safe_document_from_existing_artifacts`。
- [x] S2：runtime artifact + `ExportArtifactRecord` checksum -> `ReportAsset` 合并 project-relative path/checksum/metadata，不复制 bytes。证据：`test_artifact_record_merges_path_checksum_and_metadata_without_copying_bytes`。
- [x] S3：只有 profile、无 table/snapshot artifacts -> compose 成功，graph/table section unavailable，warnings 记录缺失，不生成假 asset。证据：`test_missing_artifacts_are_unavailable_warnings_without_fake_assets`。
- [x] S4：profile warnings + artifact metadata warnings -> 去重并保留 code/message/target。证据：`test_profile_and_artifact_warnings_are_deduplicated`。
- [x] S5：非 JSON-safe metadata -> `invalid_input`，target 含 metadata，不过滤进 dataclass。证据：`test_non_json_safe_metadata_is_rejected`。
- [x] S6：重复 compose -> ids 和 order 稳定。证据：`test_repeated_compose_keeps_stable_ids_and_order`。
- [x] S7：future writer 只拿 `ReportDocument` 就能知道报告结构。证据：`report_document_to_dict()` 输出 sections/assets/metadata/warnings 的 JSON-safe dict，测试用 `json.dumps(..., allow_nan=False)` 验证。

前端验证：本 feature 没有前端 UI/画布/报告预览视觉改动，未运行浏览器验收。

## 4. 术语一致性

- Report Composer Manifest、ReportDocument、ReportSection、ReportAsset、ReportComposerRequest、ReportComposerService 在代码、design、docs 和 architecture 中一致。
- `ReportAsset` 命名已从 roadmap 中“带 bytes 的运行时资产”收敛为 manifest reference；带 bytes 的运行时输出继续使用 `ExportArtifact`。
- `rg` 核对显示新术语只出现在 `rxnflow.report_manifest`、tests、docs、feature spec 和 roadmap/architecture 回写中。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：术语表新增 Report Composer Manifest、ReportDocument、ReportSection、ReportAsset；核心平台索引和关键架构决定补充 composer manifest 边界。
- [x] `codestable/architecture/core-platform.md`：模块清单新增 `rxnflow.report_manifest`；Report Export 稳定协议新增 composer request/document/section/asset/to_dict；约束节记录 no bytes、no Project Content、no Shell command、no writer。
- [x] `docs/dev/report-export-artifacts.md`：新增 Report Composer Manifest 使用示例、核心概念和边界；说明 `ReportDocument` 是内部 manifest，不是可下载完整报告。
- [x] `docs/user/report-export-artifacts.md`：FAQ 保持用户视角边界，说明完整报告文件仍不可导出。

## 6. requirement 回写

方案 frontmatter `requirement: null`。本 feature 是 core 内部 composer manifest，不新增用户可直接操作的 Web/CLI 能力；用户文档只补边界说明，因此不新建 requirement。后续 delivery writer 或 Web composer UI 落地时再回写用户需求。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-items.yaml`：`report-composer-manifest` 已从 `in-progress` 改为 `done`，feature 指向 `2026-06-01-report-composer-manifest`。
- [x] `codestable/roadmap/rxnflow-report-preview-delivery/rxnflow-report-preview-delivery-roadmap.md`：主文档第 4.3 / 4.5 节已修正 `ReportAsset` 命名边界；子 feature 清单和推进顺序已同步为 done / 下一步 delivery-format-boundary-spike。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的环境、命令或工作流约束。现有 AGENTS.md 中的 CodeStable、frontend browser verification 和常用 Python/Web 验证命令仍适用。

## 9. 遗留

- PDF/PPTX/HTML/CDX writer 仍未实现，下一 roadmap item `delivery-format-boundary-spike` 处理依赖和错误边界。
- ReportDocument 还不写入 Project Content，也没有 Shell command / Web UI 入口；这符合本 feature 的明确不做。
- 组合报告未来的用户模板、logo、作者、机构和章节排序仍属于后续 report composer UI/template feature。
