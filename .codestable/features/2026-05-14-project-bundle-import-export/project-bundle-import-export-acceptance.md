---
doc_type: feature-acceptance
feature: 2026-05-14-project-bundle-import-export
status: accepted
accepted_at: 2026-05-14
summary: 验收 .rxnflow.zip 项目包导入/导出，确认 bundle service、Platform Shell、CLI、文档与 roadmap 回写均已落地
tags: [project-bundle, persistence, acceptance, cli]
---

# Project Bundle Import Export 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-14
> 关联方案 doc：`.codestable/features/2026-05-14-project-bundle-import-export/project-bundle-import-export-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `ProjectBundleSummary`
  - 代码落点：`rxnflow/project_bundle.py`
  - 结果：一致。包含 `bundle_path`、`project_path`、`project_id`、`root_name`、`file_count`、`byte_size`、`checksum`、`validation_summary`。
- [x] `ProjectBundleService.export_bundle(project_path, destination_path)`
  - 代码落点：`rxnflow/project_bundle.py`
  - 结果：一致。load manifest、按需 validation、收集允许 roots、临时 zip、replace destination、返回 summary。
- [x] `ProjectBundleService.import_bundle(bundle_path, destination_dir, conflict_policy="fail_if_exists")`
  - 代码落点：`rxnflow/project_bundle.py`
  - 结果：一致。校验 zip entry、唯一 root、manifest、冲突策略、临时解包、按需 validation、无覆盖落地。
- [x] `ShellCommand("project.export_bundle", ...)` / `ShellCommand("project.import_bundle", ...)`
  - 代码落点：`rxnflow/platform.py`
  - 结果：一致。Platform Shell 返回 JSON-safe `data.bundle`。
- [x] CLI `project export-bundle` / `project import-bundle`
  - 代码落点：`rxnflow/cli.py`
  - 结果：一致。命令映射到 shell command，成功 exit code 0，失败非 0。

**名词层变化核对**

- [x] Project Bundle：`.rxnflow.zip` 包已落地，内部只允许一个 Bundle Root。
- [x] Bundle Export：复制 `.rxnflow/`、`inputs/raw/`、`exports/`，跳过 `.DS_Store`。
- [x] Bundle Import：安全解包到新的 Project Directory，不自动 open session。
- [x] Conflict Policy：第一版只接受 `fail_if_exists`。
- [x] Bundle Summary：shell / CLI 返回字段与设计一致。

**流程图核对**

- [x] Bundle Export 流程节点均有代码落点：load manifest、content index 判断、validate_project、build file list、write temp zip、replace、checksum、summary。
- [x] Bundle Import 流程节点均有代码落点：open zip、validate entry paths、one root/manifest、destination conflict、extract temp、load manifest、validate_project、rename、summary。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] 本地项目可导出 `.rxnflow.zip`：`test_export_import_roundtrip_restores_project_content` 覆盖。
- [x] bundle 可导入为新的 Project Directory：同一测试覆盖 `ProjectStore.load_project` 与 `ProjectContentStore.load_snapshot`。
- [x] manifest-only 项目可打包：`test_manifest_only_project_can_export_import_without_content_validation` 覆盖。
- [x] CLI / agent 可观测：Platform Shell 和 CLI JSON 测试均覆盖。

**明确不做逐项核对**

- [x] 不实现 browser storage adapter、cloud adapter、auth、database、Web/desktop framework：scope guard grep 和代码 review 确认无引入。
- [x] 不实现 overwrite、rename、merge、diff、冲突合并：unsupported policy 和 existing destination 测试确认失败。
- [x] 不自动保存当前内存 session：ProjectBundleService 只读取项目目录，不依赖 PlatformSession。
- [x] 不重新 parse、confirm import、compute energy 或 export report：ProjectBundleService 不依赖 parser/import workflow/energy/export service。
- [x] 不新增 Project Content schema 或 migration：只消费既有 `ProjectContentStore.validate_project` / `load_snapshot`。
- [x] 不打包项目根任意附加文件：`notes.txt` 未进入 bundle 的测试覆盖。

**关键决策落地**

- [x] Bundle 是传输格式，不是 live storage：bundle command 不创建 session，import 后需显式 `project.open`。
- [x] 只打包已知项目根：实现只收集 `.rxnflow/`、`inputs/raw/`、`exports/`。
- [x] Manifest 是权威入口：import 要求 `<root>/.rxnflow/manifest.json` 并调用 ProjectStore.load_project。
- [x] content index 存在时必须 valid：export/import validation error 均失败。
- [x] Import 先验路径安全再写磁盘：`_inspect_bundle` 校验 central directory，`_extract_bundle` 只消费已验证 entries。
- [x] Import 不自动覆盖：目标项目存在时返回 `invalid_input`。
- [x] Zip 输出稳定：固定 zip timestamp、排序写入；重复 export bytes/checksum 测试覆盖。

**挂载点反向核对**

- [x] `rxnflow.project_bundle`：新增 ProjectBundleService / ProjectBundleSummary / zip path validation；删除该模块后 bundle 核心能力消失。
- [x] `rxnflow.platform.AppKernel`：装配 ProjectBundleService。
- [x] `rxnflow.platform.PlatformShellService.run`：新增 `project.export_bundle` / `project.import_bundle`。
- [x] `rxnflow.cli`：新增 project export-bundle / import-bundle。
- [x] tests：新增 service/platform/CLI/scope guard 覆盖。
- [x] 反向 grep：`ProjectBundleService`、`project.export_bundle`、`project.import_bundle`、`export-bundle`、`import-bundle` 命中均落在上述挂载点、测试和文档内。
- [x] 拔除沙盘推演：删除 `rxnflow.project_bundle`、Platform Shell 分支和 CLI 子命令后，用户/agent 无法访问 bundle 能力；无清单外代码残留。

## 3. 验收场景核对

- [x] **S1**：包含 manifest/state/raw/export 的项目 export 后生成 `.rxnflow.zip`，内部只有一个 root 且路径安全。
  - 证据：`test_export_import_roundtrip_restores_project_content`
- [x] **S2**：导出的 bundle import 后可读取 manifest；有 content index 时可 load_snapshot。
  - 证据：`test_export_import_roundtrip_restores_project_content`
- [x] **S3**：manifest-only 项目可导出和导入，summary 标记未执行深 validation。
  - 证据：`test_manifest_only_project_can_export_import_without_content_validation`
- [x] **S4**：content validation error 阻止 export 且不写最终 bundle。
  - 证据：`test_export_rejects_invalid_project_content_without_final_bundle`
- [x] **S5**：unsafe zip paths 被拒绝且目标目录无残留。
  - 证据：`test_import_rejects_unsafe_bundle_paths_without_writing_project`
- [x] **S6**：缺 manifest 返回 `invalid_bundle`。
  - 证据：`test_import_rejects_missing_manifest_existing_destination_and_policy`
- [x] **S7**：目标项目已存在时 import 失败，不覆盖、不改名、不 merge。
  - 证据：`test_import_rejects_missing_manifest_existing_destination_and_policy`
- [x] **S8**：unsupported conflict_policy 返回 `invalid_input`。
  - 证据：`test_import_rejects_missing_manifest_existing_destination_and_policy`
- [x] **S9**：Platform Shell responses 可 JSON 序列化，包含 summary/warnings/error。
  - 证据：`test_platform_shell_project_bundle_commands_are_json_safe`
- [x] **S10**：CLI export/import 输出 JSON，成功 exit 0，失败非 0。
  - 证据：`test_cli_project_bundle_commands_emit_json_and_exit_codes`
- [x] **S11**：bundle export/import 不调用 parser、import confirm、energy compute 或 report export。
  - 证据：依赖图 review；ProjectBundleService 只依赖 ProjectStore、ProjectContentStore、zipfile/shutil/pathlib。
- [x] **S12**：既有 Project Content、Platform Shell、CLI、Report Export 测试继续通过。
  - 证据：`python3 -m unittest discover`，167 tests OK。
- [x] **S13**：未新增 browser/cloud/auth/database/Web/desktop/overwrite/merge/CLI save-content。
  - 证据：scope guard、grep 和 CLI source review。

前端改动：无。

## 4. 术语一致性

- Project Bundle：代码文件和 docs 使用 `ProjectBundleService` / `ProjectBundleSummary`，与设计一致。
- Bundle Export / Bundle Import：shell 命令为 `project.export_bundle` / `project.import_bundle`，CLI 为 `export-bundle` / `import-bundle`。
- Conflict Policy：代码和 CLI 使用 `fail_if_exists` / `fail-if-exists` 映射。
- Bundle Summary：代码 `_bundle_summary` 与 design 字段一致。
- 防冲突：无 `overwrite`、`rename`、`merge` 策略落地；无 `project save-content` CLI 命令新增。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`
  - 已补 Project Bundle、Bundle Export、Bundle Import、Bundle Summary 术语；补 AppKernel、PlatformShellService、CLI 和 project bundle 关键架构决定。
- [x] `.codestable/architecture/core-platform.md`
  - 已补第十二类 Project Bundle、模块职责、ProjectBundleService 协议、bundle layout、validation gate、错误语义、约束边界和 CLI/shell 接入。
- [x] `AGENTS.md`
  - 不需要更新。新增内容属于项目架构现状，不是跨 feature 都必须遵守的新协作规则。

## 6. requirement 回写

- [x] `.codestable/requirements/project-content-persistence.md`
  - 已补 project bundle 用户故事、解决方式、边界和变更日志。
- [x] `.codestable/requirements/platform-shell-entry.md`
  - 虽不是 design frontmatter 主 requirement，但 shell/CLI 入口已变化；已同步 project export-bundle / import-bundle 能力和 non-overwrite 边界。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml`
  - `project-bundle-import-export` 已从 `in-progress` 改为 `done`，feature 指向 `2026-05-14-project-bundle-import-export`。
- [x] `.codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-roadmap.md`
  - 第 5 节子 feature 清单已同步状态为 done 和对应 feature。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露需要写入 AGENTS.md / CLAUDE.md 的新环境、工具或工作流规则。

## 9. 遗留

- 后续优化点：真实 Web 文件选择器、拖拽导入、IndexedDB / OPFS adapter 由下一 roadmap item 承担。
- 已知限制：project bundle 只包含 `.rxnflow/`、`inputs/raw/`、`exports/`；项目根 notes/scripts 不进入备份包。
- 已知限制：import 第一版只支持 `fail_if_exists`，不覆盖、不改名、不合并。
- 已知限制：bundle 是用户手动备份/同步路径，不是云存储。
- 实现阶段顺手发现：无需要另开 issue 的意外问题。
