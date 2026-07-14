---
doc_type: refactor-design
refactor: 2026-07-13-canvas-autosave-hotpath
status: approved
scope: MiniMap 高频拖动和桌面 autosave 指纹构建
summary: 延后 autosave 深指纹，并把 MiniMap 高频更新限制在局部预览
---

# canvas-autosave-hotpath refactor design

## 1. 本次范围

- 从 scan 勾选：#1 autosave 指纹延后、#2 MiniMap 局部预览与单次提交。
- 明确不做：不改变 autosave 内容、持久化字段、900ms 延迟；不处理 Electron 源文件复制、Python engine、ProjectRail 或 CanvasSurface memo。
- 预估工作量：3 个实现步骤，风险中等。

## 2. 前置依赖

- 保留现有 autosave 集成测试并增加指纹延后刻画测试。
- 扩充 MiniMap 测试，明确 `pointermove` 只预览、`pointerup` 才提交。
- 复用 `App.tsx` 已有 `previewCanvasViewport`，不新增第二套 DOM transform 实现。

## 3. 执行顺序

### 步骤 1：延后 autosave 指纹

- 引用方法：M-L4-02 Batching
- 具体操作：将 autosave effect 中每次变更都会执行的 `projectAutosaveKey` 移入首次水合分支；后续 effect 只负责 debounce，保存回调使用 `autosaveInputRef.current` 计算最新指纹。
- 退出信号：现有 autosave 测试通过；连续状态变化在定时器触发前不调用指纹构建。
- 验证责任：AI 自证。
- 回滚：恢复 effect 内的预计算指纹。

### 步骤 2：建立 MiniMap 局部预览通道

- 引用方法：M-L4-02 Batching；Vercel `rerender-use-ref-transient-values`
- 具体操作：MiniMap 增加 `onViewportPreview`；App 传入已有 `previewCanvasViewport`。拖动时不再调用顶层 `setViewport`，而是更新 DOM 预览和 MiniMap draft；结束时调用一次 `onViewportChange`。
- 退出信号：测试证明 pointermove 不提交 App viewport、pointerup 恰好提交一次；取消操作清理 draft。
- 验证责任：AI 自证。
- 回滚：恢复 move 时直接调用 `onViewportChange`。

### 步骤 3：用 rAF 合并 MiniMap 高频 draft 更新

- 引用方法：M-L4-02 Batching；Vercel `rerender-use-ref-transient-values`
- 具体操作：用 ref 保存最新 draft viewport，每帧最多 setState/DOM preview 一次；pointerup 前同步 flush 最新值，unmount 时取消 frame。
- 退出信号：测试证明同一帧多次 pointermove 只安排一个 frame；浏览器拖动保持连续且释放位置准确。
- 验证责任：AI 自证 + HUMAN。
- 回滚：保留步骤 2 的局部预览，删除 rAF 调度层。

## 4. 风险与看点

- 最大风险是 pointerup 发生在已排队 frame 执行前，因此提交前必须同步 flush 最新 pointer payload。
- DOM 预览结束后正式 viewport state 必须接管相同 transform，不能闪回旧位置。
- autosave 仍会保存 viewport 和选择状态，本次只减少防抖期间的重复 CPU，不改变持久化行为。
