---
doc_type: refactor-apply-notes
refactor: 2026-08-06-workbench-interaction-performance
---

# workbench-interaction-performance apply notes

## 步骤 1: 把侧栏动画迁移到合成器路径

- 完成时间: 2026-08-06
- 改动文件: `web/src/app/App.tsx`、`web/src/app/InspectorPanels.tsx`、`web/src/app/App.test.tsx`、`web/src/app/workbench.css`
- 验证结果: `App.test.tsx` 与 `InspectorPanels.test.tsx` 共 91 项通过；浏览器采样左右侧栏单次收合均为 2 次 Layout，基线约为 31 次；collapsed inspector 完整移出视口、opacity 为 0、带 `aria-hidden` 和 `inert`。
- 偏离: 为保证右侧栏关闭时也能播放 transform 动画，InspectorPanel 从条件卸载改为常驻 DOM，并通过 `aria-hidden` + `inert` 保持折叠状态不可见、不可聚焦。

## 步骤 2: 缓存 canvas-world 并压缩 live-pan DOM 写入

- 完成时间: 2026-08-06
- 改动文件: `web/src/app/App.tsx`、`web/src/app/CanvasWorkspace.tsx`、`web/src/app/appCanvasEffects.ts`、`web/src/app/App.test.tsx`、`web/src/app/appCanvasEffects.test.ts`
- 验证结果: canvas-world 改为稳定 ref；连续 preview 只在首帧激活 `is-live-pan`；wheel commit 后约 70ms 自动释放 class。相关定向测试共 97 项通过，浏览器逐帧采样确认 active 9 帧后恢复为 false。
- 偏离: 原设计只提到 App 内 class 生命周期；实施时发现 wheel effect 没有 preview-end 回调，补充 `finishPreview` 以避免首次 wheel 后永久保留合成提示。

## 步骤 3: 合并画布 hover 高频事件入口

- 完成时间: 2026-08-06
- 改动文件: `web/src/app/CanvasWorkspace.tsx`、`web/src/app/CanvasWorkspace.test.tsx`
- 验证结果: 删除 surface `mousemove`，pointermove 同时处理 edge hover 与画布 payload；测试确认 mousemove 不再触发 edge hover、pointermove 正常触发。浏览器移动到曲线时出现 1 个 hovered label，移到空白 230ms 后归零。
- 偏离: 无。

## 全量回归

- `npm run test`: 45 个测试文件、446 项测试全部通过。
- `npm run build`: TypeScript 与 Vite 生产构建通过；仅保留 3Dmol 直接 eval 和既有大 chunk 警告。
- 浏览器性能: 侧栏单次收合 Layout 从基线约 31 次降到 2 次；原生 8ms 指针输入下画布平均 RAF 间隔 8.44ms，最大 16.9ms，无 20ms 以上长帧。
- 视觉验证: 默认桌面宽度和窄屏响应式宽度均无横向溢出；侧栏、画布、Inspector 和 minimap 未重叠。
