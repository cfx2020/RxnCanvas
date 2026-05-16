# Parser Corpus Docs 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-16
> 关联方案 doc：codestable/features/2026-05-16-parser-corpus-docs/parser-corpus-docs-design.md

## 1. 接口契约核对

对照方案第 2.1 节，本 feature 没有新增 runtime 类型、测试 helper API 或 parser schema，只新增 `docs/dev/parser-fixture-corpus.md` 作为 Parser Corpus Developer Guide。文档 frontmatter 已按方案落地：`doc_type: dev-guide`、`slug: parser-fixture-corpus`、`component: parser-fixture-corpus`、`status: current`、`last_reviewed: 2026-05-16`。

名词层核对通过：

- Parser Corpus Developer Guide：已落到 `docs/dev/parser-fixture-corpus.md`。
- Fixture Addition Workflow：文档“新增 Fixture 流程”给出 6 步，从范围确认、输入准备、manifest 到 snapshot、support matrix 和 regression。
- Source Policy：文档“来源策略与脱敏”覆盖 `synthetic`、`user-redacted`、`external-reference`、`vendored-third-party`。
- Redaction Checklist：文档列出绝对路径、用户名、主机名、scratch 路径、license key、课题敏感信息等检查项。
- Snapshot Update Procedure：文档说明普通测试不重写 snapshot，显式 `update=True` 后必须 review diff。
- Parser Gap Triage：文档按 parser bug、unsupported format/task、fixture issue、docs/support matrix gap 分流。

流程图核对通过：方案中的 developer / agent → guide → source policy/redaction → manifest/snapshot → support matrix/diagnostics → fixture/import preview regression → gap triage，均在 `docs/dev/parser-fixture-corpus.md` 对应章节落地。

## 2. 行为与决策核对

需求摘要已落地：parser fixture corpus、support matrix、diagnostic catalog 和 import preview regression 的维护方式已集中到单份 dev guide，后续 agent 添加样例时不需要从历史 design/acceptance 中拼流程。

关键决策核对：

- 落点使用 `docs/dev`：已新增 `docs/dev/parser-fixture-corpus.md`。
- 只写任务型指南：文档按新增 fixture、来源脱敏、snapshot、support matrix、regression、gap triage 和命令组织，没有写用户手册。
- 以现有 schema 为权威：文档解释 `manifest.yaml`、`support-matrix.yaml`、`parser-golden-v1`，未新增字段或 code。
- 安全和许可证边界：已写 source metadata、redistributable、license、redaction 和 MAPLE examples vendoring 注意事项。
- parser gap 分流：已明确 parser bug / unsupported / fixture issue / docs gap。
- 不新增运行时代码或测试 fixture：本 feature 只新增文档、验收报告，并回写 CodeStable/architecture/roadmap。

挂载点核对通过：方案第 2.3 节的挂载点是 `docs/dev/parser-fixture-corpus.md` 和本 feature CodeStable/roadmap/architecture 回写。grep 本 feature slug 和 guide 路径，引用只出现在 design/checklist/acceptance、roadmap、architecture 和 docs/dev 指南中。删除这些挂载点后，本功能从系统视角消失，不影响 parser runtime、fixture harness 或 import workflow。

## 3. 验收场景核对

- S1 frontmatter：`docs/dev/parser-fixture-corpus.md` 存在，包含 `doc_type: dev-guide` 和 `status: current`。
- S2 corpus 用途和边界：文档明确当前 corpus 只代表 synthetic / reference-only 场景，不代表真实程序版本完整支持。
- S3 目录结构职责：文档列出 `manifest.yaml`、`support-matrix.yaml`、`files/`、`snapshots/` 和各自职责。
- S4 新增 fixture workflow：文档“新增 Fixture 流程”包含 6 步维护流程。
- S5 source policy：文档表格覆盖四类来源。
- S6 redaction checklist：文档覆盖绝对路径、用户名、主机名、scratch 路径、license key 和课题敏感信息。
- S7 snapshot 更新：文档说明普通测试不重写、显式 update 后 review diff。
- S8 support matrix / diagnostic code：文档说明 `partial` 必须写 `known_limits`，observed code 必须引用 catalog。
- S9 import preview regression：文档说明新增或修改 parser fixture 后必须运行。
- S10 parser gap triage：文档覆盖 parser bug、unsupported format/task、fixture issue、docs/support matrix gap。
- S11 常用命令：文档列出 fixture harness test、import preview parser regression、全量 unittest 和 YAML 校验。
- S12-S15 范围守护：未新增/修改 fixture file、manifest entry、snapshot、support matrix entry、diagnostic code、runtime parser module、fixture harness、Import Workflow、Platform Shell、Project Content schema、用户指南、UI、CLI command、Web route、import hint API，也没有提交真实第三方输出或用户日志。

## 4. 术语一致性

术语与方案第 0 节一致：Parser Corpus Developer Guide、Fixture Addition Workflow、Source Policy、Redaction Checklist、Snapshot Update Procedure 和 Parser Gap Triage 均在文档中按同名或直接语义落地。

防冲突核对通过：没有新增 runtime class/function 概念；文档新增术语只用于开发者指南和 architecture 现状说明。

## 5. 架构归并

- `codestable/architecture/core-platform.md`：已把 `parser-corpus-docs` 加入 tags；Parser Plugins 当前能力补充 `docs/dev/parser-fixture-corpus.md`；模块职责中把 dev guide 纳入 ParserFixtureHarness 测试边界；模块列表新增文档职责说明；边界段明确它只记录开发者/agent 流程，不新增 runtime API、fixture 或用户可见导入能力。
- `codestable/architecture/ARCHITECTURE.md`：已新增 Parser Corpus Developer Guide 术语；Core Platform 模块索引补充 parser corpus developer guide；关键架构决定补充该 guide 的边界和真实第三方输出进入 corpus 前的 source policy / redistributable / license / redaction 约束。

## 6. Requirement 回写

本 feature 是开发者/agent 维护文档，不新增用户可见导入行为、端侧命令、项目持久化能力或对外格式支持承诺，因此不新增 requirement。parser/import format support requirement 应在支持矩阵对外暴露到用户导入体验或文档时再 backfill。

## 7. Roadmap 回写

已将 `codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-items.yaml` 中 `parser-corpus-docs` 从 `in-progress` 改为 `done`。

已同步 `codestable/roadmap/rxnflow-parser-fixture-corpus/rxnflow-parser-fixture-corpus-roadmap.md` 第 5 节子 feature 清单和第 6 节排期状态，并更新第 7 节 requirement 观察项，明确本 roadmap 完成的是开发/测试侧 corpus，不新增用户可见格式支持承诺。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的内容。真实输出脱敏、source policy 和 snapshot update 规则已经落入 `docs/dev/parser-fixture-corpus.md`，不需要提升为项目级硬约束入口。

## 9. 遗留

- 真实 Gaussian/ORCA/MAPLE fixture coverage 与真实版本支持边界仍待补；当前 corpus 仍是 synthetic / reference-only。
- MAPLE `.sum`、AutoNEB tree JSON、MD thermo 和 path topology 语义仍未解析。
- parser/import format support requirement 尚未创建；等格式支持边界对用户可见后再补更合适。
