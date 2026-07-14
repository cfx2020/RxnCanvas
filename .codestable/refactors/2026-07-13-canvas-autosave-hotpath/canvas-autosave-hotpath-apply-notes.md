---
refactor: 2026-07-13-canvas-autosave-hotpath
status: completed
date: 2026-07-13
---

# canvas-autosave-hotpath apply notes

## 实施结果

### 1. autosave 指纹延后

- 修改 `web/src/app/App.tsx`。
- 首次 hydration 仍建立已保存项目的基准指纹。
- 后续状态变化只重置 900ms debounce；深指纹在计时器真正触发保存时计算一次。
- 自动保存的内容、延迟和去重语义保持不变。

### 2. MiniMap 局部视口预览

- 修改 `web/src/app/CanvasWorkspace.tsx` 和 `web/src/app/App.tsx`。
- pointermove 只更新 MiniMap draft 与 `.canvas-world` 的 DOM transform，不再逐次提交 App 顶层 viewport state。
- pointerup 只提交一次最终 viewport。
- pointercancel 和组件卸载均取消临时帧并清理 live preview 状态。

### 3. MiniMap rAF 合并

- 高频 pointermove 的最新位置保存在 ref 中。
- 同一动画帧最多安排一次 draft/DOM preview 更新。
- pointerup 会取消尚未执行的帧，并以最新位置完成最终提交。

## 测试与验证

- 定向单测覆盖 autosave 与 MiniMap 的 rAF、preview、单次 commit 行为。
- Web 全量测试：42 个测试文件、374 项测试全部通过。
- Web production build：通过。
- `git diff --check`：通过。
- 浏览器验证：MiniMap 拖动后画布 transform 从 `translate(486px, 237px) scale(0.82)` 更新为 `translate(183px, 85px) scale(0.82)`；释放后 draft 消失，`.canvas-surface` 无 `is-live-pan` 残留，最终位置保持。
- 浏览器 console error：0。
- HUMAN 目视验收：用户于 2026-07-13 回复“确认”，MiniMap 拖动体验通过。

## 偏离

无。实施范围与 approved design 一致。
