---
doc_type: dev-guide
slug: parser-fixture-corpus
component: parser-fixture-corpus
status: current
summary: 如何添加、校验和维护 RxnFlow parser fixture corpus
tags: [parser, fixture-corpus, testing, diagnostics]
last_reviewed: 2026-05-16
---

# Parser Fixture Corpus

## 概述

Parser fixture corpus 是 RxnFlow parser 能力的开发者和 agent 维护入口。它把一组可提交的计算输出样例、期望解析结果、支持矩阵和导入预览回归串起来，用于判断 parser 是否还能稳定输出可复用的 ChemicalObject 预览。

当前 corpus 只代表已提交 fixture 覆盖过的 synthetic / reference-only 场景，不代表 Gaussian、ORCA、MAPLE、ASE extxyz 或其他程序真实版本的完整支持。新增真实样例前必须先确认来源、再分发权限和脱敏状态。

corpus 位于 `tests/fixtures/parsers/`：

```text
tests/fixtures/parsers/
├── manifest.yaml
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
- `support-matrix.yaml`：支持矩阵和 diagnostic catalog。它说明当前 corpus 覆盖的程序、格式、任务、字段状态、fixture ids、已观察 warning/error code 和 `known_limits`。
- `files/`：可提交的 parser 输入文件。只有确认可再分发并完成脱敏的文件可以放进这里。
- `snapshots/`：`parser-golden-v1` 期望输出。snapshot 是稳定投影，不保存完整日志，也不应保存不必要的完整原始轨迹。

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
| `vendored-third-party` | 第三方样例许可证允许再分发，且确实需要随仓库测试 | 必须记录 `url`、`commit` 或 release、`license`、`redistributable: true` 和脱敏状态 |

真实用户或第三方输出进入 `files/` 前，至少检查：

- 绝对路径、home 目录、用户名和实验室共享目录。
- 主机名、集群节点名、队列名、scratch 路径、临时目录和工作目录。
- license key、token、账号、邮箱、内网地址和软件许可证服务器信息。
- 作业号、项目号、课题组内部编号和未公开项目名称。
- 未授权公开的结构、能量、反应路线、催化剂组合、PI 或学生姓名。
- 机器环境、编译路径、环境变量、conda 路径和 proprietary method settings。

MAPLE 的 ClickFF/MAPLE examples 可以作为 `external-reference` 调研来源；若未来要 vendor 示例文件，必须先确认对应文件的 license、再分发边界和学术/商业使用限制，再把来源记录到 manifest 或 support matrix。

## 新增 Fixture 流程

1. 确认要覆盖的范围：先写清楚 program、format、task 和目标 parser。不要因为新增一个样例就扩大“完整支持”的说法；真实版本支持必须由 fixture、support matrix 和 known limits 一起说明。
2. 准备输入文件：只有 `synthetic`、已授权的 `user-redacted` 或许可证允许的 `vendored-third-party` 文件可以进入 `files/`。仅作为调研参考的外部样例走 `external-reference`，不要提交本地副本。
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

`support-matrix.yaml` 的 entry status 可使用 `supported`、`partial`、`unsupported` 或 `reference-only`。字段状态可使用 `supported`、`partial`、`unsupported`、`not-applicable` 或 `reference-only`。

维护规则：

- `partial` entry 必须填写 `known_limits`，说明真实边界。
- `reference-only` entry 用于记录已知格式或任务，不代表 parser 已实现。
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
python3 codestable/tools/validate-yaml.py --file tests/fixtures/parsers/manifest.yaml --yaml-only
```

校验 support matrix：

```bash
python3 codestable/tools/validate-yaml.py --file tests/fixtures/parsers/support-matrix.yaml --yaml-only
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
python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-16-parser-corpus-docs/parser-corpus-docs-checklist.yaml --yaml-only
```

## 禁止事项

- 不提交未脱敏的真实 Gaussian、ORCA、MAPLE、ASE 或其他计算输出。
- 不提交 `.DS_Store`、checkpoint、大型二进制、许可证文件、账号信息或机器环境 dump。
- 不把 synthetic / reference-only corpus 描述成真实程序版本完整支持。
- 不让 parser 直接依赖 ProjectStore、Registry、ReactionGraph、EnergyProfile 或 ExportArtifact。
- 不在普通测试中自动重写 snapshot。
- 不绕过 support matrix 给 partial support 做无说明承诺。

## 相关文档

- `codestable/architecture/core-platform.md`
- `codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-roadmap.md`
- `codestable/features/2026-05-15-parser-fixture-harness/parser-fixture-harness-design.md`
- `codestable/features/2026-05-16-parser-support-matrix-diagnostics/parser-support-matrix-diagnostics-acceptance.md`
- `codestable/features/2026-05-16-import-preview-parser-regression/import-preview-parser-regression-acceptance.md`
