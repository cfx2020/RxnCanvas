# Parser Source Inventory 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：codestable/features/2026-05-21-parser-source-inventory/parser-source-inventory-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `tests/fixtures/parsers/sources.yaml` 已落地，schema version 为 `parser-source-inventory-v1`。
- [x] 顶层 `sources` 包含 `maple-dev-example`、`cclib-data-gaussian-orca`、`ase-extxyz-project-authored`。
- [x] 每个 source 记录 `id`、`program`、`kind`、`url`、`branch`、`commit`、`version`、`license`、`redistributable_default`、`local_reference_path`、`source_summary`、`notes` 和 `files`。
- [x] 每个 file entry 记录 `id`、`path`、`task`、`format`、`size_bytes`、`sha256`、`fixture_policy`、`parser_intent` 和 `notes`。
- [x] `tests/parser_fixture_harness.py` 新增 `load_parser_source_inventory()`、source/file dataclass、policy/hash/path schema guard。

流程图核对：外部/本地 source facts → `sources.yaml` → harness loader → 单测 / docs / 后续 metadata feature 的路径已落地；loader 不访问网络或 `/tmp` clone。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] MAPLE examples 已记录 ClickFF/MAPLE URL、`dev` branch、commit、license caveat、example 目录规模和代表性 `.out` / `.xyz` / `.sum` / `.json` / `.dat` 文件 hash。
- [x] cclib-data 已记录 URL、commit、Gaussian16 / ORCA5 / ORCA6 sparse checkout 范围、代表性 Gaussian/ORCA 文件 hash 和 `review-required` policy。
- [x] ASE extxyz 已记录 ASE `3.28.0`、`LGPL-2.1-or-later` 和当前 project-authored extxyz fixture hash。
- [x] loader 单测覆盖 schema、id、policy、path、size 和 sha256 形状。

明确不做核对：

- [x] 未新增 MAPLE/cclib-data executable fixture。
- [x] 未复制第三方 example/log 文件进 `tests/fixtures/parsers/files/`；该目录仍只有既有 synthetic/project-authored fixture 文件。
- [x] 未修改 parser runtime、import workflow、Platform Shell 或 Web UI。
- [x] 未运行 Gaussian、ORCA、MAPLE、ASE 计算任务。
- [x] `maple-dev-example` 和 `cclib-data-gaussian-orca` 都保持 `redistributable_default: review-required`，没有标成无条件可再分发。

关键决策落地：

- [x] Source inventory 先行：本次只加 `sources.yaml` 和 loader，不进入 manifest/snapshot。
- [x] Hash 固定上游内容：所有 file entries 使用 `sha256:<64 hex>`。
- [x] Candidate 不等于 vendored：MAPLE/cclib-data 候选文件保持 `candidate` 或 `reference-only`。
- [x] ASE 走 project-authored 起步：当前两个 extxyz entries 标为 `vendored`，来源是本仓库已有 fixture。

挂载点反向核对：

- [x] 挂载点集中在 `tests/fixtures/parsers/sources.yaml`、`tests/parser_fixture_harness.py`、`tests/test_parser_fixture_harness.py`、`docs/dev/parser-fixture-corpus.md`、architecture 和 roadmap。
- [x] `rg "Parser Source Inventory|sources.yaml|parser-source-inventory|maple-dev-example|cclib-data-gaussian-orca|ase-extxyz-project-authored"` 命中均落在上述挂载点。
- [x] 拔除沙盘推演：删除清单、loader/tests、docs/architecture/roadmap 描述后，本 feature 行为消失，不需要改 parser runtime。

## 3. 验收场景核对

- [x] S1：`sources.yaml` 存在且 schema version 正确，由 YAML 校验和 `test_source_inventory_loads_public_and_project_authored_sources` 覆盖。
- [x] S2-S3：MAPLE source 和代表文件覆盖 `.out`、`.xyz`、`.sum`、AutoNEB tree JSON、MD thermo，由 source inventory 内容和 loader test 覆盖。
- [x] S4：cclib-data Gaussian/ORCA source 覆盖 commit、目录范围和代表文件，由 loader test 覆盖。
- [x] S5：ASE extxyz project-authored source 覆盖 version/license/hash，由 loader test 覆盖。
- [x] S6-S7：file entry shape 和 policy filter，由 `test_source_inventory_files_have_policy_size_hash_and_parser_intent` 覆盖。
- [x] S8-S11：坏 schema、未知 policy、坏 sha256、unsafe path，分别由 source inventory loader rejection tests 覆盖。
- [x] S12：docs/architecture 明确 source inventory 不 vendor 第三方文件、不新增 runtime parser 支持。

本 feature 无前端视觉改动，不需要浏览器验收。

## 4. 术语一致性

- Parser Source Inventory：design、代码、docs、architecture 和 roadmap 使用同一含义。
- Fixture Policy：实现枚举为 `candidate`、`vendored`、`reference-only`、`rejected`，与 roadmap 契约一致。
- Review-required Redistribution：MAPLE 和 cclib-data 均按 review-required 表述，没有写成已授权商用或可无条件再分发。
- Project-authored extxyz：只指本仓库已有 extxyz fixture，不指 ASE 外部数据集。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：已新增 Parser Source Inventory 术语，并说明 `sources.yaml` 不 vendor 第三方文件、不声明 runtime parser 支持。
- [x] `codestable/architecture/core-platform.md`：已把 `parser-source-inventory-v1` 纳入测试侧 Parser Fixture Harness 现状，并保留真实 executable fixture 未实现的边界。
- [x] `docs/dev/parser-fixture-corpus.md`：已新增 Source Inventory 章节、policy 表和校验命令。

## 6. requirement 回写

无 requirement 回写。本 feature 是测试侧 parser corpus source policy 能力，不新增用户可见产品能力。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-parser-real-output-compatibility/rxnflow-parser-real-output-compatibility-items.yaml`：`parser-source-inventory` 已标为 `done`，feature 指向 `2026-05-21-parser-source-inventory`。
- [x] `codestable/roadmap/rxnflow-parser-real-output-compatibility/rxnflow-parser-real-output-compatibility-roadmap.md`：第 5 节子 feature 清单已同步状态和落地摘要。
- [x] roadmap YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的通用工作流信息。`docs/dev/parser-fixture-corpus.md` 已包含 source inventory 维护规则。

## 9. 遗留

- `parser-corpus-source-metadata`：下一步应把 manifest/support matrix 与 source inventory 关联起来，支持 source hash、size、upstream path 和 vendored-third-party 必填字段。
- `maple-public-example-inventory`：后续需要把 MAPLE source file family 转成更细的任务级 reference/candidate 分类。
- MAPLE/cclib-data 的第三方文件仍未进入 executable corpus；进入前必须逐文件确认 license 和再分发边界。

## 验证记录

- `python3 codestable/tools/validate-yaml.py --file tests/fixtures/parsers/sources.yaml --yaml-only`：通过。
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-21-parser-source-inventory/parser-source-inventory-checklist.yaml --yaml-only`：通过。
- `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-parser-real-output-compatibility/rxnflow-parser-real-output-compatibility-items.yaml --yaml-only`：通过。
- `python3 -m unittest tests.test_parser_fixture_harness`：42 tests OK。
- `python3 -m unittest discover`：256 tests OK。
