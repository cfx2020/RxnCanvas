---
doc_type: roadmap
slug: rxnflow-canonical-import-data
status: active
created: 2026-06-06
last_reviewed: 2026-06-06
tags: [import, canonical-data, project-content, web-workbench, parser]
related_requirements: [web-workbench-shell, project-content-persistence]
related_architecture: [core-platform, web-workbench]
---

# Canonical Import Data

## 1. 背景

当前 Web MVP 把浏览器选择的 raw log/out/xyz/extxyz 写入 `inputs/raw/...`，再通过 parser preview、register 和 workspace.add_node 把对象放到画布。这个做法便于早期验证 Project Files、bundle roundtrip 和保存恢复，但与新产品约束冲突：用户不需要长期保留 log，项目应保存统一的 RxnFlow canonical data。

本 roadmap 负责把导入链路从“raw file 持久化为项目文件”迁移到“raw file 只作为临时解析输入，长期项目只保存结构化对象和来源摘要”。完成后，Web/Vercel/桌面/CLI 可以共享同一项目数据格式，而不依赖 raw bytes 是否仍存在。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- Core import workflow 支持 transient input，不默认复制 raw file 到项目目录。
- Project Content 保存/恢复只依赖 canonical objects、import ledger summary、graph/workspace/profile/export records。
- Web 项目树导入 / Graph Canvas raw drop 解析完成后保存 canonical data，不把 raw bytes 写入 Browser Project Repository。
- 左侧项目栏从 raw-only Project Files 改为项目数据/结构库视图，支持把已导入对象拖到画布。
- Vercel/local-http/desktop 共享同一输入语义：raw bytes 是解析输入，不是项目 authority。
- 文档和 QA 更新到“raw log 默认不保留”的用户心智。

### 明确不做

- 不实现原始 log 附件留档；后续可做 opt-in raw archive。
- 不实现云账号、权限、多人协作或云同步。
- 不实现完整浏览器内 parser；该能力可另起 roadmap。
- 不保证项目可从 raw log 重新解析恢复；恢复以 canonical project data 为准。
- 不删除历史 fixture corpus 或 parser regression fixture；测试 fixture 仍可保存受控样例。

## 3. 模块拆分（概设）

```text
Canonical Import Data
├── Transient Import Core：解析输入临时化，登记 canonical objects
├── Project Content Authority：项目保存恢复不依赖 raw bytes
├── Web Data Library：项目栏展示已导入对象/来源摘要，不展示 raw files
├── Transport Adapters：local-http / cloud / desktop 只提供临时输入 staging
└── QA & Guides：验证 Ni-fxc 真实样例、保存恢复和文档边界
```

### Transient Import Core

- **职责**：改造 ImportRegistryWorkflow / Platform Shell import preview，使解析输入可以来自 path、inline bytes、temporary blob file 或 local staging file，但默认不写入 ProjectStore raw resource。
- **承载的子 feature**：`transient-import-core-contract`, `canonical-import-ledger`
- **触碰的现有代码 / 模块**：`rxnflow.import_workflow`, `rxnflow.platform`, `rxnflow.project`, parser contracts, import ledger codec。

### Project Content Authority

- **职责**：确保 `project.save_content` / `project.open` / Project Content validation 只需要 canonical sections；manifest raw resources 不再是恢复已导入对象的必要条件。
- **承载的子 feature**：`canonical-project-content-save-restore`, `project-bundle-without-raw-default`
- **触碰的现有代码 / 模块**：`rxnflow.content_store`, project content codecs, `rxnflow.project_bundle`, tests。

### Web Data Library

- **职责**：把左侧 raw Project Files 改成项目数据/结构库视图，展示已导入对象、来源摘要、能量和可拖入画布动作；项目树 `+` / drop 和 Graph Canvas drop 是外部文件选择与临时解析入口。
- **承载的子 feature**：`web-data-library-panel`, `web-transient-import-flow`
- **触碰的现有代码 / 模块**：`ProjectSidebar`, `projectFiles.ts`, `rawInputPersistence.ts`, `WorkbenchShell`, `GraphCanvas`, i18n, E2E。

### Transport Adapters

- **职责**：明确 local-http、Vercel/cloud 和桌面壳层如何把 raw bytes 临时送入 parser，不把 raw bytes 写进项目主数据。
- **承载的子 feature**：`transport-transient-input-boundary`
- **触碰的现有代码 / 模块**：`rxnflow.local_bridge`, Web shell transport docs, future cloud parser docs。

### QA & Guides

- **职责**：用 `Ni-fxc` 真实 log 和 fixture matrix 验证解析后能保存/恢复 canonical project data，且 raw bytes 不进入项目 authority；更新用户指南。
- **承载的子 feature**：`canonical-import-qa-guides`
- **触碰的现有代码 / 模块**：unit tests, Playwright local-http smoke, docs。

## 4. 模块间接口契约 / 共享协议（架构层详设）

### 4.1 TransientImportSource

**方向**：Web / CLI / local bridge / cloud adapter → Platform Shell → ImportRegistryWorkflow  
**形式**：Shell command args / Python value object

```python
class TransientImportSource:
    kind: Literal["path", "inline_bytes", "staged_file", "cloud_blob"]
    filename: str
    checksum: str | None
    byte_size: int | None
    mime_type: str | None
    source_path: str | None          # only path/staged_file
    bytes_base64: str | None         # only inline_bytes
    blob_ref: str | None             # only cloud_blob, adapter-resolved before parser
    retain_raw: bool = False         # default false; true reserved for future raw archive
```

**约束**：

- `retain_raw=false` 时 ImportRegistryWorkflow 不得把 source bytes 复制进 project `inputs/raw/...`，也不得把 raw bytes 写入 Browser Project Repository。
- `checksum` 存在时只作为 provenance summary，不作为恢复依赖。
- `cloud_blob` 必须先由 adapter materialize 为临时 parser-readable file；core 不直接绑定 Vercel Blob SDK。

### 4.2 CanonicalImportRecord

**方向**：ImportRegistryWorkflow → Project Content / Web Data Library  
**形式**：Import ledger section DTO

```python
class CanonicalImportRecord:
    id: str
    source_display_name: str
    source_checksum: str | None
    source_byte_size: int | None
    parser_id: str
    parser_version: str
    parsed_at: str
    status: Literal["previewed", "registered", "failed"]
    object_ids: tuple[str, ...]
    warnings: tuple[RxnFlowWarning, ...]
    error: RxnFlowError | None
    raw_retention: Literal["discarded", "retained"]
    raw_resource_id: str | None      # null by default; future opt-in raw archive only
```

**约束**：

- `object_ids` 是保存/恢复项目对象的长期引用；`raw_resource_id` 不是恢复对象的前置条件。
- `raw_retention="discarded"` 是默认状态；Web 主流程不得显示 raw path 作为项目文件。
- 旧 `ImportItem.raw_resource` 在迁移期可继续存在，但新 Web 主流程只消费 `CanonicalImportRecord` / object summaries。

### 4.3 Project Data Library Projection

**方向**：Project Content + Workbench Snapshot → Web Project Sidebar  
**形式**：TypeScript view model

```ts
type ProjectDataEntry = {
  id: string
  kind: "chemical-object" | "import-record"
  label: string
  sourceName?: string
  checksum?: string
  parserId?: string
  objectIds: string[]
  graphNodeIds: string[]
  status: "imported" | "used-in-graph" | "error"
  displayEnergy?: { key: string; value: number; unit: string }
  warnings: string[]
}
```

**约束**：

- 左侧项目栏只展示 canonical data entries，不展示 `inputs/raw/...`。
- 把 entry 拖到画布时，Graph Canvas 使用 `objectIds` 走 `workspace.add_node`，不重新 parse raw file。
- 项目树导入和 Graph Canvas drop 负责外部文件选择与临时解析，不承担项目长期文件列表职责。

### 4.4 Save / Share Project Boundary

**方向**：Project Content Store / Browser Repository / Bundle Helper

**契约**：

- `project.save_content(include_content_files=true)` 返回 canonical state files；默认不返回 raw bytes。
- Web browser-local repository 不再默认写 `inputs/raw/...` objects。
- `.rxnflow.zip` / 项目包默认只包含 `.rxnflow/state` canonical sections 和导出 artifacts；raw archive 作为后续 opt-in attachment，不在本 roadmap 默认路径。

## 5. 子 feature 清单

1. **transient-import-core-contract** — Core/Platform Shell 支持 `retain_raw=false` transient import，解析成功后只登记 canonical objects 和来源摘要。
   - 所属模块：Transient Import Core
   - 依赖：无
   - 状态：done
   - 对应 feature：`2026-06-06-transient-import-core-contract`
   - 备注：最小闭环已落地；默认 preview/register 不依赖 raw resource，manifest 不新增 raw file resource，`retain_raw=true` 保留旧 raw archive 路径。迁移期 `ParsePreview.raw_resource_id` 在 `raw_resource is None` 时表示 transient source id，字段命名留给 `canonical-import-ledger` 修订。

2. **canonical-import-ledger** — 扩展 import ledger/project content codec，保存 `CanonicalImportRecord`，恢复时不要求 raw file 存在。
   - 所属模块：Transient Import Core / Project Content Authority
   - 依赖：`transient-import-core-contract`
   - 状态：planned
   - 对应 feature：未启动

3. **web-transient-import-flow** — Web 项目树导入和 raw drop 改为临时解析，不写 Browser Raw Input Object，解析后立即更新对象和 workspace。
   - 所属模块：Web Data Library / Transport Adapters
   - 依赖：`transient-import-core-contract`
   - 状态：planned
   - 对应 feature：未启动

4. **web-data-library-panel** — 左侧 Project Sidebar 从 Project Files 改为 Project Data Library，展示已导入对象/来源摘要并支持拖入画布。
   - 所属模块：Web Data Library
   - 依赖：`canonical-import-ledger`, `web-transient-import-flow`
   - 状态：planned
   - 对应 feature：未启动

5. **canonical-project-content-save-restore** — Save Project / reopen / validation 只依赖 canonical sections，项目恢复不读取 raw bytes。
   - 所属模块：Project Content Authority
   - 依赖：`canonical-import-ledger`, `web-data-library-panel`
   - 状态：planned
   - 对应 feature：未启动

6. **project-bundle-without-raw-default** — 调整 bundle/helper 默认输出，项目分享包不包含 raw logs，保留后续 raw archive 扩展点。
   - 所属模块：Project Content Authority
   - 依赖：`canonical-project-content-save-restore`
   - 状态：planned
   - 对应 feature：未启动

7. **transport-transient-input-boundary** — 固定 local-http、Vercel/cloud、desktop adapter 的 transient input 语义和大小/清理边界。
   - 所属模块：Transport Adapters
   - 依赖：`transient-import-core-contract`
   - 状态：planned
   - 对应 feature：未启动

8. **canonical-import-qa-guides** — 用 fixture/local-http/Ni-fxc 验证 canonical data 保存恢复，更新用户/开发者指南和 architecture 回写。
   - 所属模块：QA & Guides
   - 依赖：`canonical-project-content-save-restore`, `project-bundle-without-raw-default`, `transport-transient-input-boundary`
   - 状态：planned
   - 对应 feature：未启动

**最小闭环**：第 1 条 `transient-import-core-contract` 已落地；core/local-http 默认 `retain_raw=false`，可解析 `Ni-fxc` log、登记对象、创建 graph nodes，并且项目 manifest 不新增 raw file resource。

## 6. 排期思路

先改 core import contract，因为 Web、bundle 和 cloud/local transport 都依赖它。随后扩展 import ledger，让保存恢复有稳定来源摘要。Web 侧先改导入动作，再改左侧信息架构，避免 UI 先改但数据仍来自 raw path。保存恢复和 bundle 默认行为放在中后段，防止过早破坏现有项目恢复测试。最后统一 transport 文档和 QA。

## 7. 观察项

- `.codestable/architecture/core-platform.md` 已记录 Import Registry Workflow 默认 transient import；Project Store / Bundle 仍保留 `inputs/raw/` 旧能力和未来 raw archive 扩展点。
- `.codestable/architecture/web-workbench.md` 当前仍记录 Project Files raw-only 和 raw persistence；这是现状，等 Web Data Library 落地后再更新。
- 未跟踪的 `.codestable/compound/2026-06-05-decision-portable-project-storage.md` 中仍把 raw inputs 当作可携带项目内容；该文档如果要纳入仓库，应先按本 decision 修订或 supersede。
