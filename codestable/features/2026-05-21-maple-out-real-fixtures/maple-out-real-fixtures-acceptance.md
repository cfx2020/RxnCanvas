# MAPLE Out Real Fixtures 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：codestable/features/2026-05-21-maple-out-real-fixtures/maple-out-real-fixtures-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `manifest.yaml` 已新增 `maple-sp-public-shape-synthetic-derived` 和 `maple-opt-final-xyz-public-shape-synthetic-derived`。
- [x] 两个新增 fixture 都是 `source.kind: synthetic`，未使用 `vendored-third-party`，也没有 upstream `source_path/source_sha256/source_size_bytes`。
- [x] 两个新增 `parser-golden-v1` snapshots 已落地，固定 label、method、geometry sample、electronic energy 和 warning codes。
- [x] `support-matrix.yaml` 已新增 `maple-public-shape-regression`，`status: partial`，`source_ids=[maple-dev-example]`，`candidate_file_ids` 链接 public candidate，`fixture_ids` 链接项目内 synthetic-derived fixtures。
- [x] `maple-output-public-candidates` 仍为 `status: candidate`，`fixture_ids` 为空。

流程图核对：public candidate metadata 经过 license review gate 后走 synthetic-derived fallback；manifest、snapshot、support matrix 和 fixture/import-preview regression 均有实际落点。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] 已评估 MAPLE public examples：LICENSE 和输出 banner 存在 academic/commercial/all-rights-reserved 等再分发不确定文案，因此未复制原文件。
- [x] 新增 MAPLE `.out` shape fixture 能解析为 `MAPLE sp`，method 为 `sp uma`，electronic energy 为 hartree。
- [x] 新增 MAPLE final `.xyz` shape fixture 能解析为 `Image 0` frame-level object，electronic energy 为 hartree。
- [x] support matrix 使用 source/candidate links 记录 public shape 背景，但 fixture source 仍是项目内 synthetic。
- [x] import preview parser regression 已覆盖新增 executable fixtures，且 preview-only scope guard 仍阻止登记对象。

明确不做核对：

- [x] 未复制 `/tmp/rxnflow-maple/example/...` 原始文件。
- [x] 未把 MAPLE public examples 标为 `vendored-third-party` 或 `redistributable=true`。
- [x] 未修改 MAPLE parser runtime、ImportRegistryWorkflow、Platform Shell 或 Web UI。
- [x] 未声明 MAPLE public candidate 原文件已经解析通过。
- [x] 未支持 scan/path/MD/frequency、ReactionPath、TS、thermochemistry 或 correction 语义。

关键决策落地：

- [x] 许可证优先：不 vendor 原始 public examples。
- [x] source trace 不等于 vendor：`candidate_file_ids` 只说明参考形状来源，不替代 fixture coverage。
- [x] 最小形状覆盖：本步只覆盖 sp `.out` 与 opt final `.xyz`。
- [x] preview 回归同步：新增 executable fixtures 被 `manifest.executable_fixtures()` 纳入 import preview parser regression。

挂载点反向核对：

- [x] 挂载点集中在 `tests/fixtures/parsers/files/maple/`、`manifest.yaml`、`snapshots/*.json`、`support-matrix.yaml`、parser fixture/import-preview tests、docs/architecture/roadmap。
- [x] `rg "maple-public-shape|synthetic-derived|maple-sp-public-shape|maple-opt-final-xyz-public-shape"` 命中均落在上述挂载点或 feature 文档中。
- [x] 拔除沙盘推演：删除新增 fixture files、manifest entries、snapshots、support matrix entry、tests 和 docs 后，本 feature 行为消失，不需要改 parser runtime。

## 3. 验收场景核对

- [x] S1：manifest 包含两个新增 MAPLE synthetic-derived executable fixtures，由 `test_manifest_loads_synthetic_fixture_and_parse_options` 和 `test_maple_manifest_entries_and_executable_status` 覆盖。
- [x] S2：新增 fixtures 的 `source.kind` 是 `synthetic`，由 `test_maple_public_shape_regression_uses_synthetic_derived_fixtures` 覆盖。
- [x] S3：新增 `.out` fixture 解析出 `MAPLE sp`、`sp uma`、hartree energy，由 `test_maple_snapshots_cover_expected_fields` 覆盖。
- [x] S4：新增 final `.xyz` fixture 解析出 `Image 0`、hartree energy，由 `test_maple_snapshots_cover_expected_fields` 覆盖。
- [x] S5：`maple-public-shape-regression` entry 为 partial 且链接新增 fixtures，由 `test_maple_public_shape_regression_uses_synthetic_derived_fixtures` 覆盖。
- [x] S6：`maple-output-public-candidates` 保持 candidate 且 `fixture_ids` 为空，由 `test_maple_public_example_inventory_splits_candidates_and_references` 覆盖。
- [x] S7：import preview parser regression 覆盖新增 executable fixtures，由 `tests.test_import_preview_parser_regression` 全量 focused run 覆盖。
- [x] S8：MAPLE fixture files 不含 public example banner/copyright/license/all-rights-reserved 文案，由 `test_maple_fixtures_are_synthetic_and_redacted` 和 `rg` 覆盖。
- [x] S9：docs/architecture 已明确 synthetic-derived coverage，不是 public originals vendor 或完整真实版本支持。

本 feature 无前端视觉改动，不需要浏览器验收。

## 4. 术语一致性

- MAPLE Public Candidate：仍只表示 source inventory/support matrix candidate file id。
- Synthetic-derived Shape Fixture：manifest 中全部使用 `source.kind=synthetic`，tags 含 `synthetic-derived`。
- MAPLE Final XYZ Fixture：只产生 frame-level ChemicalObjectDraft，不生成 ReactionPath。
- MAPLE Public Shape Regression：support matrix partial entry，known_limits 明确 public originals 未 vendor。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：已补 Parser Fixture Corpus 现在包含 MAPLE public-shape synthetic-derived `.out` / final `.xyz`，并说明 public originals 未 vendor。
- [x] `codestable/architecture/core-platform.md`：已补当前测试侧 corpus 能力和真实第三方 MAPLE fixture 仍未实现的边界。
- [x] `docs/dev/parser-fixture-corpus.md`：已补 synthetic-derived fallback 规则，说明 license/banner 不稳时不能复制 public output 原文件。

## 6. requirement 回写

无 requirement 回写。本 feature 是测试侧 parser fixture corpus 能力，不新增用户可见产品能力。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-parser-real-output-compatibility/rxnflow-parser-real-output-compatibility-items.yaml`：`maple-out-real-fixtures` 已标为 `done`，feature 指向 `2026-05-21-maple-out-real-fixtures`。
- [x] `codestable/roadmap/rxnflow-parser-real-output-compatibility/rxnflow-parser-real-output-compatibility-roadmap.md`：第 5 节子 feature 清单已同步状态和 synthetic-derived fallback 备注。
- [x] roadmap YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的通用工作流信息。synthetic-derived fallback 规则已进入 `docs/dev/parser-fixture-corpus.md`。

## 9. 遗留

- MAPLE public original files 仍未 vendor；若后续确认可再分发或获得授权，需要另起 feature 使用 `vendored-third-party` source metadata。
- `maple-path-output-semantics` 仍需单独设计 MAPLE IRC/NEB/String/AutoNEB path `.xyz` 的 frame label、energy、direction/topology 语义。
- cclib Gaussian/ORCA 与 ASE extxyz 真实/公开 fixture 仍按 roadmap 后续条目推进。

## 验证记录

- `python3 codestable/tools/validate-yaml.py --file tests/fixtures/parsers/manifest.yaml --yaml-only`：通过。
- `python3 codestable/tools/validate-yaml.py --file tests/fixtures/parsers/support-matrix.yaml --yaml-only`：通过。
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-21-maple-out-real-fixtures/maple-out-real-fixtures-checklist.yaml --yaml-only`：通过。
- `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-parser-real-output-compatibility/rxnflow-parser-real-output-compatibility-items.yaml --yaml-only`：通过。
- `python3 -m unittest tests.test_parser_fixture_harness tests.test_import_preview_parser_regression`：58 tests OK。
- `rg "MAchine-learning Potential|University of Pittsburgh|Principal Developer|Copyright|license|Licensed under|All rights reserved|academic use|Commercial Use Prohibited|Creative Commons|ClickFF/MAPLE" tests/fixtures/parsers/files/maple`：无命中。
