---
doc_type: roadmap
slug: rxnflow-web-project-portability
status: completed
created: 2026-05-22
last_reviewed: 2026-05-22
tags: [rxnflow, web, project-portability, browser-storage, project-bundle, raw-inputs, local-first]
related_requirements: [project-content-persistence, web-workbench-shell]
related_architecture: [ARCHITECTURE, core-platform, web-workbench]
---

# RxnFlow Web Project Portability

## 1. 背景

RxnFlow Web Workbench 当前已经有真实 Browser Project Repository、Project Content open/save bridge、Import Inbox 小文件 inline preview、Report Export browser-local persistence，以及核心层 `.rxnflow.zip` Project Bundle 服务。但 Web 侧项目交换仍缺一块关键拼图：

1. Project Sidebar 的 Project Bundle import/export 按钮仍是 disabled。
2. 浏览器选择的 raw output 文件可以进入 preview payload，但不会长期写入 browser-local `inputs/raw/...`。
3. Web 端导出的 artifacts 已经能写入 `exports/...`，但用户还不能把完整 browser-local project 打成 `.rxnflow.zip` 带走或从 `.rxnflow.zip` 恢复。
4. 当前 Project Content open/save bridge 只搬运 `.rxnflow/manifest.json` 和 `.rxnflow/state/*.json`，不负责 raw inputs 或 bundle 交换。

本 roadmap 的目标是把 Web 项目从"浏览器里可运行"推进到"用户可以自己备份、搬运、恢复"：让 browser-local project 能保存原始导入文件，能导出符合核心 Project Bundle 语义的 `.rxnflow.zip`，也能从安全 bundle 导入为新的 browser-local project。它继续保持 local-first，不引入云存储、账号、多人协作或 server filesystem authority。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- Browser raw input persistence：把浏览器选择的原始计算输出文件写入 Browser Project Repository 的 `inputs/raw/...`，并更新 `.rxnflow/manifest.json` raw resource。
- Browser project bundle export：从 Browser Project Repository 读取 `.rxnflow/`、`inputs/raw/` 和 `exports/` 下的 bytes，生成可下载 `.rxnflow.zip`。
- Browser project bundle import：从用户选择的 `.rxnflow.zip` 安全读取 entries，创建新的 browser-local project 并写入 bundle 内允许的项目文件。
- Web Project Sidebar integration：把 disabled bundle entry 变成可操作 import/export，展示 bundle summary、validation/import errors 和 local-only 风险。
- Bridge roundtrip consistency：确保 bundle import 后能 Open Bridge 恢复 Project Content，Save Bridge Session 后再 export bundle 不丢 graph/workspace/profile/export artifact index。
- Web QA 和指南：覆盖 fixture/local-http、桌面/窄屏、bundle export/import、raw inputs、exports 和错误 bundle 的真实浏览器回归，并更新用户/开发者文档。

### 明确不做

- 不购买或绑定云存储，不实现账号、权限、跨设备同步、冲突合并、CRDT 或多人协作。
- 不把 `.rxnflow.zip` 当作 live storage；bundle 只是用户手动备份/迁移格式。
- 不让 Web 前端调用 Python `ProjectBundleService` 读取浏览器 IndexedDB；Web bundle import/export 直接围绕 Browser Project Repository bytes 工作。
- 不在浏览器端重新解析 Gaussian/ORCA/MAPLE/XYZ/extxyz，不复制 Python parser、registry、graph、energy 或 export 领域逻辑。
- 不实现大文件 chunking、OPFS payload store、Worker pool、Service Worker、后台同步或可靠持久化权限申请；第一版继续使用 IndexedDB-first repository。
- 不把 raw input persistence 自动等同于 import confirmation；preview/register 仍走 Shell command response。
- 不实现 bundle 覆盖、合并、自动冲突解决或增量 patch；Web import 第一版总是创建新的 browser-local project。
- 不改变核心 `.rxnflow.zip` 允许根目录、Project Content schema、Project Manifest schema 或 Python CLI bundle 语义。

## 3. 模块拆分（概设）

```
RxnFlow Web Project Portability
├── Browser Raw Input Store：浏览器 raw 文件写入 inputs/raw/ 与 manifest resource
├── Browser Bundle Archive Adapter：Web 侧 zip 读写、entry 安全校验和 bundle summary
├── Project Sidebar Bundle UI：import/export 操作入口、状态摘要和错误展示
├── Bundle Import Repository Writer：bundle entries 到新 Browser Project Repository project 的写入流程
├── Bridge Roundtrip Consistency：bundle import/export 与 Open Bridge / Save Bridge Session 的一致性
└── Portability QA & Guides：真实浏览器回归、错误样例和用户/开发者指南
```

### Browser Raw Input Store · 浏览器 raw 文件持久化

- **职责**：把用户在 Import Inbox 选择的 `File` 写入 active browser project 的 `inputs/raw/{sha12}-{safeName}`，生成与 Python `ProjectStore.add_raw_file` 对齐的 raw resource id/path/checksum，并合并进 `.rxnflow/manifest.json`。
- **承载的子 feature**：`web-raw-input-persistence`
- **触碰的现有代码 / 模块**：`web/src/app/importInboxState.ts`、`ProjectSidebar` / `WorkbenchShell` import flow、Browser Project Repository、`projectContentBridge.ts`。
- **不负责**：不解析文件、不确认登记对象、不解决大文件 chunking。

### Browser Bundle Archive Adapter · Web zip 读写适配

- **职责**：在 Web 端提供 project bundle archive helper，读取 / 写入 `.rxnflow.zip`，复用核心 Project Bundle 的 allowed roots、安全路径、single-root 和 summary 语义。
- **承载的子 feature**：`web-project-bundle-archive-adapter`
- **触碰的现有代码 / 模块**：新增 Web bundle helper、Web tests、可能新增小型 zip 依赖。
- **不负责**：不调用 Python `ProjectBundleService`，不做 ProjectContentValidator 深校验。

### Project Sidebar Bundle UI · 项目包入口

- **职责**：把 Project Sidebar 的 Import Bundle / Export Bundle disabled entry 变成可操作控件，提供 file picker、download、bundle summary、busy/error/success 状态和 i18n 文案。
- **承载的子 feature**：`web-project-bundle-sidebar-ui`
- **触碰的现有代码 / 模块**：`ProjectSidebar.tsx`、`WorkbenchShell.tsx`、i18n、CSS、component tests。
- **不负责**：不改变三栏主布局，不实现云同步。

### Bundle Import Repository Writer · bundle 导入写入

- **职责**：把安全 bundle entries 写入一个新的 Browser Project Repository project，保留 `.rxnflow/`、`inputs/raw/` 和 `exports/` bytes 与 metadata，并对 Project Content 做 shallow validation。
- **承载的子 feature**：`web-project-bundle-import`
- **触碰的现有代码 / 模块**：Browser Project Repository actions、Project Content Bridge、Project Sidebar state。
- **不负责**：不覆盖已有 browser project，不合并已有对象，不自动打开 bridge session。

### Bridge Roundtrip Consistency · 桥接一致性

- **职责**：确保从 bundle 导入的 browser-local project 可以 Open Bridge 恢复工作台状态；Save Bridge Session 后再导出 bundle 时能包含最新 `.rxnflow/state/*.json`、`inputs/raw/...` 和 `exports/...`。
- **承载的子 feature**：`web-project-portability-roundtrip`
- **触碰的现有代码 / 模块**：WorkbenchShell bridge flow、Project Sidebar validation/status、E2E harness。
- **不负责**：不自动保存所有 UI-only state，不引入 autosave。

### Portability QA & Guides · 回归与指南

- **职责**：补真实浏览器和文档闭环，让用户知道 Web 本地项目如何备份/恢复、bundle 与云同步的边界、raw inputs 和 exports 会被带走哪些内容。
- **承载的子 feature**：`web-project-portability-qa-guides`
- **触碰的现有代码 / 模块**：Playwright E2E、docs/dev、docs/user、architecture/requirements acceptance 回写。

## 4. 模块间接口契约 / 共享协议（架构层详设）

本节是后续 feature design 的硬约束输入。字段或错误码需要改变时，先 update roadmap。

### 4.1 Browser Raw Input Object

**方向**：Import Inbox / WorkbenchShell → Browser Project Repository → Project Manifest
**形式**：browser-local bytes object + manifest resource

**契约**：

```ts
type BrowserRawInputObject = {
  path: `inputs/raw/${string}`
  bytes: Uint8Array
  checksum: `sha256:${string}`
  metadata: {
    kind: "raw_file"
    source_name: string
    byte_size: number
    mime_type?: string | null
    last_modified?: number | null
  }
}

type BrowserRawResource = {
  id: `raw-${string}`
  kind: "raw_file"
  path: `inputs/raw/${string}`
  checksum: `sha256:${string}`
  metadata: {
    source_name: string
    byte_size: number
    mime_type?: string | null
    last_modified?: number | null
  }
}
```

**约束**：

- `id` 必须使用 checksum 去掉 `sha256:` 后前 12 位：`raw-{sha12}`。
- `path` 必须与 Python `ProjectStore.add_raw_file` 的规则兼容：`inputs/raw/{sha12}-{safeBaseName}`。
- 同 checksum raw file 幂等：如果 manifest 已有同 checksum `raw_file` resource，不重复写 resource；如果 object bytes 已存在，可复用。
- Web 只能写入 active browser project；没有 active project 时仍可 inline preview，但不能承诺 raw persistence。
- Manifest 更新必须保留已有 resources，不删除或重排无关 resource；JSON 输出保持 deterministic。
- raw object 写入失败不得伪造 manifest resource；manifest 更新失败时 UI 需要显示 repository error。

### 4.2 Browser Project Bundle Shape

**方向**：Browser Project Repository ↔ Web Bundle Archive Adapter ↔ 用户下载/上传文件
**形式**：`.rxnflow.zip` zip archive

**契约**：

```text
<project-name>.rxnflow.zip
└── <bundle-root>/
    ├── .rxnflow/
    │   ├── manifest.json
    │   └── state/
    ├── inputs/
    │   └── raw/
    └── exports/
```

```ts
type BrowserProjectBundleEntry = {
  name: string
  projectRelativePath: string
  bytes: Uint8Array
  byteSize: number
  checksum: `sha256:${string}`
}

type BrowserProjectBundleSummary = {
  bundleName: string
  rootName: string
  projectId?: string | null
  projectName?: string | null
  fileCount: number
  byteSize: number
  checksum: `sha256:${string}`
  validation: {
    state: "not_checked" | "valid" | "warning" | "error"
    issueCount: number
  }
}
```

**允许根目录**：

- `.rxnflow/**`
- `inputs/raw/**`
- `exports/**`

**安全边界**：

- bundle 必须恰好一个 top-level root。
- 必须包含 `<root>/.rxnflow/manifest.json`。
- entry path 必须 POSIX relative、normalized，禁止绝对路径、反斜杠、空段、`.`、`..`、symlink 和 `__MACOSX`。
- `inputs/` 下只允许 `inputs/raw/...`。
- Export 时跳过 `.DS_Store` 和 `__MACOSX`。
- Import 时遇到不允许 entry 直接失败，不做部分导入。

### 4.3 Browser Bundle Export Flow

**方向**：Project Sidebar → Browser Project Repository → Bundle Archive Adapter → browser download
**形式**：UI command + generated Blob

**契约**：

```ts
type ExportBrowserBundleRequest = {
  projectRef: string
  rootName?: string
  includePrefixes: [".rxnflow", "inputs/raw", "exports"]
}

type ExportBrowserBundleResult = {
  ok: true
  summary: BrowserProjectBundleSummary
  blob: Blob
  fileName: `${string}.rxnflow.zip`
} | {
  ok: false
  error: {
    code:
      | "active_project_required"
      | "project_content_missing"
      | "bundle_invalid"
      | "storage_failed"
      | "zip_failed"
    message: string
    target?: string | null
  }
}
```

**约束**：

- Export 只读取 Browser Project Repository 当前 bytes；如果 bridge session 有未保存改动，UI 只能提示用户先 Save Bridge Session，不得偷偷调用 save。
- 至少需要 `.rxnflow/manifest.json`；没有 active project 或缺 manifest 时 export 失败。
- 生成的 zip entry 必须以 bundle root 包裹，不能把 repository path 直接放在 zip 顶层。
- `exports/...` 只包含 repository 中已有 bytes；没有 inline bytes 的 runtime artifact 不会凭空进入 bundle。
- Download link 的 URL 必须在完成后可 revoke，避免泄漏 object URL。

### 4.4 Browser Bundle Import Flow

**方向**：Project Sidebar file input → Bundle Archive Adapter → Browser Project Repository
**形式**：用户选择 `.rxnflow.zip` 后创建新 browser-local project

**契约**：

```ts
type ImportBrowserBundleRequest = {
  file: File
  conflictPolicy: "create_new_project"
}

type ImportBrowserBundleResult = {
  ok: true
  project: BrowserProjectRef
  summary: BrowserProjectBundleSummary
  receipts: BrowserWriteReceipt[]
} | {
  ok: false
  error: {
    code:
      | "invalid_bundle"
      | "unsupported_bundle"
      | "storage_failed"
      | "zip_failed"
    message: string
    target?: string | null
  }
}
```

**约束**：

- Web import 第一版总是创建新的 browser-local project；不覆盖、不合并、不写入当前 active project。
- Project name 默认来自 manifest `name`，缺失时用 bundle root；Browser Project Repository 的 `projectRef` 仍由 repository 生成。
- 写入顺序应先解析和校验完整 archive，再创建 project / 写 objects；如果写入中失败，UI 必须显示 error 和可能的部分写入风险。
- Import 成功后 Project Sidebar active project 指向新 project，并执行 shallow validation；不自动 Open Bridge。
- `.rxnflow/state/project-content.json` 的深校验仍由后续 Open Bridge / Python ProjectContentValidator 负责。

### 4.5 Import Preview 与 Raw Persistence 的关系

**方向**：Import Inbox → raw persistence helper → `import.preview`
**形式**：同一次用户操作中的两个不同职责

**契约**：

```ts
type ImportPreviewStorageMode =
  | "inline_preview_only"
  | "persist_raw_then_inline_preview"

type ImportPreviewPreparedFile = {
  name: string
  byteSize: number
  sourceKind: "inline_bytes" | "path"
  rawResource?: BrowserRawResource | null
}
```

**约束**：

- local-http 第一版仍用 `inline_bytes` 把小文件交给 parser preview；raw persistence 是 browser-local backup/anchor，不代表 Python bridge 直接读取 IndexedDB。
- fixture mode 可以记录 raw persistence UI 状态，但 fixture parser result 仍来自 fixture transport。
- 如果 raw persistence 成功而 preview 失败，Import Inbox 应展示 preview error，同时 raw object 可以保留在 project 中；用户后续可清理项目文件的能力另起 feature。
- 如果 preview 成功而 raw persistence 不可用，UI 必须明确 raw file 未持久化到 browser project。

### 4.6 Bridge Roundtrip Contract

**方向**：Bundle Import / Project Sidebar / Local HTTP bridge / WorkbenchShell
**形式**：浏览器 repository state 与 core session state 的显式同步

**契约**：

```ts
type WebProjectPortabilityRoundtrip =
  | "import_bundle"
  | "open_bridge"
  | "edit_workspace_or_export"
  | "save_bridge_session"
  | "export_bundle"
```

**约束**：

- Bundle import 只恢复 Browser Project Repository bytes。
- Open Bridge 读取 `.rxnflow/manifest.json` 与 `.rxnflow/state/*.json`，调用 `project.open(content_files, load_content=true)` 恢复 core session。
- Save Bridge Session 调用 `project.save_content(include_content_files=true)`，只覆盖 `.rxnflow/manifest.json` 与 `.rxnflow/state/*.json`；它不得删除 `inputs/raw/...` 或 `exports/...` repository objects。
- Export Bundle 读取 repository 当前 bytes；因此需要用户显式 Save Bridge Session 后才能把 session 中最新 graph/profile/export index 写入 zip。

## 5. 子 feature 拆解清单

1. **web-raw-input-persistence** — 保存浏览器选择的 raw output 文件到 active browser project `inputs/raw/...`，并更新 manifest raw resource。
   - 所属模块：Browser Raw Input Store
   - 依赖：无
   - 状态：done
   - 最小闭环：是。完成后用户选择的小文件不再只是 preview payload，而是能在 browser-local project 中留下 raw input anchor。

2. **web-project-bundle-archive-adapter** — 建立 Web 侧 `.rxnflow.zip` archive helper，覆盖 allowed roots、entry 安全校验、summary 和 zip read/write tests。
   - 所属模块：Browser Bundle Archive Adapter
   - 依赖：无
   - 状态：done。已采用 `fflate` 作为 Web zip dependency boundary；当前只提供 helper，不启用 Project Sidebar import/export UI，也不写 Browser Project Repository。

3. **web-project-bundle-export** — 启用 Project Sidebar Export Bundle，把 active browser project 下载为 `.rxnflow.zip`，包含 `.rxnflow/`、`inputs/raw/` 和 `exports/`。
   - 所属模块：Project Sidebar Bundle UI / Browser Bundle Archive Adapter
   - 依赖：`web-project-bundle-archive-adapter`
   - 状态：done。Export Bundle 读取 Browser Project Repository 当前 `.rxnflow/`、`inputs/raw/` 和 `exports/` bytes，通过 Web archive adapter 生成 `.rxnflow.zip` Blob 并触发下载；不会自动 Save Bridge Session，不生成缺失 artifact bytes。

4. **web-project-bundle-import** — 启用 Project Sidebar Import Bundle，从安全 `.rxnflow.zip` 创建新的 browser-local project 并写入 bundle entries。
   - 所属模块：Bundle Import Repository Writer / Project Sidebar Bundle UI
   - 依赖：`web-project-bundle-archive-adapter`
   - 状态：done。Import Bundle 读取用户选择的 `.rxnflow.zip`，通过 Web archive adapter 校验 safe entries 后创建新的 browser-local project 并写入 `.rxnflow/`、`inputs/raw/` 和 `exports/` bytes；不会覆盖当前项目，不自动 Open Bridge，写入中断会显示 partial import risk。

5. **web-project-portability-roundtrip** — 验证 bundle import 后 Open Bridge、编辑/导出、Save Bridge Session、Export Bundle 的 repository/core session 同步口径。
   - 所属模块：Bridge Roundtrip Consistency
   - 依赖：`web-raw-input-persistence`、`web-project-bundle-export`、`web-project-bundle-import`
   - 状态：done。已用 WorkbenchShell component test 和 local-http Playwright smoke 验证 bundle 导入后需显式 Open Bridge 才恢复 core session，Save Bridge Session 后 Project Content state 写回 repository 且 `inputs/raw/...`、`exports/...` 保留，随后 Export Bundle 生成的 zip 可重新导入并显式 Open Bridge。

6. **web-project-portability-qa-guides** — 补桌面/窄屏/local-http E2E、错误 bundle 样例和 Web 项目备份/恢复用户指南。
   - 所属模块：Portability QA & Guides
   - 依赖：`web-project-portability-roundtrip`
   - 状态：done。已补默认 fixture desktop bundle backup/restore、narrow invalid bundle import、local-http roundtrip 证据，并更新 Web/CLI 用户指南与开发者 QA/边界指南。

## 6. 排期与推进建议

- 先做 `web-raw-input-persistence`，让用户选择的原始输出文件真正进入 browser-local project。
- 再做 `web-project-bundle-archive-adapter`，把 zip 安全协议和 summary 固定住，避免 UI feature 各自处理 zip。
- `web-project-bundle-export` 和 `web-project-bundle-import` 已完成，用户已经能手动备份并恢复 browser-local project。
- `web-project-portability-roundtrip` 已完成，用真实流程连接 bundle 与 local-http bridge，检查了 session 保存口径。
- `web-project-portability-qa-guides` 已完成，真实浏览器回归、错误 bundle 样例和用户/开发者文档已收口。本 roadmap 的子 feature 均已 done。

## 7. 观察项

- Web bundle archive adapter 已选择 `fflate` 并隔离在 `web/src/app/projectBundleArchive.ts`；后续 Sidebar export/import feature 不应直接散落调用 zip 依赖。
- IndexedDB 对大 raw output 的容量和持久性仍不是可靠备份；本 roadmap 不做 OPFS/chunking，但后续可能需要单独 roadmap。
- Project Sidebar 当前没有精确 dirty tracking；当前采用 bridge open 时保守提示和用户指南说明导出前先 Save Bridge Session。后续若要自动判断未保存改动，应另起 dirty tracking / autosave feature。
- Browser import 第一版如果写入中途失败，IndexedDB 没有跨 object transaction API；当前 UI 和指南暴露 partial import risk，后续如需 rollback/transaction 另起 repository transaction feature。
- Core ProjectBundleService 已有更深的 Python validation；Web import 当前只做 archive 安全和 shallow content validation，深校验仍通过显式 Open Bridge / core ProjectContentValidator 暴露。
