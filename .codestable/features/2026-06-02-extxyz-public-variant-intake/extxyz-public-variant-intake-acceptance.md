---
doc_type: feature-acceptance
feature: 2026-06-02-extxyz-public-variant-intake
status: accepted
summary: 验收 extxyz variant intake 的测试侧 summary/guards、project-authored advanced-field fixture、known-limits 边界和 roadmap/architecture 回写
tags: [parser, fixture-corpus, public-fixtures, extxyz, ase, license-gate]
---

# extxyz-public-variant-intake 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-03
> 关联方案 doc：.codestable/features/2026-06-02-extxyz-public-variant-intake/extxyz-public-variant-intake-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `ParserExtxyzVariantIntakeSummary` 已落地在 `tests/parser_fixture_harness.py`，字段为 `source_id`、`vendored_file_ids`、`promoted_file_ids`、`executable_fixture_ids`、`advanced_known_limit_fields` 和 `unresolved_file_ids`。
- [x] `summarize_extxyz_variant_intake(source_inventory, decision_ledger, manifest, support_matrix, source_id="ase-extxyz-project-authored")` 已落地，输入和默认 source id 与设计一致。
- [x] helper 从 source inventory 派生 vendored file ids，从 decision ledger 派生 allowed/promoted 和 fallback fixture 状态，从 manifest/support matrix 交叉检查 executable fixture ids，并从 support matrix fields 派生 advanced known-limit fields。
- [x] `source_id` 非 `program == "ase-extxyz"` 时抛 `AssertionError`，缺 decision、非 vendored policy、非 allowed/promoted、缺 fallback、manifest 或 support matrix 漏 fixture 时进入 `unresolved_file_ids`。

流程图核对通过：`Authorized extxyz variant source inventory -> Decision ledger lookup -> Manifest fixture link -> Snapshot projection check -> Support matrix known-limits check -> extxyz Variant Intake Summary -> No public auto-vendor guard` 均有实际落点，证据为 `summarize_extxyz_variant_intake`、focused tests 和新 golden snapshot。

## 2. 行为与决策核对

需求摘要已落地：`ase-extxyz-project-authored` 现在覆盖 4 个 project-authored vendored files，全部为 `allowed/promoted`；新增 `extxyz-lattice-forces-stress` 固定 lattice/PBC/forces/stress/magmoms 输入形状，但 parser projection 仍只输出 geometry、label、charge/spin 和 electronic energy 等当前字段。support matrix 明确 advanced fields 为 unsupported/known limits。

明确不做核对：

- [x] 未下载或 vendor 外部 public extxyz 数据集。
- [x] 未复制未授权用户文件、网页示例或 ASE 文档片段。
- [x] 未新增 lattice/PBC、forces、stress、magmoms、per-atom charges 或 calculator metadata 的领域模型字段。
- [x] 未让 extxyz multi-frame 生成 ReactionPath、direction/topology、TS candidate 或 energy profile。
- [x] 未修改 Import Workflow、Platform Shell、Web UI 或 report export。
- [x] 未改变 extxyz energy eV -> Hartree 转换和 warning 语义。
- [x] 普通 tests 不访问网络。

关键决策已落地：

- [x] 先固定 intake 契约，再扩外部数据：本 feature 只新增 project-authored fixture，不选择第三方 public extxyz 数据集。
- [x] Authorized variant 可 promoted：4 个 project-authored extxyz files 都是 `allowed/promoted`，并有对应 fallback fixture。
- [x] Advanced fields 先作为 known limits：`lattice_pbc`、`forces`、`stress`、`magmoms` 在 support matrix 中为 `unsupported`。
- [x] Frame-level 语义不变：multi-frame extxyz 仍只生成多个 `ChemicalObjectDraft`。
- [x] Parser runtime 不变：未修改 `rxnflow.parsers.xyz` 或领域模型。

挂载点核对通过：实际挂载点为 `tests/parser_fixture_harness.py`、`tests/test_parser_fixture_harness.py`、`tests/test_import_preview_parser_regression.py`、`tests/fixtures/parsers/`、`docs/dev/parser-fixture-corpus.md`、architecture/roadmap/acceptance CodeStable 文档。反向 scope diff 未发现 Import Workflow、Platform Shell、Web UI、report export、`rxnflow.parsers.xyz` 或 `rxnflow.models` 被修改。

## 3. 验收场景核对

- [x] S1 能从当前 `sources.yaml` / `public-fixture-decisions.yaml` / `manifest.yaml` / `support-matrix.yaml` 派生 `ParserExtxyzVariantIntakeSummary`。证据：`test_extxyz_variant_intake_summary_covers_project_authored_variants`。
- [x] S2 summary 覆盖 `ase-extxyz-project-authored` 的全部 4 个 vendored file ids，无 missing/extra/unresolved。证据：同一单测断言 `unresolved_file_ids == ()`。
- [x] S3 每个 project-authored extxyz vendored file 都是 `allowed/promoted`，并带 fallback fixture。证据：`test_public_fixture_decision_ledger_allows_project_authored_extxyz`。
- [x] S4 每个 promoted extxyz fallback fixture 存在于 manifest，且 source.kind 为 `synthetic`。证据：decision ledger loader 和 summary focused tests。
- [x] S5 support matrix 中 `ase-extxyz-synthetic` 的 executable fixture ids 覆盖所有 promoted extxyz fixtures。证据：summary executable fixture ids 断言和 support matrix coverage loader。
- [x] S6 新增 advanced-field extxyz fixture parse 成功，输出仍只包含当前支持字段。证据：`test_xyz_extxyz_snapshots_cover_expected_fields` 和 `snapshots/extxyz-lattice-forces-stress.json`。
- [x] S7 lattice/PBC、forces、stress、magmoms 在 support matrix 中保持 unsupported/known-limits。证据：`test_support_matrix_loads_and_covers_fixture_manifest` 和 `test_extxyz_variant_intake_summary_covers_project_authored_variants`。
- [x] S8 multi-frame extxyz 仍输出多个 `ChemicalObjectDraft`，不生成 ReactionPath/topology/TS/energy profile。证据：既有 multi-frame snapshot test 和 docs known limits。
- [x] S9 extxyz energy 仍按 ASE eV 语义转 Hartree，并保留 `unit_assumed` warning；missing energy 仍保留 `missing_section` warning。证据：`test_xyz_extxyz_snapshots_cover_expected_fields`。
- [x] S10 docs 明确 external/public/user-redacted extxyz 后续必须走 source policy、decision ledger 和 promotion adapter，不允许自动 vendor。证据：`docs/dev/parser-fixture-corpus.md` 的 ASE extxyz 维护规则。
- [x] S11 scope guard 证明未修改 Import Workflow、Platform Shell、Web UI、report export 或外部 fetch workflow。证据：scope diff 无输出。

本 feature 无前端改动，无需浏览器验证。

## 4. 术语一致性

- extxyz Variant Intake / Authorized extxyz Variant / extxyz Variant Summary：设计、代码、docs 和 acceptance 使用一致。
- Advanced extxyz Fields：测试与 support matrix 固定为 unsupported/known-limits，不进入 runtime supported fields。
- Frame-level extxyz Parsing：multi-frame 语义仍为逐帧 `ChemicalObjectDraft`。
- 防冲突：grep 命中集中在测试 harness、fixture corpus、developer guide、CodeStable 文档和 roadmap；未进入 runtime API。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已在 Parser Fixture Harness 当前边界中补 extxyz variant intake summary helper，说明它从 inventory/ledger/manifest/matrix 派生 vendored/promoted/executable/known-limit/unresolved 状态。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已在 Parser Fixture Corpus 当前状态中补 ASE extxyz 4 个 project-authored promoted variants 和 advanced-field known-limits 口径。
- [x] `.codestable/architecture/core-platform.md`：已在文件职责中补 extxyz variant intake summary dataclass/helper，以及 `tests/fixtures/parsers/` 当前 extxyz intake 结论。
- [x] `.codestable/architecture/core-platform.md`：已在已知限制中补 advanced extxyz fields 当前不映射到领域模型的边界。
- [x] `docs/dev/parser-fixture-corpus.md`：已补 extxyz External Variant Intake 维护入口和 public/user-redacted no-auto-vendor 纪律。

## 6. requirement 回写

本 feature 是测试侧/dev tooling 和 CodeStable 归档能力，不新增用户可见导入行为、端侧命令、项目持久化能力、runtime parser 支持或 UI。方案 frontmatter `requirement: null`，无需新增 requirement。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-items.yaml` 已将 `extxyz-public-variant-intake` 从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-roadmap.md` 第 5 节子 feature 清单已同步为 `done`，并写入当前 4 个 project-authored promoted extxyz variants 和 advanced-field known-limits 结论。

## 8. AGENTS.md / CLAUDE.md 候选盘点

无候选。本 feature 没有新增每个 feature 都会复用的环境命令、远程规则或工具约定；现有 `AGENTS.md` 已覆盖普通测试 no-network、parser/fixture 解耦、第三方 public output 不自动 vendor 和 Web 预览方式。

## 9. 遗留

- 后续 roadmap item 是 `parser-public-fixture-promotion-adapter`，需要统一校验 promoted fixture 的 decision/source metadata/manifest/snapshot/support matrix 关系。
- 外部 public/user-redacted extxyz 数据集仍未接入；后续必须另起 feature 记录 source policy、license/redaction 和 decision ledger。
- lattice/PBC、forces、stress、magmoms、per-atom charges、calculator metadata 仍未映射到领域模型或 parser supported fields。
