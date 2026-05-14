---
doc_type: feature-acceptance
feature: 2026-05-14-browser-local-storage-adapter
status: accepted
accepted_at: 2026-05-14
summary: 验收浏览器本地 ProjectStorageBackend 核心协议测试替身，确认 backend contract、ProjectContentStore 集成、quota 模型、文档和 roadmap 回写均已落地
tags: [browser-storage, persistence, acceptance, storage-backend]
---

# Browser Local Storage Adapter 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-14
> 关联方案 doc：`codestable/features/2026-05-14-browser-local-storage-adapter/browser-local-storage-adapter-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `BrowserLocalProjectStorageBackend`
  - 代码落点：`rxnflow/browser_storage.py`
  - 结果：一致。实现 `read_object`、`write_object`、`exists`、`list_objects`、`delete_object`，`backend_id = "browser-local-indexeddb-opfs-test-v1"`。
- [x] `ProjectContentStore(BrowserLocalProjectStorageBackend()).save_snapshot/load_snapshot`
  - 代码落点：`rxnflow/content_store.py` 的 backend 注入协议 + `rxnflow/browser_storage.py`
  - 结果：一致。`ProjectContentStore` 无新增分支即可保存和加载 fixture snapshot。
- [x] quota 错误语义
  - 代码落点：`rxnflow/browser_storage.py`
  - 结果：一致。超出 quota 返回 `storage_quota_exceeded`，target=`quota`，details 包含 `quota_bytes`、`requested_bytes`、`current_bytes`。

**名词层变化核对**

- [x] Browser Local Storage Backend：已作为独立模块落地，不写入 `ProjectContentStore`。
- [x] Origin-local Project Ref：`project_ref` 只做非空校验并作为 opaque key 使用，不解释为本地目录。
- [x] Object Record：以 `(project_ref, path)` 隔离，保存 bytes、checksum、metadata。
- [x] Metadata Index / Payload Store：当前用内存结构模拟，文档明确真实 IndexedDB / OPFS adapter 后续再接。
- [x] Local-only Storage：backend_id、架构文档和开发者指南均标注不是云同步。

**流程图核对**

- [x] `ProjectContentStore -> ProjectStorageBackend -> BrowserLocalProjectStorageBackend` 调用链已成立。
- [x] Browser backend 内部 metadata/payload test double 到 `StorageObjectInfo`、`WriteReceipt`、`StorageObject` 的返回路径已落地。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] 非文件系统 project_ref 可保存项目内容：`test_project_content_store_saves_and_loads_snapshot_with_browser_backend` 覆盖。
- [x] 浏览器方向 storage backend contract 可测：`test_object_lifecycle_is_isolated_and_sorted` 和 quota 测试覆盖。
- [x] ProjectContent validation 可复用 backend：`test_project_content_validation_reads_manifest_and_artifact_bytes_from_browser_backend` 覆盖。

**明确不做逐项核对**

- [x] 不实现真实 JS/TS IndexedDB / OPFS adapter、Service Worker、Web Worker、React/Next route、文件选择器或拖拽 UI：scope guard 与代码 review 确认未引入。
- [x] 不实现云存储、账号权限、团队协作、冲突合并、CRDT 或跨设备同步：代码只在 Python backend 实例内保存对象。
- [x] 不修改 Project Content JSON schema：未修改 `ProjectContentIndex`、section codecs 或 schema version。
- [x] 不替代 Project Bundle：文档仍把 `.rxnflow.zip` 作为早期 Web 手动备份路径。
- [x] 不让 `ProjectContentStore` 理解 IndexedDB、OPFS、quota 或浏览器 API：scope guard 检查 `rxnflow/content_store.py` 无相关分支。
- [x] 不调用 parser/import/registry/graph/energy/export/bundle 服务：`rxnflow/browser_storage.py` 只依赖 content_store DTO、errors、Result 和标准库。

**关键决策落地**

- [x] 复用 ProjectStorageBackend 协议：Browser backend 对外方法与 protocol 一致。
- [x] 第一版是核心协议替身：模块名和文档均说明 test double，不是真实浏览器 API adapter。
- [x] project_ref 是 opaque origin-local key：相同 path 在 `project-a` / `project-b` 中互相隔离。
- [x] path 规则与本地 backend 对齐：拒绝绝对路径、空路径、`.`、`..` 和反斜杠。
- [x] 对象生命周期与本地 backend 对齐：write/read/exists/list/delete 语义测试覆盖。
- [x] checksum 以 bytes 为锚点：每次写入基于 bytes 计算 `sha256:`。
- [x] list_objects 稳定排序：测试断言 prefix list 顺序。
- [x] quota 分支可测：失败写入不覆盖，replace/delete 后用量按当前 records 计算。
- [x] 不接 Platform Shell 命令：`rxnflow/platform.py` 与 `rxnflow/cli.py` 未改。

**挂载点反向核对**

- [x] 挂载点 M1：`rxnflow.browser_storage` 新模块。删除该模块后 Browser Local Storage Backend 能力消失。
- [x] 挂载点 M2：storage path / checksum helper 仍在模块内局部实现，未把浏览器语义放进 `ProjectContentStore`。
- [x] 挂载点 M3：`tests/test_browser_local_storage_adapter.py` 覆盖非文件系统 backend、ProjectContentStore 集成、quota 和 scope guard。
- [x] 挂载点 M4：CodeStable docs 和 `docs/dev/browser-local-storage-backend.md` 已同步。
- [x] 反向 grep：`BrowserLocalProjectStorageBackend`、`browser_storage`、`storage_quota_exceeded` 命中均落在模块、测试和文档内。
- [x] 拔除沙盘推演：删除 `rxnflow/browser_storage.py`、对应测试和 docs 后，本功能无运行时入口残留；ProjectContentStore/Platform Shell/CLI 不需要修改回退。

## 3. 验收场景核对

- [x] **S1**：创建 backend，写入 `.rxnflow/state/chemical-objects.json` 后 receipt backend_id 正确且 checksum 以 `sha256:` 开头。
  - 证据：`test_object_lifecycle_is_isolated_and_sorted`
- [x] **S2**：同一 project_ref 读取刚写入对象，bytes/checksum/metadata 一致。
  - 证据：`test_object_lifecycle_is_isolated_and_sorted`
- [x] **S3**：ProjectContentStore 用 browser backend 保存/加载 fixture snapshot。
  - 证据：`test_project_content_store_saves_and_loads_snapshot_with_browser_backend`
- [x] **S4**：不同 project_ref 相同 path 互相隔离。
  - 证据：`test_object_lifecycle_is_isolated_and_sorted`
- [x] **S5**：重复写同一 `(project_ref, path)` 替换 bytes/checksum，不生成重复 list entry。
  - 证据：`test_object_lifecycle_is_isolated_and_sorted`
- [x] **S6**：prefix list 只返回 `.rxnflow/state` 下对象，并按 path 排序。
  - 证据：`test_object_lifecycle_is_isolated_and_sorted`
- [x] **S7**：validation 能通过 browser backend 读取 manifest/export artifact bytes 并校验 checksum。
  - 证据：`test_project_content_validation_reads_manifest_and_artifact_bytes_from_browser_backend`
- [x] **S8**：空 project_ref 返回 `invalid_input` target=`project_ref`。
  - 证据：`test_backend_contract_skeleton_rejects_unsafe_keys`
- [x] **S9**：unsafe path 返回 `invalid_input` target=`path`。
  - 证据：`test_backend_contract_skeleton_rejects_unsafe_keys`
- [x] **S10**：读取不存在对象返回 `invalid_input` target=`path`，exists 返回 False。
  - 证据：`test_object_lifecycle_is_isolated_and_sorted`
- [x] **S11**：delete 不存在对象返回 ok。
  - 证据：`test_object_lifecycle_is_isolated_and_sorted`
- [x] **S12**：quota 超限返回 `storage_quota_exceeded` 且不部分覆盖。
  - 证据：`test_quota_failure_does_not_partially_overwrite_and_releases_after_replace_or_delete`
- [x] **S13**：replace/delete 后 quota 用量按当前 records 计算。
  - 证据：`test_quota_failure_does_not_partially_overwrite_and_releases_after_replace_or_delete`
- [x] **S14-S17**：ProjectContentStore 无 browser 分支、无 UI/cloud/domain service coupling、无 CLI/Shell/Web route。
  - 证据：`test_scope_guard_no_ui_cloud_or_domain_service_coupling` + source review。
- [x] **S18**：现有 Project Store、Project Bundle、Platform Shell restore/save 和 Project Content codec 行为继续通过。
  - 证据：`python3 -m unittest discover`，173 tests OK。

前端改动：无。

## 4. 术语一致性

- Browser Local Storage Backend：代码名 `BrowserLocalProjectStorageBackend` 与设计一致。
- Origin-local Project Ref：实现中保留 `project_ref` 命名，文档解释为 origin-local key。
- Object Record：内部 `_ObjectRecord` 保存 bytes/checksum/metadata，与术语一致。
- Metadata Index / Payload Store：实现为内存 dict/bytes test double，开发指南明确真实浏览器实现后续接入。
- Local-only Storage：架构、需求和开发指南均明确不是云同步。
- 防冲突：`ProjectContentStore` 未出现 IndexedDB、OPFS 或 browser quota 分支；未新增真实 Web/cloud/desktop 命令入口。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`
  - 已补 Browser Local Storage Backend 术语、Project Storage Backend 当前形态、Core Platform 索引和关键架构决定。
- [x] `codestable/architecture/core-platform.md`
  - 已把能力从十二类扩展到十三类；补 Browser Local Storage Backend 当前能力、模块树、`rxnflow.browser_storage` 模块说明、协议、quota 错误语义和边界。
- [x] `docs/dev/browser-local-storage-backend.md`
  - 已补开发者指南，说明如何注入 backend、quota 模拟和不做事项。
- [x] `docs/dev/platform-project-open-save.md`
  - 已把 browser local storage adapter 从“后续 roadmap item”更新为“已有核心协议测试替身，真实 JS/TS adapter 和 UI 仍后续”。
- [x] `AGENTS.md`
  - 不需要更新。本 feature 没有新增跨所有后续任务都必须遵守的协作规则。

## 6. requirement 回写

- [x] `codestable/requirements/project-content-persistence.md`
  - 已补 Web 壳层/浏览器本地 backend 测试替身用户故事。
  - 已补 BrowserLocalProjectStorageBackend 的解决方式。
  - 已把“当前不提供浏览器本地存储 adapter”边界改为“不提供真实 JS IndexedDB / OPFS adapter、真实 UI、持久存储权限交互”。
  - 已补浏览器本地存储不是云备份、仍需 `.rxnflow.zip` 手动备份的边界和变更日志。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml`
  - `browser-local-storage-adapter` 已从 `in-progress` 改为 `done`，feature 指向 `2026-05-14-browser-local-storage-adapter`。
- [x] `codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-roadmap.md`
  - 第 5 节子 feature 清单已同步状态为 done 和对应 feature。
  - roadmap frontmatter 已改为 `status: completed`，观察项补充真实 Web UI / JS adapter 需另起前端 roadmap。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新环境、工具或工作流规则。

## 9. 遗留

- 后续优化点：真实 Web UI、真实 JavaScript IndexedDB / OPFS adapter、StorageManager.persist 权限交互和本地数据管理界面需要另起前端 roadmap。
- 已知限制：BrowserLocalProjectStorageBackend 当前是 Python 内存测试替身，不保存到磁盘。
- 已知限制：浏览器本地存储不是云备份，早期 Web 版本仍需引导用户导出 `.rxnflow.zip`。
- 实现阶段顺手发现：无需要另开 issue 的意外问题。
