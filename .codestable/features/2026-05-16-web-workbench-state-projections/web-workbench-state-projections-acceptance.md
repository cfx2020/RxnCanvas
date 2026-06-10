# web-workbench-state-projections 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-16
> 关联方案 doc：.codestable/features/2026-05-16-web-workbench-state-projections/web-workbench-state-projections-design.md

## 1. 接口契约核对

对照方案第 2.1 节，本 feature 实际落地了一个 Python Platform Shell 只读 command、一个前端 shell DTO 契约、一个 app domain/UI state 契约和一个 projector。

接口示例逐项核对：

- [x] `PlatformShellService.run(ShellCommand("workbench.snapshot", {"session_id": ...}))`：`rxnflow/platform.py` 在 `PlatformShellService.run` 中分发到 `_run_workbench_snapshot`，并由 `_workbench_snapshot_payload` 返回 JSON-safe projection。
- [x] Workbench Snapshot response shape：实际包含 `command`、`session_id`、`project_id`、`project_path`、top-level active ids、`active`、`counts`、`project`、`objects`、`imports`、`workspace`、`profile`、`artifacts` 和 `warnings`。方案示例未显式列出 `active`，但第 3 节要求 active ids，实际实现是兼容扩展。
- [x] `WorkbenchSnapshotData`：已归入 `web/src/shell/types.ts` 并从 `web/src/shell/index.ts` 导出，保持 shell DTO 边界。
- [x] `WorkbenchDomainState` / `WorkbenchUiState`：已在 `web/src/app/workbenchState.ts` 落地；domain state 来自 ShellResponse，UI state 只保留 panel/pending command 等本地状态。
- [x] `projectWorkbenchSnapshot(response)`：成功 response 投影为 domain state；错误 response 保留 `ShellError`、`ShellWarning` 和 `invalid_input` code。

名词层“现状 -> 变化”核对：

- [x] `PlatformShellService` 从局部 command payload 增加统一 read-only workbench projection。
- [x] `_PlatformSessionState` 未暴露给前端，仍由 Platform Shell helper 汇总为 JSON-safe summary。
- [x] `web/src/shell/types.ts` 已承载 snapshot DTO；`web/src/app/workbenchState.ts` 不再定义 shell DTO。
- [x] 原 fixture-only `WorkbenchShellState` / `projectFixtureResponse` 已移除，WorkbenchShell 消费统一 `WorkbenchDomainState`。

流程图核对：

- [x] Existing shell command mutates session：`fixture.run` / `project.open` / import/workspace/energy/export tests 均覆盖已有 session state。
- [x] UI requests `workbench.snapshot`：`WorkbenchShell.runFixture` 先执行 `fixture.run`，再用 returned `session_id` 执行 `workbench.snapshot`。
- [x] PlatformShellService resolves session：`_resolve_state(command.args)` 处理缺失/不存在 session。
- [x] Session exists 分支：成功时 `_workbench_snapshot_payload` 汇总 projection；失败时返回 `invalid_input`。
- [x] ShellClient normalizes response：既有 `ShellClient.run` 继续规范化 `ShellResponse`。
- [x] `projectWorkbenchSnapshot` -> `WorkbenchDomainState` -> WorkbenchShell render：前端单测和浏览器验证已覆盖。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] 新增 `workbench.snapshot` 只读命令：`rxnflow/platform.py` 已实现。
- [x] 定义 Python shell response 的 Workbench Snapshot JSON shape：`_workbench_snapshot_payload` 复用现有 `_object_summary`、`_import_batch_summary`、`_workspace_summary`、`_profile_summary` 语义。
- [x] Web 新增 `WorkbenchDomainState` / `WorkbenchUiState` / projector：`web/src/app/workbenchState.ts` 已实现。
- [x] fixture transport 支持 `workbench.snapshot`：`web/src/shell/fixtureTransport.ts` 已实现成功和 missing session 错误路径。
- [x] WorkbenchShell 消费统一 domain state：`web/src/app/WorkbenchShell.tsx` 已从 fixture-only state 切到 snapshot projector。

明确不做逐项核对：

- [x] 未实现 Browser Project Repository、IndexedDB / OPFS、project refs 或真实浏览器本地持久化：scope grep 无命中，核心浏览器存储代码未改。
- [x] 未实现 local-python bridge、HTTP API、Vercel route、FastAPI、Flask、Django 或 Express server：scope grep 无命中。
- [x] 未实现真实项目新建/打开/保存 Web UI、文件选择、parser preview 或 import register UI：Web UI 仍只有 fixture command 和 invalid command。
- [x] 未实现 object drag/drop、graph canvas editing、selection persistence、energy curve 或 report export panel：浏览器页面仍为工作台骨架和 path board 占位。
- [x] 未改变 Project Content schema、GraphPatch、Energy Engine 或 Report Export 算法：相关核心文件无 diff。
- [x] 前端未手写 ChemicalObject / ReactionGraph / EnergyProfile 作为业务真相：fixture transport 只返回 shell summary DTO。
- [x] `workbench.snapshot` 未作为保存命令：保存仍由 `project.save_content` 承担。

关键决策落地：

- [x] 新增 `workbench.snapshot` 而不是让 UI 拼响应：UI 只从 snapshot projector 更新 domain state。
- [x] snapshot 只读、无副作用：missing session 测试证明不创建 session；read-only guard 测试证明不调用 parser/import register/energy/export/save。
- [x] 复用既有 summary helper：Python payload 复用已有 summary helper；artifact summary 只额外标注 `persisted` 和 `has_inline_bytes`。
- [x] 前端分离 domain state 与 UI state：shell DTO 在 `web/src/shell/types.ts`，domain/UI state 在 `web/src/app/workbenchState.ts`。
- [x] fixture transport 同步实现 snapshot：ShellClient 测试覆盖 fixture snapshot 和 unknown command。

编排层“现状 -> 变化”核对：

- [x] `PlatformShellService.run` 增加 `workbench.snapshot` 分支。
- [x] `fixture.run` 后返回的 session 可被 `workbench.snapshot` 读取。
- [x] Web fixture transport 增加 `workbench.snapshot`，WorkbenchShell 用 projector 更新 state。
- [x] WorkbenchShell 保持三栏工作台布局，数据来源切为 domain state。

跨层纪律核对：

- [x] Read-only：`workbench.snapshot` 不调用 parser/import register/workspace patch/energy compute/export/project save。
- [x] JSON-safe：Python 与 Web 测试均调用 `JSON.stringify` / `json.dumps`。
- [x] 权威边界：前端只读取 projection，不写回 core。
- [x] Missing session：缺少或不存在 `session_id` 返回 `invalid_input`，不自动创建 session。
- [x] Projection 不等于 persistence：architecture 已记录 snapshot 不替代 ProjectContentSnapshot。
- [x] Evolvability：snapshot 字段保持 summary 边界，后续面板继续扩展 projection。

挂载点核对：

- [x] `rxnflow.platform`：新增 command handler 和 projection helper。
- [x] `tests/test_platform_shell_baseline.py`：覆盖 fixture、project open restore、manifest-only、read-only guard 和 import/workspace/energy/export 后 snapshot。
- [x] `web/src/shell/types.ts` / `index.ts`：新增并导出 Workbench Snapshot DTO。
- [x] `web/src/app/workbenchState.ts`：新增 domain/UI state 和 projector。
- [x] `web/src/app/WorkbenchShell.tsx`：从 unified domain state 渲染。
- [x] `web/src/shell/fixtureTransport.ts`：支持 `workbench.snapshot`。
- [x] `.codestable/architecture/web-workbench.md`、`core-platform.md`、`ARCHITECTURE.md`：已归并现状。

反向核查：

- [x] grep `workbench.snapshot|WorkbenchSnapshotData|WorkbenchDomainState|WorkbenchUiState` 命中均落在上述挂载点、feature docs、tests 和 architecture 中。
- [x] 拔除沙盘推演：删除 `PlatformShellService.run` 分支、`_run_workbench_snapshot`、projection helpers、Web DTO/projector、fixture transport snapshot 分支和相关测试后，本 feature 不会在生产路径留下孤立入口。

## 3. 验收场景核对

- [x] S1 fixture session 调用 `workbench.snapshot` 返回 `ok=true`。
  - 证据：`tests/test_platform_shell_baseline.py::test_app_kernel_runs_fixture_command_with_session_summary`。
- [x] S2 snapshot response 可 JSON 序列化且包含关键字段。
  - 证据：Python tests 中 `json.dumps(snapshot_payload)`；Web ShellClient test 中 `JSON.stringify(response)`。
- [x] S3 缺少或不存在 `session_id` 返回 `invalid_input` / `target=session_id`。
  - 证据：Python `test_workbench_snapshot_missing_session_and_manifest_only_session`；Web ShellClient missing session test。
- [x] S4 `project.open(load_content=True)` 后 snapshot 能看到 restored counts。
  - 证据：Python project-open restore 测试断言 object/graph/workspace/profile/artifact counts。
- [x] S5 manifest-only session counts 为 0。
  - 证据：Python manifest-only snapshot 测试。
- [x] S6 import preview/register/workspace/energy/export 后 snapshot 与 session state 一致。
  - 证据：Python import/workspace/energy/export 测试断言 imports、workspace graph nodes、profile points 和 artifact formats。
- [x] S7 snapshot 不重新 parse/import/compute/export/save。
  - 证据：guarded services 测试；scope review。
- [x] S8 TypeScript 中存在稳定类型。
  - 证据：`web/src/shell/types.ts` 和 `web/src/app/workbenchState.ts`。
- [x] S9 Web projector 可投影 successful snapshot。
  - 证据：`web/src/app/workbenchState.test.ts`。
- [x] S10 Web projector 保留 ShellError/ShellWarning，错误 code 可见。
  - 证据：`workbenchState.test.ts` 和 `WorkbenchShell.test.tsx`。
- [x] S11 fixture transport 支持 snapshot，unknown command 仍返回 `invalid_input`。
  - 证据：`web/src/shell/ShellClient.test.ts`。
- [x] S12 WorkbenchShell 首屏仍是工作台。
  - 证据：`WorkbenchShell.test.tsx`；浏览器验收。
- [x] S13 `npm run test` 通过。
  - 证据：3 test files / 9 tests passed。
- [x] S14 `npm run build` 通过。
  - 证据：`tsc -b && vite build` passed。
- [x] S15 `python3 -m unittest discover` 通过。
  - 证据：217 tests passed。
- [x] S16 桌面 viewport 验证通过。
  - 证据：浏览器 `1280x820`，Fixture Run 后 `hasProject=true`、`hasProfile=true`、`horizontalOverflow=false`、`badBounds=0`。
- [x] S17 窄屏 viewport 验证通过。
  - 证据：浏览器 `390x840`，Fixture Run 后 `hasProject=true`、`hasProfile=true`、`horizontalOverflow=false`、`badBounds=0`、`overlaps=0`。

## 4. 术语一致性

- Workbench Snapshot：代码命中在 `rxnflow.platform` projection、Web DTO、fixture transport、tests、architecture 和 feature docs 中，语义一致。
- `workbench.snapshot`：Python shell、Web ShellCommandName、fixture transport、tests 和 docs 均使用同一 command name。
- WorkbenchDomainState：只在 app state/projector/UI 渲染和 docs 中使用，不作为 shell DTO 或持久化模型。
- WorkbenchUiState：只在 app state 类型和 docs 中使用，不进入 ShellResponse。
- 防冲突：未复用 `ProjectContentSnapshot` 作为 UI state 名称；旧 `WorkbenchShellState` 已从代码中移除。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md`：已记录 Workbench Snapshot、WorkbenchDomainState、WorkbenchUiState、fixture transport snapshot 和 QA 边界。
- [x] `.codestable/architecture/core-platform.md`：已记录 `workbench.snapshot` command、只读 projection workflow、missing session/error 边界和不调用 parser/import/energy/export/save 的纪律。
- [x] `.codestable/architecture/ARCHITECTURE.md`：术语表已增加 Workbench Snapshot、WorkbenchDomainState、WorkbenchUiState，并更新 Web Workbench 模块索引。
- [x] `AGENTS.md`：本 feature 未发现需要新增的通用工作流规则；现有 Web dev server 预览规则仍适用。

## 6. requirement 回写

- [x] `requirement: web-workbench-shell` 存在。
- [x] 本 feature 没改变主要用户故事方向，但补强了 agent/开发者可见的统一状态投影能力；已更新 `.codestable/requirements/web-workbench-shell.md` 的用户故事、解决方式和边界。

## 7. roadmap 回写

- [x] `roadmap: rxnflow-web-workbench-mvp` / `roadmap_item: web-workbench-state-projections` 均存在。
- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-items.yaml` 中对应 item 已从 `in-progress` 改为 `done`，feature 保持 `2026-05-16-web-workbench-state-projections`。
- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-roadmap.md` 主文档同步改为 `done`。
- [x] roadmap items YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无新增候选。本 feature 没暴露新的环境坑或每个后续 feature 都会重复踩的流程规则；`cd web && npm run dev` 和 `http://127.0.0.1:5173/` 的预览要求已在 AGENTS.md 中存在。

## 9. 遗留

- 后续优化点：无新增 issue；下一步按 roadmap 继续 `web-local-project-repository`。
- 已知限制：
  - Web fixture transport 仍是 in-process-test，不是真实 Python bridge。
  - Workbench Snapshot 当前返回 summary，不返回完整 ChemicalObject geometry 或完整 raw parse result。
  - 当前 UI 仍不包含真实导入、拖拽画布、能量曲线或导出面板。
- 实现阶段顺手发现：
  - 验收时发现 DTO 初版放在 app state 边界内，已修正到 `web/src/shell/types.ts`。
  - 验收时发现一处 JSX 缩进不一致，已修正。
