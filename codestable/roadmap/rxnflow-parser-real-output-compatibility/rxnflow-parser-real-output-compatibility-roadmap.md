---
doc_type: roadmap
slug: rxnflow-parser-real-output-compatibility
status: active
created: 2026-05-21
last_reviewed: 2026-05-22
tags: [rxnflow, parser, real-output, maple, cclib, gaussian, orca, ase, extxyz]
related_requirements: []
related_architecture: [ARCHITECTURE, core-platform]
---

# RxnFlow Parser Real Output Compatibility

## 1. 背景

当前 parser fixture corpus 已经建立了 manifest、support matrix、golden snapshot 和 import preview regression，但覆盖主体仍是 synthetic fixture。它可以锁住 parser 协议和基础字段，却还不能回答用户真正关心的问题：真实 Gaussian/ORCA/cclib 输出、ASE extxyz 和 MAPLE examples 在 RxnFlow 中到底能解析到哪些字段、哪些任务只做 reference-only、哪些格式需要先设计更高阶语义。

用户已确认首批方向接受 cclib 和 ASE extxyz，并明确要求兼容 MAPLE 输出，可参考 ClickFF/MAPLE 的 example 文件夹。调研结果显示，MAPLE 当前 README 将其定义为 machine-learning-potential-native computational chemistry toolkit，覆盖 single point、optimization、transition-state search、IRC、MD、frequency、scan 等任务；其 `example/` 目录包含 `sp`、`opt`、`ts`、`irc`、`md/nve`、`scan`、`freq/mw` 等输出和衍生文件。MAPLE license 页面同时包含 BSD 3-Clause 文本以及 academic/commercial notice，因此不能无脑大量 vendor 第三方 examples；需要先把 source policy、可再分发判断和最小样例选择落稳。

本 roadmap 的目标是把 parser 能力从“synthetic coverage”推进到“真实/公开输出兼容性有证据”：用可追溯来源、可再分发状态、golden snapshot、support matrix 和 import preview regression 固定首批真实样例边界，同时不把外部计算任务调度纳入范围。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- MAPLE 官方 example 目录的 source inventory：任务类型、文件类型、体积、许可证/再分发状态、可作为 reference-only 或 vendored fixture 的候选。
- MAPLE `.out`、MAPLE 多帧 `.xyz`、MAPLE `.sum`、AutoNEB tree JSON、MD thermo 等输出族的 fixture-backed 支持边界和 reference-only 记录。
- cclib 生态中 Gaussian / ORCA 公开样例的来源评估和最小 vendored / reference fixture 策略。
- ASE extxyz 真实语法变体：多帧、`info` metadata、calculator results、charge/spin、missing energy、unit 假设。
- Parser manifest / support matrix schema 的增量字段，记录 upstream URL、commit、license、redistributable、redaction、fixture size 和 source hash。
- Import preview regression 对真实/公开 fixture 的保真检查，确保 parser 输出进入 `import.preview` 后不丢 provenance、warnings、object_count 和 error code。
- 面向用户/开发者的 parser support guide，说明当前真实样例覆盖边界、已知 limits 和如何贡献新样例。

### 明确不做

- 不运行 Gaussian、ORCA、MAPLE、ASE 或任何外部计算任务。
- 不把 MAPLE、cclib、ASE 的所有测试数据全量复制进仓库。
- 不提交许可证不清、不可再分发、含用户隐私或未脱敏的真实输出。
- 不一次性支持 MAPLE 所有任务语义；例如 AutoNEB topology、IRC direction、MD trajectory/statistics 和 frequency thermochemistry 需要分阶段建模。
- 不把 parser 输出直接登记为 ChemicalObject，不修改 ReactionGraph、EnergyProfile 或 Report Export。
- 不实现 Web 文件上传大文件、OPFS payload store、云解析或计算任务调度。
- 不把 support matrix 写成真实软件版本的完整认证矩阵；它只声明 fixture-backed 支持边界。

## 3. 模块拆分（概设）

```
RxnFlow Parser Real Output Compatibility
├── Source Inventory：公开样例来源、许可证、体积、可再分发和 reference-only 清单
├── Corpus Metadata Extension：manifest/support matrix 的 source/size/hash/redistribution 字段增强
├── MAPLE Output Coverage：MAPLE .out / .xyz / .sum / AutoNEB / MD 等输出族分层覆盖
├── cclib Public Coverage：Gaussian / ORCA 公开样例通过 cclib adapter 的 fixture-backed 覆盖
├── ASE extxyz Coverage：真实 extxyz 语法变体和 metadata/unit 映射覆盖
├── Import Preview Compatibility：真实/公开 fixture 进入 import.preview 的回归保真
└── Parser Support Guides：用户/开发者可读的支持边界和贡献指南
```

### Source Inventory · 来源清单

- **职责**：把 MAPLE、cclib-data、ASE/extxyz 等外部样例来源整理为机器可读清单，记录 URL、commit/release、license、文件路径、大小、hash、任务类型、是否 vendor、是否 reference-only。
- **承载的子 feature**：`parser-source-inventory`
- **触碰的现有代码 / 模块**：新增 `tests/fixtures/parsers/sources.yaml` 或等价清单；不修改 parser runtime。

### Corpus Metadata Extension · 样例元数据增强

- **职责**：扩展 parser fixture manifest/support matrix 校验，让可再分发状态、来源 commit、source hash、fixture size、redaction 状态成为可检查字段。
- **承载的子 feature**：`parser-corpus-source-metadata`
- **触碰的现有代码 / 模块**：`tests/parser_fixture_harness.py`、`tests/fixtures/parsers/manifest.yaml`、`support-matrix.yaml`、parser corpus docs。

### MAPLE Output Coverage · MAPLE 输出覆盖

- **职责**：分层处理 MAPLE examples：先对 `.out` 和多帧 `.xyz` 建真实/公开最小 fixture；对 `.sum`、AutoNEB tree JSON、MD thermo/trajectory 等暂做 reference-only 或独立语义设计。
- **承载的子 feature**：`maple-public-example-inventory`、`maple-out-real-fixtures`、`maple-path-output-semantics`
- **触碰的现有代码 / 模块**：`rxnflow.parsers.maple`、fixture files/snapshots/support matrix；后续 path semantics 如需生成 ReactionPath 必须另起 roadmap/feature。

### cclib Public Coverage · Gaussian / ORCA 公开样例覆盖

- **职责**：从 cclib 公开数据源中选取许可证清晰、体积可控的 Gaussian/ORCA 样例，验证 cclib adapter 的 method、charge/spin、geometry、scf energy 和 warning 语义。
- **承载的子 feature**：`cclib-public-gaussian-orca-fixtures`
- **触碰的现有代码 / 模块**：`rxnflow.parsers.cclib_adapter`、fixture manifest/snapshots/support matrix；不复制 cclib parser 实现。

### ASE extxyz Coverage · extxyz 变体覆盖

- **职责**：覆盖 ASE extxyz 多帧、metadata、calculator energy、charge/spin、missing energy 和 unit assumption；把真实 extxyz 语义和当前 synthetic fixture 差异写进 support matrix。
- **承载的子 feature**：`ase-extxyz-real-variant-fixtures`
- **触碰的现有代码 / 模块**：`rxnflow.parsers.xyz`、fixture manifest/snapshots/support matrix。

### Import Preview Compatibility · 导入预览兼容

- **职责**：用真实/公开 fixture 驱动 `ImportRegistryWorkflow.import_files` 和 Platform Shell `import.preview`，固定 parser provenance、warnings、object_count、raw resource 和 error projection。
- **承载的子 feature**：`real-output-import-preview-regression`
- **触碰的现有代码 / 模块**：import preview tests、Platform Shell tests；不确认导入、不登记对象。

### Parser Support Guides · 支持指南

- **职责**：把 fixture-backed 真实/公开输出支持边界写成用户/开发者指南，说明支持哪些输出、哪些是 partial/reference-only、如何贡献脱敏样例。
- **承载的子 feature**：`parser-real-output-guides`
- **触碰的现有代码 / 模块**：`docs/dev/parser-fixture-corpus.md`、新增或更新 `docs/user/parser-output-support.md`。

## 4. 模块间接口契约 / 共享协议（架构层详设）

本节是后续 feature design 的硬约束。若真实样例暴露当前字段不够，先 update 本 roadmap，再继续实现。

### 4.1 Parser Source Inventory Schema

**方向**：外部样例调研 → fixture corpus
**形式**：YAML 清单

**契约**：

```yaml
schema_version: parser-source-inventory-v1
sources:
  - id: maple-dev-example
    program: maple
    kind: upstream-git
    url: https://github.com/ClickFF/MAPLE
    branch: dev
    commit: "<resolved commit>"
    license: "BSD-3-Clause plus academic/commercial notice"
    redistributable_default: review-required
    local_reference_path: null
    notes: "Example directory contains sp/opt/ts/irc/md/scan/freq outputs; do not vendor wholesale."
    files:
      - path: example/sp/sp.out
        task: sp
        format: maple-output
        size_bytes: 12345
        sha256: "sha256:<64 hex>"
        fixture_policy: candidate
        parser_intent: maple-output
```

**约束**：

- `fixture_policy` 只能是 `candidate`、`vendored`、`reference-only`、`rejected`。
- `redistributable_default=review-required` 的来源不得自动 vendor；每个 vendored file 必须在 manifest 中单独写明理由。
- `sha256` 针对 upstream file 内容，便于后续发现外部样例变化。
- 清单可以引用外部文件，但不得让测试依赖 `/tmp` clone 或网络。

### 4.2 Fixture Manifest Source Extension

**方向**：source inventory → executable fixture manifest
**形式**：扩展现有 `parser-fixtures-v1` 条目

**契约**：

```yaml
source:
  kind: vendored-third-party
  url: https://github.com/ClickFF/MAPLE
  commit: "<commit>"
  license: "BSD-3-Clause plus academic/commercial notice"
  redistributable: true
  redaction: none
  source_path: example/sp/sp.out
  source_sha256: "sha256:<64 hex>"
  source_size_bytes: 12345
```

**约束**：

- `source.kind` 仍保留 `synthetic`、`user-redacted`、`external-reference`、`vendored-third-party`。
- 新字段可选兼容旧 synthetic fixture，但 vendored-third-party 必须填写 `source_path`、`source_sha256`、`source_size_bytes`。
- `redistributable=false` 仍不得有本地 `file`。
- fixture 文件大小第一阶段建议单文件小于 200 KB；超过阈值必须在 feature design 说明理由。

### 4.3 Support Matrix Real Output Fields

**方向**：fixture coverage → support documentation / future UI hints
**形式**：扩展 `parser-support-matrix-v1`

**契约**：

```yaml
entries:
  - id: maple-output-public-examples
    program: maple
    formats: [maple-output, maple-xyz]
    tasks: [sp, opt, ts, irc]
    versions: [maple-dev-<commit>]
    parser_id: maple-output
    status: partial
    source_ids: [maple-dev-example]
    candidate_file_ids: []
    fixture_ids: [maple-sp-public-example]
    reference_file_ids: [maple-autoneb-tree-reference]
    fields:
      geometry: supported
      electronic_energy: supported
      charge_spin: unsupported
      path_semantics: partial
```

**约束**：

- `source_ids` 指向 source inventory；`fixture_ids` 指向可执行 manifest；`reference_file_ids` 指向 reference-only 条目。
- `candidate_file_ids` 指向 source inventory 中 `fixture_policy=candidate` 的条目；它表示后续可评估文件，不代表已 vendor 或已解析。
- `status=partial` 必须写 `known_limits`。
- support matrix 不声明未被 fixture 或 source inventory 支撑的版本。

### 4.4 Parser Output Projection Contract

**方向**：Parser Plugins → fixture snapshot / import preview
**形式**：现有 `ParseResult` / `ChemicalObjectDraft`

**契约**：

```python
ParseResult(
    objects=tuple[ChemicalObjectDraft, ...],
    provenance=Provenance(source_file_id, parser_id, parser_version, parsed_at),
)
```

**约束**：

- 能量必须以 `EnergyValue(value, unit, reference)` 表达；cclib/ASE eV 必须转 hartree，MAPLE 明确 Hartree 则保持 hartree。
- 缺失能量返回 warning 或 empty energy map，不写 0。
- 多帧 XYZ/MAPLE path 第一阶段仍输出多个 `ChemicalObjectDraft`；不得在 parser fixture feature 中私自生成 ReactionPath。
- 任务语义不确定时用 `partial_parse`、`unsupported_task` 或 `unsupported_field` warning，不伪造完整支持。

### 4.5 Import Preview Real Fixture Contract

**方向**：fixture corpus → ImportRegistryWorkflow / Platform Shell
**形式**：测试输入与 ShellResponse projection

**契约**：

```python
workflow.import_files(project_id, [ImportFileRequest(path, parse_options)])
PlatformShellService.run(ShellCommand("import.preview", {"source_paths": [...]}))
```

**约束**：

- import preview 只确认 preview projection，不确认导入、不登记 ChemicalObject。
- `raw_resource.checksum`、`parser_id`、`parser_version`、`object_count`、warning/error code 必须保留。
- 真实/公开 fixture 的 import preview 测试不得依赖网络或外部 clone。

## 5. 子 feature 清单

1. **parser-source-inventory** — 建立 MAPLE/cclib/ASE 公开样例来源清单，记录 URL、commit、license、文件类型、大小、hash、fixture policy。  
   - 所属模块：Source Inventory  
   - 依赖：无  
   - 状态：done  
   - 对应 feature：2026-05-21-parser-source-inventory  
   - 备注：已落地 `tests/fixtures/parsers/sources.yaml`、测试侧 loader 和 schema guard；未 vendor 第三方 MAPLE/cclib-data 文件。
2. **parser-corpus-source-metadata** — 扩展 manifest/support matrix 校验，支持 source hash、size、upstream path 和 vendored-third-party 必填字段。  
   - 所属模块：Corpus Metadata Extension  
   - 依赖：parser-source-inventory  
   - 状态：done  
   - 对应 feature：2026-05-21-parser-corpus-source-metadata  
   - 备注：已落地 manifest vendored-third-party upstream path/hash/size guard，以及 support matrix source/reference file link cross-check。
3. **maple-public-example-inventory** — 对 MAPLE example 文件族做任务级分类，把 `.out`、`.xyz`、`.sum`、AutoNEB JSON、MD thermo 等登记到 support matrix reference/candidate 状态。  
   - 所属模块：MAPLE Output Coverage  
   - 依赖：parser-source-inventory  
   - 状态：done  
   - 对应 feature：2026-05-21-maple-public-example-inventory  
   - 备注：已登记 MAPLE sp/opt public candidate 和 scan/path/MD/frequency reference-only source-backed entries；未 vendor 文件、未增强 parser。
4. **maple-out-real-fixtures** — 选择少量可再分发 MAPLE `.out` / final `.xyz` 样例进入 fixture corpus，补 golden snapshots 和 parser 回归。  
   - 所属模块：MAPLE Output Coverage  
   - 依赖：parser-corpus-source-metadata, maple-public-example-inventory  
   - 状态：done  
   - 对应 feature：2026-05-21-maple-out-real-fixtures  
   - 备注：MAPLE public examples 的许可证/banner 边界不适合直接 vendor，已采用项目内 synthetic-derived shape fixture 覆盖 sp `.out` / opt final `.xyz` 最小解析形状；public originals 仍未入库。
5. **maple-path-output-semantics** — 设计并验证 MAPLE IRC/NEB/String/AutoNEB path `.xyz` 的 frame label、energy、direction/topology 支持边界。  
   - 所属模块：MAPLE Output Coverage  
   - 依赖：maple-public-example-inventory  
   - 状态：done  
   - 对应 feature：2026-05-22-maple-path-output-semantics  
   - 备注：已用项目内 MAPLE path-family synthetic-derived fixture 固定 `.xyz` frame label / Hartree energy 逐帧解析边界；仍不生成 ReactionPath、direction/topology 或 TS candidate，AutoNEB tree JSON 继续 reference-only。
6. **cclib-public-gaussian-orca-fixtures** — 从 cclib 公开样例或等价可再分发来源接入 Gaussian/ORCA 最小真实输出，固定 method、charge/spin、geometry 和 energy snapshot。  
   - 所属模块：cclib Public Coverage  
   - 依赖：parser-corpus-source-metadata  
   - 状态：done  
   - 对应 feature：2026-05-22-cclib-public-gaussian-orca-fixtures  
   - 备注：cclib-data license 未在记录 commit/source API 中明确，已采用项目内 Gaussian/ORCA public-shape synthetic-derived fixtures 固定 adapter method、charge/spin、geometry 和 energy 投影；未 vendor cclib-data originals。
7. **ase-extxyz-real-variant-fixtures** — 接入真实 extxyz 变体，覆盖多帧、metadata、calculator energy、charge/spin、missing energy 和 unit warning。  
   - 所属模块：ASE extxyz Coverage  
   - 依赖：parser-corpus-source-metadata  
   - 状态：done  
   - 对应 feature：2026-05-22-ase-extxyz-real-variant-fixtures  
   - 备注：已用项目内 ASE extxyz multi-frame variant fixture 固定 metadata、calculator energy fallback、charge/spin、missing energy 和 eV → Hartree unit warning；未 vendor 外部 extxyz 数据集。
8. **real-output-import-preview-regression** — 用真实/公开 fixture 跑 ImportRegistryWorkflow 与 Platform Shell `import.preview` 回归，确认 preview projection 保真。  
   - 所属模块：Import Preview Compatibility  
   - 依赖：maple-out-real-fixtures, cclib-public-gaussian-orca-fixtures, ase-extxyz-real-variant-fixtures  
   - 状态：done  
   - 对应 feature：2026-05-22-real-output-import-preview-regression  
   - 备注：已用 parser fixture corpus 覆盖 Workflow Preview Projection 和 Platform Shell `import.preview` projection，固定 parser metadata、object_count、warnings、raw_resource id/path/checksum 和 expected-error；不确认导入、不登记对象。
9. **parser-real-output-guides** — 更新开发者/用户指南，说明真实/公开 fixture-backed 支持边界、reference-only 条目和贡献样例流程。  
   - 所属模块：Parser Support Guides  
   - 依赖：real-output-import-preview-regression  
   - 状态：done  
   - 对应 feature：2026-05-22-parser-real-output-guides  
   - 备注：已新增 `docs/user/parser-output-support.md`，并同步 `docs/dev/parser-fixture-corpus.md`；说明 fixture-backed 支持边界、reference-only/candidate 区别、warning/error 含义和真实样例贡献 checklist。

**最小闭环**：第 1 条 `parser-source-inventory` 做完后，系统能在不 vendor 第三方文件的前提下明确 MAPLE/cclib/ASE 样例来源、许可证和候选策略，为后续真实 fixture 接入提供可审计输入。

## 6. 排期思路

先做 source inventory，因为真实样例兼容性的最大风险不是代码，而是来源、体积、许可证和脱敏边界。如果第一步不稳，后续每个 parser feature 都会重复争论能不能提交某个输出文件。随后增强 manifest/support matrix 元数据，让后续 feature 有统一 guard。然后按用户优先级和当前风险推进 MAPLE，再补 cclib Gaussian/ORCA 与 ASE extxyz；这些样例接入后再统一做 import preview regression 和用户/开发者指南。

MAPLE 拆成 inventory、real fixture、path semantics 三步，是因为 MAPLE examples 文件族很丰富：`sp/opt` 适合最小 fixture；IRC/NEB/String/AutoNEB 涉及 path topology 和 TS 语义；MD/frequency/scan 可能需要更高阶领域模型。一次性塞入 parser 会把支持边界写乱。

## 7. 观察项

- MAPLE license 页面同时出现 BSD 3-Clause 和 academic/commercial notice；vendor example 前需要逐文件确认再分发边界，必要时请用户提供授权样例或采用 synthetic-derived fixture。
- cclib public data 可作为 Gaussian/ORCA 来源候选，但同样需要记录具体仓库、commit、license 和文件大小，不应直接复制全量数据集。
- 如果 MAPLE path outputs 需要生成 ReactionPath 或 TS candidate，不应在 parser fixture feature 中偷做；应另起 import-to-graph/path-semantics roadmap。
- 当前 support matrix 是 fixture-backed 边界，不是商业软件完整版本认证。用户文档必须避免“支持所有 Gaussian/ORCA/MAPLE”的措辞。
