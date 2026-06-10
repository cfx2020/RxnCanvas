---
doc_type: feature-acceptance
feature: 2026-05-22-energy-channel-catalog
status: accepted
summary: Energy channel catalog 已落地并通过核心、持久化、Shell/Web DTO 与 roadmap 回写验收
tags: [energy, thermochemistry, channel-catalog, acceptance]
---

# Energy Channel Catalog 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：.codestable/features/2026-05-22-energy-channel-catalog/energy-channel-catalog-design.md

## 1. 接口契约核对

- [x] `EnergyChannelSource` / `EnergyChannelSelectionSource` / `EnergyChannel` 已在 `rxnflow.models` 落地；字段与设计一致。
- [x] `EnergyOptions.energy_source` 已新增，默认 `auto`；旧 constructor 调用仍通过。
- [x] `rxnflow.energy_channels.energy_channel_catalog` 输出 `{key, source, label, unit, reference, object_ids}`；`tests.test_energy_profile_engine` 覆盖 energies 与 thermochemistry 两类 channel。
- [x] `EnergyProfileEngine` 已从直接查 `obj.energies` 改为 `resolve_energy_channel`；fixture helper 和通用 engine 都走同一 source 选择规则。
- [x] `energy-profiles-v1` codec 保存 `energy_source`，旧 JSON 缺失字段时恢复为 `auto`。
- [x] Platform Shell object/profile projection 与 Web Shell types / fixture transport 已包含 `energy_channels`、`energy_key` 和 `energy_source`。

## 2. 行为与决策核对

- [x] 原始 `ChemicalObject.energies` / `thermochemistry` 结构未迁移，catalog 只是投影。
- [x] `energy_source=auto` 先查 energies，再 fallback 到 thermochemistry；同名冲突返回 `ambiguous_energy_channel target=energy_options.energy_key`。
- [x] explicit source 缺 key 返回 `missing_energy`，details 保留 `object_id`、`energy_key`、`energy_source` 和 `node_id`。
- [x] profile id 在非 auto source 下加入 source slug，避免同名 key profile id 冲突；auto 保持旧 fixture id。
- [x] 本 feature 没有引入 composition coefficient 计算、CorrectionPolicy、correction command 或 Web selector UI。

## 3. 验收场景核对

- [x] 对象同时有 `energies.electronic` 与 `thermochemistry.gibbs`：Python object summary / Web DTO 输出两个 energy channels。证据：`tests.test_platform_shell_baseline`、`web/src/shell/ShellClient.test.ts`。
- [x] 显式 `energy_source="thermochemistry"` 可计算 profile。证据：`tests.test_energy_profile_engine`。
- [x] `auto` 可从 energies fallback 到 thermochemistry。证据：`tests.test_energy_profile_engine`。
- [x] `auto` 遇到同名 energies / thermochemistry key 返回 ambiguity。证据：`tests.test_energy_profile_engine`。
- [x] explicit source 缺 key 返回 missing_energy 且 details 含 source。证据：`tests.test_energy_profile_engine`。
- [x] 新 profile JSON round-trip 保留 source，旧 options 缺字段加载为 auto。证据：`tests.test_energy_profile_persistence`。
- [x] Shell `energy.compute` 接收 `energy_source` 并在 profile summary 回显。证据：`tests.test_platform_shell_baseline`、`web/src/shell/ShellClient.test.ts`。

## 4. 术语一致性

- EnergyChannelSource / EnergyChannel / energy_source / ambiguous_energy_channel 术语在 design、models、energy resolver、codec、Shell/Web types 和测试中一致。
- 未引入 design 外的新领域名词；`EnergyChannelSelectionSource` 是 `EnergyChannelSelection` 的枚举承载名，用于区分 `auto` 与真实 source。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md` 已补充 Energy Channel、Energy Source Selection、Object Summary Projection、Energy Engine 与 `energy-profiles-v1` 现状。
- [x] `.codestable/architecture/core-platform.md` 已补充 Energy Engine channel resolver、Stored EnergyOptions.energy_source、auto fallback 与 ambiguity 规则。
- [x] 不需要更新 `AGENTS.md`；本 feature 未暴露新的长期环境/工作流要求。

## 6. Requirement 回写

- `web-workbench-shell` 已覆盖对象 energy / thermochemistry keys 和能量面板的用户视角。本 feature 主要是底层 channel/source 契约，未改变用户故事边界，因此 requirement 不更新。

## 7. Roadmap 回写

- [x] `.codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-items.yaml` 中 `energy-channel-catalog` 已改为 `done`。
- [x] roadmap 主文档第 5 节已同步状态、feature 目录和备注。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- 无候选。本 feature 未新增下一轮必踩的环境、工具或协作流程规则。

## 9. 遗留

- `energy-expression-engine` 仍需后续实现 composition coefficient、correction policy 和 profile provenance expression。
- Web Energy Profile Panel 的真实 energy channel selector UI 留给 `web-energy-semantics-controls`。
- 当前 channel catalog 的 label 是稳定默认 `{key} ({source})`，后续 UI/i18n 可替换显示文本但不改变核心字段。

## 10. 验证记录

- `python3 -m unittest tests.test_energy_profile_engine tests.test_energy_profile_persistence tests.test_platform_shell_baseline`：通过，44 tests。
- `python3 -m unittest discover`：通过，285 tests。
- `cd web && npm run test -- ShellClient.test.ts`：通过，28 tests。
- `cd web && npm run build`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-05-22-energy-channel-catalog/energy-channel-catalog-checklist.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-items.yaml --yaml-only`：通过。
