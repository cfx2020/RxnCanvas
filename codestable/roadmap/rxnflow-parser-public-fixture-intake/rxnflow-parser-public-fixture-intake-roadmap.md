---
doc_type: roadmap
slug: rxnflow-parser-public-fixture-intake
status: active
created: 2026-06-02
last_reviewed: 2026-06-03
tags: [rxnflow, parser, fixture-corpus, public-fixtures, maple, cclib, gaussian, orca, ase, extxyz, license-gate]
related_requirements: []
related_architecture: [ARCHITECTURE, core-platform]
---

# RxnFlow Parser Public Fixture Intake

## 1. 背景

RxnFlow 已经完成 parser fixture corpus、source inventory、support matrix、MAPLE/cclib/ASE synthetic-derived coverage 和 import preview regression。当前 parser 能力可以证明协议、字段投影、单位转换、warning/error 和 import preview 保真，但真实公开输出文件仍主要停在 `candidate` / `reference-only`：MAPLE public examples、cclib-data Gaussian/ORCA originals 和外部 extxyz 数据集都未进入 executable fixture corpus。

这个状态是合理的第一阶段，因为公开计算输出常带许可证、再分发、体积、隐私和软件 banner 风险。下一阶段不能简单把候选文件复制进 `tests/fixtures/parsers/files/`；必须先把“能否 vendor、为什么能/不能、若不能如何继续用 synthetic-derived shape fixture 固定 parser 行为”变成可审计流程。

本 roadmap 的目标是把 source-inventoried candidates 推进到 public fixture intake decision：对每个候选来源建立 license/redistribution gate、可复现 fetch/hash verify、promotion/rejection 记录、必要的 executable fixture 或 synthetic-derived fallback、import preview regression 和用户/开发者指南更新。它仍不运行外部量化计算任务，也不承诺完整认证 Gaussian/ORCA/MAPLE/ASE 版本。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- Public Fixture Decision：为 MAPLE、cclib-data、外部/用户授权 extxyz 样例建立逐文件 intake decision，记录 evidence、decision、reason 和 fallback。
- License / Redistribution Gate：明确 `allowed`、`needs-permission`、`rejected`、`synthetic-only` 等决策状态，阻止 review-required source 自动进入 executable corpus。
- Candidate Fetch & Verify：提供只用于人工/CI 可选检查的 fetch/hash verify workflow，测试不能依赖网络或本机 clone。
- MAPLE Candidate Resolution：处理 `sources.yaml` 中 MAPLE sp/opt/path/frequency/MD/scan candidates/reference files，决定哪些能 promotion，哪些保持 reference-only。
- cclib-data Candidate Resolution：处理 Gaussian/ORCA cclib-data candidates，确认 license 证据是否足以 vendor；不足时保持 synthetic-derived coverage 并写清边界。
- ASE/extxyz External Variant Intake：为用户授权或公开 extxyz 样例建立同一套 source/decision/promotion 流程，补真实语法变体而不是全量外部数据集。
- Fixture Promotion Contract：允许通过 license gate 的小文件进入 `manifest.yaml`、`files/`、snapshot 和 support matrix；不通过的文件必须有明确 fallback 或 rejection 记录。
- Import Preview Regression：promoted public/user-redacted fixtures 必须进入 parser golden 和 import preview regression；rejected/reference-only 文件不得被描述为 supported。
- Parser Support Guides：更新用户/开发者文档，说明 public fixture intake 的支持边界、license decision 和贡献样例流程。

### 明确不做

- 不运行 Gaussian、ORCA、MAPLE、ASE 或任何外部计算任务。
- 不全量 vendor MAPLE example、cclib-data、ASE examples 或其他公开数据集。
- 不把 review-required、许可证不清、含隐私或未脱敏文件放入 `files/`。
- 不为了通过某个真实输出样例在 parser 里写临时分支。
- 不把 public candidate、reference-only 或 rejected 文件描述成已支持导入。
- 不把 MAPLE path/topology、AutoNEB tree、MD thermo、frequency thermochemistry 或 scan coordinate 语义偷偷塞进 ChemicalObjectDraft parser。
- 不新增 ReactionPath 自动生成、TS candidate 判定、图谱组装、能量 profile 或报告导出能力。
- 不实现 Web 大文件上传、OPFS payload store、Worker pool、云解析或账号同步。
- 不改变现有 parser source inventory / support matrix 的基本语义；只做可审计增强。

## 3. 模块拆分（概设）

```
RxnFlow Parser Public Fixture Intake
├── Public Fixture Decision Ledger：逐文件 license / redistribution / promotion decision
├── Candidate Fetch Verify：按 source inventory 拉取候选并校验 sha256 的可选工具
├── MAPLE Candidate Resolver：MAPLE candidates/reference files 的 promotion 或 fallback
├── cclib-data Candidate Resolver：Gaussian/ORCA candidates 的 promotion 或 fallback
├── extxyz External Variant Intake：公开或用户授权 extxyz 样例接入流程
├── Fixture Promotion Adapter：manifest/files/snapshot/support matrix 的统一 promotion 规则
├── Import Preview Public Regression：promoted fixture 的 workflow/shell preview 保真
└── Public Fixture Guides：用户/开发者支持边界和贡献指南
```

### Public Fixture Decision Ledger

- **职责**：新增或扩展机器可读 decision ledger，记录每个 source file 是否可以进入 executable fixture corpus，以及证据和理由。
- **承载的子 feature**：`parser-public-fixture-decision-ledger`
- **触碰的现有代码 / 模块**：`tests/fixtures/parsers/sources.yaml`、可选新增 `tests/fixtures/parsers/public-fixture-decisions.yaml`、parser fixture harness validation。

### Candidate Fetch Verify

- **职责**：提供可选的候选文件拉取与 hash 校验入口，让 agent/开发者能复核 `sources.yaml` 中 URL/commit/path/sha256 是否仍匹配。
- **承载的子 feature**：`parser-public-candidate-fetch-verify`
- **触碰的现有代码 / 模块**：`tests/parser_fixture_harness.py` 或独立 test helper / dev script、developer guide。

### MAPLE Candidate Resolver

- **职责**：逐项处理 MAPLE candidates/reference-only entries，优先解决 `sp.out`、`opt final .xyz`、小型 path/frequency reference 的 promotion/fallback 决策。
- **承载的子 feature**：`maple-public-candidate-resolution`
- **触碰的现有代码 / 模块**：MAPLE source inventory、support matrix、manifest/snapshots；必要时小幅增强 `rxnflow.parsers.maple`，但不得生成 ReactionPath。

### cclib-data Candidate Resolver

- **职责**：复核 cclib-data Gaussian/ORCA candidates 的许可证证据和文件体积，决定是否 vendor 小型 logfile；如果不能 vendor，明确 synthetic-derived fallback 是否足够。
- **承载的子 feature**：`cclib-public-candidate-resolution`
- **触碰的现有代码 / 模块**：cclib source inventory、support matrix、manifest/snapshots；必要时小幅增强 cclib adapter tests，不复制 cclib parser。

### extxyz External Variant Intake

- **职责**：定义公开或用户授权 extxyz 样例进入 corpus 的最小流程，覆盖 lattice/PBC、forces/stress、calculator metadata、multi-frame edge cases 等真实变体的 intake 边界。
- **承载的子 feature**：`extxyz-public-variant-intake`
- **触碰的现有代码 / 模块**：source inventory、manifest/snapshots/support matrix、`rxnflow.parsers.xyz`。

### Fixture Promotion Adapter

- **职责**：把允许进入 corpus 的 public/user-redacted fixture 统一接入 `files/`、`manifest.yaml`、golden snapshot、support matrix 和 diagnostic catalog。
- **承载的子 feature**：`parser-public-fixture-promotion-adapter`
- **触碰的现有代码 / 模块**：parser fixture harness、manifest/support matrix validation、snapshot update workflow。

### Import Preview Public Regression

- **职责**：把 promoted public/user-redacted fixtures 纳入 `ImportRegistryWorkflow.import_files` 与 Platform Shell `import.preview` regression，验证 parser metadata、raw resource、warnings/errors 和 object_count 保真。
- **承载的子 feature**：`public-fixture-import-preview-regression`
- **触碰的现有代码 / 模块**：`tests/test_import_preview_parser_regression.py`、Platform Shell tests。

### Public Fixture Guides

- **职责**：更新开发者/用户指南，让贡献者知道 public fixture intake 的 license gate、hash verify、promotion decision、unsupported/reference-only 口径和贡献真实样例 checklist。
- **承载的子 feature**：`parser-public-fixture-guides`
- **触碰的现有代码 / 模块**：`docs/dev/parser-fixture-corpus.md`、`docs/user/parser-output-support.md`、architecture/roadmap acceptance 回写。

## 4. 模块间接口契约 / 共享协议（架构层详设）

本节是后续 feature design 的硬约束。若某条 feature 发现字段不够，先 update 本 roadmap，再继续实现。

### 4.1 Public Fixture Decision Contract

**方向**：source inventory candidate/reference file -> intake decision -> fixture promotion/rejection
**形式**：YAML ledger 或 `sources.yaml` 扩展

```yaml
schema_version: parser-public-fixture-decisions-v1
decisions:
  - source_id: maple-dev-example
    file_id: maple-sp-output-example
    checked_at: "2026-06-02"
    evidence:
      - kind: license-file
        url: https://github.com/ClickFF/MAPLE
        note: "Repository license page includes BSD 3-Clause text plus academic/commercial notice."
      - kind: source-inventory
        path: tests/fixtures/parsers/sources.yaml
    decision: needs-permission
    promotion: blocked
    reason: "Redistribution boundary is not clear enough to vendor original output."
    fallback_fixture_ids:
      - maple-sp-public-shape-synthetic-derived
    reviewer: agent
```

**约束**：

- `decision` 只能是 `allowed`、`needs-permission`、`rejected`、`synthetic-only`、`reference-only`。
- `promotion` 只能是 `promoted`、`blocked`、`not-applicable`。
- `allowed + promoted` 才能让第三方 original 进入 `tests/fixtures/parsers/files/`。
- `needs-permission` / `rejected` 必须有 `reason` 和 fallback 或 reference-only 说明。
- `reviewer` 记录决策来源；agent 可做初判，但用户授权文件必须记录用户确认。
- evidence 可以引用外部 URL、source inventory、本地 LICENSE file、用户授权说明或 docs；不能写“看起来可以”。

### 4.2 Candidate Fetch Verify Contract

**方向**：source inventory -> temporary downloaded file -> sha256 verification
**形式**：dev-only helper / script / test utility

```text
input: source_id, file_id
output:
  source_id
  file_id
  url
  commit_or_version
  upstream_path
  expected_sha256
  actual_sha256
  byte_size
  ok
  fetched_at
```

**约束**：

- 普通 unit tests 不访问网络。
- fetch 输出只能写临时目录或显式 artifact，不自动写入 `tests/fixtures/parsers/files/`。
- sha256 mismatch 只说明 source inventory 过期或 upstream 文件变化，不自动更新 hash。
- promotion feature 必须先通过 decision ledger，再复制最小文件和生成 snapshot。

### 4.3 Fixture Promotion Contract

**方向**：decision ledger -> fixture manifest -> parser golden snapshot -> support matrix
**形式**：现有 `parser-fixtures-v1` + `parser-support-matrix-v1`

```yaml
source:
  kind: vendored-third-party
  url: https://github.com/ClickFF/MAPLE
  commit: "<commit>"
  license: "<license expression>"
  redistributable: true
  redaction: none
  source_path: example/sp/sp.out
  source_sha256: sha256:<64 hex>
  source_size_bytes: 4253
  decision_id: maple-dev-example:maple-sp-output-example
```

**约束**：

- `source.kind=vendored-third-party` 必须带 `decision_id`，并能在 decision ledger 中找到 `allowed/promoted`。
- `source.kind=user-redacted` 必须记录 user authorization 和 redaction note；不能冒充 public original。
- 单文件首轮建议小于 200 KB；超过阈值必须在 feature design 说明体积理由。
- snapshot 必须显式记录 parser warning、unit、energy key/source、provenance 和 missing fields。
- support matrix 的 `fixture_ids` 只能指向 executable fixtures；candidate/reference-only 仍只能出现在 `candidate_file_ids` / `reference_file_ids`。

### 4.4 MAPLE Public Candidate Contract

**方向**：MAPLE source inventory -> MAPLE parser / fallback fixtures
**形式**：MAPLE `.out` / `.xyz` / `.sum` / JSON decision

**约束**：

- `sp.out` 和 `opt final .xyz` 是首批可评估候选；如果 license decision 不允许 promotion，保留 synthetic-derived shape fixtures 并标 `synthetic-only`。
- MAPLE `.xyz` 多帧/path family 继续只生成 frame-level `ChemicalObjectDraft`，不得生成 ReactionPath、direction/topology、TS candidate 或 energy profile。
- `.sum`、AutoNEB tree JSON、MD thermo/summary、scan output 在没有领域模型前保持 reference-only。
- MAPLE parser 能量必须保持 Hartree 语义；缺失或不明确字段用 warning，不补 0。

### 4.5 cclib-data Public Candidate Contract

**方向**：cclib-data candidates -> cclib adapter regression / fallback fixtures
**形式**：Gaussian/ORCA log/output decision

**约束**：

- cclib-data originals 只有在 license/redistribution evidence 明确允许时才可 vendor。
- 若 license 不清，继续使用 project-authored synthetic-derived Gaussian/ORCA shape fixtures，并在 support matrix 维持 public originals unvendored 的 known limit。
- promoted Gaussian/ORCA fixture 只固定 cclib adapter projection：method、charge/spin、last geometry、electronic energy、warnings/provenance。
- 不新增 NBO、frequency、thermochemistry、SCF convergence deep semantics，除非对应 feature design 明确扩展字段。

### 4.6 extxyz External Variant Contract

**方向**：public/user-redacted extxyz -> XYZ/ASE parser fixtures
**形式**：authorized extxyz fixture + source/decision metadata

**约束**：

- project-authored extxyz fixtures 仍可继续使用；外部 extxyz 样例必须走 decision ledger。
- energy 仍按 ASE eV 语义转换到 Hartree，并保留 `unit_assumed` warning，除非输入明确给出可解析单位。
- multi-frame extxyz 仍输出多个 `ChemicalObjectDraft`，不推断 ReactionPath。
- forces、stress、lattice/PBC、magmoms 等字段可先进入 `unsupported_field` / known_limits，不强行映射。

### 4.7 Import Preview Public Regression Contract

**方向**：promoted fixture corpus -> ImportRegistryWorkflow / Platform Shell
**形式**：focused regression

**约束**：

- 只验证 preview projection，不确认导入、不登记 ChemicalObject。
- `parser_id`、`parser_version`、`object_count`、warning/error code、raw resource id/path/checksum 和 provenance 必须保留。
- rejected/reference-only candidates 不进入 executable import preview regression；它们只在 decision/support docs 中出现。

## 5. 子 feature 清单

1. **parser-public-fixture-decision-ledger**：新增 public fixture decision ledger，记录 MAPLE/cclib/extxyz 候选文件的 evidence、decision、promotion 状态和 fallback。
   - 所属模块：Public Fixture Decision Ledger
   - 依赖：无
   - 状态：done
   - 对应 feature：2026-06-02-parser-public-fixture-decision-ledger
   - 备注：最小闭环已完成；`public-fixture-decisions.yaml` 覆盖当前 source inventory 全部 file ids，先建立 gate，避免 review-required source 被误 vendor。

2. **parser-public-candidate-fetch-verify**：提供 dev-only fetch/hash verify workflow，按 `sources.yaml` 的 source_id/file_id 拉取候选并校验 sha256。
   - 所属模块：Candidate Fetch Verify
   - 依赖：parser-public-fixture-decision-ledger
   - 状态：done
   - 对应 feature：2026-06-02-parser-public-candidate-fetch-verify
   - 备注：已落地 dev-only request/result helper；普通测试不访问网络、不写 fixture corpus，只复核调用方提供 bytes 是否匹配 source inventory。

3. **maple-public-candidate-resolution**：对 MAPLE sp/opt/path/frequency/MD/scan candidates/reference files 做逐项 decision，能 promotion 的生成 fixture，不能 promotion 的写明 synthetic-only/reference-only fallback。
   - 所属模块：MAPLE Candidate Resolver
   - 依赖：parser-public-fixture-decision-ledger, parser-public-candidate-fetch-verify
   - 状态：done
   - 对应 feature：2026-06-02-maple-public-candidate-resolution
   - 备注：已落地测试侧 MAPLE resolution summary/guards；当前无 MAPLE originals promoted，3 个 candidate 全 blocked，14 个 reference-only anchors 全覆盖，public originals 未进入 executable fixture ids，不生成 ReactionPath、TS candidate 或 path topology。

4. **cclib-public-candidate-resolution**：复核 cclib-data Gaussian/ORCA candidates 的许可证与 hash，决定是否 promotion；不能 promotion 时固定 synthetic-derived fallback 口径。
   - 所属模块：cclib-data Candidate Resolver
   - 依赖：parser-public-fixture-decision-ledger, parser-public-candidate-fetch-verify
   - 状态：done
   - 对应 feature：2026-06-02-cclib-public-candidate-resolution
   - 备注：已落地测试侧 cclib-data resolution summary/guards；当前无 cclib-data originals promoted，2 个 Gaussian candidate 与 2 个 ORCA candidate 全 blocked，2 个 reference-only anchors 全覆盖，public originals 未进入 executable fixture ids，不新增 thermochemistry、NBO 或 SCF deep fields。

5. **extxyz-public-variant-intake**：建立公开或用户授权 extxyz 样例 intake 流程，并选择少量真实变体补 fixture 或 known_limits。
   - 所属模块：extxyz External Variant Intake
   - 依赖：parser-public-fixture-decision-ledger
   - 状态：done
   - 对应 feature：2026-06-02-extxyz-public-variant-intake
   - 备注：已落地 extxyz variant intake summary/guards；当前 4 个 project-authored extxyz variants 全 allowed/promoted，新增 lattice/PBC/forces/stress/magmoms advanced-field fixture，但 advanced fields 仍为 known-limits 不映射到领域模型。

6. **parser-public-fixture-promotion-adapter**：统一校验 promoted fixture 的 `decision_id`、source metadata、manifest、snapshot 和 support matrix 关系。
   - 所属模块：Fixture Promotion Adapter
   - 依赖：maple-public-candidate-resolution, cclib-public-candidate-resolution, extxyz-public-variant-intake
   - 状态：done
   - 对应 feature：2026-06-03-parser-public-fixture-promotion-adapter
   - 备注：已落地 Fixture Promotion Adapter summary/guards；当前 4 个 extxyz project-authored promoted decisions 全覆盖，source-gated fixture 必须带 decision_id 且匹配 source metadata/snapshot/support matrix，MAPLE/cclib blocked/reference-only decisions 不可执行。

7. **public-fixture-import-preview-regression**：把 promoted public/user-redacted fixtures 纳入 ImportRegistryWorkflow 与 Platform Shell `import.preview` 回归。
   - 所属模块：Import Preview Public Regression
   - 依赖：parser-public-fixture-promotion-adapter
   - 状态：done
   - 对应 feature：2026-06-03-public-fixture-import-preview-regression
   - 备注：已落地 promotion-adapter-driven import preview regression；当前从 Fixture Promotion Adapter summary 派生 4 个 extxyz project-authored promoted fixtures，覆盖 Workflow/Shell preview projection、preview-only guard 和 MAPLE/cclib blocked/reference-only 反向 guard。

8. **parser-public-fixture-guides**：更新开发者/用户指南和 architecture，说明 public fixture intake gate、promotion/rejection、reference-only 和贡献真实样例流程。
   - 所属模块：Public Fixture Guides
   - 依赖：public-fixture-import-preview-regression
   - 状态：planned
   - 对应 feature：null
   - 备注：用户文档必须继续避免“完整支持真实版本”的措辞。

**最小闭环**：第 1 条 `parser-public-fixture-decision-ledger`。完成后，即使没有任何第三方文件被允许 vendor，项目也能明确记录“为什么不能进、用哪个 synthetic-derived fixture 兜底、后续需要用户授权还是继续 reference-only”。

## 6. 排期 / 推进顺序

技术依赖顺序建议如下：

1. 先做 `parser-public-fixture-decision-ledger`，把 review-required source 的进入条件变成硬 gate。
2. 再做 `parser-public-candidate-fetch-verify`，让候选文件 hash 和 upstream path 可复核，但不让普通测试依赖网络。
3. MAPLE 与 cclib-data resolution 可以并行，但都必须先通过 decision ledger 和 fetch/hash verify。
4. extxyz external variant intake 可以在用户提供授权样例后推进；没有授权样例时先建立流程和 known_limits。
5. promotion adapter 在候选 resolution 后统一收口，防止 manifest/support matrix 漂移。
6. import preview regression 和 guides 作为最后收口，确保 promoted/rejected/reference-only 的用户口径一致。

## 7. 观察项

- MAPLE 当前 source inventory 已记录 BSD 3-Clause plus academic/commercial notice；promotion 前必须逐文件确认再分发边界，必要时请用户提供授权样例。
- cclib-data candidates 已有 hash 和体积记录，但当前本地记录仍是 review-required；如果无法确认 license，不应 vendor originals。
- 真实 public fixture intake 的价值不只是“多几个测试文件”，而是把 RxnFlow 对真实输出的支持声明从 synthetic-derived 推进到可审计证据。没有 license gate 的 public fixture 反而会降低项目可信度。
- MAPLE path/topology、frequency thermochemistry、MD/scan 等领域语义可能需要后续独立 roadmap；本 roadmap 只处理 fixture intake 和 parser preview 边界。
- 如果用户提供可再分发的真实 Gaussian/ORCA/MAPLE 输出，应优先走 `user-redacted` decision path，而不是等待 public dataset license。
