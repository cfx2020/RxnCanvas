# local-http-shell-bridge 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-20
> 关联方案 doc：`.codestable/features/2026-05-20-local-http-shell-bridge/local-http-shell-bridge-design.md`

## 1. 接口契约核对

对照方案第 2.1 节，`rxnflow/local_bridge.py` 已新增 `LocalShellBridge`、`create_local_bridge_server`、`serve_local_bridge` 和 `python3 -m rxnflow.local_bridge` 入口。

- [x] `LocalShellBridge.health()`：返回 `ok=true`、`service=rxnflow-local-shell-bridge`、`version=local-dev-v1`。证据：`tests/test_local_http_shell_bridge.py::test_health_payload_is_json_safe`。
- [x] `GET /health`：返回 200 JSON health object。证据：`test_http_health_returns_json`。
- [x] `POST /api/shell`：接收 Shell payload 并返回 ShellResponse。证据：`test_shell_post_preserves_session_across_requests`。
- [x] CLI 模块入口：`python3 -m rxnflow.local_bridge --help` 可解析参数并展示 `--host` / `--port`。

流程图核对通过：HTTP request 进入 `LocalBridgeRequestHandler`，`/health` 走 `LocalShellBridge.health`，`/api/shell` 读取 JSON 后调用 `handle_platform_payload(payload, service=self.service)`，错误路径统一走 `bridge_error_response`。

## 2. 行为与决策核对

- [x] 需求摘要落地：同一个 server 进程持有一个 `PlatformShellService(AppKernel())`，因此 `fixture.run` 返回的 `session_id` 可继续用于 `workbench.snapshot`。证据：`test_shell_post_preserves_session_across_requests`。
- [x] 明确不做：没有新增 FastAPI、Flask、Django、Uvicorn、Vercel route 或第三方 server 依赖；实现只使用标准库 `http.server`。
- [x] 明确不做：没有修改 parser、registry、graph、energy、export 领域行为。
- [x] 明确不做：没有修改 Web 前端 transport 或 UI；下一条 `web-http-shell-transport` 才接前端。
- [x] 跨层纪律：Bridge 只处理 HTTP/JSON 包装，不解释 ChemicalObject、ReactionGraph、EnergyProfile 等领域 payload。
- [x] 错误语义：invalid JSON、unknown path、method not allowed、bridge internal exception 均返回 JSON ShellResponse shape，不返回 HTML error page。

挂载点核对：

- [x] `rxnflow/local_bridge.py`：本地 HTTP bridge 模块和 `python -m` 入口已落地。
- [x] `tests/test_local_http_shell_bridge.py`：HTTP bridge contract 和 session continuation 测试已落地。
- [x] `docs/dev/web-runtime-boundary.md`：已补启动命令、endpoint、session 边界和本机开发定位。
- [x] `.codestable/roadmap/rxnflow-web-runtime-bridge/*`：item 状态和主文档已回写。

拔除沙盘：删除 `rxnflow/local_bridge.py`、`tests/test_local_http_shell_bridge.py`、runtime boundary 文档补充和本 feature CodeStable 产物后，本地 HTTP bridge 能力会从系统中消失；核心 Platform Shell、CLI 和 Web fixture transport 不受影响。

## 3. 验收场景核对

- [x] S1 `LocalShellBridge.health()` 返回 bridge health。证据：单测通过。
- [x] S2 `GET /health` 返回 200 JSON。证据：单测通过。
- [x] S3 `POST /api/shell` + `fixture.run` 返回 `ok=True` 和 `session_id`。证据：单测通过。
- [x] S4 同一 server 的 `workbench.snapshot` 可使用上一步 session。证据：单测通过。
- [x] S5 unknown shell command 返回 `ok=False`、`invalid_input`、`target=command`。证据：单测通过。
- [x] S6 invalid JSON 返回 400、`invalid_json`。证据：单测通过。
- [x] S7 unknown path 返回 404、`not_found`。证据：单测通过。
- [x] S8 unsupported method 返回 405、`method_not_allowed`。证据：单测通过。
- [x] S9 internal bridge exception 返回 500、`bridge_internal_error`。证据：单测通过。
- [x] S10 全量 Python 单元测试通过。证据：`python3 -m unittest discover`，225 tests OK。

本 feature 不涉及前端视觉、画布交互或 Web UI 改动，因此没有浏览器肉眼验证要求。

## 4. 术语一致性

- `LocalShellBridge`、`Local HTTP Shell Bridge`、`Shell HTTP API` 与 design 第 0 节一致。
- `bridge_internal_error`、`invalid_json`、`not_found`、`method_not_allowed` 与 roadmap 第 4.1 节一致。
- 没有新增 `http-api` 前端 transport 命名；该术语仍保留给下一条 feature。

## 5. 架构归并

- [x] `.codestable/architecture/core-platform.md`：已记录 `rxnflow.local_bridge`、启动命令、`GET /health`、`POST /api/shell`、跨请求 session、错误语义和本机开发边界。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已补术语、Core Platform 索引、Platform Shell 现状和 Web Runtime Boundary 现状。
- [x] `.codestable/architecture/web-workbench.md`：已明确 Python 侧 bridge 已落地，但 Web 前端仍只接 fixture transport，`http-api` transport 未接入。
- [x] `docs/dev/web-runtime-boundary.md`：已补本地 bridge 启动方式、endpoint 和边界说明。

归并后，只看 architecture 的协作者可以判断：系统现在已有 Python 本地 HTTP shell bridge，但 Web 前端尚未通过 transport 使用它。

## 6. requirement 回写

`requirement=web-workbench-shell`。本 feature 是 Web runtime 基础能力，未改变用户视角的 Web 工作台行为；`web-workbench-shell.md` 不需要更新。下一条前端 transport 接入后，如页面出现 runtime mode 或真实 bridge 行为，再更新 requirement 更合适。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-runtime-bridge/rxnflow-web-runtime-bridge-items.yaml` 中 `local-http-shell-bridge` 已从 `in-progress` 改为 `done`，feature 指向 `2026-05-20-local-http-shell-bridge`。
- [x] `.codestable/roadmap/rxnflow-web-runtime-bridge/rxnflow-web-runtime-bridge-roadmap.md` 第 5 节已同步该条状态和备注。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

候选：后续需要手工启动本地 bridge 时，可用 `python3 -m rxnflow.local_bridge --host 127.0.0.1 --port 8765`。当前前端尚未接入该 bridge，先不写入 `AGENTS.md`，等 `web-http-shell-transport` 落地后再把完整预览步骤加入项目级规则更稳。

## 9. 遗留

- 下一步：`web-http-shell-transport`，在 `web/src/shell` 新增 `http-api` transport、Vite env 选择和 runtime indicator。
- 已知限制：local bridge 默认只面向本机开发；没有认证、TLS、公网部署、文件 payload bridge、项目内容 bridge 或云同步。
- 已知限制：bridge session 是进程内状态，server 重启后丢失；跨进程持久化仍依赖 Project Content Store。

