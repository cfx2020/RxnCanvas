---
doc_type: feature-acceptance
feature: 2026-06-03-parser-public-fixture-guides
status: accepted
summary: 验收 public fixture intake 开发者/用户指南、architecture 归并、support boundary wording 和 roadmap 回写
tags: [parser, fixture-corpus, public-fixtures, docs, guide, support-boundary]
---

# parser-public-fixture-guides 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-03
> 关联方案 doc：codestable/features/2026-06-03-parser-public-fixture-guides/parser-public-fixture-guides-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] Developer guide 已新增 Public Fixture Intake Gate，把 source inventory、Candidate Fetch Verify、decision ledger、manifest/snapshot/support matrix、Fixture Promotion Adapter、import preview regression 和 guide sync 串成维护流程。
- [x] Developer guide 明确 Candidate Fetch Verify 只校验 bytes/hash/size，不证明 license、脱敏或 promotion 通过。
- [x] Developer guide 明确 `allowed/promoted` 后仍需要 executable fixture、snapshot、support matrix 和 import preview regression coverage。
- [x] User guide 已更新 support boundary：`candidate`、`reference-only`、`blocked` 不代表 supported import preview；`allowed/promoted` 且进入 manifest/snapshot/support matrix/import preview regression 才代表 fixture-backed preview 行为被覆盖。
- [x] User guide 当前格式边界说明 MAPLE/cclib-data public originals 未 vendor，ASE extxyz 当前 promoted coverage 是 project-authored variants，不是第三方版本认证。

流程图核对通过：public source/user-redacted sample 进入 source inventory，可选 fetch/hash verify，再进入 decision ledger；`allowed/promoted` 才进入 manifest/snapshot/support matrix、promotion adapter 和 import preview regression，否则进入 blocked/reference-only/fallback wording；两条路径最后都同步到指南。

## 2. 行为与决策核对

需求摘要已落地：public fixture intake 的前置 feature 已完成，最后的开发者/用户指南口径已经同步；本 feature 没有新增 runtime 能力。

明确不做核对：

- [x] 未新增 fixture files、source inventory entries、decision ledger entries、snapshots 或 support matrix entries。
- [x] 未 vendor MAPLE/cclib-data/ASE public originals，也未新增 user-redacted 输出。
- [x] 未修改 parser runtime、Import Workflow、Platform Shell、Web UI、report export 或 tests。
- [x] 未宣称 Gaussian、ORCA、MAPLE、ASE extxyz 真实版本完整支持。
- [x] 未把 Candidate Fetch Verify 成功描述成 license/promotion 已通过。
- [x] 普通 tests 和文档验证不访问网络。

关键决策已落地：

- [x] 开发者指南写维护流程，用户指南写支持边界。
- [x] 状态口径从 decision ledger 出发，candidate/reference-only/blocked 只代表登记或参考，不代表 supported。
- [x] 贡献 checklist 包含授权、脱敏、体积、软件信息、期望字段和边界判断。
- [x] Architecture 只归并已落地指南口径，不新增未来支持承诺。

挂载点核对通过：实际挂载点为 `docs/dev/parser-fixture-corpus.md`、`docs/user/parser-output-support.md`、`codestable/architecture/ARCHITECTURE.md`、`codestable/architecture/core-platform.md`、本 checklist/acceptance 和 roadmap 回写。scope diff 证明未挂入 parser runtime、Import Workflow、Platform Shell、Web UI、report export、tests 或 fixture corpus 数据文件。

## 3. 验收场景核对

- [x] S1/S2/S3：Developer guide 说明完整 intake gate，且区分 fetch verify、license/promotion 和 executable coverage。证据：`docs/dev/parser-fixture-corpus.md` 的 `Public Fixture Intake Gate` 与 `Import Preview Regression` 小节。
- [x] S4/S5：User guide 明确 candidate/reference-only/blocked 不代表 supported import preview，并同步 MAPLE/cclib public originals 未 vendor、extxyz project-authored promoted coverage。证据：`docs/user/parser-output-support.md` 的 `支持状态`、`当前格式边界`。
- [x] S6：User guide 贡献 checklist 包含准入流程、授权、脱敏、体积、软件信息、期望字段、边界和回归覆盖。证据：`docs/user/parser-output-support.md` 的 `贡献真实输出样例` 小节。
- [x] S7：两份指南避免完整支持真实版本或等价承诺；相关 grep 只保留否定式边界说明，没有正向支持承诺。
- [x] S8：Architecture docs 已归并指南当前职责和 public fixture intake gate 口径。
- [x] S9：roadmap item 在 design 阶段标为 `in-progress`，acceptance 阶段标为 `done`。
- [x] S10：scope guard 证明未修改 parser runtime、Import Workflow、Platform Shell、Web UI、report export、tests 或 fixture corpus 数据。

验证命令：

- [x] `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-06-03-parser-public-fixture-guides/parser-public-fixture-guides-checklist.yaml --yaml-only`
- [x] `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-items.yaml --yaml-only`
- [x] `git diff --check`
- [x] `git diff -- rxnflow/parsers rxnflow/import_workflow.py rxnflow/platform.py rxnflow/export.py rxnflow/models.py web tests tests/fixtures/parsers`
- [x] `rg -n "完整支持真实版本|真实版本完整支持|完整版本支持|Candidate Fetch Verify 成功.*license|Candidate Fetch Verify 成功.*promotion|candidate/reference-only.*supported" docs/dev/parser-fixture-corpus.md docs/user/parser-output-support.md`
- [x] `python3 -m unittest discover`

本 feature 无前端改动，无需浏览器验证。

## 4. 术语一致性

- Parser Public Fixture Guides / Intake Gate / Promotion/Rejection Messaging / Contribution Checklist / Support Boundary Wording 在 design、docs 和 architecture 中保持一致。
- `allowed/promoted`、`needs-permission/blocked`、`reference-only/not-applicable` 只作为 public fixture decision/promotion 状态，不被描述为用户向 runtime API。
- 防冲突：新增术语只出现在 docs 和 CodeStable 文档，没有进入 runtime parser API。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：已归并 Parser Corpus Developer Guide 的 public fixture intake gate，以及 Parser Output Support Guide 的 candidate/reference-only/blocked 支持边界。
- [x] `codestable/architecture/core-platform.md`：已同步开发者指南和用户指南当前职责描述，包含 promotion-adapter-driven import preview regression 和 no-version-certification 口径。
- [x] `AGENTS.md` 不需要更新：现有规则已覆盖普通测试 no-network、parser/runtime/UI 解耦和第三方 public output 不自动 vendor。

## 6. requirement 回写

本 feature 是 docs/support-boundary 收口，不新增用户可见导入行为、端侧命令、项目持久化能力、runtime parser 支持或 UI。方案 frontmatter `requirement: null`，无需新增 requirement。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-items.yaml` 已将 `parser-public-fixture-guides` 从 `in-progress` 改为 `done`。
- [x] `codestable/roadmap/rxnflow-parser-public-fixture-intake/rxnflow-parser-public-fixture-intake-roadmap.md` 第 5 节子 feature 清单已同步为 `done`，并写入指南收口结论。

## 8. AGENTS.md / CLAUDE.md 候选盘点

无候选。本 feature 没有新增每个 feature 都会复用的环境命令、远程规则或工具约定；现有 `AGENTS.md` 已覆盖相关边界。

## 9. 遗留

- `rxnflow-parser-public-fixture-intake` roadmap 的 8 个子 feature 已全部完成；后续真实 third-party/user-redacted Gaussian/ORCA/MAPLE/extxyz outputs 仍必须另起 feature 走 source policy、license/redaction 和 decision ledger。
- MAPLE/cclib-data public originals 仍未 vendor；当前只通过 synthetic/synthetic-derived fallback 和 reference-only anchors 表达支持边界。
- 本 feature 只更新指南和架构口径，不新增 runtime parser API、测试 fixture、Web UI 或 import behavior。
