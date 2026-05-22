---
doc_type: user-guide
slug: parser-output-support
component: parser-output-support
status: current
summary: RxnFlow 当前计算输出导入预览的支持边界、已知限制和样例贡献要求
tags: [parser, import-preview, gaussian, orca, maple, extxyz]
last_reviewed: 2026-05-22
---

# Parser Output Support

本指南说明 RxnFlow 当前对计算化学输出文件的导入预览边界。这里的“支持”指已经有 fixture、golden snapshot、support matrix 和 import preview regression 覆盖的行为；它不是 Gaussian、ORCA、MAPLE 或 ASE extxyz 真实软件版本的完整认证。

导入预览只解析文件并展示可确认的对象摘要。确认导入之前，RxnFlow 不会登记 ChemicalObject，也不会创建反应图谱、能量曲线或报告。

## 支持状态

| 状态 | 含义 |
|---|---|
| `supported` | 当前 fixture 覆盖的字段在回归测试中稳定输出。仍只代表对应 fixture 范围。 |
| `partial` | 可以解析一部分字段，但有明确限制；导入后必须检查 warning 和 missing fields。 |
| `candidate` | 已登记为后续可评估的公开或外部样例来源，但原文件未进入可执行 fixture corpus。 |
| `reference-only` | 只作为格式或任务类型参考，不进入自动解析回归，不代表 parser 已支持。 |
| `unsupported` | 当前明确不支持，或作为 expected-error 用例验证失败投影。 |

如果 UI 或 shell preview 返回 warning/error，应按 warning/error code 判断能否继续使用，不要只看文件后缀。

## 当前格式边界

| 程序 / 格式 | 当前可预览字段 | 状态 | 主要限制 |
|---|---|---|---|
| Gaussian log via cclib adapter | method、charge、spin multiplicity、last geometry、electronic energy | `partial` | 当前 executable fixtures 是项目内 synthetic / synthetic-derived shape；cclib-data public originals 未 vendor；真实 Gaussian 版本、任务类型、thermochemistry、frequency、NBO、SCF convergence 和完整 job metadata 未声明完整支持。 |
| ORCA output via cclib adapter | method、charge、spin multiplicity、last geometry、electronic energy | `partial` | 当前 executable fixtures 是项目内 synthetic / synthetic-derived shape；cclib-data public originals 未 vendor；真实 ORCA 版本、任务类型、SCF convergence details 和完整 job metadata 未声明完整支持。 |
| MAPLE `.out` | 基础 single point / optimization 形状中的 geometry 与 Hartree energy | `partial` | ClickFF/MAPLE public examples 仍是 candidate/reference-only；项目内 synthetic-derived fixture 只覆盖最小输出形状。 |
| MAPLE / MAPLE-style path `.xyz` | 多帧 label、geometry、Hartree energy comment | `partial` | 只生成 frame-level ChemicalObjectDraft；不推断 ReactionPath、IRC direction、NEB/String topology、TS candidate 或 energy profile。AutoNEB tree JSON、MD thermo、frequency summary 仍是 reference-only。 |
| Plain XYZ | element 与 3D coordinates | `partial` | plain XYZ 通常没有 energy、charge、spin 或 method；缺失 energy 会给 `missing_section` warning。 |
| ASE extxyz | geometry、label metadata、charge/spin metadata、electronic energy | `partial` | 当前是 project-authored variants；energy 按 ASE eV 语义转 Hartree 并给 `unit_assumed` warning；multi-frame extxyz 只生成多个对象，不推断反应路径。forces、stress、magmoms、lattice/PBC 深语义、calculator name、method 和 thermochemistry 未建模。 |

## Warning / Error 含义

| Code | 用户含义 |
|---|---|
| `missing_section` | 文件中缺少当前 parser 期望的某类信息，例如 energy。对象可能仍可预览，但缺失字段不会补 0。 |
| `unit_assumed` | parser 必须做单位假设或转换。例如 ASE/cclib 的 eV energy 会转为 Hartree。使用前应确认来源单位。 |
| `ambiguous_value` | 某个值存在但无法可靠转成结构化数值。通常需要检查原始文件或另起 parser fix。 |
| `unsupported_task` / `unsupported_field` | 文件任务或字段超出当前建模范围。 |
| `source_license_notice` | 来源许可或再分发状态需要人工复核。 |
| `parse_failed` | 当前 parser 无法解析该文件；raw resource 可保留，但不会生成 preview object。 |
| `unsupported_format` | 没有合适 parser 接收该格式。 |
| `invalid_input` | 调用参数、路径或 payload 不符合 shell/API 要求。 |

## 导入前检查

1. 先运行 import preview，查看 parser id/version、object_count、warning/error code 和 raw resource checksum。
2. 对 `partial` 状态的格式，确认缺失字段是否会影响后续反应图谱或能量计算。
3. 对能量数据，确认单位、基准和校正项来源；不要把缺失 energy 当作 0。
4. 对多帧 `.xyz` / extxyz，确认每一帧是否应该作为独立对象，还是需要后续 path/topology feature 才能表达。
5. 如果 preview 解析失败，保留原文件和错误信息，再决定是补 fixture、修 parser，还是把该任务列为 reference-only。

## 贡献真实输出样例

真实 Gaussian、ORCA、MAPLE、ASE 或其他程序输出进入仓库前，必须先确认这些事项：

- 授权：你有权分享该文件，且许可证或来源允许作为测试样例再分发。
- 脱敏：删除或替换用户名、home 目录、scratch 路径、主机名、队列名、作业号、邮箱、token、license server、内部项目编号和未公开结构信息。
- 体积：优先提交最小可复现样例；大型输出、轨迹、checkpoint 或二进制文件不应直接进入 corpus。
- 软件信息：说明程序、版本、任务类型、文件后缀和关键输入条件。
- 期望字段：说明希望 RxnFlow 解析哪些字段，例如 geometry、charge/spin、method、electronic energy、thermochemistry 或 path frame labels。
- 边界：如果文件只用于说明格式形状、许可证不清或不适合提交原文，应登记为 candidate/reference-only，而不是复制进 `files/`。

许可证不清时，RxnFlow 默认采用 `review-required`，不会自动 vendor 原始文件。可以用项目内 synthetic-derived fixture 固定 parser 所需的最小格式形状，但必须明确 public original 未进入仓库。

## 当前不承诺

- 不运行外部量化计算任务。
- 不完整认证 Gaussian、ORCA、MAPLE、ASE 的所有版本和任务类型。
- 不解析所有热化学、频率、NBO、SCF convergence、MD、scan、AutoNEB topology 或 path direction 语义。
- 不从导入预览自动登记 ChemicalObject；需要用户或 agent 显式确认。
- 不把 reference-only 或 candidate 条目描述成已支持导入。
