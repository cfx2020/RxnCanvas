---
doc_type: feature-acceptance
feature: 2026-05-22-maple-path-output-semantics
status: accepted
summary: 验收 MAPLE path .xyz 逐帧解析语义和 no-ReactionPath 支持边界
tags: [parser, maple, path-semantics, fixture-corpus, support-matrix]
---

# maple-path-output-semantics 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：codestable/features/2026-05-22-maple-path-output-semantics/maple-path-output-semantics-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] 新增 `maple-path-family-synthetic-derived` executable fixture：`manifest.yaml` 已登记，`source.kind=synthetic`，`support_status=partial`。
- [x] Snapshot 固定 4 个 frame-level objects，labels 为 `Image 0` 到 `Image 3`，`energies.electronic.unit=hartree`，warning codes 为空。
- [x] 原有 `maple-irc-path-synthetic-minimal` 继续覆盖 `Image 0`、`Iter 1 Image 1`、`Iteration 7` label variants。
- [x] 未新增 `ReactionPath`、`ReactionGraph`、TS candidate 或 path topology runtime output。

流程图核对：source inventory reference entries 经过 license/topology boundary 后进入项目内 synthetic-derived fixture、manifest、snapshot、support matrix、fixture/import-preview regression 和 docs/architecture boundary，均有实际落点。

## 2. 行为与决策核对

- [x] 逐帧对象优先：MAPLE path `.xyz` 仍由现有 parser 输出多个 `ChemicalObjectDraft`。
- [x] 拓扑显式缺席：`support-matrix.yaml` 的 MAPLE path partial entry 把 `direction`、`path_topology` 和 `transition_state` 标为 `unsupported`。
- [x] path family 分层覆盖：executable fixture 使用 synthetic-derived `.xyz`，`maple-path-family-reference` 保持 `reference-only`。
- [x] 无 runtime 扩张：未修改 `rxnflow/parsers/maple.py`、`rxnflow/parsers/xyz.py`、ImportRegistryWorkflow、ChemicalRegistry、ReactionGraph、EnergyProfile 或 Web UI。

明确不做核对：

- [x] 未复制 MAPLE public path examples 原文件。
- [x] 未把 MAPLE source inventory path reference-only policy 改成 candidate/vendored。
- [x] 未新增 vendored-third-party manifest source。
- [x] 未解析 AutoNEB tree JSON、NEB/String output logs 或 IRC forward/backward direction。

挂载点反向核对：

- [x] 挂载点只落在 fixture file、manifest、snapshot、support matrix、parser/import-preview tests、docs/architecture/roadmap 和本 feature spec。
- [x] `rg "ReactionPath|ReactionGraph|TS candidate|energy profile" tests/fixtures/parsers tests/test_parser_fixture_harness.py docs/dev/parser-fixture-corpus.md codestable/architecture` 仅命中边界说明或既有 graph/energy 架构语境，无 parser path 支持误声明。
- [x] 拔除沙盘推演：删除新增 fixture file、manifest entry、snapshot、support matrix fixture id、测试断言和 docs 更新后，本 feature 用户可见边界消失，不残留 runtime 行为变更。

## 3. 验收场景核对

- [x] S1：`manifest.yaml` 包含 `maple-path-family-synthetic-derived` executable fixture。证据：`test_maple_manifest_entries_and_executable_status`。
- [x] S2：新 fixture 的 `source.kind` 是 `synthetic`。证据：同上。
- [x] S3：新 fixture snapshot 覆盖 4 个 frames、`Image N` labels、hartree energy。证据：`test_maple_snapshots_cover_expected_fields`。
- [x] S4：原有 IRC path variants 仍通过。证据：`test_maple_snapshots_cover_expected_fields` 和 `test_maple_path_comment_variants_are_detected_by_maple_plugin`。
- [x] S5：MAPLE path partial entry 覆盖两个 executable fixtures，topology/direction/TS unsupported。证据：`test_maple_path_family_support_matrix_declares_frame_only_boundary`。
- [x] S6：`maple-path-family-reference` 保持 reference-only。证据：同上。
- [x] S7：import preview 覆盖新增 fixture且 preview-only。证据：`test_workflow_preview_preserves_parser_fixture_snapshot_fields` 和 updated scope guard。
- [x] S8：测试/docs 没把 path fixture 描述为 runtime ReactionPath 支持。证据：grep 边界核对。
- [x] S9：MAPLE fixture files 不含 upstream banner/license 文案。证据：`test_maple_fixtures_are_synthetic_and_redacted` 和 no-vendor grep。
- [x] S10：docs/architecture 明确 frame-level coverage，path topology 未解析。证据：`docs/dev/parser-fixture-corpus.md`、`ARCHITECTURE.md`、`core-platform.md` 已更新。

## 4. 术语一致性

- MAPLE Path XYZ / MAPLE Path Family Shape Fixture / Frame-level ChemicalObjectDraft / Path Topology Boundary：设计、tests、support matrix、docs 和 architecture 口径一致。
- 防冲突：代码中 `ReactionPath` 仍只属于 graph/energy 架构；parser fixture 只在边界说明中提及它。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：Parser Fixture Corpus、关键架构决定和待补项已同步 12 个 fixture、MAPLE path-family synthetic-derived coverage 和 no-ReactionPath boundary。
- [x] `codestable/architecture/core-platform.md`：Parser Plugins 基线、Parser Fixture Harness、模块职责、MAPLE parser 能力边界和待补项已同步。
- [x] `docs/dev/parser-fixture-corpus.md`：新增 MAPLE path family source policy 与 no-ReactionPath / no-topology 维护规则。

## 6. requirement 回写

- [x] 本 feature 是测试侧 parser fixture/support matrix 能力边界补强，方案 frontmatter `requirement: null`。无需新增用户-facing requirement。

## 7. roadmap 回写

- [x] `rxnflow-parser-real-output-compatibility-items.yaml` 已把 `maple-path-output-semantics` 改为 `done`，feature 指向 `2026-05-22-maple-path-output-semantics`。
- [x] `rxnflow-parser-real-output-compatibility-roadmap.md` 子 feature 清单已同步为 done，并记录仍不生成 ReactionPath / topology / TS candidate。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新环境或工作流规则。

## 9. 遗留

- MAPLE AutoNEB tree JSON、IRC direction、NEB/String output logs、path topology、TS candidate 和 path-to-graph import 仍未设计，需另起 graph/import feature。
- MAPLE public originals 仍未 vendor；license/re-distribution 边界仍是 review-required。
- 后续 roadmap 可继续推进 `cclib-public-gaussian-orca-fixtures`。
