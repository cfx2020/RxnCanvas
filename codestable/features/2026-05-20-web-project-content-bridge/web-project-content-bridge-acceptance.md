# Web Project Content Bridge 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-20
> 关联方案 doc：`codestable/features/2026-05-20-web-project-content-bridge/web-project-content-bridge-design.md`

## 1. 接口契约核对

对照方案第 2.1 节，已落地 Browser Project Content Files、Shell Project Content Payload、Saved Project Content Files、Browser Content Validation 和 Bridge Session 的契约。

**接口示例逐项核对**：

- [x] `ShellProjectContentFile`：Web 在 `web/src/app/projectContentBridge.ts` 中用 `path`、`bytes_base64`、`checksum`、`metadata` 组装 payload；Platform Shell 在 `rxnflow/platform.py` 中接收 `content_files` 并 materialize。
- [x] `ProjectOpenArgs.content_files`：`project.open(content_files, load_content=true)` 可恢复 session；`load_content=false` 只打开 manifest。
- [x] `ProjectSaveContentArgs.include_content_files`：`project.save_content(include_content_files=true)` 返回 `.rxnflow/manifest.json`、`.rxnflow/state/project-content.json` 和 6 个 section files 的 base64 bytes/checksum/metadata。

**名词层变化核对**：

- [x] Project Sidebar 不再写旧占位 schema；创建 browser project 时写真实 `project-v1` manifest、`project-content-v1` index 和空 section files。
- [x] Browser open 只更新 `ProjectSidebarState` 与 shallow validation，不自动创建 PlatformSession。
- [x] 显式 Open Bridge / Save Bridge Session 才调用 ShellClient，并保持 Browser Project Repository 与 WorkbenchDomainState 分离。

**流程图核对**：

- [x] create/open browser project -> shallow validation -> explicit open bridge -> snapshot -> explicit save bridge -> repository write back 均有代码落点。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 创建 browser project 写入真实 Project Content files；证据：Vitest `projectContentBridge.test.ts`、`projectSidebarActions.test.ts`、Workbench component test。
- [x] 显式 Open Bridge 读取 repository bytes 并发送 `project.open(content_files)`；证据：Workbench component test 断言 payload 和 snapshot。
- [x] 显式 Save Bridge Session 调用 `project.save_content(include_content_files=true)` 并写回 repository；证据：Workbench component test 断言 payload 与 repository metadata。
- [x] Python bridge 不读 IndexedDB；证据：Platform Shell 只接收 inline `content_files`，materialize 到临时项目目录。

**明确不做逐项核对**：

- [x] 未实现云存储、账号、同步、多人协作或冲突合并。
- [x] 未实现 `.rxnflow.zip` bundle IO、OPFS/chunking、Worker、Service Worker 或 browser_storage import adapter。
- [x] 未把 Browser Project Ref 当作 Python filesystem path。
- [x] 未在前端解析或重写 ChemicalObject、ReactionGraph、EnergyProfile 或 ExportArtifact 领域模型。
- [x] 未改变 parser、registry、graph、energy、export 领域算法。

**关键决策落地**：

- [x] Browser Project Repository 与 PlatformSession 分离：打开 browser project 不创建 session；Open Bridge 才创建 Bridge Session。
- [x] Web 只搬运 bytes/checksum：shallow validation 只检查 files 可读、缺失和 checksum mismatch。
- [x] Platform Shell 复用 ProjectStore / ProjectContentStore：`content_files` 只 materialize，不新增 IndexedDB adapter。

**挂载点反向核对**：

- [x] 挂载点均落在方案第 2.3 节清单：`rxnflow/platform.py`、`tests/test_platform_shell_baseline.py`、`web/src/app/projectContentBridge.ts`、Project Sidebar actions/UI、`WorkbenchShell.tsx`、i18n/tests/docs。
- [x] grep 反查 `content_files`、`include_content_files`、`Browser Project Content Files` 命中均属于上述挂载点或架构/需求/roadmap 落档。
- [x] 拔除沙盘推演：移除 `projectContentBridge.ts`、Sidebar bridge buttons、Workbench open/save handlers 和 Platform Shell content payload 分支即可卸载本 feature；fixture/import/graph/energy/export 主功能仍保留。

## 3. 验收场景核对

- [x] S1 `project.open` 收到完整 content files 恢复 session：Python 单测通过。
- [x] S2 `load_content=false` 只打开 manifest：Python 单测通过。
- [x] S3 缺 manifest、无效 base64、不安全 path、checksum mismatch 返回结构化 error：Python 单测通过。
- [x] S4 `project.save_content(include_content_files=true)` 返回 manifest/index/6 sections：Python 单测通过。
- [x] S5 原 filesystem `project.open(project_path)` / `project.save_content(session_id)` 不回退：Python 单测通过。
- [x] S6 Web 创建 browser project 写真实 Project Content files：Vitest 通过。
- [x] S7 Web 打开 browser project 不自动调用 shell `project.open`：Workbench component test 通过。
- [x] S8 Open Bridge payload 与 snapshot 更新：Workbench component test 和浏览器 smoke 通过。
- [x] S9 Save Bridge payload 与 repository 写回：Workbench component test 和浏览器 smoke 通过。
- [x] S10 缺 section 显示 missing/dirty，不把旧占位内容标成 valid：component test 通过。
- [x] S11 fixture 默认模式 list/create/open 不回退，local-http 状态/错误可读：Vitest 与现有 e2e 通过。
- [x] S12 自动化和渲染验证通过：`python3 -m unittest discover`、`npm run test`、`npm run build`、`npm run test:e2e` 均通过。

前端浏览器验证：

- [x] in-app Browser 成功打开 `http://127.0.0.1:5175/`，页面标题为 `RxnFlow Workbench`，DOM 非空，console 无 warn/error。
- [x] in-app Browser 输入交互遇到虚拟剪贴板 / CDP 超时限制，因此按前端 QA 规则 fallback 到 Playwright。
- [x] Playwright desktop `1280x720` 验证 create project -> Open Bridge -> Save Bridge：无 console issue，无水平溢出。截图：`/tmp/rxnflow-project-content-bridge-desktop.png`、`/tmp/rxnflow-project-content-bridge-open-save.png`。
- [x] Playwright narrow `390x840` 验证同一流程：无 console issue，无水平溢出。截图：`/tmp/rxnflow-project-content-bridge-narrow.png`。

## 4. 术语一致性

- Browser Project Content Files：架构、需求、开发文档和 Web helper 命名一致。
- Shell Project Content Payload：`content_files` / `bytes_base64` 命名与方案一致。
- Saved Project Content Files：`include_content_files=true` 返回语义与方案一致。
- Browser Content Validation：Web 侧只做 shallow validation，不冒充 Python ProjectContentValidator。
- Bridge Session：UI 文案和状态仅表示显式 bridge open/save 后的 shell session。

已对 current docs/source 运行旧术语 grep；`stub`、`Save Stub`、`saveProjectStub`、`web-project-content-stub` 不再出现在 current docs、roadmap 当前页、前端源码和 e2e 中。历史 feature 文档保留旧记录不改。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：已记录 Browser Project Content Files、Platform Shell `content_files` / `include_content_files` 和 Project Sidebar bridge 边界。
- [x] `codestable/architecture/core-platform.md`：已记录 Platform Shell、Web Runtime Boundary 与 Project Content files 显式 open/save 能力。
- [x] `codestable/architecture/web-workbench.md`：已记录 Project Sidebar 保存真实 content files、Open Bridge / Save Bridge Session、shallow validation、current limitations 和测试覆盖。
- [x] `docs/dev/web-runtime-boundary.md`：已补 Project Content Bridge 显式 open/save 规则和 repository/session 分离约束。
- [x] `docs/dev/platform-project-open-save.md`：已补 `content_files` 与 `include_content_files` 参数说明、错误边界和 inline 示例。

## 6. requirement 回写

- [x] `codestable/requirements/project-content-persistence.md` 已更新：Web Project Sidebar 可保存真实 Project Content files，并可通过显式 Open Bridge / Save Bridge Session 与 Platform Shell 协作。
- [x] `codestable/requirements/web-workbench-shell.md` 已更新：Workbench Snapshot 仍只读，项目保存通过 Project Sidebar 的显式 Save Bridge Session 完成。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-web-runtime-bridge/rxnflow-web-runtime-bridge-items.yaml`：`web-project-content-bridge` 回写为 `done`。
- [x] `codestable/roadmap/rxnflow-web-runtime-bridge/rxnflow-web-runtime-bridge-roadmap.md`：第 6 节子 feature 清单同步为 `done`，对应 feature 为 `2026-05-20-web-project-content-bridge`。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无新增候选。AGENTS.md 已有 Web 预览必须从 `web/` 运行 `npm run dev`、不要用 `file://` 的规则；本 feature 未暴露新的每次都会踩的项目级约束。

## 9. 遗留

- Export artifacts 仍未写入 Browser Project Repository 的 `exports/...`；已由 roadmap 下一项 `web-export-artifact-persistence` 承接。
- Project Bundle import/export UI 仍 disabled；真实 `.rxnflow.zip` IO 不在本 feature 范围。
- Browser Project Content validation 仍是 shallow validation；深校验仍由 Python ProjectContentValidator 在 bridge open 时执行。
- Platform Shell 为 `content_files` 创建的临时 project directory 随 bridge 进程生命周期保留，后续如需长期运行 bridge 可单独做资源清理策略。
