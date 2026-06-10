---
doc_type: feature-acceptance
feature: 2026-06-03-public-fixture-import-preview-regression
status: accepted
summary: 验收 promoted public/user-redacted fixtures 的 Workflow/Shell import.preview 回归、preview-only guard、blocked/reference-only guard 和 roadmap/architecture 回写
tags: [parser, fixture-corpus, public-fixtures, import-preview, platform-shell, regression]
---

# public-fixture-import-preview-regression 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-03
> 关联方案 doc：.codestable/features/2026-06-03-public-fixture-import-preview-regression/public-fixture-import-preview-regression-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `_promoted_preview_fixtures()` 已落地在 `tests/test_import_preview_parser_regression.py`，加载 manifest、source inventory、decision ledger、support matrix，并调用 `summarize_parser_public_fixture_promotion`。
- [x] helper 返回值来自 `summary.covered_fixture_ids`；`inspect.getsource` guard 证明 helper 未手写当前 extxyz fixture id。
- [x] `summary.unresolved_decision_ids` 与 `summary.unresolved_fixture_ids` 被断言为空。
- [x] 当前 promoted preview fixtures 为 4 个 `ase-extxyz-project-authored` project-authored promoted fixtures。

流程图核对通过：Fixture Promotion Adapter summary 派生 promoted fixtures，分别进入 `ImportRegistryWorkflow.import_files` 和 Platform Shell `import.preview`，再由 Workflow/Shell projection assertions 与 preview-only guards 验证。

## 2. 行为与决策核对

需求摘要已落地：promoted fixture set 明确接入 import preview regression，Workflow 和 Platform Shell 都覆盖 promoted fixtures；MAPLE/cclib-data blocked/reference-only public originals 不进入 promoted preview fixture set。

明确不做核对：

- [x] 未新增 fixture files、source inventory entries、decision ledger entries、snapshots 或 support matrix entries。
- [x] 未 vendor MAPLE/cclib-data/ASE public originals，也未新增 user-redacted 输出。
- [x] 未修改 parser runtime、parser adapter、ChemicalRegistry、ReactionGraph、EnergyProfile、report export、Platform Shell command contract 或 Web UI。
- [x] 未确认导入、不登记 ChemicalObject、不保存 confirmed import ledger。
- [x] 普通 tests 不访问网络。

关键决策已落地：

- [x] promoted preview fixture ids 来自 `ParserPublicFixturePromotionSummary.covered_fixture_ids`，没有第二份 promoted fixture 清单。
- [x] 现有 all-executable fixture preview regression 保留，新增 focused promoted public path tests。
- [x] Workflow 和 Shell preview 都有 promoted fixture 覆盖。
- [x] blocked/reference-only MAPLE/cclib-data source file ids 通过反向 guard 排除。
- [x] runtime 无变化，改动集中在测试和 CodeStable 验收/架构/roadmap 文档。

挂载点核对通过：实际挂载点为 `tests/test_import_preview_parser_regression.py`、本 checklist/acceptance、`.codestable/architecture/ARCHITECTURE.md`、`.codestable/architecture/core-platform.md` 和 roadmap 回写。scope diff 证明未挂入 parser runtime、Import Workflow implementation、Platform Shell implementation、Web UI、report export 或 fixture corpus 数据文件。

## 3. 验收场景核对

- [x] S1/S2/S3：`_promoted_preview_fixtures` 从 Fixture Promotion Adapter summary 派生，当前只返回 4 个 extxyz project-authored promoted fixtures，summary unresolved 为空。证据：`test_promoted_preview_fixtures_are_selected_from_promotion_adapter`。
- [x] S4/S5：Workflow preview 对每个 promoted fixture 保留 parser metadata、object_count、warnings、raw resource/provenance linkage，且 registry 仍为空。证据：`test_workflow_preview_preserves_promoted_public_fixture_projection`。
- [x] S6/S7：Platform Shell `import.preview` 对每个 promoted fixture 返回 JSON-safe payload，保留 raw_resource、parser metadata、object_count 和 warnings，并通过 `_PreviewOnlyRegistry` / `_NoGraphService` / `_NoEnergyEngine` / `_NoExportService` / `_NoBundleService` 守住 preview-only。证据：`test_platform_shell_import_preview_projects_promoted_public_fixtures`。
- [x] S8/S9：MAPLE/cclib-data blocked candidate 与 reference-only file ids 不进入 promoted preview fixture ids。证据：`test_promoted_preview_regression_excludes_blocked_and_reference_only_sources`。
- [x] S10：Existing all-executable fixture preview regression 保留，不被删除或降级。证据：`test_workflow_preview_preserves_parser_fixture_snapshot_fields` 和 `test_platform_shell_import_preview_projects_executable_fixture_snapshots` 仍存在并通过。
- [x] S11：scope guard 证明未修改 parser runtime、Import Workflow implementation、Platform Shell implementation、Web UI 或 report export；也未新增 fixture/sources/decision/snapshot/support matrix 数据。

验证命令：

- [x] `python3 -m unittest tests.test_import_preview_parser_regression`
- [x] `python3 -m unittest discover`
- [x] `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-06-03-public-fixture-import-preview-regression/public-fixture-import-preview-regression-checklist.yaml --yaml-only`
- [x] `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-items.yaml --yaml-only`
- [x] `git diff --check`
- [x] `git diff -- rxnflow/parsers rxnflow/import_workflow.py rxnflow/platform.py rxnflow/export.py rxnflow/models.py web tests/fixtures/parsers`

本 feature 无前端改动，无需浏览器验证。

## 4. 术语一致性

- Public Fixture Import Preview Regression / Promoted Preview Fixture / Preview Projection / Preview-only Discipline / Non-executable Public Source 在 design、测试和 architecture 中保持一致。
- `_promoted_preview_fixtures`、`covered_fixture_ids`、blocked/reference-only guard 的命名与 Fixture Promotion Adapter 口径一致。
- 防冲突：grep 命中集中在测试和 CodeStable 文档；未把 promoted preview regression 变成 runtime parser API 或 UI 能力。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已把 Import Preview Parser Regression 更新为同时覆盖全量 executable regression 和 promotion-adapter-driven promoted fixture focused regression。
- [x] `.codestable/architecture/core-platform.md`：已把 `tests/test_import_preview_parser_regression.py` 职责补充为包含 promoted fixture selector、Workflow/Shell preview coverage 和 blocked/reference-only guard。
- [x] `AGENTS.md` 不需要更新：现有规则已覆盖普通测试 no-network、parser/runtime/UI 解耦和第三方 public output 不自动 vendor。

## 6. requirement 回写

本 feature 是测试侧 regression 和 CodeStable 归档能力，不新增用户可见导入行为、端侧命令、项目持久化能力、runtime parser 支持或 UI。方案 frontmatter `requirement: null`，无需新增 requirement。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-items.yaml` 已将 `public-fixture-import-preview-regression` 从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-roadmap.md` 第 5 节子 feature 清单已同步为 `done`，并写入当前 promoted preview regression 结论。

## 8. AGENTS.md / CLAUDE.md 候选盘点

无候选。本 feature 没有新增每个 feature 都会复用的环境命令、远程规则或工具约定；现有 `AGENTS.md` 已覆盖相关边界。

## 9. 遗留

- 后续 roadmap item 是 `parser-public-fixture-guides`，需要把 public fixture intake gate、promotion/rejection、reference-only 和贡献真实样例流程同步到开发者/用户指南。
- 当前 promoted set 仍是 4 个 project-authored extxyz fixtures；真实 third-party/user-redacted Gaussian/ORCA/MAPLE/extxyz outputs 进入 corpus 前仍必须另走 source policy、license/redaction 和 decision ledger。
- 本 feature 只覆盖 preview projection，不确认导入、不登记 ChemicalObject，也不新增 runtime parser API。
