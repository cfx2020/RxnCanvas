# Energy Profile Provenance Details 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：`codestable/features/2026-05-22-energy-profile-provenance-details/energy-profile-provenance-details-design.md`

## 1. 接口契约核对

对照方案第 2.1 节，新增 provenance 名词已落到核心模型、持久化、Shell DTO 和 Web DTO：

- [x] `EnergyExpression` / `EnergyComponent` / `CorrectionComponent` / `EnergyExpressionMissing`：已在 `rxnflow/models.py` 落地，字段覆盖 node id、terms、corrections、total、missing、object、coefficient、energy source、raw/converted/contribution。
- [x] `EnergyPoint.expression`：已作为可选字段挂到 `EnergyPoint`，旧 profile 可为 null，新计算 profile 会填入 expression。
- [x] Engine helper：`rxnflow/energy.py` 以 `_node_energy_expression` 替代只返回 total 的旧路径，`compute_profile` 使用 expression total 计算 relative energy。
- [x] `energy-profiles-v1`：`rxnflow/energy_profile_codec.py` 读写可选 `point.expression`，旧 JSON 缺 expression 加载为 `None`，schema version 保持 `energy-profiles-v1`。
- [x] Shell/Web DTO：`rxnflow/platform.py` 的 `_profile_summary` 投影 expression；`web/src/shell/types.ts` 和 `web/src/shell/fixtureTransport.ts` 提供 expression summary。
- [x] 流程图落点：Engine -> energy channel resolver -> correction policy -> EnergyPoint(expression) -> Platform Shell -> Web Energy Profile Panel 均有代码落点。

## 2. 行为与决策核对

- [x] 新计算 profile 的 point 带 expression：baseline 与普通 point 均由 `_node_energy_expression` 生成 expression 后进入 `EnergyPoint`。
- [x] 不重复计算数值：relative energy 使用 expression total 与 baseline expression total 相减；Web/Shell 只投影，不另算。
- [x] raw 与 converted 保留：component 保存 raw energy、converted energy 和 contribution；持久化测试断言 raw Hartree 保留。
- [x] missing details 结构化：非 baseline missing point 保留 `missing_reason`，expression total 为 null，missing details 带 code/object/key/source/message；baseline missing 仍直接返回 `missing_energy` error。
- [x] Web 只读 expression：Energy Profile Panel 只消费 `point.expression`，没有 expression 的旧 profile 不推断、不报错。
- [x] 明确不做：未新增 Web energy channel selector、correction policy selector 或节点 composition 编辑器；未改 parser/import/registry correction append/graph patch/report export bytes writer；未升级 schema version；未改变 relative energy 口径。
- [x] 挂载点反向核查：grep 命中集中在 core model、Energy Engine、energy profile codec、Platform Shell、Web shell DTO/fixture、EnergyProfilePanel/i18n/css/tests 和本 feature 文档；未发现方案清单外新增 runtime 挂载点。
- [x] 拔除沙盘推演：按挂载点逆向删除 dataclass、Engine helper、codec expression helpers、Shell summary、Web DTO/fixture 和 EnergyProfilePanel details 即可移除本 feature；架构/req/roadmap/acceptance 文档为流程产物。

## 3. 验收场景核对

- [x] S1 新计算 baseline point 和普通 point 都包含 expression。
  - 证据：`tests/test_energy_profile_engine.py`、`tests/test_platform_shell_baseline.py`、全量 `python3 -m unittest discover`。
- [x] S2 `A + 2B` expression terms 保留顺序、coefficient、source 和贡献。
  - 证据：`test_composition_coefficients_scale_node_total_energy` 断言 object 顺序、coefficient、energy_key/source、raw/converted/contribution。
- [x] S3 correction contribution 在 expression.corrections 中可见。
  - 证据：`test_corrections_are_scaled_by_composition_coefficients_when_enabled` 断言 correction id、kind、coefficient、contribution。
- [x] S4 explicit thermochemistry source 在 component 中显示 `thermochemistry`。
  - 证据：`test_explicit_thermochemistry_source_combines_with_composition_coefficients`。
- [x] S5 非 baseline missing point 保留 missing expression details。
  - 证据：`test_annotation_and_group_nodes_are_missing_energy_points` 与 persistence round-trip 测试。
- [x] S6 baseline missing 仍返回 `missing_energy` error。
  - 证据：`test_baseline_missing_energy_returns_missing_energy` 和 group baseline 测试。
- [x] S7 `energy-profiles-v1` expression round-trip 与 legacy no-expression 兼容。
  - 证据：`tests/test_energy_profile_persistence.py` 的 round-trip、stable checksum、`test_legacy_points_without_expression_load_as_none`。
- [x] S8 Platform Shell `energy.compute` 和 `workbench.snapshot` profile summary 含 expression。
  - 证据：`tests/test_platform_shell_baseline.py` 断言 snapshot profile point expression term/source/raw unit。
- [x] S9 Web Energy Profile Panel 显示 expression details，包含 term/correction/missing details。
  - 证据：`web/src/app/WorkbenchShell.test.tsx` 覆盖英文 `Expression details` 和中文 `表达式明细`；实现阶段已在 `http://127.0.0.1:5173/` 浏览器验证中文 UI 显示 `表达式明细`、`组成项`、`electronic · energies`，水平溢出为 false。

## 4. 术语一致性

- `EnergyExpression`：命中集中在 `rxnflow.models`、`rxnflow.energy`、`rxnflow.energy_profile_codec`、`rxnflow.platform`、Web shell types/fixture、EnergyProfilePanel 和测试，语义一致。
- `EnergyComponent` / `CorrectionComponent`：核心 dataclass、codec、Shell summary、Web summary types 命名一致。
- `Energy Expression Details`：Web i18n 使用 `energyPanel.expressionDetails`，英文/中文文案一致。
- 防冲突：没有把 expression 命名成前端本地计算器或 selector；Web 侧没有引入 Engine helper。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：补入 EnergyExpression、EnergyComponent、CorrectionComponent、Energy Expression Details；更新 Energy Profile Persistence、Energy Engine 和 Web Energy Profile Panel 边界。
- [x] `codestable/architecture/core-platform.md`：补入 Engine 同步物化 expression、`energy-profiles-v1` 可选 expression、raw/converted/contribution 和 missing expression 规则。
- [x] `codestable/architecture/web-workbench.md`：补入 Web shell expression summary types、EnergyProfilePanel details 区、Web 不重算 expression、旧 profile 无 expression 时 details 为空。
- [x] `AGENTS.md` 不需要更新：本 feature 未暴露新的长期环境或工作流规则。

## 6. requirement 回写

- [x] `codestable/requirements/web-workbench-shell.md` 已更新：新增用户故事，说明用户可在能量面板核对每个 profile point 的组成项、校正项、单位换算贡献和缺失明细。
- [x] 同一 req 的解决方案和边界已同步：Energy Profile Panel 的 expression details 来自 ShellResponse projection，不在前端重算 expression、校正项或单位换算。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-items.yaml` 中 `energy-profile-provenance-details` 已从 `in-progress` 更新为 `done`，feature 指向 `2026-05-22-energy-profile-provenance-details`。
- [x] `codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-roadmap.md` 第 5 节同步为 done，并记录已落地内容和未做 Web selector / 前端重算。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新长期规则。已有规则“Web 工作台必须从 `web/` 运行 `npm run dev` 并打开 `http://127.0.0.1:5173/`”仍适用。

## 9. 遗留

- 后续优化点：`web-energy-semantics-controls` 仍需补节点组成编辑、energy channel selector 和 correction policy options。
- 已知限制：Web 当前只显示 expression details，不支持在 details 区编辑 composition、energy channel 或 correction policy；旧 profile 没有 expression 时 details 区为空。
- 实现阶段顺手发现：Project Content validation 对 expression 深校验边界可在后续 `energy-semantics-project-content-migration` 中继续补强。
