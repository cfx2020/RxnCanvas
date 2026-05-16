---
doc_type: feature-acceptance
feature: 2026-05-15-gaussian-cclib-fixture-coverage
status: accepted
accepted_at: 2026-05-16
summary: 验收 Gaussian cclib synthetic fixture coverage，确认 manifest、golden snapshot、method 映射、错误边界、范围守护、架构归并和 roadmap 回写均已落地
tags: [parser, gaussian, cclib, fixture-corpus, acceptance]
---

# Gaussian cclib Fixture Coverage 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-16
> 关联方案 doc：`codestable/features/2026-05-15-gaussian-cclib-fixture-coverage/gaussian-cclib-fixture-coverage-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `load_parser_fixture_manifest(Path("tests/fixtures/parsers/manifest.yaml"))`
  - 结果：一致。manifest 现在加载 6 个 fixture，新增 Gaussian 条目为 synthetic source policy，并进入 executable fixtures。
- [x] `assert_parser_fixture_snapshot(ParserRegistry.default(), fixture)`
  - 结果：一致。`gaussian-sp-water-synthetic-minimal` 通过默认 ParserRegistry 调用真实 cclib parser，并与 `parser-golden-v1` snapshot 比较。
- [x] `GaussianLogPlugin(backend=missing_geometry_backend).parse(...)`
  - 结果：一致。缺少 `atomcoords` 的 cclib data shape 返回 `parse_failed`，不生成 partial object。

**名词层变化核对**

- [x] Gaussian cclib Fixture：已落地 `tests/fixtures/parsers/files/gaussian/gaussian-sp-water-synthetic-minimal.log`。
- [x] Synthetic Gaussian Log：新增文件为项目自有最小测试日志，不来自 cclib-data、Gaussian 软件真实输出或用户日志。
- [x] cclib-data Reference：只写入 design 调研依据，没有 vendor cclib-data log。
- [x] Gaussian Field Boundary：snapshot 固定 charge、spin_multiplicity、method、geometry、electronic energy 和 `thermochemistry_keys=[]`。
- [x] Gaussian Missing Geometry Fixture：以 targeted fake-backend test 固定错误边界，不进入 manifest executable loop。

**流程图核对**

- [x] `Synthetic Gaussian log -> manifest entry -> ParserFixtureHarness -> RawFile + ParseOptions -> ParserRegistry.default -> GaussianLogPlugin -> cclib.io.ccread -> ChemicalObjectDraft projection -> parser-golden-v1 snapshot` 已落地。
- [x] `GaussianLogPlugin -> targeted missing-geometry error test` 已落地。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] Gaussian/cclib 文件级样例已进入 fixture corpus。
- [x] fake cclib data 之外的真实 ParserRegistry + cclib parse 路径已被 golden snapshot 覆盖。
- [x] 首批字段边界已固定：charge/spin/method/geometry/electronic energy/thermochemistry absence。

**明确不做逐项核对**

- [x] 不提交真实 Gaussian 软件输出、cclib-data log 或用户日志：新增 `.log` 是 synthetic，并有 redaction guard。
- [x] 不覆盖 Gaussian 03/09/16 真实版本矩阵、Link1、compound job、scan、IRC、freq、ONIOM 或 failed job 组合。
- [x] 不解析 Gaussian thermochemistry、frequencies、basis set、solvent、imaginary frequency、MO、charge population 或 route section 语义。
- [x] 不新增 CLI、Web route、桌面入口、外部 Gaussian/cclib-data 下载流程或自动 snapshot 更新命令。
- [x] 不调用 ProjectStore、ImportRegistryWorkflow、ChemicalRegistry、ReactionGraphService、EnergyProfileEngine、ReportExportService、PlatformShellService 或 ProjectBundleService。

**关键决策落地**

- [x] 首轮用 synthetic log，不 vendor cclib-data：manifest source 为 `synthetic`，fixture 文本不含 cclib-data、路径、checkpoint、license banner 等真实运行信息。
- [x] ParserRegistry 路径真实运行 cclib：`test_executable_fixtures_match_golden_snapshots` 覆盖所有 supported / partial fixture，Gaussian snapshot 由真实 `.log` 文件生成。
- [x] method 固定为 `B3LYP`：实现阶段发现 cclib 返回 `methods=["DFT"]`、`functional="B3LYP"`，已把 `_method_from_metadata()` 限定修正为 DFT 时优先使用 `metadata.functional`。
- [x] energy unit 策略不变：snapshot 固定 hartree unit 和 `cclib scfenergies converted from eV` reference。
- [x] thermochemistry 不造字段：snapshot 固定 `thermochemistry_keys=[]`。

**挂载点反向核对**

- [x] M1：`tests/fixtures/parsers/files/gaussian/gaussian-sp-water-synthetic-minimal.log` 已落地。
- [x] M2：`tests/fixtures/parsers/snapshots/gaussian-sp-water-synthetic-minimal.json` 已落地。
- [x] M3：`tests/fixtures/parsers/manifest.yaml` 中新增 Gaussian fixture entry。
- [x] M4：`tests/test_parser_fixture_harness.py` 中新增 Gaussian manifest、snapshot、missing geometry 和 synthetic guard coverage。
- [x] 方案外但必要的限定修复：`rxnflow/parsers/cclib_adapter.py::_method_from_metadata`，用于让 snapshot 暴露出的 Gaussian DFT functional 不退化为 `DFT`；该改动仍在 parser 行为范围内，没有新增 public contract。
- [x] 拔除沙盘推演：删除 M1-M4 和 `_method_from_metadata` 修正后，本 feature 的 Gaussian corpus coverage 消失；ParserRegistry、Project/Import/Registry/Graph/Energy/Export/Platform Shell 不需要回退。

## 3. 验收场景核对

- [x] **S1**：manifest 中新增 `gaussian-sp-water-synthetic-minimal`，source 为 synthetic，`support_status=supported`。
  - 证据：`test_gaussian_manifest_entry_and_executable_status`
- [x] **S2**：Gaussian fixture 的 program / format / parser_id / expected_format 均正确。
  - 证据：`test_gaussian_manifest_entry_and_executable_status`
- [x] **S3**：Gaussian fixture 进入 executable fixtures，并由 `ParserRegistry.default()` 解析成功。
  - 证据：`test_executable_fixtures_match_golden_snapshots`
- [x] **S4**：snapshot `parse_ok=true`、`object_count=1`、`provenance.parser_id=gaussian-log-cclib`。
  - 证据：`test_gaussian_snapshot_covers_expected_fields`
- [x] **S5**：snapshot 对象固定 label、charge、spin、method、elements、atom_count 和 geometry sample。
  - 证据：`test_gaussian_snapshot_covers_expected_fields`
- [x] **S6**：snapshot 固定 `energy_keys=["electronic"]`、hartree unit、cclib eV 转换 reference 和 expected value。
  - 证据：`test_gaussian_snapshot_covers_expected_fields`
- [x] **S7**：snapshot `thermochemistry_keys=[]`，当前 Gaussian thermochemistry 未映射。
  - 证据：`test_gaussian_snapshot_covers_expected_fields`
- [x] **S8**：missing geometry targeted test 返回 `parse_failed`，不泄漏 backend exception，也不生成 partial object。
  - 证据：`test_gaussian_missing_geometry_expected_error`
- [x] **S9-S10**：新增 fixture file / snapshot 均为 corpus 内相对路径；snapshot 只保存对象摘要和必要 geometry sample。
  - 证据：`load_parser_fixture_manifest` 安全路径校验、snapshot 文件人工核对
- [x] **S11-S15**：未提交真实 Gaussian 输出、cclib-data log 或用户日志；未新增版本矩阵；未新增 CLI/Web/桌面/外部计算/下载流程；未调用范围外服务。
  - 证据：`test_gaussian_fixture_is_synthetic_and_redacted`、`test_scope_guards_keep_harness_out_of_runtime_workflows`

前端改动：无。

## 4. 术语一致性

- Gaussian cclib Fixture：manifest 中使用 `program=gaussian`、`format=gaussian-log`、`parser_id=gaussian-log-cclib`，一致。
- Synthetic Gaussian Log：fixture 文件名、manifest notes 和 redaction guard 均按 synthetic 处理。
- cclib-data Reference：只出现在 design 调研说明中，没有进入 fixture files。
- Gaussian Field Boundary：snapshot 与测试命名一致。
- Gaussian Missing Geometry Fixture：以 test 名称和 fake backend 表达 targeted expected-error，未伪装成真实 corpus 文件。
- 防冲突：没有新增 runtime parser API 名词，没有改变 parser id 或 fixture manifest schema。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`
  - 已把 Parser Fixture Corpus 更新为包含 synthetic Gaussian cclib `.log`。
  - 已把 Core Platform 索引更新为 “Gaussian cclib 与 XYZ/extxyz synthetic fixture coverage”。
  - 已补 Gaussian DFT method 优先使用 cclib `metadata.functional` 的架构决定。
  - 已把待补项更新为真实 Gaussian/ORCA/MAPLE fixture coverage、Gaussian/XYZ/extxyz 支持版本边界和字段覆盖矩阵。
- [x] `codestable/architecture/core-platform.md`
  - 已补 Parser Plugins 基线和 ParserFixtureHarness 模块树中的 Gaussian synthetic fixture。
  - 已补 `tests/fixtures/parsers/` corpus 描述。
  - 已补 cclib adapter 当前能力边界：Gaussian DFT method 优先使用 `metadata.functional`。
- [x] `AGENTS.md`
  - 不需要更新。本 feature 没有新增跨所有后续任务都必须遵守的协作规则。

## 6. requirement 回写

- [x] 无 requirement 回写。
  - 方案 frontmatter `requirement: null`。
  - 本 feature 是 parser 测试覆盖增强，不新增用户可见导入 UI 或 import workflow 行为。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-items.yaml`
  - `gaussian-cclib-fixture-coverage` 已从 `in-progress` 改为 `done`，feature 指向 `2026-05-15-gaussian-cclib-fixture-coverage`。
- [x] `codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-roadmap.md`
  - 第 5 节子 feature 清单已同步 `gaussian-cclib-fixture-coverage` 状态为 done 和对应 feature。
  - 第 6 节排期已改为 XYZ/extxyz 与 Gaussian coverage 已完成，第二阶段剩余 ORCA / MAPLE coverage。
  - 第 7 节观察项已更新：当前 Gaussian coverage 是 synthetic log，不代表真实 Gaussian 输出支持矩阵。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新环境、工具或永久工作流规则。

## 9. 遗留

- 后续优化点：`orca-cclib-fixture-coverage`、`maple-fixture-coverage` 仍需补真实或最小可再分发样例。
- 已知限制：Gaussian 当前仅有 synthetic cclib fixture coverage，尚未形成真实 Gaussian 03/09/16 版本、任务和字段支持矩阵。
- 已知限制：Gaussian thermochemistry、frequency、basis、solvent、imaginary frequency、MO 和 population 等字段仍未映射到 `ChemicalObjectDraft`。
- 实现阶段顺手发现：cclib-data / Gaussian 真实输出再分发边界需要在真实 fixture feature 中继续确认。
