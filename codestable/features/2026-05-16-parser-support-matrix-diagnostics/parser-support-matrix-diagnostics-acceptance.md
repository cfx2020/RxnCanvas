# Parser Support Matrix Diagnostics 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-16
> 关联方案 doc：codestable/features/2026-05-16-parser-support-matrix-diagnostics/parser-support-matrix-diagnostics-design.md

## 1. 接口契约核对

对照方案第 2.1 节，`tests/fixtures/parsers/support-matrix.yaml` 已按 `parser-support-matrix-v1` 落地，包含 `diagnostics.warning_codes`、`diagnostics.error_codes` 和 `entries`。`tests/parser_fixture_harness.py` 已新增 `ParserSupportMatrix`、`ParserSupportMatrixEntry`、`ParserDiagnosticCatalog` 和 `load_parser_support_matrix`，并保留 manifest/snapshot helper 的既有职责。

接口示例核对通过：support matrix entries 包含 program、formats、tasks、versions、parser_id、status、fields、fixture_ids、observed warning/error codes 和 known_limits；loader 会校验 schema version、entry status、field status、fixture id 引用、diagnostic code 引用和 partial known_limits。

流程图核对通过：manifest、snapshots 和 support matrix 都进入测试侧 consistency validation；输出证据分别是 fixture id 覆盖、diagnostic code 定义和 partial limits 校验。

## 2. 行为与决策核对

需求摘要已落地：support matrix 覆盖当前 XYZ/extxyz、Gaussian、ORCA、MAPLE fixture corpus，并把 MAPLE `.sum`、AutoNEB tree JSON、MD thermo artifact 标为 reference-only。

关键决策已落地：support matrix 位于 `tests/fixtures/parsers/support-matrix.yaml`；loader 位于 `tests/parser_fixture_harness.py`；全部 9 个 manifest fixture ids 被 matrix 覆盖；partial entry 都有 known_limits；observed warning/error codes 都要求先在 catalog 中定义。

范围守护已核对：本 feature 的挂载点只在 support matrix YAML、fixture harness/test、CodeStable 文档和 roadmap/architecture 回写；没有新增产品 UI、CLI、Web route、ProjectStore/ImportRegistryWorkflow/ChemicalRegistry/ReactionGraph/Energy/Export 调用，也没有新增第三方真实 fixture 下载流程。当前工作树里的 runtime parser module 修改属于前序 format coverage feature，不是本 feature 的新增挂载点。

## 3. 验收场景核对

- S1 support matrix 文件和 schema：通过 `python3 codestable/tools/validate-yaml.py --file tests/fixtures/parsers/support-matrix.yaml --yaml-only` 与单测确认。
- S2 manifest fixture id 覆盖：`test_support_matrix_loads_and_covers_fixture_manifest` 通过。
- S3 supported/partial/reference-only fixture 约束：`load_parser_support_matrix` 校验通过。
- S4 partial known_limits：`load_parser_support_matrix` 校验通过。
- S5 diagnostic catalog：`test_support_matrix_catalogs_snapshot_warning_and_error_codes` 通过。
- S6 snapshot codes 都有 catalog 定义：`test_support_matrix_catalogs_snapshot_warning_and_error_codes` 通过。
- S7 MAPLE reference-only artifacts 不进入 executable fixture：`test_support_matrix_reference_only_artifacts_are_not_executable` 通过。
- S8 bad schema version：`test_support_matrix_loader_rejects_bad_schema_version` 通过。
- S9 unknown fixture id：`test_support_matrix_loader_rejects_unknown_fixture_id` 通过。
- S10 undefined diagnostic code：`test_support_matrix_loader_rejects_undefined_diagnostic_code` 通过。

## 4. 术语一致性

核心术语一致：`Parser Support Matrix` 对应 `support-matrix.yaml` 和 `ParserSupportMatrix`；`Diagnostic Code Catalog` 对应 `ParserDiagnosticCatalog`；`Field Status` 对应 support matrix `fields` 校验；`Reference-only Artifact` 对应 MAPLE `.sum`、AutoNEB tree JSON 和 MD thermo entries。

禁用范围核对通过：support matrix 没有被写入 `rxnflow.parsers` runtime API，也没有被描述成真实版本完整支持矩阵。

## 5. 架构归并

- `codestable/architecture/ARCHITECTURE.md`：已补 Parser Support Matrix、Parser Diagnostic Catalog 术语，并把 Parser Fixture Corpus 现状更新为包含 support matrix 和 reference-only artifacts。
- `codestable/architecture/core-platform.md`：已补 Parser Fixture Harness 的 support matrix loader/dataclass/validation 形态，以及测试边界和 known limits。
- `AGENTS.md`：本 feature 没有新增需要项目级硬约束记录的内容。

## 6. Requirement 回写

本 feature 是测试/文档侧 parser support metadata，不改变用户可见导入行为、项目持久化 schema 或端侧命令。当前不新增 requirement；后续 `import-preview-parser-regression` 完成后再为 parser/import format support backfill 用户视角需求文档更合适。

## 7. Roadmap 回写

已将 `codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-items.yaml` 中 `parser-support-matrix-diagnostics` 从 `in-progress` 改为 `done`，并同步更新 roadmap 主文档第 5/6/7 节。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的内容。现有“parser 只做解析、不调用项目/图谱/导出服务”和“fixture corpus 不声明真实版本完整支持”的规则已经足够覆盖后续相邻工作。

## 9. 遗留

- 真实 Gaussian/ORCA/MAPLE fixture coverage 仍待补，进入仓库前需要脱敏和许可证确认。
- 当前 support matrix 只声明 synthetic/reference-only corpus，不声明真实程序版本完整支持。
- MAPLE `.sum`、AutoNEB tree JSON、MD thermo 和 path topology 仍未解析。
- 下一步 roadmap item 是 `import-preview-parser-regression`。
