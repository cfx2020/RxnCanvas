---
doc_type: issue-fix
slug: relative-energy-expression-cclib
status: fixed
severity: high
tags: [energy-table, relative-energy, parser, cclib, ir-regression]
created: 2026-06-18
fixed: 2026-06-18
---

# Fix Note: relative energy expression + cclib backend

## 修复内容

1. **引入 cclib full-file 后端**
   - `rxnflow/engine.py` 在 `sourcePath` 可用且文件像 Gaussian/ORCA 输出时，会优先尝试 `cclib.io.ccread()`。
   - cclib 只在 Python engine 边界内使用；renderer 不接收完整 log，也不把 cclib 变成前端依赖。
   - cclib 解析结果会叠加 RxnFlow 自定义文本解析字段：cclib 已提供的标准字段优先；Gaussian/ORCA 文本解析只补 cclib 缺失的标准字段，以及 solvent/source kind/role hint 等 RxnFlow 专用字段。
   - 捕获 cclib stdout/stderr，避免 cclib fallback 日志污染 `engine_ipc` JSON stdout。
   - 解析失败/未安装 cclib 时回落到 RxnFlow text parser，并写入 warning。

2. **统一 canvas/table/export 的相对能量来源**
   - `web/src/app/energyDisplay.ts` 现在接收 `edges`，从图谱关系推导共享 energy rows。
   - 每行包含：absolute `energyTable`、selected-zero-aware `relativeEnergyTable`、`relative`、expression terms、relative path visibility。
   - `App.tsx` 的 canvas、table、export 均继续使用同一个 `energyRows`，zero point 也通过同一套 `relativeEnergyZeroNode(nodes, options, edges)` 得到。

3. **修复表格 Relative 模式基准错误**
   - `ReportPanels.tsx` 不再用第一条 row 自行推导 baselines。
   - Relative 模式直接显示 `row.relativeEnergyTable`，因此画布 Set zero 后表格详细列会跟着变。

4. **Ir workbook-style 表达式**
   - 图谱表达式支持 Ir-like 关系：
     - `4b+ = 4b+ + Cl - 4b-1`
     - `i1N2fix14-tsf = i1N2fix14-tsf + Cl - 1 - 4b-1`
     - `i1N2fix14-ts = i1N2fix14-ts + Cl - 1 - 4b-1`
     - `i1N2fix14-tsr = i1N2fix14-tsr + Cl - 1 - 4b-1`
   - `1` / `Cl` / disconnected terms remain available in absolute/source views but are hidden from relative path rows；baseline 起点 0 行保留在 Relative path 中。
   - 分支 reachable 节点仍会显示为 relative path points，避免 demo/普通分支图谱只显示最长路径。

## 回归覆盖

- `tests/test_engine.py`
  - 增加 fake-cclib test，确认 cclib 标准字段优先，RxnFlow text 字段只作为 fallback/metadata 补充。
- `web/src/app/energyDisplay.test.ts`
  - 增加 Ir-style graph expression regression，覆盖 gas/Gsol relative 值和 selected zero shift。
- `web/src/app/ReportPanels.test.tsx`
  - 增加表格 Relative 模式 regression，确认表格使用 row-level relative table，不再按第一行重算。

## 验证

```bash
python3 -m unittest discover
cd web && npm run test
cd web && npm run build
cd web && npm run desktop:smoke
cd web && npm run desktop:pack
cd web && npm run desktop:runtime:smoke
```

另外用真实 Ir logs 做了手动解析核对：`4b+ / i1N2fix14-tsf / i1N2fix14-ts / i1N2fix14-tsr` 的 graph expressions 与 `20260331-Ir-test.xlsx` 同一公式族一致，显示精度下匹配。

## 注意事项

- 浏览器模式仍只能使用 renderer fallback parser 和 preview sample；cclib 是桌面/Python engine full-file 路径能力。
- `web/electron/embedded-engine.cjs` 仍是 JS fallback，不包含 cclib；当 Python engine 不可用时会退回 lightweight parser。
- Excel 工作簿使用缓存/舍入后的 kcal 值；当前实现使用 log 中更完整的 Hartree 值，最终 UI 两位小数显示一致。

## 追加修正：2026-06-18 parser priority + zero point row

用户确认后进一步收紧两条规则：

- **cclib vs RxnFlow text 优先级**：cclib 对标准计算字段优先，包括能量、atom-derived formula、method、charge/multiplicity、coordinates；RxnFlow text parser 只补缺失标准字段和 source kind / solvent / role hint / label 等应用层字段。
- **Relative path 显示规则**：Relative 表/路径必须包含 baseline 0 点，即使图谱存在进入/放出项导致其他 term-only 物种隐藏。

对应改动：

- `rxnflow/engine.py`：`merge_cclib_text_result()` 和 `merge_energy_tables()` 改为 cclib/base 字段优先。
- `tests/test_engine.py`：fake-cclib 回归改为断言 cclib 能量覆盖 text fallback。
- `web/src/app/energyDisplay.ts`：baseline row 的 `showInRelativeTable` 固定为 `true`。
- `web/src/app/energyDisplay.test.ts`：Ir-style 回归改为断言 baseline 0 点保留在 Relative path。

追加验证：

```bash
python3 -m unittest tests.test_engine.EngineSmokeTest.test_engine_import_preview_uses_cclib_standard_fields_before_text_fallback
cd web && npm run test -- --run src/app/energyDisplay.test.ts src/app/ReportPanels.test.tsx
python3 -m unittest discover
cd web && npm run test -- --run
cd web && npm run build
```

浏览器验证：`http://127.0.0.1:5173/` 切到 Table → Relative，确认首行 0 点保留；截图：`output/playwright/relative-table-zero-point.png`。
