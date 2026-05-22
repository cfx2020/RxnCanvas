---
doc_type: feature-acceptance
feature: 2026-05-22-real-output-import-preview-regression
status: accepted
summary: 验收 parser fixture corpus 驱动的 workflow 与 shell import preview projection 回归
tags: [parser, import-preview, platform-shell, fixture-corpus, regression]
---

# real-output-import-preview-regression 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：codestable/features/2026-05-22-real-output-import-preview-regression/real-output-import-preview-regression-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] Workflow Preview Projection 继续遍历所有 supported/partial executable fixtures。
- [x] Shell Preview Projection 现在也遍历所有 supported/partial executable fixtures。
- [x] Shell payload 固定 `parser_id`、`parser_version`、`object_count`、warning codes、`raw_resource_id`、raw resource path/checksum。
- [x] Expected-error fixture 在 workflow 和 shell projection 中都保留 raw resource、`parse_failed` error code 和 `preview=null`。

流程图核对：manifest executable fixtures 同时进入 `ImportRegistryWorkflow.import_files` 和 Platform Shell `import.preview`；expected-error fixture 单独覆盖 failure projection；preview-only guard 已落地。

## 2. 行为与决策核对

- [x] 同源 corpus：workflow 和 shell 都以 `manifest.executable_fixtures()` 为 success regression 输入。
- [x] 投影保真而非深对象复制：shell JSON 只暴露 preview summary fields，没有暴露完整 `ParseResult`。
- [x] raw resource 必查：shell regression 核对 raw resource kind/path/checksum，并检查 project raw file 已落盘。
- [x] preview-only guard：`_PreviewOnlyRegistry` 和 no-op services 证明 preview 不调用 register、graph、energy、export 或 bundle。

明确不做核对：

- [x] 未修改 parser runtime 或 fixture snapshot 语义。
- [x] 未调用 `import.register_all`，未登记 ChemicalObject。
- [x] 未修改 Project Store、ReactionGraph、EnergyProfile、Report Export、Web UI 或 local HTTP bridge。
- [x] 未新增真实第三方 fixture 或改变 source policy。
- [x] 未把 expected-error fixture 当成 successful parse preview。

## 3. 验收场景核对

- [x] S1：Workflow preview regression 继续遍历所有 supported/partial executable fixtures。证据：`test_workflow_preview_preserves_parser_fixture_snapshot_fields`。
- [x] S2：Platform Shell `import.preview` 对所有 supported/partial executable fixtures 返回 `needs_confirmation`。证据：`test_platform_shell_import_preview_projects_executable_fixture_snapshots`。
- [x] S3：Shell preview parser metadata / object_count 与 fixture snapshot 一致。证据：同上。
- [x] S4：Shell item/preview warning codes 与 snapshot 一致，覆盖 multi-warning extxyz fixture。证据：同上。
- [x] S5：Shell raw_resource 包含 kind/path/checksum，且 raw file 已落盘。证据：同上。
- [x] S6：Shell preview `raw_resource_id` 与 item raw_resource id 一致。证据：同上。
- [x] S7：Expected-error fixture shell projection 为 failed、preview null、error code parse_failed，并保留 raw resource。证据：`test_platform_shell_import_preview_projects_expected_failure`。
- [x] S8：Preview-only guard 证明不登记对象、不调用 graph/energy/export/bundle。证据：`_PreviewOnlyRegistry` / `_NoGraphService` / `_NoEnergyEngine` / `_NoExportService` / `_NoBundleService`。
- [x] S9：docs/architecture 明确 import preview regression 是测试边界，不确认导入、不登记对象、不新增 runtime API。证据：`ARCHITECTURE.md`、`core-platform.md`。

## 4. 术语一致性

- Fixture-backed Import Preview Regression / Workflow Preview Projection / Shell Preview Projection / Preview-only Guard：设计、测试、架构文档和 roadmap 口径一致。
- 防冲突：未新增 runtime API 名词，未改变 `ParsePreview` 或 shell command contract。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：Import Preview Parser Regression 已同步 shell projection、raw resource 和 preview-only guard 描述。
- [x] `codestable/architecture/core-platform.md`：模块职责与边界已同步。

## 6. requirement 回写

- [x] 本 feature 是测试侧 regression 补强，方案 frontmatter `requirement: null`。无需新增用户-facing requirement。

## 7. roadmap 回写

- [x] `rxnflow-parser-real-output-compatibility-items.yaml` 已把 `real-output-import-preview-regression` 改为 `done`。
- [x] `rxnflow-parser-real-output-compatibility-roadmap.md` 子 feature 清单已同步为 done。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新环境或工作流规则。

## 9. 遗留

- import preview regression 仍是测试边界，不代表真实用户导入确认流程已完成端到端 UI 验证。
- Browser storage import preview source 仍由 Python bridge 返回 `storage_object_missing`，未在本 feature 改动。
