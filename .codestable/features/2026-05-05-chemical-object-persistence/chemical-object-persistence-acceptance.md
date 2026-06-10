# chemical-object-persistence 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-06
> 关联方案 doc：.codestable/features/2026-05-05-chemical-object-persistence/chemical-object-persistence-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查。

**接口示例逐项核对**：

- [x] registry snapshot 到 ProjectContentSnapshot：`ChemicalRegistry.list_objects("project-a")` 返回已登记对象，调用方可放入 `ProjectContentSnapshot.chemical_objects` 并由 ProjectContentStore 保存。证据：`rxnflow/registry.py:89`、`tests/test_chemical_object_persistence.py:25`。
- [x] 从 ProjectContentSnapshot 恢复 registry：`ProjectContentStore.load_snapshot` 返回 ChemicalObject tuple，`ChemicalRegistry.restore_objects` 可重建 registry state。证据：`rxnflow/registry.py:103`、`tests/test_chemical_object_persistence.py:72`。
- [x] registry_fingerprint 往返：`ChemicalRegistry.register` 创建对象时写入 `registry_fingerprint`，`chemical-objects-v1` 保存/加载后仍一致。证据：`rxnflow/models.py:82`、`rxnflow/registry.py:70`、`rxnflow/chemical_object_codec.py:168`、`tests/test_chemical_object_persistence.py:57`。

**名词层“现状 → 变化”逐项核对**：

- [x] ChemicalObject 新增 `registry_fingerprint: str | None`，ChemicalObjectDraft 未新增该字段。证据：`rxnflow/models.py:77`。
- [x] ChemicalRegistry 新增 `list_objects(project_id)`。证据：`rxnflow/registry.py:89`。
- [x] ChemicalRegistry 新增 `restore_objects(project_id, objects, replace=False)`。证据：`rxnflow/registry.py:103`。
- [x] `chemical-objects-v1` codec 已抽出，提供 serialize/deserialize/validate 边界。证据：`rxnflow/chemical_object_codec.py:17`、`rxnflow/chemical_object_codec.py:45`。
- [x] ProjectContentStore 的 chemical_objects section 已接入长期 codec。证据：`rxnflow/content_store.py:431`、`rxnflow/content_store.py:591`。

**流程图核对**：

- [x] register → compute fingerprint → ChemicalObject(registry_fingerprint=...)：已落地。证据：`rxnflow/registry.py:50`、`rxnflow/registry.py:70`。
- [x] list_objects → ProjectContentSnapshot → codec → chemical-objects.json：已落地。证据：`rxnflow/registry.py:89`、`rxnflow/content_store.py:431`。
- [x] load_snapshot → codec deserialize → restore_objects → rebuild maps：已落地。证据：`rxnflow/content_store.py:591`、`rxnflow/registry.py:103`、`rxnflow/registry.py:140`。

结论：接口契约与 design 一致。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 真实 ChemicalRegistry 中的已登记 ChemicalObject 可保存为 `chemical-objects-v1` section。证据：`tests/test_chemical_object_persistence.py:25`。
- [x] label、formula、charge、spin、method、geometry、energies、thermochemistry、source_file_id、provenance、corrections 和 registry_fingerprint 均保存/加载。证据：`rxnflow/chemical_object_codec.py:133`、`rxnflow/chemical_object_codec.py:173`、`tests/test_chemical_object_persistence.py:67`。
- [x] 加载后可恢复 ChemicalRegistry，并保留重复 register 幂等索引。证据：`tests/test_chemical_object_persistence.py:72`。
- [x] 坏 schema、project id 不匹配、缺 id/source_file_id、裸 energy、unsupported unit、重复 object/fingerprint/correction 冲突均返回 structured error。证据：`tests/test_chemical_object_persistence.py:88`、`tests/test_chemical_object_persistence.py:180`。
- [x] ProjectContentStore 不改 manifest、不登记 ProjectResource、不读 raw file、不调用 parser/import/graph/energy/export。证据：`tests/test_chemical_object_persistence.py:82`、`tests/test_chemical_object_persistence.py:220`。

**明确不做逐项核对**：

- [x] 未新增 ReactionGraph、WorkspaceSnapshot、ImportBatch、ParsePreview、EnergyProfile 或 ExportArtifact index 的完整新 schema。
- [x] 未把 ChemicalObject 写入 manifest 或 ProjectResource。
- [x] 未做 source_file_id 跨 manifest/import ledger 深校验。
- [x] 未重新 parse raw file，未按 parser version 自动刷新对象。
- [x] 未做 formula/label/energy/geometry 自动合并。
- [x] 未计算 corrected total energy，未改写 `energies` / `thermochemistry`。
- [x] 未新增 CLI/Web/desktop command、browser/cloud adapter、project bundle 或 migration。

**关键决策落地**：

- [x] registry_fingerprint 放在 Registered ChemicalObject 上，不进 ChemicalObjectDraft。证据：`rxnflow/models.py:77`。
- [x] ChemicalRegistry 暴露 snapshot/restore 入口。证据：`rxnflow/registry.py:89`、`rxnflow/registry.py:103`。
- [x] restore 不调用 register，直接重建 `_RegistryState.objects` 和 `fingerprint_to_object_id`。证据：`rxnflow/registry.py:125`、`rxnflow/registry.py:159`。
- [x] `chemical-objects-v1` 提升为带 validation 的 codec。证据：`rxnflow/chemical_object_codec.py:17`。
- [x] source_file_id 只保存和非空校验，不做深校验。证据：`rxnflow/chemical_object_codec.py:97`。

**编排层变化核对**：

- [x] register workflow 写入 object field 和 fingerprint index。
- [x] save workflow 使用调用方 snapshot/registry list_objects 的 ChemicalObject 并写入 `chemical-objects-v1`。
- [x] load workflow 返回带 registry_fingerprint 的 ChemicalObject。
- [x] restore workflow 按 object id 和 registry_fingerprint 重建 registry state。

**跨层纪律核对**：

- [x] 错误语义：所有设计列出的 invalid_input 分支均有测试。
- [x] 幂等性：重复 save checksum 稳定；重复 restore 不追加；restore 后重复 register 复用对象。
- [x] 顺序性：对象和 corrections 按输入顺序保存/加载。
- [x] 来源追踪：provenance 原样保存 parser_id、parser_version、source_file_id、parsed_at。
- [x] Correction 纪律：保存/加载保留 append-only correction 记录；冲突 correction id 返回 error。
- [x] 扩展点：source_file_id / registry_fingerprint 已可供后续 import ledger 和 validation/migration 使用。

**挂载点反向核对（可卸载性）**：

- [x] 挂载点 M1：`ChemicalObject.registry_fingerprint`。证据：`rxnflow/models.py:82`。
- [x] 挂载点 M2：`ChemicalRegistry.list_objects` / `restore_objects`。证据：`rxnflow/registry.py:89`、`rxnflow/registry.py:103`。
- [x] 挂载点 M3：`chemical-objects-v1` codec。证据：`rxnflow/chemical_object_codec.py:17`、`rxnflow/chemical_object_codec.py:45`。
- [x] 挂载点 M4：ProjectContentStore chemical_objects section 使用长期 codec。证据：`rxnflow/content_store.py:13`、`rxnflow/content_store.py:431`、`rxnflow/content_store.py:591`。
- [x] 反向 grep：本 feature 的新增代码引用集中在 `models.py`、`registry.py`、`chemical_object_codec.py`、`content_store.py` 和对应测试，均落在挂载点清单内。
- [x] 拔除沙盘推演：回退 `ChemicalObject.registry_fingerprint`、`ChemicalRegistry.list/restore`、`rxnflow.chemical_object_codec`、ProjectContentStore codec 接入和新测试即可卸载本 feature；parser/import/graph/energy/export 无业务依赖残留。

结论：行为与决策与 design 一致。

## 3. 验收场景核对

- [x] S1 register 返回的 ChemicalObject 带非空 registry_fingerprint，且重复 register 仍复用索引。证据：`tests/test_chemical_registry_corrections.py:26`、`tests/test_chemical_object_persistence.py:78`。
- [x] S2 list_objects 返回项目对象，未知项目不抛异常。证据：`tests/test_chemical_registry_corrections.py:104`。
- [x] S3 restore_objects 后新 registry 可 get_object。证据：`tests/test_chemical_registry_corrections.py:104`。
- [x] S4 restore 后再次 register 同一 ParseResult 不创建重复对象。证据：`tests/test_chemical_object_persistence.py:78`。
- [x] S5 save_snapshot 保存含 corrections 的 ChemicalObject，section 保留 corrections、unit、provenance、fingerprint。证据：`tests/test_chemical_object_persistence.py:57`。
- [x] S6 load_snapshot 后 ChemicalObject / EnergyValue / Correction / Provenance / fingerprint 往返一致。证据：`tests/test_chemical_object_persistence.py:67`。
- [x] S7 重复保存 section checksum 稳定，index path/kind 不变。证据：`tests/test_chemical_object_persistence.py:60`。
- [x] S8 schema_version 错误返回 invalid_input。证据：`tests/test_chemical_object_persistence.py:88`。
- [x] S9 section project_id 与 index 不一致返回 invalid_input。证据：`tests/test_chemical_object_persistence.py:88`。
- [x] S10 object 缺 id/source_file_id 返回 invalid_input。证据：`tests/test_chemical_object_persistence.py:88`、`tests/test_chemical_object_persistence.py:180`。
- [x] S11 energy / thermochemistry / correction energy 使用裸 float 或缺 unit 返回 invalid_input。证据：`tests/test_chemical_object_persistence.py:88`。
- [x] S12 unsupported energy unit 返回 invalid_input。证据：`tests/test_chemical_object_persistence.py:88`。
- [x] S13 同一 section 内重复 object id 返回 invalid_input。证据：`tests/test_chemical_object_persistence.py:88`。
- [x] S14 同一 registry_fingerprint 指向不同 object id 返回 invalid_input。证据：`tests/test_chemical_object_persistence.py:88`、`tests/test_chemical_registry_corrections.py:128`。
- [x] S15 同一对象内重复 correction id 且 payload 不同返回 invalid_input。证据：`tests/test_chemical_object_persistence.py:88`。
- [x] S16 save/load 不修改 manifest、不新增 ProjectResource、不读 inputs/raw。证据：`tests/test_chemical_object_persistence.py:82`。
- [x] S17 不调用 ParserRegistry、ImportRegistryWorkflow、ReactionGraphService、EnergyProfileEngine 或 ReportExportService。证据：`tests/test_chemical_object_persistence.py:220`。
- [x] S18 现有全量测试继续通过：`python3 -m unittest discover` 通过，117 tests OK。

前端改动：本 feature 无 UI / 浏览器改动，不需要浏览器肉眼验证。

执行过的验证命令：

- `python3 -m unittest tests.test_chemical_object_persistence`：4 tests OK
- `python3 -m unittest tests.test_project_content_store_v1`：4 tests OK
- `python3 -m unittest tests.test_chemical_registry_corrections`：14 tests OK
- `python3 -m unittest discover`：117 tests OK
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-05-chemical-object-persistence/chemical-object-persistence-checklist.yaml --yaml-only`：passed
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml --yaml-only`：passed

## 4. 术语一致性

- Chemical Object Persistence：代码以 `chemical_object_codec` 和 `chemical-objects-v1` 表达，没有另起平行对象仓储名。
- Stored ChemicalObject：代码仍用 `ChemicalObject` dataclass 作为传输对象，JSON section 是持久化表达。
- Registry Fingerprint：代码字段为 `registry_fingerprint`，用途仅为 registry 幂等恢复。
- Chemical Registry Restore：代码接口为 `restore_objects`，不调用 ParserRegistry 或 register。
- append-only Correction Persistence：corrections 按 tuple/list 顺序保存和加载，未计算 corrected total。
- chemical-objects-v1：代码常量与 section schema 一致。

防冲突核对：

- [x] 未把 registry_fingerprint 命名为 molecular fingerprint 或化学相似度指纹。
- [x] 未把 Stored ChemicalObject 实现为和 ChemicalObject 并行的长期 dataclass。
- [x] 未把 ChemicalObject 写进 ProjectManifest / ProjectResource。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已补 ChemicalObject registry_fingerprint、ChemicalRegistry restore、chemical-objects-v1 长期 section 和错误语义。证据：`.codestable/architecture/ARCHITECTURE.md:80`、`.codestable/architecture/ARCHITECTURE.md:121`。
- [x] `.codestable/architecture/core-platform.md`：已补 ChemicalRegistry list/restore API、`rxnflow.chemical_object_codec`、`chemical-objects-v1` 字段协议、错误语义和范围边界。证据：`.codestable/architecture/core-platform.md:132`、`.codestable/architecture/core-platform.md:192`、`.codestable/architecture/core-platform.md:262`、`.codestable/architecture/core-platform.md:385`。
- [x] AGENTS.md：不更新。理由：本 feature 不新增通用命令、环境依赖或每个后续 feature 都会重复踩的工作流约束。

结论：没读过 design 的后续协作者只看 architecture，即可知道 ChemicalObject 现在可长期持久化、如何恢复 registry state、错误边界在哪里。

## 6. requirement 回写

- [x] 方案 frontmatter `requirement: null`。
- [x] 本 feature 是项目内容持久化的内部领域基础能力，没有新增用户/agent 直接命令、UI 或端侧打开项目流程。
- [x] 本次不新建 requirement。后续 `platform-shell-state-restore` 或项目打开/保存用户可见流程落地时，应 backfill 或更新对应 requirement。

结论：无 requirement 回写。

## 7. roadmap 回写

- [x] 方案 frontmatter 有 `roadmap: rxnflow-project-persistence` 和 `roadmap_item: chemical-object-persistence`。
- [x] `.codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml` 中该 item 已从 `in-progress` 改为 `done`，feature 保持 `2026-05-05-chemical-object-persistence`。
- [x] `.codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-roadmap.md` 第 5 节子 feature 清单已同步为 `状态：done` 和对应 feature。
- [x] roadmap items YAML 已通过校验。

结论：roadmap 已回写。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的内容。

理由：没有新增安装命令、长期环境约束、跨 feature 必踩坑或端侧启动步骤。现有 AGENTS.md 的 unittest 和 YAML 校验命令仍覆盖本次验证。

## 9. 遗留

后续优化点：

- 后续 `reaction-graph-workspace-persistence` 需要把 ReactionGraph/WorkspaceSnapshot 从基础 snapshot 提升为长期 schema，并校验 object id 引用。
- 后续 `import-ledger-persistence` 需要保存 ParsePreview / ImportBatch，并和 ChemicalObject.source_file_id 建立恢复语义。
- 后续 `project-content-validation-migration` 需要深校验 source_file_id 是否存在于 manifest/import ledger，并处理 schema migration。
- 后续如 thermochemistry 要表达非能量单位，需要先扩展领域模型；当前仍沿用 `EnergyValue` 支持的能量单位。

已知限制：

- `chemical-objects-v1` 不重新 parse raw file，不根据 parser version 自动刷新对象。
- `registry_fingerprint` 只用于同来源同 draft 内容幂等恢复，不用于化学相似合并。
- 当前没有对象删除、重命名、手动合并、版本历史、增量保存、并发锁或冲突合并。
- 当前没有 CLI/Web/desktop command 接入 ChemicalRegistry restore。

实现阶段顺手发现：

- `rxnflow/content_store.py` 仍集中承载 graph/workspace/profile 的私有 serializer；本次只抽出了 ChemicalObject codec，后续 domain persistence features 应继续拆出对应 codec。
