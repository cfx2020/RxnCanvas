---
doc_type: feature-acceptance
feature: 2026-05-15-xyz-extxyz-fixture-coverage
status: accepted
accepted_at: 2026-05-15
summary: 验收 XYZ 和 ASE extxyz parser fixture coverage，确认 synthetic corpus、golden snapshots、expected-error、范围守护、架构归并和 roadmap 回写均已落地
tags: [parser, xyz, extxyz, ase, fixture-corpus, acceptance]
---

# XYZ / extxyz Fixture Coverage 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-15
> 关联方案 doc：`.codestable/features/2026-05-15-xyz-extxyz-fixture-coverage/xyz-extxyz-fixture-coverage-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `load_parser_fixture_manifest(Path("tests/fixtures/parsers/manifest.yaml"))`
  - 结果：一致。manifest 现在加载 5 个 fixture，新增 XYZ/extxyz 条目均使用 corpus 内相对路径和 synthetic source policy。
- [x] `assert_parser_fixture_snapshot(ParserRegistry.default(), fixture)`
  - 结果：一致。supported / partial 的 XYZ/extxyz fixture 进入默认 executable loop，并和 `parser-golden-v1` snapshot 比较。
- [x] `project_parser_fixture_snapshot(ParserRegistry.default(), bad_fixture)`
  - 结果：一致。`xyz-bad-atom-count` 作为 targeted expected-error 测试，不进入默认 executable loop。

**名词层变化核对**

- [x] Standard XYZ Fixture：已落地 `tests/fixtures/parsers/files/xyz/xyz-water-geometry-missing-energy.xyz`。
- [x] ASE extxyz Fixture：已落地 `tests/fixtures/parsers/files/extxyz/extxyz-h2-energy-charge-spin.xyz` 和 `tests/fixtures/parsers/files/extxyz/extxyz-h2-missing-energy.xyz`。
- [x] Geometry-only XYZ：snapshot 固定元素、atom_count、geometry sample，缺能量通过 top-level `missing_section` warning 表达。
- [x] extxyz Energy Metadata：snapshot 固定 `electronic` energy 为 hartree，来源为 eV 转换。
- [x] Charge / Spin Metadata：snapshot 固定 `charge=0` 和 `spin_multiplicity=1`。
- [x] Bad XYZ Count Fixture：snapshot 固定 `parse_ok=false`、`error.code=parse_failed`。

**流程图核对**

- [x] `XYZ/extxyz fixture files -> manifest entries -> ParserFixtureHarness -> RawFile + ParseOptions -> ParserRegistry.default -> XyzPlugin -> parser-golden-v1 snapshot` 已落地。
- [x] bad atom count 分支走 targeted expected-error test，不混入默认 supported / partial snapshot loop。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] standard XYZ geometry-only 样例已进入 corpus。
- [x] ASE extxyz energy/charge/spin 样例已进入 corpus。
- [x] ASE extxyz missing energy 样例以 `support_status=partial` 固定缺字段 warning。
- [x] bad atom count 样例以 `support_status=unsupported` 固定失败语义。
- [x] 所有新增样例均为 synthetic，没有引入第三方真实输出或用户数据。

**明确不做逐项核对**

- [x] 不新增真实 Gaussian / ORCA / MAPLE fixture。
- [x] 不运行 ASE 计算、不生成 extxyz、不调用外部程序。
- [x] 不扩大 extxyz 字段语义；cell、pbc、forces、stress、magmom 仍未建模。
- [x] 不改变 Project Content schema、Import Ledger、Chemical Registry、ReactionGraph、EnergyProfile 或 Export。
- [x] 不新增 CLI、Web route、桌面入口或批量导入 UI。

**关键决策落地**

- [x] 首轮使用 synthetic fixture：新增 source 均为 `kind=synthetic`、`redistributable=true`、`redaction=none`。
- [x] 复用现有 Parser Fixture Harness：没有新增第二套 fixture helper。
- [x] standard XYZ 缺 energy 不填 0：snapshot 中 `energies={}`，top-level warning 为 `missing_section`。
- [x] extxyz energy 继续按 eV 转 hartree：测试用 `EV_TO_HARTREE` 校验。
- [x] unsupported bad count 不进入 executable fixtures：测试明确断言。
- [x] parser runtime contract 未扩展：本 feature 的新增挂载点只在 `tests/fixtures/parsers/` 和 `tests/test_parser_fixture_harness.py`。

## 3. 验收场景核对

- [x] **S1**：manifest 中新增 standard XYZ geometry-only fixture，source 为 synthetic，`support_status=supported`。
  - 证据：`test_xyz_extxyz_manifest_entries_and_executable_status`
- [x] **S2**：standard XYZ snapshot `parse_ok=true`，object_count=1，elements 为 `["O", "H", "H"]`，top-level warning_codes 包含 `missing_section`。
  - 证据：`test_xyz_extxyz_snapshots_cover_expected_fields`
- [x] **S3**：manifest 中新增 extxyz energy/charge/spin fixture，source 为 synthetic，`support_status=supported`。
  - 证据：`test_xyz_extxyz_manifest_entries_and_executable_status`
- [x] **S4**：extxyz energy/charge/spin snapshot 固定 label、charge、spin_multiplicity、geometry、`electronic` energy 和 warning_codes。
  - 证据：`test_xyz_extxyz_snapshots_cover_expected_fields`
- [x] **S5**：extxyz energy value 为 hartree，数值等于 eV 输入乘以 `EV_TO_HARTREE`，warning_codes 包含 `unit_assumed`。
  - 证据：`test_xyz_extxyz_snapshots_cover_expected_fields`
- [x] **S6**：manifest 中新增 extxyz missing energy fixture，`support_status=partial`，snapshot `parse_ok=true`、`energies={}`、warning_codes 包含 `missing_section`。
  - 证据：`test_xyz_extxyz_manifest_entries_and_executable_status`、`test_xyz_extxyz_snapshots_cover_expected_fields`
- [x] **S7**：manifest 中新增 bad atom count fixture，`support_status=unsupported`，targeted test 断言 snapshot `parse_ok=false` 且 error.code=`parse_failed`。
  - 证据：`test_bad_xyz_count_expected_error_snapshot`
- [x] **S8-S10**：新增 fixture file / snapshot 均为 corpus 内相对路径；supported / partial 进入 executable fixtures；unsupported bad count 不进入 executable fixtures；snapshot 不保存完整轨迹。
  - 证据：`test_xyz_extxyz_manifest_entries_and_executable_status`、`test_executable_fixtures_match_golden_snapshots`、snapshot 文件人工核对
- [x] **S11-S14**：未新增真实第三方 XYZ/extxyz 文件或用户数据；未修改 `rxnflow.parsers.xyz` 公共 contract；未调用范围外服务；未新增 CLI/Web/桌面/外部计算。
  - 证据：`test_scope_guards_keep_harness_out_of_runtime_workflows`、`test_fixture_corpus_excludes_system_and_large_runtime_files`

前端改动：无。

## 4. 术语一致性

- Standard XYZ Fixture：manifest 使用 `program=xyz`、`format=xyz`，一致。
- ASE extxyz Fixture：manifest 使用 `program=ase-extxyz`、`format=extxyz`，一致。
- Geometry-only XYZ：通过 `task=geometry` 与 `missing_section` warning 表达缺 energy，未误写为 0。
- extxyz Energy Metadata：snapshot 使用 `EnergyValue(unit="hartree", reference="extxyz energy converted from eV")`。
- Bad XYZ Count Fixture：manifest 中为 `support_status=unsupported`，snapshot 中为 `parse_ok=false`。
- 防冲突：没有新增 runtime parser API、Project/Import/Registry/Graph/Energy/Export 概念。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`
  - 已把 Parser Fixture Corpus 从“synthetic MAPLE 输入和 golden snapshot”更新为包含 synthetic MAPLE、standard XYZ、ASE extxyz 和 bad XYZ expected-error 样例。
  - 已补关键架构决定：当前 corpus 只固定 synthetic/file-level 解析语义，不声明真实第三方输出完整支持矩阵。
  - 已把待补项收紧为真实 Gaussian/ORCA/MAPLE fixture coverage、XYZ/extxyz 支持版本边界和字段覆盖矩阵。
- [x] `.codestable/architecture/core-platform.md`
  - 已补 Parser Plugins 基线第 6 点：测试侧 Parser Fixture Harness 现在覆盖 MAPLE、XYZ、extxyz 和 expected-error。
  - 已补 ParserFixtureHarness 模块树中的 fixture files / snapshots。
  - 已补 `tests/fixtures/parsers/` 模块说明。
- [x] `AGENTS.md`
  - 不需要更新。本 feature 没有新增跨所有后续任务都必须遵守的协作规则。

## 6. requirement 回写

- [x] 无 requirement 回写。
  - 方案 frontmatter `requirement: null`。
  - 本 feature 是 parser 测试覆盖增强，不新增用户可见导入 UI 或 import workflow 行为。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-items.yaml`
  - `xyz-extxyz-fixture-coverage` 已从 `in-progress` 改为 `done`，feature 指向 `2026-05-15-xyz-extxyz-fixture-coverage`。
- [x] `.codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-roadmap.md`
  - 第 5 节子 feature 清单已同步 `xyz-extxyz-fixture-coverage` 状态为 done 和对应 feature。
  - 第 6 节排期已改为 XYZ/extxyz coverage 已完成，第二阶段剩余 Gaussian / ORCA / MAPLE coverage。
  - 第 7 节观察项已更新为 harness 与 XYZ/extxyz synthetic coverage 已落地，支持矩阵仍待补。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 没有新增环境要求、平台执行方式、永久工作流规则或强制协作边界。

## 9. 遗留

- 后续优化点：`gaussian-cclib-fixture-coverage`、`orca-cclib-fixture-coverage`、`maple-fixture-coverage` 仍需补真实或最小可再分发样例。
- 已知限制：XYZ/extxyz 当前是 synthetic coverage，尚未形成正式支持矩阵，也未声明 ASE extxyz 的版本/字段完整边界。
- 已知限制：cell、pbc、forces、stress、magmom 等 extxyz 字段仍不在领域模型中。
- 实现阶段顺手发现：无需要另开 issue 的意外问题。
