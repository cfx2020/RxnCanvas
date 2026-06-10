---
doc_type: feature-acceptance
feature: 2026-06-03-parser-public-fixture-promotion-adapter
status: accepted
summary: 验收 parser public fixture promotion adapter 的 summary/guards、source-gated fixture decision_id 规则、文档和 architecture/roadmap 回写
tags: [parser, fixture-corpus, public-fixtures, promotion-adapter, license-gate, support-matrix]
---

# parser-public-fixture-promotion-adapter 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-03
> 关联方案 doc：.codestable/features/2026-06-03-parser-public-fixture-promotion-adapter/parser-public-fixture-promotion-adapter-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `ParserPublicFixturePromotionSummary` 已落地在 `tests/parser_fixture_harness.py`，字段为 promoted decisions/files、blocked/reference-only files、source-gated fixtures、covered/snapshot/support matrix fixture ids 和 unresolved ids。
- [x] `summarize_parser_public_fixture_promotion(source_inventory, decision_ledger, manifest, support_matrix)` 已落地，输入与方案一致。
- [x] `ParserFixtureSource.decision_id` 已作为 optional 字段落地；synthetic fixtures 不强制填写，`vendored-third-party` / `user-redacted` source-gated fixtures 强制填写。
- [x] promoted decision 的 fallback fixture、snapshot schema、support matrix coverage 和 source-gated fixture metadata 均由 adapter/helper 或 loader guard 检查。

流程图核对通过：source inventory、decision ledger、manifest、golden snapshots 和 support matrix 汇入 Fixture Promotion Adapter，再输出 Promotion Summary 和 focused guards，均有实际代码和测试落点。

## 2. 行为与决策核对

需求摘要已落地：新增统一 promotion summary，当前 corpus 中 4 个 `ase-extxyz-project-authored` allowed/promoted decisions 全部有 executable fixture coverage；MAPLE/cclib-data candidate/reference-only decisions 不进入 source-gated executable fixture。

明确不做核对：

- [x] 未 vendor MAPLE、cclib-data、ASE public examples 或其他第三方 original 输出。
- [x] 未新增 user-redacted 真实用户输出。
- [x] 未修改 parser runtime、Import Workflow、Platform Shell、Web UI 或 report export。
- [x] 未让 blocked/reference-only files 通过 source-gated fixture 进入 executable corpus。
- [x] 普通 tests 不访问网络。

关键决策已落地：

- [x] 统一 summary 保留 MAPLE/cclib/extxyz source-specific summaries，同时提供跨 source promotion adapter。
- [x] source-gated fixture 必须有 `decision_id`；synthetic fallback 不强制。
- [x] promoted decision 必须有 manifest/snapshot/support matrix coverage。
- [x] blocked/reference-only decision 不能被 source-gated executable fixture 使用。
- [x] helper 只读本地 YAML/snapshot，不写文件、不 fetch。

挂载点核对通过：实际挂载点为 `tests/parser_fixture_harness.py`、`tests/test_parser_fixture_harness.py`、`docs/dev/parser-fixture-corpus.md`、本 checklist/acceptance 和后续 architecture/roadmap 回写。scope diff 证明没有触碰 `rxnflow.parsers`、Import Workflow、Platform Shell、Web UI 或 report export。

## 3. 验收场景核对

- [x] S1/S2：能派生 promotion summary，且 promoted decisions 只包含 4 个 extxyz project-authored decisions。证据：`test_public_fixture_promotion_summary_covers_current_corpus`。
- [x] S3/S4：每个 promoted fallback fixture 存在、可执行、有 `parser-golden-v1` snapshot，并在 support matrix `fixture_ids` 中。证据：同一测试断言 `covered_fixture_ids`、`snapshot_fixture_ids` 和 `support_matrix_fixture_ids`。
- [x] S5/S6：MAPLE/cclib candidate/reference-only decisions 不进入 source-gated executable fixture。证据：summary `source_gated_fixture_ids == ()` 和 blocked/reference-only file assertions。
- [x] S7：临时 `vendored-third-party` 缺 `decision_id` 被 loader 拒绝。证据：`test_loader_rejects_source_gated_fixture_missing_decision_id`。
- [x] S8/S9/S10：临时 source-gated fixture 的 unknown/non-promoted decision、metadata mismatch、missing snapshot、missing support matrix coverage 会进入 unresolved。证据：`test_source_gated_fixture_promotion_summary_exposes_inconsistencies`。
- [x] S11：synthetic fixtures 不强制 `decision_id`；当前 corpus 加载仍通过，source-gated 当前为空。
- [x] S12：developer guide 已写入 Fixture Promotion Adapter 维护规则。
- [x] S13：scope guard 未发现 runtime/import/web/export 改动。

本 feature 无前端改动，无需浏览器验证。

## 4. 术语一致性

- Fixture Promotion Adapter / Promotion Summary / Source-gated Fixture / Promoted Decision / Executable Promotion Coverage 在 design、代码、测试和 developer guide 中保持一致。
- `decision_id` 仅用于 source-gated manifest source，不替代 decision ledger 的 `source_id/file_id`。
- 防冲突：grep 命中集中在测试 harness、测试、developer guide 和 CodeStable 文档；未进入 runtime parser API。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：补 Fixture Promotion Adapter 术语和 Parser Fixture Harness 当前能力，说明 source-gated fixture decision_id 与 promotion summary 规则。
- [x] `.codestable/architecture/ARCHITECTURE.md`：补 Parser Fixture Corpus 当前 promotion summary 结论。
- [x] `.codestable/architecture/core-platform.md`：补测试侧 harness 能力、fixture corpus 当前状态和已知限制中的 promotion adapter 口径。
- [x] `docs/dev/parser-fixture-corpus.md`：已补 Fixture Promotion Adapter 维护入口。

## 6. requirement 回写

本 feature 是测试侧/dev tooling 和 CodeStable 归档能力，不新增用户可见导入行为、端侧命令、项目持久化能力、runtime parser 支持或 UI。方案 frontmatter `requirement: null`，无需新增 requirement。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-items.yaml` 已将 `parser-public-fixture-promotion-adapter` 从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-roadmap.md` 第 6 节子 feature 清单已同步为 `done`，并写入当前 promotion adapter 结论。

## 8. AGENTS.md / CLAUDE.md 候选盘点

无候选。本 feature 没有新增每个 feature 都会复用的环境命令、远程规则或工具约定；现有 `AGENTS.md` 已覆盖普通测试 no-network、parser/fixture 解耦和第三方 public output 不自动 vendor。

## 9. 遗留

- 后续 roadmap item 是 `public-fixture-import-preview-regression`，需要把 adapter 确认的 promoted fixtures 纳入 import preview public regression。
- 真实 third-party/user-redacted Gaussian/ORCA/MAPLE/extxyz outputs 仍未接入；后续必须另起 feature 记录 source policy、license/redaction 和 decision ledger。
- `decision_id` 当前只在测试侧 manifest source 中使用，不是 runtime parser API。
