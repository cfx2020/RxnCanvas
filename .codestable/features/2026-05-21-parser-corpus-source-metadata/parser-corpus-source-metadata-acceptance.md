# Parser Corpus Source Metadata 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：.codestable/features/2026-05-21-parser-corpus-source-metadata/parser-corpus-source-metadata-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `ParserFixtureSource` 已增加 `source_path`、`source_sha256`、`source_size_bytes`。
- [x] `source.kind=vendored-third-party` 时，loader 要求 `url`、`commit`、`source_path`、`source_sha256`、`source_size_bytes` 和 `redistributable=true`。
- [x] `ParserSupportMatrixEntry` 已增加 `source_ids` 和 `reference_file_ids`。
- [x] `ParserSourceInventory` 已提供 `source_ids()`、`file_ids()`、`file_by_id()`，供 support matrix 交叉校验。
- [x] `support-matrix.yaml` 已补 `source_ids` / `reference_file_ids`；MAPLE reference-only entries 链到 MAPLE source files，ASE extxyz entry 链到 project-authored source。

流程图核对：`sources.yaml` → source inventory loader；`manifest.yaml` → fixture manifest loader；`support-matrix.yaml` → support matrix loader；manifest/source matrix 交叉校验均在 `tests/parser_fixture_harness.py`。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] Synthetic manifest fixtures 继续加载，无需第三方 upstream metadata。
- [x] Temp vendored-third-party manifest source 带完整 metadata 时能加载并读出 path/hash/size。
- [x] vendored-third-party 缺 `source_path`、坏 `source_sha256`、坏 `source_size_bytes` 或 `redistributable=false` 均被拒绝。
- [x] `support-matrix.yaml` 支持 `source_ids` 和 `reference_file_ids`。
- [x] `load_parser_support_matrix(..., source_inventory=inventory)` 能校验当前 support matrix，并拒绝未知 source id、未知 reference file id、非 reference-only file id。

明确不做核对：

- [x] 未新增 MAPLE/cclib-data executable fixture。
- [x] 未复制第三方 example/log 文件进 `tests/fixtures/parsers/files/`。
- [x] 未修改 parser runtime、ImportRegistryWorkflow、Platform Shell 或 Web UI。
- [x] 未升级 `parser-fixtures-v1` / `parser-support-matrix-v1` schema version。
- [x] source links 只描述 fixture corpus 证据链，不声明完整软件版本认证。

关键决策落地：

- [x] 可选字段 + 条件必填：synthetic source 可为空；vendored-third-party 强制完整 upstream metadata。
- [x] support matrix 只链接来源：source details 仍在 `sources.yaml`。
- [x] loader 向后兼容：不传 source inventory 时仍可加载旧形状；传入时启用交叉校验。
- [x] 不升级 schema version：字段为兼容增强。

挂载点反向核对：

- [x] 挂载点集中在 `tests/parser_fixture_harness.py`、`tests/test_parser_fixture_harness.py`、`tests/fixtures/parsers/support-matrix.yaml`、`docs/dev/parser-fixture-corpus.md`、architecture 和 roadmap。
- [x] `rg "source_ids|reference_file_ids|source_path|source_sha256|source_size_bytes|vendored-third-party"` 命中均落在上述挂载点或既有 import source path 术语处。
- [x] 拔除沙盘推演：删除新增 dataclass 字段、loader guard、support matrix links、tests 和 docs 后，本 feature 行为消失，不需要改 parser runtime。

## 3. 验收场景核对

- [x] S1：Synthetic manifest fixtures 继续无需 source metadata，由 `test_manifest_loads_synthetic_fixture_and_parse_options` 覆盖。
- [x] S2：完整 vendored-third-party metadata 可加载，由 `test_vendored_third_party_source_metadata_loads_when_complete` 覆盖。
- [x] S3-S6：缺 source_path、坏 source_sha256、坏 source_size_bytes、non-redistributable 均由 rejection tests 覆盖。
- [x] S7-S8：support matrix source links 和当前 matrix cross-check 由 `test_support_matrix_loads_and_covers_fixture_manifest` 覆盖。
- [x] S9-S11：未知 source id、未知 reference file id、非 reference-only file id 均由 rejection tests 覆盖。
- [x] S12：docs/architecture 已明确这是测试侧 guard，不新增 runtime parser 支持。

本 feature 无前端视觉改动，不需要浏览器验收。

## 4. 术语一致性

- Fixture Source Metadata：design、harness、guide 中均指 manifest `source` 块。
- Vendored Third-party Fixture：仅指已允许提交且已进入 `files/` 的第三方样例；当前没有新增真实条目。
- Source Path / Source Hash / Source Size：均指上游原始文件，不指本地脱敏后 fixture。
- Support Matrix Source Links：`source_ids` 和 `reference_file_ids` 只链接 `sources.yaml`。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已补 vendored-third-party source 必填 upstream metadata，以及 support matrix source/reference links。
- [x] `.codestable/architecture/core-platform.md`：已补 Parser Fixture Harness 的 source metadata guard 和 source/reference link cross-check。
- [x] `docs/dev/parser-fixture-corpus.md`：已补 vendored-third-party source 最小结构、`source_ids` / `reference_file_ids` 维护规则。

## 6. requirement 回写

无 requirement 回写。本 feature 是测试侧 parser corpus 元数据 guard，不新增用户可见产品能力。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-parser-real-output-compatibility/rxnflow-parser-real-output-compatibility-items.yaml`：`parser-corpus-source-metadata` 已标为 `done`，feature 指向 `2026-05-21-parser-corpus-source-metadata`。
- [x] `.codestable/roadmap/rxnflow-parser-real-output-compatibility/rxnflow-parser-real-output-compatibility-roadmap.md`：第 5 节子 feature 清单已同步状态和落地摘要。
- [x] roadmap YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的通用工作流信息。parser source metadata 维护规则已进入 `docs/dev/parser-fixture-corpus.md`。

## 9. 遗留

- `maple-public-example-inventory`：下一步应把 MAPLE example 文件族做任务级分类，补 support matrix reference/candidate 状态。
- `maple-out-real-fixtures` / `cclib-public-gaussian-orca-fixtures`：后续接真实 executable fixture 时必须使用本 feature 的 source metadata guard。
- 仍未判断 MAPLE/cclib-data 文件可否无条件进入仓库；进入前必须逐文件确认 license 和再分发边界。

## 验证记录

- `python3 .codestable/tools/validate-yaml.py --file tests/fixtures/parsers/manifest.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file tests/fixtures/parsers/support-matrix.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file tests/fixtures/parsers/sources.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-21-parser-corpus-source-metadata/parser-corpus-source-metadata-checklist.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-parser-real-output-compatibility/rxnflow-parser-real-output-compatibility-items.yaml --yaml-only`：通过。
- `python3 -m unittest tests.test_parser_fixture_harness`：50 tests OK。
- `python3 -m unittest discover`：264 tests OK。
