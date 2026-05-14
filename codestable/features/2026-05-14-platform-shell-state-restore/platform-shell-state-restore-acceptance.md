---
doc_type: feature-acceptance
feature: 2026-05-14-platform-shell-state-restore
status: accepted
accepted_at: 2026-05-14
summary: 验收 Platform Shell 项目内容恢复与保存入口，确认 project.open/save_content、CLI open、session collections 和范围守护均已落地
tags: [platform-shell, persistence, acceptance, project-content]
---

# Platform Shell State Restore 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-14
> 关联方案 doc：`codestable/features/2026-05-14-platform-shell-state-restore/platform-shell-state-restore-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `ShellCommand("project.open", {"project_path": "...", "load_content": True})`
  - 代码落点：`rxnflow/platform.py` 的 `PlatformShellService._run_project_open` 和 `_open_project_with_content`
  - 结果：一致。默认 `load_content=True`，先 load manifest，再 validation-gated restore，返回 restored session summary。
- [x] `ShellCommand("project.save_content", {"session_id": "..."})`
  - 代码落点：`rxnflow/platform.py` 的 `PlatformShellService._run_project_save_content`
  - 结果：一致。实现要求 session 存在、session.project_path 存在，并从 session collections 构造 `ProjectContentSnapshot` 写回。
- [x] CLI `python3 -m rxnflow.cli project open --json --project-path <path>`
  - 代码落点：`rxnflow/cli.py` 的 `project open` parser 和 `_command_from_args`
  - 结果：一致。默认恢复 content。
- [x] CLI `python3 -m rxnflow.cli project open --json --project-path <path> --manifest-only`
  - 代码落点：`rxnflow/cli.py`
  - 结果：一致。映射为 `project.open(load_content=False)`。

**名词层变化核对**

- [x] Project Open：`project.open` 已落地，区分 content restore 和 manifest-only。
- [x] Save Content：`project.save_content` 已落地，保存进程内 session content collections。
- [x] Restored Session Summary：`ShellResponse.data` 包含 object/graph/workspace/profile/artifact counts 和 active ids。
- [x] Session Content Snapshot：`_snapshot_from_session_state` 从 session collections 构造 `ProjectContentSnapshot`。
- [x] Active Content Selection：restore 默认选择第一个 workspace、对应 graph 和第一个 profile。
- [x] Project Artifact Record Candidate：`_project_artifact_record_candidate` 只接受当前项目 `exports/...` 下可 checksum 的文件。

**流程图核对**

- [x] Project Open 流程节点均有代码落点：load manifest、load_content 分支、validate_project、load_snapshot、restore objects/import batches/graphs/workspaces、存 profiles/artifact records、active content selection、summary。
- [x] Save Content 流程节点均有代码落点：resolve session、project_path 检查、收集 content collections、artifact record 转换、构造 snapshot、save_snapshot、返回 summary/warnings。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] Platform Shell 能恢复已持久化项目内容：`test_project_open_restores_saved_project_content` 覆盖 objects、graphs、workspaces、profiles、export artifact records。
- [x] Platform Shell 能保存当前 session 内容：同一测试覆盖 open -> save -> load roundtrip。
- [x] CLI/agent 可观测：`test_cli_fixture_project_and_import_preview` 覆盖 CLI project open 默认恢复和 `--manifest-only`。

**明确不做逐项核对**

- [x] 不实现 `project.export_bundle` / `project.import_bundle`：scope guard grep 无命中。
- [x] 不实现 UI/cloud/desktop runtime：scope guard 保持原平台禁用词检查。
- [x] 不改变 `ProjectContentSnapshot` schema、codec 或 migration：本 feature 只消费既有 `ProjectContentStore` API。
- [x] 不重新 parse、confirm import、compute energy、export report：`test_project_open_and_save_do_not_recompute_or_reexport` 使用会失败的替身服务验证未调用。
- [x] 不把 artifact bytes 写入 JSON：只生成 `ExportArtifactRecord`，bytes-only artifact 仅 warning。

**关键决策落地**

- [x] `project.open` 与 `project.load` 分离：两者均存在，`project.load` 仍 manifest-only。
- [x] `project.open` 默认 `load_content=True`，`load_content=False` 为 manifest-only。
- [x] validation error 返回 `project_content_invalid`，不做部分恢复。
- [x] `project.save_content` 要求有效 `session_id` 和 session.project_path。
- [x] CLI 只暴露 `project open`，不暴露 `project save-content`。
- [x] runtime artifact 只有当前项目 `exports/...` 下的文件会持久化；外部路径、bytes-only artifact 返回 warning。

**挂载点反向核对**

- [x] `AppKernel` 增加 `ProjectContentStore`：实际落点在 `rxnflow/platform.py`。
- [x] `_PlatformSessionState` 增加 content collections：objects、import_batches、reaction_graphs、workspaces、energy_profiles、export_artifact_records。
- [x] `PlatformShellService.run` 增加 `project.open` / `project.save_content` 分支。
- [x] `rxnflow.platform` 内部 helper 承载 validate/load/restore、snapshot 构建、artifact record 转换和 summary。
- [x] `rxnflow.cli` 增加 project open 子命令。
- [x] tests 增加 restore/save/CLI/validation/artifact warning/no-recompute/no-bundle 覆盖。
- [x] 拔除沙盘推演：删除上述挂载点后，本 feature 对用户/agent 不再可见；未发现清单外残留挂载点。

## 3. 验收场景核对

- [x] `project.open(load_content=true)` 恢复 objects、import batches、graphs、workspaces、profiles、artifact records，并返回准确 counts。
  - 证据：`test_project_open_restores_saved_project_content`
- [x] 恢复后核心服务 list 接口可读到内容。
  - 证据：同一测试调用 registry/import/graph/workspace list 接口。
- [x] 恢复后 active workspace/graph/profile 可被既有命令继续使用。
  - 证据：session collections 与 active ids 测试；既有 workspace/energy/export 链路测试仍通过。
- [x] `project.open(load_content=false)` 只创建 manifest-only session，counts 为 0。
  - 证据：`test_project_commands_and_fixture_export_artifacts` 和 CLI `--manifest-only` 测试。
- [x] validation failure 返回结构化错误，不做部分恢复。
  - 证据：`test_project_open_validation_failure_does_not_restore_content`
- [x] `project.save_content` 写回 `ProjectContentSnapshot`，随后可 `load_snapshot`。
  - 证据：open -> save -> load roundtrip 测试。
- [x] open -> save roundtrip 不丢失多个 graph/workspace/profile/import batch/export artifact record。
  - 证据：测试构造两个 graph、两个 workspace、两个 profile、一个 artifact record 并验证 reloaded snapshot。
- [x] `project.save_content` 缺 session 或缺 project_path 返回结构化错误。
  - 证据：`test_project_save_content_requires_session_and_project_path`
- [x] runtime artifact 位于 `exports/` 时持久化，外部路径或 bytes-only artifact 产生 warning。
  - 证据：`test_session_import_workspace_energy_and_profile_export`
- [x] bundle commands 不在本 feature 出现。
  - 证据：scope guard grep。
- [x] CLI project open 默认恢复 content，`--manifest-only` manifest-only。
  - 证据：CLI subprocess 测试。
- [x] 既有测试继续通过。
  - 证据：`python3 -m unittest discover`，158 tests OK。
- [x] Restore/save 不调用 parser、import register、energy compute、export writer。
  - 证据：替身服务测试。

## 4. 术语一致性

- Project Open：代码使用 `project.open`，CLI 使用 `project open`。
- Save Content：代码使用 `project.save_content`；CLI 明确不提供 `save-content`。
- Restored Session Summary：`_restored_session_summary` 和 `_response_data` 提供 counts/active ids。
- Session Content Snapshot：`_snapshot_from_session_state` 与 `ProjectContentSnapshot` 一致。
- Active Content Selection：restore helper 使用第一个 workspace/graph/profile。
- Project Artifact Record Candidate：`_project_artifact_record_candidate` 与设计术语一致。
- 禁用/未实现命名：`project.export_bundle`、`project.import_bundle`、CLI `save-content` 无命中。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`
  - 已补 Project Open、Save Content、Restored Session Summary、Platform Session collections、CLI project open、restore/save 边界。
- [x] `codestable/architecture/core-platform.md`
  - 已补 Platform Shell 第十类职责、模块图、data/state workflow、CLI project open、project.open/project.save_content、artifact record 转换和 no-recompute 边界。
- [x] `AGENTS.md`
  - 不需要更新。新增内容属于项目架构现状，不是所有 feature 都要重复遵守的新协作规则。

## 6. requirement 回写

- [x] `codestable/requirements/project-content-persistence.md`
  - 已补用户故事、解决方式、边界和变更日志，记录 Platform Shell 级 open/save content 能力。
- [x] `codestable/requirements/platform-shell-entry.md`
  - 虽不是 design frontmatter 的主 requirement，但原文对跨进程恢复边界已过期；已同步 project open / save content 入口和 CLI save-content 不暴露边界。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml`
  - `platform-shell-state-restore` 已从 `in-progress` 改为 `done`。
- [x] `codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-roadmap.md`
  - 已同步第 4.9 节 `project.save_content(session_id)` 契约、artifact candidate 边界，并把第 5 节子 feature 状态改为 done。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露需要写入 AGENTS.md / CLAUDE.md 的新环境、工具或工作流规则。

## 9. 遗留

- 后续优化点：`rxnflow/platform.py` 已明显增长，若后续继续增加 platform shell 编排，可单独拆 `platform_restore` / `platform_persistence` 辅助模块。
- 已知限制：CLI 仍是一次性进程，只支持 `project open`；`project.save_content` 仅作为进程内 shell API。
- 已知限制：`project.export_bundle` / `project.import_bundle`、browser local storage adapter 和真实 UI 仍由后续 roadmap item 承担。
- 实现阶段顺手发现：无需要另开 issue 的意外问题。
