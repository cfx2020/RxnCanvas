---
doc_type: roadmap
slug: rxnflow-parser-fixture-corpus
status: completed
created: 2026-05-15
last_reviewed: 2026-05-21
tags: [rxnflow, parser, fixture-corpus, gaussian, orca, maple, xyz, extxyz]
related_requirements: []
related_architecture: [ARCHITECTURE, core-platform]
---

# RxnFlow Parser Fixture Corpus

## 1. 背景

当前核心平台已经有 Parser Plugin 基线：Gaussian / ORCA 通过 cclib adapter，XYZ / ASE extxyz 通过独立解析器，MAPLE `.out` 和多帧 `.xyz` 通过 MAPLE parser 进入 `ChemicalObjectDraft`。这些能力目前主要由内联或 fake fixture 覆盖，足够验证模块边界，但还不能回答两个产品问题：

1. 首批真实计算输出格式到底支持到什么版本、什么任务、什么字段。
2. 后续改 parser 时，是否会破坏真实 Gaussian、ORCA、MAPLE、XYZ/extxyz 输出的解析结果。

本 roadmap 的目标是建立真实样例库、golden snapshot、支持矩阵和诊断协议，让解析能力从“有插件入口”推进到“有可追踪支持边界”。它仍然属于核心层能力，不引入 UI、桌面壳层或云存储。

外部依据包括用户指定的 MAPLE 仓库。ClickFF/MAPLE 当前 README 将 MAPLE 描述为 MLFF-native computational chemistry toolkit，覆盖 single point、optimization、transition-state search、IRC、MD、frequency、scan 等任务；其 `example/` 目录按 `sp`、`opt`、`ts`、`irc`、`md`、`scan`、`freq` 等样例组织。MAPLE license 文件包含 BSD 3-Clause 文本，同时附有 academic / research use 与 commercial permission notice，因此 RxnFlow 不应在未确认许可证边界前直接大量 vendoring MAPLE example 输出；首轮应优先使用最小 synthetic fixture、用户授权样例、或在 manifest 中记录 source URL / commit / license / redistributable 状态。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- Parser fixture corpus 的目录结构、manifest schema、golden snapshot schema 和校验 helper。
- Gaussian、ORCA、standard XYZ、ASE extxyz、MAPLE `.out`、MAPLE-style multi-frame `.xyz` 的首批真实或最小可再分发样例覆盖。
- 每类格式的支持矩阵：程序、格式、任务、版本、字段覆盖、单位、已知限制和对应 fixture id。
- Parser warning / error 的字段覆盖诊断：缺失字段、部分解析、单位假设、任务不支持、版本不明等。
- Import Preview 对真实 fixture 的回归，保证 parser 输出进入 import ledger 前后不丢 provenance、warnings 和 object_count。
- 面向开发者和 agent 的 parser corpus 文档，说明如何添加新样例、如何更新 snapshot、如何处理许可证和用户数据。

### 明确不做

- 不运行 Gaussian、ORCA、MAPLE、ASE 或任何外部计算任务。
- 不把 MAPLE / cclib / ASE 的全部功能复制进 RxnFlow；解析器只消费已有输出文件。
- 不一次性支持所有 Gaussian / ORCA / MAPLE 版本和所有 job type。
- 不把真实用户日志、绝对路径、机器信息、license key、用户名或未授权课题数据直接提交进仓库。
- 不在 parser 里登记 ChemicalObject、修改 Project Store、生成 ReactionGraph、计算 EnergyProfile 或导出报告。
- 不实现图形 UI 文件导入、drag-and-drop、批量导入面板或 Web route。
- 不改变 Project Content schema，除非后续 feature 明确证明 parser preview 需要新的持久化字段。

## 3. 模块拆分（概设）

```
RxnFlow Parser Fixture Corpus
├── Fixture Source Policy：样例来源、许可证、脱敏和再分发边界
├── Fixture Manifest：样例元数据、parser 选择、容差和 expected snapshot 索引
├── Golden Snapshot：ParseResult 的稳定结构化期望
├── Support Matrix：格式/任务/字段/版本的支持边界
├── Format Coverage Packs：Gaussian / ORCA / XYZ / extxyz / MAPLE 样例包
├── Parser Diagnostics：字段缺失、单位假设和部分解析 warning 规范
├── Import Preview Regression：parser 输出进入 import workflow 的回归覆盖
└── Corpus Documentation：添加样例、更新快照和排查解析失败的文档
```

### Fixture Source Policy · 样例来源策略

- **职责**：规定 fixture 可来自 synthetic、user-redacted、external-reference 或 vendored third-party 四类来源；每个样例必须记录 source URL / commit、license、redistributable、redaction 状态和保留理由。
- **承载的子 feature**：`parser-fixture-harness`
- **触碰的现有代码 / 模块**：`tests/fixtures/parsers/`、测试 helper；不触碰 parser 实现。

### Fixture Manifest · 样例清单

- **职责**：用机器可读 YAML 统一描述 fixture id、program、format、task、parser_id、输入文件、期望 snapshot、浮点容差和支持状态。
- **承载的子 feature**：`parser-fixture-harness`
- **触碰的现有代码 / 模块**：新增 fixture manifest loader / validator。

### Golden Snapshot · 解析期望

- **职责**：把 `ParseResult` 投影为稳定 JSON：object_count、provenance、对象标签、元素序列、atom_count、charge/spin、method、energy keys、units、thermochemistry keys、warnings。
- **承载的子 feature**：`parser-fixture-harness`、各 format coverage feature。
- **触碰的现有代码 / 模块**：测试 helper；必要时新增 parser test utilities。

### Support Matrix · 支持矩阵

- **职责**：把“支持哪些程序/格式/任务/版本/字段”从口头说明落成结构化文件或文档，并和 fixture ids 互相引用。
- **承载的子 feature**：`parser-support-matrix-diagnostics`
- **触碰的现有代码 / 模块**：文档、测试 helper；不作为 runtime product database。

### Format Coverage Packs · 格式样例包

- **职责**：按格式补真实或最小可再分发 fixture，分别覆盖 standard XYZ / ASE extxyz、Gaussian cclib、ORCA cclib、MAPLE `.out` / multi-frame `.xyz`。
- **承载的子 feature**：`xyz-extxyz-fixture-coverage`、`gaussian-cclib-fixture-coverage`、`orca-cclib-fixture-coverage`、`maple-fixture-coverage`
- **触碰的现有代码 / 模块**：`tests/fixtures/parsers/files/`、`tests/fixtures/parsers/snapshots/`、对应 parser tests；parser 代码只在 snapshot 暴露真实缺口时按子 feature 范围调整。

### Parser Diagnostics · 解析诊断

- **职责**：统一真实样例中常见的 warning / error 语义，避免“解析成功但字段悄悄丢失”或“未知任务被误报成功”。
- **承载的子 feature**：`parser-support-matrix-diagnostics`
- **触碰的现有代码 / 模块**：`tests/fixtures/parsers/support-matrix.yaml`、fixture harness loader、parser tests；runtime parser code 只在后续 feature 明确新增诊断行为时触碰。

### Import Preview Regression · 导入预览回归

- **职责**：用 fixture corpus 驱动 `ImportRegistryWorkflow.import_files` 或等价 shell command，确认 parser provenance、warnings、object_count 和 error 进入 ImportItem / ParsePreview 后保持稳定。
- **承载的子 feature**：`import-preview-parser-regression`
- **触碰的现有代码 / 模块**：`rxnflow.import_workflow` tests、platform shell import preview tests；不改变 registration 语义。

### Corpus Documentation · 样例库文档

- **职责**：给开发者和 agent 写明如何添加新格式样例、如何脱敏、何时更新 snapshot、怎样判断是 parser bug 还是 unsupported format。
- **承载的子 feature**：`parser-corpus-docs`
- **触碰的现有代码 / 模块**：`docs/` 或 `codestable/compound/` 中的长期参考文档，按后续 feature design 决定落点。

## 4. 模块间接口契约 / 共享协议（架构层详设）

本节定义后续 feature 必须共同遵守的规划层契约。具体文件名可以在 feature design 中微调，但字段语义不得私自改写；若发现不适合真实样例，应先 update 本 roadmap。

### 4.1 Fixture Corpus 目录协议

**方向**：Parser tests / agent fixtures → Parser Registry
**形式**：测试数据目录约定

**契约**：

```text
tests/fixtures/parsers/
├── manifest.yaml
├── support-matrix.yaml
├── files/
│   ├── gaussian/
│   ├── orca/
│   ├── xyz/
│   ├── extxyz/
│   └── maple/
└── snapshots/
    └── {fixture_id}.json
```

**约束**：

- fixture id 必须全局唯一，使用小写字母、数字和连字符。
- `files/` 下禁止提交 `.DS_Store`、临时输出、缓存、checkpoint、大型二进制轨迹和包含用户隐私的原始日志。
- 每个可执行回归样例必须同时出现在 `manifest.yaml` 和 `snapshots/{fixture_id}.json`。
- external-reference 可以只记录来源和字段观察，不要求 vendoring 文件；未 vendoring 的样例不得进入自动测试。

### 4.2 Fixture Manifest Schema

**方向**：Fixture loader / snapshot test → fixture corpus
**形式**：YAML 数据结构

**契约**：

```yaml
schema_version: parser-fixtures-v1
fixtures:
  - id: maple-sp-ani2x-minimal
    program: maple
    format: maple-output
    task: sp
    parser_id: maple-output
    file: files/maple/maple-sp-ani2x-minimal.out
    source:
      kind: synthetic
      url: null
      commit: null
      license: project-test-fixture
      redistributable: true
      redaction: none
    parse_options:
      expected_format: maple-output
      strict: true
    expected_snapshot: snapshots/maple-sp-ani2x-minimal.json
    tolerances:
      energy_abs: 1.0e-10
      coordinate_abs: 1.0e-8
    support_status: supported
    tags: [maple, sp, energy, geometry]
    notes: null
```

**约束**：

- `program` 首批只允许 `gaussian`、`orca`、`xyz`、`ase-extxyz`、`maple`。
- `format` 必须使用现有 `ParserFormat` 值：`gaussian-log`、`orca-output`、`xyz`、`extxyz`、`maple-output`、`maple-xyz`。
- `source.kind=vendored-third-party` 时必须记录 URL、commit 或 release、license 和 `redistributable`。
- `redistributable=false` 的 fixture 不得包含本地 file，只能作为 support matrix 的 external reference。
- `support_status` 可为 `supported`、`partial`、`unsupported`、`reference-only`；自动测试只跑 `supported` 和明确可解析的 `partial`。

### 4.3 Golden Snapshot Schema

**方向**：Parser Registry → snapshot assertion
**形式**：JSON 数据结构

**契约**：

```json
{
  "schema_version": "parser-golden-v1",
  "fixture_id": "maple-sp-ani2x-minimal",
  "parser_id": "maple-output",
  "parse_ok": true,
  "object_count": 1,
  "provenance": {
    "parser_id": "maple-output",
    "parser_version": "0.1.0"
  },
  "objects": [
    {
      "label": "MAPLE sp",
      "formula": null,
      "charge": null,
      "spin_multiplicity": null,
      "method": "sp ani2x",
      "atom_count": 2,
      "elements": ["C", "H"],
      "energy_keys": ["electronic"],
      "energies": {
        "electronic": {
          "value": -14.0923448397,
          "unit": "hartree",
          "reference": "MAPLE Energy"
        }
      },
      "thermochemistry_keys": [],
      "warning_codes": []
    }
  ],
  "warning_codes": []
}
```

**约束**：

- snapshot 不保存完整坐标表，默认保存 `atom_count`、`elements` 和必要抽样坐标；需要坐标回归时由 fixture manifest 显式开启 coordinate sample。
- 能量值必须带 unit；缺失 energy 不得用 `0` 代替。
- 浮点比较由 manifest tolerances 控制，snapshot 文件只记录期望值。
- parser 版本变更时，如果解析语义没变，不应强制重写所有 snapshot；helper 应能忽略或单独检查 parser_version。

### 4.4 Support Matrix Schema

**方向**：Docs / tests / future UI import hints → parser corpus
**形式**：YAML 或 Markdown table，机器可读字段优先

**契约**：

```yaml
schema_version: parser-support-matrix-v1
entries:
  - program: maple
    formats: [maple-output, maple-xyz]
    tasks: [sp, opt, ts, irc, md, freq, scan]
    versions: ["0.1.2-dev"]
    parser_id: maple-output
    status: partial
    fields:
      geometry: supported
      electronic_energy: supported
      charge_spin: unsupported
      thermochemistry: partial
      path_frames: partial
    fixture_ids: [maple-sp-ani2x-minimal, maple-multiframe-xyz-minimal]
    known_limits:
      - IRC path semantics are parsed as independent frames until a reaction-path model is designed.
      - MAPLE .sum and AutoNEB tree outputs are reference-only until field semantics are confirmed.
```

**约束**：

- `status=supported` 只表示支持矩阵中列出的任务和字段，不表示完整支持该程序所有输出。
- `partial` 必须列出缺口和 warning code。
- 每个 `supported` 或 `partial` 条目必须至少引用一个 fixture id。

### 4.5 Parser Diagnostic Codes

**方向**：Parser Plugins → Import Workflow / tests
**形式**：warning / error code 约定

**契约**：

```text
warning codes:
- partial_parse
- missing_section
- ambiguous_value
- unit_assumed
- unsupported_task
- unsupported_field
- source_license_notice

error codes:
- invalid_input
- unsupported_format
- parse_failed
```

**约束**：

- 真实 fixture 中发现未知任务时，parser 应返回 `unsupported_task` warning 或 `unsupported_format` error，不能静默当作普通 `sp`。
- 单位不明但继续解析时必须返回 `unit_assumed`，并在 EnergyValue.reference 说明来源。
- 许可证或来源只影响 fixture corpus 使用；runtime parser 不应因为 source license notice 改变解析结果。

### 4.6 Snapshot Test Helper API

**方向**：tests → fixture corpus / ParserRegistry
**形式**：Python test helper

**契约**：

```python
def load_parser_fixture_manifest(path: Path) -> ParserFixtureManifest:
    ...

def assert_parser_fixture_snapshot(
    registry: ParserRegistry,
    fixture: ParserFixture,
    *,
    update: bool = False,
) -> None:
    ...
```

**约束**：

- `update=False` 是默认值，CI 和普通测试不得自动重写 snapshot。
- `update=True` 只允许本地显式执行，用于 parser 语义有意变化后的 snapshot 更新。
- helper 只调用 parser registry，不调用 ProjectStore、ChemicalRegistry、ReactionGraphService、EnergyProfileEngine 或 ReportExportService。

## 5. 子 feature 清单

1. **parser-fixture-harness**：建立 fixture 目录、manifest schema、snapshot schema、loader / assertion helper，并用一个最小 XYZ 或 MAPLE synthetic fixture 跑通回归闭环。
   - 状态：done
   - 对应 feature：2026-05-15-parser-fixture-harness
2. **xyz-extxyz-fixture-coverage**：补 standard XYZ 和 ASE extxyz 样例，覆盖几何、energy metadata、charge/spin 可用性、atom count mismatch 和 metadata 缺失 warning。
   - 状态：done
   - 对应 feature：2026-05-15-xyz-extxyz-fixture-coverage
3. **gaussian-cclib-fixture-coverage**：补 Gaussian cclib 真实或最小可再分发 log 样例，确认 charge/spin/method/geometry/electronic energy/thermochemistry 的首批字段边界。
   - 状态：done
   - 对应 feature：2026-05-15-gaussian-cclib-fixture-coverage
4. **orca-cclib-fixture-coverage**：补 ORCA cclib 真实或最小可再分发 output 样例，确认 ORCA banner、final energy、charge/spin/method/geometry 字段边界。
   - 状态：done
   - 对应 feature：2026-05-16-orca-cclib-fixture-coverage
5. **maple-fixture-coverage**：基于用户指定的 ClickFF/MAPLE examples 观察结果和可再分发策略，补 MAPLE `.out` / multi-frame `.xyz` 样例，并把 `.sum`、AutoNEB tree、MD thermo、IRC path 先标成 partial 或 reference-only。
   - 状态：done
   - 对应 feature：2026-05-16-maple-fixture-coverage
6. **parser-support-matrix-diagnostics**：落地支持矩阵和 warning code 规范，用已有 fixture 覆盖反推 parser 的 partial/unsupported 诊断。
   - 状态：done
   - 对应 feature：2026-05-16-parser-support-matrix-diagnostics
7. **import-preview-parser-regression**：用 fixture corpus 驱动 ImportRegistryWorkflow / platform shell import preview 回归，确认 parser 输出进入 ImportItem / ParsePreview 后不丢信息。
   - 状态：done
   - 对应 feature：2026-05-16-import-preview-parser-regression
8. **parser-corpus-docs**：补开发者/agent 文档，说明新增样例、许可证记录、脱敏、snapshot 更新和 parser gap 处理流程。
   - 状态：done
   - 对应 feature：2026-05-16-parser-corpus-docs

## 6. 排期与依赖

- 第一阶段 `parser-fixture-harness` 已完成；后续所有格式覆盖都依赖同一 manifest 和 snapshot helper。
- 第二阶段的 `xyz-extxyz-fixture-coverage`、`gaussian-cclib-fixture-coverage`、`orca-cclib-fixture-coverage` 和 `maple-fixture-coverage` 已完成；这些格式覆盖条目都遵守同一个 snapshot contract。
- 第三阶段 `parser-support-matrix-diagnostics` 已完成；当前 `support-matrix.yaml` 覆盖 manifest 中 9 个 fixture ids，并记录 MAPLE `.sum`、AutoNEB tree JSON 和 MD thermo reference-only artifacts。
- 第四阶段 `import-preview-parser-regression` 已完成；parser corpus 已接入 Import Workflow / Platform Shell import preview 保真回归。
- 第五阶段 `parser-corpus-docs` 已完成；新增流程已固化为 `docs/dev/parser-fixture-corpus.md`，供开发者和 agent 添加样例、更新 snapshot、维护 support matrix 和分流 parser gap。

技术依赖之外的优先级不在本 roadmap 替用户决定；如果用户希望优先强化 MAPLE，可在第二阶段先启动 `maple-fixture-coverage`。

## 7. 观察项

- MAPLE examples 的任务覆盖比当前 parser 基线更宽，尤其是 `.sum`、AutoNEB tree、MD thermo、IRC path 的领域语义需要用户确认后再进入正式支持。
- MAPLE license 文件同时出现 BSD 3-Clause 和 academic / research / commercial permission notice；导入其 example 输出前应单独确认 fixture 再分发边界。
- Gaussian / ORCA 真实 fixture 可能含有路径、用户名、主机名、scratch 路径和许可相关信息，必须先建立脱敏规则；当前 Gaussian 覆盖使用项目自有 synthetic log，不代表真实 Gaussian 输出支持矩阵。
- 当前 requirements 还没有单独的 parser/import format support 文档；本 roadmap 完成的是开发/测试侧 fixture corpus，不新增用户可见格式支持承诺，parser/import format support requirement 应在支持边界对外暴露时再补。
- 当前 architecture 已记录 parser fixture harness、XYZ/extxyz synthetic coverage、Gaussian/ORCA cclib synthetic coverage、MAPLE synthetic/reference-only coverage、fixture-backed support matrix 和 import preview parser regression 已落地；真实 Gaussian/ORCA/MAPLE fixture coverage 与真实版本支持边界仍待补，不应把未覆盖的程序版本写成已支持。

## 8. 变更日志

- 2026-05-21：8 个子 feature 均已 `done`，主文档状态标为 `completed`；保留真实 Gaussian/ORCA/MAPLE 版本覆盖和对外 parser support requirement 作为后续规划观察项。
