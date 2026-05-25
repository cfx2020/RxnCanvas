---
doc_type: dev-guide
slug: web-runtime-boundary
component: web-runtime-boundary-decision
status: current
summary: RxnFlow Web Workbench MVP 的浏览器、Shell Client、Python core 和 HTTP/serverless 边界
tags: [web, runtime-boundary, local-first, platform-shell]
last_reviewed: 2026-05-20
---

# Web Runtime Boundary

## 概述

RxnFlow Web Workbench MVP 采用 local-first browser workbench 边界：浏览器负责项目入口、UI 状态、本地项目内容和 artifact 下载；Python core 继续负责解析、登记、图谱编辑、能量曲线计算和报告导出；Web UI 只通过结构化 Shell Client 调用 core runtime。

这份文档只定义运行时职责分工。它不创建前端工程、不创建 HTTP route、不引入云存储，也不改变任何化学领域规则。

## 推荐边界

| 层 | 第一版职责 | 明确不承担 |
|---|---|---|
| Browser UI | 工作台布局、selection、viewport、面板开关、文件选择、下载入口 | parser、registry、reaction graph、energy、export 领域逻辑 |
| Shell Client | 发送 JSON-safe `ShellCommandPayload`，接收 `ShellResponse`，规范化 loading/error/warning/artifact 投影 | 直接 import Python core，或把 Python dataclass 映射成 UI 内部真相 |
| Browser Project Repository | 保存项目 refs、raw files、exports、bundle import/export 所需的本地对象 | 跨设备同步、账号、权限、冲突合并、多人协作 |
| Python core | 执行 parser、registry、workspace、graph、energy、export 的已存在核心能力 | 维护浏览器 UI 状态或云端项目数据库 |
| Stateless Python API | 在 Vercel/http-api 方向执行一次 command 或有限 parse/export/compute 请求 | 长期项目存储、跨请求 session authority、持久 filesystem |
| Local Python Bridge | 本地开发或桌面壳层调用 Python core 的候选通道 | Vercel 部署前提或浏览器本地仓储的替代物 |

核心原则：项目内容的第一版 authority 在浏览器本地仓储和 `.rxnflow.zip` bundle，不在 serverless filesystem。HTTP API 即使存在，也只能被视为 command executor。

## Transport 模式

后续 Web Shell Client 应按可替换 transport 设计：

```ts
type ShellTransportKind = "in-process-test" | "local-python-bridge" | "http-api"

type ShellTransport = {
  kind: ShellTransportKind
  run(payload: ShellCommandPayload): Promise<ShellResponse>
}
```

- `in-process-test`：只用于 Web 单元测试、Story 或 fixture，不进入生产。
- `local-python-bridge`：用于本地开发、桌面壳层或 CLI 驱动场景；它可以持有进程内 session，但不能代表浏览器项目仓储。
- `http-api`：用于 Vercel/serverless 方向的无状态调用；它不得承诺长期 project files、raw output files 或 session state。

Shell payload 必须是 JSON-safe 数据结构。`File`、`Blob`、`ArrayBuffer`、`Path`、Python dataclass 和 class instance 不能直接穿过 Shell Client 边界。大文件上传、chunking、OPFS object path 与 HTTP payload limit 需要独立 feature 设计。

## 浏览器本地持久化

Web MVP 第一版不购买云存储。项目持久化策略是：

1. 浏览器端保存项目引用和本地对象，后续真实实现可选 IndexedDB、OPFS 或等价浏览器能力。
2. 原始计算输出和 exports 由 Browser Project Repository 管理；UI 只展示 local-only 状态和 validation 结果。
3. `.rxnflow.zip` bundle 是备份、迁移和手动同步的第一版机制。
4. Python core 的 `PlatformSession` 仍是进程内概念，不是跨请求、跨标签页或跨设备持久化机制。

现有 `rxnflow.browser_storage.BrowserLocalProjectStorageBackend` 是 Python 测试替身，可作为协议参考，但不等同于未来 JS/TS adapter。

## Vercel 与 Next 事实

截至 2026-05-16 官方文档：

- Vercel Python Runtime 是 Vercel Functions 的 beta 能力，可运行 ASGI / WSGI Python 应用，并支持 FastAPI、Flask、Django 等框架预设。
- Vercel 通过 `pyproject.toml`、`.python-version` 或 `Pipfile.lock` 读取 Python 版本；当前可用版本包括 3.12、3.13、3.14。
- Python Vercel Functions 默认会包含构建期可达的项目文件，Python function 未压缩 bundle size 上限为 500 MB；测试数据、fixtures、静态大文件需要通过 `excludeFiles` 等机制排除。
- Next.js App Router 是基于文件系统的 React router，使用 Server Components、Suspense 和 Server Functions 等 React 能力。它是后续可选方案，不是 Web Workbench MVP 的必要前提。

参考：

- [Vercel Python Runtime](https://vercel.com/docs/functions/runtimes/python)
- [Vercel Functions](https://vercel.com/docs/functions)
- [Next.js App Router](https://nextjs.org/docs/app)

## 下一步 Web Skeleton 建议

下一条 `web-app-shell-client` feature 建议使用 client-heavy 的 React + TypeScript + Vite + npm app skeleton。理由是第一版工作台主要是本地交互、画布、表格、状态投影和 artifact 下载，不需要 SSR 才能成立。

该建议不阻止后续改用 Next.js，但如果改用 Next.js，仍需遵守这些边界：

- App Router / Server Components 不能成为领域状态 authority。
- UI 组件不能直接复制 parser、registry、graph、energy 或 export 逻辑。
- Shell Client DTO 仍是 UI 与 core runtime 的唯一业务调用边界。
- 长期项目内容仍由 Browser Project Repository 或后续云 adapter 管理。

## Shell Payload POC

当前 Python 侧已有 `rxnflow.platform.handle_platform_payload(payload)`，可作为 Web/desktop bridge 的框架无关 POC：

```python
from rxnflow.platform import handle_platform_payload

response = handle_platform_payload({"command": "fixture.run", "args": {}})
assert response["ok"] is True
assert response["data"]["command"] == "fixture.run"
```

错误路径应返回结构化 `ShellResponse`，而不是让未包装异常穿过边界：

```python
response = handle_platform_payload({"command": "missing.command", "args": {}})
assert response["ok"] is False
assert response["error"]["code"] == "invalid_input"
```

## Local HTTP Shell Bridge

当前已落地本地开发用 HTTP bridge，可用标准库启动，不引入 FastAPI、Flask、Django 或 Vercel route：

```bash
python3 -m rxnflow.local_bridge --host 127.0.0.1 --port 8765
```

可用 endpoint：

- `GET /health`：返回 bridge service、version 和 `ok=true`。
- `POST /api/shell`：接收 JSON-safe `ShellCommandPayload`，返回标准 `ShellResponse`。

同一个 bridge server 进程持有同一个 `PlatformShellService(AppKernel())`，因此 `fixture.run` 返回的 `session_id` 可在下一次 `workbench.snapshot` 中继续使用。server 重启后 session 丢失；这不是项目持久化机制，也不是云同步方案。

本地 bridge 默认只监听 `127.0.0.1`。它用于本机开发、后续 Web HTTP transport 和桌面壳层验证，不是生产公网服务。Bridge 层错误会包装成 JSON ShellResponse shape，例如 `invalid_json`、`not_found`、`method_not_allowed`；领域命令错误继续由 Platform Shell 返回 `invalid_input` 等 code。

## Import Preview Payload

`import.preview` 当前可接收三类 JSON-safe source：

- `path`：使用本机 `source_path`，继续服务 CLI、本地 Python path 和测试。
- `inline_bytes`：使用 `filename` 与 `bytes_base64` 传小文件。Platform Shell 会把 bytes 写入临时文件，复用现有 Import Workflow / Project Store / Parser Registry，返回前清理临时文件；项目内 raw file 副本仍由 Project Store 写入 `inputs/raw/`。session 没有 core `project_path` 时，Platform Shell 会创建进程内 Temporary Preview Project，让 local-http 页面能完成真实 parser preview。
- `browser_storage`：预留给后续 Browser Project Repository adapter；Python bridge 当前不读 IndexedDB/OPFS，返回 `storage_object_missing target=storage_path`。

Web Import Inbox 在 fixture runtime 下仍传 `source_paths`，在 local-http runtime 下优先把浏览器 `File` 编码为 `sources[].kind=inline_bytes`。inline payload 有大小限制；超限时 Web 直接显示 `payload_too_large target=bytes_base64`，不发 shell command。这条桥接只解决小文件 preview，不替代长期 raw storage、Browser Project Repository、Project Content 保存或大文件上传协议。

## Project Content Bridge

Browser Project Repository 保存在浏览器 IndexedDB 中，Python bridge 不能也不应该直接读取该仓储。因此 Web Project Content Bridge 使用显式 bytes payload，而不是把 Browser Project Ref 当成 Python filesystem path。

当前规则：

- 打开 browser project 只更新 `ProjectSidebarState` 和 shallow validation，不自动创建 `PlatformSession`。
- 用户点击 Open Bridge 时，Web 从 Browser Project Repository 读取 `.rxnflow/manifest.json` 与 `.rxnflow/state/*.json`，编码为 `project.open(content_files, load_content=true)` 的 JSON-safe base64 payload。
- Platform Shell 收到 `content_files` 后 materialize 到进程内临时 project directory，再复用既有 ProjectStore / ProjectContentStore 打开与校验流程。
- 用户点击 Save Bridge Session 时，Web 调用 `project.save_content(include_content_files=true)`；Platform Shell 写回临时 project directory，并返回 `.rxnflow/manifest.json` 与 `.rxnflow/state/*.json` bytes，Web 再覆盖写回 Browser Project Repository。
- `project.open(project_path)` 和 `project.save_content(session_id)` 的本地 filesystem 行为保持可用；`include_content_files=false` 时不返回 bytes payload。

该桥接不实现 `.rxnflow.zip` bundle IO、云存储、账号同步、OPFS/chunking、Worker、Service Worker 或 browser_storage import adapter。Web 只搬运 content files bytes 和 checksum，不在前端解析或重写 ChemicalObject、ReactionGraph、WorkspaceSnapshot、EnergyProfile 或 ExportArtifact 领域内容。

## Export Artifact Persistence

Report Export Panel 的 runtime artifact bytes 仍来自 `export.profile` 返回的 `ShellArtifact.bytes_base64`。当前 Web 只在 active browser project 存在时做 browser-local 持久化：

- Web 根据当前 basename 和 format 生成 `exports/{basename}.{format}`，当前支持 PNG/CDXML/XLSX/CSV。
- Web 把 inline bytes 写入 Browser Project Repository object，metadata 标记 `kind=export_artifact`、artifact id 和 format。
- Web upsert `.rxnflow/state/export-artifacts.json` 的 `export-artifacts-v1` records，并更新 `.rxnflow/state/project-content.json` 中该 section 的 checksum。
- Project Sidebar 随后重新做 shallow validation；这只验证 browser-local content files 可读和 checksum 对齐，不替代 Python ProjectContentValidator 深校验。

没有 active browser project、include bytes 关闭、artifact 缺少 inline bytes 或写入失败时，Web 仍保留 runtime artifact summary 和可用 download link；持久化失败会显示 warning，不会让前端重新生成 artifact bytes。

## 明确不做

- 不在本 feature 初始化 `package.json`、`web/`、Vite、Next.js、React、Tailwind 或 Playwright。
- 不新增 FastAPI、Flask、Django、Vercel route 或生产 HTTP server；当前只有本机开发用标准库 bridge。
- 不实现 OPFS adapter、Service Worker 或大文件 chunking；真实 IndexedDB-first Browser Project Repository 已在 Web Workbench 中承担 browser-local content files 和 export artifact bytes object 保存。
- 不实现浏览器 File / Blob / ArrayBuffer 到 parser 的大文件桥接、chunking、OPFS payload store 或 Worker pool。
- 不在前端生成 PNG/CDXML/XLSX/CSV bytes，不新增 CDX/PDF/PPTX/SVG 等导出格式。
- 不新增云存储、账号、权限、同步、队列或外部量化计算调度。
- 不修改 parser、registry、reaction graph、energy engine 或 report export 的领域行为。

## 相关文档

- `AGENTS.md`
- `codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-roadmap.md`
- `codestable/features/2026-05-16-web-runtime-boundary-decision/web-runtime-boundary-decision-design.md`
- `docs/dev/platform-project-open-save.md`
- `docs/dev/browser-local-storage-backend.md`
- `docs/dev/project-bundle-import-export.md`
