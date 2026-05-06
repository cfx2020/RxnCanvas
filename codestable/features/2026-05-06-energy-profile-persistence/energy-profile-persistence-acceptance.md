# energy-profile-persistence 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-07
> 关联方案 doc：codestable/features/2026-05-06-energy-profile-persistence/energy-profile-persistence-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查，结论：接口契约与实现一致。

**接口示例逐项核对**：

- [x] 保存 computed profiles：`ProjectContentSnapshot.energy_profiles` 被 `ProjectContentStore.save_snapshot` 接收，并通过 `energy_profiles_section_to_dict` 写入 `energy-profiles.json`；`tests/test_energy_profile_persistence.py::test_content_store_persists_energy_profiles_with_stable_checksum` 覆盖。
- [x] 恢复后供 export 使用：`ProjectContentStore.load_snapshot` 先恢复 ReactionGraph，再用 `energy_profiles_section_from_dict` 恢复 EnergyProfile；测试断言 restored profile id 和 relative energy。
- [x] missing point 往返：missing point 保留 `missing_reason`，absolute/relative energy 均为 None；`test_engine_profile_with_missing_point_and_warning_round_trips` 覆盖。

**名词层“现状 → 变化”逐项核对**：

- [x] Energy Profile section codec：新增 `rxnflow.energy_profile_codec`，提供 `energy-profiles-v1` serialize/deserialize/validate 边界。
- [x] ProjectContentStore energy_profiles section：`content_store.py` 调用独立 codec，不再保留内联 energy profile serializer。
- [x] Stored EnergyProfile / Options / Point / Warning：codec 保存 id、graph_id、path_id、options、points、warnings，并严格校验 EnergyValue 和 warning shape。
- [x] ProjectContentSnapshot.energy_profiles：仍作为长期项目内容入口，未新增 engine state 或 restore API。

**流程图核对**：

- [x] `EnergyProfileEngine.compute_profile → ProjectContentSnapshot.energy_profiles → energy-profiles-v1 codec → ProjectContentStore writes energy-profiles.json` 在测试和代码中有实际落点。
- [x] `ProjectContentStore reads reaction-graphs.json → loaded ReactionGraph / paths → codec validate profile/options/points/warnings → ProjectContentSnapshot.energy_profiles` 在 `_snapshot_from_sections` 中落地。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] `ProjectContentSnapshot.energy_profiles` 保存为 `energy-profiles-v1` section。
- [x] EnergyProfile id、graph_id、path_id、options、points、warnings 均保存并可恢复。
- [x] EnergyOptions output_unit、include_corrections、energy_key、baseline_node_id 均保存并校验。
- [x] EnergyPoint node_id、label、absolute_energy、relative_energy、missing_reason 均保存并校验。
- [x] 加载时基于 loaded ReactionGraph 校验 graph_id、path_id 和 point node 顺序。
- [x] 坏 schema、project mismatch、重复 profile id、坏 options、裸 energy、unsupported unit、point 语义冲突、warning shape、缺失 graph/path/sequence 均返回 Result error。
- [x] content store 不改 manifest、不登记 ProjectResource、不解析 raw file、不调用 parser/import/registry/graph mutation/engine/export。

**明确不做逐项核对**：

- [x] 不重新计算 EnergyProfile；scope guard 确认 `content_store.py` 和 `energy_profile_codec.py` 不含 `EnergyProfileEngine` / `compute_profile`。
- [x] 不新增 EnergyProfileEngine state/cache/list/restore API；grep 无新增 restore profile API。
- [x] 不把 EnergyProfile 写入 Project Manifest 或登记 ProjectResource；ProjectContentStore 仍只写 `.rxnflow/state/energy-profiles.json`。
- [x] 不持久化 ExportArtifact index 或 artifact bytes；本次未改 export writer。
- [x] 不新增 UI、CLI/Web/desktop command、browser/cloud/bundle/migration。
- [x] 不新增热化学表达式、计量系数、速率模型、自动路径搜索或 stale 自动修复。
- [x] 不改通用 EnergyProfileEngine 计算规则；只修正 legacy fixture profile 的 absolute energy 单位，使 fixture snapshot 满足长期 section 的单位约束。

**关键决策落地**：

- [x] 物化快照：load/save 只恢复 dataclass，不重算。
- [x] Engine 无状态：未新增 EnergyProfileEngine restore。
- [x] 引用硬校验：`_validate_profile` 检查 graph、path、point node sequence、baseline。
- [x] `baseline_node_id=None` 合法；非空时必须属于 path。
- [x] point energy unit 必须匹配 output_unit。
- [x] warnings 只接受 `RxnFlowWarning` 或等价 JSON shape。

**跨层纪律核对**：

- [x] 错误语义：所有坏输入返回 `invalid_input` 或 `graph_invalid`。
- [x] 幂等性：重复保存 checksum 稳定。
- [x] 顺序性：profiles/points 保序，points 必须等于 path.node_ids。
- [x] 单位纪律：EnergyValue 必须是 `{value, unit, reference}`。
- [x] 计算边界：不调用 compute_profile，不检查当前 object energy/corrections 是否匹配。
- [x] Export 边界：未调用或修改 ReportExportService。

**挂载点反向核对**：

- [x] Energy Profile section codec：`rxnflow.energy_profile_codec`。
- [x] ProjectContentStore energy_profiles section：`_snapshot_sections` / `_snapshot_from_sections`。
- [x] ProjectContentSnapshot.energy_profiles：`rxnflow.content_store.ProjectContentSnapshot`。
- [x] Profile reference validation：`energy_profile_codec._validate_profile`。
- [x] Profile warning/energy value codec：`_warnings_*` 和 `_energy_value_*`。
- [x] 反向 grep：新增引用集中在上述挂载点、测试和 CodeStable 文档。
- [x] 拔除沙盘：删除 `energy_profile_codec` import、ProjectContentStore 调用、测试和文档后，该 feature 在系统视角消失；无清单外运行时残留。

## 3. 验收场景核对

- [x] S1：compute_profile 产生 profile 后 save_snapshot 写入 energy-profiles.json，保留 profile/options/points/warnings。证据：单测。
- [x] S2：load_snapshot 恢复 EnergyProfile / EnergyOptions / EnergyPoint。证据：单测。
- [x] S3：正常点保留 node_id、label、absolute、relative，unit 匹配 output_unit。证据：单测。
- [x] S4：missing point 保留 missing_reason 且 energy 为 None。证据：单测。
- [x] S5：warnings 保留 code/message/target。证据：单测。
- [x] S6：重复保存 checksum 稳定。证据：单测。
- [x] S7：坏 schema_version 返回 invalid_input。证据：单测。
- [x] S8：section project_id mismatch 返回 invalid_input。证据：单测。
- [x] S9：重复 profile id 返回 invalid_input。证据：单测。
- [x] S10：缺失 graph 返回 graph_invalid。证据：单测。
- [x] S11：缺失 path 返回 graph_invalid。证据：单测。
- [x] S12：point node 顺序错位返回 graph_invalid。证据：单测。
- [x] S13：unsupported output_unit 或空 energy_key 返回 invalid_input。证据：单测。
- [x] S14：裸 EnergyValue 或 unsupported unit 返回 invalid_input。证据：单测。
- [x] S15：非 missing point 缺 absolute/relative 返回 invalid_input。证据：单测。
- [x] S16：missing point 混入 energy 返回 invalid_input。证据：单测。
- [x] S17：warning shape 错误返回 invalid_input。证据：单测。
- [x] S18：save/load 不改 manifest、不新增 ProjectResource、不读取 inputs/raw。证据：scope guard + 现有 content store 测试。
- [x] S19：不调用 EnergyProfileEngine.compute_profile、ParserRegistry、ImportRegistryWorkflow、ChemicalRegistry.register、ReactionGraphService.apply_patch 或 ReportExportService。证据：scope guard。
- [x] S20：现有 ProjectContentStore、Energy Engine、Graph Workspace、Import Ledger、Report Export、Platform Shell 测试继续通过。证据：`python3 -m unittest discover` 通过。

前端/UI：本 feature 无前端改动，无需浏览器验证。

## 4. 术语一致性

- Energy Profile Persistence：文档术语落到 `energy_profile_codec` 和 `energy-profiles-v1`，未与 EnergyProfileEngine 混用。
- Stored EnergyProfile / Stored EnergyOptions / Stored EnergyPoint：实现继续复用核心 dataclass，不新增平行模型。
- Profile Reference Validation：落在 `_validate_profile`，语义与设计一致。
- Profile Warning：只接受 `RxnFlowWarning` 或等价 JSON shape，非结构化 warning 被拒绝。
- 禁用方向 grep：未新增 CLI/UI/cloud/browser/bundle/migration/export index/stale repair 等方案外能力。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：已补 Energy Profile Persistence、`energy-profiles-v1`、materialized profile 不自动重算、profile reference validation、point energy/missing 约束，并移除 “EnergyProfile 长期仓储格式” 待补项。
- [x] `codestable/architecture/core-platform.md`：已补 Project Content Store 第 11 类能力中的 `energy-profiles-v1` codec、模块树、`rxnflow.energy_profile_codec` 模块说明、EnergyProfile fields、错误语义、引用校验和范围边界。
- [x] AGENTS.md：无需要新增的项目级硬约束。

## 6. requirement 回写

- [x] `project-content-persistence` 有对应 requirement，且本次把 EnergyProfile 也纳入项目内容恢复能力。已更新 `last_reviewed`、tags、用户故事、为什么需要、怎么解决和边界。

## 7. roadmap 回写

- [x] design frontmatter 包含 `roadmap: rxnflow-project-persistence` 和 `roadmap_item: energy-profile-persistence`。
- [x] `rxnflow-project-persistence-items.yaml` 中对应条目已从 `in-progress` 改为 `done`，feature 保持 `2026-05-06-energy-profile-persistence`。
- [x] `rxnflow-project-persistence-roadmap.md` 第 5 节子 feature 清单已同步为 done。
- [x] roadmap YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露新的环境、工具、工作流或反复踩坑信息，不需要补入 AGENTS.md / CLAUDE.md。

## 9. 遗留

- 后续优化点：`project-content-validation-migration` 可继续扩展跨 section validation 和显式 migration；`export-artifact-index-persistence` 继续处理 export index。
- 已知限制：EnergyProfile 加载后不自动 stale 检测，不根据当前 ChemicalObject energy/corrections 重算。
- 实现阶段顺手发现：legacy `compute_fixture_profile` 原先 absolute energy 沿用 raw hartree；本次已限制在 fixture 计算路径内改为 output unit，避免 fixture snapshot 违反 energy-profiles-v1。

## 10. 验证命令

- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-06-energy-profile-persistence/energy-profile-persistence-checklist.yaml --yaml-only`
- `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-project-persistence/rxnflow-project-persistence-items.yaml --yaml-only`
- `git diff --check`
- `python3 -m unittest tests.test_energy_profile_persistence tests.test_project_content_store_v1 tests.test_energy_profile_engine`
- `python3 -m unittest discover`
