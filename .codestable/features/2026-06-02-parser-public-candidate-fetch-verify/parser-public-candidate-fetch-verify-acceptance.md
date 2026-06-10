---
doc_type: feature-acceptance
feature: 2026-06-02-parser-public-candidate-fetch-verify
status: accepted
summary: 验收 parser public candidate fetch/hash verify 的 dev-only request/result helper 和 no-network/no-vendor 边界
tags: [parser, fixture-corpus, public-fixtures, fetch-verify, source-inventory, license-gate]
---

# parser-public-candidate-fetch-verify 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-02
> 关联方案 doc：.codestable/features/2026-06-02-parser-public-candidate-fetch-verify/parser-public-candidate-fetch-verify-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `ParserPublicCandidateFetchRequest` 已落地在 `tests/parser_fixture_harness.py`，字段为 `source_id`、`file_id`、`url`、`upstream_path`、`commit_or_version`、`expected_sha256` 和 `expected_size_bytes`。
- [x] `ParserPublicCandidateFetchResult` 已落地在 `tests/parser_fixture_harness.py`，字段为 source/file、url/path、expected/actual sha256、expected/actual size、`ok`、`fetched_at` 和 `error`。
- [x] `build_parser_public_candidate_fetch_request(source_inventory, source_id, file_id)` 已落地，能从 `ParserSourceInventory` 构造 request。
- [x] `verify_parser_public_candidate_bytes(request, content, fetched_at=...)` 已落地，只校验调用方提供的 bytes，不执行 fetch。
- [x] source/file guard、source URL、commit/version/branch tracking info、`sha256:<64 hex>` 和正 size 约束均有单测覆盖。

流程图核对通过：`sources.yaml` 经 `load_parser_source_inventory` 进入 `build_parser_public_candidate_fetch_request`；helper 外部的 fake/local/network provider 不在本 feature 实现；调用方提供 bytes 后由 `verify_parser_public_candidate_bytes` 生成 `ParserPublicCandidateFetchResult`；future candidate resolution 仍需结合 `public-fixture-decisions.yaml`。

## 2. 行为与决策核对

需求摘要已落地：开发者/agent 现在可以用 source inventory 中的 `source_id + file_id` 构造可复核 request，并对已获得 bytes 做 hash/size 校验，mismatch 会以 structured result 暴露。

明确不做核对：

- [x] 未 vendor MAPLE、cclib-data、ASE examples 或任何新的第三方 public output 文件。
- [x] 未把 fetched 文件写入 `tests/fixtures/parsers/files/`。
- [x] 未修改 manifest、snapshot、support matrix fixture ids 或 parser support 状态。
- [x] 未改变 decision ledger 中任何 decision/promotion。
- [x] 普通 tests 不访问网络。
- [x] 未运行外部计算任务。
- [x] 未修改 parser runtime、ImportRegistryWorkflow、Platform Shell、Web UI 或报告导出。
- [x] 未把 fetch 成功描述为可再分发或可 promotion。

关键决策已落地：

- [x] dev-only helper：新增类型和函数只在 `tests/parser_fixture_harness.py`，未进入 `rxnflow.parsers` runtime API。
- [x] provider 可替换：本 feature 不实现 provider；普通单测只使用本地 YAML 和 fake bytes。
- [x] 默认不落 corpus：verifier 不写文件，单测用 fixture files snapshot 证明未修改 corpus。
- [x] 结果结构化：sha/size mismatch 返回 `ok=False`、expected/actual 字段和 `error`，不抛错、不更新 inventory。
- [x] decision ledger 前置不变：开发文档、架构文档和 scope diff 均确认 helper 不改变 `public-fixture-decisions.yaml`。

挂载点核对通过：实际挂载点为 `tests/parser_fixture_harness.py`、`tests/test_parser_fixture_harness.py`、`docs/dev/parser-fixture-corpus.md`、architecture/roadmap/acceptance CodeStable 文档。反向 grep 未发现 runtime parser、Import Workflow、Platform Shell、Web UI、report export、manifest、support matrix、fixture files、snapshots 或 decision ledger 挂载。

## 3. 验收场景核对

- [x] S1 能从 `sources.yaml` 中已知 `source_id + file_id` 构造 `ParserPublicCandidateFetchRequest`。证据：`test_public_candidate_fetch_request_builds_from_source_inventory`。
- [x] S2 request 包含 source url、file upstream path、commit/version/branch tracking info、expected sha256 和 expected size。证据：同一单测逐字段断言 MAPLE source/file。
- [x] S3 unknown source id 被拒绝。证据：`test_public_candidate_fetch_request_rejects_unknown_source_or_file`。
- [x] S4 unknown file id 被拒绝。证据：同上。
- [x] S5 file id 属于其他 source 时被拒绝。证据：`test_public_candidate_fetch_request_rejects_file_source_mismatch`。
- [x] S6 缺少 source URL 或缺少 commit/version/branch tracking info 时被拒绝。证据：`test_public_candidate_fetch_request_rejects_missing_url_or_tracking_info`。
- [x] S7 malformed inventory sha256 被拒绝或不能进入 request。证据：`test_public_candidate_fetch_request_rejects_malformed_inventory_sha256`。
- [x] S8 matching bytes 产生 `ok=True`，actual sha256 和 size 与 expected 对齐。证据：`test_public_candidate_fetch_verify_accepts_matching_bytes`。
- [x] S9 sha mismatch 产生 `ok=False`，保留 expected/actual sha256，不修改 inventory。证据：`test_public_candidate_fetch_verify_reports_sha_mismatch_without_mutating_request`。
- [x] S10 size mismatch 产生 `ok=False`，保留 expected/actual size，不修改 inventory。证据：`test_public_candidate_fetch_verify_reports_size_mismatch_without_writing_files`。
- [x] S11 helper 不访问网络、不写文件、不写 fixture corpus。证据：`test_public_candidate_fetch_helpers_do_not_access_network_or_write_files`、fixture files snapshot 断言、scope diff。
- [x] S12 docs 明确 fetch verify 是 dev-only，普通 unit tests 不访问网络，输出只能写临时目录或显式 artifact，不自动 vendor。证据：`docs/dev/parser-fixture-corpus.md` Candidate Fetch Verify section。
- [x] S13 scope guard 证明未新增 MAPLE/cclib-data third-party files，未改 manifest/support matrix/snapshots。证据：`git diff -- tests/fixtures/parsers/manifest.yaml tests/fixtures/parsers/support-matrix.yaml tests/fixtures/parsers/files tests/fixtures/parsers/snapshots tests/fixtures/parsers/public-fixture-decisions.yaml` 无输出。

本 feature 无前端改动，无需浏览器验证。

## 4. 术语一致性

- Candidate Fetch Verify：设计、测试 helper、developer guide、architecture 和 roadmap 口径一致，均限定为 dev-only source inventory hash/size 复核。
- Fetch Verify Request / Fetch Verify Result：代码命名为 `ParserPublicCandidateFetchRequest` / `ParserPublicCandidateFetchResult`，保留 parser public fixture corpus 前缀，避免和 runtime fetch/provider 概念冲突。
- Fetch Provider / Explicit Artifact / Decision Gate：本 feature 未实现 provider 或 artifact writer；文档明确 future provider 在 helper 外层，promotion 仍必须查 decision ledger。
- 防冲突：grep 命中只在测试 harness、测试文件、开发文档、CodeStable 文档和 architecture/roadmap；未进入 runtime API。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已在术语表补 Candidate Fetch Verify，并在 parser fixture harness / developer guide 当前边界中说明 request/result helper、no-network、no-write、no-auto-vendor 和 decision gate 关系。
- [x] `.codestable/architecture/core-platform.md`：已补 Parser Fixture Harness 当前能力、模块结构和文件职责，说明 request/result dataclass、builder/verifier helper 和 helper 不访问网络/不写文件。
- [x] `docs/dev/parser-fixture-corpus.md`：已补 Candidate Fetch Verify 维护入口、no-network unit test 边界、mismatch 处理口径和 promotion 仍需 decision ledger。

## 6. requirement 回写

本 feature 是测试侧/dev tooling 能力，不新增用户可见导入行为、端侧命令、项目持久化能力、runtime parser 支持或 UI。方案 frontmatter `requirement: null`，无需新增 requirement。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-items.yaml` 已将 `parser-public-candidate-fetch-verify` 从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-roadmap.md` 第 5 节子 feature 清单已同步为 `done`，并写入对应 feature id。

## 8. AGENTS.md / CLAUDE.md 候选盘点

无候选。本 feature 没有新增每个 feature 都会复用的环境命令或远程规则；现有 `AGENTS.md` 已覆盖 parser/test 解耦、文件格式结构化、普通测试命令和第三方 fixture 不自动 vendor 的边界。

## 9. 遗留

- 后续 roadmap item 是 `maple-public-candidate-resolution`，需要结合 decision ledger 和 Candidate Fetch Verify 逐项处理 MAPLE candidates/reference files。
- 本 feature 不提供真实 network provider、GitHub raw fetch script 或 artifact writer；如需要，应另起 dev command/script feature，并继续保持普通 unit tests no-network。
- MAPLE/cclib-data public originals 仍未 vendor；fetch verify 成功也不能替代 license/re-distribution decision。
