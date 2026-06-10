# Import Preview Parser Regression 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-16
> 关联方案 doc：.codestable/features/2026-05-16-import-preview-parser-regression/import-preview-parser-regression-design.md

## 1. 接口契约核对

对照方案第 2.1 节，本 feature 没有新增 runtime 类型或 API，只新增测试侧 preview projection 对比规则。`tests/test_import_preview_parser_regression.py` 已按方案加载 `tests/fixtures/parsers/manifest.yaml` 和对应 `parser-golden-v1` snapshot，构造临时 Project Directory，并通过 `ImportRegistryWorkflow.import_files` 与 `PlatformShellService(import.preview)` 验证 preview 保真。

接口示例核对通过：成功/partial fixture 会进入 `ImportItem.status=needs_confirmation`，并核对 `preview.parser_id`、`preview.parser_version`、`preview.object_count`、preview/item warning codes、`preview.raw_resource_id` 和 `parse_result.provenance.source_file_id`；expected failure fixture 会进入 `failed`，保留 `raw_resource`，`preview=None`，并暴露 snapshot 里的 `error.code`。

流程图核对通过：manifest fixture → temporary project → `ImportRegistryWorkflow.import_files` → success preview / expected failure error → snapshot comparison 的路径已有单测；Platform Shell `import.preview` → JSON-safe batch summary 的路径也已有单测。

## 2. 行为与决策核对

需求摘要已落地：parser fixture corpus 已驱动导入预览层回归，确认 supported/partial fixture 通过 Import Workflow 后保留 parser provenance、warnings、object_count 和 raw resource linkage；parser failure fixture 保留 error code 和 raw resource。

关键决策已落地：测试从现有 fixture corpus 读取输入，没有新增 fixture 或 snapshot；主验证面是 `ImportRegistryWorkflow.import_files`；`xyz-bad-atom-count` 纳入 expected failure；Platform Shell 只验证 JSON 投影；主流程不调用确认登记。

范围守护已核对：本 feature 没有修改 runtime parser modules、ParserRegistry、ImportRegistryWorkflow public API 或 PlatformShellService command set；没有新增 UI、CLI command、Web route、Project Content schema 或持久化能力；测试哨兵确认 import preview 路径不调用 `ChemicalRegistry.register`、graph、energy、export 或 bundle 服务。

挂载点核对通过：本 feature 的代码挂载点只有 `tests/test_import_preview_parser_regression.py`，流程挂载点是本 feature 的 design/checklist/acceptance 与 architecture/roadmap 回写。删除测试文件和 CodeStable 产物后，该回归能力从系统视角消失，不影响 runtime API。

## 3. 验收场景核对

- S1 supported / partial parser fixture 进入 `needs_confirmation`：`test_workflow_preview_preserves_parser_fixture_snapshot_fields` 通过。
- S2 preview parser metadata 与 provenance 一致：同上。
- S3 preview object_count 等于 golden snapshot：同上。
- S4 preview warning codes 等于 snapshot 顶层 warning_codes：同上。
- S5 raw_resource/provenance linkage 一致：同上。
- S6 Preview-only import 不登记 ChemicalObject：workflow 与 shell tests 均断言 registry/session objects 为空。
- S7 `xyz-bad-atom-count` expected failure：`test_workflow_preview_preserves_expected_parser_failure` 通过。
- S8 Platform shell success + failure batch JSON-safe：`test_platform_shell_import_preview_projects_success_and_failure_items` 通过，并调用 `json.dumps(payload)`。
- S9 Shell summary 保留 preview/error/warnings/raw_resource：同上。
- S10 缺少 source_path / 无效 session 既有错误行为：同上，均返回 `invalid_input`。

## 4. 术语一致性

术语与方案一致：测试文件使用 `Import Preview Parser Regression` 对应的 preview-only regression 语义；`Preview Fidelity` 覆盖 parser metadata、object_count、warning/error codes 和 raw resource/provenance linkage；`Shell Preview Projection` 只用于 Platform Shell batch summary。

防冲突核对通过：没有新增 runtime class/function 概念；测试哨兵 `_PreviewOnlyRegistry`、`_NoGraphService`、`_NoEnergyEngine`、`_NoExportService`、`_NoBundleService` 只表达方案里的范围守护，不进入业务模块。

## 5. 架构归并

- `.codestable/architecture/ARCHITECTURE.md`：已补 Parser Fixture Corpus 的 import preview 保真用途，并新增 Import Preview Parser Regression 的关键架构决定。
- `.codestable/architecture/core-platform.md`：已补 tags、Import Registry Workflow 当前能力、边界说明、模块职责和稳定协议，说明该回归是测试侧能力，不新增 runtime API。
- `AGENTS.md`：本 feature 没有暴露需要新增的项目级硬约束。

## 6. Requirement 回写

本 feature 是测试覆盖增强，不新增用户可见导入行为、端侧命令或项目持久化能力，因此不新增 requirement。后续 `parser-corpus-docs` 或真实导入支持边界对外化时，再 backfill parser/import format support requirement 更合适。

## 7. Roadmap 回写

已将 `.codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-items.yaml` 中 `import-preview-parser-regression` 从 `in-progress` 改为 `done`，并同步更新 roadmap 主文档第 5/6/7 节。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的内容。现有 parser/import/graph/energy/export 解耦约束已经覆盖本次范围守护。

## 9. 遗留

- 下一步 roadmap item 是 `parser-corpus-docs`。
- 真实 Gaussian/ORCA/MAPLE fixture coverage 与真实版本支持边界仍待补。
- 当前 import preview regression 只验证 fixture-backed synthetic/reference-only corpus，不声明真实程序版本完整支持。
