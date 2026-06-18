---
doc_type: issue-report
issue: 2026-06-18-notion-canvas-node-table-polish
status: reported
severity: medium
tags: [ui, canvas, node-card, table, minimap, multi-canvas]
---

# Notion-style canvas/node/table polish report

## 用户反馈

- 顶部布局应参考 Notion：上方有画布标签页，一个项目支持多个画布；标签栏下方是工具栏；左右侧栏按钮和导出按钮也参考 Notion 顶栏。
- 节点卡片视觉仍不理想：连接点和曲线没有贴合；无连接时端口应隐藏，hover/准备连接时浮出，连接后常显；底部 barrier handle 图标需要更像活化能曲线；右上按钮 group 过重；正常配对时不显示状态灯，仅缺失溶剂化时红色提示；节点文件名/标题应可编辑；Set zero 应放到更多菜单。
- 能量布局应把当前 0 点放最左边，按连线计算的相对能量决定节点相对位置。
- 表格视图背景不应使用画布点阵；表格应更像表格、更高信息密度；画布/表格切换应是胶囊滚动/滑动交互。
- Minimap 拖动预览框时应实时滚动画布，而不是松开鼠标才更新。
