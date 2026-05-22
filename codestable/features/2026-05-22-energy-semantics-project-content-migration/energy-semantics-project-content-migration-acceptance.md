---
doc_type: feature-acceptance
feature: 2026-05-22-energy-semantics-project-content-migration
status: accepted
summary: Project Content Validation 已覆盖 reaction graph composition 与 energy profile expression 的语义兼容和 no-op migration 边界
tags: [project-content, validation, migration, composition, expression]
---

# Energy Semantics Project Content Migration 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：codestable/features/2026-05-22-energy-semantics-project-content-migration/energy-semantics-project-content-migration-design.md

## 1. 接口契约核对

- [x] Energy Semantics Project Content Compatibility 已落地：旧 `reaction-graphs-v1` node 缺 `composition`、旧 `energy-profiles-v1` point 缺 `expression` 均可 validation/load。
- [x] Semantic Content Validation 继续通过 `ProjectContentValidationIssue(code="section_decode_error")` 暴露 section codec 错误，没有新增 report 类型。
- [x] Energy Semantics Migration Plan 保持 `project-content-v1 -> project-content-v1` no-op；legacy/new optional fields 不产生 migration steps。
- [x] expression 错误 target 已细化到 `profiles[...].points[...].expression...`，例如 `.total.unit`、`.terms[0].coefficient`、`.corrections[0].kind`。
- [x] 流程图节点均有代码落点：`ProjectContentValidator` 复用 graph/profile codec；`ProjectContentStore.migration_plan` 只读 index schema。

## 2. 行为与决策核对

- [x] validation 复用 section codec：composition 语义仍由 `rxnflow.graph_workspace_codec` 覆盖，expression 语义在 `rxnflow.energy_profile_codec` 补强。
- [x] legacy 缺字段不报 warning/error：旧 no-composition/no-expression 作为合法 v1 兼容数据。
- [x] expression 语义边界已补齐：node id、source、kind、coefficient、unit、missing/total 矛盾都会返回可定位错误。
- [x] migration plan 不写文件：测试对 tracked bytes 做 before/after 比较，`needed=false`、`steps=()`、`issues=()`。
- [x] `project.open` validation error 语义未改：本 feature 没改 Platform Shell restore/open 编排。
- [x] 挂载点反向核对通过：本 feature 生产代码只改 `rxnflow.energy_profile_codec`；graph composition 通过既有 codec 验证，ProjectContentValidator 继续只负责聚合。
- [x] 拔除沙盘推演通过：移除新增 expression validation helper 后，本 feature 的 expression semantic issue 覆盖会消失；移除新增 tests 后不会留下新的外部调用点。

## 3. 验收场景核对

- [x] S1 旧 graph node 缺 composition 合法，load 后 coefficient 1：`test_validate_project_accepts_legacy_energy_semantics_optional_fields`。
- [x] S2 新 composition 与 `chemical_object_ids` 投影一致 validation 通过：fixture snapshot baseline validation 通过，未新增反向错误。
- [x] S3 composition 投影不一致报 `section_decode_error`：`test_validate_project_reports_composition_semantics_errors`。
- [x] S4 composition coefficient 为 0 报 error：`test_validate_project_reports_composition_semantics_errors`。
- [x] S5 composition 引用缺失 ChemicalObject 报 error，不部分恢复 graph：`test_validate_project_reports_composition_semantics_errors`。
- [x] S6 旧 profile point 缺 expression 合法，load 后 expression 为 null：`test_validate_project_accepts_legacy_energy_semantics_optional_fields`。
- [x] S7 合法 expression round-trip 保留 raw/converted/contribution 单位语义：`tests.test_energy_profile_persistence` 既有 profile expression persistence tests 通过。
- [x] S8 expression node/source/kind/unit/coefficient/missing/total 错误可定位：`test_validate_project_reports_expression_semantics_errors`。
- [x] S9 profile graph/path/node 顺序错位仍走既有 graph_invalid/section decode 语义：`tests.test_energy_profile_persistence` 和 validation migration focused tests 通过。
- [x] S10 migration_plan 对 v1 legacy/new energy semantics 返回 no-op：`test_validate_project_and_migration_plan_do_not_modify_project_files`。
- [x] S11 unsupported source/target 仍返回 error issue：既有 migration plan tests 继续通过。
- [x] S12 validate_project 和 migration_plan 不修改 project files：`test_validate_project_and_migration_plan_do_not_modify_project_files`。

本 feature 无前端改动，不需要浏览器验收。

## 4. 术语一致性

- Energy Semantics Project Content Compatibility：只出现在 design/checklist/acceptance 的流程术语中，架构文档用具体 project content validation/migration 边界承载。
- Semantic Content Validation：代码仍使用 `ProjectContentValidationIssue` 和 `section_decode_error`，没有新增 report 类型。
- Energy Semantics Migration Plan：代码仍使用 `ProjectContentMigrationPlan`，没有新增 migration executor。
- 防冲突 grep：未新增 `project-content-v2`、`reaction-graphs-v2`、`energy-profiles-v2` schema 常量。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md` 已归并 Project Content Validation 对 composition/expression 语义的只读校验、v1 no-op migration 和旧缺字段合法边界。
- [x] `codestable/architecture/core-platform.md` 已归并 `energy_profile_codec` expression semantic validation、ProjectContentValidator 聚合行为、migration plan no-op 语义和不修复/不补写边界。
- [x] 未更新 Web architecture：本 feature 不改变 Web runtime、Project Sidebar 或浏览器 repository 行为。

## 6. Requirement 回写

- [x] `codestable/requirements/project-content-persistence.md` 已更新：用户故事覆盖 reaction node composition / energy expression 损坏可发现；解决方案和边界明确旧缺字段合法、新字段损坏报错、v1 不迁移。

## 7. Roadmap 回写

- [x] `codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-items.yaml` 中 `energy-semantics-project-content-migration` 已标记 done。
- [x] roadmap 主文档第 5 节对应条目已同步状态、feature 目录和备注。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- 无候选。本 feature 未暴露新的通用环境、工具或工作流约束。

## 9. 遗留

- Web 节点组成编辑、energy channel selector 和 correction policy controls 仍留给 `web-energy-semantics-controls`。
- 能量曲线 tooltip、missing/correction 标记和选中联动仍留给 `energy-curve-interaction-polish`。

## 10. 验证记录

- `python3 -m unittest tests.test_project_content_validation_migration tests.test_reaction_graph_workspace_persistence tests.test_energy_profile_persistence`：通过，34 tests。
- `python3 -m unittest discover`：通过，298 tests。
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-22-energy-semantics-project-content-migration/energy-semantics-project-content-migration-checklist.yaml --yaml-only`：通过。
- `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-items.yaml --yaml-only`：通过。
