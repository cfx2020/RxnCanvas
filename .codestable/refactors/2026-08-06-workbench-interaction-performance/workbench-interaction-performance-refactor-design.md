---
doc_type: refactor-design
refactor: 2026-08-06-workbench-interaction-performance
status: approved
scope: 工作台左右侧栏收合动画与画布 viewport/hover 高频交互路径
summary: 将侧栏视觉动画移到 transform/opacity 合成路径，并减少画布每帧 DOM 查询和重复事件分发
---

# workbench-interaction-performance refactor design

## 1. 本次范围

- 从 scan 勾选：#1 侧栏 transform 抽屉动画、#2 canvas-world 引用缓存、#3 合并 hover 事件入口。
- 明确不做：不改变侧栏最终宽度、画布 viewport 算法、wheel/drag 提交时机、连接磁吸、节点结构和视觉配色。
- 预估工作量：3 个实现步骤，整体风险中等。

## 2. 前置依赖

- 保留 `App.test.tsx` 的左右侧栏状态测试和 wheel/pan 测试。
- 保留 `CanvasWorkspace.test.tsx` 的 memo 与画布交互测试，并补 pointer hover 单入口刻画测试。
- 以浏览器 CDP 的 Layout/RecalcStyle 计数和 120Hz RAF 间隔作为前后基线。

## 3. 执行顺序

### 步骤 1：把侧栏动画迁移到合成器路径

- 引用方法：M-L4-02 Batching；Vercel `rendering-animate-svg-wrapper` 的同类原则（只动画 transform/opacity）。
- 具体操作：移除 `.workspace` 的 `grid-template-columns` transition，让 grid 只提交一次最终列宽；保留左侧栏现有 transform 抽屉规则；为 inspector 设置稳定宽度、transform/opacity transition，并在 collapsed 状态移出右侧、禁用 pointer events。
- 退出信号：侧栏状态测试通过；浏览器采样一次收合不再产生逐帧 Layout；左右侧栏视觉连续且最终 canvas 几何正确。
- 验证责任：AI 自证 + HUMAN。
- 回滚：恢复 workspace grid transition，并删除 inspector transform 抽屉规则。

### 步骤 2：缓存 canvas-world 并压缩 live-pan DOM 写入

- 引用方法：M-L4-05 Index & Cache；Vercel `js-cache-property-access`、`js-batch-dom-css`。
- 具体操作：给 CanvasSurface 暴露 canvas-world ref，App 直接读取该 ref；用 ref 记录 live-pan 激活状态，只在首次 preview 添加 class，结束时移除，后续帧仅写 transform。
- 退出信号：wheel/pan 测试通过；测试证明连续 preview 不重复查询 canvas-world 或重复激活 class；最终 viewport state 仍接管相同 transform。
- 验证责任：AI 自证 + HUMAN。
- 回滚：恢复 `canvasRef.current.querySelector(".canvas-world")` 和每帧 `classList.add`。

### 步骤 3：合并画布 hover 高频事件入口

- 引用方法：M-L4-02 Batching。
- 具体操作：删除 CanvasSurface 的 `onMouseMove` 路径，仅用 pointermove 同时处理 edge hover 和现有 pointer payload；离开清理改用 pointerleave。
- 退出信号：hover 刻画测试通过；浏览器确认普通边、势垒和空白区域 hover/离开行为不变。
- 验证责任：AI 自证 + HUMAN。
- 回滚：恢复独立 mousemove/mouseleave handler。

## 4. 风险与看点

- grid 列宽会在状态切换时一次性改变，侧栏本体再用 transform 滑动；需确认 canvas 不出现明显闪跳，尤其是左右侧栏同时收合时。
- inspector 在 collapsed 的零宽 grid track 中仍保持固定宽度，必须依靠 workspace overflow 和 translateX 完整移出，不能留下可点击区域。
- canvas-world ref 必须在 CanvasSurface 生命周期内稳定；卸载或视图切换后 preview 要安全 no-op。
- 删除 mousemove 后依赖 Pointer Events；当前 Electron/Chromium 和目标浏览器均支持，但仍以浏览器交互验证为准。
