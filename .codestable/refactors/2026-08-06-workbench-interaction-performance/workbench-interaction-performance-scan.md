---
doc_type: refactor-scan
refactor: 2026-08-06-workbench-interaction-performance
status: user-reviewed
scope: web/src/app/App.tsx、CanvasWorkspace.tsx、appCanvasEffects.ts、workbench.css 及对应 App/CanvasWorkspace/appCanvasEffects 测试
summary: 发现 3 条性能优化点：侧栏布局动画 1 条、画布合成/DOM 热路径 2 条；不改变交互结果，只减少逐帧布局和查询
---

# workbench-interaction-performance scan

## 总览

- 扫描范围：`web/src/app/App.tsx`、`web/src/app/CanvasWorkspace.tsx`、`web/src/app/appCanvasEffects.ts`、`web/src/app/workbench.css`，以及 `App.test.tsx`、`CanvasWorkspace.test.tsx`、`appCanvasEffects.test.ts`
- 发现 3 条优化点：性能 3 / 结构 0 / 可读性 0
- 按风险：低 2 / 中 1 / 高 0
- 建议先做：#1、#2（改动集中、已有交互测试、可通过浏览器和 CDP 指标自证）
- 建议后做：#3（涉及 hover 事件入口，需人工确认边缘和连线 hover 视觉不变）
- 前置检查 7 条全过：✓
- 浏览器基线：本地预览窗口 `1422 × 800`，`requestAnimationFrame` 间隔约 `8.3ms`，说明当前页面实际具备约 120Hz 的刷新调度；侧栏收合采样约 420ms 内产生 `31` 次 Layout、`34` 次 RecalcStyle；画布 wheel 采样只产生 `1` 次 Layout，但仍有逐帧 transform 预览和事件处理开销。
- 现有测试基线：`App.test.tsx`、`CanvasWorkspace.test.tsx`、`appCanvasEffects.test.ts` 共 `97` 项通过。

## 条目

### #1 把侧栏收合动画从 grid 布局过渡改为 transform 抽屉动画 ✓

- **位置**：`web/src/app/workbench.css:3672`、`web/src/app/workbench.css:10078-10128`、`web/src/app/workbench.css:11309-11323`
- **分类**：性能
- **现状**：`.workspace` 对 `grid-template-columns` 做 `180ms` 过渡；左侧栏已有 transform 抽屉规则，但收合/展开仍同时改变三列 grid，右侧栏主要依赖第三列从 `288px` 变成 `0`。
- **问题**：侧栏动画期间每一帧都可能重新计算工作台、画布和检查器的布局；浏览器采样在一次操作窗口内记录 `31` 次 Layout 和 `34` 次 RecalcStyle，动画没有完全走合成器路径。
- **建议**：取消 `.workspace` 的 `grid-template-columns` transition；保留最终状态的一次 grid 列宽切换，并给右侧 inspector 补齐与左侧一致的固定宽度、`translateX`、opacity 和 pointer-events 抽屉状态，让侧栏视觉移动只使用 transform/opacity。
- **建议映射的方法**：M-L4-02（将高频布局更新收束为一次最终提交）
- **风险**：中（侧栏最终几何位置不变，但需要人工确认展开过程中 canvas、标题栏按钮和右侧内容没有穿透或闪烁）
- **验证**：AI 自证（跑 `App.test.tsx`；CDP 对比 Layout/RecalcStyle 计数）｜ HUMAN（在桌面宽屏反复展开/收合左右侧栏，确认内容、点击区域和动画连续）
- **范围**：约 25 行 / 1 文件

### #2 缓存 canvas-world 引用并只在手势开始时切换 live-pan class ✓

- **位置**：`web/src/app/App.tsx:642-658`
- **分类**：性能
- **现状**：`previewCanvasViewport` 每个 RAF 都通过 `canvas.querySelector(".canvas-world")` 查找世界层，并重复调用 `classList.add("is-live-pan")`，随后写入 transform。
- **问题**：画布拖动和滚轮预览已经按 RAF 批处理，但每帧仍有 DOM 查询和 class 变更；这些操作与 transform 写入处在同一高频路径，增加主线程工作，尤其在节点、SVG 和阴影较多的画布上会放大掉帧感。
- **建议**：给 `.canvas-world` 增加稳定 ref，直接读取 ref 节点；用 ref 记录 live-pan 是否已激活，只在手势首帧添加 class、结束时移除，后续帧只更新 transform。
- **建议映射的方法**：M-L4-05（索引与缓存）
- **风险**：低（只替换 DOM 节点获取方式和重复 class 写入，不改变 viewport 数值或提交时机）
- **验证**：AI 自证（新增/更新 preview 测试，跑 `App.test.tsx`、`CanvasWorkspace.test.tsx`、`appCanvasEffects.test.ts`）｜ HUMAN（连续拖动画布、滚轮平移和 pinch zoom，确认位置、缩放和结束后的持久化一致）
- **范围**：约 20 行 / 1 文件 + 测试少量补充

### #3 删除 CanvasSurface 重复的 mousemove hover 事件入口 ✓

- **位置**：`web/src/app/CanvasWorkspace.tsx:381-430`
- **分类**：性能
- **现状**：同一个画布同时注册 `onPointerMove` 和 `onMouseMove`；两条路径都会解析 event target 并调用边 hover 状态处理，而鼠标输入已经会产生 pointermove。
- **问题**：鼠标拖动/移动时同一帧进入两套 React 事件分发；即使 hover 状态最终没有变化，也会重复执行 target.closest 和定时器判断，增加画布交互热路径的 JS 调度。
- **建议**：保留 `onPointerMove` 作为统一入口，删除 `onMouseMove`，将离开清理改为 pointer 事件对应的入口；保留现有 edge hover 延迟清理逻辑。
- **建议映射的方法**：M-L4-02（合并高频事件处理）
- **风险**：低（Pointer Events 已覆盖鼠标输入，但需确认触控板、鼠标和 SVG edge hover 的边界事件仍然完整）
- **验证**：AI 自证（跑 `CanvasWorkspace.test.tsx` 及相关 hover 测试）｜ HUMAN（在节点间空白、普通连线、势垒连线和节点边缘移动鼠标，确认 hover 高亮与拖动/滚轮不变）
- **范围**：约 8 行 / 1 文件 + 测试少量补充

## 已确认不列入本轮

- `CanvasSurface` 已使用 `memo`，现有测试已验证无关父状态不会触发画布重新渲染；本轮不重复做组件拆分或盲目增加 memo。
- `subscribeCanvasWheel`、指针移动和连接草稿已经使用 `requestAnimationFrame` 与延迟 commit；本轮不把现有批处理改成更长延迟，避免为了帧率引入输入滞后。
- 不直接永久给整张画布添加大量 `will-change`/滤镜层；该方向需要先有 paint/compositor trace 和人工视觉确认，避免增加显存或改变阴影表现。
