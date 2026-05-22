# web-local-project-repository 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-19
> 关联方案 doc：codestable/features/2026-05-16-web-local-project-repository/web-local-project-repository-design.md

## 1. 接口契约核对

对照方案第 2.1 节，本 feature 已新增 Browser Project Repository DTO、interface、结构化错误、path/checksum helpers、IndexedDB implementation、factory 和 test double。

接口示例逐项核对：

- [x] `BrowserProjectRef`：`web/src/repository/types.ts` 已定义 `id`、`name`、`backendId`、`projectRef`、`createdAt`、`updatedAt` 和 `localOnly: true`。
- [x] `BrowserStorageObject`：已定义 `path`、`bytes`、`checksum` 和 JSON-safe `metadata`。
- [x] `BrowserWriteReceipt`：已定义 `path`、`checksum`、`byteSize`、`updatedAt` 和 `backendId`。
- [x] `BrowserProjectRepositoryError`：已定义 `code`、`message`、`target`、`details` 和 JSON-safe `toJSON()`。
- [x] `BrowserProjectRepository`：已定义 `listProjects`、`createProject`、`readObject`、`writeObject`、`exists`、`listObjects` 和 `deleteObject`。
- [x] `createBrowserProjectRepository()`：已在 `web/src/repository/indexedDbRepository.ts` 落地；真实浏览器 IndexedDB 可用时返回 `IndexedDbBrowserProjectRepository`，不可用时抛 `storage_unavailable`。

名词层“现状 -> 变化”核对：

- [x] `web/src/repository/` 已新增，不再只是 roadmap 契约。
- [x] `JsonObject` / `JsonValue` 复用 `web/src/shell/types.ts`，metadata 仍保持 JSON-safe。
- [x] Python `BrowserLocalProjectStorageBackend` 未被 Web runtime 直接复用；Web 侧有独立真实 IndexedDB adapter 和内存 test double。
- [x] IndexedDB object record 使用内部 key；公开 API 只暴露 `projectRef + path`。

流程图核对：

- [x] UI / future Project Sidebar 调用 repository：当前未接 UI，repository 模块已经导出未来可调用入口。
- [x] repository validate input：`validateBrowserProjectRef` 和 `validateBrowserStoragePath` 被 read/write/list/delete/exists 调用。
- [x] `createProject` 写 project ref record：IndexedDB `projects` object store 已实现。
- [x] `writeObject` 计算 sha256 并写 object record：`checksumBrowserStorageBytes` + IndexedDB `objects` store 已实现。
- [x] `read/list/exists/delete` 按 `projectRef/path` 查询 object store：IndexedDB implementation 和 memory test double 均落地。
- [x] 结构化错误：invalid input、missing object、storage unavailable、quota exceeded 和 fallback storage failed 均有稳定 code。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] 在 `web/src` 新增 Browser Project Repository 模块，提供 project refs 和 project object CRUD。
- [x] 按 roadmap 4.3 实现 `listProjects`、`createProject`、`readObject`、`writeObject`、`exists`、`listObjects` 和 `deleteObject`。
- [x] 第一版真实浏览器实现使用 IndexedDB 保存 refs、metadata 和 bytes，保持 local-only。
- [x] 复用 Python 测试替身已验证的 path 校验、project_ref 隔离、checksum、prefix list、delete 幂等和 quota error 语义。
- [x] Vitest 使用 `MemoryBrowserProjectRepository` 稳定覆盖 contract；真实 Chromium smoke 已验证 IndexedDB 读写。

明确不做逐项核对：

- [x] 未新增 Project Sidebar UI、新建/打开/保存按钮或项目列表面板。
- [x] 未实现 `project.create` / `project.open` / `project.save_content` 与浏览器仓储的真实 bridge。
- [x] 未实现 `.rxnflow.zip` bundle import/export UI 或 zip 读写。
- [x] 未实现 File picker、drag/drop、parser preview 或 raw file 到 Python core 的桥接。
- [x] 未实现 OPFS payload store、Web Worker、Service Worker、StorageManager.persist 权限 UI 或大文件 chunking。
- [x] 未引入云存储、账号、权限、跨设备同步、冲突合并或多人协作。
- [x] 未修改 Python parser、registry、graph、energy、export、ProjectContentStore 或 BrowserLocalProjectStorageBackend。

关键决策落地：

- [x] IndexedDB-first，不实现 OPFS：`IndexedDbBrowserProjectRepository` 只使用 IndexedDB object stores。
- [x] repository 是 Web 前端服务，不是 ShellTransport：代码位于 `web/src/repository`，未接入 `ShellClient` 或 `ShellTransport`。
- [x] 沿用 project-relative POSIX path：统一 path helper 拒绝空路径、绝对路径、反斜杠、`.` 和 `..`。
- [x] checksum 在浏览器端计算：使用 Web Crypto `crypto.subtle.digest("SHA-256", ...)` 返回 `sha256:<64 hex>`。
- [x] 错误结构化但不返回 ShellResponse：repository promise 失败时抛 `BrowserProjectRepositoryError`。

编排层“现状 -> 变化”核对：

- [x] 新增 `IndexedDbBrowserProjectRepository` 作为真实浏览器实现。
- [x] 新增 `MemoryBrowserProjectRepository` 作为 Vitest 稳定 test double，并提供 `quotaBytes` 模拟 quota failure。
- [x] 新增 `createBrowserProjectRepository()` factory；IndexedDB 不可用时返回结构化 `storage_unavailable` 错误。
- [x] repository 不自动写 Project Content scaffold；创建 project ref 只创建项目引用。
- [x] Browser smoke 使用 Vite dev server 动态 import repository module，在真实 Chromium IndexedDB 中完成 create/write/read/list/delete。

跨层纪律核对：

- [x] Local-only：所有 project refs 带 `localOnly: true`，scope grep 未发现 cloud/auth SDK。
- [x] Path safety：所有 object path 走统一校验。
- [x] Bytes authority：repository 只保存 bytes，不解析领域对象。
- [x] Project isolation：相同 path 在不同 `projectRef` 下互相隔离。
- [x] Idempotency：`writeObject` 覆盖同一 key，`deleteObject` 对缺失对象成功。
- [x] Ordering：`listProjects` 按 name/updatedAt/id 稳定排序，`listObjects` 按 path 排序。
- [x] Error semantics：missing object 为 `object_not_found`；quota 映射为 `storage_quota_exceeded`；IndexedDB 不可用映射为 `storage_unavailable`。

挂载点核对：

- [x] `web/src/repository/`：DTO、factory、helpers、IndexedDB implementation 和 test double 已落地。
- [x] `web/src/repository/*.test.ts`：contract、path safety、checksum、project isolation、prefix list、delete idempotency 和 error semantics 已覆盖。
- [x] browser validation script：通过临时 Playwright/Chromium 脚本完成 smoke，未新增用户可见 UI。
- [x] `codestable/architecture/web-workbench.md` / `ARCHITECTURE.md`：已记录真实 Browser Project Repository、IndexedDB-first implementation、local-only 和清浏览器数据风险。
- [x] `codestable/requirements/project-content-persistence.md`：已补充真实 Web repository 的现状边界。

反向核查：

- [x] grep `createBrowserProjectRepository|IndexedDbBrowserProjectRepository|MemoryBrowserProjectRepository|BrowserProjectRepository` 命中均落在 repository 目录、tests、feature docs、architecture 和 roadmap 中。
- [x] grep 禁用项确认 `web/src/repository` 未包含 Project Sidebar、bundle UI、file picker、drag/drop、parser preview、OPFS、Worker、Service Worker、HTTP API 或 cloud/auth SDK。
- [x] 拔除沙盘推演：删除 `web/src/repository/`、相关 tests、导出和本 feature 文档/架构记录后，不会影响当前 WorkbenchShell、ShellClient、fixture transport 或 Python core runtime。

## 3. 验收场景核对

- [x] S1 `createBrowserProjectRepository()` 在真实浏览器 IndexedDB 可用时返回 repository。
  - 证据：真实 Chromium smoke 动态 import `/src/repository/index.ts` 并创建 repository 成功。
- [x] S2 `createProject({name})` 返回完整 `BrowserProjectRef`。
  - 证据：`web/src/repository/repository.test.ts` project ref shape 断言；browser smoke 断言 `localOnly=true` 和 backend id。
- [x] S3 `listProjects()` 可看到已创建 project refs，并有稳定排序。
  - 证据：`repository.test.ts` stable sorting 测试。
- [x] S4 `writeObject` 返回 checksum、byteSize、updatedAt 和 backendId。
  - 证据：`repository.test.ts` write receipt 断言；browser smoke checksum 正则断言。
- [x] S5 `readObject` 返回原 bytes、checksum 和 metadata。
  - 证据：`repository.test.ts` 和 browser smoke 均读取并 decode bytes。
- [x] S6 `exists` 对存在/不存在对象分别返回 true/false。
  - 证据：`repository.test.ts` 和 browser smoke 删除前后断言。
- [x] S7 `listObjects` 支持 exact file 和 prefix subtree，并按 path 稳定排序。
  - 证据：`repository.test.ts` 覆盖 `.rxnflow/state` prefix 和 exact file。
- [x] S8 `deleteObject` 对存在和不存在对象都成功，删除后 `exists=false`。
  - 证据：`repository.test.ts` delete idempotency；browser smoke 删除后 `existsAfterDelete=false`。
- [x] S9 不同 `projectRef` 下相同 path 互相隔离。
  - 证据：`repository.test.ts` isolates identical paths。
- [x] S10 非法 path 抛结构化 `invalid_input`，target 为 `path`。
  - 证据：`types.test.ts` 和 `repository.test.ts`。
- [x] S11 缺失 object 的 `readObject` 抛 `object_not_found`，target 为 `path`。
  - 证据：`repository.test.ts` missing object 测试。
- [x] S12 IndexedDB 不可用时错误为 `storage_unavailable`，不静默退化成内存持久化。
  - 证据：jsdom 环境 `createBrowserProjectRepository` 测试。
- [x] S13 quota failure 可映射为 `storage_quota_exceeded`。
  - 证据：memory repository quota simulation 和 DOMException `QuotaExceededError` mapping 测试。
- [x] S14 `npm run test` 通过。
  - 证据：5 files / 20 tests passed。
- [x] S15 `npm run build` 通过。
  - 证据：`tsc -b && vite build` passed。
- [x] S16 真实浏览器 smoke 通过。
  - 证据：Chromium 页面上下文完成 create/write/read/list/delete，结果包含 expected checksum、byteSize、metadata 和 `existsAfterDelete=false`。

前端浏览器验证：

- [x] 本 feature 不新增可见 UI；仍按要求启动 Vite dev server 并在 `http://127.0.0.1:5173/` 真实浏览器环境验证 repository module 可动态 import，IndexedDB 操作通过。

## 4. 术语一致性

- Browser Project Repository：代码、design、architecture 和 roadmap 均指 Web 前端真实浏览器本地项目仓储。
- Browser Project Ref：代码类型为 `BrowserProjectRef`，不作为本地文件系统 path 使用。
- Browser Storage Object：代码类型为 `BrowserStorageObject`，语义是 project-relative path + bytes + checksum + metadata。
- IndexedDB Project Store：代码中 database 为 `rxnflow-browser-projects`，包含 `projects` 和 `objects` stores；当前不实现 OPFS。
- Repository Error：代码中为 `BrowserProjectRepositoryError`，不包装为 ShellResponse。
- 防冲突：`BrowserLocalProjectStorageBackend` 仍只出现在 Python 测试替身和文档中；Web repository 没有复用该名称。

## 5. 架构归并

- [x] `codestable/architecture/web-workbench.md`：已归并 Browser Project Repository 当前能力、模块职责、IndexedDB-first implementation、local-only 风险、未接 UI/bridge 边界和 QA 证据。
- [x] `codestable/architecture/ARCHITECTURE.md`：已把 Browser Project Repository 从未来概念更新为 Web 已落地 IndexedDB-first adapter，并补充 Browser Project Ref / Browser Storage Object 术语、模块索引和硬边界。
- [x] `AGENTS.md`：本 feature 未发现需要新增的通用项目级硬约束；Vite dev server 预览规则已存在。

## 6. requirement 回写

- [x] `requirement: project-content-persistence` 存在。
- [x] 已更新 `codestable/requirements/project-content-persistence.md`：新增 Web 早期用户故事，补充真实 Browser Project Repository 的解决方式、边界和变更日志。
- [x] 文档明确 Browser Project Repository 是 IndexedDB-first local-only adapter，不是云备份，也尚未接 Project Sidebar、bundle UI 或 Python bridge。

## 7. roadmap 回写

- [x] `roadmap: rxnflow-web-workbench-mvp` / `roadmap_item: web-local-project-repository` 均存在。
- [x] `codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-items.yaml` 中 `web-local-project-repository` 已从 `in-progress` 改为 `done`，feature 保持 `2026-05-16-web-local-project-repository`。
- [x] `codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-roadmap.md` 主文档对应模块和子 feature 清单状态已同步为 `done`。
- [x] roadmap items YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无新增候选。本 feature 没暴露新的每个后续 feature 都会重复踩的工作流规则；`cd web && npm run dev` 和 `http://127.0.0.1:5173/` 的预览要求已在 AGENTS.md 中存在。

## 9. 遗留

- 后续优化点：无新增 issue；下一步按 roadmap 继续 `web-project-sidebar`，把 repository 接入项目侧边栏的新建、打开、保存、bundle import/export 和 local-only / validation 状态展示。
- 已知限制：
  - Browser Project Repository 当前未接 UI；用户还不能从页面创建/打开/保存项目。
  - 当前未接 `project.create/open/save_content` bridge，Python core 不知道 IndexedDB 中的 project refs。
  - 当前不实现 OPFS、大文件 chunking、Worker、持久存储权限 UI 或云同步。
  - 当前不实现 `.rxnflow.zip` Web import/export UI；早期跨设备迁移路径仍需后续 feature 接入。
  - 当前 repository 保存 bytes，不解析 raw files，也不生成 ChemicalObject、ReactionGraph、EnergyProfile 或 ExportArtifact 领域真相。
- 实现阶段顺手发现：
  - Codex shell 的普通后台进程会被回收；长期预览本地 Vite 服务时可用 `screen -dmS rxnflow-vite ...`，但 AGENTS.md 已有核心预览命令，暂不新增规则。
