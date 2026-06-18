---
doc_type: issue-report
issue: 2026-06-18-canvas-sidebar-ui-polish
status: reported
severity: medium
tags: [ui, canvas, inspector, desktop]
---

# Canvas/sidebar UI polish report

## 用户反馈

- 节点卡片信息拥挤：节点类型、结构名、绝对能量、相对能量同时显示，导致 TS/INT 等节点难以扫描。
- 未匹配溶剂化日志的节点缺少旧项目里的指示灯。
- 画布连线、连线标签、过渡态能垒双箭头和虚线引导位置混乱。
- Source 面板应合并到 Node 面板，并支持用系统外部应用打开原始 log。
- 右侧 Node 栏应更接近 Codex 风格侧边栏；Export 应改成右上角浮动面板。
- 顶部 toolbar 不应重复 Import / Project；右下角 zoom toolbar 应合并到顶部；minimap 应放右下角、轻量化，并支持在 minimap 上滑动/滚轮移动画布。
- UI 上无意义解释文字应减少，图标可承载的动作只保留 tooltip / aria-label。

## 影响范围

- Web 工作台画布节点卡、edge/barrier SVG 标注、右侧 Inspector、Export UI、minimap 与 Electron raw-source 打开能力。
