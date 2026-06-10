---
doc_type: feature-acceptance
feature: 2026-05-15-parser-fixture-harness
status: accepted
accepted_at: 2026-05-15
summary: 验收 parser fixture harness，确认 manifest、synthetic MAPLE fixture、golden snapshot、snapshot assertion、范围守护、架构归并和 roadmap 回写均已落地
tags: [parser, fixture-corpus, golden-snapshot, acceptance]
---

# Parser Fixture Harness 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-15
> 关联方案 doc：`.codestable/features/2026-05-15-parser-fixture-harness/parser-fixture-harness-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `load_parser_fixture_manifest(path: Path) -> ParserFixtureManifest`
  - 代码落点：`tests/parser_fixture_harness.py`
  - 结果：一致。读取 `parser-fixtures-v1` YAML，返回 fixture dataclass，并校验 schema、重复 id、source policy 和相对路径安全。
- [x] `assert_parser_fixture_snapshot(registry, fixture, update=False)`
  - 代码落点：`tests/parser_fixture_harness.py`
  - 结果：一致。默认只读取 snapshot 并比较；`update=True` 才重写 snapshot。
- [x] `ParserRegistry.default().parse(RawFile(path=fixture.file), fixture.parse_options)`
  - 代码落点：`tests/parser_fixture_harness.py` + `tests/test_parser_fixture_harness.py`
  - 结果：一致。synthetic MAPLE `.out` 通过默认 parser registry 解析并匹配 golden snapshot。

**名词层变化核对**

- [x] Parser Fixture Corpus：已落地 `tests/fixtures/parsers/manifest.yaml`、`files/maple/maple-sp-synthetic-minimal.out` 和 `snapshots/maple-sp-synthetic-minimal.json`。
- [x] Fixture Manifest：已落地 `parser-fixtures-v1` YAML，包含 id、program、format、task、parser_id、source、parse_options、expected_snapshot、tolerances、support_status、tags、notes。
- [x] Golden Snapshot：已落地 `parser-golden-v1` JSON，包含 parse_ok、object_count、provenance、对象摘要、energy keys、energies、thermochemistry_keys、warning_codes。
- [x] Parser Fixture Harness：已落地测试侧 helper，不进入 `rxnflow.parsers` runtime API。
- [x] Source Policy：loader 对 `redistributable=false` + 本地 file、unsafe path、重复 id 做失败保护。
- [x] Snapshot Projection：从 `Result[ParseResult]` 投影稳定 JSON，默认只保存对象摘要和第一个坐标 sample。

**流程图核对**

- [x] `manifest.yaml -> load_parser_fixture_manifest -> ParserFixture objects -> RawFile + ParseOptions -> ParserRegistry.parse -> snapshot projection -> compare/update` 调用链已落地。
- [x] `update=False` 默认比较 snapshot；`update=True` 显式写入 snapshot。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] 建立 parser fixture corpus 最小骨架：`tests/fixtures/parsers/` 已存在并包含 manifest、输入文件和 snapshot。
- [x] 后续格式 coverage feature 可复用同一 helper：`ParserFixtureManifest.executable_fixtures()` 和 `assert_parser_fixture_snapshot()` 已按 manifest 驱动。
- [x] 首个闭环使用 synthetic fixture：当前只新增 synthetic MAPLE `.out`，没有 vendoring 第三方真实输出。

**明确不做逐项核对**

- [x] 不添加 Gaussian / ORCA / MAPLE 真实样例 corpus：新增文件只有 synthetic MAPLE 最小文本。
- [x] 不 vendor ClickFF/MAPLE examples、cclib examples 或用户真实日志：fixture source 标记为 `synthetic`。
- [x] 不设计完整 support matrix：未新增 `support-matrix.yaml`。
- [x] 不新增 runtime parser format、warning code 或 parser registry 行为：`rxnflow/parsers/*` 未改。
- [x] 不接 CLI、Platform Shell、ProjectStore、ImportRegistryWorkflow、ChemicalRegistry、ReactionGraphService、EnergyProfileEngine 或 ReportExportService：scope guard 测试覆盖。
- [x] 不保存完整原始输出或完整坐标轨迹到 snapshot：snapshot 仅保存最小 synthetic 输出和第一个 geometry sample。

**关键决策落地**

- [x] Harness 放在测试边界：helper 位于 `tests/parser_fixture_harness.py`。
- [x] Manifest 使用 YAML、snapshot 使用 JSON：对应文件已落地。
- [x] 不自动更新 snapshot：`test_snapshot_assertion_passes_default_registry_without_writing` 覆盖。
- [x] 首轮只支持 positive parse snapshot：当前 manifest 只有 `support_status=supported` 的成功样例。
- [x] parser_version 不做强失败锚点：比较逻辑跳过 `provenance.parser_version` 字段。
- [x] 浮点比较由 manifest 控制：energy value 和 geometry sample 坐标分别使用 `energy_abs`、`coordinate_abs`。
- [x] source policy 必填：测试覆盖 non-redistributable local file、unsafe path 和重复 id。
- [x] 不改 runtime parser 行为：`rxnflow/parsers` 未新增 harness export。

**挂载点反向核对**

- [x] 挂载点 M1：`tests/fixtures/parsers/manifest.yaml`。
- [x] 挂载点 M2：`tests/fixtures/parsers/files/maple/maple-sp-synthetic-minimal.out`。
- [x] 挂载点 M3：`tests/fixtures/parsers/snapshots/maple-sp-synthetic-minimal.json`。
- [x] 挂载点 M4：`tests/parser_fixture_harness.py`。
- [x] 挂载点 M5：`tests/test_parser_fixture_harness.py`。
- [x] 反向 grep：`parser_fixture_harness` 只命中测试 helper / 测试文件 / 架构文档，不进入 runtime parser API。
- [x] 拔除沙盘推演：删除上述 5 个挂载点后，本 feature 无运行时残留；ParserRegistry、ProjectStore、Import Workflow、Registry、Graph、Energy、Export、Platform Shell 不需要回退。

## 3. 验收场景核对

- [x] **S1**：`tests/fixtures/parsers/manifest.yaml` 存在，`schema_version=parser-fixtures-v1`，至少包含一个 supported synthetic fixture。
  - 证据：`test_manifest_loads_synthetic_fixture_and_parse_options`
- [x] **S2**：fixture source 为 synthetic、redistributable=true、redaction=none，file/snapshot 是 corpus 内相对路径。
  - 证据：`test_manifest_loads_synthetic_fixture_and_parse_options` + `test_loader_rejects_unsafe_fixture_paths`
- [x] **S3**：loader 能读取 fixture 并把 parse_options 转成 `ParseOptions`。
  - 证据：`test_manifest_loads_synthetic_fixture_and_parse_options`
- [x] **S4**：snapshot test 用 `ParserRegistry.default()` 解析 supported fixture，`parse_ok=true` 且 parser_id 一致。
  - 证据：`test_snapshot_projection_matches_golden_snapshot`
- [x] **S5**：snapshot projection 包含 object_count、provenance.parser_id、label、method、atom_count、elements、energy_keys、energies、thermochemistry_keys、warning_codes。
  - 证据：`test_snapshot_projection_matches_golden_snapshot`
- [x] **S6**：energy value / geometry sample 坐标使用 manifest tolerances 比较。
  - 证据：`_tolerance_for_path()` + `test_snapshot_assertion_passes_default_registry_without_writing`
- [x] **S7**：普通测试不会重写 snapshot；显式 `update=True` 才写文件。
  - 证据：`test_snapshot_assertion_passes_default_registry_without_writing`、`test_snapshot_update_requires_explicit_update_true`
- [x] **S8**：bad schema version 失败。
  - 证据：`test_loader_rejects_bad_schema_version`
- [x] **S9**：fixture id 重复失败。
  - 证据：`test_loader_rejects_duplicate_fixture_id`
- [x] **S10**：file / expected_snapshot 绝对路径、`..` 或反斜杠逃逸失败。
  - 证据：`test_loader_rejects_unsafe_fixture_paths`
- [x] **S11**：`redistributable=false` + 本地 file 失败。
  - 证据：`test_loader_rejects_non_redistributable_local_file`
- [x] **S12**：`support_status=reference-only` 不进入默认 executable fixtures。
  - 证据：`test_reference_only_fixture_is_not_executable`
- [x] **S13**：snapshot parser_id mismatch 失败。
  - 证据：`test_snapshot_assertion_fails_on_parser_id_mismatch`
- [x] **S14**：parser 返回失败但 snapshot 声明成功时失败。
  - 证据：`test_snapshot_assertion_fails_when_parser_fails_expected_success`
- [x] **S15-S19**：未新增真实第三方输出、未进入 runtime API、未调用范围外服务、未新增 CLI/Web/桌面/外部计算、fixture corpus 无 `.DS_Store` 或大型运行时文件。
  - 证据：`test_scope_guards_keep_harness_out_of_runtime_workflows`、`test_fixture_corpus_excludes_system_and_large_runtime_files`

前端改动：无。

## 4. 术语一致性

- Parser Fixture Corpus：目录和文档使用 `tests/fixtures/parsers/`，一致。
- Fixture Manifest：代码中为 `ParserFixtureManifest`，schema 为 `parser-fixtures-v1`，一致。
- Golden Snapshot：schema 为 `parser-golden-v1`，一致。
- Parser Fixture Harness：代码落点为 `tests/parser_fixture_harness.py`，一致。
- Source Policy：代码中为 `ParserFixtureSource`，字段与 design 一致。
- Snapshot Projection：函数名 `project_parser_fixture_snapshot` 表达投影行为；未引入冲突概念。
- 防冲突：`rxnflow/parsers/__init__.py` 未导出 harness；`rxnflow/parsers/*` 未改。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`
  - 已补 Parser Fixture Corpus、Fixture Manifest、Golden Snapshot 术语。
  - 已把 Core Platform 索引扩展为“首批 Parser Plugins 与 parser fixture harness”。
  - 已补 harness 只在测试边界、不进入 runtime parser API 的关键架构决定。
  - 已把待补项收紧为真实 fixture coverage、支持版本边界和字段覆盖矩阵。
- [x] `.codestable/architecture/core-platform.md`
  - 已补 Parser Plugins 基线第 6 点：测试侧 Parser Fixture Harness。
  - 已补 ParserFixtureHarness 模块树和 `tests/parser_fixture_harness.py` 模块说明。
  - 已补 harness 不调用 runtime workflows 的边界。
- [x] `AGENTS.md`
  - 不需要更新。本 feature 没有新增跨所有后续任务都必须遵守的协作规则。

## 6. requirement 回写

- [x] 无 requirement 回写。
  - 方案 frontmatter `requirement: null`。
  - 本 feature 是测试基础设施，不新增用户可见导入行为；用户可见能力会在后续 format coverage 和 import preview regression 中形成。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-items.yaml`
  - `parser-fixture-harness` 已从 `in-progress` 改为 `done`，feature 指向 `2026-05-15-parser-fixture-harness`。
- [x] `.codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-roadmap.md`
  - 第 5 节子 feature 清单已同步 `parser-fixture-harness` 状态为 done 和对应 feature。
  - 第 6 节排期已改为第一阶段已完成。
  - 第 7 节观察项已更新为 harness 已落地、真实 format coverage / 支持矩阵仍待补。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新环境、工具或工作流规则。

## 9. 遗留

- 后续优化点：`xyz-extxyz-fixture-coverage`、`gaussian-cclib-fixture-coverage`、`orca-cclib-fixture-coverage`、`maple-fixture-coverage` 将复用本 harness 补真实或可再分发样例。
- 已知限制：当前 corpus 只有 synthetic MAPLE 最小样例，不声明真实 Gaussian/ORCA/MAPLE 版本支持。
- 已知限制：当前 harness 先覆盖 positive parse snapshot；unsupported / partial / expected error 的完整矩阵留给 `parser-support-matrix-diagnostics`。
- 实现阶段顺手发现：无需要另开 issue 的意外问题。
