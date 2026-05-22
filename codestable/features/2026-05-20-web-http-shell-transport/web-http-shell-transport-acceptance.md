# web-http-shell-transport 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-20
> 关联方案 doc：`codestable/features/2026-05-20-web-http-shell-transport/web-http-shell-transport-design.md`

## 1. 接口契约核对

- [x] `ShellTransportKind` 已扩展为 `in-process-test | http-api`，并新增 `ShellRuntimeInfo` / `WebShellRuntimeMode`。
- [x] `createHttpShellTransport(options)` 已落地，使用 `fetch` POST Shell payload 到 endpoint。
- [x] `createConfiguredShellRuntime(env)` 已落地，默认 fixture，`VITE_RXNFLOW_SHELL_TRANSPORT=local-http` 时创建 `http-api` transport。
- [x] `transport_unavailable` 错误契约已落地，fetch failure / invalid JSON / malformed response 都返回 normalized ShellResponse。

流程核对通过：App 启动读取 Vite env → 创建 configured ShellClient → WorkbenchShell 顶栏显示 runtime badge → ShellClient.run 经 fixture 或 http-api transport 返回 ShellResponse → Workbench state 投影。

## 2. 行为与决策核对

- [x] 默认无 env 时仍使用 fixture transport，不破坏现有 fixture flow。
- [x] local-http 模式可调用本地 Python `rxnflow.local_bridge`，点击 Fixture Run 后显示真实 Python fixture `project-fixture-minimal-reaction`。
- [x] 顶栏 Runtime Indicator 已显示 `Runtime Fixture` / `Runtime Local HTTP`，中文显示 `运行时 Fixture`。
- [x] 明确不做：未扩展 Python local bridge、未实现 File bytes preview、未实现 project content bridge、未实现 export persistence。
- [x] 明确不做：未修改 parser、registry、graph、energy、export 领域行为。
- [x] local-http 未设为默认；默认仍为 fixture。

挂载点核对：

- [x] `web/src/shell/httpTransport.ts`：http-api transport。
- [x] `web/src/shell/runtime.ts`：Vite env runtime factory。
- [x] `web/src/app/App.tsx` / `WorkbenchShell.tsx`：接入 runtimeInfo 与顶栏 indicator。
- [x] `web/src/app/i18n/messages.ts` / `workbench.css`：双语 runtime 文案与 badge 样式。
- [x] `web/src/shell/ShellClient.test.ts` / `WorkbenchShell.test.tsx`：transport 和 indicator 测试。

拔除沙盘：删除上述挂载点并把 `App` 退回 `fixtureTransport` 后，Web 前端 http-api runtime 能力会消失；fixture transport、Python bridge 和核心领域模块仍可独立工作。

## 3. 验收场景核对

- [x] S1 默认 fixture 模式可运行 Fixture flow。证据：Vitest、Playwright fixture smoke、`npm run test:e2e`。
- [x] S2 local-http env + endpoint 时使用 http-api transport。证据：`ShellClient.test.ts` runtime factory 测试。
- [x] S3 HTTP transport 成功 POST payload 并返回 normalized ShellResponse。证据：`posts shell payloads through http-api transport`。
- [x] S4 fetch 失败返回 `transport_unavailable` / `target=http-api`。证据：Vitest。
- [x] S5 HTTP 非 2xx 且 response 是 ShellResponse 时保留 bridge error code。证据：Vitest。
- [x] S6 invalid JSON / malformed response 返回 `transport_unavailable`。证据：Vitest。
- [x] S7 顶栏 runtime indicator 双语文案可见。证据：WorkbenchShell tests。
- [x] S8 fixture 默认模式 E2E 主链路不回退。证据：`npm run test:e2e` 2 passed。
- [x] S9 local-http 模式页面点击 Fixture Run 可显示真实 Python fixture project。证据：Playwright smoke，桌面 `/tmp/rxnflow-local-http-desktop.png`，窄屏 `/tmp/rxnflow-local-http-narrow.png`。
- [x] S10 `npm run test`、`npm run build`、`python3 -m unittest discover` 通过。

Browser 插件验证：按 Browser skill 打开 `http://127.0.0.1:5175/`，页面 title 为 `RxnFlow Workbench`；Browser screenshot CDP `Page.captureScreenshot` 超时，按前端 QA 流程 fallback 到本地 Playwright。Playwright 验证 desktop `1280x720` 和 narrow `390x840` 均无 console warning/error、无水平溢出。

## 4. 术语一致性

- `http-api`、`local-http`、`Runtime Fixture`、`Runtime Local HTTP` 与 design / roadmap 命名一致。
- `transport_unavailable` 只用于 transport 层失败；bridge/domain errors 如 `invalid_json`、`invalid_input` 保持原 code。
- 未新增与 `local-python-bridge` 混淆的前端实现命名。

## 5. 架构归并

- [x] `codestable/architecture/web-workbench.md`：已记录 configured runtime、httpTransport、runtime.ts、runtime indicator、默认 fixture 和 local-http env 切换。
- [x] `codestable/architecture/ARCHITECTURE.md`：已补 Shell Transport 与 Runtime Indicator 术语，并更新 Web Runtime Boundary 当前能力。
- [x] `codestable/architecture/core-platform.md`：已把 Web runtime boundary 更新为前端支持 fixture + http-api local bridge transport。

## 6. requirement 回写

- [x] `codestable/requirements/web-workbench-shell.md` 已更新：记录 runtime indicator、默认 fixture、local-http 调用本机 bridge，以及真实 file/project/export bridge 仍未落地的边界。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-web-runtime-bridge/rxnflow-web-runtime-bridge-items.yaml` 中 `web-http-shell-transport` 已标为 `done`。
- [x] `codestable/roadmap/rxnflow-web-runtime-bridge/rxnflow-web-runtime-bridge-roadmap.md` 第 5 节已同步状态和 feature 目录。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

候选：Web local-http 预览需要同时启动：

```bash
python3 -m rxnflow.local_bridge --host 127.0.0.1 --port 8765
cd web && VITE_RXNFLOW_SHELL_TRANSPORT=local-http VITE_RXNFLOW_SHELL_ENDPOINT=http://127.0.0.1:8765/api/shell npm run dev -- --port 5173
```

这会成为后续 bridge feature 常用验证步骤，但当前 `AGENTS.md` 已经很长，先作为候选记录；如果后续多次使用，再写入项目级规则更合适。

## 9. 遗留

- 下一步：`web-import-file-payload-bridge`，让 Import Inbox 在 local-http 模式下对真实浏览器文件做 parser preview。
- 已知限制：local-http 只打通 Shell command transport；Project Sidebar 仍保存 stub，真实 Project Content bridge 未接。
- 已知限制：Report Export 仍只处理 runtime artifacts，不写 Browser Project Repository `exports/...`。

