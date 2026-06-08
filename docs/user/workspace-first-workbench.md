---
doc_type: user-guide
slug: workspace-first-workbench
component: web-workbench-shell
status: current
summary: 如何验收 RxnFlow Web 工作台的 workspace-first 主流程
tags: [web-workbench, workspace-first, project-rail, canvas-stage, export-dock, local-first, cdxml]
last_reviewed: 2026-06-08
---

# Web 工作台主流程验收

## 功能简介

RxnFlow Web 工作台当前按 canvas-first / workspace-first 流程组织：顶部菜单只保留 `Projects` 和 `Export` 这类全局入口；中间 `Graph Canvas` 是默认视觉主体；左侧 `Project Sidebar` 是项目抽屉、项目新建入口和项目文件树；右侧只在需要时展开 Report Export 面板。窄屏首屏默认收起项目栏，避免遮住画布。

当前 Web 版是 local-first。项目内容保存在当前浏览器本地仓储中，不是云同步；打开项目后，图谱、路径、视口、对象和 profile 会通过自动保存写回当前项目。报告文件从右侧 `Export` 面板单独导出。主界面不展示 `browser-local-indexeddb-opfs-v1`、`Runtime Fixture`、`browser-project:...` 这类实现细节。

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

1. 打开页面后确认第一屏以中间 `Graph Canvas` 为主体，顶部菜单显示 `Projects`、`Export`，不再显示 `Sources`、`Refresh`、`Save Project`、`Analysis` 或 runtime 状态。
2. 点击 `Projects` 展开左侧项目栏，在项目栏里新建项目，确认项目以文件夹形式出现在项目树里；正常保存 / 校验状态不会常驻显示，只有保存失败或项目内容缺失时才出现提醒。
3. 把一个原始输出文件导入项目：点击项目文件树旁的 `+` 选择文件，或把文件拖进左侧项目树。导入后左侧只显示项目里的计算输出文件，不显示 CDXML、CSV、PNG、XLSX 等导出物。
4. 把左侧 Project Files 里的文件拖到中间画布，或直接把本地原始输出文件拖到画布；使用真实 Gaussian/ORCA/MAPLE/XYZ/extxyz parser 时，需要先启动本地 `local-http` bridge。
5. 如果解析结果只有一个对象，画布会按落点创建节点；如果有多个对象或多帧候选，先在候选选择器里选择要放到画布的结构。
6. 在画布上从节点连接点拖线到另一个节点。节点左侧和右侧都提供连接点，画布会以平滑曲线显示 edge。无歧义时会自动创建或延长 active path；有分叉或重复节点时，后续会进入单独的路径编辑入口处理。当前主界面不再提供单独的 `Connect` / `Set Path` 按钮。
7. 画布会跟随 active path 自动维护当前能量 profile，节点卡和路径预览优先显示结构名、能量、电荷、自旋和 3D 结构。当前主流程不再单独打开 PES 面板手动 Compute。
8. 点击顶部 `Export` 打开右侧导出面板，先看 `Preview`，再切到 `Export` 模式导出：
   - PNG
   - CDXML
   - XLSX
   - CSV
   - SVG
9. 保持 `Include bytes` 开启，导出后确认每个 artifact 有 `Download` 和 `exports/...` path。checksum 等低频校验信息属于内部数据，不应常驻占用左侧项目树。
10. 等待自动保存完成后，刷新页面或重新打开同一 browser-local project，确认项目文件、画布节点、边、path、viewport、3D 结构和 PES/profile 状态能恢复。若旧项目只保存了线性 edge 而没有 path，Web 工作台会在打开时自动修复为当前 active path。
11. 继续从左侧 Project Files 点击文件行，或把项目文件拖回画布，确认已有项目文件可以再次生成画布节点而不重复写入 raw object。

## 当前边界

- Web 版当前不提供云存储、账号、自动同步、多人协作或后台目录监听。
- `Project Sidebar` 中的 Project Files 是当前项目已经拥有的文件；本地文件夹入口只是快速选择和导入入口。
- 项目保存是自动保存流程：它保存项目内容、图谱 workspace、节点、边、路径、viewport 和 profile。当前没有顶部 `Save Project` 按钮。
- `.rxnflow.zip` 项目包能力仍保留在内部/CLI/备份文档中，但不再是 Web 左侧主流程入口。
- CDXML 导出当前只支持 `.cdxml` XML 文件，不支持 `.cdx` 二进制文件，也不包含分子级原子/键编辑语义。
- 当前 parser smoke 只证明 fixture 或 local-http 本地开发链路可用；local-http inline preview 当前单文件上限为 12MiB，可覆盖 `Ni-fxc` 这类 10MiB 内 Gaussian log，但不等于完整认证 Gaussian、ORCA、MAPLE、XYZ 或 extxyz 的全部真实输出。
- PNG、CDXML、XLSX、CSV 和 SVG artifacts 只在 `Include bytes` 开启且有 active browser project 时写入项目 `exports/...`。

## 常见问题

Q: 网页版需要购买云存储才能保存吗？

A: 不需要。当前保存到浏览器本地仓储。但这不是云备份，浏览器清数据或换设备会丢失本地项目。当前主流程使用自动保存保留本浏览器项目；跨设备分享/备份仍属于后续产品入口要重新设计的能力。

Q: 重新打开项目后应该恢复哪些内容？

A: 重新打开项目后，Project Files 里只显示项目 raw 输入文件；画布节点、边、路径、viewport、对象和 profile 会从项目内容恢复。导出的 PNG/CDXML/XLSX/CSV/SVG 仍归右侧 Export 面板管理。

Q: 为什么没有 `Connect` 或 `Set Path` 按钮？

A: 当前口径是“连接就是路径”：从节点连接点拖线到另一个节点会创建 edge，并在无歧义时自动创建或延长 active path。节点左右连接点用于表达输入/输出方向；只有出现分叉、重复节点或内部连接时，才需要进入后续单独路径编辑入口整理主路径。

Q: 为什么 Project Files 里没有 CDXML、CSV、PNG 或 XLSX？

A: 左侧 Project Files 只服务导入画布的原始计算输出文件。CDXML、CSV、PNG、XLSX 和 SVG 是报告导出 artifacts，放在右侧 Export 面板查看和下载。

Q: CDXML 能直接当 ChemDraw 结构文件编辑吗？

A: 当前 CDXML 是能量图 artifact，包含结构名称、相对能量、相邻 `dE`、missing reason 和 correction marker。它不是分子结构 CDXML，不包含原子/键或反应式语义。

## 相关功能

- 报告导出格式和边界：`docs/user/report-export-artifacts.md`
- 项目备份包内部/CLI边界：`docs/user/project-bundle-backup.md`
- CLI 打开并恢复项目内容：`docs/user/open-project-content.md`
- parser 输出支持边界：`docs/user/parser-output-support.md`
