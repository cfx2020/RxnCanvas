---
doc_type: user-guide
slug: workspace-first-workbench
component: web-workbench-shell
status: current
summary: 如何验收 RxnFlow Web 工作台的 workspace-first 主流程
tags: [web-workbench, workspace-first, project-rail, canvas-stage, analysis-dock, local-first, cdxml]
last_reviewed: 2026-06-05
---

# Web 工作台主流程验收

## 功能简介

RxnFlow Web 工作台当前按 workspace-first 流程组织：左侧 `Project Sidebar` 管当前浏览器本地项目和项目内文件，中间 `Graph Canvas` 管结构节点和路径，右侧 `Analysis Dock` 管 PES、导出、对象详情和诊断。

当前 Web 版是 local-first。项目内容保存在当前浏览器本地仓储中，不是云同步；完成编辑后用左侧 `Save Project` 保存当前项目状态。报告文件从右侧 `Export` 面板单独导出。

## 打开方式

从仓库的 `web/` 目录启动开发服务：

```bash
cd web && npm run dev
```

然后打开：

```text
http://127.0.0.1:5173/
```

不要直接打开 `file://.../web/index.html`。Vite / React 源码入口需要开发服务。

## 最小验收路线

1. 打开页面后确认第一屏能看到三块主区域：
   - 左侧 `Project Sidebar`
   - 中间 `Graph Canvas`
   - 右侧 `Analysis Dock`
2. 在左侧输入项目名，点击 `Create Project`。看到项目处于 `Persisted` 和 `Valid` 状态。
3. 把一个小的原始输出文件导入项目。当前可以从 `Source Tray` 选择文件，也可以把文件拖到中间画布。
4. 导入后确认项目文件进入左侧 Project Files，而不是只停留在一次性文件选择器里。
5. 如果解析结果只有一个对象，画布会按落点创建节点；如果有多个对象或多帧候选，先在候选选择器里选择要放到画布的结构。
6. 在画布上连接节点。无歧义时会自动创建或延长 active path；有分叉或重复节点时，继续用 path 列表和 Path Order Draft 手动整理。
7. 切到右侧 `PES`，点击 `Compute`，确认能看到 profile id、相对能量、step delta、missing reason 和能量曲线。
8. 切到右侧 `Export`，先看 `Preview`，再切到 `Export` 模式导出：
   - PNG
   - CDXML
   - XLSX
   - CSV
   - SVG
9. 保持 `Include bytes` 开启，导出后确认每个 artifact 有 `Download`、`exports/...` path、persisted 状态和 checksum。
10. 点击左侧 `Save Project`，确认项目保持 `Persisted` / `Valid`。
11. 刷新页面或重新打开同一 browser-local project，确认项目文件、画布节点、边、path、viewport 和 PES/profile 状态能恢复。
12. 继续从左侧 Project Files 点击 `Add to canvas` 或把项目文件拖回画布，确认已有 raw 文件可以再次生成画布节点而不重复写入 raw object。

## 当前边界

- Web 版当前不提供云存储、账号、自动同步、多人协作或后台目录监听。
- `Project Sidebar` 中的 Project Files 是当前项目已经拥有的文件；本地文件夹入口只是快速选择和导入入口。
- `Save Project` 是当前 Web 主流程的持久化入口：它保存项目内容、图谱 workspace、节点、边、路径和 viewport。
- `.rxnflow.zip` 项目包能力仍保留在内部/CLI/备份文档中，但不再是 Web 左侧主流程入口。
- CDXML 导出当前只支持 `.cdxml` XML 文件，不支持 `.cdx` 二进制文件，也不包含分子级原子/键编辑语义。
- 当前 parser smoke 只证明 fixture 或 local-http 小文件链路可用，不等于完整认证 Gaussian、ORCA、MAPLE、XYZ 或 extxyz 的全部真实输出。
- PNG、CDXML、XLSX、CSV 和 SVG artifacts 只在 `Include bytes` 开启且有 active browser project 时写入项目 `exports/...`。

## 常见问题

Q: 网页版需要购买云存储才能保存吗？

A: 不需要。当前保存到浏览器本地仓储。但这不是云备份，浏览器清数据或换设备会丢失本地项目。当前主流程先使用 `Save Project` 保留本浏览器项目；跨设备分享/备份仍属于后续产品入口要重新设计的能力。

Q: 保存项目后应该恢复哪些内容？

A: 重新打开项目后，Project Files 里只显示项目 raw 输入文件；画布节点、边、路径、viewport、对象和 profile 会从项目内容恢复。导出的 PNG/CDXML/XLSX/CSV/SVG 仍归右侧 Export 面板管理。

Q: 为什么 Project Files 里没有 CDXML、CSV、PNG 或 XLSX？

A: 左侧 Project Files 只服务导入画布的原始计算输出文件。CDXML、CSV、PNG、XLSX 和 SVG 是报告导出 artifacts，放在右侧 Export 面板查看和下载。

Q: CDXML 能直接当 ChemDraw 结构文件编辑吗？

A: 当前 CDXML 是能量图 artifact，包含结构名称、相对能量、相邻 `dE`、missing reason 和 correction marker。它不是分子结构 CDXML，不包含原子/键或反应式语义。

## 相关功能

- 报告导出格式和边界：`docs/user/report-export-artifacts.md`
- 项目备份包内部/CLI边界：`docs/user/project-bundle-backup.md`
- CLI 打开并恢复项目内容：`docs/user/open-project-content.md`
- parser 输出支持边界：`docs/user/parser-output-support.md`
