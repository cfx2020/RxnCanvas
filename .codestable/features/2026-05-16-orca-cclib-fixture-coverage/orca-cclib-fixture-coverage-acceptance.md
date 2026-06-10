# ORCA cclib Fixture Coverage 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-16
> 关联方案 doc：.codestable/features/2026-05-16-orca-cclib-fixture-coverage/orca-cclib-fixture-coverage-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层：

- [x] `orca-sp-water-synthetic-minimal` manifest entry 已落地：`program=orca`、`format=orca-output`、`parser_id=orca-output-cclib`、`parse_options.expected_format=orca-output`。
- [x] `Synthetic ORCA Output` 已落地：`tests/fixtures/parsers/files/orca/orca-sp-water-synthetic-minimal.out` 为项目自有最小 ORCA 风格输出，不来自真实 ORCA/cclib-data。
- [x] `parser-golden-v1` snapshot 已落地：`tests/fixtures/parsers/snapshots/orca-sp-water-synthetic-minimal.json` 固定 object_count、provenance、charge/spin、method、geometry sample、energy 和 warning codes。
- [x] `ORCA Missing Energy Boundary` 已落地：targeted test 覆盖缺 `scfenergies` 时返回 parse success + `missing_section` warning，且不生成 0 energy。

流程图核对：synthetic ORCA output → manifest → fixture harness → ParserRegistry.default → OrcaOutputPlugin → cclib.io.ccread → ChemicalObjectDraft → golden snapshot 的链路在测试中完整运行。

## 2. 行为与决策核对

- [x] Success path 使用真实 cclib parser：`test_executable_fixtures_match_golden_snapshots` 和 `test_orca_snapshot_covers_expected_fields` 都通过 `ParserRegistry.default()` 读取本地 `.out` 文件。
- [x] ORCA DFT method 不退化为泛称 `DFT`：`_method_from_metadata()` 在 cclib method 为 `DFT` 时优先使用 `metadata.functional`，否则从已知 `metadata.keywords` functional token 恢复 `B3LYP`。
- [x] 未知 DFT keyword 仍回退 `DFT`：`test_orca_unknown_dft_keyword_falls_back_to_dft` 覆盖该边界。
- [x] 能量单位仍沿用既有策略：snapshot 中 `electronic` unit 为 `hartree`，reference 为 `cclib scfenergies converted from eV`。
- [x] 范围外事项未做：未提交真实 ORCA 输出、cclib-data output、`.gbw`、`.hess` 或用户路径；未新增 CLI/Web/desktop 入口；未调用 Project/Import/Registry/Graph/Energy/Export。
- [x] 挂载点反向核对完成：新增引用集中在 ORCA fixture file、snapshot、manifest entry、fixture harness tests 和 `_method_from_metadata()` 限定修正。

拔除沙盘推演：删除上述五个挂载点后，ORCA fixture coverage 和 ORCA keyword functional 恢复消失；ParserRegistry、Project Store、Import Workflow、Chemical Registry、ReactionGraph、Energy Engine、Report Export 与 Platform Shell 不需要回退。

## 3. 验收场景核对

- [x] S1 manifest 新增 ORCA supported fixture。证据：`test_orca_manifest_entry_and_executable_status`。
- [x] S2 ORCA fixture 进入 executable fixtures 并由 ParserRegistry 解析成功。证据：`test_executable_fixtures_match_golden_snapshots`。
- [x] S3 snapshot 固定 parser id、object_count、charge/spin、method、元素、atom_count 和 geometry sample。证据：`test_orca_snapshot_covers_expected_fields`。
- [x] S4 snapshot 固定 electronic energy key、unit、reference 和数值。证据：`test_orca_snapshot_covers_expected_fields`。
- [x] S5 thermochemistry 当前未映射。证据：ORCA snapshot `thermochemistry_keys=[]`。
- [x] S6 missing energy 不写 0。证据：`test_orca_missing_energy_expected_warning`。
- [x] S7 corpus 安全边界。证据：`test_fixture_corpus_excludes_system_and_large_runtime_files`、`test_orca_fixture_is_synthetic_and_redacted`。

验证命令：

- `python3 -m unittest tests.test_parser_fixture_harness`：26 tests OK。
- `python3 -m unittest discover`：199 tests OK。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-items.yaml --yaml-only`：passed。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-16-orca-cclib-fixture-coverage/orca-cclib-fixture-coverage-checklist.yaml --yaml-only`：passed。

## 4. 术语一致性

- ORCA cclib Fixture：代码和 manifest 使用 `orca-output-cclib` / `orca-output`，与方案一致。
- Synthetic ORCA Output：fixture 路径和 source policy 均使用 synthetic / project-test-fixture。
- ORCA Keyword Functional：只在 `_method_from_metadata()` 内作为 DFT method 恢复规则存在，没有扩散为 runtime public API。
- ORCA Missing Energy Boundary：测试名和行为均指向 missing energy warning，不改变 parser error contract。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：Parser Fixture Corpus、已落地模块、关键架构决定和待补项已同步为 Gaussian/ORCA synthetic cclib coverage 已有，真实版本/字段矩阵仍待补。
- [x] `.codestable/architecture/core-platform.md`：tags、当前能力、ParserFixtureHarness 结构、测试 corpus 说明和 cclib method 映射约束已同步。

## 6. requirement 回写

- [x] 无 requirement 回写。该 feature 是 parser 测试覆盖增强和限定 parser field 映射修正，不改变导入 UI、Import Registry Workflow 或用户可见登记语义。format support requirement 仍留到 support matrix / import preview regression 后 backfill。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-items.yaml`：`orca-cclib-fixture-coverage` 已从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-roadmap.md`：第 5 节子 feature 清单和第 6 节排期说明已同步。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露需要写入 AGENTS.md 的新环境、工具或协作约束。

## 9. 遗留

- 真实 ORCA 版本/任务/字段支持矩阵仍未实现，后续由 `parser-support-matrix-diagnostics` 承接。
- 真实 ORCA output 或用户样例进入仓库前仍需单独确认脱敏、许可证和 source policy。
- 下一条 roadmap 可继续 `maple-fixture-coverage`，补 MAPLE `.out` / multi-frame `.xyz` 覆盖。
