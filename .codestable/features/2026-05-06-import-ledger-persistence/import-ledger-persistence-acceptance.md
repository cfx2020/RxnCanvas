---
doc_type: feature-acceptance
feature: 2026-05-06-import-ledger-persistence
status: accepted
summary: 验收 ImportBatch、ImportItem 和 ParsePreview 的 import-ledger-v1 持久化
tags: [persistence, import-ledger, parse-preview, import-workflow, acceptance]
---

# import-ledger-persistence 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-06
> 关联方案 doc：.codestable/features/2026-05-06-import-ledger-persistence/import-ledger-persistence-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查。

**接口示例逐项核对**：

- [x] ImportRegistryWorkflow.list_batches 到 ProjectContentSnapshot：`list_batches(project_id)` 返回的 ImportBatch tuple 可放入 `ProjectContentSnapshot.import_batches`，并由 ProjectContentStore 保存。证据：`rxnflow/import_workflow.py:170`、`rxnflow/content_store.py:109`、`tests/test_import_ledger_persistence.py:39`。
- [x] ProjectContentStore 恢复 import batches：`load_snapshot` 返回 `ProjectContentSnapshot.import_batches`，其中 ImportBatch / ImportItem / ParsePreview 均恢复为 dataclass。证据：`rxnflow/content_store.py:515`、`rxnflow/import_ledger_codec.py:79`、`tests/test_import_ledger_persistence.py:39`。
- [x] 恢复后继续确认导入：`ImportRegistryWorkflow.restore_batches` 可把 loaded batch 灌回新 workflow，并继续 `confirm_import`。证据：`rxnflow/import_workflow.py:176`、`tests/test_import_ledger_persistence.py:39`。
- [x] failed item 往返：failed ImportItem 的 error 和 warnings 可保存/加载，preview 可为空。证据：`tests/test_import_ledger_persistence.py:92`。

**名词层“现状 → 变化”逐项核对**：

- [x] `ProjectContentSnapshot.import_batches` 已收紧为 `tuple[ImportBatch, ...]`。证据：`rxnflow/content_store.py:109`。
- [x] `SECTION_PATHS` 已增加 `import_ledger -> .rxnflow/state/import-ledger.json`。证据：`rxnflow/content_store.py:50`、`rxnflow/content_store.py:57`。
- [x] Import Ledger section codec 已提供 `import-ledger-v1` 的 serialize/deserialize/validate 边界。证据：`rxnflow/import_ledger_codec.py:20`、`rxnflow/import_ledger_codec.py:79`。
- [x] ProjectContentStore 保存/加载 import ledger section，保存 import_batches 不再被 `project-content-v1` 拒绝。证据：`rxnflow/content_store.py:421`、`rxnflow/content_store.py:442`、`rxnflow/content_store.py:515`。
- [x] `ImportRegistryWorkflow.restore_batches(project_id, batches, object_ids=None, replace=False)` 已公开。证据：`rxnflow/import_workflow.py:176`。

**流程图核对**：

- [x] save flow：ImportBatch tuple → import ledger codec → ProjectContentStore 写 `import-ledger.json` → index 包含 `import_ledger`。证据：`rxnflow/content_store.py:442`、`tests/test_import_ledger_persistence.py:39`。
- [x] load flow：先加载 ChemicalObject ids，再校验 import ledger registered ids 和 preview fields。证据：`rxnflow/content_store.py:510`、`rxnflow/content_store.py:515`。
- [x] restore flow：loaded ImportBatch → `restore_batches` → `confirm_import` 使用 restored ParsePreview.parse_result。证据：`rxnflow/import_workflow.py:176`、`tests/test_import_ledger_persistence.py:39`。

结论：接口契约与 design 一致。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] ImportBatch 可保存为 `import-ledger-v1` section。证据：`tests/test_import_ledger_persistence.py:39`。
- [x] ImportItem 的 id、source display、status、raw resource id、preview、registered ids、warnings 和 error 均可保存。证据：`rxnflow/import_ledger_codec.py:151`、`tests/test_import_ledger_persistence.py:39`。
- [x] ParsePreview 保存 raw_resource_id、parser metadata、object_count、warnings、object_drafts 和 provenance。证据：`rxnflow/import_ledger_codec.py:312`、`tests/test_import_ledger_persistence.py:39`。
- [x] ProjectContentStore.load_snapshot 可恢复 import_batches，ImportRegistryWorkflow.restore_batches 可恢复运行态。证据：`tests/test_import_ledger_persistence.py:39`。
- [x] 坏 schema、project id mismatch、重复 id、非法 status、preview 不一致、registered id 缺失、warnings/error shape 均返回 structured error。证据：`tests/test_import_ledger_persistence.py:161`、`tests/test_import_ledger_persistence.py:224`。
- [x] ProjectContentStore 不改 manifest、不新增 ProjectResource、不读取或解析 raw file、不调用 parser/registry/graph/energy/export。证据：`tests/test_import_ledger_persistence.py:260` 和全量测试。

**明确不做逐项核对**：

- [x] 不重新 parse raw files，不根据 parser version 自动刷新 preview。
- [x] 不保存用户源文件绝对路径作为恢复依据；section 只保存 `source_path_display`。
- [x] 不把 raw file bytes、path/checksum 权威副本塞进 import ledger。
- [x] 不新增 stale preview migration、reparse command、CLI/Web/desktop command 或 UI。
- [x] restore 不调用 ChemicalRegistry.register。
- [x] 不持久化 graph/workspace/profile/export 的新 schema。
- [x] 不新增 browser storage、cloud adapter、project bundle、migration、增量保存、并发锁或冲突合并。

**关键决策落地**：

- [x] Import ledger 保存状态，不执行导入。证据：`rxnflow/import_ledger_codec.py:1`、`tests/test_import_ledger_persistence.py:260`。
- [x] ParsePreview 保存 object_drafts 和 provenance，恢复后可继续 confirm。证据：`rxnflow/import_ledger_codec.py:312`、`tests/test_import_ledger_persistence.py:39`。
- [x] `source_path` 持久化为 `source_path_display`，且测试确认不是绝对路径。证据：`rxnflow/import_ledger_codec.py:201`、`tests/test_import_ledger_persistence.py:54`。
- [x] raw_resource_id 是恢复锚点；加载时用最小 `ProjectResource(id, kind="raw_file")` 表达引用，不复制 manifest path/checksum。证据：`rxnflow/import_ledger_codec.py:285`。
- [x] ImportRegistryWorkflow 暴露 restore_batches，直接恢复 `_batches`。证据：`rxnflow/import_workflow.py:176`。
- [x] registered ids 只校验存在性，不登记对象。证据：`rxnflow/import_ledger_codec.py:767`、`rxnflow/import_workflow.py:371`。

**跨层纪律核对**：

- [x] 错误语义：import ledger codec 和 restore API 均返回 Result error / RxnFlowError，不做 silent fallback。
- [x] 幂等性：重复 save checksum/path 稳定；重复 restore 同一 batch 不追加重复状态。
- [x] 顺序性：batches/items/object_drafts/warnings 按输入顺序保存和加载。
- [x] 来源边界：source display 不参与恢复，raw_resource_id 才是项目内 raw file 引用。
- [x] Parser 边界：load/restore 不调用 ParserRegistry，不因 parser version 变化自动 reparse。
- [x] Registry 边界：restore_batches 不调用 ChemicalRegistry.register；confirm_import 保持原有登记语义。

**挂载点反向核对（可卸载性）**：

- [x] 挂载点 M1：Import Ledger section codec。证据：`rxnflow/import_ledger_codec.py:20`、`rxnflow/import_ledger_codec.py:79`。
- [x] 挂载点 M2：ProjectContentStore import_ledger section。证据：`rxnflow/content_store.py:50`、`rxnflow/content_store.py:57`、`rxnflow/content_store.py:442`。
- [x] 挂载点 M3：ProjectContentSnapshot.import_batches。证据：`rxnflow/content_store.py:109`。
- [x] 挂载点 M4：ImportRegistryWorkflow.restore_batches。证据：`rxnflow/import_workflow.py:176`。
- [x] 挂载点 M5：ParsePreview draft/provenance codec。证据：`rxnflow/import_ledger_codec.py:312`。
- [x] 反向 grep：本 feature 的引用集中在 `import_ledger_codec.py`、`content_store.py`、`import_workflow.py` 和新增测试，均落在挂载点清单内。
- [x] 拔除沙盘推演：删除 import ledger codec、回退 ProjectContentStore section 接入、移除 restore_batches、回退 import_batches 类型约束和新增测试即可卸载；parser/graph/energy/export 无业务依赖残留。

结论：行为与决策与 design 一致。

## 3. 验收场景核对

- [x] S1 needs_confirmation item 保存到 `import-ledger.json`，保留 batch/item/status/raw_resource_id/source_path_display/warnings/preview。证据：`tests/test_import_ledger_persistence.py:39`。
- [x] S2 load_snapshot 后恢复 ImportBatch / ImportItem / ParsePreview。证据：`tests/test_import_ledger_persistence.py:39`。
- [x] S3 ParsePreview.parse_result 保留 ChemicalObjectDraft tuple 和 Provenance，object_count 与 draft 数量一致。证据：`tests/test_import_ledger_persistence.py:39`。
- [x] S4 restore_batches 后 list/get batch 可读取 pending batch。证据：`tests/test_import_ledger_persistence.py:39`。
- [x] S5 restore 后 confirm_import 可登记 ChemicalObject 并写回 registered_object_ids。证据：`tests/test_import_ledger_persistence.py:39`。
- [x] S6 failed ImportItem 保存/加载保留 error 和 warnings，不要求 preview。证据：`tests/test_import_ledger_persistence.py:92`。
- [x] S7 registered ImportItem 保存/加载保留 registered_object_ids，并校验 loaded object ids。证据：`tests/test_import_ledger_persistence.py:117`。
- [x] S8 重复保存 import ledger snapshot 时 section checksum 稳定，index path/kind 不变。证据：`tests/test_import_ledger_persistence.py:39`、`tests/test_project_content_store_v1.py:87`。
- [x] S9 schema_version 错误返回 `invalid_input`。证据：`tests/test_import_ledger_persistence.py:161`、`tests/test_import_ledger_persistence.py:224`。
- [x] S10 section project_id 与 index 不一致返回 `invalid_input`。证据：`tests/test_import_ledger_persistence.py:161`。
- [x] S11 重复 batch/item id 返回 `invalid_input`。证据：`tests/test_import_ledger_persistence.py:161`。
- [x] S12 非法 item status 返回 `invalid_input`。证据：`tests/test_import_ledger_persistence.py:161`。
- [x] S13 preview object_count 与 object_drafts 数量不一致返回 `invalid_input`。证据：`tests/test_import_ledger_persistence.py:161`。
- [x] S14 preview parser metadata 与 provenance 不一致返回 `invalid_input`。证据：`tests/test_import_ledger_persistence.py:161`。
- [x] S15 registered_object_ids 引用缺失 ChemicalObject id 返回 `invalid_input`。证据：`tests/test_import_ledger_persistence.py:161`。
- [x] S16 warning/error shape 错误返回 `invalid_input`。证据：`tests/test_import_ledger_persistence.py:161`。
- [x] S17 save/load 不修改 manifest、不新增 ProjectResource、不读取或解析 inputs/raw。证据：`tests/test_import_ledger_persistence.py:260`。
- [x] S18 不调用 ParserRegistry.parse、ProjectStore.add_raw_file、ChemicalRegistry.register、ReactionGraphService、EnergyProfileEngine 或 ReportExportService。证据：`tests/test_import_ledger_persistence.py:260`。
- [x] S19 现有全量测试继续通过：`python3 -m unittest discover` 通过，133 tests OK。

前端改动：本 feature 无 UI / 浏览器改动，不需要浏览器肉眼验证。

执行过的验证命令：

- `python3 -m unittest tests.test_import_ledger_persistence`：6 tests OK
- `python3 -m unittest tests.test_project_content_store_v1`：4 tests OK
- `python3 -m unittest tests.test_import_registry_workflow`：10 tests OK
- `python3 -m unittest discover`：133 tests OK
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-06-import-ledger-persistence/import-ledger-persistence-checklist.yaml --yaml-only`：passed
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml --yaml-only`：passed
- `git diff --check`：passed

## 4. 术语一致性

- Import Ledger Persistence：代码以 `import_ledger_codec` 和 `import-ledger-v1` 表达，没有另起平行导入仓储名。
- Stored ImportBatch / Stored ImportItem：代码仍用 `ImportBatch` / `ImportItem` dataclass 作为恢复对象，JSON section 是持久化表达。
- Stored ParsePreview：代码保存 `object_drafts` 和 `provenance`，可恢复 `ParseResult`。
- Source Path Display：持久化字段为 `source_path_display`，不作为文件读取依据。
- Raw Resource Reference：持久化字段为 `raw_resource_id`，加载后用最小 raw_file ProjectResource 表示引用。
- Import Workflow Restore：代码接口为 `restore_batches`，不调用 import_files / parser / register。
- import-ledger-v1：代码常量与 section schema 一致。

防冲突核对：

- [x] 未把 import ledger 写入 Project Manifest。
- [x] 未把 raw file path/checksum 复制为 import ledger 权威字段。
- [x] 未把 ImportBatch restore 命名为 reparse 或 import retry。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已补 Project Content 当前覆盖 ImportBatch/ParsePreview、Import Ledger 术语、restore_batches 决策、import-ledger-v1 section 和待补项收缩。
- [x] `.codestable/architecture/core-platform.md`：已补 ImportRegistryWorkflow restore API、`rxnflow.import_ledger_codec`、`import-ledger-v1` 字段协议、错误语义和范围边界。
- [x] AGENTS.md：不更新。理由：本 feature 不新增通用命令、环境依赖或每个后续 feature 都会重复踩的工作流约束。

结论：没读过 design 的后续协作者只看 architecture，即可知道系统已支持 ImportBatch / ParsePreview 的长期 section、restore API 和边界约束。

## 6. requirement 回写

- [x] 方案原 frontmatter `requirement: null`。
- [x] 本 feature 已补入用户可感的项目内容持久化能力档案：`.codestable/requirements/project-content-persistence.md`。
- [x] 方案 frontmatter 已回填 `requirement: project-content-persistence`。

结论：requirement 已 backfill。

## 7. roadmap 回写

- [x] 方案 frontmatter 有 `roadmap: rxnflow-project-persistence` 和 `roadmap_item: import-ledger-persistence`。
- [x] `.codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml` 中该 item 已从 `in-progress` 改为 `done`，feature 保持 `2026-05-06-import-ledger-persistence`。
- [x] `.codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-roadmap.md` 第 4.6 节已补 provenance/objectDrafts 硬约束，第 5 节子 feature 清单已同步为 `状态：done` 和对应 feature。
- [x] roadmap items YAML 已通过校验。

结论：roadmap 已回写。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的内容。

理由：没有新增安装命令、长期环境约束、跨 feature 必踩坑或端侧启动步骤。现有 AGENTS.md 的 unittest 和 YAML 校验命令仍覆盖本次验证。

## 9. 遗留

后续优化点：

- 后续 `energy-profile-persistence` 需要把 EnergyProfile 从基础 snapshot 提升为长期 schema，并校验 graph/path 引用。
- 后续 `export-artifact-index-persistence` 需要登记导出文件项目相对路径、format、checksum 和 metadata。
- 后续 `project-content-validation-migration` 需要把 import ledger 的 raw_resource_id 与 manifest resource path/checksum 做深校验，并处理 stale preview。
- 后续 `platform-shell-state-restore` 需要把 ProjectContentSnapshot 接入真实 project.open/save_content 命令。

已知限制：

- `import-ledger-v1` 不重新 parse raw files，不根据 parser version 自动刷新 preview。
- `source_path_display` 只用于展示，不保证用户源路径仍可访问。
- import ledger 只保存 raw_resource_id，不保存 raw file bytes 或 manifest path/checksum 权威副本。
- 当前没有 CLI/Web/desktop command 接入 ProjectContentStore import ledger save/load。

实现阶段顺手发现：

- 无。实现按独立 codec、ProjectContentStore section、ImportRegistryWorkflow restore API 三个挂载点推进，未发现需要另起 issue 的结构性阻塞。
