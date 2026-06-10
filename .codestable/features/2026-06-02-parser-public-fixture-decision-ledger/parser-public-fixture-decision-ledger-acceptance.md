---
doc_type: feature-acceptance
feature: 2026-06-02-parser-public-fixture-decision-ledger
status: accepted
summary: 验收 parser public fixture decision ledger 和测试侧 promotion gate
tags: [parser, fixture-corpus, public-fixtures, decision-ledger, license-gate]
---

# parser-public-fixture-decision-ledger 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-02
> 关联方案 doc：.codestable/features/2026-06-02-parser-public-fixture-decision-ledger/parser-public-fixture-decision-ledger-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `tests/fixtures/parsers/public-fixture-decisions.yaml` 已新增，schema version 为 `parser-public-fixture-decisions-v1`。
- [x] `PARSER_PUBLIC_FIXTURE_DECISIONS_SCHEMA_VERSION`、`PUBLIC_FIXTURE_DECISIONS`、`PUBLIC_FIXTURE_PROMOTIONS` 已落地在 `tests/parser_fixture_harness.py`。
- [x] `ParserPublicFixtureDecisionEvidence`、`ParserPublicFixtureDecision`、`ParserPublicFixtureDecisionLedger` 已落地，并保持测试侧 dataclass 边界。
- [x] `load_parser_public_fixture_decisions(path, source_inventory=None, manifest=None)` 已落地，返回 ledger，并提供 `decision_by_id`、`decision_for`、`source_file_keys` 查询能力。
- [x] loader 校验 decision/promotion enum、重复 id、重复 source/file、source/file 归属、fallback fixture id、reference-only anchor、`promoted`/`allowed` 和 blocked anchor 组合。

流程图核对通过：`sources.yaml` file facts 和 `manifest.yaml` fixture ids 进入 `public-fixture-decisions.yaml`，再由 `load_parser_public_fixture_decisions` 做 schema 和 cross-link guards。future promotion feature 可在此基础上要求 `allowed/promoted` 后再 vendor。

## 2. 行为与决策核对

需求摘要已落地：decision ledger 覆盖当前 `sources.yaml` 全部 26 个 file ids，MAPLE/cclib-data review-required candidates 均未 promoted，ASE extxyz project-authored vendored fixtures 记录为 `allowed/promoted`。

明确不做核对：

- [x] 未 vendor MAPLE、cclib-data 或任何新的第三方 public output 文件。
- [x] 未新增 executable fixture、golden snapshot 或 support matrix `fixture_ids`。
- [x] 未修改 parser runtime、ImportRegistryWorkflow、Platform Shell、Web UI 或报告导出。
- [x] 未运行外部计算任务。
- [x] 未把 review-required candidate 标成 `allowed/promoted`。
- [x] 未改变 `parser-source-inventory-v1` / `parser-fixtures-v1` / `parser-support-matrix-v1` schema version。
- [x] 普通 tests 不访问网络或外部 clone。

关键决策已落地：

- [x] decision 独立于 `sources.yaml`，source inventory 继续记录来源事实，decision ledger 记录项目选择。
- [x] 首轮覆盖当前 source inventory 全部 file ids，后续 promotion 不会遇到当前文件无决策的空洞。
- [x] `allowed/promoted` 是唯一可 vendor 原件的组合，loader 拒绝 `promotion=promoted` 且 `decision!=allowed`。
- [x] blocked 决策必须有 fallback 或 reference anchor，loader 拒绝无 anchor 的 blocked 状态。
- [x] loader/dataclass 只在 `tests/parser_fixture_harness.py`，不扩展 runtime。

挂载点核对通过：实际挂载点为 `tests/fixtures/parsers/public-fixture-decisions.yaml`、`tests/parser_fixture_harness.py`、`tests/test_parser_fixture_harness.py`、`docs/dev/parser-fixture-corpus.md`、architecture/roadmap/acceptance CodeStable 文档。反向 grep 未发现 runtime parser、Import Workflow、Project Content、Web UI、report export、fixture files 或 snapshots 挂载。

## 3. 验收场景核对

- [x] S1 `public-fixture-decisions.yaml` 存在且 schema 正确。证据：YAML validation 和 `test_public_fixture_decision_ledger_loads_and_covers_source_inventory`。
- [x] S2 ledger 覆盖当前 `sources.yaml` 全部 file ids。证据：单测断言 `ledger.source_file_keys()` 等于 inventory source/file set；独立脚本核对 26/26，无 missing/extra。
- [x] S3 MAPLE candidates 不为 `allowed/promoted`，并带 fallback/reason。证据：`test_public_fixture_decision_ledger_blocks_maple_and_cclib_candidates`。
- [x] S4 cclib-data candidates 不为 `allowed/promoted`，保持 `needs-permission/blocked`。证据：同上。
- [x] S5 MAPLE path/frequency/MD/scan reference-only files 保持 `reference-only/not-applicable`。证据：`test_public_fixture_decision_ledger_keeps_reference_files_unpromoted`。
- [x] S6 ASE project-authored vendored files 为 `allowed/promoted`，reason 明确不是第三方 public original。证据：`test_public_fixture_decision_ledger_allows_project_authored_extxyz`。
- [x] S7 loader 能加载 current ledger，并按 source id / file id 查询。证据：`test_public_fixture_decision_ledger_loads_and_covers_source_inventory`。
- [x] S8 loader 拒绝未知 source、未知 file、file/source mismatch。证据：对应 `test_public_fixture_decision_loader_rejects_*` 单测。
- [x] S9 loader 拒绝未知 fallback fixture id。证据：`test_public_fixture_decision_loader_rejects_unknown_fallback_fixture_id`。
- [x] S10 loader 拒绝 unknown decision / promotion enum。证据：`test_public_fixture_decision_loader_rejects_unknown_decision_and_promotion`。
- [x] S11 loader 拒绝 promoted without allowed。证据：`test_public_fixture_decision_loader_rejects_promoted_without_allowed`。
- [x] S12 loader 拒绝 blocked without fallback/reference anchor。证据：`test_public_fixture_decision_loader_rejects_blocked_without_anchor`。
- [x] S13 docs 明确 ledger 不 vendor 文件、不新增 runtime parser 支持、普通 tests 不访问网络。证据：`docs/dev/parser-fixture-corpus.md` Public Fixture Decision Ledger section。
- [x] S14 scope guard 证明未新增 MAPLE/cclib-data third-party files、未新增 manifest `vendored-third-party` source。证据：`git diff -- tests/fixtures/parsers/manifest.yaml tests/fixtures/parsers/support-matrix.yaml tests/fixtures/parsers/files tests/fixtures/parsers/snapshots` 无输出；manifest scan 返回 `vendored_third_party_fixture_ids []`。

本 feature 无前端改动，无需浏览器验证。

## 4. 术语一致性

- Public Fixture Decision Ledger：YAML、harness、tests、developer guide、architecture 和 roadmap 口径一致。
- Public Fixture Decision / Decision Evidence / Decision State / Promotion State / Fallback Fixture：方案第 0 节术语均有对应代码或文档落点。
- 防冲突：新增概念只出现在测试 harness、fixture corpus 文档、CodeStable 文档和 architecture；未进入 `rxnflow.parsers` runtime API。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已在术语表补 Public Fixture Decision Ledger，并在关键架构决定中补 decision ledger 的测试侧 promotion gate、coverage 和 runtime 边界。
- [x] `.codestable/architecture/core-platform.md`：已补 tags、Parser Fixture Harness 当前能力、模块职责和待补项，说明 decision ledger loader/guard 只在测试侧，runtime 不变。
- [x] `docs/dev/parser-fixture-corpus.md`：已补 decision ledger 维护入口、状态枚举、promotion guard、普通测试 no-network 边界和常用 YAML 校验命令。

## 6. requirement 回写

本 feature 是测试侧 parser fixture corpus gate，不新增用户可见导入行为、端侧命令、项目持久化能力或 runtime parser 支持。方案 frontmatter `requirement: null`，无需新增 requirement。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-items.yaml` 已将 `parser-public-fixture-decision-ledger` 从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-roadmap.md` 第 5 节子 feature 清单已同步为 `done`，并写入对应 feature id。

## 8. AGENTS.md / CLAUDE.md 候选盘点

无候选。本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新环境、命令或工作流规则；现有项目约束已覆盖 parser/runtime 解耦、第三方 fixture 不自动 vendor 和测试无网络边界。

## 9. 遗留

- 下一步 roadmap item 是 `parser-public-candidate-fetch-verify`，提供 dev-only fetch/hash verify workflow。
- MAPLE/cclib-data public originals 仍未 vendor；当前均需 permission/review 或保持 reference-only。
- 后续 promotion adapter 需要在 manifest/source metadata/snapshot/support matrix 层统一校验 `allowed/promoted` 文件的 `decision_id`。
