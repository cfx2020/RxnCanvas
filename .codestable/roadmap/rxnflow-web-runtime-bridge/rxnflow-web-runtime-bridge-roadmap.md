---
doc_type: roadmap
slug: rxnflow-web-runtime-bridge
status: completed
created: 2026-05-20
last_reviewed: 2026-05-21
tags: [rxnflow, web, runtime, bridge, platform-shell, local-first]
related_requirements: [platform-shell-entry, project-content-persistence, web-workbench-shell]
related_architecture: [ARCHITECTURE, core-platform, web-workbench]
---

# RxnFlow Web Runtime Bridge

## 1. 背景

RxnFlow Web Workbench MVP 已经完成浏览器工作台、项目侧边栏、导入收件箱、对象面板、图谱画布、能量面板、导出面板和 E2E QA，但当前业务命令仍只接 `in-process-test` fixture transport。它能验证 UI 编排，却不能让 Web 页面调用真实 Python `PlatformShellService`。

本 roadmap 的目标是把 Web 工作台从 fixture-only 推进到真实 runtime bridge：本地开发先通过一个薄 HTTP bridge 调用 Python Platform Shell；前端通过可替换 transport 切换 fixture / local HTTP；后续再把浏览器本地 bytes、真实 parser preview、Project Content save/open 和 export artifact 持久化逐步接上。该路线继续保持 local-first，不把云存储、账号或 Vercel server filesystem 当成项目 authority。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- Local HTTP Shell Bridge：提供本地开发用 HTTP endpoint，把 JSON-safe Shell payload 转给进程内 `PlatformShellService`，并保留跨请求 session。
- Web HTTP Transport：前端新增 `http-api` transport，可通过 Vite env 选择 fixture 或 local HTTP bridge。
- Import File Payload Bridge：明确浏览器 `File` / bytes 如何进入 parser preview，支持小文件 base64 payload 和 Browser Project Repository logical path 两类入口。
- Web Project Content Bridge：让 Web 工作台能把真实 Project Content snapshot 的打开 / 保存结果接入 Browser Project Repository 和本地 bridge。
- Export Artifact Persistence Bridge：让 Web report artifacts 可写入 browser-local `exports/...` 或通过 bundle 路径备份，并区分 runtime artifact 与长期 artifact record。
- Bridge QA：补 local bridge contract tests、Web transport tests 和真实浏览器 smoke，确认 fixture 与 local HTTP 两种模式不会互相污染。

### 明确不做

- 不在本 roadmap 中购买或绑定云存储、账号、权限、跨设备同步、多人协作或 CRDT。
- 不把 Vercel/serverless filesystem 当作长期项目存储；HTTP bridge 只是 command executor。
- 不重写 Python core、parser、registry、graph、energy 或 export 领域算法。
- 不在前端生成 PNG/CDXML/XLSX、重新计算能量或复制 ChemicalObject / ReactionGraph 真模型。
- 不实现完整生产安全边界、认证、公网部署或远程任意文件访问；local bridge 默认只面向本机开发。
- 不把大文件 chunking、OPFS payload store、Service Worker 或 Worker pool 一次性做完；这些按后续 feature 切片推进。

## 3. 模块拆分（概设）

```
RxnFlow Web Runtime Bridge
├── Local Shell Bridge Server：本地 HTTP 命令执行器，持有 PlatformShellService session
├── Web HTTP Shell Transport：前端可替换 transport，按环境切换 fixture / local HTTP
├── Web Import Payload Adapter：浏览器文件 bytes / logical path 到 import.preview 的桥接
├── Web Project Content Adapter：真实 Project Content open/save 与 browser-local repository 对接
├── Web Export Persistence Adapter：runtime artifact 到 browser-local exports / artifact index 的桥接
└── Bridge QA Harness：Python contract、Web transport、E2E smoke 和模式隔离验证
```

### Local Shell Bridge Server · 本地命令执行器

- **职责**：提供标准库优先的本地 HTTP server，接收 `POST /api/shell`，把 payload 转为 `handle_platform_payload` / `PlatformShellService.run`，同一进程保留 session，返回 JSON-safe `ShellResponse`。
- **承载的子 feature**：`local-http-shell-bridge`
- **触碰的现有代码 / 模块**：`rxnflow.platform`、新增 bridge 模块和 CLI/dev server 入口；不修改领域算法。

### Web HTTP Shell Transport · 前端 transport

- **职责**：在 `web/src/shell` 中实现 `http-api` transport，通过 `fetch` 调用 local bridge；`App` 根据 Vite env 选择 fixture 或 HTTP transport，并在 UI 中暴露 runtime mode。
- **承载的子 feature**：`web-http-shell-transport`
- **触碰的现有代码 / 模块**：`ShellClient`、`App`、Workbench runtime indicator、Web tests。

### Web Import Payload Adapter · 导入 payload 桥接

- **职责**：把浏览器选择的 Gaussian/ORCA/MAPLE/XYZ/extxyz 文件从 metadata-only 推进到真实 preview payload。第一版支持小文件 base64 inline payload；后续可把 raw bytes 先写入 Browser Project Repository，再传 logical `storagePath`。
- **承载的子 feature**：`web-import-file-payload-bridge`
- **触碰的现有代码 / 模块**：`import.preview` command args、bridge request body、Import Inbox state；不直接在 UI 调 parser。

### Web Project Content Adapter · 项目内容桥接

- **职责**：让 Web Project Sidebar 保存 / 打开真实 Project Content sections，保持 `ProjectSidebarState`、`WorkbenchDomainState` 和 core session state 分离。
- **承载的子 feature**：`web-project-content-bridge`
- **触碰的现有代码 / 模块**：Browser Project Repository、Project Content codecs、`project.open` / `project.save_content` projection。

### Web Export Persistence Adapter · 导出持久化桥接

- **职责**：把 `export.profile` 的 runtime artifacts 写入 browser-local `exports/...`，并在 UI 中区分 inline bytes、browser persisted object 和 core `ExportArtifactRecord`。
- **承载的子 feature**：`web-export-artifact-persistence`
- **触碰的现有代码 / 模块**：Report Export Panel、Browser Project Repository、Export Artifact index projection。

### Bridge QA Harness · 桥接验证

- **职责**：确保 bridge 模式能独立启动、返回 JSON-safe response、保留 session，Web fixture mode 与 local HTTP mode 可分别测试，浏览器交互无 console error 和布局回退。
- **承载的子 feature**：`web-runtime-bridge-qa`
- **触碰的现有代码 / 模块**：Python unittest、Web Vitest、Playwright config / E2E。

## 4. 模块间接口契约 / 共享协议（架构层详设）

本节是后续 feature design 的硬约束输入。要改字段或错误码时，先 update roadmap。

### 4.1 Local Shell HTTP API

**方向**：Web HTTP Shell Transport / local scripts → Local Shell Bridge Server → `PlatformShellService`
**形式**：本机 HTTP JSON API

**契约**：

```http
GET /health
Response 200:
{
  "ok": true,
  "service": "rxnflow-local-shell-bridge",
  "version": "local-dev-v1"
}

POST /api/shell
Content-Type: application/json
Request:
{
  "command": "fixture.run",
  "args": {},
  "requestId": "web-shell-1"
}
Response 200:
ShellResponse
```

**错误**：

- `400 invalid_json`：body 不是合法 JSON。
- `400 invalid_input`：payload 不是 object、command 缺失或 args 不是 object。
- `405 method_not_allowed`：endpoint method 不支持。
- `404 not_found`：未知 path。
- `500 bridge_internal_error`：bridge 未包装异常，必须返回 ShellResponse shape。

**约束**：

- Server 进程内只创建一个 `PlatformShellService(AppKernel())`，用于保留 shell session；重启后 session 丢失。
- 默认 host 为 `127.0.0.1`，默认端口为 `8765`；不默认监听公网。
- Response 必须始终是 JSON-safe ShellResponse 或 health object，不让 Python traceback 直接穿过 HTTP body。
- CORS 第一版只允许 localhost / 127.0.0.1 / file-safe dev origins；不得默认 `*` 加 credentials。

### 4.2 Web HTTP Shell Transport

**方向**：`ShellClient` → `ShellTransport`
**形式**：TypeScript transport implementation

**契约**：

```ts
type ShellTransportKind = "in-process-test" | "http-api"

type HttpShellTransportOptions = {
  endpoint: string
  timeoutMs?: number
}

function createHttpShellTransport(options: HttpShellTransportOptions): ShellTransport

type WebShellRuntimeMode = "fixture" | "local-http"
```

**Vite env**：

```ts
VITE_RXNFLOW_SHELL_TRANSPORT=fixture | local-http
VITE_RXNFLOW_SHELL_ENDPOINT=http://127.0.0.1:8765/api/shell
```

**约束**：

- 默认仍是 `fixture`，避免没有 bridge server 时 Web 首屏空白。
- `local-http` 模式下 fetch 失败要返回 normalized `ShellResponse`：`ok=false`、`error.code="transport_unavailable"`、`target="http-api"`。
- Transport 不解释 ChemicalObject、ReactionGraph、EnergyProfile 等领域 payload；只转发和规范化 ShellResponse。
- UI runtime indicator 必须能区分 fixture 和 local-http，避免用户把 fixture 数据误认为真实项目结果。

### 4.3 Import Preview Payload Extension

**方向**：Web Import Inbox → Shell Client → Bridge/Core import preview
**形式**：扩展 `import.preview` args，保持 JSON-safe

**契约**：

```ts
type ImportPreviewSource =
  | {
      kind: "path"
      source_path: string
    }
  | {
      kind: "inline_bytes"
      filename: string
      bytes_base64: string
      mime_type?: string | null
      expected_format?: string | null
    }
  | {
      kind: "browser_storage"
      project_ref: string
      storage_path: string
      expected_format?: string | null
    }

type ImportPreviewArgs = {
  session_id?: string
  project_path?: string
  source?: ImportPreviewSource
  source_path?: string
  source_paths?: string[]
  expected_format?: string
  strict?: boolean
}
```

**错误**：

- `invalid_input target=source`：source kind 不支持或缺字段。
- `payload_too_large target=bytes_base64`：inline bytes 超过 bridge 限制。
- `storage_object_missing target=storage_path`：browser storage logical path 不存在。

**约束**：

- `path` source 继续服务本地 Python path / CLI，不代表浏览器可直接读任意路径。
- `inline_bytes` 第一版只服务小文件 preview，bridge 应写入临时文件再调用 parser，完成后清理。
- `browser_storage` 只能由具备 repository adapter 的 runtime 处理；Python bridge 不得假设能直接访问浏览器 IndexedDB。
- Preview 成功仍只是待确认，不自动登记 ChemicalObject。

### 4.4 Project Content Bridge Protocol

**方向**：Project Sidebar / Workbench → Browser Project Repository / Local Bridge / Platform Shell
**形式**：project content bytes objects + shell open/save projection

**契约**：

```ts
type WebProjectContentOpenRequest = {
  projectRef: string
  loadContent: boolean
}

type WebProjectContentSaveRequest = {
  projectRef: string
  sessionId: string
  overwrite: true
}

type ShellProjectContentFile = {
  path: string
  bytes_base64: string
  checksum?: string | null
  metadata?: Record<string, unknown>
}
```

**约束**：

- Browser Project Repository 仍以 project-relative POSIX path 保存 bytes。
- `.rxnflow/manifest.json`、`.rxnflow/state/project-content.json` 和 section files 必须使用现有 Project Content schema；Web 不能把旧占位内容伪装成完整 snapshot。
- Web 显式 Open Bridge 时读取 Browser Project Repository content files，并调用 `project.open(content_files, load_content=true)`；Python bridge materialize 临时 project directory 后复用 ProjectContentStore。
- Web 显式 Save Bridge Session 时调用 `project.save_content(include_content_files=true)`，并把返回的 content files 覆盖写回 Browser Project Repository。
- `project.open` / `project.save_content` 的 session state 与 Browser Project Repository state 必须分离；打开 browser project 不自动创建 core session，除非明确调用 bridge/open flow。

### 4.5 Export Artifact Persistence Protocol

**方向**：Report Export Panel → Browser Project Repository / Export Artifact index
**形式**：runtime artifact bytes 到 `exports/...` object

**契约**：

```ts
type WebPersistArtifactRequest = {
  projectRef: string
  artifactId: string
  format: string
  bytesBase64: string
  path: `exports/${string}`
  metadata: Record<string, JsonValue>
}
```

**约束**：

- `path` 必须位于 `exports/` 下，沿用 Project Content Validation 对 artifact path / checksum 的限制。
- Runtime `ShellArtifact.bytes_base64` 不等于长期 `ExportArtifactRecord`；持久化成功后才显示 persisted。
- Web 不接受项目外绝对 path 作为长期 artifact path。

## 5. 子 feature 清单

1. **local-http-shell-bridge** — 新增本地 HTTP bridge server 和 CLI/dev 入口，`GET /health` 与 `POST /api/shell` 可调用真实 `PlatformShellService` 并保留 session。
   - 所属模块：Local Shell Bridge Server
   - 依赖：无
   - 状态：done
   - 对应 feature：`2026-05-20-local-http-shell-bridge`
   - 备注：最小闭环已完成；标准库本地 bridge 覆盖 fixture.run、workbench.snapshot、invalid JSON、unknown command、unknown path、method not allowed 和 bridge_internal_error。
2. **web-http-shell-transport** — 新增前端 `http-api` ShellTransport、Vite env 选择和 runtime indicator，Web 可在 fixture / local-http 之间切换。
   - 所属模块：Web HTTP Shell Transport
   - 依赖：`local-http-shell-bridge`
   - 状态：done
   - 对应 feature：`2026-05-20-web-http-shell-transport`
   - 备注：已落地 `createHttpShellTransport`、Vite env runtime factory 和顶栏 runtime indicator；默认仍为 fixture，local-http 模式已通过本地 bridge smoke。
3. **web-import-file-payload-bridge** — 扩展 `import.preview` 支持小文件 inline bytes preview，并让 Import Inbox 在 local-http 模式下可对真实文件做 preview。
   - 所属模块：Web Import Payload Adapter
   - 依赖：`web-http-shell-transport`
   - 状态：done
   - 对应 feature：`2026-05-20-web-import-file-payload-bridge`
   - 备注：已落地 Platform Shell `source/sources`、path / inline_bytes source、payload_too_large / storage_object_missing 错误语义和 Web local-http inline file preview；仍不做 chunking / OPFS / browser_storage adapter。
4. **web-project-content-bridge** — 将 Project Sidebar 推进到真实 Project Content sections 与 bridge session 的打开 / 保存协作。
   - 所属模块：Web Project Content Adapter
   - 依赖：`web-http-shell-transport`
   - 状态：done
   - 对应 feature：`2026-05-20-web-project-content-bridge`
   - 备注：已落地 Browser Project Content Files、`project.open(content_files)`、`project.save_content(include_content_files=true)`、显式 Open Bridge / Save Bridge Session 和桌面/窄屏 smoke；保持 ProjectSidebarState 与 WorkbenchDomainState 分离。
5. **web-export-artifact-persistence** — 把 Web 导出的 runtime artifacts 写入 browser-local `exports/...`，并显示 persisted state 与 artifact checksum。
   - 所属模块：Web Export Persistence Adapter
   - 依赖：`web-project-content-bridge`
   - 状态：done
   - 对应 feature：`2026-05-20-web-export-artifact-persistence`
   - 备注：已落地 `exports/{basename}.{format}` browser-local object、`export-artifacts-v1` index upsert、Project Content index checksum 刷新、persisted path/checksum UI 和 desktop/narrow QA；不新增 CDX/PDF/PPTX/SVG/CSV 等格式。
6. **web-runtime-bridge-qa** — 补 bridge 模式的 Python contract、Web transport 和 Playwright smoke，覆盖 fixture/local-http 模式隔离。
   - 所属模块：Bridge QA Harness
   - 依赖：`web-import-file-payload-bridge`, `web-project-content-bridge`, `web-export-artifact-persistence`
   - 状态：done
   - 对应 feature：`2026-05-20-web-runtime-bridge-qa`
   - 备注：已落地 fixture/local-http Playwright 模式隔离、bridge contract 与 http-api transport 回归、真实 local-http browser smoke；local-http E2E 可用 `RXNFLOW_E2E_PYTHON` 指定带导出依赖的 Python 解释器。

**最小闭环**：第 1 条 `local-http-shell-bridge` 做完后，本机可以启动 bridge server，通过 HTTP 调用真实 Python Platform Shell 的 `fixture.run`，再用返回的 `session_id` 调 `workbench.snapshot` 取回同一 session 的工作台投影。

## 6. 排期思路

先做 `local-http-shell-bridge`，因为当前最大结构性缺口是 Web 没有真实 runtime 可连；没有它，后续真实导入、保存和导出都只能继续堆 fixture。第二步接 `web-http-shell-transport`，把前端切换点固定下来。导入文件 payload、项目内容桥接和导出持久化彼此相关但可独立推进；最后用 `web-runtime-bridge-qa` 收束模式隔离和浏览器回归。

## 7. 观察项

- `rxnflow-web-runtime-bridge` 的 6 个子 feature 已全部 done，主文档已在 2026-05-21 标为 `completed`。
- `rxnflow-web-workbench-mvp` 已完成，但其主文档状态仍是 `active`；后续可另起 roadmap update 标记为 completed。
- 真实 Web 文件解析涉及 payload size、临时文件清理和 parser 依赖错误展示，可能需要后续补安全/性能决策文档。
- Vercel 部署方向仍需单独确认 serverless Python 依赖体积、cold start、fixture 排除和无状态 API 边界；本 roadmap 不把它作为第一阶段交付。
