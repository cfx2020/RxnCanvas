---
doc_type: feature-acceptance
feature: 2026-06-27-resizable-project-rail
status: accepted
accepted_at: 2026-06-27
summary: 左侧 Project rail 默认收窄为最小宽度，并可通过右边缘拖拽或键盘调宽，宽度保存在本机 localStorage。
tags: [ui, sidebar, project-rail, resize]
---

# resizable-project-rail acceptance

## 用户需求

左侧栏默认稍微窄一点，并且用户可以自由调节；默认是最窄状态，只允许往更宽方向调节。

## 落地行为

- Project rail 默认宽度为 `212px`，也是最小宽度。
- 最大宽度为 `360px`。
- 左侧栏右边缘新增 resize handle，拖动可调节宽度。
- 选中 handle 后可用 ArrowLeft / ArrowRight 微调，Home 回到最窄，End 到最宽。
- 宽度写入本机 `localStorage: rxnflow-project-rail-width`，不进入项目文件。
- 结构预览遮罩的左侧 rail offset 改为读取同一个 `--rxnflow-project-rail-width`，避免侧栏变宽后弹层中心错位。

## 验证

- 浏览器验证：默认 Project rail 宽度为 `212px`，workspace grid 第一列为 `212px`。
- 浏览器验证：拖动 resize handle 后 Project rail 可变为约 `301px`，workspace grid 同步更新。
- 浏览器验证：拖回左侧后宽度回到 `212px`。
- `cd web && npm run build` 通过。
- `cd web && npm run test -- App.test.tsx` 通过。
