# Export Energy Diagram Route Layout 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：codestable/features/2026-05-21-export-energy-diagram-route-layout/export-energy-diagram-route-layout-design.md

## 1. 接口契约核对

- [x] 旧 `EnergyDiagramState("node-a", "A", 0.0, "kcal_mol")` 构造仍可用；新增 layout fields 都有默认值。
- [x] `EnergyDiagramRoute` 新增 `min_energy` / `max_energy` 默认值，不破坏旧构造。
- [x] `build_energy_diagram_route()` 现在计算 padded bounds、x/y anchors、line anchors、label/value anchors。
- [x] Missing state 的 y、line_start_x、line_end_x、value_x/value_y 保持 `None`。

流程图核对：`EnergyProfile.points` → bounds → state positions → anchors → route → PNG/CDXML writer 的链路已落地。

## 2. 行为与决策核对

- [x] 有效 points 生成递增 x anchors 和非空 y / line / value anchors。
- [x] missing point 继续产生 `missing_energy_point` warning，不生成假 state line。
- [x] same-energy profile 仍生成 `min_energy < max_energy`。
- [x] all-missing profile 使用默认 bounds `(-1.0, 1.0)`，PNG/CDXML 仍成功导出。
- [x] PNG/CDXML writer 改为消费 route anchors；现有 PNG/CDXML 结构测试仍通过。

明确不做核对：

- [x] 未新增 export format。
- [x] 未修改 XLSX writer、Web Report Export Panel 或 Project Content schema。
- [x] 未实现 label collision avoidance、molecule-level CDXML 或 CDX。
- [x] 未调用或修改 EnergyProfileEngine，不重新计算 profile。

挂载点反向核对：

- [x] 挂载点集中在 `EnergyDiagramState` / `EnergyDiagramRoute` dataclass、`build_energy_diagram_route()`、PNG/CDXML writer anchor consumption 和 report export tests。
- [x] 拔除沙盘推演：删除新增 layout fields/anchor builder/writer consumption 后，route layout 增强消失；XLSX/Web/parser/project schema 不需要回退。

## 3. 验收场景核对

- [x] S1-S4：构造兼容、递增 anchors、有效/missing state anchor 语义由 `test_energy_diagram_route_includes_shared_layout_anchors` 覆盖。
- [x] S5-S6：same-energy bounds 和 all-missing bounds / PNG/CDXML 成功由 `test_energy_diagram_route_handles_same_energy_and_all_missing_profiles` 覆盖。
- [x] S7：PNG/CDXML writer tests 仍通过，CDXML missing point 不生成假 state line，由既有 PNG/CDXML tests 覆盖。

本 feature 无前端视觉改动，不需要浏览器验证。

## 4. 术语一致性

- Energy Diagram Route Layout：设计、代码和 architecture 均指 route-level bounds / anchors。
- Missing State：代码中仍通过 `relative_value is None` 和 `missing_reason` 表达，未引入新运行态状态机。
- State Anchor：新增字段集中在 `EnergyDiagramState`，没有扩散到 Web/Project Content。

## 5. 架构归并

- [x] `codestable/architecture/core-platform.md`：已补 Energy Diagram Route 的 padded bounds 和 state anchors。
- [x] `codestable/architecture/ARCHITECTURE.md`：已补 PNG/CDXML 共用 bounds/anchors，missing point 不生成假 state line。

## 6. requirement 回写

无新增用户故事。本 feature 增强导出图布局一致性，不更新 requirement。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-items.yaml`：`export-energy-diagram-route-layout` 已标为 `done`。
- [x] `codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-roadmap.md`：第 5 节子 feature 清单已同步状态和落地摘要。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的通用工作流信息。

## 9. 遗留

- 长 label collision avoidance 仍未实现，可作为后续 diagram polish feature。
- CDXML ChemDraw 兼容性结构回归由下一项 `export-cdxml-chemdraw-compat` 承接。

## 验证记录

- `python3 -m unittest tests.test_report_export_baseline`：15 tests OK。
- `python3 -m unittest discover`：250 tests OK。
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-21-export-energy-diagram-route-layout/export-energy-diagram-route-layout-checklist.yaml --yaml-only`：passed。
- `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-items.yaml --yaml-only`：passed。
