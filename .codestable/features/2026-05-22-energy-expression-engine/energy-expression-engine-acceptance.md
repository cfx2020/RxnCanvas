---
doc_type: feature-acceptance
feature: 2026-05-22-energy-expression-engine
status: accepted
summary: Energy Engine 已按 composition coefficient、energy channel 和 correction policy 计算节点能量
tags: [energy, expression-engine, stoichiometry, acceptance]
---

# Energy Expression Engine 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：.codestable/features/2026-05-22-energy-expression-engine/energy-expression-engine-design.md

## 1. 接口契约核对

- [x] `CorrectionKind`、`CorrectionPolicyMode`、`CorrectionPolicy` 已在 `rxnflow.models` 落地。
- [x] `EnergyOptions.correction_policy` 已新增且默认为 null，旧 constructor 调用不变。
- [x] `EnergyProfileEngine._node_total_energy` 已改为遍历 `ReactionNode.composition`，按 term coefficient 计算。
- [x] `energy-profiles-v1` options 已保存/加载可选 `correction_policy`，旧 JSON 缺字段时为 null。
- [x] Platform Shell / Web DTO 已支持 `correction_policy` payload 和 profile projection。

## 2. 行为与决策核对

- [x] 旧 `chemical_object_ids` 节点通过 ReactionNode 自动投影为 coefficient 1 composition，旧相对能量行为保持。
- [x] selected object energy 与 correction energy 都先转换到 output unit，再乘 term coefficient。
- [x] 重复 object term 不合并，按 term 顺序逐项求和。
- [x] `include_corrections=false` 不计 corrections；`true + no policy` 计入全部；policy 支持 none/all/kinds/ids。
- [x] 未新增 `EnergyPoint.expression`、registry correction command、Web selector UI 或 schema version。

## 3. 验收场景核对

- [x] 旧多对象节点 coefficient 1 行为：`tests.test_energy_profile_engine` 原有 additive 测试继续通过。
- [x] `composition=[A*1,B*2]` 使用 `E(A)+2E(B)`：新增单测通过。
- [x] 负数、小数 coefficient 和重复 object term：新增单测通过。
- [x] correction all/kinds/ids/none：新增单测通过。
- [x] explicit thermochemistry source 与 coefficient 组合：新增单测通过。
- [x] baseline / non-baseline missing 行为不回退：原有 missing tests 继续通过。
- [x] profile options correction_policy round-trip 与 legacy null：`tests.test_energy_profile_persistence` 通过。
- [x] Shell/Web profile projection 回显 correction_policy：`tests.test_platform_shell_baseline` 与 `web/src/shell/ShellClient.test.ts` 通过。

## 4. 术语一致性

- CorrectionPolicy、composition coefficient、energy_source、correction_policy 术语在 design、models、engine、codec、Shell/Web DTO 和测试中一致。
- 没有引入 design 外的持久化 expression/provenance 字段。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md` 已更新 Energy Engine coefficient 与 CorrectionPolicy 现状。
- [x] `.codestable/architecture/core-platform.md` 已更新 Energy Engine 稳定协议和 Stored EnergyOptions 字段。

## 6. Requirement 回写

- 本 feature 是底层计算语义补强，未改变 `web-workbench-shell` 用户故事边界；不更新 requirement。

## 7. Roadmap 回写

- [x] `rxnflow-energy-chemistry-semantics-items.yaml` 中 `energy-expression-engine` 已标记 done。
- [x] roadmap 主文档第 5 节已同步状态、feature 目录和备注。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- 无候选。本 feature 未新增通用环境或工作流约束。

## 9. 遗留

- `EnergyPoint.expression` / component provenance 明细留给 `energy-profile-provenance-details`。
- Web 节点组成、energy channel 和 correction policy selector 留给 `web-energy-semantics-controls`。
- `registry.apply_correction` Shell command 和 Web correction form 留给 `correction-command-and-ui`。

## 10. 验证记录

- `python3 -m unittest tests.test_energy_profile_engine tests.test_energy_profile_persistence tests.test_platform_shell_baseline`：通过，51 tests。
- `python3 -m unittest discover`：通过，292 tests。
- `cd web && npm run test -- ShellClient.test.ts`：通过，28 tests。
- `cd web && npm run build`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-22-energy-expression-engine/energy-expression-engine-checklist.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-items.yaml --yaml-only`：通过。
