---
doc_type: roadmap
slug: rxnflow-project-persistence
status: active
created: 2026-05-05
last_reviewed: 2026-05-07
tags: [rxnflow, persistence, project-store, browser-storage, project-bundle]
related_requirements: [platform-shell-entry, project-content-persistence]
related_architecture: [ARCHITECTURE, core-platform]
---

# RxnFlow Project Persistence

## 1. 背景

RxnFlow 已经跑通从导入、登记、图谱编辑、能量计算到报告导出的核心链路，但大部分领域内容仍只保存在进程内。用户一旦关闭 CLI、刷新网页或重启桌面 app，ChemicalObject、ReactionGraph、WorkspaceSnapshot、EnergyProfile、ImportBatch 和 ExportArtifact index 都无法恢复。

本 roadmap 的目标是建立跨端共享的项目内容持久化协议：本地 CLI / 桌面 app 可以写文件系统；早期网页可以写浏览器本地 IndexedDB / OPFS，并通过 project bundle 导入导出；云端保存则作为后续可选 adapter，不作为早期 MVP 的前置成本。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- 定义 `.rxnflow/state/` 下的项目内容文件布局和 `project-content-v1` schema。
- 定义 storage backend 抽象，让本地文件系统、浏览器本地存储和后续云端存储复用同一套 ProjectContentStore 协议。
- 持久化 ChemicalObject、provenance、corrections 和 registry fingerprint。
- 持久化 ReactionGraph、ReactionPath、WorkspaceSnapshot、CanvasViewport、WorkspaceSelection 和 active path。
- 持久化 ImportBatch、ImportItem、ParsePreview、确认登记状态和导入 warnings/errors。
- 持久化 EnergyProfile、EnergyOptions、EnergyPoint 和 warnings。
- 建立 ExportArtifact index，只记录项目相对路径、格式、metadata 和 checksum，不把二进制 bytes 塞进 manifest。
- 支持 `.rxnflow.zip` project bundle 导入/导出，服务早期网页版本和本地备份。
- 让 Platform Shell 能跨进程打开项目并恢复已持久化对象、图谱和 profile。
- 建立 schema validation、引用完整性检查和后续迁移边界。

### 明确不做

- 不在本 roadmap 中购买或绑定云存储服务。
- 不实现账号、权限、团队协作、云同步、冲突合并、CRDT 或实时多人编辑。
- 不把浏览器本地存储伪装成可靠云备份；浏览器清数据仍可能删除本地项目。
- 不把所有状态塞进 `.rxnflow/manifest.json`；manifest 仍只保存项目级元数据和资源索引。
- 不持久化外部量化计算任务、队列、远程作业状态或计算软件运行日志以外的任务调度信息。
- 不重写 parser 字段映射、ChemicalRegistry 去重规则、GraphPatch 语义、EnergyProfile 计算规则或 ReportExport writer 能力。
- 不实现 Web UI、桌面 UI、文件选择器或浏览器拖拽交互；这里只定义持久化和 adapter。
- 不做数据库 schema、Supabase/S3/Vercel Blob/R2 具体接入；云端 adapter 后续另起 roadmap update 或新 roadmap。

## 3. 模块拆分（概设）

```
RxnFlow Project Persistence
├── Project Content Schema：跨端共享的 .rxnflow/state 文件布局与 schema version
├── Project Content Store：读写项目内容快照的核心服务接口
├── Storage Backends：本地文件系统、浏览器本地存储、project bundle 的 adapter
├── Domain Repositories：对象、图谱、workspace、导入、profile、export index 的分仓储
├── Validation / Migration：schema 校验、引用完整性检查和迁移入口
└── Platform Restore：CLI / agent / 未来端侧打开项目时恢复核心服务状态
```

### Project Content Schema · 项目内容格式

- **职责**：定义 `.rxnflow/state/` 下哪些 JSON 文件保存哪些领域内容、schema version 如何记录、文件引用如何使用项目相对 POSIX 路径。它不关心数据最终在本机磁盘、IndexedDB 还是对象存储里。
- **承载的子 feature**：`project-content-store-v1`
- **触碰的现有代码 / 模块**：`rxnflow.models`、`rxnflow.project_manifest`、新增 project content module

### Project Content Store · 项目内容读写服务

- **职责**：提供 save/load/list/validate 级别的核心 API，把各领域对象保存为 project content snapshot，并从存储后端恢复成核心服务可使用的 dataclass。它不解析原始计算输出，不重新计算能量，也不渲染 UI。
- **承载的子 feature**：`project-content-store-v1`、`project-content-validation-migration`
- **触碰的现有代码 / 模块**：`rxnflow.project`、新增 content store module

### Storage Backends · 存储后端适配

- **职责**：把逻辑路径读写映射到具体介质。本地文件系统 adapter 写项目目录；浏览器本地 adapter 未来映射到 IndexedDB / OPFS；project bundle adapter 负责 `.rxnflow.zip` 导入导出。所有 adapter 必须遵守同一套 logical path / bytes / metadata contract。
- **承载的子 feature**：`project-content-store-v1`、`project-bundle-import-export`、`browser-local-storage-adapter`
- **触碰的现有代码 / 模块**：新增 storage backend module；Platform Shell 后续消费

### Domain Repositories · 领域内容仓储

- **职责**：为 ChemicalObject、ReactionGraph、WorkspaceSnapshot、ImportLedger、EnergyProfile 和 ExportArtifactIndex 提供各自的序列化、反序列化、保存和加载边界。它们只做结构持久化，不改变领域规则。
- **承载的子 feature**：`chemical-object-persistence`、`reaction-graph-workspace-persistence`、`import-ledger-persistence`、`energy-profile-persistence`、`export-artifact-index-persistence`
- **触碰的现有代码 / 模块**：`rxnflow.registry`、`rxnflow.graph`、`rxnflow.workspace`、`rxnflow.import_workflow`、`rxnflow.energy`、`rxnflow.export`

### Validation / Migration · 校验与迁移

- **职责**：校验 schema version、JSON shape、checksum、project id、对象引用、graph 引用、workspace 引用、profile 引用和 export path 安全性；为后续 `project-content-v2` 预留显式 migration 入口。
- **承载的子 feature**：`project-content-validation-migration`
- **触碰的现有代码 / 模块**：新增 validation module；Project Content Store 调用

### Platform Restore · 端侧恢复

- **职责**：让 Platform Shell 在 project load/open 后恢复 ChemicalRegistry、ReactionGraphService、GraphEditorWorkspaceService、EnergyProfile cache 和 export index 的项目状态。它只接线，不复制持久化或领域逻辑。
- **承载的子 feature**：`platform-shell-state-restore`
- **触碰的现有代码 / 模块**：`rxnflow.platform`、`rxnflow.cli`

## 4. 模块间接口契约 / 共享协议（架构层详设）

本节是后续 feature design 的硬约束输入。正式实现可用 Python dataclass / Protocol 表达；网页端可映射成 TypeScript 等价类型。

### 4.1 Project Content 文件布局

**方向**：Project Content Store ↔ Storage Backends
**形式**：项目相对文件协议

**契约**：

```text
<project>/
├── .rxnflow/
│   ├── manifest.json
│   └── state/
│       ├── project-content.json
│       ├── chemical-objects.json
│       ├── reaction-graphs.json
│       ├── workspaces.json
│       ├── import-ledger.json
│       ├── energy-profiles.json
│       └── export-artifacts.json
├── inputs/
│   └── raw/
└── exports/
```

```ts
type ProjectContentIndex = {
  schemaVersion: "project-content-v1"
  projectId: ID
  updatedAt: ISODateTime
  files: ProjectContentFile[]
}

type ProjectContentFile = {
  kind:
    | "chemical_objects"
    | "reaction_graphs"
    | "workspaces"
    | "import_ledger"
    | "energy_profiles"
    | "export_artifacts"
  path: string
  checksum?: string
  updatedAt: ISODateTime
}
```

**约束**：

- 所有 path 必须是项目相对 POSIX 路径，禁止绝对路径、空路径、`.`、`..` 和反斜杠。
- `manifest.json` 不保存完整 ChemicalObject / ReactionGraph / EnergyProfile 内容，只记录 project metadata 和 resource index。
- JSON writer 必须输出 deterministic key order，方便 diff、测试和 agent review。
- `project-content-v1` 不做 silent migration；不兼容 version 返回 `invalid_input` 或明确 migration result。

### 4.2 Storage Backend 协议

**方向**：Project Content Store → Storage Backends
**形式**：核心函数接口

**契约**：

```python
@dataclass(frozen=True)
class StorageObject:
    path: str
    bytes: bytes
    checksum: str | None = None
    metadata: dict[str, object] = field(default_factory=dict)

@dataclass(frozen=True)
class WriteReceipt:
    path: str
    checksum: str
    byte_size: int
    updated_at: str
    backend_id: str

class ProjectStorageBackend(Protocol):
    backend_id: str
    def read_object(self, project_ref: str, path: str) -> Result[StorageObject]: ...
    def write_object(self, project_ref: str, obj: StorageObject) -> Result[WriteReceipt]: ...
    def exists(self, project_ref: str, path: str) -> Result[bool]: ...
    def list_objects(self, project_ref: str, prefix: str) -> Result[tuple[StorageObjectInfo, ...]]: ...
    def delete_object(self, project_ref: str, path: str) -> Result[None]: ...
```

**约束**：

- `project_ref` 对本地 adapter 是项目目录，对浏览器 adapter 是 project id / origin-local key，对 bundle adapter 是 zip 内部根。
- backend 只处理 bytes 和 metadata，不理解 ChemicalObject、ReactionGraph 或 EnergyProfile。
- backend 必须拒绝不安全 path。
- 浏览器本地 backend 必须明确标注 local-only，不能承诺跨设备同步。
- 云端 backend 不在本 roadmap 实现；如果后续接入，必须实现同一协议并额外处理 auth、tenant、quota 和 conflict。

### 4.3 Project Content Store 协议

**方向**：Platform Shell / Core Services → Project Content Store
**形式**：服务接口

**契约**：

```python
@dataclass(frozen=True)
class ProjectContentSnapshot:
    project_id: str
    chemical_objects: tuple[ChemicalObject, ...] = ()
    reaction_graphs: tuple[ReactionGraph, ...] = ()
    workspaces: tuple[WorkspaceSnapshot, ...] = ()
    import_batches: tuple[ImportBatch, ...] = ()
    energy_profiles: tuple[EnergyProfile, ...] = ()
    export_artifacts: tuple[ExportArtifactRecord, ...] = ()

class ProjectContentStore:
    def load_snapshot(self, project_ref: str) -> Result[ProjectContentSnapshot]: ...
    def save_snapshot(self, project_ref: str, snapshot: ProjectContentSnapshot) -> Result[ProjectContentIndex]: ...
    def validate_snapshot(self, snapshot: ProjectContentSnapshot) -> Result[ValidationReport]: ...
    def load_index(self, project_ref: str) -> Result[ProjectContentIndex]: ...
```

**约束**：

- `load_snapshot` 不解析 raw files、不登记新对象、不计算 EnergyProfile、不调用 export writer。
- `save_snapshot` 不修改用户源文件，也不删除 `inputs/raw/` 中已有 raw resource。
- snapshot 保存必须是全量一致视图；后续增量保存可另起 feature。
- save 失败时不得写出半套互相不一致的 index；本地 adapter 可先写临时文件再替换。

### 4.4 Chemical Object 持久化协议

**方向**：Chemical Registry ↔ Project Content Store
**形式**：JSON schema

**契约**：

```ts
type ChemicalObjectStoreV1 = {
  schemaVersion: "chemical-objects-v1"
  projectId: ID
  objects: StoredChemicalObject[]
}

type StoredChemicalObject = {
  id: ID
  label?: string
  formula?: string
  charge?: number
  spinMultiplicity?: number
  method?: string
  sourceFileId: ID
  atoms?: Atom[]
  energies: Record<string, { value: number; unit: "hartree" | "kcal_mol" | "kj_mol" }>
  thermochemistry: Record<string, { value: number; unit: string }>
  corrections: StoredCorrection[]
  provenance: Record<string, unknown>
  registryFingerprint?: string
}
```

**约束**：

- 能量必须显式保存 unit，不允许保存裸 float。
- corrections append-only 语义不变；加载后重复 correction id 仍按 ChemicalRegistry 规则处理。
- sourceFileId 必须能在 manifest resources 或 import ledger 中找到，否则 validation warning 或 error。

### 4.5 Reaction Graph / Workspace 持久化协议

**方向**：ReactionGraphService / GraphEditorWorkspaceService ↔ Project Content Store
**形式**：JSON schema

**契约**：

```ts
type ReactionGraphStoreV1 = {
  schemaVersion: "reaction-graphs-v1"
  projectId: ID
  graphs: ReactionGraph[]
}

type WorkspaceStoreV1 = {
  schemaVersion: "workspaces-v1"
  projectId: ID
  workspaces: StoredWorkspace[]
}

type StoredWorkspace = {
  workspaceId: ID
  graphId: ID
  selection: { nodeIds: ID[]; edgeIds: ID[]; pathIds: ID[] }
  viewport: { x: number; y: number; zoom: number }
  activePathId?: ID
  updatedAt: ISODateTime
}
```

**约束**：

- ReactionGraph 仍只引用 ChemicalObject id，不复制对象内容。
- Workspace state 不写入 GraphPatch，也不改变 ReactionGraph。
- validation 必须检查 node/object/edge/path/workspace 引用完整性。

### 4.6 Import Ledger 持久化协议

**方向**：ImportRegistryWorkflow ↔ Project Content Store
**形式**：JSON schema

**契约**：

```ts
type ImportLedgerStoreV1 = {
  schemaVersion: "import-ledger-v1"
  projectId: ID
  batches: StoredImportBatch[]
}

type StoredImportItem = {
  id: ID
  sourcePathDisplay?: string
  rawResourceId?: ID
  status: "raw_added" | "parsed" | "needs_confirmation" | "registered" | "failed"
  preview?: StoredParsePreview
  registeredObjectIds: ID[]
  warnings: RxnFlowWarning[]
  error?: RxnFlowError
}

type StoredParsePreview = {
  rawResourceId: ID
  parserId: string
  parserVersion: string
  objectCount: number
  objectDrafts: ChemicalObjectDraft[]
  provenance: Provenance
  warnings: RxnFlowWarning[]
}
```

**约束**：

- 不保存用户源文件绝对路径；`sourcePathDisplay` 只用于 UI 提示，不作为恢复依据。
- raw file 恢复必须依赖 manifest resource path 和 checksum。
- 持久化 preview 必须保存完整 object drafts 和 provenance，保证加载后仍可确认导入，不依赖重新 parse。
- 允许 persisted preview 在 parser version 变化后标记 stale；是否重新 parse 是后续 feature，不在 load 时自动发生。

### 4.7 Energy Profile / Export Index 持久化协议

**方向**：EnergyProfileEngine / ReportExportService ↔ Project Content Store
**形式**：JSON schema

**契约**：

```ts
type EnergyProfileStoreV1 = {
  schemaVersion: "energy-profiles-v1"
  projectId: ID
  profiles: EnergyProfile[]
}

type ExportArtifactIndexV1 = {
  schemaVersion: "export-artifacts-v1"
  projectId: ID
  artifacts: ExportArtifactRecord[]
}

type ExportArtifactRecord = {
  id: ID
  format: "png" | "cdxml" | "xlsx"
  path: string
  checksum?: string
  metadata: Record<string, unknown>
  createdAt: ISODateTime
}
```

**约束**：

- EnergyProfile 保存 options、points 和 warnings；加载时不重新计算。
- ExportArtifactRecord.path 必须是项目相对路径，通常位于 `exports/`。
- Export index 不保存 artifact bytes；bytes 由 storage backend 的 object path 管理。

### 4.8 Project Bundle 协议

**方向**：Project Content Store ↔ Browser / CLI / Desktop shell
**形式**：zip package

**契约**：

```text
<project-name>.rxnflow.zip
└── <project-root>/
    ├── .rxnflow/
    ├── inputs/raw/
    └── exports/
```

**约束**：

- bundle 内路径使用同一套安全 POSIX path 规则。
- bundle import 不自动覆盖现有项目；冲突策略必须由调用方显式选择。
- 早期网页版本可用 bundle 作为“用户自己备份/同步”的主路径，不要求云存储。

### 4.9 Platform Restore 协议

**方向**：Platform Shell → Project Content Store → Core Services
**形式**：shell command + service orchestration

**契约**：

```python
ShellCommand("project.open", {"project_path": "...", "load_content": True})
ShellCommand("project.save_content", {"project_path": "..."})
ShellCommand("project.export_bundle", {"project_path": "...", "destination_path": "..."})
ShellCommand("project.import_bundle", {"bundle_path": "...", "destination_dir": "..."})
```

**约束**：

- restore 只恢复已持久化内容，不重新 parse raw files，不重新计算 energy profile。
- restore 后 ShellResponse 必须给出 object_count、graph_count、workspace_count、profile_count 和 artifact_count。
- 缺失或损坏的 state 文件必须返回结构化 error/warnings，不得静默忽略。

## 5. 子 feature 清单

1. **project-content-store-v1** — 定义 `project-content-v1` 文件布局、ProjectContentStore API、本地文件系统 backend，并跑通 fixture snapshot save/load
   - 所属模块：Project Content Schema / Project Content Store / Storage Backends
   - 依赖：无
   - 状态：done
   - 对应 feature：2026-05-05-project-content-store-v1
   - 备注：最小闭环；先证明项目关掉再打开能恢复一条 fixture 链路

2. **chemical-object-persistence** — 持久化 ChemicalObject、provenance、registry fingerprint 和 append-only corrections
   - 所属模块：Domain Repositories
   - 依赖：`project-content-store-v1`
   - 状态：done
   - 对应 feature：2026-05-05-chemical-object-persistence

3. **reaction-graph-workspace-persistence** — 持久化 ReactionGraph、ReactionPath、WorkspaceSnapshot、viewport、selection 和 active path
   - 所属模块：Domain Repositories
   - 依赖：`project-content-store-v1`、`chemical-object-persistence`
   - 状态：done
   - 对应 feature：2026-05-06-reaction-graph-workspace-persistence

4. **import-ledger-persistence** — 持久化 ImportBatch、ImportItem、ParsePreview、registered ids、warnings 和 errors
   - 所属模块：Domain Repositories
   - 依赖：`project-content-store-v1`、`chemical-object-persistence`
   - 状态：done
   - 对应 feature：2026-05-06-import-ledger-persistence

5. **energy-profile-persistence** — 持久化 EnergyProfile、EnergyOptions、EnergyPoint、missing reason 和 warnings
   - 所属模块：Domain Repositories
   - 依赖：`project-content-store-v1`、`reaction-graph-workspace-persistence`
   - 状态：done
   - 对应 feature：2026-05-06-energy-profile-persistence

6. **export-artifact-index-persistence** — 建立 export artifact index，登记导出文件项目相对路径、格式、checksum 和 metadata
   - 所属模块：Domain Repositories
   - 依赖：`project-content-store-v1`、`energy-profile-persistence`
   - 状态：planned
   - 对应 feature：未启动

7. **project-content-validation-migration** — 校验 schema、checksum、安全路径和跨对象引用，并预留显式 migration 入口
   - 所属模块：Validation / Migration
   - 依赖：`chemical-object-persistence`、`reaction-graph-workspace-persistence`、`import-ledger-persistence`、`energy-profile-persistence`、`export-artifact-index-persistence`
   - 状态：planned
   - 对应 feature：未启动

8. **platform-shell-state-restore** — 让 CLI/agent 通过 project.open/save_content 恢复和保存持久化项目内容
   - 所属模块：Platform Restore
   - 依赖：`project-content-validation-migration`
   - 状态：planned
   - 对应 feature：未启动

9. **project-bundle-import-export** — 支持 `.rxnflow.zip` 项目包导入/导出，用于本地备份和早期网页无云同步
   - 所属模块：Storage Backends
   - 依赖：`project-content-validation-migration`
   - 状态：planned
   - 对应 feature：未启动

10. **browser-local-storage-adapter** — 规划并实现浏览器本地 IndexedDB / OPFS storage adapter 的核心协议测试替身，不引入云存储
    - 所属模块：Storage Backends
    - 依赖：`project-content-store-v1`、`project-bundle-import-export`
    - 状态：planned
    - 对应 feature：未启动
    - 备注：真实 Web UI 接入另起前端 roadmap；本条只保证 storage adapter contract 可用

**最小闭环**：第 1 条 `project-content-store-v1` 做完后，系统能把一份包含 ChemicalObject、ReactionGraph、WorkspaceSnapshot 和 EnergyProfile 的 fixture snapshot 写入 `.rxnflow/state/`，关闭当前进程后再加载，并得到同样的对象、图谱和 profile 摘要。

## 6. 排期思路

先做 `project-content-store-v1`，因为没有统一文件布局和 backend contract，后续每个领域模块都会各自发明保存格式。随后按引用依赖推进：先对象，再图谱/workspace，再导入 ledger 和 energy profile，最后登记 export artifact。validation/migration 在各类内容都能保存后集中补齐，Platform Shell restore 和 project bundle 则建立真正跨进程、跨端可用的入口。

浏览器本地存储放在后半段，是因为它不应该重新定义项目格式；它只实现同一套 backend contract。云存储不作为本 roadmap 的前置项，避免早期 MVP 被账号、权限、计费和合规问题拖住。

## 7. 观察项

- `rxnflow-core-platform` 的所有 items 已 done，后续可在单独 roadmap update 中把该 roadmap 状态标为 `completed`。
- 主技术栈、包管理方式和浏览器端具体框架仍未拍板；本 roadmap 只定义可映射的核心协议。
- 浏览器本地存储不是云备份；产品文案和 UI 必须明确提醒用户导出 project bundle 备份。
- 如果未来要做云同步，需要另起包含账号、权限、quota、加密、备份和冲突处理的 roadmap。
- 计算化学内容 schema 需要在后续 feature 中继续请用户把关，尤其是校正项、热化学字段、多构象、多自旋态和解析 preview 是否完整可恢复。
