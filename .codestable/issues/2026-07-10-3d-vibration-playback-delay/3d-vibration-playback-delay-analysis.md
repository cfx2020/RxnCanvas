---
doc_type: issue-analysis
issue: 2026-07-10-3d-vibration-playback-delay
status: confirmed
root_cause_type: logic
related: [3d-vibration-playback-delay-report.md]
tags: [3d-viewer, vibration, persistence, lazy-hydration, performance]
---

# 3D 振动播放延迟根因分析

本分析引用既有证据：`.codestable/compound/2026-06-27-explore-performance-native-audit.md` 已确认完整振动位移曾把真实项目放大到 216.9MB；`.codestable/compound/2026-06-06-decision-canonical-import-data.md` 与当前 `structure-vibration-inspection` requirement 同时要求项目恢复以结构化项目数据为准，不能把重新解析原始输出作为正常播放的必要条件。

## 1. 问题定位

| 关键位置 | 说明 |
|---|---|
| `web/src/app/importWorkspace.ts:469-475` | 新导入文件拿到完整 parser 结果后，立即经过名为 persistence normalization 的路径，因此首次导入也会丢失振动位移。 |
| `web/src/domain/projectPackages.ts:726-738` | `normalizeCoordinatePreview()` 校验完合法 mode 后，无条件调用 `stripVibrationalModeDisplacements()`。 |
| `web/src/domain/vibrations.ts:132-137` | `stripVibrationalModeDisplacements()` 把每一个 mode 的 `displacements` 都改为空数组，没有保留 UI 实际要播放的默认 mode。 |
| `web/electron/project-store.cjs:363-383` | Electron 保存层再次把全部 mode 位移剥离，保证项目恢复后也只能得到 mode metadata。 |
| `web/src/app/InspectorPanels.tsx:625-639` | 第一次点击发现默认 mode 没有位移时只执行 hydration；异步返回后只写 `hydratedParse`，没有把 `vibrationPlaying` 设为 `true`。 |
| `web/src/app/InspectorPanels.tsx:727-735` | hydration 期间按钮被 `disabled`，所以表现为变灰；完成后按钮恢复，但仍显示 Play，必须第二次点击。 |
| `web/src/app/App.tsx:2416-2447` | hydration 调用桌面 parser 后虽然返回完整 parse 给当前 dialog，却又通过 persistence normalization 写回 `files`，完整位移不会成为可复用的 runtime 状态。 |
| `web/electron/main.cjs:1061-1083` | 按钮 hydration 复用了完整 `import.preview`，超时上限 20 秒，不是只读取一个播放 mode 的轻量请求。 |
| `rxnflow/engine.py:325-346` | `import.preview` 会读取整个 source，并对 Gaussian/ORCA 继续执行 cclib full-file parse；因此第一次点击的等待时间接近一次完整重新导入。 |
| `web/src/app/Molecule3DmolViewer.tsx:126-156` | 只要拿到完整 mode，3Dmol 会直接建立 native vibration frames 并播放；第二次点击后的即时响应证明动画实现不是主要瓶颈。 |

## 2. 失败路径还原

**正常路径**：导入解析得到完整振动 mode → 项目保留当前 UI 默认播放 mode 的合法位移 → 用户第一次点击 Play → `vibrationPlaying` 切为 `true` → 3Dmol 建帧并立即播放。

**当前失败路径**：

1. 导入 engine 已经返回完整振动位移。
2. `stagedSourceFile()` 立刻进入 project persistence normalization。
3. normalization 把所有 mode 的位移清空，只留下频率等 metadata。
4. 第一次点击 Play 时 `playableVibrationMode` 为 `null`，组件进入 hydration 分支。
5. 按钮被禁用；Electron 重新读取整个 source，并重新执行 `import.preview` / cclib full-file parse。
6. parse 返回后 dialog 拿到完整位移，但回调没有开始播放；写回全局 `files` 时位移又被 normalization 清空。
7. 按钮恢复可点击，用户第二次点击才把 `vibrationPlaying` 切为 `true`。
8. 关闭 dialog 或重开项目后，局部 `hydratedParse` 消失，同一慢路径再次发生。

**分叉点**：`web/src/domain/projectPackages.ts:737` — 为避免保存全部 normal modes 导致项目体积暴涨，代码选择了“所有 mode 位移一律删除”，但没有区分“全部光谱 mode”与“3D UI 当前只需要的一个默认播放 mode”。

## 3. 根因

**根因类型**：逻辑错误。

**根因描述**：此前的性能修复正确识别出“持久化全部振动模式位移”会造成巨大项目 JSON 和内存压力，但压缩策略过度：它在导入运行态、renderer 项目归一化和 Electron 保存层都删除了全部 mode 位移。结果是 UI 明明只需要播放一个默认 mode，却每次都必须重新解析完整计算输出。与此同时，第一次点击的异步 hydration 被实现成“只准备数据、不执行用户原本的播放意图”，形成稳定的两阶段双击交互。

**是否有多个根因**：是。

- **主根因**：所有 normal mode 位移被无差别剥离，默认播放 mode 也没有作为有界的结构化项目数据保留。
- **次根因**：hydration 完成后未自动执行播放，导致用户必须第二次点击。
- **放大因素**：hydration 复用完整 `import.preview` / cclib 解析链，而不是读取单一 mode 的轻量路径，所以第一次点击等待明显。

## 4. 影响面

- **影响范围**：所有带振动 mode metadata 的新导入文件和恢复项目都会受影响；Electron 下最明显，浏览器 fallback 也存在相同的首次点击/第二次点击状态逻辑。
- **潜在受害模块**：import staging、project package normalization、Electron project save/open、Structure Preview 状态、未来的 vibration mode selector。
- **数据完整性风险**：不会破坏能量、坐标或画布数据，但项目只保留频率 metadata，不保留实际播放所需位移；当工作区 source 缺失或 checksum 异常时，已保存项目可能永久无法恢复振动播放，这与 canonical project data 决策不一致。
- **严重程度复核**：维持 **P1**。核心结构检查能力稳定受损并依赖原始 source 重解析，但目前仍有等待后第二次点击的绕过方式。

## 5. 修复方案

### 方案 A：持久化第一个振动 mode，并保留 legacy hydration 兜底

- **做什么**：统一使用 parser 顺序中的第一个 mode（`modes[0]`）；project normalization 和 Electron slim persistence 只保留该 mode 的完整位移，其余 mode 继续只保留 metadata。对常见过渡态输出，第一个 mode 通常是最负、虚频幅度最大的模式。hydration 用于旧项目或缺失 payload，成功后自动开始播放，并把第一个 mode 以同样的有界形式写回状态，下一次 autosave 后可直接恢复。
- **优点**：新导入第一次点击立即播放；保存重开后仍立即播放；旧项目只需首次 hydration 一次且无需第二次点击。存储量从“所有 mode × 所有原子”降为“一个 mode × 所有原子”，由近似 O(N²) 收敛为 O(N)，不会回到 216.9MB 全量 payload。
- **缺点 / 风险**：所有持久化层必须保持 parser 顺序一致；未来若增加 mode selector，非第一个 mode 仍需另行按需加载。
- **影响面**：`web/src/domain/vibrations.ts`、`web/src/domain/projectPackages.ts`、`web/electron/project-store.cjs`、`web/src/app/InspectorPanels.tsx`、`web/src/app/App.tsx` 及对应测试；`App.tsx` 的 autosave signature 需要识别首个 mode 从空位移变为完整位移，确保旧项目补载后会真正保存。实现后需回写当前 architecture 对实际保存策略的描述。

### 方案 B：继续完全懒加载，但修正为单击意图 + session cache

- **做什么**：保持项目内所有位移为空；第一次点击完成 hydration 后自动播放；在 renderer 按 `file id + checksum` 缓存完整 parse 或默认 mode，并可在打开 Structure Preview 时后台预取。
- **优点**：项目 JSON 继续保持最小；改动主要集中在 App/Structure Preview 状态层。
- **缺点 / 风险**：应用每次重启后的第一次播放仍要等待完整 cclib 解析；source 缺失时仍无法播放；session cache 若保存完整 parse 仍可能重新制造较高 renderer 内存占用；后台预取只是把等待挪到打开 dialog 时。
- **影响面**：`web/src/app/App.tsx`、`web/src/app/InspectorPanels.tsx` 及交互测试，不改变持久化格式。

### 方案 C：新增独立 vibration sidecar / 专用轻量读取协议

- **做什么**：主 project JSON 继续只存 mode metadata；导入时把位移写入 `.rxnflow/source-cache/{fileId}.vibrations.*` sidecar，或新增 engine IPC 只读取指定默认 mode。播放时读取 sidecar/专用响应，不重新执行完整 `import.preview`。
- **优点**：主 JSON 很小，也能支持未来多个 mode 随选随读；可避免 React state 常驻完整 displacement 集合。
- **缺点 / 风险**：需要新增缓存格式、路径安全、checksum、保存/打开/导出/清理/校验契约，已超出本次交互 bug 的最小修复范围。
- **影响面**：domain schema、Electron project store/main/preload、Python engine IPC、项目校验与导出包、UI 和多层测试。

### 推荐方案

**推荐方案 A**，并按用户确认固定为 parser 顺序中的第一个 mode。当前 UI 只播放这一个 mode，因此保留一个 mode 能直接修复新导入、项目恢复、原始 source 缺失和双击交互四个问题，同时保持 payload 有界。它比方案 B 更符合“导入后直接播放”和 canonical project data 约束，也比方案 C 的 sidecar/新协议更适合本次 P1 定点修复。
