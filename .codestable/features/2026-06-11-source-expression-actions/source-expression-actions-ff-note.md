---
doc_type: feature-ff-note
feature: source-expression-actions
date: 2026-06-11
requirement:
tags: [web-workbench, graph-canvas, source-provenance, stoichiometry, raw-log]
---

## 做了什么

把节点菜单里的手动 composition / 表达式入口删除，化学计量数收敛为节点卡片标题行里的内联 `×1` chip：默认显示 1，点击数字即可编辑 coefficient；同时把“查看来源信息”右栏改成原始 log 优先的浮动面板。用户可以从画布节点直接查看保留在项目里的原始计算 log 预览，并看到紧凑的解析摘要；原始 log 仍作为来源证据，不是画布计算 authority。

## 改了哪些

- `web/src/app/GraphCanvas.tsx` — 节点三点菜单不再显示化学计量数入口；节点标题行直接显示可编辑 `×1` chip，回车或失焦后提交 coefficient；能量布局按 graph layer + slot 分配横向位置，并按节点尺寸估算纵向防撞，避免结构多时堆叠。
- `web/src/app/WorkbenchShell.tsx` — 右侧 inspector 支持 `source` / `export` 两种模式；Source Inspector 读取 Browser Project Repository 里的原始文件 bytes，默认展示有限 raw log 预览和紧凑解析摘要，并提供“显示全文 / 收起预览”按需切换；raw log viewer 在预览和全文模式下都限制在浮动栏内部滚动，Source Inspector 可由关闭按钮或点击画布关闭。
- `web/src/app/graphNodeLayout.ts` / `web/src/app/graphViewport.ts` — 图谱虚拟画布从 `600 x 360` 扩大到 `1600 x 1000`，减少节点多时的“空气墙”和布局堆叠。
- `web/src/app/i18n/messages.ts` / `web/src/app/workbench.css` — 右侧 inspector / export dock 改为 viewport-fixed 浮动抽屉，移除画布右侧预留缝和宽 grid 下的离屏位移；补齐中英文文案和 raw log viewer 样式。
- `web/src/app/GraphCanvas.test.tsx` / `web/src/app/WorkbenchShell.test.tsx` / `web/src/app/graphViewport.test.ts` / `web/src/app/graphAutoLayout.test.ts` — 覆盖节点菜单来源入口、节点内联系数 chip、扩大后的 graph-space 坐标和能量布局。

## 怎么验证的

已跑 `cd web && npm run test -- --run`、`cd web && npm run build`、`git diff --check` 和 CodeStable YAML 校验。浏览器验证中，节点菜单只保留来源等更多操作；Source Inspector 能读取真实项目 `4b+.log` 原始 Gaussian log 预览，默认展示 220000 字符，点击“显示全文”后可加载完整约 1040 万字符文本；预览和全文 raw viewer 都不会顶出右侧浮动栏，点击画布后 Source Inspector 关闭。化学计量数验证为节点标题行内联 `×1` chip，点击后变成数字输入并直接调用 `workspace.set_node_composition`；Export dock 和 Source Inspector 均为右侧浮动面板，画布不再预留右侧空列；6 个可见节点执行能量布局后重叠数为 0。

## 顺手发现

- `Page.captureScreenshot` 在当前重画布/3D 项目下仍会超时，和既有 fix note 里的截图超时一致，后续需要单独性能/截图稳定性排查。
- 多路径画布标签页、多路径独立零点和表格多 sheet 是跨模型功能，已单独沉淀到 roadmap，不塞进本次 fast-follow。
