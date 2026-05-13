# project-content-validation-migration 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-14
> 关联方案 doc：codestable/features/2026-05-08-project-content-validation-migration/project-content-validation-migration-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**

- [x] 验证项目内容：`ProjectContentStore().validate_project(project_path)` 已落地，返回 `Result[ProjectContentValidationReport]`；证据：`tests/test_project_content_validation_migration.py::test_validate_project_reports_normal_project_as_ok`。
- [x] checksum mismatch 进入报告：修改 section bytes 后 `report.ok=false`，issues 含 `checksum_mismatch` error；证据：`test_validate_project_reports_index_and_section_integrity_issues`。
- [x] migration no-op：`ProjectContentStore().migration_plan(project_path, "project-content-v1")` 返回 `needed=False`、`steps=()`；证据：`test_migration_plan_reports_noop_and_unsupported_versions`。

**名词层“现状 → 变化”逐项核对**

- [x] `ProjectContentValidationIssue` 已落地，字段为 severity/code/message/target/details，details 强制 JSON-safe。
- [x] `ProjectContentValidationReport` 已落地，字段为 project_id/schema_version/issues/checked_at/summary，`ok` 由 error issue 派生。
- [x] `ProjectContentMigrationPlan` 已落地，字段为 current_schema_version/target_schema_version/needed/steps/issues。
- [x] `ProjectContentValidator` 独立存在，承担 index、section checksum、codec、manifest source refs 和 artifact deep check 编排。
- [x] `ProjectContentStore` 暴露 `validate_project` / `migration_plan`。设计中的 `validate_snapshot` 是可选入口，本次未引入；文件 checksum 和 artifact bytes 校验仍只在 `validate_project` 中做。

**流程图核对**

- [x] `validate_project`：read index bytes → parse JSON → validate index file list → read sections/check checksum → decode sections with codecs → load manifest resources → cross-ref validation → read export artifacts/check checksum → return report。
- [x] `migration_plan`：read index schema → target/current 判断 → no-op plan 或 unsupported issue；不写文件。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] 对 project directory 生成 Validation Report：`validate_project` 返回 report。
- [x] 校验 index schema/project_id/files/kind/path/duplicate：覆盖 `index_schema`、`index_files`、`index_file_entry`、`invalid_section_kind`、`invalid_section_path`、`duplicate_section_kind/path`。
- [x] 校验安全 POSIX path 和 canonical path：unsafe path 与 canonical mismatch 均进入 issues。
- [x] 读取 section bytes 并复算 checksum：section 缺失和 checksum mismatch 测试覆盖。
- [x] 复用现有 section codecs：ChemicalObject、ImportLedger、ReactionGraph、EnergyProfile、ExportArtifact、Workspace 依次经 codec 解码。
- [x] 跨 section 引用汇总：graph/profile/workspace/import ref 错误均进入 report issues。
- [x] ExportArtifactRecord.path 的 artifact 文件存在性/checksum 深校验：missing artifact 和 checksum mismatch 测试覆盖。
- [x] 显式 migration entry：v1->v1 no-op；未知 source/target 返回 unsupported issue。
- [x] 不修改 manifest、state、raw files、export files；不调用 parser/import/register/graph patch/energy/export。

**明确不做逐项核对**

- [x] 不做真实 `project-content-v2` migration：只有 no-op/unsupported plan。
- [x] 不自动修复 checksum/path/project_id/ref 错误：所有内容问题进入 report issues。
- [x] 不写回 project-content index、section JSON、manifest、raw files 或 export artifacts：文件 bytes 前后对比测试覆盖。
- [x] 不删除 orphan files：实现无 delete 调用，validation 只读。
- [x] 不重新 parse/register/compute/export：`rxnflow/content_store.py` 与本测试文件 grep 无 ParserRegistry、ImportRegistryWorkflow、ChemicalRegistry.register、ReactionGraphService.apply_patch、EnergyProfileEngine.compute_profile、ReportExportService。
- [x] 不做计算化学语义校验：实现只检查文件/结构/引用/校验和。
- [x] 不新增 CLI/UI/Web/desktop/browser/cloud/bundle：本次 diff 未触及平台壳层或前端。

**关键决策落地**

- [x] 独立 `ProjectContentValidator`，codec 仍只负责 section serialize/deserialize。
- [x] Validation Report 与 Result error 分层：内容问题进 issues；internal I/O 仍返回 Result error。
- [x] section checksum 在 validation 中复算，不改变 load path。
- [x] export artifact bytes checksum 在 validation 中复算，不生成/复制/删除 artifact。
- [x] source_file_id 缺失锚点为 warning。
- [x] 现有 codec 的 hard validation 继续作为 error issue。
- [x] migration entry 只定义 no-op/unsupported 协议。

**挂载点反向核对**

- [x] Validation report contract：`ProjectContentValidationIssue` / `ProjectContentValidationReport`。
- [x] ProjectContentValidator：`rxnflow.content_store.ProjectContentValidator`。
- [x] ProjectContentStore validation API：`validate_project` / `migration_plan`。
- [x] Migration plan contract：`ProjectContentMigrationPlan`。
- [x] Export artifact deep checksum validation：`ProjectContentValidator._validate_export_artifacts`。
- [x] grep 反向核查：新增 runtime 引用集中在 `rxnflow/content_store.py` 与 `tests/test_project_content_validation_migration.py`，无清单外挂载点。
- [x] 拔除沙盘推演：移除上述 dataclass、validator、ProjectContentStore API、测试和架构/req/roadmap更新后，此 feature 对系统可见能力消失；无平台命令或 UI 残留。

## 3. 验收场景核对

- [x] S1 report/issue/plan JSON-safe 和 `report.ok` 派生：`test_validation_report_and_migration_plan_contracts_are_json_safe`。
- [x] S2 正常 fixture/content snapshot：`test_validate_project_reports_normal_project_as_ok`，允许 fixture source_file warning。
- [x] S3 index schema / unknown migration：`test_migration_plan_reports_noop_and_unsupported_versions`。
- [x] S4 files shape、entry shape、kind、unsafe path、重复 kind/path：`test_validate_project_reports_index_shape_and_unknown_section_behavior`、`test_validate_project_reports_bad_index_shape_and_canonical_path`。
- [x] S5 canonical section path mismatch：`test_validate_project_reports_bad_index_shape_and_canonical_path`。
- [x] S6 missing section：`test_validate_project_reports_index_and_section_integrity_issues`。
- [x] S7 section checksum mismatch：`test_validate_project_reports_index_and_section_integrity_issues`。
- [x] S8 bad section JSON：`test_validate_project_reports_bad_section_json_and_codec_errors`。
- [x] S9 section schema/project mismatch：`test_validate_project_reports_bad_section_json_and_codec_errors` 覆盖 bad schema，codec 错误进入 report。
- [x] S10 ReactionGraph object refs：`test_validate_project_reports_cross_section_reference_errors`。
- [x] S11 Workspace refs/viewport：`test_validate_project_reports_cross_section_reference_errors`。
- [x] S12 ImportLedger registered_object_ids：`test_validate_project_reports_cross_section_reference_errors`。
- [x] S13 EnergyProfile graph/path refs：`test_validate_project_reports_cross_section_reference_errors`。
- [x] S14 ExportArtifact path/checksum shape：`test_validate_project_deep_checks_export_artifacts`。
- [x] S15 artifact missing：`test_validate_project_deep_checks_export_artifacts`。
- [x] S16 artifact checksum mismatch：`test_validate_project_deep_checks_export_artifacts`。
- [x] S17 ChemicalObject.source_file_id 缺锚点 warning：`test_validate_project_reports_normal_project_as_ok`。
- [x] S18 v1->v1 migration no-op：`test_migration_plan_reports_noop_and_unsupported_versions`。
- [x] S19 unsupported target/source：`test_migration_plan_reports_noop_and_unsupported_versions`。
- [x] S20 validation/migration 不修改项目文件：`test_validate_project_and_migration_plan_do_not_modify_project_files`。
- [x] S21 不调用 forbidden services：targeted grep 对 `rxnflow/content_store.py` 和本 feature 测试无命中。
- [x] S22 回归：`python3 -m unittest discover` 通过 154 tests。
- [x] 前端验证：本 feature 无前端、画布、报告预览或浏览器改动，跳过浏览器验证。

## 4. 术语一致性

- [x] Project Content Validation：代码中以 `ProjectContentValidator` 和 `validate_project` 表达。
- [x] Validation Report / Validation Issue：代码中使用 `ProjectContentValidationReport` / `ProjectContentValidationIssue`。
- [x] Validation Severity：只允许 `"error"` / `"warning"`。
- [x] Deep Check：section checksum 和 export artifact checksum 均通过读取 bytes 复算。
- [x] Migration Plan / Migration Entry：代码中使用 `ProjectContentMigrationPlan` 和 `ProjectContentStore.migration_plan`。
- [x] 防冲突：未引入与既有 ProjectContentIndex/File/Snapshot/Store 冲突的命名；未新增 `validate_snapshot`，避免与 roadmap 旧契约误解。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：补 Project Content Validation、Validation Report、Validation Issue、Migration Plan 术语；补 Project Content Store validation/migration API 和 no-silent-migration 约束。
- [x] `codestable/architecture/core-platform.md`：补 Project Content Store 当前能力、模块树、`rxnflow.content_store` 模块说明、validation/migration 数据结构、validate/migration workflow、错误语义和边界。
- [x] `AGENTS.md`：本 feature 不新增通用命令、环境约束或工作流规则，不更新。

## 6. requirement 回写

- [x] `codestable/requirements/project-content-persistence.md` 已更新：补项目内容验证报告用户故事、解决方式、export artifact checksum 深校验边界、no auto-fix 和 no-op migration plan 限制，并记录 2026-05-14 变更日志。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml`：`project-content-validation-migration` 已从 `in-progress` 改为 `done`。
- [x] `codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-roadmap.md`：第 4.7 节 checksum 深校验描述已同步；第 5 节子 feature 清单已同步为 `done`，feature 指向 `2026-05-08-project-content-validation-migration`。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的环境、命令或跨 feature 工作流规则。

## 9. 遗留

- 后续优化点：无需要立即开 issue 的实现偏差。
- 已知限制：
  - 未实现真实 `project-content-v2` migration。
  - 未提供 CLI/UI/Web/desktop 入口展示 validation report。
  - 未实现 `validate_snapshot` 内存入口；当前以 project directory 的 `validate_project` 为唯一深校验入口。
- 实现阶段顺手发现：无。

## 10. 验证记录

- `python3 -m unittest tests.test_project_content_validation_migration`：passed，11 tests
- `python3 -m unittest discover`：passed，154 tests
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-08-project-content-validation-migration/project-content-validation-migration-checklist.yaml --yaml-only`：passed
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-08-project-content-validation-migration/project-content-validation-migration-design.md`：passed
- `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml --yaml-only`：passed
- `git diff --check`：passed

## 11. 用户终审

- 2026-05-14：用户确认通过。
