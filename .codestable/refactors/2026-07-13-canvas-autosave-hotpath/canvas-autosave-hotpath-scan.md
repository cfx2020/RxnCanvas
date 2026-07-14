---
doc_type: refactor-scan
refactor: 2026-07-13-canvas-autosave-hotpath
status: user-reviewed
scope: App.tsx autosave 热路径、CanvasWorkspace.tsx MiniMap 拖动及对应 App 测试，约 500 行相关代码
summary: 发现 2 条性能优化点，均为中低风险且已有测试覆盖
---

# canvas-autosave-hotpath scan

## 总览

- 扫描范围：`web/src/app/App.tsx:543-564,2194-2246,3168-3174`、`web/src/app/CanvasWorkspace.tsx:1680-1850`、相关 `App.test.tsx`
- 发现 2 条性能优化点：性能 2 / 结构 0 / 可读性 0
- 按风险：低 1 / 中 1 / 高 0
- 建议先做：#1，再做 #2
- 建议慎做 / 后做：#2 需要浏览器确认 MiniMap 拖动视觉连续
- 前置检查 7 条全过：✓（范围限定在相关函数片段，不扫描整个大文件）

## 条目

### [#1] 把 autosave 指纹计算移入防抖回调 ✓

- **位置**：`web/src/app/App.tsx:2194-2246`
- **分类**：性能
- **现状**：每次 `autosaveInput` 改变时先同步调用 `projectAutosaveKey`，然后才建立 900ms 定时器；真正保存时又计算一次指纹。
- **问题**：指纹构建遍历项目、文件、画布、节点和解析摘要；MiniMap/画布交互可在防抖生效前反复执行这次 O(项目规模) 计算。
- **建议**：首次水合只计算一次基准指纹，后续变更仅重置定时器，由 `runAutosaveProject` 在定时器触发后读取最新 ref 并计算一次指纹。
- **建议映射的方法**：M-L4-02（批处理）
- **风险**：低；不改变保存内容、900ms 延迟或去重规则。
- **验证**：AI 自证（autosave 现有测试 + 新增指纹调用次数测试）
- **范围**：约 20 行 / 1 个实现文件 + 1 个测试文件

### [#2] MiniMap 拖动改为局部预览后单次提交 ✓

- **位置**：`web/src/app/CanvasWorkspace.tsx:1710-1830`、`web/src/app/App.tsx:3028-3034`
- **分类**：性能
- **现状**：每次 `pointermove` 同时更新 MiniMap draft state 和 App 顶层 viewport state，导致整个 App、画布派生值和 autosave 输入链重算。
- **问题**：每个指针事件至少重算两次 O(nodes) MiniMap geometry，并触发 3800 行 App 组件重新渲染；拖动频率通常可达每秒数十次。
- **建议**：新增局部 viewport preview 回调，使用现有 DOM transform 预览主画布；MiniMap draft 用 `requestAnimationFrame` 合并更新，`pointerup` 时只向 App 提交一次最终 viewport。
- **建议映射的方法**：M-L4-02（批处理）
- **风险**：中；必须保持拖动中的画布和 MiniMap 窗口同步，取消拖动时恢复正式 viewport。
- **验证**：AI 自证（MiniMap 单测断言 move 不提交、up 仅提交一次）｜ HUMAN（浏览器连续拖动 MiniMap）
- **范围**：约 80 行 / 2 个实现文件 + 1 个测试文件
