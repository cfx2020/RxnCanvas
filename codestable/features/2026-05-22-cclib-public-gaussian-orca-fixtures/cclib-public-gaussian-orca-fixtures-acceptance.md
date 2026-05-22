---
doc_type: feature-acceptance
feature: 2026-05-22-cclib-public-gaussian-orca-fixtures
status: accepted
summary: 验收 Gaussian/ORCA cclib public-candidate-linked synthetic-derived fixture coverage
tags: [parser, cclib, gaussian, orca, fixture-corpus, source-policy]
---

# cclib-public-gaussian-orca-fixtures 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：codestable/features/2026-05-22-cclib-public-gaussian-orca-fixtures/cclib-public-gaussian-orca-fixtures-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] 新增 `gaussian-sp-public-shape-synthetic-derived` executable fixture，`source.kind=synthetic`，`support_status=supported`。
- [x] 新增 `orca-sp-public-shape-synthetic-derived` executable fixture，`source.kind=synthetic`，`support_status=supported`。
- [x] Gaussian snapshot 固定 method=`PBE`、charge=0、spin=1、C/O geometry、hartree electronic energy 和空 thermochemistry。
- [x] ORCA snapshot 固定 method=`PBE0`、charge=0、spin=1、C/O geometry、hartree electronic energy 和空 thermochemistry。
- [x] 未新增 `vendored-third-party` manifest source，未复制 cclib-data 原文件。

流程图核对：cclib-data candidate metadata 经过 license review gate 后走 synthetic-derived fallback；manifest、snapshot、support matrix 和 fixture/import-preview regression 均有实际落点。

## 2. 行为与决策核对

- [x] license gate 优先：cclib-data 记录 commit 的 `LICENSE` raw 返回 404，GitHub license API 返回 404；public originals 保持 candidate。
- [x] adapter projection 固定：新增 fixtures 只验证 RxnFlow cclib adapter 投影，不复制 cclib parser 实现。
- [x] method/charge/spin/energy 显式：snapshot 和 harness assertions 均覆盖。
- [x] no runtime fork：未修改 `rxnflow/parsers/cclib_adapter.py`、ImportRegistryWorkflow、Platform Shell、ReactionGraph、EnergyProfile、Report Export 或 Web UI。

明确不做核对：

- [x] 未复制 cclib-data public example 原文件。
- [x] 未把 cclib-data source inventory policy 改成 allowed/vendored。
- [x] 未新增 vendored-third-party manifest source。
- [x] 未声明 thermochemistry、frequency、NBO、SCF convergence、basis statistics 或完整 job metadata 支持。

## 3. 验收场景核对

- [x] S1：manifest 包含两个新增 Gaussian/ORCA synthetic-derived executable fixtures。证据：`test_gaussian_manifest_entry_and_executable_status`、`test_orca_manifest_entry_and_executable_status`。
- [x] S2：新增 fixtures 的 `source.kind` 是 `synthetic`。证据：同上。
- [x] S3：Gaussian public-shape fixture 解析 method、charge、spin、geometry、hartree energy。证据：`test_gaussian_snapshot_covers_expected_fields`。
- [x] S4：ORCA public-shape fixture 解析 method、charge、spin、geometry、hartree energy。证据：`test_orca_snapshot_covers_expected_fields`。
- [x] S5：support matrix entries 链接 `cclib-data-gaussian-orca` 和对应 candidate ids。证据：`test_cclib_public_shape_regression_links_candidates_without_vendoring`。
- [x] S6：cclib-data source inventory 仍为 `review-required`。证据：同上。
- [x] S7：import preview parser regression 覆盖新增 executable fixtures并保持 preview-only。证据：`test_workflow_preview_preserves_parser_fixture_snapshot_fields` 和 updated scope guard。
- [x] S8：Gaussian/ORCA fixtures 不含 cclib-data repo marker、private path 或 license/proprietary 风险文本。证据：redaction guard tests。
- [x] S9：docs/architecture 明确 synthetic-derived coverage，不声明 cclib-data originals 已 vendor。证据：`docs/dev/parser-fixture-corpus.md`、`ARCHITECTURE.md`、`core-platform.md`。

## 4. 术语一致性

- cclib-data Candidate / cclib Public Shape Regression / Gaussian Synthetic-derived Shape Fixture / ORCA Synthetic-derived Shape Fixture：设计、manifest、support matrix、tests、docs 和 architecture 口径一致。
- 防冲突：`fixture_ids` 只引用项目内 fixtures；cclib-data public files 只出现在 `candidate_file_ids`。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：Parser Fixture Corpus、关键架构决定和待补项已同步为 14 个 fixture，并记录 Gaussian/ORCA public-shape synthetic-derived coverage。
- [x] `codestable/architecture/core-platform.md`：Parser Plugins 基线、Parser Fixture Harness、模块职责和待补项已同步。
- [x] `docs/dev/parser-fixture-corpus.md`：已补 cclib-data license gate 和 synthetic-derived fallback 维护规则。

## 6. requirement 回写

- [x] 本 feature 是测试侧 parser fixture/support matrix 能力边界补强，方案 frontmatter `requirement: null`。无需新增用户-facing requirement。

## 7. roadmap 回写

- [x] `rxnflow-parser-real-output-compatibility-items.yaml` 已把 `cclib-public-gaussian-orca-fixtures` 改为 `done`。
- [x] `rxnflow-parser-real-output-compatibility-roadmap.md` 子 feature 清单已同步为 done，并记录 synthetic-derived fallback。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新环境或工作流规则。

## 9. 遗留

- cclib-data public originals 仍未 vendor；license/re-distribution 边界仍是 review-required。
- Gaussian/ORCA thermochemistry、frequency、NBO、SCF convergence、basis statistics 和完整 job metadata 未建模。
- 后续 roadmap 可继续推进 `ase-extxyz-real-variant-fixtures`。
