---
doc_type: roadmap
slug: rxnflow-web-workbench-mvp
status: active
created: 2026-05-16
last_reviewed: 2026-05-16
tags: [rxnflow, web, workbench, frontend, local-first, graph-editor]
related_requirements: [platform-shell-entry, project-content-persistence, web-workbench-shell]
related_architecture: [ARCHITECTURE, core-platform, web-workbench]
---

# RxnFlow Web Workbench MVP

## 1. 背景

RxnFlow 当前已经完成核心平台、项目内容持久化、项目 bundle、浏览器本地存储协议测试替身、parser fixture corpus、Import Workflow、Graph Editor Workspace、Energy Engine 和 Report Export 基线。系统已经能以 headless 方式跑通导入、登记、图谱编辑、能量计算和导出，但还没有真实 Web 工作台。

本 roadmap 的目标是把这些核心能力接成一个 Web 版工作台 MVP：用户打开后首先看到可操作的项目工作区，而不是营销页；agent 和 UI 都通过结构化 shell / adapter 边界操作项目。它面向 Vercel / browser local-first 方向规划，但第一版不购买云存储，不实现账号系统，也不把核心领域逻辑复制到前端组件里。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- Web 运行时边界：明确浏览器 UI、Shell Client、Python core / bridge / HTTP adapter 之间的职责。
- Web app skeleton：项目工作台布局、路由入口、基础状态容器、命令调用和错误/warning 投影。
- Browser local project repository：把已有 Project Content / Browser Local Storage Backend 协议映射到真实浏览器 IndexedDB / OPFS 或等价本地存储。
- Project sidebar：新建、打开、保存、bundle import/export 和 local-only 状态提示。
- Import inbox：选择/批量导入原始计算输出、parser preview、warnings/errors 展示和确认登记。
- Object registry panel：已登记 ChemicalObject 列表、详情、energy keys、provenance、warnings 和校正项入口。
- Graph canvas MVP：对象面板拖入/放入画布、节点连线、设置 reaction path、network preview 和 selection/viewport。
- Energy profile panel：选择 path，计算相对能量，显示表格和基础曲线。
- Report export panel：生成 PNG、CDXML、XLSX，并展示/下载 artifacts。
- 浏览器验证：桌面和窄屏布局、画布、表格、曲线和导出预览的 Playwright / browser QA。

### 明确不做

- 不实现账号、权限、团队协作、云同步、冲突合并、CRDT 或实时多人编辑。
- 不在本 roadmap 中购买或绑定 Supabase、S3、R2、Vercel Blob 等云存储。
- 不实现外部量化计算任务调度、远程作业提交或队列管理。
- 不把 Python 核心领域模型重写进 UI 组件；前端只持有投影和 UI state。
- 不做完整 ChemDraw 编辑器；CDXML 只作为导出 artifact。
- 不一次性打包 macOS app、Windows exe 或 Linux installer；这些端侧壳层后续共享 Shell Client / command contract。
- 不把当前 synthetic/reference-only parser corpus 描述成真实 Gaussian/ORCA/MAPLE 版本完整支持。

## 3. 模块拆分（概设）

```
RxnFlow Web Workbench MVP
├── Runtime Boundary：Web UI 与 Python core / bridge / serverless adapter 的运行时分工
├── Shell Client：前端统一命令客户端、错误/warning/artifact 投影和请求状态
├── Browser Project Repository：IndexedDB / OPFS 项目内容、raw files、exports 和 bundle IO
├── Workbench State：项目/session/workspace/import/profile/artifact 投影与 UI-only state
├── Project Sidebar：项目列表、open/save、bundle import/export 和 local-only 标识
├── Import Inbox：文件选择、parser preview、确认登记和失败项展示
├── Object Registry Panel：ChemicalObject 列表、详情、校正项入口
├── Graph Canvas：节点、边、路径、selection、viewport 和 network preview
├── Energy Profile Panel：路径能量表、曲线和 missing/warning 展示
├── Report Export Panel：PNG / CDXML / XLSX artifact 生成、下载和索引
└── Web QA Harness：浏览器交互、视觉布局和核心流程回归
```

### Runtime Boundary · Web 运行时边界

- **职责**：决定 Web MVP 如何调用 Python core：本地开发可用 in-process / subprocess bridge，Vercel 方向可用 HTTP/serverless adapter，纯浏览器 local-first 则需要 browser project repository 持有项目内容。该模块只定义运行时边界和最小 POC，不替 UI 选择业务状态结构。
- **承载的子 feature**：`web-runtime-boundary-decision`（状态：done，feature：`2026-05-16-web-runtime-boundary-decision`）
- **触碰的现有代码 / 模块**：`rxnflow.platform`、可能新增 web adapter / dev bridge；不修改 parser、registry、graph、energy、export 的领域规则。

### Shell Client · 前端命令客户端

- **职责**：提供统一 `run(command, args)` 调用、请求状态、错误/warning 规范化、artifact 投影和 typed DTO。UI 不直接拼核心服务调用。
- **承载的子 feature**：`web-app-shell-client`（状态：done，feature：`2026-05-16-web-app-shell-client`）
- **触碰的现有代码 / 模块**：新增 Web app shell / tests；复用 `ShellCommand` / `ShellResponse` 语义。

### Browser Project Repository · 浏览器本地项目仓储

- **职责**：把 Project Content logical path、raw file bytes、exports 和 project refs 映射到真实浏览器本地存储。它必须明确 local-only，不承诺跨设备同步。
- **承载的子 feature**：`web-local-project-repository`
- **触碰的现有代码 / 模块**：Web storage adapter；参考 `rxnflow.browser_storage` 和 `rxnflow.content_store` 协议。

### Workbench State · 工作台状态投影

- **职责**：把 ShellResponse 中的 project/session/import/workspace/profile/artifact 投影整理成 UI 可扫描的 state，并把 selection、panel open state、hover、viewport 等 UI-only 状态与核心领域 state 分开。
- **承载的子 feature**：`web-workbench-state-projections`（状态：done，feature：`2026-05-16-web-workbench-state-projections`）
- **触碰的现有代码 / 模块**：可能新增 Platform Shell read-only projection command；前端状态容器。

### Project Sidebar · 项目侧边栏

- **职责**：管理项目入口：新建项目、打开本地浏览器项目、保存、导入/导出 `.rxnflow.zip`、展示 validation/local-only 状态。
- **承载的子 feature**：`web-project-sidebar`
- **触碰的现有代码 / 模块**：Shell Client、Browser Project Repository、Project Bundle adapter。

### Import Inbox · 导入收件箱

- **职责**：接收用户选择的 Gaussian/ORCA/MAPLE/XYZ/extxyz 文件，显示 parse preview、warnings/errors、object_count 和确认登记动作。
- **承载的子 feature**：`web-import-inbox`
- **触碰的现有代码 / 模块**：`import.preview`、`import.register_all` 或后续 stateless preview bridge；不直接调用 parser plugin。

### Object Registry Panel · 对象登记面板

- **职责**：显示已登记 ChemicalObject、来源、charge/spin、method、energy keys、thermochemistry keys、warnings 和校正项入口。
- **承载的子 feature**：`web-object-registry-panel`
- **触碰的现有代码 / 模块**：Workbench State projection、ChemicalObject projection；校正项写入继续走核心 Shell/Registry 边界。

### Graph Canvas · 图谱画布

- **职责**：提供可编辑 reaction graph canvas MVP：从 Object Palette 添加节点、连线、设置 active path、显示 network preview、selection 和 viewport。
- **承载的子 feature**：`web-graph-canvas-mvp`
- **触碰的现有代码 / 模块**：`workspace.open`、`workspace.add_node`、`workspace.connect`、`workspace.set_path`。

### Energy Profile Panel · 能量面板

- **职责**：基于 active path 调用 `energy.compute`，展示 EnergyProfile points、missing reason、warnings 和基础曲线。
- **承载的子 feature**：`web-energy-profile-panel`
- **触碰的现有代码 / 模块**：`energy.compute`、EnergyProfile projection；不改 Energy Engine 算法。

### Report Export Panel · 导出面板

- **职责**：调用 `export.profile` 生成 PNG、CDXML 和 XLSX artifacts，提供下载和项目 artifact index 展示。
- **承载的子 feature**：`web-report-export-panel`
- **触碰的现有代码 / 模块**：`export.profile`、ShellArtifact、Browser Project Repository exports 写入。

### Web QA Harness · 浏览器验证

- **职责**：用 Playwright / browser QA 覆盖项目创建、导入、图谱编辑、能量计算、导出和响应式布局，确保画布、表格、曲线、按钮文本不重叠。
- **承载的子 feature**：`web-workbench-e2e-qa`
- **触碰的现有代码 / 模块**：Web tests、screenshots、local dev server scripts。

## 4. 模块间接口契约 / 共享协议（架构层详设）

本节是后续 Web feature design 的硬约束输入。具体前端框架尚未拍板；正式实现可以使用 React/Next/Vite 或其他方案，但必须遵守下列边界。

### 4.1 Shell Client DTO

**方向**：Web UI → Shell Client → Python core / bridge / HTTP adapter
**形式**：JSON-safe command envelope

**契约**：

```ts
type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue }

type ShellCommandName =
  | "project.create"
  | "project.open"
  | "project.save_content"
  | "project.export_bundle"
  | "project.import_bundle"
  | "import.preview"
  | "import.register_all"
  | "workspace.open"
  | "workspace.add_node"
  | "workspace.connect"
  | "workspace.set_path"
  | "energy.compute"
  | "export.profile"
  | "workbench.snapshot"

type ShellCommandPayload = {
  command: ShellCommandName
  args: Record<string, JsonValue>
  requestId?: string
}

type ShellError = {
  code: string
  message: string
  target?: string | null
  details?: JsonValue
}

type ShellWarning = {
  code: string
  message: string
  target?: string | null
  details?: JsonValue
}

type ShellArtifact = {
  id: string
  format: "png" | "cdxml" | "xlsx" | string
  path?: string | null
  bytes_base64?: string | null
  metadata: Record<string, JsonValue>
}

type ShellResponse<TData = Record<string, JsonValue>> = {
  ok: boolean
  data?: TData | null
  error?: ShellError | null
  warnings: ShellWarning[]
  artifacts: ShellArtifact[]
}

interface ShellClient {
  run<TData = Record<string, JsonValue>>(
    payload: ShellCommandPayload
  ): Promise<ShellResponse<TData>>
}
```

**约束**：

- Web UI 不直接 import Python core，也不复制 `rxnflow.parsers` / registry / graph / energy / export 逻辑。
- Shell Client 只传 JSON-safe DTO；`File`、`Blob`、`ArrayBuffer`、`Path` 和 class instance 必须先通过 adapter 转成明确 payload 或 storage object。
- `workbench.snapshot` 是规划中的 read-only projection command；若 feature design 发现已有 command 足够，可以在 roadmap update 中删除或调整。
- 任何 command failure 必须显示 `error.code`、`message` 和可定位 target；warning 不阻断主流程。

### 4.2 Runtime Transport Modes

**方向**：Shell Client → core runtime
**形式**：可替换 transport

**契约**：

```ts
type ShellTransportKind = "in-process-test" | "local-python-bridge" | "http-api"

type ShellTransport = {
  kind: ShellTransportKind
  run(payload: ShellCommandPayload): Promise<ShellResponse>
}
```

**约束**：

- `in-process-test` 只用于前端测试和 Story/fixture，不进入生产。
- `local-python-bridge` 可用于桌面壳层或本地开发，不作为 Vercel 部署前提。
- `http-api` 是 Vercel 方向的候选，但不得假设 server filesystem 可长期保存项目；长期项目内容仍由 Browser Project Repository 或后续云 adapter 承担。
- 如果第一条 feature 决定采用不同 transport，必须先 update 本 roadmap 的 4.2 节。

### 4.3 Browser Project Repository Contract

**方向**：Web UI / Shell Client ↔ browser local storage
**形式**：TypeScript service interface

**契约**：

```ts
type BrowserProjectRef = {
  id: string
  name: string
  backendId: "browser-local-indexeddb-opfs-v1"
  projectRef: string
  createdAt: string
  updatedAt: string
  localOnly: true
}

type BrowserStorageObject = {
  path: string
  bytes: Uint8Array
  checksum?: string
  metadata: Record<string, JsonValue>
}

type BrowserWriteReceipt = {
  path: string
  checksum: string
  byteSize: number
  updatedAt: string
  backendId: string
}

interface BrowserProjectRepository {
  listProjects(): Promise<BrowserProjectRef[]>
  createProject(input: { name: string }): Promise<BrowserProjectRef>
  readObject(projectRef: string, path: string): Promise<BrowserStorageObject>
  writeObject(projectRef: string, object: BrowserStorageObject): Promise<BrowserWriteReceipt>
  exists(projectRef: string, path: string): Promise<boolean>
  listObjects(projectRef: string, prefix: string): Promise<BrowserStorageObject[]>
  deleteObject(projectRef: string, path: string): Promise<void>
}
```

**约束**：

- `path` 必须是项目相对 POSIX path，禁止绝对路径、反斜杠、`.`、`..` 和空 path。
- Browser repository 必须明确展示 local-only；浏览器清数据会删除项目。
- `.rxnflow/state/project-content.json`、section files、`inputs/raw/` 和 `exports/` 必须沿用 Project Content / Project Bundle 逻辑路径。
- Bundle import/export 是早期跨设备手动迁移方式，不等价于云同步。

### 4.4 Workbench State Projection

**方向**：ShellResponse / BrowserProjectRepository → UI components
**形式**：前端只读投影 + UI-only state

**契约**：

```ts
type WorkbenchDomainState = {
  project?: {
    id: string
    name: string
    schema_version?: string
    resource_count?: number
  }
  sessionId?: string
  projectId?: string
  workspaceId?: string
  graphId?: string
  profileId?: string
  objectCount: number
  graphCount: number
  workspaceCount: number
  profileCount: number
  artifactCount: number
  imports: ImportBatchSummary[]
  objects: ObjectSummary[]
  workspace?: WorkspaceSummary
  profile?: EnergyProfileSummary
  artifacts: ShellArtifact[]
  warnings: ShellWarning[]
}

type WorkbenchUiState = {
  activePanel: "import" | "objects" | "graph" | "energy" | "export"
  selectedObjectIds: string[]
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  selectedPathIds: string[]
  viewport: { x: number; y: number; zoom: number }
  pendingCommandIds: string[]
}
```

**约束**：

- `WorkbenchDomainState` 只能来自 ShellResponse、Project Content 或 BrowserProjectRepository，不在 UI 内手写 fake ChemicalObject / ReactionGraph 作为业务状态。
- `WorkbenchUiState` 可由前端本地维护，但保存到 Project Content 前必须转换为已有 WorkspaceSnapshot / CanvasViewport / WorkspaceSelection 协议。
- Graph canvas 不能直接改对象数组；必须通过 `workspace.add_node`、`workspace.connect`、`workspace.set_path` 或后续明确的 patch command。

### 4.5 Import Inbox Protocol

**方向**：Browser file selection → Shell Client / core parser preview
**形式**：file metadata + raw payload adapter

**契约**：

```ts
type WebImportFile = {
  id: string
  name: string
  size: number
  mimeType?: string
  lastModified?: number
  storagePath?: string
  bytes?: Uint8Array
}

type ImportPreviewCommandArgs = {
  session_id?: string
  project_path?: string
  source_path?: string
  source_paths?: string[]
  expected_format?: string
  strict?: boolean
}
```

**约束**：

- 当前 `import.preview` 接受 file path；真实 browser file bytes 进入 core 前需要 bridge feature 明确是先写入 Browser Project Repository 再传 logical path，还是上传到 HTTP adapter 做 stateless preview。
- Parser preview 成功只进入待确认状态；确认登记仍通过 `import.register_all` 或后续 selection command。
- Preview warning/error 必须原样展示，不把 `missing_section`、`unit_assumed` 等 warning 隐藏。

### 4.6 Graph Canvas Command Protocol

**方向**：Graph Canvas UI → Shell Client → Workspace service
**形式**：已有 shell commands

**契约**：

```ts
type WorkspaceOpenArgs = {
  session_id: string
  label?: string
}

type WorkspaceAddNodeArgs = {
  session_id: string
  kind: "species" | "transition_state" | "group" | "annotation"
  label: string
  chemical_object_ids?: string[]
  position?: [number, number]
  metadata?: Record<string, JsonValue>
}

type WorkspaceConnectArgs = {
  session_id: string
  from_node_id: string
  to_node_id: string
  label?: string
  metadata?: Record<string, JsonValue>
}

type WorkspaceSetPathArgs = {
  session_id: string
  path_id: string
  node_ids: string[]
  label?: string
}
```

**约束**：

- Graph UI 只能提交结构化 node/edge/path 操作，不直接 mutate graph JSON。
- Canvas viewport、selection 和 hover 不写入 ReactionGraph；保存时只通过 WorkspaceSnapshot 对应字段进入 Project Content。
- Network preview 的 disconnected diagnostics 是 warning，不阻止用户继续编辑。

### 4.7 Energy And Export Protocol

**方向**：Energy / Export panels → Shell Client
**形式**：已有 shell commands

**契约**：

```ts
type EnergyComputeArgs = {
  session_id: string
  path_id?: string
  output_unit?: "kcal_mol" | "kj_mol"
  include_corrections?: boolean
  energy_key?: string
  baseline_node_id?: string
}

type ExportProfileArgs = {
  session_id: string
  formats: ("png" | "cdxml" | "xlsx")[]
  destination_dir?: string
  basename?: string
  title?: string
  include_bytes?: boolean
}
```

**约束**：

- Energy panel 不重新计算公式；只显示 `EnergyProfile` projection 和 warnings。
- Export panel 不生成 PNG/CDXML/XLSX；只调用 core export service 并处理 ShellArtifact。
- Web 下载优先使用 `bytes_base64` 或 BrowserProjectRepository 中的 `exports/...` object；项目外绝对路径不能作为 Web artifact 长期索引。

### 4.8 UI Layout And QA Contract

**方向**：Web components / QA
**形式**：响应式布局与浏览器验证要求

**契约**：

- 首屏是工作台：左侧 project/import/object 面板，中间 graph canvas，右侧 energy/export inspector 或下方面板。
- 图谱编辑器界面服务高频编辑和信息扫描，不做营销式 hero。
- 桌面和窄屏必须都有可操作布局；窄屏可切换 panel，但不能让控件或文本重叠。
- 画布、表格、曲线和导出预览改动必须用浏览器实际验证；仅 typecheck 不算完成。

## 5. 子 feature 清单

1. **web-runtime-boundary-decision**：确认 Web MVP 的运行时边界，给出 local dev、Vercel/http-api、browser local storage 的职责分配，并跑一个 shell command POC。
   - 状态：done
   - 对应 feature：`2026-05-16-web-runtime-boundary-decision`
2. **web-app-shell-client**：建立 Web app skeleton、ShellClient DTO、基础工作台布局和 fixture / mock command 调用闭环。
   - 状态：done
   - 对应 feature：`2026-05-16-web-app-shell-client`
3. **web-workbench-state-projections**：补 Web 工作台需要的 read-only state projection，必要时新增 `workbench.snapshot` shell command，前端不从 UI 反推领域状态。
   - 状态：done
   - 对应 feature：`2026-05-16-web-workbench-state-projections`
4. **web-local-project-repository**：实现真实浏览器本地项目仓储，映射 Project Content logical path、raw files、exports 和 project refs。
   - 状态：planned
   - 对应 feature：null
5. **web-project-sidebar**：实现项目侧边栏，新建、打开、保存、bundle import/export 和 local-only / validation 状态展示。
   - 状态：planned
   - 对应 feature：null
6. **web-import-inbox**：实现导入面板，支持文件选择、批量 preview、warnings/errors 展示和确认登记。
   - 状态：planned
   - 对应 feature：null
7. **web-object-registry-panel**：实现对象面板，展示已登记 ChemicalObject、energy keys、provenance、warnings 和校正项入口。
   - 状态：planned
   - 对应 feature：null
8. **web-graph-canvas-mvp**：实现图谱画布 MVP，支持添加节点、连线、设置 active path、selection、viewport 和 network preview。
   - 状态：planned
   - 对应 feature：null
9. **web-energy-profile-panel**：实现能量面板，调用 `energy.compute` 并显示相对能量表、missing reason、warnings 和基础曲线。
   - 状态：planned
   - 对应 feature：null
10. **web-report-export-panel**：实现导出面板，调用 `export.profile`，处理 PNG/CDXML/XLSX artifacts、下载和 exports 索引展示。
    - 状态：planned
    - 对应 feature：null
11. **web-workbench-e2e-qa**：补 Playwright / browser QA，覆盖桌面/窄屏、导入、图谱编辑、能量计算、导出和视觉重叠检查。
    - 状态：planned
    - 对应 feature：null

## 6. 排期与依赖

- 第一阶段先做 `web-runtime-boundary-decision`，因为 Web/Vercel/local-first 的 runtime 关系必须先拍板，否则 UI 会绑定错误的调用方式。
- 第二阶段 `web-app-shell-client` 已完成，它是当前最小可演示闭环：页面能打开、ShellClient 能调用 fixture command、工作台布局能承载后续 panel。
- 第三阶段做 `web-workbench-state-projections` 和 `web-local-project-repository`，补齐 Web 工作台真实数据和 local-first 持久化基础。
- 第四阶段做项目/导入/对象三个侧边面板，再做 graph canvas。
- 第五阶段接 energy / export。
- 最后用 `web-workbench-e2e-qa` 收敛浏览器交互和视觉风险。

技术依赖之外的优先级不由本 roadmap 替用户决定。若用户希望先看图谱画布，也必须至少完成 runtime boundary、ShellClient 和 state projection，否则画布只能是演示假数据。

## 7. 观察项

- 当前 Web app shell 已采用 React + TypeScript + Vite + npm；视觉风格、组件系统和更长期的 Web framework 选择仍可在后续 feature 中调整，但不得绕开 ShellClient / Workbench state projection 边界。
- 当前 `PlatformShellService` 是进程内 session 模型；浏览器 local-first 项目需要明确 session 与 Project Content / BrowserProjectRepository 的同步方式。
- 当前 browser storage 是 Python 测试替身，不是真实 JS IndexedDB / OPFS adapter。
- 当前 `import.preview` 主要接受本地 file path；真实浏览器 file bytes 进入 parser preview 的桥接方式需要第一阶段决策。
- Web 工作台需要更丰富的 object/session projection；若现有 ShellResponse 不够，优先新增 read-only projection command，而不是让 UI 读取内部 Python state。
- Vercel 部署的 server filesystem 不能当长期项目存储；用户项目内容默认 local-only 或后续云 adapter。
- 图谱画布和曲线属于高风险 UI 区域，每个相关 feature acceptance 必须浏览器验证桌面与窄屏。
