# Web Runtime Boundary Decision 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-16
> 关联方案 doc：.codestable/features/2026-05-16-web-runtime-boundary-decision/web-runtime-boundary-decision-design.md

## 1. 接口契约核对

对照方案第 2.1 节，本 feature 没有新增 production runtime adapter、Web ShellClient 类型、HTTP route 或真实 Browser Project Repository。实际落地两类契约证据：

- `docs/dev/web-runtime-boundary.md`：开发者决策文档，记录 Web Runtime Boundary、Shell Transport、Browser Project Repository、Stateless Python API 和 Shell Payload POC。
- `tests/test_web_runtime_boundary.py`：POC 回归测试，直接调用既有 `rxnflow.platform.handle_platform_payload`。

接口示例逐项核对：

- [x] `handle_platform_payload({"command": "fixture.run", "args": {}})` → `ok=True`：`tests.test_web_runtime_boundary.WebRuntimeBoundaryTests.test_fixture_payload_returns_json_safe_shell_response` 覆盖，并断言 `data.command == "fixture.run"`、`profile.id == "profile-a-b-electronic"` 和 `session_id` 存在。
- [x] `handle_platform_payload({"command": "missing.command", "args": {}})` → `ok=False` / `invalid_input`：`test_unknown_command_returns_invalid_input_response` 覆盖，并断言 `error.target == "command"`。
- [x] 后续 TypeScript transport 形状：当前未落地代码，按方案只写入 `docs/dev/web-runtime-boundary.md` 的 Transport 模式章节，未创建真实 Web app 或 ShellClient 类型。

名词层“现状 → 变化”核对：

- [x] `ShellCommand` / `ShellResponse` / `handle_platform_payload` 继续复用既有 `rxnflow.platform`，本 feature 未改生产代码。
- [x] `BrowserLocalProjectStorageBackend` 仍是 Python 测试替身；文档明确未来 Browser Project Repository 不等同于该替身。
- [x] 新增 `docs/dev/web-runtime-boundary.md`，frontmatter 为 `doc_type: dev-guide`、`slug: web-runtime-boundary`、`component: web-runtime-boundary-decision`、`status: current`。
- [x] 新增 POC 测试覆盖成功、错误和文档边界，返回值都可 `json.dumps`。

流程图核对：方案中的 roadmap item → 核对现有 Platform Shell / browser storage → 核对官方 runtime 事实 → 写 dev doc → Shell payload POC → unittest → architecture / roadmap 回写，均已落地。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] Web runtime boundary 已记录：`docs/dev/web-runtime-boundary.md` “推荐边界”表格逐层说明 Browser UI、Shell Client、Browser Project Repository、Python core、Stateless Python API 和 Local Python Bridge。
- [x] local-first 边界已记录：文档明确项目内容第一版 authority 在浏览器本地仓储和 `.rxnflow.zip` bundle。
- [x] Python core 边界已记录：文档明确 Python core 继续负责 parser、registry、workspace、graph、energy 和 export。
- [x] HTTP/serverless 边界已记录：文档明确 Vercel/http-api 只能作为无状态 command executor 候选，不承担长期项目存储或跨请求 session authority。
- [x] 下一步 Web skeleton 建议已记录：文档建议 client-heavy React + TypeScript + Vite + npm，并说明若改用 Next.js 仍不能让 App Router / Server Components 成为领域状态 authority。

明确不做逐项核对：

- [x] 未创建 `package.json`、`web/`、`src/` 或真实前端 app 目录：`find . -maxdepth 3 \( -name package.json -o -name web -o -name src \) -print` 无输出。
- [x] 未新增 FastAPI、Flask、Django、云存储或账号依赖：`rg "^(from|import) (fastapi|flask|django|boto3|supabase|firebase|auth0|clerk|sqlalchemy)" -S .` 无输出。
- [x] 未新增真实 HTTP server / route：本次改动只有 CodeStable 文档、dev guide、测试和 architecture/roadmap 回写。
- [x] 未实现真实 IndexedDB / OPFS adapter：文档明确后续 feature 处理。
- [x] 未实现浏览器 File / Blob / ArrayBuffer 大文件桥接：文档明确独立 feature 处理。
- [x] 未修改 parser、registry、graph、energy、export 领域规则：`git diff --name-only -- rxnflow/parsers rxnflow/registry.py rxnflow/graph.py rxnflow/energy.py rxnflow/export.py rxnflow/platform.py rxnflow/cli.py` 无输出。

关键决策落地：

- [x] local-first Web Workbench：已写入 dev guide、ARCHITECTURE 和 core-platform。
- [x] Shell Client / Shell Payload 为 UI 与 core 的业务边界：已写入 dev guide 和 architecture。
- [x] Vercel/http-api 只做 stateless command executor：已写入 dev guide、ARCHITECTURE 和 core-platform。
- [x] React + TypeScript + Vite + npm 是下一步建议而非本 feature 实现：已写入 dev guide；未创建前端 scaffold。

跨层纪律核对：

- [x] JSON 边界：测试对成功和错误 response 都调用 `json.dumps`。
- [x] 状态边界：文档明确 Browser Project Repository / bundle 是项目内容 authority，`PlatformSession` 不是跨请求/跨设备持久化机制。
- [x] 错误边界：未知 command 返回 `invalid_input`，没有未包装异常穿过 payload boundary。
- [x] 文件边界：文档明确 raw output 大文件上传、chunking、OPFS object path 与 HTTP payload limit 另起 feature。
- [x] 架构边界：architecture 明确 Web UI 不直接复制 parser/registry/graph/energy/export 逻辑。

挂载点核对：

- [x] `docs/dev/web-runtime-boundary.md`：已新增，删除后 Web runtime boundary 开发者入口消失。
- [x] `tests/test_web_runtime_boundary.py`：已新增，删除后 payload POC 回归证据消失。
- [x] `.codestable/features/2026-05-16-web-runtime-boundary-decision/`：design/checklist/acceptance 记录工作流。
- [x] `.codestable/architecture/ARCHITECTURE.md` 与 `.codestable/architecture/core-platform.md`：已归并已落地边界现状。
- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/`：已回写 item 状态和主文档模块状态。

反向核查：grep `Web Runtime Boundary|Shell Transport|Browser Project Repository|Stateless Python API|local-first browser workbench|serverless filesystem|React + TypeScript + Vite`，命中只在 design、checklist、dev guide、测试和 architecture 中，符合挂载点范围。

拔除沙盘推演：删除 dev guide、POC 测试、feature docs、architecture/roadmap 回写后，本 feature 不会在生产代码中留下 runtime entrypoint、Web app、HTTP route 或 cloud dependency 残留。

## 3. 验收场景核对

- [x] S1 `docs/dev/web-runtime-boundary.md` 存在，并明确 Web MVP 推荐 runtime boundary。
  - 证据：dev guide “推荐边界”表格；`test_runtime_boundary_doc_records_local_first_stateless_contract`。
- [x] S2 文档说明浏览器本地仓储是第一版项目内容 authority，local-only 状态必须可见。
  - 证据：dev guide “浏览器本地持久化”章节。
- [x] S3 文档说明 Vercel/http-api 是无状态 command executor 候选，不作为长期项目存储或跨请求 session authority。
  - 证据：dev guide “推荐边界”“Transport 模式”“Vercel 与 Next 事实”章节。
- [x] S4 文档引用 Vercel Python Runtime、Vercel Functions、Next.js App Router 官方来源。
  - 证据：dev guide “参考”链接；POC 测试断言三条 URL 存在。
- [x] S5 文档明确下一步 Web app skeleton 的建议技术栈和可替代条件。
  - 证据：dev guide “下一步 Web Skeleton 建议”章节。
- [x] S6 POC 测试调用 `handle_platform_payload({"command": "fixture.run", "args": {}})`，返回 `ok=True`。
  - 证据：`tests.test_web_runtime_boundary`。
- [x] S7 POC 测试返回值可以被 `json.dumps`。
  - 证据：成功和错误测试都执行 `json.dumps(response)`。
- [x] S8 POC 测试未知 command 返回 `ok=False`，`error.code == "invalid_input"`。
  - 证据：`test_unknown_command_returns_invalid_input_response`。
- [x] S9 本 feature 没有创建 `package.json` 或真实前端 app 目录。
  - 证据：find 命令无输出。
- [x] S10 本 feature 没有引入 FastAPI、Flask、Django、Vercel SDK、云存储 SDK 或账号权限依赖。
  - 证据：import grep 无输出；涉及这些词的新增内容只在文档说明和反向范围中。
- [x] S11 本 feature 没有修改 parser、registry、graph、energy、export 的领域行为。
  - 证据：领域文件 `git diff --name-only` 无输出。
- [x] S12 `python3 -m unittest discover` 通过。
  - 证据：216 tests OK。

本 feature 没有前端视觉或画布交互改动，因此无需浏览器肉眼验证。

## 4. 术语一致性

术语与方案第 0 节一致：

- Web Runtime Boundary：dev guide 标题和 architecture 术语表均使用该名。
- Shell Transport：dev guide 中使用 `in-process-test`、`local-python-bridge`、`http-api` 三种规划值；architecture 已归并。
- Local-first Web Workbench：dev guide、测试和 architecture 均保留 local-first 语义。
- Browser Project Repository：文档和 architecture 均明确它是未来真实浏览器本地仓储，不等同于 Python 测试替身。
- Stateless Python API：文档和 architecture 均明确它不是长期存储/session authority。
- Runtime Boundary POC：测试只调用既有 `handle_platform_payload`。

防冲突核对通过：没有新增生产类型、函数或模块命名；新增术语只进入文档、测试名称和 architecture 现状说明。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已新增 Browser Project Repository、Web Runtime Boundary、Shell Transport、Stateless Python API 术语；Core Platform 模块索引补充 Web runtime boundary developer guide / payload POC；关键架构决定补充 local-first、stateless http-api 和 React + TypeScript + Vite 当前建议；约束补充 Web UI 不复制核心领域逻辑和第一版不绑定云存储。
- [x] `.codestable/architecture/core-platform.md`：tags 增加 `web-runtime-boundary`；Platform Shell 当前能力补充 dev guide 和 POC 测试；当前能力边界补充 Web runtime boundary 只确认职责分工，不提供真实 UI/route；Platform Shell 协议补充 ShellTransport / http-api 边界；约束补充 Browser Project Repository 未实现真实 adapter、serverless filesystem 不承担项目内容 authority、本 feature 不创建 Web app/HTTP route/cloud SDK。

归并后，未读过 design 的读者可以从 architecture 中知道：系统现在已经确认 Web MVP 的运行时边界，但还没有真实 Web app、HTTP route 或浏览器仓储 adapter。

## 6. Requirement 回写

本 feature 是技术边界决策、开发者文档和 POC 测试，不新增用户可见产品能力、导入格式、端侧 UI 或报告导出行为。因此不新增 requirement，也不回填方案 frontmatter 的 `requirement` 字段。

## 7. Roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-items.yaml`：`web-runtime-boundary-decision` 已从 `in-progress` 改为 `done`，feature 保持 `2026-05-16-web-runtime-boundary-decision`。
- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-roadmap.md`：Runtime Boundary 模块的子 feature 行已同步状态为 done。
- [x] roadmap items YAML 已通过 `validate-yaml.py --yaml-only`。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新工作流命令或环境坑。local-first、stateless http-api、Web UI 不复制核心领域逻辑等长期约束已经进入 architecture 和 dev guide；React + TypeScript + Vite + npm 是下一步 skeleton 的技术建议，适合后续按用户确认走 `cs-decide`，不直接写入 AGENTS.md。

## 9. 遗留

- 真实 Web app skeleton、TypeScript ShellClient 和 ShellTransport adapter 尚未实现，下一条 roadmap item 为 `web-app-shell-client`。
- 真实 Browser Project Repository 的 IndexedDB / OPFS adapter 尚未实现，后续由 `web-local-project-repository` 承担。
- 浏览器 File / Blob / ArrayBuffer 到 parser preview 的大文件桥接、chunking 和 HTTP payload limit 尚未设计。
- Vercel/http-api route、local-python-bridge 和部署配置尚未实现；当前只有边界决策和 POC。
- React + TypeScript + Vite + npm 建议尚未作为独立技术决定归档。
