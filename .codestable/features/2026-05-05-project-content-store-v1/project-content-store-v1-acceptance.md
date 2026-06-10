# project-content-store-v1 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-05
> 关联方案 doc：.codestable/features/2026-05-05-project-content-store-v1/project-content-store-v1-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查。

**接口示例逐项核对**：

- [x] 保存 fixture snapshot：`ProjectContentStore.save_snapshot` 已落地，保存时先序列化 section，再写 `.rxnflow/state/*.json`，最后写 `project-content.json`。代码证据：`rxnflow/content_store.py:264`、`rxnflow/content_store.py:268`、`rxnflow/content_store.py:277`、`rxnflow/content_store.py:304`。
- [x] 跨实例加载 snapshot：`ProjectContentStore.load_snapshot` 从 index 读取 section 并恢复 ProjectContentSnapshot。代码证据：`rxnflow/content_store.py:314`、`rxnflow/content_store.py:325`、`rxnflow/content_store.py:332`、`rxnflow/content_store.py:344`。
- [x] 错误路径：`LocalProjectStorageBackend.write_object` 统一走安全 path 校验，unsafe path 返回 `invalid_input` 且 target 为 `path`。代码证据：`rxnflow/content_store.py:164`、`rxnflow/content_store.py:369`、`rxnflow/content_store.py:380`。

**名词层“现状 → 变化”逐项核对**：

- [x] ProjectContentIndex / ProjectContentFile：已定义 dataclass，字段符合方案。代码证据：`rxnflow/content_store.py:55`、`rxnflow/content_store.py:63`。
- [x] StorageObject / StorageObjectInfo / WriteReceipt：已定义 bytes 后端承载结构。代码证据：`rxnflow/content_store.py:71`、`rxnflow/content_store.py:79`、`rxnflow/content_store.py:87`。
- [x] ProjectStorageBackend：已定义 `read_object`、`write_object`、`exists`、`list_objects`、`delete_object` 协议。代码证据：`rxnflow/content_store.py:107`。
- [x] LocalProjectStorageBackend：已实现本地文件 backend，`backend_id = "local-filesystem-v1"`。代码证据：`rxnflow/content_store.py:134`。
- [x] ProjectContentSnapshot：已覆盖 project id、ChemicalObject、ReactionGraph、WorkspaceSnapshot、EnergyProfile，并保留 import/export 空集合字段。代码证据：`rxnflow/content_store.py:96`。
- [x] project_content_snapshot_from_fixture：已从 CoreFixtureResult 构造最小 WorkspaceSnapshot 和 snapshot。代码证据：`rxnflow/content_store.py:347`。

**流程图核对**：

- [x] save workflow 图中节点均有落点：snapshot 校验、section JSON、backend write、receipt checksum、index write。代码证据：`rxnflow/content_store.py:273`、`rxnflow/content_store.py:277`、`rxnflow/content_store.py:282`、`rxnflow/content_store.py:298`。
- [x] load workflow 图中节点均有落点：read index、schema/path 校验、read section、deserialize dataclasses、返回 snapshot。代码证据：`rxnflow/content_store.py:314`、`rxnflow/content_store.py:325`、`rxnflow/content_store.py:529`、`rxnflow/content_store.py:472`。

结论：接口契约与 design 一致。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 可构造 fixture ProjectContentSnapshot：测试覆盖 `project_content_snapshot_from_fixture`。证据：`tests/test_project_content_store_v1.py:88`。
- [x] 可写入 `.rxnflow/state/`：测试验证 index 和四个 section 文件存在。证据：`tests/test_project_content_store_v1.py:100`、`tests/test_project_content_store_v1.py:113`。
- [x] index deterministic，记录 kind/path/checksum/updated_at：代码使用固定时间和 sort_keys JSON；测试验证重复保存 checksum/path 稳定。证据：`rxnflow/content_store.py:38`、`rxnflow/content_store.py:395`、`tests/test_project_content_store_v1.py:118`。
- [x] 新实例可加载同样的对象、图谱、workspace 和 profile 摘要。证据：`tests/test_project_content_store_v1.py:125`。
- [x] 空 project_ref、unsafe path、不存在 index、不兼容 schema version、坏 JSON 返回 structured error。证据：`tests/test_project_content_store_v1.py:79`、`tests/test_project_content_store_v1.py:145`。

**明确不做逐项核对**：

- [x] 未持久化真实 ImportBatch / ParsePreview / ExportArtifact index；非空 import/export snapshot 直接 `invalid_input`。证据：`rxnflow/content_store.py:415`。
- [x] 未实现 IndexedDB / OPFS / 云存储 / 数据库 adapter。测试做源码范围守护。证据：`tests/test_project_content_store_v1.py:218`。
- [x] 未修改 `.rxnflow/manifest.json` schema，且保存 snapshot 不新增 ProjectResource。证据：`tests/test_project_content_store_v1.py:141`。
- [x] 未读取、复制、删除或解析 `inputs/raw/`，未调用 parser/import/registry/graph/energy/export 服务。证据：`tests/test_project_content_store_v1.py:214`。
- [x] 未新增 CLI/Web/desktop command，未实现 migration、增量保存、并发锁、冲突合并或 project bundle。证据：`tests/test_project_content_store_v1.py:218`。

**关键决策落地**：

- [x] Project Content 不进 manifest：内容写入 `.rxnflow/state/`，manifest 保持不变。证据：`tests/test_project_content_store_v1.py:98`、`tests/test_project_content_store_v1.py:141`。
- [x] backend 只认 bytes：ProjectStorageBackend 协议只接收/返回 StorageObject bytes 和 metadata。证据：`rxnflow/content_store.py:71`、`rxnflow/content_store.py:107`。
- [x] 首版恢复 fixture 级别完整内容：对象、图谱、workspace、profile 均可往返。证据：`tests/test_project_content_store_v1.py:130`。
- [x] 时间戳 deterministic：`PROJECT_CONTENT_TIME = "2026-05-05T00:00:00Z"`。证据：`rxnflow/content_store.py:39`。
- [x] 错误不 silent fallback：缺 index、坏 JSON、schema 不兼容、缺 section 均返回 error。证据：`tests/test_project_content_store_v1.py:145`。

**编排层变化核对**：

- [x] save workflow 已按“校验 snapshot → 序列化 section → 写 section files → 汇总 checksum → 写 index”落地。
- [x] load workflow 已按“读 index → 校验 schema/path → 读 section JSON → 反序列化 dataclass → 返回 snapshot”落地。
- [x] backend workflow 所有 logical path 统一走 `_validate_logical_path`。
- [x] fixture workflow 通过 `project_content_snapshot_from_fixture` 成为第一条端到端保存/加载证据。

**跨层纪律核对**：

- [x] 错误语义：`invalid_input` / `internal_error` 分支已落地。
- [x] 幂等性：重复保存同一 snapshot 得到相同 section checksums 和 index paths。
- [x] 顺序性：先写 section files，再写 index。
- [x] 文件边界：项目相对 POSIX path，拒绝绝对路径、`..`、反斜杠、空路径和 `.`。
- [x] 原子性：本地写入使用 `.tmp` 后 `replace`。
- [x] 可观测点：ProjectContentFile / WriteReceipt 记录 checksum、byte_size、backend_id 和 updated_at。
- [x] 扩展点：ProjectStorageBackend / ProjectContentStore 协议可被后续 browser backend、bundle backend、domain repositories 复用。

**挂载点反向核对（可卸载性）**：

- [x] 挂载点 M1：`.rxnflow/state/project-content.json` 与四个 section 文件路径。代码证据：`rxnflow/content_store.py:40`。
- [x] 挂载点 M2：`LocalProjectStorageBackend.backend_id = "local-filesystem-v1"`。代码证据：`rxnflow/content_store.py:134`。
- [x] 挂载点 M3：`ProjectContentStore.save_snapshot/load_snapshot/load_index`。代码证据：`rxnflow/content_store.py:264`。
- [x] 挂载点 M4：`project_content_snapshot_from_fixture`。代码证据：`rxnflow/content_store.py:347`。
- [x] 反向 grep：`ProjectContentStore`、`ProjectContentSnapshot`、`ProjectStorageBackend`、`project-content-v1` 的代码引用均落在 `rxnflow/content_store.py` 和对应测试内；架构/feature 文档引用属于落档。
- [x] 拔除沙盘推演：删除 `rxnflow/content_store.py`、`tests/test_project_content_store_v1.py` 和 feature 文档即可卸载本 feature；现有 ProjectStore、parser、registry、graph、workspace、energy、export、platform shell 不依赖该模块。

结论：行为与决策与 design 一致。

## 3. 验收场景核对

- [x] S1 构造 ProjectContentIndex / ProjectContentFile / ProjectContentSnapshot：单测通过。证据：`tests/test_project_content_store_v1.py:29`。
- [x] S2 LocalProjectStorageBackend 写入安全 path：文件落在项目目录内，WriteReceipt 含 checksum、byte_size、backend_id。证据：`tests/test_project_content_store_v1.py:49`。
- [x] S3 LocalProjectStorageBackend 读取已写文件：bytes 和 checksum 与写入一致。证据：`tests/test_project_content_store_v1.py:63`。
- [x] S4 unsafe path：绝对路径、`..`、反斜杠、空路径和 `.` 返回 `invalid_input/path`。证据：`tests/test_project_content_store_v1.py:79`。
- [x] S5 save_snapshot 保存 fixture snapshot：生成 project-content.json 和四个 section 文件。证据：`tests/test_project_content_store_v1.py:100`。
- [x] S6 ProjectContentIndex：schema version、project id、kind/path/checksum 均正确。证据：`tests/test_project_content_store_v1.py:103`。
- [x] S7 新实例 load_snapshot：恢复 project_id、object ids、graph id/path id、workspace graph id/active path、profile id/points。证据：`tests/test_project_content_store_v1.py:125`。
- [x] S8 重复 save：section checksum 和 index path 稳定。证据：`tests/test_project_content_store_v1.py:118`。
- [x] S9 load_index 缺失 project-content.json：返回 `invalid_input`，不生成空 index。证据：`tests/test_project_content_store_v1.py:151`。
- [x] S10 不兼容 schema version：返回 `invalid_input/schema_version`。证据：`tests/test_project_content_store_v1.py:154`。
- [x] S11 坏 JSON 或缺 section file：返回结构化 error。证据：`tests/test_project_content_store_v1.py:164`、`tests/test_project_content_store_v1.py:190`。
- [x] S12 save_snapshot 不修改 manifest、不新增 ProjectResource。证据：`tests/test_project_content_store_v1.py:141`。
- [x] S13 save/load 不调用 parser/import/registry/graph/energy/export 服务：源码范围守护通过。证据：`tests/test_project_content_store_v1.py:214`。
- [x] S14 现有全量 unittest 继续通过：`python3 -m unittest discover` 通过，111 tests OK。

前端改动：本 feature 无 UI / 浏览器改动，不需要浏览器肉眼验证。

执行过的验证命令：

- `python3 -m unittest tests.test_project_content_store_v1`：4 tests OK
- `python3 -m unittest discover`：111 tests OK
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-05-project-content-store-v1/project-content-store-v1-checklist.yaml --yaml-only`：passed
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml --yaml-only`：passed

## 4. 术语一致性

- Project Content：architecture、design、code 中均指 `.rxnflow/state/` 下的项目内容，不与 ProjectManifest 混用。
- Project Content Index：architecture、design、code 中均指 `.rxnflow/state/project-content.json`。
- Project Content Snapshot：architecture、design、code 中均指一次保存/加载的内容快照。
- Project Storage Backend：architecture、design、code 中均指按项目相对 path 读写 bytes 的后端协议。
- Local Project Storage Backend：architecture、design、code 中均指本地文件系统 backend，`backend_id = "local-filesystem-v1"`。
- Project Content Store：architecture、design、code 中均指 snapshot/index/backend 的编排服务。
- `project-content-v1`：architecture、design、code 中均作为 Project Content 首版 schema version。

防冲突核对：

- [x] 未把 Project Content 写进 `.rxnflow/manifest.json`。
- [x] 未把 ProjectContentStore 命名为 ProjectStore 或 ProjectManifest 扩展。
- [x] 未引入 IndexedDB/OPFS/云存储实现。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已补 Project Content、Project Content Index、Project Content Snapshot、Project Storage Backend 术语，补 Core Platform 摘要和当前决策/待补项。证据：`.codestable/architecture/ARCHITECTURE.md:18`、`.codestable/architecture/ARCHITECTURE.md:118`。
- [x] `.codestable/architecture/core-platform.md`：已补第十一类能力、模块树、`rxnflow.content_store` 模块职责、`.rxnflow/state/` 文件布局、ProjectContentStore 稳定协议、错误语义和约束边界。证据：`.codestable/architecture/core-platform.md:95`、`.codestable/architecture/core-platform.md:170`、`.codestable/architecture/core-platform.md:234`、`.codestable/architecture/core-platform.md:351`、`.codestable/architecture/core-platform.md:382`、`.codestable/architecture/core-platform.md:439`。
- [x] AGENTS.md：不更新。理由：本 feature 不新增通用命令、环境依赖或每个后续 feature 都会重复踩的工作流约束。

结论：没读过 design 的后续协作者只看 architecture，即可知道系统已有 Project Content Store 的最小持久化闭环、文件布局、API 形态和边界。

## 6. requirement 回写

- [x] 方案 frontmatter `requirement: null`。
- [x] 本 feature 是核心内部持久化基础能力，没有新增用户/agent 直接入口、CLI command、Web UI 或端侧打开项目流程。
- [x] 本次不新建 requirement。后续 `platform-shell-state-restore` 或真正的 project open/save 用户可见流程落地时，应 backfill 或更新对应 requirement。

结论：无 requirement 回写。

## 7. roadmap 回写

- [x] 方案 frontmatter 有 `roadmap: rxnflow-project-persistence` 和 `roadmap_item: project-content-store-v1`。
- [x] `.codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml` 中该 item 已从 `in-progress` 改为 `done`，feature 保持 `2026-05-05-project-content-store-v1`。
- [x] `.codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-roadmap.md` 第 5 节子 feature 清单已同步为 `状态：done` 和对应 feature。
- [x] roadmap items YAML 已通过校验。

结论：roadmap 已回写。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的内容。

理由：没有新增安装命令、长期环境约束、跨 feature 必踩坑或端侧启动步骤。现有 AGENTS.md 中的 `python3 -m unittest discover` 和 YAML 校验命令已覆盖本次验证。

## 9. 遗留

后续优化点：

- `rxnflow/content_store.py` 当前集中放置 dataclass、backend、store、fixture helper 和 JSON serializer；等后续 domain persistence feature 增多时，应拆出 section serializers/domain repositories。
- 后续 `chemical-object-persistence` 需要补 registry fingerprint、provenance/corrections 的完整长期 schema。
- 后续 `reaction-graph-workspace-persistence` 需要补非 fixture 图谱、workspace state、viewport/selection 的完整持久化。
- 后续 `import-ledger-persistence` 需要补 ImportBatch、ImportItem、ParsePreview、warnings/errors 的恢复语义。
- 后续 `platform-shell-state-restore` 才提供端侧 project.open/save_content 能力。

已知限制：

- 当前只保存/加载 fixture ProjectContentSnapshot，不等于完整项目数据库。
- 当前不做 migration、增量保存、并发锁、冲突合并、project bundle 或浏览器 IndexedDB/OPFS adapter。
- 当前不保存真实 ImportBatch、ParsePreview 或 ExportArtifact index。
- 当前没有 CLI/Web/desktop 命令接入 ProjectContentStore。

实现阶段顺手发现：

- 领域 dataclass 已足够跑通 fixture snapshot，但长期 JSON schema 仍需要逐类沉淀，特别是计算化学字段、校正项、热化学、多构象/多自旋态和 parser preview 恢复策略。
