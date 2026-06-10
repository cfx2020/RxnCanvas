---
doc_type: feature-acceptance
feature: 2026-06-02-maple-public-candidate-resolution
status: accepted
summary: 验收 MAPLE public candidate resolution 的测试侧 summary/guards、no-vendor 边界和 roadmap/architecture 回写
tags: [parser, fixture-corpus, public-fixtures, maple, source-inventory, license-gate]
---

# maple-public-candidate-resolution 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-02
> 关联方案 doc：.codestable/features/2026-06-02-maple-public-candidate-resolution/maple-public-candidate-resolution-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `ParserMaplePublicResolutionSummary` 已落地在 `tests/parser_fixture_harness.py`，字段为 `source_id`、`candidate_file_ids`、`reference_file_ids`、`promoted_file_ids`、`blocked_candidate_file_ids`、`fallback_fixture_ids` 和 `unresolved_file_ids`。
- [x] `summarize_maple_public_candidate_resolution(source_inventory, decision_ledger, support_matrix, source_id="maple-dev-example")` 已落地，输入和默认 source id 与设计一致。
- [x] helper 从 `ParserSourceInventory` 派生 candidate/reference file ids，从 `ParserPublicFixtureDecisionLedger` 派生 promoted/blocked/fallback/reference anchor 状态，从 `ParserSupportMatrix` 交叉检查 MAPLE source files 是否都被 matrix 覆盖。
- [x] `source_id` 非 MAPLE source 时抛 `AssertionError`，缺 decision、candidate 无 fallback、reference-only 无 self anchor、support matrix 漏覆盖时进入 `unresolved_file_ids`。

流程图核对通过：`MAPLE ParserSourceInventory files -> Decision Ledger lookup -> Support Matrix cross-check -> MAPLE Resolution Summary -> focused guards` 均有实际落点，证据为 `summarize_maple_public_candidate_resolution` 和 `test_maple_public_resolution_*` 三个 focused tests。

## 2. 行为与决策核对

需求摘要已落地：MAPLE source inventory 中 `maple-dev-example` 的 3 个 candidate files 和 14 个 reference-only files 现在能派生为一份机检 summary；当前 promoted originals 为空，candidate 全 blocked with fallback，reference-only 全有 anchor，support matrix 不把 MAPLE public originals 放入 executable `fixture_ids`。

明确不做核对：

- [x] 未 vendor ClickFF/MAPLE public originals，未新增 MAPLE third-party file 到 `tests/fixtures/parsers/files/`。
- [x] 未把任何 MAPLE candidate decision 改成 `allowed/promoted`。
- [x] 未修改 `rxnflow.parsers.maple`，未新增 `.sum`、scan、MD、frequency、AutoNEB tree 或 path topology 解析。
- [x] 未生成 ReactionPath、TS candidate、direction/topology、energy profile 或 graph object。
- [x] 未修改 import workflow、Platform Shell、Web UI 或 report export。
- [x] 未运行 MAPLE 或任何外部计算任务。
- [x] 普通 unit tests 不访问网络或 GitHub clone。
- [x] 未把 `reference-only` 文件描述成 supported/executable fixture。

关键决策已落地：

- [x] Resolution summary 派生而非新事实源：未新增 MAPLE 决策 YAML，summary 从现有 inventory/ledger/matrix 派生。
- [x] 无授权则不 promotion：3 个 MAPLE candidates 仍为 `needs-permission/blocked`，`promoted_file_ids == ()`。
- [x] Reference-only 保持 reference-only：scan/path/MD/frequency 文件只通过 `reference_file_ids` 和 decision ledger self anchor 出现。
- [x] Fallback 是项目内 fixture：summary 中 fallback fixture 全存在于 manifest，且 `source.kind == "synthetic"`。
- [x] Parser runtime 不变：helper 只在 `tests/parser_fixture_harness.py`，未进入 `rxnflow.parsers` runtime API。

挂载点核对通过：实际挂载点为 `tests/parser_fixture_harness.py`、`tests/test_parser_fixture_harness.py`、`docs/dev/parser-fixture-corpus.md`、architecture/roadmap/acceptance CodeStable 文档。反向 grep 未发现 parser runtime、Import Workflow、Platform Shell、Web UI、report export、manifest、support matrix、fixture files、snapshots 或 decision ledger 被本 feature 修改。

## 3. 验收场景核对

- [x] S1 能从当前 `sources.yaml` / `public-fixture-decisions.yaml` / `support-matrix.yaml` 派生 `ParserMaplePublicResolutionSummary`。证据：`test_maple_public_resolution_summary_classifies_current_source_files`。
- [x] S2 summary 覆盖 `maple-dev-example` 全部 17 个 source file ids，无 missing/extra/unresolved。证据：同一单测断言 3 candidate + 14 reference-only 且 `unresolved_file_ids == ()`。
- [x] S3 candidate file ids 精确为 `maple-sp-output-example`、`maple-opt-output-example`、`maple-opt-final-xyz-example`。证据：同一单测逐字段断言。
- [x] S4 promoted file ids 为空。证据：同一单测断言 `promoted_file_ids == ()`。
- [x] S5 每个 MAPLE candidate 当前都是 blocked with fallback。证据：summary 断言 `blocked_candidate_file_ids == candidate_file_ids`，fallback set 覆盖三类 fallback。
- [x] S6 每个 MAPLE candidate fallback fixture 存在于 manifest 且 `source.kind == "synthetic"`。证据：同一单测逐 fixture lookup。
- [x] S7 每个 MAPLE reference-only file 保持 `reference-only/not-applicable` 并以自身 file id 作为 reference anchor。证据：现有 `test_public_fixture_decision_ledger_keeps_reference_files_unpromoted` 和 MAPLE resolution summary test。
- [x] S8 path-family reference files 可以有 `maple-path-family-synthetic-derived` fallback，但不得被描述为 ReactionPath/topology support。证据：`test_maple_path_family_support_matrix_declares_frame_only_boundary` 和 developer guide MAPLE Candidate Resolution section。
- [x] S9 `maple-output-public-candidates` 仍为 `candidate`，`fixture_ids` 为空。证据：`test_maple_public_resolution_support_matrix_keeps_public_originals_non_executable`。
- [x] S10 MAPLE reference entries 仍为 `reference-only`，`fixture_ids` 为空，reference file ids 与 source inventory 对齐。证据：同一 support matrix guard。
- [x] S11 MAPLE public-shape executable coverage 只指向项目内 synthetic-derived fallback fixtures。证据：同一 support matrix guard 和 `test_maple_public_shape_regression_uses_synthetic_derived_fixtures`。
- [x] S12 docs 明确当前无 promoted public originals、candidate blocked pending permission、scan/path/MD/frequency remain reference-only。证据：`docs/dev/parser-fixture-corpus.md` 的 MAPLE Candidate Resolution section。
- [x] S13 scope guard 证明未新增 MAPLE third-party files，未改 MAPLE parser runtime、Import Workflow、Platform Shell、Web UI 或 report export。证据：scope diff 无输出。

本 feature 无前端改动，无需浏览器验证。

## 4. 术语一致性

- MAPLE Candidate Resolution：设计、developer guide、acceptance 和 roadmap 均指测试侧逐文件 resolution 结论，不表示 runtime parser 能力扩展。
- MAPLE Resolution Summary：代码命名为 `ParserMaplePublicResolutionSummary` / `summarize_maple_public_candidate_resolution`，只存在于测试 harness。
- Blocked MAPLE Candidate / MAPLE Reference Anchor / MAPLE Fallback Fixture / MAPLE Promotion Outcome：测试断言和 docs 使用一致，均强调 no-promoted-originals、reference-only anchor 和 synthetic fallback。
- 防冲突：grep 命中只在测试 harness、测试文件、developer guide、CodeStable 文档和 roadmap；未进入 runtime API。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已在 Parser Fixture Harness 当前边界中补 MAPLE public candidate resolution summary helper，说明它从 inventory/ledger/matrix 派生 candidate/reference/promoted/blocked/fallback/unresolved 状态，并防止 MAPLE public originals 被误 vendor 或误标 supported。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已在 Parser Fixture Corpus 当前状态中补 `maple-dev-example` 3 candidates blocked、14 reference-only anchors 覆盖、promoted originals 为空、unresolved 为空的现状。
- [x] `.codestable/architecture/core-platform.md`：已在文件职责中补 `tests/parser_fixture_harness.py` 的 MAPLE resolution summary dataclass/helper，以及 `tests/fixtures/parsers/` 当前 MAPLE resolution 结论。
- [x] `.codestable/architecture/core-platform.md`：已在已知限制中补 MAPLE resolution summary 当前 no-vendor/no-runtime-expansion 边界。
- [x] `docs/dev/parser-fixture-corpus.md`：已补 MAPLE Candidate Resolution 维护入口和 blocked/reference-only/fallback 口径。

## 6. requirement 回写

本 feature 是测试侧/dev tooling 和 CodeStable 归档能力，不新增用户可见导入行为、端侧命令、项目持久化能力、runtime parser 支持或 UI。方案 frontmatter `requirement: null`，无需新增 requirement。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-items.yaml` 已将 `maple-public-candidate-resolution` 从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-roadmap.md` 第 5 节子 feature 清单已同步为 `done`，并写入对应 feature id 和当前 no-promoted-originals 结论。

## 8. AGENTS.md / CLAUDE.md 候选盘点

无候选。本 feature 没有新增每个 feature 都会复用的环境命令、远程规则或工具约定；现有 `AGENTS.md` 已覆盖普通测试 no-network、parser/fixture 解耦、第三方 public output 不自动 vendor 和 Web 预览方式。

## 9. 遗留

- 后续 roadmap item 是 `cclib-public-candidate-resolution`，需要对 cclib-data Gaussian/ORCA candidates 做同类 blocked/promotion/fallback resolution。
- MAPLE public originals 仍未 vendor；如后续用户或上游授权证据允许 promotion，必须另起 feature 更新 decision ledger、manifest source metadata、fixture file、snapshot 和 support matrix。
- MAPLE `.sum`、AutoNEB tree、MD thermo、scan coordinate、path topology、direction 和 TS candidate 语义仍未进入 parser runtime。
