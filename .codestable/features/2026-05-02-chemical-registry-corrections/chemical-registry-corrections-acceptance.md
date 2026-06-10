# chemical-registry-corrections 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-04
> 关联方案 doc：`.codestable/features/2026-05-02-chemical-registry-corrections/chemical-registry-corrections-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `ChemicalRegistry.register(project_id, parse_result)`：输入 `ParseResult`，返回 `ChemicalObject[]`，保留 draft 字段、source_file_id、provenance、空 corrections。代码落点：`rxnflow/registry.py::ChemicalRegistry.register`；证据：`tests/test_chemical_registry_corrections.py::test_register_single_draft_preserves_fields_and_provenance`。
- [x] 重复 `register` 同一 `ParseResult`：返回既有对象，不增加对象数量。代码落点：`ChemicalRegistry.register` 的 fingerprint 分支；证据：`test_repeated_register_in_same_project_is_idempotent`。
- [x] `ChemicalRegistry.apply_correction(project_id, object_id, correction)`：追加 correction 并返回更新对象，原始 energies 不被改写。代码落点：`rxnflow/registry.py::ChemicalRegistry.apply_correction`；证据：`test_apply_all_correction_kinds_appends_without_rewriting_energy`。
- [x] `ChemicalRegistry.get_object(project_id, object_id)`：已登记对象可读取，不存在对象返回 `invalid_input`。代码落点：`rxnflow/registry.py::ChemicalRegistry.get_object`；证据：`test_register_single_draft_preserves_fields_and_provenance`、`test_get_missing_object_returns_invalid_input`。

**名词层"现状 → 变化"逐项核对**：

- [x] `ChemicalObjectDraft`、`ChemicalObject`、`Correction`、`Provenance` 复用现有模型，没有另起并行结构。
- [x] 新增 `ChemicalRegistry` 服务，按 project id 持有对象 state 和 fingerprint 索引。
- [x] `register_fixture_objects` 保留原有 fixture 入口，`run_core_fixture_vertical_slice()` 回归测试通过。

**流程图核对**：

- [x] `ParseResult -> register -> draft loop -> fingerprint -> reuse/create -> return ChemicalObject[]` 在 `ChemicalRegistry.register` 中落地。
- [x] `apply_correction -> lookup object -> correction id check -> append/reuse/error` 在 `ChemicalRegistry.apply_correction` 中落地。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 接收 `ParseResult(ChemicalObjectDraft[], provenance)` 并返回带稳定 id 的 `ChemicalObject[]`：单 draft 和多 draft 测试通过。
- [x] 按 project id 管理已登记对象并通过 object id 读取：跨 project 隔离测试通过。
- [x] 追加 `Correction(kind, energy, note, created_at)` 并保留历史：三类 correction 测试通过。
- [x] 同项目同来源同内容重复登记幂等去重：重复登记对象数量不增加。

**明确不做逐项核对**：

- [x] 未持久化 ChemicalObject 到项目目录；registry 只维护内存 state。
- [x] 未把 ChemicalObject 写进 Project Manifest resource；grep 未发现 registry 调用 Project Store 或 `.rxnflow` 写入。
- [x] 未实现 UI、批量导入 workflow 或手动合并弹窗。
- [x] 未基于 formula、label、energy 接近或 geometry 相似度自动合并对象；formula 相同但来源不同的对象保留为两条。
- [x] 未计算 corrected total energy；`apply_correction` 不改写 `ChemicalObject.energies`。
- [x] 未改 parser plugin 输出格式；parser 仍输出 `ChemicalObjectDraft`。

**关键决策落地**：

- [x] Registry 独立于 Parser Plugins 和 Project Store：运行时只通过 `ParseResult` 类型边界接收数据；plugin 实现类无导入。
- [x] ChemicalObject id 由 registry 生成：`_object_id(project_id, fingerprint)` 负责生成项目内 id。
- [x] 基础去重只做幂等去重：fingerprint 包含 source_file_id、parser_id、parser_version、draft_index 和 draft 内容。
- [x] Correction append-only：追加时用 dataclass `replace` 返回新对象，不修改原始 energies。
- [x] Correction 使用现有 `EnergyValue`，没有新增 eV correction unit。

**挂载点核对与拔除沙盘**：

- [x] Chemical Registry 公开入口：`rxnflow.registry.ChemicalRegistry`。
- [x] Registry state：`_RegistryState.objects` 和 `fingerprint_to_object_id`。
- [x] Correction append 入口：`ChemicalRegistry.apply_correction`。
- [x] Fixture 兼容入口：`register_fixture_objects` 保留。
- [x] 反向 grep：本 feature 代码引用集中在 `rxnflow/registry.py` 和 `tests/test_chemical_registry_corrections.py`，未发现清单外挂载点。
- [x] 拔除推演：删除 `ChemicalRegistry`、`_RegistryState`、fingerprint helpers 和新测试后，fixture registry 仍可独立存在；本 feature 无持久化残留。

## 3. 验收场景核对

- [x] **S1**：单 draft ParseResult → 一个 ChemicalObject，保留 draft 字段、source_file_id 和 provenance。证据：单测。
- [x] **S2**：多 draft ParseResult → 多个 ChemicalObject，id 不冲突且顺序稳定。证据：单测。
- [x] **S3**：同 project 重复登记同一 ParseResult → 返回既有对象，数量不增加。证据：单测。
- [x] **S4**：不同 project 登记同一 ParseResult → project-scoped 对象互不共享 state。证据：单测。
- [x] **S5**：formula 相同但 source/provenance 不同 → 不自动合并。证据：单测。
- [x] **S6**：`get_object` 成功/失败路径。证据：单测。
- [x] **S7**：追加 solvation/resonance/manual correction，原始 energies 不改写。证据：单测。
- [x] **S8**：同 id 同 payload correction 幂等。证据：单测。
- [x] **S9**：同 id 不同 payload correction 返回 `invalid_input`。证据：单测。
- [x] **S10**：空 `ParseResult.objects` 返回 `invalid_input` 且不创建 project state。证据：单测。
- [x] **S11**：`run_core_fixture_vertical_slice()` 行为不变。证据：单测和全量测试。

本 feature 无前端改动，不需要浏览器验证。

## 4. 术语一致性

- Chemical Registry：代码命中 `ChemicalRegistry`，与方案一致。
- Registered ChemicalObject：代码使用 `ChemicalObject` 承载已登记对象，与现有模型一致。
- Source Provenance：代码复制 `ParseResult.provenance`，不重写 parser id/version/parsed_at。
- Correction：代码复用 `Correction` dataclass，append-only 行为一致。
- Registry Fingerprint：代码使用 `_registry_fingerprint` 表达项目内基础去重指纹。
- 防冲突：未新增与 Parser Plugin、Project Store、ReactionGraph、EnergyProfile 同名并行概念。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：补入 Chemical Registry 术语、当前已落地模块、关键架构决定和基础去重/Correction 边界。
- [x] `.codestable/architecture/core-platform.md`：补入第四类当前能力、ChemicalRegistry 模块职责、状态协议、错误语义和约束边界。
- [x] 架构归并后，未读过 design 的读者可以从 architecture 了解 registry 的输入、输出、去重、correction 行为和与 parser/store/graph/energy 的边界。

## 6. requirement 回写

- [x] 方案 frontmatter `requirement: null`。
- [x] 本 feature 暂无 UI/CLI 入口，用户不能直接触发该能力；它是后续 import workflow、reaction graph 和 energy engine 的核心服务前置，因此不在本阶段 backfill 用户需求文档。

## 7. roadmap 回写

- [x] 方案 frontmatter `roadmap: rxnflow-core-platform`、`roadmap_item: chemical-registry-corrections`。
- [x] `.codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-items.yaml` 中该条已从 `in-progress` 改为 `done`，feature 保持 `2026-05-02-chemical-registry-corrections`。
- [x] `.codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-roadmap.md` 子 feature 清单已同步为 `done` 并填写对应 feature。
- [x] roadmap YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露新的环境命令、代理配置、本地服务步骤或反复会踩的仓库工作流约定。

## 9. 遗留

- 后续优化点：ChemicalObject、ReactionGraph、EnergyProfile 的内容持久化格式仍待后续 feature 决策。
- 后续优化点：化学意义上的对象合并、构象/计算水平判定和用户确认 merge workflow 留给 import/registry 后续能力。
- 已知限制：Correction 当前只记录 additive energy correction，不计算 corrected total energy。
- 已知限制：ChemicalRegistry 当前为内存 state，不跨进程持久化。
- 实现阶段顺手发现：无。
