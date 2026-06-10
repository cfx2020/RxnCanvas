# MAPLE Fixture Coverage 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-16
> 关联方案 doc：.codestable/features/2026-05-16-maple-fixture-coverage/maple-fixture-coverage-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层：

- [x] `maple-opt-synthetic-minimal` manifest entry 已落地：`program=maple`、`format=maple-output`、`task=opt`、`parser_id=maple-output`、`support_status=supported`。
- [x] `maple-irc-path-synthetic-minimal` manifest entry 已落地：`program=maple`、`format=maple-xyz`、`task=irc-path`、`parser_id=maple-output`、`support_status=partial`。
- [x] MAPLE opt `.out` snapshot 固定 last coordinate block 和 last energy。
- [x] MAPLE path `.xyz` snapshot 固定 3 个 frame objects、labels 和 Hartree electronic energies。
- [x] ClickFF/MAPLE example reference 已作为格式观察依据记录；未 vendor 真实 example outputs。

流程图核对：synthetic MAPLE `.out` / `.xyz` → manifest → fixture harness → ParserRegistry.default → MapleOutputPlugin → `.out` parser / `parse_xyz_frames` → golden snapshot 的链路在测试中完整运行。

## 2. 行为与决策核对

- [x] Success/partial path 使用 `ParserRegistry.default()` 读取本地 synthetic files，未使用 fake backend。
- [x] MAPLE `.out` 仍只映射 task、model、coordinates、Hartree energy。
- [x] MAPLE `.xyz` 识别已覆盖 examples 中观察到的 `Image N`、`Iter N Image M`、`Iteration N` comment 形态。
- [x] MAPLE path `.xyz` support_status 为 `partial`：只解析 frame-level objects，不建 IRC/NEB path topology。
- [x] `.sum`、AutoNEB tree JSON、MD thermo `.dat` 在本 feature 中标为 reference-only，不进入 manifest executable fixtures。
- [x] 范围外事项未做：未提交真实 ClickFF/MAPLE examples、未新增 MAPLE 支持矩阵、未调用外部 MAPLE、未触碰 Project/Import/Registry/Graph/Energy/Export。
- [x] 挂载点反向核对完成：新增引用集中在 MAPLE fixture files、snapshots、manifest entries、fixture harness tests、`MAPLE_XYZ_COMMENT_RE` 和 XYZ label projection。

拔除沙盘推演：删除上述挂载点后，MAPLE opt/path fixture coverage 和 MAPLE trajectory comment 扩展消失；ParserRegistry、Project Store、Import Workflow、Chemical Registry、ReactionGraph、Energy Engine、Report Export 与 Platform Shell 不需要回退。

## 3. 验收场景核对

- [x] S1 manifest 新增 MAPLE opt supported fixture。证据：`test_maple_manifest_entries_and_executable_status`。
- [x] S2 manifest 新增 MAPLE IRC/path partial fixture。证据：`test_maple_manifest_entries_and_executable_status`。
- [x] S3 两个新增 MAPLE fixtures 进入 executable fixtures 并解析成功。证据：`test_executable_fixtures_match_golden_snapshots`。
- [x] S4 opt snapshot 固定 parser id、object_count、label、method、last geometry sample 和 electronic energy。证据：`test_maple_snapshots_cover_expected_fields`。
- [x] S5 path snapshot 固定 labels `Image 0`、`Iter 1 Image 1`、`Iteration 7` 和每帧 energy。证据：`test_maple_snapshots_cover_expected_fields`。
- [x] S6 comment variants 能被 `MapleOutputPlugin` 识别为 `maple-xyz`。证据：`test_maple_path_comment_variants_are_detected_by_maple_plugin`。
- [x] S7 corpus 安全边界。证据：`test_fixture_corpus_excludes_system_and_large_runtime_files`、`test_maple_fixtures_are_synthetic_and_redacted`。

验证命令：

- `python3 -m unittest tests.test_parser_fixture_harness tests.test_parser_plugin_baseline`：43 tests OK。
- `python3 -m unittest discover`：203 tests OK。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-items.yaml --yaml-only`：passed。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-16-maple-fixture-coverage/maple-fixture-coverage-checklist.yaml --yaml-only`：passed。

## 4. 术语一致性

- MAPLE Output Fixture：代码和 manifest 使用 `maple-output`，与方案一致。
- MAPLE Trajectory XYZ Fixture：manifest 使用 `maple-xyz`，parser id 仍为 `maple-output`，与现有插件 id 一致。
- ClickFF/MAPLE Example Reference：只出现在 design/acceptance 中，不进入 fixture files。
- MAPLE Artifact Boundary：`.sum`、AutoNEB tree、MD thermo 和 path topology 均保持 reference-only / not modeled。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：Parser Fixture Corpus、已落地模块和待补项已同步为 MAPLE sp/opt `.out` 与 MAPLE path `.xyz` partial coverage 已有，真实 MAPLE 支持矩阵和 path topology 仍待补。
- [x] `.codestable/architecture/core-platform.md`：tags、当前能力、测试 corpus 说明和 MAPLE parser 字段边界已同步。

## 6. requirement 回写

- [x] 无 requirement 回写。该 feature 是 parser 测试覆盖增强和限定 parser comment 识别修正，不改变导入 UI、Import Registry Workflow 或用户可见登记语义。format support requirement 仍留到 support matrix / import preview regression 后 backfill。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-items.yaml`：`maple-fixture-coverage` 已从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-roadmap.md`：第 5 节子 feature 清单和第 6 节排期说明已同步。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露需要写入 AGENTS.md 的新环境、工具或协作约束。

## 9. 遗留

- ClickFF/MAPLE 真实 example outputs 未 vendor；后续如需纳入真实样例，必须先确认许可证、商业限制和脱敏策略。
- `.sum`、AutoNEB tree JSON、MD thermo `.dat`、IRC/NEB path topology 和 TS candidate 语义仍未解析。
- 下一条 roadmap 是 `parser-support-matrix-diagnostics`：把已覆盖的 XYZ/extxyz、Gaussian、ORCA、MAPLE 样例整理为支持矩阵和 warning/error 诊断规范。
