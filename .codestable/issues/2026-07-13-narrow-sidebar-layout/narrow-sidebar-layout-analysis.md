---
doc_type: issue-analysis
issue: 2026-07-13-narrow-sidebar-layout
status: confirmed
root_cause_type: logic
related: [narrow-sidebar-layout-report.md]
tags: [ui, responsive, css-cascade, sidebar]
---

# 窄屏侧栏布局异常根因分析

## 1. 问题定位

| 关键位置 | 说明 |
|---|---|
| `web/src/app/App.tsx:2817` | 左按钮只切换 `leftSidebarOpen`，事件绑定正确。 |
| `web/src/app/App.tsx:2864` | 右按钮只切换 `rightSidebarOpen`，事件绑定正确。 |
| `web/src/app/workbench.css:14418` | 旧窄屏规则把“仅右栏关闭”错误放进保留 inspector 列宽的选择器组。 |
| `web/src/app/workbench.css:14427` | 同一规则把“仅左栏关闭”错误放进 inspector 列宽为 0 的选择器组。 |
| `web/src/app/workbench.css:14436` | 左栏打开状态仍采用偏移到屏外、仅 hover/focus 展开的旧抽屉交互。 |
| `web/src/app/workbench.css:16044` | 后续规则重新覆盖项目栏宽度，但没有同步旧抽屉位移基准，可能使侧栏完全移出可视区域。 |
| `web/src/app/workbench.css:11042` | `max-width: 1100px` 把左标题栏按钮移到 19px，覆盖 macOS 红绿灯安全位置。 |

## 2. 失败路径还原

**正常路径**：点击左/右按钮 → React 分别更新独立布尔状态 → workspace 获得对应 collapsed class → CSS 只调整目标侧栏及其占用空间。

**失败路径**：点击按钮 → React class 正确变化 → 多代响应式 CSS 使用重叠且优先级不同的选择器 → 左状态改变了右侧第三列，右状态无法清空第三列；左栏虽然进入 open 状态，却仍被旧 transform 移出屏幕。

**分叉点**：`web/src/app/workbench.css:14418` — CSS 没有把默认、仅左收起、仅右收起、两边收起四种状态做成互斥映射。

## 3. 根因

**根因类型**：logic

**根因描述**：按钮和 React 状态没有绑反，真正问题是历史响应式样式层叠。高优先级 `:not()` 选择器覆盖了后续 collapsed 规则，并且旧 hover drawer 与后续 rail width 回滚规则组合后产生宽度/位移不一致。macOS 标题栏又被通用窄屏变量改到窗口最左侧，失去原生控件安全区。

**是否有多个根因**：是。主因是侧栏四态 CSS 映射错误；次因是左栏仍使用与按钮开关不一致的 hover 展开模型；第三项是 macOS 安全区被通用窄屏变量覆盖。

## 4. 影响面

- **影响范围**：所有 1180px 以下工作台；960px 以下 inspector overlay 场景最明显。
- **潜在受害模块**：画布可用宽度、节点 inspector、项目文件栏、标题栏 tab 和窗口拖拽控件。
- **数据完整性风险**：无，仅布局和交互状态显示错误。
- **严重程度复核**：维持 P1，核心编辑界面可用性明显受损。

## 5. 修复方案

### 方案 A：在现有规则末尾建立统一窄屏契约
- **做什么**：显式声明侧栏四态；窄屏左栏始终自动收起并从左边缘 hover/focus 展开；960px 以下 inspector 固定为 overlay 且 grid 第三列恒为 0；macOS 保留原生标题栏安全位置。
- **优点**：改动集中、风险低，可覆盖现有历史层叠而不牵动桌面宽屏。
- **缺点 / 风险**：旧 CSS 仍存在，后续应逐步清理历史重复层。
- **影响面**：`workbench.css` 和侧栏交互回归测试。

### 方案 B：立即重写全部工作台响应式 CSS
- **做什么**：删除旧断点和重复规则，重新组织完整布局样式。
- **优点**：长期结构最干净。
- **缺点 / 风险**：范围大，会同时触碰节点卡片、工具栏、标题栏拖拽等近期稳定区域，不适合本次定点修复。
- **影响面**：整个工作台视觉层和大量回归场景。

### 推荐方案

**推荐方案 A**，理由：直接修正本次根因，保持宽屏和已有节点视觉不变，并能通过四态测试和窄屏几何验证建立清晰契约。
