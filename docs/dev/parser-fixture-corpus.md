---
doc_type: dev-guide
slug: parser-fixture-corpus
component: parser-fixture-corpus
status: current
summary: 如何添加、校验和维护 RxnFlow parser fixture corpus
tags: [parser, fixture-corpus, testing, diagnostics]
last_reviewed: 2026-06-03
---

# Parser Fixture Corpus

## 概述

Parser fixture corpus 是 RxnFlow parser 能力的开发者和 agent 维护入口。它把一组可提交的计算输出样例、期望解析结果、支持矩阵和导入预览回归串起来，用于判断 parser 是否还能稳定输出可复用的 ChemicalObject 预览。

当前 corpus 只代表已提交 fixture 覆盖过的 synthetic / synthetic-derived / reference-only 场景，不代表 Gaussian、ORCA、MAPLE、ASE extxyz 或其他程序真实版本的完整支持。新增真实样例前必须先确认来源、再分发权限和脱敏状态。

用户向支持边界见 `docs/user/parser-output-support.md`。开发者维护 corpus 时必须保持两份文档口径一致：本指南说明怎么维护测试资产，用户指南说明当前能预览什么、不能承诺什么。

当前 corpus 覆盖摘要：

- Gaussian / ORCA：通过 cclib adapter 的项目内 synthetic 与 synthetic-derived shape fixtures 固定 method、charge/spin、geometry 和 electronic energy 投影；cclib-data public originals 仍未 vendor。
- MAPLE：项目内 synthetic / synthetic-derived fixtures 覆盖基础 `.out`、final `.xyz` 和 path-family `.xyz` frame label / Hartree energy；`.sum`、AutoNEB tree、MD thermo、frequency 等仍是 reference-only。
- XYZ / ASE extxyz：plain XYZ 覆盖 geometry-only 和 missing energy warning；ASE extxyz project-authored variants 覆盖 metadata、multi-frame、calculator energy fallback、missing energy 和 eV 到 Hartree unit warning。
- Import Preview Regression：同一 fixture corpus 驱动 `ImportRegistryWorkflow.import_files` 和 Platform Shell `import.preview`，只验证 preview projection，不确认导入、不登记 ChemicalObject。
- Public Fixture Intake Gate：真实/公开或用户授权输出必须先进入 source inventory，再经过可选 fetch/hash verify、decision ledger、promotion adapter、manifest/snapshot/support matrix 和 import preview regression；fetch verify 成功不等于许可证或 promotion 通过。

corpus 位于 `tests/fixtures/parsers/`：

```text
tests/fixtures/parsers/
├── manifest.yaml
├── public-fixture-decisions.yaml
├── sources.yaml
├── support-matrix.yaml
├── files/
│   ├── extxyz/
│   ├── gaussian/
│   ├── maple/
│   ├── orca/
│   └── xyz/
└── snapshots/
    └── <fixture-id>.json
```

## 目录结构

- `manifest.yaml`：fixture 清单。每条记录一个稳定 `id`，并声明 `program`、`format`、`task`、`parser_id`、输入文件、来源元数据、`parse_options`、`expected_snapshot`、数值容差、`support_status`、标签和说明。
- `public-fixture-decisions.yaml`：public fixture decision ledger。它逐个 `source_id + file_id` 记录 evidence、decision、promotion、fallback 和 reviewer，作为后续是否允许 promotion / vendor 原件的 gate。
- `sources.yaml`：真实/公开输出接入前的 source inventory。它记录 MAPLE、cclib-data、ASE extxyz 等来源的 URL、commit/version、license、默认再分发状态、候选/reference-only 文件、`size_bytes`、`sha256` 和 `fixture_policy`。它不表示文件已经进入 executable corpus。
- `support-matrix.yaml`：支持矩阵和 diagnostic catalog。它说明当前 corpus 覆盖的程序、格式、任务、字段状态、fixture ids、已观察 warning/error code 和 `known_limits`。
- `files/`：可提交的 parser 输入文件。只有确认可再分发并完成脱敏的文件可以放进这里。
- `snapshots/`：`parser-golden-v1` 期望输出。snapshot 是稳定投影，不保存完整日志，也不应保存不必要的完整原始轨迹。

## Source Inventory

`sources.yaml` 是真实/公开样例进入仓库前的登记层。它可以记录外部仓库里的文件路径和 hash，但测试不能依赖网络、`/tmp` clone 或用户本机路径。当前清单使用 `parser-source-inventory-v1`，已登记：

- `maple-dev-example`：ClickFF/MAPLE `dev` 分支 examples，包含 sp/opt、scan、IRC/NEB/String/AutoNEB、MD 和 frequency 的 `.out`、`.xyz`、`.sum`、AutoNEB tree JSON、MD thermo/summary 等代表文件。MAPLE license 带 academic/commercial notice，默认 `review-required`。
- `cclib-data-gaussian-orca`：cclib-data 中 Gaussian16、ORCA 5.0、ORCA 6.0 公开回归文件候选。当前 sparse checkout 未包含 LICENSE 文件；复核记录 commit 上的 LICENSE raw 和 GitHub license API 均无许可证结果，默认 `review-required`。
- `ase-extxyz-project-authored`：项目内手写 ASE extxyz fixture，记录本地 ASE version 和 LGPL license expression，覆盖单帧 metadata、multi-frame、calculator energy fallback 和 missing energy warning；不 vendor 外部 extxyz 数据集。

每个 file entry 必须包含：

```yaml
id: maple-sp-output-example
path: example/sp/sp.out
task: sp
format: maple-output
size_bytes: 4253
sha256: sha256:<64 hex>
fixture_policy: candidate
parser_intent: maple-output
```

`fixture_policy` 只能使用：

| Policy | 含义 |
|---|---|
| `candidate` | 后续 feature 可评估为 executable fixture，但现在未 vendor |
| `vendored` | 文件已在本仓库内，且来源允许提交 |
| `reference-only` | 只作为格式/任务参考，不进入 executable fixture |
| `rejected` | 明确不适合后续使用，例如许可证、体积或隐私风险 |

`review-required` 来源不得自动进入 `files/`。后续若要 vendor 第三方文件，必须另起 feature 更新 manifest/source metadata，并说明为什么该单个文件可再分发。

## Candidate Fetch Verify

Candidate Fetch Verify 是 source inventory 的 dev-only 复核入口，用于把 `sources.yaml` 里登记的公开候选文件转换成可校验的 request，并对开发者或 agent 已经拿到的 bytes 做 `sha256` 和 `size_bytes` 复核。它只证明“这批 bytes 是否匹配 inventory”，不证明许可证允许再分发，也不证明该文件可以 promotion。

当前 helper 位于 `tests/parser_fixture_harness.py`：

```python
from pathlib import Path

from tests.parser_fixture_harness import (
    build_parser_public_candidate_fetch_request,
    load_parser_source_inventory,
    verify_parser_public_candidate_bytes,
)

inventory = load_parser_source_inventory(Path("tests/fixtures/parsers/sources.yaml"))
request = build_parser_public_candidate_fetch_request(
    inventory,
    "maple-dev-example",
    "maple-sp-output-example",
)
result = verify_parser_public_candidate_bytes(
    request,
    b"...already fetched or locally supplied bytes...",
    fetched_at="2026-06-02T00:00:00Z",
)
```

维护规则：

- 普通 unit tests 不访问网络，不 clone GitHub，也不读取用户本机临时 checkout；测试只能使用本地 YAML 和 fake bytes。
- `build_parser_public_candidate_fetch_request` 只读取 `ParserSourceInventory`，要求 source/file 存在、file 属于 source、source 有 URL，并至少有 `commit`、`version` 或 `branch` 之一作为 tracking info。
- `verify_parser_public_candidate_bytes` 只接收已经提供的 bytes；helper 本身不 fetch、不写文件、不写 `tests/fixtures/parsers/files/`。
- `ok=True` 只表示 actual sha256 和 actual size 都匹配 request 中的 expected 值。
- sha 或 size mismatch 必须作为 structured result 暴露，保留 expected/actual 值；不要自动修改 `sources.yaml`、decision ledger、manifest、support matrix 或 snapshot。
- 后续如果新增显式 dev command 或 provider，可以把真实网络读取、local checkout 读取和 Explicit Artifact 写入放在 helper 外层，但默认仍只能写临时目录或用户显式指定的 artifact 目录，不能自动 vendor。
- promotion 仍必须先查 `public-fixture-decisions.yaml`；fetch verify 成功不能被描述为文件已可再分发、已进入 corpus 或已 supported。

## Public Fixture Intake Gate

Public fixture intake 是真实第三方输出或用户授权输出进入 executable fixture corpus 的准入链路。它不是单个文件复制动作，而是从来源登记到 preview regression 的可审计流程：

```text
source inventory
-> optional Candidate Fetch Verify
-> public fixture decision ledger
-> manifest/files/snapshot/support matrix
-> Fixture Promotion Adapter
-> import preview regression
-> developer/user guide sync
```

每一段只回答自己的问题：

| 阶段 | 回答的问题 | 不能替代 |
|---|---|---|
| Source Inventory | 这个外部/用户样例来自哪里、路径/hash/体积/任务是什么 | 不证明可再分发，不证明 parser 支持 |
| Candidate Fetch Verify | 调用方提供的 bytes 是否匹配登记的 hash 和 size | 不证明 license、脱敏或 promotion 通过 |
| Decision Ledger | 该 source file 当前是 `allowed/promoted`、`needs-permission/blocked` 还是 `reference-only/not-applicable` | 不生成 fixture，不修改 parser |
| Manifest / Snapshot / Support Matrix | executable fixture、期望 parser 投影和字段支持边界是否齐全 | 不绕过 decision ledger |
| Fixture Promotion Adapter | promoted decision 是否有 executable coverage，source-gated fixture 是否可追溯 | 不 fetch、不写文件、不自动修复 corpus |
| Import Preview Regression | promoted fixture 进入 Workflow/Shell preview 后 projection 是否保真 | 不确认导入、不登记 ChemicalObject |

新增真实样例时按下面顺序推进：

1. 先在 `sources.yaml` 登记 source 和 file entry，写清 URL、commit/version/branch、path、task、format、size、sha256、`fixture_policy` 和 `parser_intent`。
2. 可选地使用 Candidate Fetch Verify 复核 bytes/hash/size；复核结果只作为证据之一，不能写成“已允许 vendor”。
3. 在 `public-fixture-decisions.yaml` 写 decision：`allowed/promoted` 必须有足够 license、授权或项目内来源证据；`needs-permission/blocked` 必须写 reason 和 fallback；`reference-only/not-applicable` 必须有 reference anchor。
4. 只有 `allowed/promoted` 的小型、可再分发、已脱敏文件才可进入 `files/`，并且 manifest source metadata 必须能追溯到 decision/source file。
5. promoted fixture 必须同时有 `parser-golden-v1` snapshot、support matrix `fixture_ids` coverage 和 import preview regression coverage。
6. 最后同步 `docs/dev/parser-fixture-corpus.md` 和 `docs/user/parser-output-support.md`；用户指南只能声明 fixture-backed preview 行为，不能写完整版本认证。

当前 public fixture intake 结论：

- MAPLE public examples：3 个 candidate 保持 `needs-permission/blocked`，14 个 reference-only anchors 只作为格式/任务参考；没有 MAPLE public original promoted。
- cclib-data Gaussian/ORCA examples：4 个 candidate 保持 `needs-permission/blocked`，2 个 reference-only anchors 只作为格式/任务参考；没有 cclib-data public original promoted。
- ASE extxyz：4 个 `ase-extxyz-project-authored` 文件是项目内 authored variants，记录为 `allowed/promoted` 并进入 executable fixture coverage；它们不代表第三方 extxyz 数据集或 ASE 真实版本完整认证。
- 当前没有 `vendored-third-party` 或 `user-redacted` source-gated executable fixture；后续新增时必须通过 Fixture Promotion Adapter 的 `decision_id`、source metadata、snapshot 和 support matrix coverage guard。

## MAPLE Candidate Resolution

MAPLE Candidate Resolution 是 `maple-dev-example` source 的当前逐文件结论汇总。它从 source inventory、public fixture decision ledger 和 support matrix 派生，不新增第二份 MAPLE 决策表。测试侧 helper `summarize_maple_public_candidate_resolution` 会汇总 candidate files、reference-only files、promoted files、blocked candidates、fallback fixtures 和 unresolved files。

当前结论：

- `maple-sp-output-example`、`maple-opt-output-example`、`maple-opt-final-xyz-example` 都仍是 `needs-permission/blocked`，没有 promoted MAPLE public original。
- 三个 MAPLE candidates 只通过项目内 synthetic / synthetic-derived fallback 保持 executable parser coverage。
- scan、path、AutoNEB tree、MD、frequency 和 `.sum` artifacts 保持 `reference-only/not-applicable`，只作为 reference anchor。
- support matrix 中 MAPLE public originals 不得进入 `fixture_ids`；`fixture_ids` 只能指向 manifest 中的项目内 synthetic 或 synthetic-derived fixtures。
- MAPLE path-family fallback 只证明 `.xyz` frame comment / Hartree energy 可以生成 frame-level `ChemicalObjectDraft`，不声明 ReactionPath、path topology、direction、TS candidate、frequency、MD 或 scan semantics。

维护规则：

- summary 的 `unresolved_file_ids` 必须为空；缺 decision、candidate 无 fallback、reference-only 无自身 anchor 或 support matrix 漏挂 source file 都应由 focused tests 暴露。
- 如果后续用户或上游许可证证据允许 promotion，必须另起 promotion feature 更新 decision ledger、manifest source metadata、fixture file、snapshot 和 support matrix。
- 不能把 Candidate Fetch Verify 成功当成 MAPLE 文件可再分发或可进入 corpus 的依据。

## cclib-data Candidate Resolution

cclib-data Candidate Resolution 是 `cclib-data-gaussian-orca` source 的当前逐文件结论汇总。它从 source inventory、public fixture decision ledger 和 support matrix 派生，不新增第二份 cclib-data 决策表。测试侧 helper `summarize_cclib_public_candidate_resolution` 会分别汇总 Gaussian candidates、ORCA candidates、reference-only files、promoted files、blocked candidates、fallback fixtures 和 unresolved files。

当前结论：

- `cclib-gaussian16-water-log`、`cclib-gaussian16-co-pbe-log`、`cclib-orca50-1038-output`、`cclib-orca60-1618-output` 都仍是 `needs-permission/blocked`，没有 promoted cclib-data public original。
- 四个 cclib-data candidates 只通过项目内 Gaussian/ORCA synthetic 或 synthetic-derived fallback 保持 executable parser coverage。
- `cclib-gaussian16-water-nbo-out` 和 `cclib-orca50-benzene-opt-log` 保持 `reference-only/not-applicable`，只作为 NBO/large optimization reference anchor。
- support matrix 中 cclib-data public originals 不得进入 `fixture_ids`；`fixture_ids` 只能指向 manifest 中的项目内 synthetic 或 synthetic-derived fixtures。
- cclib-data 官方安装文档和 Debian package/source metadata 均把 `cclib-data` logfiles/test data 放入 non-free/review-required 语境；该证据不能自动转化为可再分发 fixture。

维护规则：

- summary 的 `unresolved_file_ids` 必须为空；缺 decision、candidate 无 fallback、reference-only 无自身 anchor、未知 candidate format 或 support matrix 漏挂 source file 都应由 focused tests 暴露。
- Candidate Fetch Verify 可以证明 4 个 cclib-data candidate 的 URL/path/hash/size request 可构造，但 helper 不 fetch、不写文件，也不构成 promotion 证据。
- 如果后续用户、Debian/cclib 维护者或上游许可证证据允许 promotion，必须另起 promotion feature 更新 decision ledger、manifest source metadata、fixture file、snapshot 和 support matrix。
- 不要把 NBO、thermochemistry、SCF convergence、large optimization reference-only outputs 描述成当前 cclib adapter supported fields。

## Public Fixture Decision Ledger

`public-fixture-decisions.yaml` 是 source inventory 和 executable fixture corpus 之间的人工决策层。它不保存外部原始文件，也不代表 parser runtime 支持；它只回答一个问题：当前登记的 source file 是否能进入 executable fixture corpus，如果不能，用哪个项目内 fixture 或 reference anchor 继续证明 parser 行为边界。

当前 schema version 是 `parser-public-fixture-decisions-v1`。每条 decision 绑定一个 `source_id + file_id`：

```yaml
id: maple-dev-example:maple-sp-output-example
source_id: maple-dev-example
file_id: maple-sp-output-example
checked_at: "2026-06-02"
evidence:
  - kind: source-inventory
    ref: tests/fixtures/parsers/sources.yaml
    note: "MAPLE source redistributable_default is review-required."
decision: needs-permission
promotion: blocked
reason: "Redistribution boundary is not clear enough to vendor the original MAPLE output."
fallback_fixture_ids: [maple-sp-public-shape-synthetic-derived]
reference_file_ids: []
reviewer: agent
```

`decision` 只能使用：

| Decision | 含义 |
|---|---|
| `allowed` | 证据足以允许该文件进入 corpus；只有它能搭配 `promotion: promoted` |
| `needs-permission` | 需要用户、作者、许可证或维护者复核后才可能 vendor |
| `rejected` | 明确不进入 corpus |
| `synthetic-only` | 原件不进入 corpus，只保留项目内 synthetic / synthetic-derived coverage |
| `reference-only` | 只作为格式或任务参考，不进入 executable fixture |

`promotion` 只能使用 `promoted`、`blocked` 或 `not-applicable`。`promotion: promoted` 必须搭配 `decision: allowed`；`promotion: blocked` 必须写明 `reason`，并至少提供一个 `fallback_fixture_ids` 或 `reference_file_ids`。`reference_file_ids` 必须指向 `sources.yaml` 中 `fixture_policy: reference-only` 的 file id；`fallback_fixture_ids` 必须指向 `manifest.yaml` 中已存在的 executable fixture id。

维护规则：

- 普通测试只读取本地 YAML，不访问网络、GitHub clone 或用户本机临时目录。
- `review-required`、`needs-permission`、`reference-only`、`synthetic-only` 和 `rejected` 都不得被描述为已经 vendor 或 supported。
- MAPLE / cclib-data 原始 public outputs 只有在 decision 变成 `allowed/promoted` 并另起 promotion feature 更新 manifest/source metadata 后，才可以进入 `files/`。
- ASE extxyz 当前 project-authored vendored fixtures 可以记录为 `allowed/promoted`，但 reason 必须说明它们不是第三方 public original。
- decision ledger 不修改 parser runtime、ImportRegistryWorkflow、Platform Shell、Web UI 或报告导出；这些能力边界仍由 manifest、support matrix、snapshot 和 import preview regression 证明。

## Fixture Promotion Adapter

Fixture Promotion Adapter 是测试侧的统一收口 helper。它从 source inventory、public fixture decision ledger、manifest、golden snapshot 和 support matrix 派生 promotion summary，用来回答两件事：

- `allowed/promoted` decision 是否都有 executable fixture coverage。
- manifest 中的 `vendored-third-party` / `user-redacted` fixture 是否都能追溯到 `allowed/promoted` decision。

当前 helper 位于 `tests/parser_fixture_harness.py`：

```python
from pathlib import Path

from tests.parser_fixture_harness import (
    load_parser_fixture_manifest,
    load_parser_public_fixture_decisions,
    load_parser_source_inventory,
    load_parser_support_matrix,
    summarize_parser_public_fixture_promotion,
)

manifest = load_parser_fixture_manifest(Path("tests/fixtures/parsers/manifest.yaml"))
inventory = load_parser_source_inventory(Path("tests/fixtures/parsers/sources.yaml"))
ledger = load_parser_public_fixture_decisions(
    Path("tests/fixtures/parsers/public-fixture-decisions.yaml"),
    source_inventory=inventory,
    manifest=manifest,
)
matrix = load_parser_support_matrix(
    Path("tests/fixtures/parsers/support-matrix.yaml"),
    manifest,
    source_inventory=inventory,
)
summary = summarize_parser_public_fixture_promotion(inventory, ledger, manifest, matrix)
```

维护规则：

- summary 的 `unresolved_decision_ids` 和 `unresolved_fixture_ids` 必须为空。
- `source.kind: vendored-third-party` 必须写 `decision_id`，并且该 decision 必须是 `allowed/promoted`。
- `vendored-third-party` 的 `source_path`、`source_sha256` 和 `source_size_bytes` 必须与 `sources.yaml` 中对应 file 的 path/hash/size 一致。
- `source.kind: user-redacted` 也必须写 `decision_id`，`redistributable: true`，并在 `redaction` 与 decision evidence/reason 中说明授权和脱敏边界。
- synthetic / synthetic-derived fallback fixture 不需要 `decision_id`，也不能因此被描述成 public original 已经 vendor。
- 每个 promoted decision 的 fallback fixture 必须存在于 manifest，`support_status` 为 `supported` 或 `partial`，有 `parser-golden-v1` snapshot，并出现在 support matrix 的 `fixture_ids`。
- `blocked`、`needs-permission`、`reference-only`、`synthetic-only` 和 `rejected` decision 不得被 source-gated executable fixture 引用。
- Promotion Adapter 只读本地 YAML 和 snapshot，不 fetch、不写 fixture files、不自动更新 hash 或 snapshot。

## 来源策略与脱敏

每个 fixture 都必须在 `manifest.yaml` 的 `source` 中记录来源元数据：

```yaml
source:
  kind: synthetic
  url: null
  commit: null
  license: project-test-fixture
  redistributable: true
  redaction: none
```

`kind` 只能描述输入文件的真实来源，不用于包装支持承诺。

| 来源 | 何时使用 | 提交要求 |
|---|---|---|
| `synthetic` | 项目内手写的最小样例，用于锁定 parser 行为 | `license` 使用 `project-test-fixture` 或等价项目内许可，`redistributable: true`，`redaction: none` |
| `user-redacted` | 用户提供并明确允许进入仓库的真实输出 | 提交前完成脱敏，`redaction` 写明处理方式，必要时在 notes 说明授权边界 |
| `external-reference` | 已知外部样例可作为格式参考，但不 vendor 到仓库 | `file` 不指向本地提交文件，在 support matrix 中保留 `reference-only` 说明和来源 URL |
| `vendored-third-party` | 第三方样例许可证允许再分发，且确实需要随仓库测试 | 必须记录 `url`、`commit` 或 release、`license`、`redistributable: true`、脱敏状态、`source_path`、`source_sha256` 和 `source_size_bytes` |

`vendored-third-party` source 的最小结构：

```yaml
source:
  kind: vendored-third-party
  url: https://github.com/ClickFF/MAPLE
  commit: 001636482646bca0d1e867fb257322d2a172cc86
  license: BSD-3-Clause plus academic/commercial notice
  redistributable: true
  redaction: none
  source_path: example/sp/sp.out
  source_sha256: sha256:<64 hex>
  source_size_bytes: 4253
```

这些字段描述上游原始文件，不描述脱敏后本地 fixture。若本地 fixture 是用户授权脱敏版本，使用 `user-redacted`，不要伪装成第三方原文件。

真实用户或第三方输出进入 `files/` 前，至少检查：

- 绝对路径、home 目录、用户名和实验室共享目录。
- 主机名、集群节点名、队列名、scratch 路径、临时目录和工作目录。
- license key、token、账号、邮箱、内网地址和软件许可证服务器信息。
- 作业号、项目号、课题组内部编号和未公开项目名称。
- 未授权公开的结构、能量、反应路线、催化剂组合、PI 或学生姓名。
- 机器环境、编译路径、环境变量、conda 路径和 proprietary method settings。

MAPLE 的 ClickFF/MAPLE examples 可以作为 `external-reference` 调研来源；若未来要 vendor 示例文件，必须先确认对应文件的 license、再分发边界和学术/商业使用限制，再把来源记录到 manifest 或 support matrix。

当 public example 的许可证或输出 banner 同时带有 academic/commercial notice、all-rights-reserved 或其他再分发不确定文案时，不要把原文件复制进 `files/`。可以新增项目内 `synthetic-derived` shape fixture：只保留 parser 需要识别的最小格式形状、字段组合和单位语义，使用项目内手写结构与数值，并在 manifest `source.kind` 继续标为 `synthetic`。support matrix 可以通过 `source_ids` / `candidate_file_ids` / `reference_file_ids` 记录它参考了哪些 public candidate 或 reference-only 文件形状，但必须在 `known_limits` 说明 public originals 未 vendor。

MAPLE path family 是单独边界：IRC/NEB/String/AutoNEB `.xyz` 的 synthetic-derived fixture 只能证明 `Image N Energy = ...` 等 frame comment 可投影为多个 frame-level `ChemicalObjectDraft`。不要把它描述成 RxnFlow `ReactionPath`、ReactionGraph、TS candidate、direction/topology 或 energy profile 支持；AutoNEB tree JSON、NEB/String `.out` 和 IRC forward/backward direction 仍保持 reference-only，后续如要消费 path-level topology 必须另起 graph/import feature。

cclib-data 的 Gaussian/ORCA candidates 也按同一原则处理：许可证证据不足时，不要复制 cclib-data 原始 log/output 文件。可以新增项目内 Gaussian/ORCA `synthetic-derived` shape fixture 来固定 RxnFlow cclib adapter 的投影字段，例如 method、charge、spin multiplicity、last geometry 和 `scfenergies` eV 到 hartree 的转换。support matrix 可以用 `source_ids` / `candidate_file_ids` 连接 cclib-data candidates，但 `fixture_ids` 只能指向项目内手写 fixture，且 `known_limits` 必须说明 public originals 未 vendor、真实版本支持未声明。

## 新增 Fixture 流程

1. 确认要覆盖的范围：先写清楚 program、format、task 和目标 parser。不要因为新增一个样例就扩大“完整支持”的说法；真实版本支持必须由 fixture、support matrix 和 known limits 一起说明。
2. 准备输入文件：只有 `synthetic`、已授权的 `user-redacted` 或许可证允许的 `vendored-third-party` 文件可以进入 `files/`。仅作为调研参考的外部样例走 `external-reference`，不要提交本地副本；许可证不稳但格式形状有价值时，使用项目内 `synthetic-derived` fixture。
3. 添加 `manifest.yaml` 记录：`id` 使用稳定、可读的 kebab-case；`file` 使用 `files/<format-or-program>/...` 相对路径；`parse_options.expected_format` 要和 parser 选择一致；数值字段必须保留单位和容差语义。
4. 生成或核对 snapshot：普通测试不会自动重写 `snapshots/`。只有 parser 语义有意变化或新增 fixture 时，才显式生成 snapshot，并 review diff。
5. 更新 `support-matrix.yaml`：把 fixture id 挂到对应 entry；若新增 entry，必须写 `status`、字段状态、observed warning/error codes 和 `known_limits`。`partial` 状态必须说明 limits。
6. 运行 focused regression：至少跑 fixture harness 和 import preview parser regression，再跑全量 unittest。

manifest 最小结构示例：

```yaml
- id: gaussian-sp-water-synthetic-minimal
  program: gaussian
  format: gaussian-log
  task: sp
  parser_id: gaussian-log-cclib
  file: files/gaussian/gaussian-sp-water-synthetic-minimal.log
  source:
    kind: synthetic
    url: null
    commit: null
    license: project-test-fixture
    redistributable: true
    redaction: none
  parse_options:
    expected_format: gaussian-log
    strict: true
    frame_policy: all
  expected_snapshot: snapshots/gaussian-sp-water-synthetic-minimal.json
  tolerances:
    energy_abs: 1.0e-10
    coordinate_abs: 1.0e-8
  support_status: supported
  tags: [gaussian, cclib, sp, energy, geometry, synthetic]
  notes: "Synthetic minimal log authored for cclib fixture coverage; not a real Gaussian output."
```

## Snapshot 更新

`snapshots/*.json` 使用 `parser-golden-v1` 投影，记录 parser 输出的稳定行为：对象数量、formula、charge/spin、坐标、energy keys、warnings、error code 和 provenance 等。不要把缺失能量当成 `0`，也不要把单位假设藏在 snapshot 外；能量单位和 parser warning 必须显式可见。

默认测试只读取并比对 snapshot，不会重写文件。需要新增或有意更新 snapshot 时，可以在本地一次性脚本中调用 harness 的 update 模式：

```python
from pathlib import Path

from rxnflow.parsers import ParserRegistry
from tests.parser_fixture_harness import (
    assert_parser_fixture_snapshot,
    load_parser_fixture_manifest,
)

manifest = load_parser_fixture_manifest(Path("tests/fixtures/parsers/manifest.yaml"))
fixture = next(item for item in manifest.fixtures if item.id == "fixture-id")
assert_parser_fixture_snapshot(ParserRegistry.default(), fixture, update=True)
```

更新后必须 review 具体 diff：

```bash
git diff -- tests/fixtures/parsers/snapshots/<fixture-id>.json
```

如果 diff 只是 parser version 或字段顺序变化，先判断是否真的代表语义变化；没有语义变化时不要为了“刷新”而改 snapshot。

## Support Matrix 与 Diagnostic Codes

`support-matrix.yaml` 的 entry status 可使用 `supported`、`partial`、`unsupported`、`candidate` 或 `reference-only`。字段状态可使用 `supported`、`partial`、`unsupported`、`not-applicable` 或 `reference-only`。

维护规则：

- `partial` entry 必须填写 `known_limits`，说明真实边界。
- `candidate` entry 用于记录 source inventory 中后续可评估的文件，不代表已 vendor、已解析或已进入 executable fixture。
- `reference-only` entry 用于记录已知格式或任务，不代表 parser 已实现。
- `source_ids` 指向 `sources.yaml` 中的 source id。仅在 loader 传入 source inventory 时做交叉校验；未传入时保持旧测试兼容。
- `candidate_file_ids` 指向 `sources.yaml` 中 `fixture_policy: candidate` 的 file id。不要把 reference-only file id 放进这里。
- `reference_file_ids` 指向 `sources.yaml` 中 `fixture_policy: reference-only` 的 file id。不要把 `candidate` 或 `vendored` file id 放进这里。
- `fixture_ids` 仍只指向 `manifest.yaml` 中的 executable fixture id。source link 不替代 fixture coverage。
- synthetic-derived fixture 可以和 candidate/reference source link 出现在同一个 partial entry 中，但 `fixture_ids` 指向的是项目内手写 fixture，不代表 `candidate_file_ids` 或 `reference_file_ids` 对应的 public originals 已经入库或已解析。
- `observed_warning_codes` 和 `observed_error_codes` 只能引用 diagnostic catalog 中已有 code。
- 新增 warning/error code 前，先确认不是已有 code 的同义重复；新增后要同步 support matrix、snapshot 测试和相关设计/验收文档。

当前 warning codes：

- `partial_parse`
- `missing_section`
- `ambiguous_value`
- `unit_assumed`
- `unsupported_task`
- `unsupported_field`
- `source_license_notice`

当前 error codes：

- `invalid_input`
- `unsupported_format`
- `parse_failed`

## Import Preview Regression

新增或修改 parser fixture 后，必须运行 import preview parser regression。它验证同一批 fixture 经过 `ImportRegistryWorkflow.import_files` 和 `PlatformShellService(import.preview)` 时，仍然保留 parser preview 的关键字段：`parser_id`、`parser_version`、`object_count`、warnings、raw resource、provenance，以及预期失败样例的 error code。

import preview regression 只校验预览路径，不确认导入、不登记 ChemicalObject，也不更新项目状态。若 preview 通过但 confirm/import 行为改变，应另起对应 workflow 的 feature 或 issue。

Promotion-adapter-driven import preview regression 还会从 `summarize_parser_public_fixture_promotion(...).covered_fixture_ids` 派生 promoted preview fixture set，而不是维护第二份手写清单。当前 promoted preview set 是 4 个 extxyz project-authored fixtures；MAPLE/cclib-data blocked candidate 和 reference-only file ids 必须通过 guard 证明不在 promoted preview fixture ids 中。

维护 public/user-redacted fixture promotion 时，新增 promoted fixture 后必须让它同时进入：

- parser fixture harness snapshot regression。
- Fixture Promotion Adapter coverage。
- Workflow preview projection regression。
- Platform Shell `import.preview` projection regression。

这些 regression 都是 preview-only：不能调用 graph/energy/export/bundle，不确认导入，不登记 ChemicalObject。

ASE extxyz 项目内 fixture 维护规则：

- extxyz External Variant Intake 当前只允许 project-authored 或明确授权/可再分发的 user-redacted/public 文件进入 executable corpus；外部 public extxyz 不得因为能被 ASE 读取就自动 vendor。
- public/user-redacted extxyz 后续进入 corpus 前，必须补 source inventory、decision ledger、manifest、snapshot 和 support matrix，并明确 source policy、redaction、redistributable 和 reviewer。
- extxyz energy 按 ASE eV 语义进入 parser，必须在 snapshot 中显示为 Hartree，并带 `unit_assumed` warning。
- ASE 读回 extxyz 时 energy 可能位于 `atoms.calc.results["energy"]` 而不是 `atoms.info["energy"]`；新增变体要用 snapshot 或断言固定该 fallback 行为。
- multi-frame extxyz 只表示同一文件内多个 `ChemicalObjectDraft`，不得顺手声明 reaction path、direction/topology、TS candidate 或 energy profile。
- missing energy frame 保持 parse success、空 `energies` 和 `missing_section` warning，不补 0。
- lattice/PBC、forces、stress、magmoms 和 per-atom metadata 可以用 project-authored fixture 固定输入形状，但当前只能写入 support matrix known limits，不得描述成 `ChemicalObjectDraft` supported fields。

## Parser Gap Triage

解析失败、字段缺失或 snapshot diff 出现时，先按下面顺序分流：

- Parser bug：support matrix 已声明字段为 `supported` 或 `partial`，fixture 输入有效，但 parser 输出、单位、warning/error code 或 provenance 与预期不一致。处理方式是另起 parser fix feature/issue，修 parser 后显式更新 snapshot 并 review diff。
- Unsupported format/task：输入格式、任务类型或字段超出当前 support matrix，或者已经写在 `known_limits` 中。处理方式是记录 `unsupported`、`partial` 或 `reference-only`，使用合适 diagnostic code，不要伪造成功输出。
- Fixture issue：输入文件损坏、脱敏破坏格式、manifest 的 `parser_id` / `format` / `parse_options` / tolerance / source metadata 写错，或 snapshot 不是同一个 fixture 生成。处理方式是修 fixture 文件或元数据，再重新跑 focused tests。
- Docs/support matrix gap：parser 行为符合当前实现，但文档、support matrix 或 diagnostic catalog 没有说明。处理方式是更新指南或 support matrix，不改 parser runtime。

不要在 parser 中为了单个 fixture 写临时分支。若一个真实输出暴露了新格式变体，先把变体写进 support matrix 的 limits 或新 feature design，再决定是否扩展 parser。

## 常用命令

校验 fixture manifest：

```bash
python3 .codestable/tools/validate-yaml.py --file tests/fixtures/parsers/manifest.yaml --yaml-only
```

校验 support matrix：

```bash
python3 .codestable/tools/validate-yaml.py --file tests/fixtures/parsers/support-matrix.yaml --yaml-only
```

校验 source inventory：

```bash
python3 .codestable/tools/validate-yaml.py --file tests/fixtures/parsers/sources.yaml --yaml-only
```

校验 public fixture decision ledger：

```bash
python3 .codestable/tools/validate-yaml.py --file tests/fixtures/parsers/public-fixture-decisions.yaml --yaml-only
```

运行 parser fixture harness：

```bash
python3 -m unittest tests.test_parser_fixture_harness
```

运行 import preview parser regression：

```bash
python3 -m unittest tests.test_import_preview_parser_regression
```

运行全量 Python 单元测试：

```bash
python3 -m unittest discover
```

校验本 feature checklist：

```bash
python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-16-parser-corpus-docs/parser-corpus-docs-checklist.yaml --yaml-only
```

## 禁止事项

- 不提交未脱敏的真实 Gaussian、ORCA、MAPLE、ASE 或其他计算输出。
- 不提交 `.DS_Store`、checkpoint、大型二进制、许可证文件、账号信息或机器环境 dump。
- 不把 `sources.yaml` 中的 `candidate` 或 `reference-only` 条目当成已进入 corpus 的 executable fixture。
- 不绕过 `public-fixture-decisions.yaml` 把 review-required public original 放进 `files/`。
- 不把 synthetic / reference-only corpus 描述成真实程序版本完整支持。
- 不让 parser 直接依赖 ProjectStore、Registry、ReactionGraph、EnergyProfile 或 ExportArtifact。
- 不在普通测试中自动重写 snapshot。
- 不绕过 support matrix 给 partial support 做无说明承诺。

## 相关文档

- `docs/user/parser-output-support.md`
- `.codestable/architecture/core-platform.md`
- `.codestable/roadmap/rxnflow-parser-real-output-compatibility/rxnflow-parser-real-output-compatibility-roadmap.md`
- `.codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-roadmap.md`
- `.codestable/features/2026-05-15-parser-fixture-harness/parser-fixture-harness-design.md`
- `.codestable/features/2026-05-16-parser-support-matrix-diagnostics/parser-support-matrix-diagnostics-acceptance.md`
- `.codestable/features/2026-05-16-import-preview-parser-regression/import-preview-parser-regression-acceptance.md`
- `.codestable/features/2026-06-03-public-fixture-import-preview-regression/public-fixture-import-preview-regression-acceptance.md`
- `.codestable/features/2026-06-03-parser-public-fixture-guides/parser-public-fixture-guides-design.md`
