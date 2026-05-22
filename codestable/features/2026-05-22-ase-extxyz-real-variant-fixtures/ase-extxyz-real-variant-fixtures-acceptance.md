---
doc_type: feature-acceptance
feature: 2026-05-22-ase-extxyz-real-variant-fixtures
status: accepted
summary: 验收 ASE extxyz 多帧、metadata、calculator energy、missing energy 和 unit warning 的 fixture coverage
tags: [parser, ase, extxyz, fixture-corpus, source-policy]
---

# ase-extxyz-real-variant-fixtures 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：codestable/features/2026-05-22-ase-extxyz-real-variant-fixtures/ase-extxyz-real-variant-fixtures-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] 新增 `extxyz-multiframe-metadata-calculator-energy` executable fixture，`source.kind=synthetic`，`support_status=partial`。
- [x] 新增 source inventory file `ase-extxyz-multiframe-metadata-calculator-energy`，`fixture_policy=vendored`，size/hash 已记录。
- [x] 新增 snapshot 固定 `object_count=3`、labels、charge/spin、geometry sample、Hartree energy、missing energy 和 warning codes。
- [x] frame 0 `co-calc-energy` 通过 ASE calculator results fallback 得到 `-14.25 eV`，进入 `EnergyValue(..., "hartree")`。
- [x] frame 1 `h2-spin-metadata` 将 `spin=1` 映射为 `spin_multiplicity=1`，并固定 `-1.1 eV` 转 Hartree。
- [x] frame 2 `he-missing-energy` 保持空 `energies`。

流程图核对：project-authored ASE extxyz variant 已进入 manifest、ParserRegistry `xyz-ase` parse、golden snapshot、support matrix 和 fixture/import-preview regression。

## 2. 行为与决策核对

- [x] project-authored source：继续使用 `ase-extxyz-project-authored`，未引入外部 extxyz 数据集。
- [x] calculator fallback 固定：新增 fixture 经 ASE 读回时前两帧 energy 位于 `atoms.calc.results["energy"]`，snapshot 和 harness assertions 固定该行为。
- [x] warning 不去重：新增 snapshot 保留两个 `unit_assumed` 和一个 `missing_section`。
- [x] no runtime fork：未修改 `rxnflow/parsers/xyz.py`、ImportRegistryWorkflow、Platform Shell、ReactionGraph、EnergyProfile、Report Export 或 Web UI。

明确不做核对：

- [x] 未复制外部 extxyz 数据集或 ASE 文档样例原文。
- [x] 未生成 ReactionPath、direction/topology、TS candidate 或 energy profile。
- [x] 未解析 forces、stress、magmoms、lattice/PBC 深语义、calculator name、method、thermochemistry 或显式 energy unit。
- [x] 未改变 extxyz energy 按 eV 转 Hartree 并记录 `unit_assumed` 的行为。

## 3. 验收场景核对

- [x] S1：manifest 包含 `extxyz-multiframe-metadata-calculator-energy` executable fixture。证据：`test_xyz_extxyz_manifest_entries_and_executable_status`。
- [x] S2：新增 fixture 的 `source.kind` 是 `synthetic`，source inventory file policy 是 `vendored`。证据：`test_source_inventory_loads_public_and_project_authored_sources`。
- [x] S3：新增 fixture 解析成功，`object_count=3`。证据：`test_xyz_extxyz_snapshots_cover_expected_fields` 和 snapshot。
- [x] S4：frame 0 固定 calculator energy fallback、label、charge、spin、C/O geometry 和 Hartree energy。证据：同上。
- [x] S5：frame 1 固定 `spin` metadata 映射和 Hartree energy。证据：同上。
- [x] S6：frame 2 固定 missing energy 空 map 和 `missing_section`。证据：同上。
- [x] S7：warning codes 包含两个 `unit_assumed` 和一个 `missing_section`。证据：snapshot 和 harness assertions。
- [x] S8：support matrix ASE extxyz entry 包含新 fixture，并记录 multi-frame / calculator fallback / missing energy limits。证据：support matrix loader cross-check。
- [x] S9：import preview parser regression scope guard 包含新增 fixture，并保持 preview-only 不登记 ChemicalObject。证据：`test_scope_guard_keeps_regression_preview_only` 和 `_PreviewOnlyRegistry`。
- [x] S10：docs/architecture 明确 project-authored extxyz variant coverage，不声明外部数据集已 vendor。证据：`docs/dev/parser-fixture-corpus.md`、`ARCHITECTURE.md`、`core-platform.md`。

## 4. 术语一致性

- ASE extxyz Variant Fixture / Multi-frame Extxyz Fixture / Calculator Energy Fallback / Extxyz Unit Assumption：设计、manifest、sources、support matrix、tests、docs 和 architecture 口径一致。
- 防冲突：`fixture_ids` 只引用项目内 fixture；未新增 third-party source 或 external extxyz dataset marker。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：Parser Fixture Corpus、关键架构决定和待补项已同步为 15 个 fixture，并记录 ASE extxyz project-authored variants。
- [x] `codestable/architecture/core-platform.md`：Parser Plugins 基线、Parser Fixture Harness、模块职责和待补项已同步。
- [x] `docs/dev/parser-fixture-corpus.md`：已补 ASE extxyz project-authored variant 维护规则。

## 6. requirement 回写

- [x] 本 feature 是测试侧 parser fixture/support matrix 能力边界补强，方案 frontmatter `requirement: null`。无需新增用户-facing requirement。

## 7. roadmap 回写

- [x] `rxnflow-parser-real-output-compatibility-items.yaml` 已把 `ase-extxyz-real-variant-fixtures` 改为 `done`。
- [x] `rxnflow-parser-real-output-compatibility-roadmap.md` 子 feature 清单已同步为 done，并记录 project-authored variant coverage。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新环境或工作流规则。

## 9. 遗留

- 外部 extxyz 数据集仍未 vendor；当前只声明 project-authored variant coverage。
- forces、stress、magmoms、lattice/PBC 深语义、calculator name、method、thermochemistry 和显式 energy unit 未建模。
- Multi-frame extxyz 仍只生成多个 `ChemicalObjectDraft`，不推断 reaction path、direction/topology、TS candidate 或 energy profile。
