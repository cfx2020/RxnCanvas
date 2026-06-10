# MAPLE Public Example Inventory 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：.codestable/features/2026-05-21-maple-public-example-inventory/maple-public-example-inventory-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `ParserSupportMatrixEntry` 已增加 `candidate_file_ids: tuple[str, ...]`。
- [x] `SUPPORT_MATRIX_ENTRY_STATUSES` 已增加 `candidate`。
- [x] `load_parser_support_matrix(..., source_inventory=inventory)` 会校验 `candidate_file_ids` 指向 source inventory 中 `fixture_policy: candidate` 的 file id。
- [x] `sources.yaml` 已增补 MAPLE scan、NEB、String、MD、frequency 等代表文件。
- [x] `support-matrix.yaml` 已增加 `maple-output-public-candidates`、`maple-scan-reference`、`maple-path-family-reference`、`maple-md-artifacts-reference` 和 `maple-frequency-reference`。

流程图核对：MAPLE example file facts 写入 `sources.yaml`，再由 `support-matrix.yaml` 的 `candidate_file_ids` / `reference_file_ids` 链接，最后由 `load_parser_support_matrix(..., source_inventory=inventory)` 执行 candidate/reference policy guard。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] `sources.yaml` 已覆盖 MAPLE sp、opt、scan、NEB、String、IRC、MD、frequency 代表 file ids。
- [x] MAPLE sp/opt 候选文件进入 `maple-output-public-candidates.candidate_file_ids`，并且 `fixture_ids` 和 `reference_file_ids` 为空。
- [x] MAPLE scan/path/MD/frequency 文件进入 reference-only entries 的 `reference_file_ids`，不进入 executable `fixture_ids`。
- [x] loader 能拒绝未知 candidate file、reference-only file 放入 candidate links、candidate file 放入 reference links。
- [x] `reference_only_entries()` 仍只返回 `status: reference-only` entries，不返回 `maple-output-public-candidates`。

明确不做核对：

- [x] 未新增 MAPLE executable fixture。
- [x] 未复制 MAPLE public example 文件进 `tests/fixtures/parsers/files/`；该目录仍只有 synthetic MAPLE fixture 和项目内 extxyz/xyz/cclib synthetic files。
- [x] 未在本 feature 修改 parser runtime、ImportRegistryWorkflow、Platform Shell 或 Web UI；相关 dirty worktree 文件属于此前步骤，不纳入本 feature 验收范围。
- [x] 未声明 MAPLE scan/path/MD/frequency 已支持，只记录为 source-backed reference-only。
- [x] 未解决 MAPLE license 再分发判断；MAPLE source 仍为 `review-required`。

关键决策落地：

- [x] candidate/reference 分流：sp/opt 小文件是 candidate，scan/path/MD/frequency 是 reference-only。
- [x] support matrix 不宣称 runtime 支持：public MAPLE entries 使用 `candidate` 或 `reference-only`，没有 executable fixture。
- [x] 大文件保守：scan output、scan trajectory、MD trajectory 都保持 reference-only。
- [x] license review 不绕过：MAPLE source 的 redistributable default 没有改成 allowed。

挂载点反向核对：

- [x] 挂载点集中在 `tests/fixtures/parsers/sources.yaml`、`tests/fixtures/parsers/support-matrix.yaml`、`tests/parser_fixture_harness.py`、`tests/test_parser_fixture_harness.py`、`docs/dev/parser-fixture-corpus.md`、architecture 和 roadmap。
- [x] `rg "candidate_file_ids|maple-output-public-candidates|maple-scan-reference|maple-path-family-reference|maple-md-artifacts-reference|maple-frequency-reference"` 命中均落在上述挂载点或方案/验收文档中。
- [x] 拔除沙盘推演：删除新增 MAPLE source entries、support matrix entries、candidate link guard、tests 和 docs/architecture/roadmap 描述后，本 feature 行为消失，不需要改 parser runtime。

## 3. 验收场景核对

- [x] S1：MAPLE source 覆盖 sp、opt、scan、NEB、String、IRC、MD、frequency，由 `test_maple_public_example_inventory_splits_candidates_and_references` 覆盖。
- [x] S2：sp/opt candidate files 进入 `candidate_file_ids`，不进入 `reference_file_ids`，由同一测试覆盖。
- [x] S3：scan/path/MD/frequency files 进入 `reference_file_ids`，不进入 executable `fixture_ids`，由同一测试覆盖。
- [x] S4：`maple-output-public-candidates` entry 为 `status: candidate`，由同一测试覆盖。
- [x] S5：MAPLE scan/path/MD/frequency reference entries 均为 `status: reference-only`，由同一测试覆盖。
- [x] S6-S8：loader 拒绝未知 candidate file、reference-only file 放入 candidate links、candidate file 放入 reference links，由 parser fixture harness rejection tests 覆盖。
- [x] S9：`reference_only_entries()` 不返回 candidate entry，由 `test_maple_public_example_inventory_splits_candidates_and_references` 覆盖。
- [x] S10：docs/architecture 已明确 public inventory 不 vendor 文件、不新增 runtime parser 支持。

本 feature 无前端视觉改动，不需要浏览器验收。

## 4. 术语一致性

- MAPLE Public Example Inventory：design、support matrix、architecture 和 roadmap 中均指 source-backed inventory，不等于 parser 支持。
- Candidate File Link：统一使用 `candidate_file_ids`，且仅指向 `fixture_policy: candidate`。
- Reference File Link：统一使用 `reference_file_ids`，且仅指向 `fixture_policy: reference-only`。
- MAPLE Path Family：IRC/NEB/String/AutoNEB 仍是 reference-only，不生成 ReactionPath。
- MAPLE Non-object Artifact：MD/frequency/scan 衍生文件仍是 reference-only，不映射为 ChemicalObjectDraft。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已补 Parser Support Matrix 的 `candidate_file_ids` 语义，并说明 MAPLE public entries 只固定 fixture-backed/source-backed 边界。
- [x] `.codestable/architecture/core-platform.md`：已补 Parser Fixture Harness 对 support matrix `source_ids` / `candidate_file_ids` / `reference_file_ids` 的校验，以及 MAPLE scan/path/MD/frequency reference-only 边界。
- [x] `docs/dev/parser-fixture-corpus.md`：已补 `candidate` entry、`candidate_file_ids` 和 MAPLE source inventory 维护规则。

## 6. requirement 回写

无 requirement 回写。本 feature 是测试侧 parser corpus/source matrix inventory 能力，不新增用户可见产品能力。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-parser-real-output-compatibility/rxnflow-parser-real-output-compatibility-items.yaml`：`maple-public-example-inventory` 已标为 `done`，feature 指向 `2026-05-21-maple-public-example-inventory`。
- [x] `.codestable/roadmap/rxnflow-parser-real-output-compatibility/rxnflow-parser-real-output-compatibility-roadmap.md`：第 5 节子 feature 清单已同步状态和落地摘要。
- [x] roadmap YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的通用工作流信息。MAPLE source inventory 和 candidate/reference link 维护规则已进入 `docs/dev/parser-fixture-corpus.md`。

## 9. 遗留

- `maple-out-real-fixtures`：下一步可以从 `maple-output-public-candidates` 评估小型 MAPLE `.out` / final `.xyz` 是否能进入 executable fixture corpus。
- MAPLE public examples 仍是 `review-required`；vendor 前必须逐文件确认 license/redistribution 边界，必要时改用用户授权、脱敏或 synthetic-derived fixture。
- `maple-path-output-semantics`：scan/path/MD/frequency 仍需单独设计语义，不能在 parser fixture 中偷做 ReactionPath 或 MD/frequency mapping。

## 验证记录

- `python3 .codestable/tools/validate-yaml.py --file tests/fixtures/parsers/sources.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file tests/fixtures/parsers/support-matrix.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-21-maple-public-example-inventory/maple-public-example-inventory-checklist.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-parser-real-output-compatibility/rxnflow-parser-real-output-compatibility-items.yaml --yaml-only`：通过。
- `python3 -m unittest tests.test_parser_fixture_harness`：53 tests OK。
- `python3 -m unittest discover`：267 tests OK。
