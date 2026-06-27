---
doc_type: issue-fix
issue: 2026-06-27-barrier-energy-semantics
status: fixed
severity: medium
tags: [canvas, energy, barrier-label, relative-energy, chemistry-semantics]
fixed_at: 2026-06-27
---

# barrier-energy-semantics fix note

## 问题

外加反应物 / 只作为路径表达式项使用的节点会在节点卡片上显示 `ΔG = pending`，容易被理解成这个结构缺少能量；同时能垒胶囊 `ΔG‡` 以前按 source / target 节点的原始能量直接相减，而节点卡片和能量表按“路径表达式相对能量”显示，导致同一画布内出现两套不一致的能量语义，严重时会出现奇怪的负能垒。

## 根因

- `EnergyTableRow.relativeRole === "term-only"` 的节点没有自己的相对能量值，但 UI 仍按普通节点渲染相对能量条，于是落到 `pending` 文案。
- `createBarrierSegment()` / `defaultBarrierLabel()` 只拿 `FlowNode.energyGas / energySolution` 计算差值，没有接入 `energyTableRows()` 派生出的路径表达式相对能量。
- 能量图模型初始化时把所有非主路径节点默认设为 `term-only`，导致“尚未接入路径的新导入节点”也被错误显示成 `path term`。

## 修复

- `web/src/app/CanvasWorkspace.tsx`
  - 节点卡片接收 `relativeRole`；真正的 `term-only` 节点显示 `path term`，不再显示 `ΔG = pending`。
  - 能垒标注组件接收 `relativeEnergyByNodeId`，确保胶囊与节点卡片使用同一份相对能量来源。
- `web/src/app/canvasDrawing.ts`
  - `defaultBarrierLabel()` 优先使用 `energyRows.relative` 计算 `targetRelative - sourceRelative`。
  - source / target 任一方没有路径相对能量时显示 `ΔG‡ pending`，避免用原始节点能量拼出错误能垒。
  - 保留无 lookup 调用时的旧 fallback，方便非 UI 调用和单元测试。
- `web/src/app/App.tsx`
  - 节点拖动 / resize 的实时 barrier preview 也传入同一份相对能量 lookup，避免拖动过程中标签短暂回退到原始能量差。
- `web/src/app/energyDisplay.ts`
  - 只有 side-product / external-reactant 等实际参与路径表达式的外加项才标记为 `term-only`。
  - 未接入路径的普通节点保持 `standalone`，继续显示自己的 ΔG 相对能量。

## 验证

- `npm --prefix web run test -- canvasDrawing CanvasWorkspace App energyDisplay canvasGeometry --run`：通过，覆盖 `path term` 节点卡片、相对能量 lookup 的 barrier label、导入节点不被误判为 term-only。
- `npm --prefix web run build`：通过。
- 浏览器验证：在 `http://127.0.0.1:5173/` reload 后确认 Maleic Anhydride 节点显示 `path term`；拖出 butadiene → TS1 的能垒标注，胶囊显示 `ΔG‡ 0.033402`，与节点卡片中的路径相对能量一致。

## 备注

这次修复的是能量显示语义，不改变项目包结构。后续如果要进一步做化学路径语义，可以单独把“外加反应物 / 释放物 / 主路径节点”的角色显式存到领域模型里，而不是完全从边关系推导。

## 追加修复：反向拖拽能垒时峰值节点识别

用户在 Ir 路径中发现：从 TS 节点拖到中间体时，能垒标注会跑到中间体节点下方，并显示负的 `ΔG‡`。这是因为旧逻辑把 barrier 的 `targetId` 直接当作能垒峰值，把 `sourceId` 直接当作 reference。

追加修复后：

- `createBarrierSegment()` 和 `defaultBarrierLabel()` 先解析 barrier endpoints：
  - 若一端是 `transition`，该端固定作为 `peak`，另一端作为 `reference`。
  - 若两端都不是 / 都是 transition，则用路径相对能量较高的一端作为 `peak`。
  - fallback 才保留原 source → target 方向。
- 能垒箭头固定挂在 `peak` 节点下方；水平虚线连到 `reference` 节点。
- `ΔG‡` 固定计算 `peakRelative - referenceRelative`，避免反向拖拽产生负能垒。

追加验证：

- `canvasDrawing` 单测新增 TS → INT 反向场景：反向连接仍输出 `ΔG‡ 6.04`，箭头仍在 TS 下方，source/target aria 语义解析为 reference → peak。
- 浏览器验证：在 demo 数据中从 TS1 (Endo) 反向拖到 Endo Adduct，标注显示 `ΔG‡ 0.002932`，aria 为 `Barrier annotation from Endo Adduct to TS1 (Endo)`，未出现负能垒；验证用 barrier 已删除。

## 追加修复：路径外项文案拆分为 addition / release

用户反馈 `path term` 仍然太泛，加入路径的物质和释放出的物质应该区分显示。

追加修复后：

- `RelativeEnergyRole` 从单一 `term-only` 拆为：
  - `addition-term`：外加进入路径的反应物，节点卡片显示 `addition`。
  - `release-term`：从路径释放出的副产物/离去物，节点卡片显示 `release`。
- `energyDisplay` 推导中：
  - external reactants 标记为 `addition-term`。
  - side products / released terms 标记为 `release-term`。
- 两类节点仍然不显示 `ΔG = pending`，也不进入 relative table。

追加验证：

- `CanvasWorkspace` 单测覆盖 addition 和 release 两种节点卡片文案。
- `energyDisplay` 单测覆盖 Ir-style 图中 `one` 为 `addition-term`、`cl` 为 `release-term`。
- 浏览器验证：reload 后 demo 中 Maleic Anhydride 从 `path term` 变为 `addition`，页面不再出现 `path term`。

## 追加修复：外加项从实际连接路径点开始传播

用户指出 Ir 路径中 `1` 节点连到不同路径节点时，计算出的相对能量没有差别；按化学表达式，若 `1` 连到 `i1N2fix14-tsf`，则：

- `4b+ = 4b+ + Cl - 4b-1`
- `i1N2fix14-tsf = i1N2fix14-tsf - 1 + Cl - 4b-1`

根因是 `deriveEnergyGraphModel()` 有一个第 1 个路径点特殊处理：`externalReactantsThroughPathIndex()` 对 `pathIndex <= 1` 直接返回空，并且主路径/可达分支也在 `index === 1` 或 `distance === 1` 时只扣 baseline。这样会让 `1 -> 4b+` 和 `1 -> tsf` 都折成同一套下游表达式。

修复后：

- 外加项按其 edge target 所在主路径索引开始累计，包括第 1 个路径点。
- `1 -> tsf` 时，`4b+` 不含 `-1`，`tsf/ts/tsr` 开始含 `-1`。
- `1 -> 4b+` 时，`4b+` 起就含 `-1`，因此两种连法的计算结果会区分开。

验证：

- `energyDisplay` 单测新增 expression signature 断言，覆盖 `1 -> 4b+` 与 `1 -> tsf` 两种连法。
- `App` 回归测试同步 demo 语义：Maleic Anhydride 作为连到 TS1 的 addition term 后，TS1 显示 `ΔG 51.17 kcal/mol`，gas/hartree 显示 `0.076907 Eh`，barrier 显示 `ΔG‡ 51.17` / `ΔE‡ 48.26`。
- `npm --prefix web run test -- energyDisplay CanvasWorkspace App canvasGeometry ReportPanels --run` 通过。
- `npm --prefix web run build` 通过；仅保留 3Dmol 依赖 direct eval 和大 chunk 的既有构建警告。
- Playwright fallback 浏览器验证 `http://127.0.0.1:5173/`：桌面与 390px 窄屏均加载正常，无错误 overlay、无 console error；TS1 节点显示新相对能量，切换 gas + hartree 后显示 `0.076907 Eh`。
