---
doc_type: feature-acceptance
feature: 2026-05-22-parser-real-output-guides
status: accepted
summary: 验收 parser 输出支持边界的用户指南和开发者指南更新
tags: [parser, docs, user-guide, dev-guide, support-matrix]
---

# parser-real-output-guides 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：.codestable/features/2026-05-22-parser-real-output-guides/parser-real-output-guides-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] 新增 `docs/user/parser-output-support.md`，面向用户说明 parser 输出支持边界。
- [x] 用户指南解释 supported / partial / candidate / reference-only / unsupported 状态。
- [x] 用户指南覆盖 Gaussian、ORCA、MAPLE、plain XYZ 和 ASE extxyz 当前 fixture-backed 字段与限制。
- [x] 用户指南解释 `missing_section`、`unit_assumed`、`ambiguous_value`、`parse_failed` 等 warning/error 的影响。
- [x] 用户指南包含真实输出样例贡献 checklist。
- [x] `docs/dev/parser-fixture-corpus.md` 已链接用户指南并补当前 corpus 覆盖摘要。

流程图核对：support matrix / source inventory / import preview regression 的边界已同步到开发者指南、用户指南和 architecture。

## 2. 行为与决策核对

- [x] 用户/开发者分层：用户指南说明能预览什么，开发者指南说明如何维护 corpus。
- [x] 状态词固定：状态词含义与 support matrix 一致。
- [x] 贡献前先脱敏和授权：贡献 checklist 覆盖授权、脱敏、体积、版本、任务类型和期望字段。
- [x] 不扩支持承诺：文档明确 fixture-backed support 不是真实软件版本完整认证。

明确不做核对：

- [x] 未新增 parser runtime、fixture、snapshot 或 support matrix 条目。
- [x] 未修改 ImportRegistryWorkflow、Platform Shell、Web UI、Project Store、ReactionGraph、EnergyProfile 或 Report Export。
- [x] 未声明真实 Gaussian/ORCA/MAPLE/ASE extxyz 版本完整支持。
- [x] 未提供法律意见；许可证不清仍使用 review-required。

## 3. 验收场景核对

- [x] S1：新增用户指南。证据：`docs/user/parser-output-support.md`。
- [x] S2：状态词解释齐全。证据：用户指南“支持状态”表。
- [x] S3：格式支持边界逐项说明。证据：用户指南“当前格式边界”表。
- [x] S4：warning/error 影响说明齐全。证据：用户指南“Warning / Error 含义”表。
- [x] S5：贡献 checklist 覆盖授权、脱敏、体积、软件版本、任务类型和期望字段。证据：用户指南“贡献真实输出样例”。
- [x] S6：开发者指南链接用户指南并补覆盖摘要。证据：`docs/dev/parser-fixture-corpus.md`。
- [x] S7：architecture 记录新增用户指南和文档边界。证据：`ARCHITECTURE.md`、`core-platform.md`。
- [x] S8：roadmap item 标为 done。证据：roadmap items/main doc。

## 4. 术语一致性

- Parser Output Support Guide / Fixture-backed Support / Candidate Source / Reference-only Artifact / Contribution Checklist：设计、用户指南、开发者指南、architecture 和 roadmap 口径一致。
- 防冲突：未新增 runtime API 类型或 shell command 名称。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：术语、Core Platform 模块列表和边界说明已加入 Parser Output Support Guide。
- [x] `.codestable/architecture/core-platform.md`：功能清单和模块职责已加入用户指南。

## 6. requirement 回写

- [x] 本 feature 是文档补强，方案 frontmatter `requirement: null`。无需新增用户-facing requirement。

## 7. roadmap 回写

- [x] `rxnflow-parser-real-output-compatibility-items.yaml` 已把 `parser-real-output-guides` 改为 `done`。
- [x] `rxnflow-parser-real-output-compatibility-roadmap.md` 子 feature 清单已同步为 done。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新环境或工作流规则。

## 9. 遗留

- 用户指南说明当前 fixture-backed 支持边界，但真实用户导入 UI 的完整端到端指南仍可在后续 Web Import Inbox 成熟后另起 guide。
- 许可证复核仍不是法律意见，review-required 来源需要人工确认。
