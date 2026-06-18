---
doc_type: issue-fix-note
issue: 2026-06-18-notion-canvas-node-table-polish
status: fixed
severity: medium
tags: [ui, canvas, node-card, table, minimap, multi-canvas]
fixed_at: 2026-06-18
---

# Notion-style canvas/node/table polish fix note

## 修复内容

- 顶部增加 Notion-style 画布标签栏：默认 `画布 1`，支持运行时新增画布 tab。
- 画布 / 表格切换改为工具栏内胶囊 segmented control，并添加滑块动画。
- 节点卡片重排：
  - 连接端口默认隐藏，hover / keyboard connection / 已连接时显示。
  - `Set zero` 移到更多菜单。
  - 节点标题支持 inline rename。
  - 缺失溶剂化配对时才显示红色脉冲状态灯。
  - 节点高度与 edge anchor 对齐，修复连线和端口错位。
  - barrier handle 改为自绘活化能曲线图标。
- Auto layout 改为以当前 zero node 为最左侧起点，结合 graph depth 和 relative energy 排布节点。
- Table view 改为实体表格背景、更高密度，不再显示画布点阵背景；工具条单行横向滚动，避免遮挡表格。
- Minimap 拖动时实时调用 `onViewportChange`，并支持拖动当前 viewport window 时保留鼠标相对窗口中心的偏移。
- 修复真实浏览器中节点更多菜单被 `.node-header span { overflow:hidden }` 裁剪导致 Set zero 点不到的问题。
- 为 synthetic pointer smoke 增加 pointer capture 安全保护，避免开发日志出现 NotFoundError。

## 验证

- `python3 -m unittest discover`：通过（22 tests）。
- `cd web && npm run test -- --run`：通过（30 files / 234 tests）。
- `cd web && npm run build`：通过。
- `cd web && npm run desktop:smoke`：通过。
- Browser smoke（Playwright）：通过。
  - 画布 tab 显示 `画布 1`。
  - Table view 显示实体表格背景。
  - 节点更多菜单 `Set zero` 可真实点击。
  - Minimap pointer move 阶段即改变 `.canvas-world` transform。
- `cd web && npm run desktop:pack`：通过，已重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && npm run desktop:runtime:smoke`：通过。
  - app.asar: `Jun 18 15:23:24 2026 /Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/Resources/app.asar`

## 已知非本次完整落地

- 多画布当前为工作台运行时入口；完整项目 package schema 持久化多 canvas graph 仍应后续拆 feature 落地。
- macOS 签名 / 公证、Windows 真机验证仍是分发前验证项。
