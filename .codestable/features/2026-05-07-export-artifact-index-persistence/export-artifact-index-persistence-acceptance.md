# export-artifact-index-persistence 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-07
> 关联方案 doc：.codestable/features/2026-05-07-export-artifact-index-persistence/export-artifact-index-persistence-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**

- [x] 登记已写入项目 `exports/` 目录的 artifact：`ExportArtifactRecord` 已落在 `rxnflow.export`，`ProjectContentSnapshot(export_artifacts=(record,))` 可由 `ProjectContentStore.save_snapshot` 保存；证据：`tests/test_export_artifact_index_persistence.py::test_content_store_persists_export_artifact_index_with_stable_checksum`。
- [x] 恢复 artifact index：`ProjectContentStore.load_snapshot` 恢复 `ProjectContentSnapshot.export_artifacts` 为 `ExportArtifactRecord` tuple；证据：同上测试读取 `loaded.value.export_artifacts[0]`。
- [x] 拒绝 runtime bytes / 绝对 path：`export_artifact_codec` 拒绝 `/tmp/main-route.png`、非 `exports/` path 和 metadata bytes；证据：`test_section_validation_errors_are_structured`。

**名词层“现状 → 变化”逐项核对**

- [x] `ExportArtifactRecord` 与运行时 `ExportArtifact` 分离：`rxnflow.export.ExportArtifactRecord` 不含 `bytes` 字段。
- [x] `ProjectContentSnapshot.export_artifacts` 收紧为 `tuple[ExportArtifactRecord, ...]`。
- [x] 新增 `export-artifacts-v1` section codec：`rxnflow.export_artifact_codec` 提供 `export_artifacts_section_to_dict/from_dict`。
- [x] ProjectContentStore 增加 `.rxnflow/state/export-artifacts.json`：`EXPORT_ARTIFACTS_PATH` 与 `SECTION_PATHS["export_artifacts"]` 已落地。

**流程图核对**

- [x] save 侧：调用方构造 `ExportArtifactRecord` → `ProjectContentSnapshot.export_artifacts` → codec 校验/序列化 → ProjectContentStore 写 section → ProjectContentIndex 包含 `export_artifacts`。
- [x] load 侧：ProjectContentStore 读取 section → codec 校验 → 恢复 `ProjectContentSnapshot.export_artifacts`。
- [x] `ReportExportService` 只保留 runtime writer 边界；本 feature 未接入自动写 bytes 或平台 restore/list 命令。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] 写入 `.rxnflow/state/export-artifacts.json`：测试读取文件存在且 JSON 含 record。
- [x] 保存字段 id/format/path/checksum/metadata/created_at：codec round-trip 测试覆盖。
- [x] 保存和加载 tuple 化 artifact index：content store 往返测试覆盖。
- [x] format 限制为 `png` / `cdxml` / `xlsx`：unsupported `gif` 返回 `invalid_input`。
- [x] path 只接受 `exports/...` 项目相对 POSIX path：absolute、`..`、反斜杠、空 path、非 `exports/` 均返回 `invalid_input`。
- [x] checksum 和 metadata shape 校验：bad checksum、metadata 非 object、bytes/Path/tuple 均返回 `invalid_input`。
- [x] 坏 schema、project mismatch、records shape、重复 id/path 均返回结构化 `Result` error。
- [x] ProjectContentStore 不修改 manifest、不登记 ProjectResource、不保存 artifact bytes、不调用 writer/parser/import/registry/graph/energy/platform。

**明确不做逐项核对**

- [x] 不生成、复制、移动、删除或校验 artifact bytes：测试确认 `root / record.path` 不会被写出；codec 不读文件。
- [x] 不把 ExportArtifact bytes 写进 JSON：测试断言 serialized artifact 没有 `bytes` 字段。
- [x] 不写 manifest / ProjectResource：测试比较 manifest 前后文本并检查 resources 为空。
- [x] 不新增导出格式或修改 writer：scope guard 检查 content store / codec 不引用 writer；report export baseline 测试仍通过。
- [x] 不新增 UI、CLI/Web/desktop command、browser storage、cloud adapter、bundle、migration 或 cleanup：本次 diff 未触及对应模块。
- [x] 不根据 metadata 深校验 graph/profile/object 引用：codec 只做 JSON-safe shape 校验。

**关键决策落地**

- [x] 新增 `ExportArtifactRecord`，不复用 `ExportArtifact`。
- [x] index 只记录文件索引，不保存 bytes。
- [x] 路径第一版收紧到 `exports/`。
- [x] checksum 必填且只做 shape 校验。
- [x] ReportExportService 不变为项目仓储服务。
- [x] metadata 必须 JSON-safe。

**挂载点反向核对**

- [x] Export Artifact Record contract：`rxnflow.export.ExportArtifactRecord`。
- [x] Export Artifact Index section codec：`rxnflow.export_artifact_codec`。
- [x] ProjectContentStore export_artifacts section：`EXPORT_ARTIFACTS_PATH`、`SECTION_PATHS`、save/load 接线。
- [x] ProjectContentSnapshot.export_artifacts：snapshot 字段为长期 artifact index 入口。
- [x] Artifact logical path/checksum validation：codec 内 `_validate_artifact_path`、`_validate_checksum`、`_validate_json_safe_value`。
- [x] grep 反向核查：本 feature 的新增 runtime 引用集中在上述挂载点与测试；无清单外挂载点。
- [x] 拔除沙盘推演：移除 record dataclass、codec、content_store section 接线和测试后，feature 对系统可见能力消失；无额外平台命令或 writer coupling 残留。

## 3. 验收场景核对

- [x] S1-S5 正常路径：record 构造、section 写入、index kind/path、load 恢复、重复 save checksum 稳定；证据：`test_record_and_section_round_trip_without_bytes`、`test_content_store_persists_export_artifact_index_with_stable_checksum`。
- [x] S6-S14 错误路径：坏 schema、project mismatch、artifacts shape、重复 id/path、unsupported format、bad path、bad checksum、bad metadata；证据：`test_section_validation_errors_are_structured` 和 `test_project_content_store_uses_export_artifact_errors`。
- [x] S15-S17 范围守护：无 bytes 字段、不改 manifest/resource、不读写 artifact bytes、不调用 writer/parser/import/registry/graph/energy/platform；证据：export artifact tests 的断言和 scope guard。
- [x] S18 回归：`python3 -m unittest discover` 通过 143 tests。
- [x] 前端验证：本 feature 无前端、画布、UI 或报告预览改动，跳过浏览器验证。

## 4. 术语一致性

- [x] Export Artifact：仍指 `ReportExportService` runtime artifact。
- [x] Export Artifact Record：代码中使用 `ExportArtifactRecord`，含长期索引字段且不含 bytes。
- [x] Export Artifact Index / `export-artifacts-v1`：codec、测试、架构文档命名一致。
- [x] Artifact Logical Path：实现中收紧为 `exports/...` 项目相对 POSIX path。
- [x] Artifact Checksum：实现中要求 `sha256:<64 hex>`。
- [x] 防冲突：`export_artifacts` 作为 ProjectContentStore section kind；`export_artifact` 仍只作为 manifest ResourceKind 的既有字面值，没有被本 feature 写入 manifest。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：补 Export Artifact、Export Artifact Record、Export Artifact Index 术语，补 `export-artifacts-v1` 当前能力和错误边界，移除 ExportArtifact index 待补项。
- [x] `.codestable/architecture/core-platform.md`：补 Project Content Store 第 10 项能力、模块树、`rxnflow.export_artifact_codec` 模块说明、state 文件布局、record 字段、path/checksum/metadata 纪律和错误语义。
- [x] `AGENTS.md`：本 feature 没有新增通用命令、环境约束或工作流规则，不更新。

## 6. requirement 回写

- [x] `project-content-persistence` 已更新：pitch/tags/用户故事/为什么需要/怎么解决/边界均补入 export artifact index。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml`：`export-artifact-index-persistence` 已从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-roadmap.md`：第 4.7 节把 checksum 改为必填并补 `exports/` 与 checksum shape 约束；第 5 节子 feature 清单已同步为 `done`，feature 指向 `2026-05-07-export-artifact-index-persistence`。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的环境、命令或跨 feature 工作流规则。

## 9. 遗留

- 后续优化点：无需要立即开 issue 的实现偏差。
- 已知限制：
  - 不提供从 runtime `ExportArtifact` 自动写入 `exports/` 并登记 record 的 helper，留给 Platform Restore / save_content。
  - 不读取 artifact file 复算 checksum，留给 `project-content-validation-migration`。
  - 不做 artifact file 存在性校验、orphan cleanup、UI 列表、下载链接、bundle 或浏览器/cloud adapter。
- 实现阶段顺手发现：无。

## 10. 验证记录

- `python3 -m unittest tests.test_export_artifact_index_persistence`：passed
- `python3 -m unittest tests.test_project_content_store_v1`：passed
- `python3 -m unittest tests.test_report_export_baseline`：passed
- `python3 -m unittest tests.test_energy_profile_persistence`：passed
- `python3 -m unittest tests.test_import_ledger_persistence`：passed
- `python3 -m unittest tests.test_reaction_graph_workspace_persistence`：passed
- `python3 -m unittest tests.test_chemical_object_persistence`：passed
- `python3 -m unittest discover`：passed，143 tests
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-07-export-artifact-index-persistence/export-artifact-index-persistence-checklist.yaml --yaml-only`：passed
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml --yaml-only`：passed
- `git diff --check`：passed
