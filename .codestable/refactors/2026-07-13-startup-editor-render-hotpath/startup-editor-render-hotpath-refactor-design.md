---
doc_type: refactor-design
refactor: 2026-07-13-startup-editor-render-hotpath
status: approved
scope: 启动恢复、画布无关重渲染与重编辑器预加载
summary: 消除启动重复项目读取和状态应用，稳定画布 props，并在明确意图时预热重模块
---

# startup-editor-render-hotpath refactor design

## 1. 本次范围

- 执行 S1–S6，不拆小面板，不处理两个独立 correctness bug。
- 保持 startup payload 顺序、最终 active project、逐项目登记、编辑器功能和首屏 bundle 边界不变。

## 2. 执行顺序

### 步骤 1：启动目录映射与基础 I/O 合并

- 方法：M-L4-05、M-L4-02、M-L4-06。
- 操作：首次 restore 完成后按最终 payload 顺序建立全部 project id→directory map；无效 recent 批量移除后只持久化/建菜单一次；preferences/recent store 用 Promise.all。
- 退出信号：每个有效 workspace 只完整读取一次；active 和 payload 顺序不变；失效 recent 只写一次。
- 验证：AI 自证。

### 步骤 2：renderer startup batch apply

- 方法：M-L4-02。
- 操作：startup payload 在纯 transition 中顺序累积，逐个记住目录，但只 apply 最终 workspace transition 和 bind 最终 active 一次；稳定 effect + latest handler ref 保持不变。
- 退出信号：多项目测试最终状态一致，runtime active bind 一次。
- 验证：AI 自证。

### 步骤 3：CanvasSurface memo 边界

- 方法：M-L4-01。
- 操作：稳定 App 的两个内联 callback；给 CanvasSurface 增加 memo；补无关 App state 不触发画布 commit 的测试。
- 退出信号：设置/导出等无关更新不重渲染 CanvasSurface；node/viewport 变化仍正常。
- 验证：AI + 浏览器。

### 步骤 4：重编辑器意图预加载

- 方法：M-L4-03。
- 操作：KetcherEditorHost 和 3Dmol 使用共享 loader/import promise；3Dmol 在 Open 3D 按钮 hover/focus 时预热；Ketcher 仅在 Edit 2D 按钮 focus 时立即预热，hover 使用 200ms intent timer 并在 leave 时取消，避免误触即创建 Worker。
- 退出信号：首屏不请求重包；hover/focus 后开始加载；点击功能正常且无重复网络加载。
- 验证：AI + 浏览器。

## 3. 风险与回滚

- 重复 project id 映射必须按 payload 顺序写入，让 active 最后覆盖。
- startup batch 不能改变 stable effect/handler-ref 约束。
- memo props 必须全部稳定，否则收益为零。
- preload 只绑定明确功能按钮，不预加载 CDXML Worker 模块。
- 每步可独立恢复旧实现。
