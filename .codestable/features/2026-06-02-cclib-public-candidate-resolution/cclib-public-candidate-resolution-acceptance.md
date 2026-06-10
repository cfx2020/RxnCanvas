---
doc_type: feature-acceptance
feature: 2026-06-02-cclib-public-candidate-resolution
status: accepted
summary: 验收 cclib-data public candidate resolution 的测试侧 summary/guards、no-vendor 边界和 roadmap/architecture 回写
tags: [parser, fixture-corpus, public-fixtures, cclib, gaussian, orca, license-gate]
---

# cclib-public-candidate-resolution 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-02
> 关联方案 doc：.codestable/features/2026-06-02-cclib-public-candidate-resolution/cclib-public-candidate-resolution-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `ParserCclibPublicResolutionSummary` 已落地在 `tests/parser_fixture_harness.py`，字段为 `source_id`、`gaussian_candidate_file_ids`、`orca_candidate_file_ids`、`reference_file_ids`、`promoted_file_ids`、`blocked_candidate_file_ids`、`fallback_fixture_ids` 和 `unresolved_file_ids`。
- [x] `summarize_cclib_public_candidate_resolution(source_inventory, decision_ledger, support_matrix, source_id="cclib-data-gaussian-orca")` 已落地，输入和默认 source id 与设计一致。
- [x] helper 从 `ParserSourceInventory` 派生 Gaussian/ORCA candidate file ids 和 reference-only file ids，从 `ParserPublicFixtureDecisionLedger` 派生 promoted/blocked/fallback/reference anchor 状态，从 `ParserSupportMatrix` 交叉检查 cclib-data source files 是否都被 matrix 覆盖。
- [x] `source_id` 非 `program == "cclib-data"` 时抛 `AssertionError`，缺 decision、candidate 无 fallback、reference-only 无 self anchor、未知 candidate format 或 support matrix 漏覆盖时进入 `unresolved_file_ids`。

流程图核对通过：`cclib-data ParserSourceInventory files -> Decision Ledger lookup -> Gaussian/ORCA candidate split -> Support Matrix cross-check -> cclib-data Resolution Summary -> focused guards` 均有实际落点，证据为 `summarize_cclib_public_candidate_resolution` 和 `test_cclib_public_resolution_*` 四个 focused tests。

## 2. 行为与决策核对

需求摘要已落地：`cclib-data-gaussian-orca` 的 2 个 Gaussian candidates、2 个 ORCA candidates 和 2 个 reference-only files 现在能派生为一份机检 summary；当前 promoted originals 为空，candidate 全 blocked with fallback，reference-only 全有 anchor，support matrix 不把 cclib-data public originals 放入 executable `fixture_ids`。

明确不做核对：

- [x] 未 vendor cclib-data Gaussian/ORCA public originals，未新增 cclib-data third-party file 到 `tests/fixtures/parsers/files/`。
- [x] 未把任何 cclib-data candidate decision 改成 `allowed/promoted`。
- [x] 未修改 `rxnflow.parsers.cclib_adapter`，未新增 NBO、frequency、thermochemistry、SCF convergence、population analysis 或 deep parser fields。
- [x] 未新增真实 Gaussian/ORCA 版本认证，未把 cclib-data candidates 描述成真实版本完整支持。
- [x] 未修改 import workflow、Platform Shell、Web UI 或 report export。
- [x] 未运行 Gaussian、ORCA、cclib regression suite 或外部计算任务。
- [x] 普通 unit tests 不访问网络或 GitHub clone。
- [x] 未把 `reference-only` 文件描述成 supported/executable fixture。

关键决策已落地：

- [x] Resolution summary 派生而非新事实源：未新增 cclib-data 决策 YAML，summary 从现有 inventory/ledger/matrix 派生。
- [x] 无授权则不 promotion：4 个 cclib-data candidates 仍为 `needs-permission/blocked`，`promoted_file_ids == ()`。
- [x] 按 adapter family 分类：summary 分别列出 Gaussian candidates 与 ORCA candidates，防止两类 adapter fallback 混用。
- [x] Reference-only 保持 reference-only：NBO/large optimization files 只通过 `reference_file_ids` 和 decision ledger self anchor 出现。
- [x] Fallback 是项目内 fixture：summary 中 fallback fixture 全存在于 manifest，且 `source.kind == "synthetic"`。
- [x] Parser runtime 不变：helper 只在 `tests/parser_fixture_harness.py`，未进入 `rxnflow.parsers` runtime API。

挂载点核对通过：实际挂载点为 `tests/parser_fixture_harness.py`、`tests/test_parser_fixture_harness.py`、`tests/fixtures/parsers/support-matrix.yaml`、`docs/dev/parser-fixture-corpus.md`、architecture/roadmap/acceptance CodeStable 文档。反向 grep 未发现 cclib parser runtime、Import Workflow、Platform Shell、Web UI、report export、manifest fixture files、snapshots 或 decision ledger 被本 feature 修改。

## 3. 验收场景核对

- [x] S1 能从当前 `sources.yaml` / `public-fixture-decisions.yaml` / `support-matrix.yaml` 派生 `ParserCclibPublicResolutionSummary`。证据：`test_cclib_public_resolution_summary_classifies_current_source_files`。
- [x] S2 summary 覆盖 `cclib-data-gaussian-orca` 全部 6 个 source file ids，无 missing/extra/unresolved。证据：同一单测断言 2 Gaussian candidate + 2 ORCA candidate + 2 reference-only 且 `unresolved_file_ids == ()`。
- [x] S3 Gaussian candidate file ids 精确为 `cclib-gaussian16-water-log`、`cclib-gaussian16-co-pbe-log`。证据：同一单测逐字段断言。
- [x] S4 ORCA candidate file ids 精确为 `cclib-orca50-1038-output`、`cclib-orca60-1618-output`。证据：同一单测逐字段断言。
- [x] S5 reference-only file ids 精确为 `cclib-gaussian16-water-nbo-out`、`cclib-orca50-benzene-opt-log`。证据：同一单测逐字段断言。
- [x] S6 promoted file ids 为空。证据：同一单测断言 `promoted_file_ids == ()`。
- [x] S7 每个 cclib-data candidate 当前都是 `needs-permission/blocked`，并带 fallback fixture。证据：summary 断言 `blocked_candidate_file_ids == gaussian + orca candidates`，fallback set 覆盖四个项目内 fallback。
- [x] S8 每个 cclib-data candidate fallback fixture 存在于 manifest 且 `source.kind == "synthetic"`。证据：同一单测逐 fixture lookup。
- [x] S9 每个 cclib-data reference-only file 保持 `reference-only/not-applicable` 并以自身 file id 作为 reference anchor。证据：现有 `test_public_fixture_decision_ledger_keeps_reference_files_unpromoted` 和 cclib resolution summary test。
- [x] S10 Candidate Fetch Verify 能为 4 个 cclib-data candidates 构造 request，包含 URL、upstream path、commit tracking info、expected sha256 和 size，且不 fetch、不写 fixture corpus。证据：`test_cclib_public_resolution_fetch_requests_are_ready_without_fetching`。
- [x] S11 support matrix 中 Gaussian/ORCA cclib executable coverage 仍只指向项目内 synthetic / synthetic-derived fallback fixtures，不 vendor originals。证据：`test_cclib_public_resolution_support_matrix_keeps_public_originals_non_executable` 和 `test_cclib_public_shape_regression_links_candidates_without_vendoring`。
- [x] S12 support matrix 中 cclib-data reference-only files 不进入 executable `fixture_ids`，且不得被描述为 NBO/optimization/deep-field support。证据：`cclib-gaussian-orca-reference` entry 为 `reference-only`，`fixture_ids == []`，fields 均为 `reference-only`。
- [x] S13 docs 明确当前无 promoted public originals、Gaussian/ORCA candidates blocked pending permission、NBO/large opt remain reference-only、cclib-data non-free/review-required evidence 不能自动 promotion。证据：`docs/dev/parser-fixture-corpus.md` 的 cclib-data Candidate Resolution section。
- [x] S14 scope guard 证明未新增 cclib-data third-party files，未改 cclib adapter runtime、Import Workflow、Platform Shell、Web UI 或 report export。证据：scope diff 无输出。

本 feature 无前端改动，无需浏览器验证。

## 4. 术语一致性

- cclib-data Candidate Resolution：设计、developer guide、acceptance 和 roadmap 均指测试侧逐文件 resolution 结论，不表示 runtime parser 能力扩展。
- cclib-data Resolution Summary：代码命名为 `ParserCclibPublicResolutionSummary` / `summarize_cclib_public_candidate_resolution`，只存在于测试 harness。
- Blocked cclib-data Candidate / cclib-data Reference Anchor / cclib-data Fallback Fixture / cclib-data Promotion Outcome：测试断言和 docs 使用一致，均强调 no-promoted-originals、reference-only anchor 和 synthetic fallback。
- 防冲突：grep 命中只在测试 harness、测试文件、support matrix、developer guide、CodeStable 文档和 roadmap；未进入 runtime API。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已在 Parser Fixture Harness 当前边界中补 cclib-data public candidate resolution summary helper，说明它从 inventory/ledger/matrix 派生 Gaussian/ORCA candidate、reference/promoted/blocked/fallback/unresolved 状态，并防止 cclib-data public originals 被误 vendor 或误标 supported。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已在 Parser Fixture Corpus 当前状态中补 `cclib-data-gaussian-orca` 4 candidates blocked、2 reference-only anchors 覆盖、promoted originals 为空、unresolved 为空的现状。
- [x] `.codestable/architecture/core-platform.md`：已在文件职责中补 `tests/parser_fixture_harness.py` 的 cclib-data resolution summary dataclass/helper，以及 `tests/fixtures/parsers/` 当前 cclib-data resolution 结论。
- [x] `.codestable/architecture/core-platform.md`：已在已知限制中补 cclib-data resolution summary 当前 no-vendor/no-runtime-expansion 边界。
- [x] `docs/dev/parser-fixture-corpus.md`：已补 cclib-data Candidate Resolution 维护入口和 blocked/reference-only/fallback 口径。

## 6. requirement 回写

本 feature 是测试侧/dev tooling 和 CodeStable 归档能力，不新增用户可见导入行为、端侧命令、项目持久化能力、runtime parser 支持或 UI。方案 frontmatter `requirement: null`，无需新增 requirement。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-items.yaml` 已将 `cclib-public-candidate-resolution` 从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-roadmap.md` 第 5 节子 feature 清单已同步为 `done`，并写入对应 feature id 和当前 no-promoted-originals 结论。

## 8. AGENTS.md / CLAUDE.md 候选盘点

无候选。本 feature 没有新增每个 feature 都会复用的环境命令、远程规则或工具约定；现有 `AGENTS.md` 已覆盖普通测试 no-network、parser/fixture 解耦、第三方 public output 不自动 vendor 和 Web 预览方式。

## 9. 遗留

- 后续 roadmap item 是 `extxyz-public-variant-intake`，需要建立公开或用户授权 extxyz 样例 intake 流程。
- cclib-data public originals 仍未 vendor；如后续用户、Debian/cclib 维护者或上游许可证证据允许 promotion，必须另起 feature 更新 decision ledger、manifest source metadata、fixture file、snapshot 和 support matrix。
- cclib adapter 仍不声明 NBO、frequency、thermochemistry、SCF convergence、population analysis、large optimization detail 或真实 Gaussian/ORCA 版本完整支持。
