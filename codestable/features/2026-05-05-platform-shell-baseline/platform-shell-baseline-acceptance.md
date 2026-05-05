# platform-shell-baseline 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-05
> 关联方案 doc：codestable/features/2026-05-05-platform-shell-baseline/platform-shell-baseline-design.md

## 1. 接口契约核对

对照方案第 2.1 节，新增名词和入口均已落地：

- [x] ShellCommand：`rxnflow/platform.py:32`，包含 `name` 和 JSON-safe `args`。
- [x] ShellArtifact：`rxnflow/platform.py:38`，包含 `id`、`format`、`path`、`bytes_base64` 和 `metadata`。
- [x] PlatformSession：`rxnflow/platform.py:50`，记录 project、workspace、graph、profile、objects 和 artifacts 的会话摘要。
- [x] ShellResponse：`rxnflow/platform.py:62`，包含 `ok`、`data`、`error`、`warnings` 和 `artifacts`，测试覆盖 `json.dumps`。
- [x] AppKernel：`rxnflow/platform.py:90`，集中装配已有核心服务。
- [x] PlatformShellService.run：`rxnflow/platform.py:141`，作为统一 command handler。
- [x] handle_platform_payload：`rxnflow/platform.py:606`，纯 dict adapter，不依赖 Web 框架。
- [x] CLI Entry：`rxnflow/cli.py:13` 提供 `main(argv=None) -> int`，`rxnflow/cli.py:94` 支持 `python3 -m rxnflow.cli`。

接口示例核对：

- [x] Web/agent payload 示例由 `tests/test_platform_shell_baseline.py:362` 覆盖，返回 JSON-safe dict。
- [x] CLI fixture/project/import preview 示例由 `tests/test_platform_shell_baseline.py:265` 覆盖。

流程图核对：CLI argv / payload / agent dict 都收敛到 ShellCommand，进入 PlatformShellService.run，再调用 AppKernel 持有的核心服务，最后投影为 ShellResponse。该链路在 `rxnflow/platform.py` 和 `rxnflow/cli.py` 中有对应落点。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] Python API 可运行结构化 shell command 并得到 JSON-safe response：`tests/test_platform_shell_baseline.py:22`、`:58` 覆盖。
- [x] 标准库 CLI 可执行 fixture、project create/load、import preview 和 fixture export：`tests/test_platform_shell_baseline.py:265` 覆盖。
- [x] 未来 Web/桌面可复用同一 command/response shape：`handle_platform_payload` 只做 dict adapter，测试确认不依赖框架。
- [x] Shell 层复用已有核心服务：AppKernel 装配 ProjectStore、ParserRegistry、ChemicalRegistry、ImportRegistryWorkflow、ReactionGraphService、GraphEditorWorkspaceService、EnergyProfileEngine 和 ReportExportService。

明确不做核对：

- [x] 未新增 Next.js、React、Vercel Functions、FastAPI、Flask、Django 或真实 Web route/server；范围守护测试和文件扫描通过。
- [x] 未新增 macOS app、Windows exe、Linux packaging、Electron/Tauri/SwiftUI/Qt 入口或安装包；文件扫描无相关项目文件。
- [x] 未新增 UI 组件、窗口、文件选择器、canvas、拖拽或真实报告预览。
- [x] 未新增数据库、账号、权限、云同步、后台队列或异步任务系统。
- [x] 未新增 ProjectResource 来持久化 ChemicalObject、ReactionGraph、EnergyProfile 或 ExportArtifact 内容。
- [x] 未修改 parser/import/registry/graph/energy/export 的核心业务语义；全量回归测试通过。
- [x] 未新增导出格式，未实现 CDX/CSV/PDF/PPTX/SVG。

关键决策落地：

- [x] App Kernel 只做装配，不做业务：业务逻辑仍在各核心服务中。
- [x] CLI 是第一 concrete shell：已用 subprocess 测试 stdout JSON、文件输出和 exit code。
- [x] Web 只先做 payload adapter：没有引入任何 Web 框架或 route。
- [x] session-scoped state 不伪装持久化：PlatformSession 明确只记录进程内状态。
- [x] Fixture command 作为端到端烟测：fixture.run 覆盖 project/object/graph/profile/export 摘要。
- [x] JSON 投影和核心 dataclass 分离：ShellResponse 负责投影，核心模型没有为端侧改形状。

跨层纪律核对：

- [x] 错误语义：空命令、未知命令、缺少前置状态返回 `invalid_input`；CLI 对错误返回非 0。
- [x] JSON 边界：response dict 不包含 dataclass、Path、bytes 或 tuple。
- [x] Artifact 边界：默认不内联 bytes；include_bytes 时使用 base64 并记录 encoding。
- [x] 状态边界：PlatformSession 是进程内状态，不承诺跨进程恢复完整对象内容。
- [x] 可观测点：ShellResponse data 记录 command、session_id、project_id、workspace_id、graph_id、profile_id、object_count 和 artifact_count。

挂载点核对：

- [x] 新增挂载点限于 `rxnflow/platform.py`、`rxnflow/cli.py` 和 `tests/test_platform_shell_baseline.py`。
- [x] 反向 grep 确认 platform shell 相关术语均落在设计清单内。
- [x] 拔除沙盘推演：移除 `rxnflow/platform.py`、`rxnflow/cli.py` 和对应测试后，既有核心服务仍保持独立；Platform Shell 没有把业务逻辑写回核心模块。

## 3. 验收场景核对

对照方案第 3 节，关键场景均已由单测或全量回归覆盖：

- [x] S1-S2：空 ShellCommand 和未知 command 返回 `invalid_input`，target 指向 command；证据 `tests/test_platform_shell_baseline.py:22`。
- [x] S3-S4：fixture.run 返回 project/object/graph/profile 摘要，并可导出 png/xlsx ShellArtifact；证据 `tests/test_platform_shell_baseline.py:58`、`:81`。
- [x] S5-S6：project.create 写 manifest，project.load 返回 manifest summary 且不解析 raw file；证据 `tests/test_platform_shell_baseline.py:81`。
- [x] S7-S8：import.preview 返回 batch/item/preview，import.register_all 在同一 session 中确认并幂等；证据 `tests/test_platform_shell_baseline.py:136`。
- [x] S9-S10：workspace.open/add_node/connect/set_path 返回 snapshot，graph_invalid 被正确投影；证据 `tests/test_platform_shell_baseline.py:136`。
- [x] S11：energy.compute 使用 active path 和 objects 返回 EnergyProfile summary，缺少前置状态返回 invalid_input；证据 `tests/test_platform_shell_baseline.py:136`。
- [x] S12-S13：export.profile 默认不内联 bytes，include_bytes 时 artifact 使用 base64；证据 `tests/test_platform_shell_baseline.py:136`。
- [x] S14：handle_platform_payload 返回 JSON-safe dict，不依赖 Web framework；证据 `tests/test_platform_shell_baseline.py:362`。
- [x] S15-S17：CLI fixture/project/import preview、export-dir 文件输出、错误 exit code 均通过 subprocess 覆盖；证据 `tests/test_platform_shell_baseline.py:265`。
- [x] S18：JSON 投影不包含 dataclass、Path、bytes 或 tuple；证据 `tests/test_platform_shell_baseline.py:22`、`:362`。
- [x] S19：既有核心服务行为不变；证据 `python3 -m unittest discover` 全量通过。

本 feature 没有前端视觉或浏览器 UI 改动，不需要浏览器肉眼验证。

## 4. 术语一致性

- Platform Shell / App Kernel / Platform Session / Shell Command / Shell Response / Shell Artifact / CLI Entry / Web Payload Adapter 已在 architecture 和 implementation 中统一命名。
- 代码命中：`rxnflow/platform.py` 中 ShellCommand、ShellArtifact、PlatformSession、ShellResponse、AppKernel、PlatformShellService、handle_platform_payload；`rxnflow/cli.py` 中 CLI entry。
- 防冲突：未引入真实 Web framework、桌面 app、packaging、CDX 或新导出格式术语作为实现能力。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：已补 Platform Shell、App Kernel、Platform Session、Shell Command、Shell Response、Shell Artifact、CLI Entry、Web Payload Adapter 术语，并补关键架构决定。
- [x] `codestable/architecture/core-platform.md`：已从九类能力更新为十类能力，加入 Platform Shell 当前能力、模块结构、稳定协议、错误语义和边界。
- [x] AGENTS.md 不需要更新：本 feature 未新增每个后续 feature 都必须遵守的环境命令或工作流规约。

## 6. requirement 回写

- [x] design frontmatter 原 `requirement: null`，本 feature 新增了用户/agent 可触发能力，已 backfill requirement。
- [x] 新增 `codestable/requirements/platform-shell-entry.md`，记录统一命令入口的用户故事、为什么需要、怎么解决和边界。
- [x] 已回填 design frontmatter：`requirement: platform-shell-entry`。
- [x] cs-req 自查：标题平铺，用户故事具体，没有把模块接口细节写进 requirement，边界明确。

## 7. roadmap 回写

- [x] design frontmatter 指向 `roadmap: rxnflow-core-platform` 和 `roadmap_item: platform-shell-baseline`。
- [x] 已将 `codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-items.yaml` 中 `platform-shell-baseline` 状态从 `in-progress` 改为 `done`。
- [x] 已同步 `codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-roadmap.md` 第 5 节子 feature 清单状态。
- [x] 已更新 roadmap 观察项，反映 requirements 目录已有第一份现状需求。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 没有新增必须写入 AGENTS.md 的环境变量、远端执行方式、浏览器验证方式或高频工作流坑点。

## 9. 遗留

- 真实 Web route、桌面 app、Windows/Linux/macOS 打包仍未实现，需后续 feature 或 decision 拆分。
- ChemicalObject、ReactionGraph、WorkspaceSnapshot、EnergyProfile 和 ExportArtifact 的完整项目内容持久化仍未实现。
- package metadata、console script、发布方式、Vercel/桌面技术栈仍未正式拍板。
- CLI 当前只覆盖 fixture、project create/load、import preview 和可测试闭环；完整交互式 CLI/TUI 不在本 feature 范围内。
