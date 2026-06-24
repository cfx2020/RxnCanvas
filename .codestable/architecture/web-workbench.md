---
doc_type: architecture
slug: web-workbench
scope: Electron/Vite renderer 当前桌面工作台的项目栏、画布/表格、Inspector、导入导出与工作区持久化表面
summary: 当前桌面工作台采用“项目级共享 source files + active canvas 投影编辑”模型，并已同步到紧凑 toolbar、悬浮侧栏预览、可重命名节点卡和统一 node inspector/structure dialog 这套 UI 现状
status: current
created: 2026-05-16
last_reviewed: 2026-06-23
depends_on: [core-platform]
implements: [project-content-persistence]
tags: [web, react, vite, desktop-renderer, local-first, canvas, multi-canvas, inspector, import, export, project-schema]
---

# Web Workbench

## 0. 术语

- **Project workspace snapshot**：某个项目的完整 renderer 快照，包含共享 `files`、全部 `canvases[]`、`activeCanvasId`，以及当前视图/Inspector 相关 UI 状态；定义在 `web/src/app/projectWorkspace.ts` 的 `ProjectWorkspaceSnapshot`。（`web/src/app/projectWorkspace.ts:27-44`）
- **Active canvas projection**：React 当前直接编辑的 `nodes` / `edges` / `barriers` / `viewport` / selection。切换 canvas 或保存项目时，这层投影要写回项目快照中的 `canvases[]`。（`web/src/app/projectCanvasState.ts:35-122`; `web/src/app/projectWorkspace.ts:276-330`）
- **Source file group**：Project Rail 里用于展示的文件分组；Gaussian / ORCA / MAPLE 的 gas / solution 对会按结构名合并成一行显示。（`web/src/app/fileDisplay.ts:105-119, 234-316`）

## 1. 定位与受众

`web/` 是当前 RxnFlow 桌面端的唯一 active renderer。它服务的是“本地项目、图谱编辑、结构预览、轻量导入导出”这一条桌面工作台主链路，不是旧 browser-first Web shell，也不是云端工作台。（`web/src/app/App.tsx:1382-1566`; `web/electron/main.cjs:35-56`）

这份文档主要给三类读者：

- feature design：确认当前 UI 真正承载了哪些桌面工作台能力；
- issue analyze：定位项目栏 / 画布 / inspector / runtime effect 的状态 authority；
- 新接手协作者：快速找到项目级 state、active canvas 投影、节点卡和 Inspector 的代码入口。

## 2. 结构与交互

### 2.1 顶层工作台装配

`App.tsx` 仍是 renderer 装配入口，但项目级状态转换已拆给纯 helper：

- `projectCanvasState.ts` 负责 canvas tab 的 create / switch / rename / close 纯状态转换；
- `projectWorkspace.ts` 负责 project workspace 快照 clone / restore / active canvas resolve；
- `App.tsx` 负责把这些纯 transition 应用到 React state，并装配 Project Rail、Canvas/Table、Inspector 与 runtime effects。（`web/src/app/App.tsx:430-481, 1498-1566`; `web/src/app/projectCanvasState.ts:3-162`; `web/src/app/projectWorkspace.ts:188-330`）

当前项目模型是“项目级共享文件 + 多画布编辑态分离”：source files 属于项目，不随 canvas 复制；每个 canvas 独立保存 `nodes` / `edges` / `barriers` / `viewport` / selection。（`web/src/app/projectWorkspace.ts:188-207`; `web/src/domain/projectPackages.ts:118-143, 186-252`）

### 2.2 左侧 Project Rail / Files Rail

Project Rail 当前承载三层信息：

1. 项目列表；
2. active project 下的 canvas 列表（仅当 canvas 数量大于 1 时显示）；
3. 项目共享文件列表。（`web/src/app/ProjectRail.tsx:188-245`）

当前交互现状：

- 项目行保留三点菜单，只提供 `Import files into project` 与 `Remove from sidebar`；删除项目只移除 renderer / recent 列表，不删除磁盘工作区文件夹。（`web/src/app/ProjectRail.tsx:300-345`）
- 左侧栏折叠后，不是完全失去入口；`App.tsx` 会渲染一个固定在左侧的 hover preview trigger，hover / focus 时弹出半悬浮的 Project Rail 预览层。（`web/src/app/App.tsx:1382-1412`; `web/src/app/workbench.css:5341-5395`）
- 文件列表仍按 gas / solution 对分组，但不再显示单独的 gas / sol 文本 badge；分组名直接回到结构名，三点菜单收敛为 `Delete file and nodes`。（`web/src/app/fileDisplay.ts:234-316`; `web/src/app/ProjectRail.tsx:351-465`）
- 点击文件行时，如果当前 active canvas 里存在 `sourceFileId` 对应节点，UI 会优先切到该节点的 node selection / inspector，而不是停在 source-only 面板；如果当前 active canvas 没有对应节点，才回落到普通文件选择。（`web/src/app/App.tsx:1139-1156`; `web/src/app/fileDisplay.ts:209-232`）
- `Delete file and nodes` 当前会先删除文件，再级联移除 **当前 active canvas 投影态** 中 `sourceFileId` 匹配的 nodes / edges / barriers，并修复当前文件选择状态。（`web/src/app/App.tsx:1158-1183`; `web/src/app/fileDisplay.ts:184-206`）

> 这里特意写“当前 active canvas 投影态”，因为当前实现直接操作 `App.tsx` 中的投影态 `nodes / edges / barriers`，不是遍历全部已保存 canvas snapshot。这是当前实现边界，不应在文档里扩写成“全项目所有画布都会同时删”。

### 2.3 多 Canvas / Canvas-Table 工作区

多画布现在是第一层数据模型，不再只是 UI tab 装饰：

- 新建 canvas 时会基于项目名生成默认标签；
- canvas tab 支持 inline rename 和 close；
- active project 下的左侧 rail 也能直接切换 canvas；
- 保存格式使用 `schemaVersion: 2` 的 `canvases[] + activeCanvasId`。（`web/src/app/App.tsx:439-481, 1718-1765`; `web/src/app/projectCanvasState.ts:57-122`; `web/src/domain/projectPackages.ts:130-143, 186-252`; `web/src/app/workbench.css:6088-6136`）

Canvas / Table 切换不再是硬切，`workbench-view-track` 通过 opacity + translate 做横向滑动过渡。（`web/src/app/App.tsx:1504-1566`; `web/src/app/workbench.css:6138-6167`）

当前画布交互包括：

- Select / Pan 双工具；
- wheel 平移、Ctrl/Meta+wheel 或触控板 pinch 缩放；
- minimap、fit view、zoom controls；
- Delete / Escape / 方向键 / Undo / Redo；
- 节点拖拽、边连接、过渡态能垒拖拽创建、框选；
- Auto layout 轻量布局；
- edge path label 直接在画布上编辑。（`web/src/app/App.tsx:558-561, 1504-1566`; `web/src/app/CanvasWorkspace.tsx:752-835, 879-935`; `web/src/app/WorkbenchToolbar.tsx:19-158`）

关于标签与能垒的当前 contract：

- edge 默认标签 `path` 在画布上不显示；只有显式命名后才显示文字按钮，否则显示 `Add label` 入口。（`web/src/app/CanvasWorkspace.tsx:752-809`）
- barrier annotation 在画布上是数据驱动的只读按钮，默认值来自当前能量显示源（`ΔE‡` 或 `ΔG‡`）；真正的文本编辑入口在右侧 Barrier inspector，不再以画布内 inline editor 作为主路径。（`web/src/app/CanvasWorkspace.tsx:879-935`; `web/src/app/InspectorPanels.tsx:68-145`）

为了避免切换 view / canvas 后触控板滚动失效，wheel 订阅被拆到 `subscribeCanvasWheel()`，并在 `activeCanvasTabId` 或 `viewMode` 变化时重新绑定。（`web/src/app/appCanvasEffects.ts:8-31`; `web/src/app/App.tsx:558-561`）

### 2.4 Window chrome / toolbar / runtime status

当前桌面 chrome 已按桌面 app 语义回到“可拖动顶栏 + 保留交互控件 no-drag”：

- Electron 主窗口在 macOS 使用 `hiddenInset` title bar，并显式调用 `setWindowButtonVisibility(true)` 恢复 traffic lights；（`web/electron/main.cjs:35-56`）
- CSS 把 `window-bar`、`workspace-topbar`、`canvas-tab-bar` 设为 drag region，把按钮、输入框、Project Rail、Inspector、toolbar、dialog 等可交互区设为 no-drag；因此用户可以直接拖顶部移动窗口。（`web/src/app/workbench.css:3436-3447, 3924-3937, 5859-5875`）
- 右侧栏开关不是跟着侧栏一起移动，而是固定在窗口右上角的 `right-sidebar-fixed-toggle`；（`web/src/app/App.tsx:1371-1380`; `web/src/app/workbench.css:5330-5339`）
- Engine status pill 固定留在顶栏动作区：浏览器预览显示 `Browser preview`，Electron 则显示 local engine 探测结果。（`web/src/app/App.tsx:1447`; `web/src/app/desktopRuntime.ts:1-37`）

Floating toolbar 现在是紧凑胶囊样式：

- 能量源选择只有 `ΔEgas` / `ΔGsol`；
- 单位选择只有 `Eh` / `kcal` / `kJ`；
- 按钮间距、segmented 控件和 zoom readout 都做了压缩；
- toolbar 自身仍是当前画布命令条，不承载项目管理或 source inspector 操作。（`web/src/app/WorkbenchToolbar.tsx:19-158`; `web/src/app/workbench.css:6025-6087`）

### 2.5 节点卡与 Inspector

节点卡 `ReactionNodeCard` 已不再沿用旧 overview/debug 风格，而是当前这套紧凑卡片：

- 标题支持 inline rename；
- 右上角只有结构折叠按钮和三点菜单；
- 结构区默认显示 2D preview，hover / focus 时出现全屏按钮，点击后打开结构对话框；
- 底部 meta row 固定为“相对能量 + 状态灯 + 系数 + 种类 badge”；卡片上不再显示相对能量单位，也不再显示旧 `0` 角标；
- barrier handle 图标已经换成活化能“驼峰曲线”样式，而不是旧折线/箭头感图标。（`web/src/app/CanvasWorkspace.tsx:330-663, 670-723`）

右侧 Node inspector 已合并成统一 overview-style panel：

- `Node` summary 卡里展示 type、formula（带下标与分子量）、method、basis、charge/spin、solvent、energy、free energy、job CPU、elapsed、相对能量和 atom count；（`web/src/app/InspectorPanels.tsx:268-332, 413-486`）
- termination pill 现在只走 `normal / error / unknown` 这一层语义，依据 source text 末尾的正常结束或错误结束特征判断；（`web/src/app/InspectorPanels.tsx:277-280, 516-537`）
- structure 区不再把 2D / 3D 挤在 inspector 里，而是收敛成一个 `Open structure` 按钮，下面跟 optimization sparkline；（`web/src/app/InspectorPanels.tsx:335-357, 540-579`）
- node source brief 只保留 source 名称、kind/status、candidate review 入口和 `Open raw log`，不再把 stored path 直接堆在 node 面板里。（`web/src/app/InspectorPanels.tsx:620-665`）

结构对话框当前 contract：

- 打开后是单个 dialog；
- 左侧显示 2D structure，右侧显示 3D structure；
- 2D 侧可继续进入手动编辑或 reset manual structure；
- 对话框支持点击遮罩关闭与 `Escape` 关闭。（`web/src/app/InspectorPanels.tsx:872-997`）

当没有节点、只有文件被选中时，Inspector 会回落到 source summary，而不是旧 source tab / node tab 的分裂语义。（`web/src/app/InspectorPanels.tsx:222-266, 667-780`）

## 3. 数据与状态

当前 renderer 的关键数据结构如下：

- `ProjectWorkspaceSnapshot`：项目级 runtime authority，含共享文件、全部 canvas、当前 active canvas 投影和 UI 状态。（`web/src/app/projectWorkspace.ts:27-44`）
- `CanvasTabState` / `CanvasTabSnapshot`：canvas tab runtime 结构，负责切换前保存当前投影、切换后恢复目标投影。（`web/src/app/projectCanvasState.ts:3-122`）
- `RxnFlowProjectCanvas`：持久化层单个画布结构，包含图元、viewport 与 selection。（`web/src/domain/projectPackages.ts:118-128`）
- `RxnFlowProjectPackage`：当前持久化 envelope，`schemaVersion` 为 2，authority 是 `files + canvases[] + activeCanvasId + importLedger`；同时仍写出 active canvas 的 `nodes / edges / barriers / viewport` 作为兼容字段。（`web/src/domain/projectPackages.ts:130-143, 186-252`）
- `ImportLedger`：保存 candidate / parser provenance 的轻量来源账本；序列化时由项目共享 `files` 和 **全部 canvases 的 nodes** 派生，而不是只看当前 active canvas。（`web/src/domain/projectPackages.ts:97-116, 268-343`）

当前持久化 / 恢复状态流：

1. `projectWorkspaceSnapshot()` 保证 active canvas 投影写回 `canvases[]`；（`web/src/app/projectWorkspace.ts:276-312`）
2. `buildProjectPackage()` 把项目写成 schema v2 package；（`web/src/domain/projectPackages.ts:157-223`）
3. `parseProjectPackage()` 打开时把 legacy 单画布内容归一化为 `canvases[]`；（`web/src/domain/projectPackages.ts:225-257, 439-481`）
4. startup restore 通过一次性的 desktop IPC 获取项目内容，再恢复 renderer 并把 `projectId -> projectDirectory` 重新绑定回 runtime。（`web/src/app/appRuntimeEffects.ts:220-264`）

## 4. 关键决策

- **active canvas 投影转换留在纯 helper，不重新塞回容器组件**：见 `.codestable/compound/2026-06-19-decision-active-canvas-projection-helper.md`。这直接决定了当前 `projectCanvasState.ts` / `projectWorkspace.ts` 的存在方式，也约束后续 canvas 功能继续先扩 helper contract 再接 UI。
- **startup restore 视为 one-shot IPC**：见 `.codestable/compound/2026-06-19-learning-startup-restore-one-shot-ipc.md`。这就是为什么恢复逻辑放在稳定 effect 入口，并在恢复后主动回写 active project directory runtime binding。
- **原始 log/out/xyz 不是长期 authority，项目权威数据是结构化 project data**：见 `.codestable/compound/2026-06-06-decision-canonical-import-data.md`。当前桌面工作区虽然会复制 source 到 `sources/`，但保存/恢复权威仍是 `rxnflow-project` 结构、节点 provenance 和轻量 `importLedger`，而不是重新把 raw 文件当主数据模型。

## 5. 代码锚点

- `web/src/app/App.tsx:430-481` — canvas create / rename / close / switch 的 App-level 装配入口。
- `web/src/app/App.tsx:558-561` — canvas wheel 订阅随 active canvas / view 切换重绑。
- `web/src/app/App.tsx:1139-1183` — 文件点击优先选中关联节点，以及 `Delete file and nodes` 的当前实现。
- `web/src/app/App.tsx:1371-1412` — fixed right sidebar toggle 与 collapsed left rail hover preview。
- `web/src/app/App.tsx:1504-1566` — canvas/table 双 pane 渲染与切换动画入口。
- `web/src/app/ProjectRail.tsx:188-245` — active project canvas 列表和文件列表装配。
- `web/src/app/ProjectRail.tsx:300-465` — 项目三点菜单、文件三点菜单和文件行交互。
- `web/src/app/fileDisplay.ts:105-119, 234-316` — source file grouping、gas/solution 对展示名规则。
- `web/src/app/projectCanvasState.ts:35-122` — active canvas 投影切换、创建、重命名、关闭的纯状态 contract。
- `web/src/app/projectWorkspace.ts:27-44, 188-330` — project workspace snapshot shape、空项目、restore/apply 流程。
- `web/src/domain/projectPackages.ts:118-143, 186-343` — schema v2 持久化格式、legacy normalize 和 `importLedger` 派生。
- `web/src/app/CanvasWorkspace.tsx:330-723` — 节点卡、2D preview、全屏结构入口、barrier hump icon。
- `web/src/app/CanvasWorkspace.tsx:752-935` — path label 画布编辑与 barrier annotation 画布按钮。
- `web/src/app/InspectorPanels.tsx:68-145` — Barrier inspector 与 barrier label 编辑。
- `web/src/app/InspectorPanels.tsx:222-357, 620-780, 872-997` — unified node inspector、source summary/source brief、structure dialog。
- `web/src/app/WorkbenchToolbar.tsx:19-158` — 紧凑 toolbar 的命令和能量/单位切换。
- `web/src/app/appRuntimeEffects.ts:220-264` — startup restore 与 `setActiveProject` runtime 绑定。
- `web/src/app/desktopRuntime.ts:1-37` — browser preview / engine failure 的 runtime status payload。
- `web/electron/main.cjs:35-56` — Electron 主窗口 title bar 与 macOS traffic lights 恢复。
- `web/src/app/workbench.css:5330-5395, 6025-6167, 5859-5875` — fixed sidebar toggle、hover rail、紧凑 toolbar、view track 动画和 drag/no-drag chrome 规则。

## 6. 已知约束 / 边界情况

- 当前 workbench 仍是本地优先桌面 renderer；不恢复 local-http bridge、云同步、旧 Object Registry/correction surface 或完整 parser/registry workflow。（`web/src/app/App.tsx:1382-1566`; `/Users/linsay/Desktop/code/rxnflow/.codestable/architecture/ARCHITECTURE.md`）
- `Delete file and nodes` 的级联删除当前只覆盖 active canvas 投影态；如果未来要扩成“删文件即全项目所有画布同步清理”，那会是新的实现与验收动作，而不是当前现状。（`web/src/app/App.tsx:1158-1183`; `web/src/app/projectWorkspace.ts:27-44`）
- barrier 默认标签受当前 energy source 影响；因此 UI 切换 `ΔEgas` / `ΔGsol` 会同时影响 barrier 默认文案与相对能量表达。（`web/src/app/InspectorPanels.tsx:81-97`; `web/src/app/WorkbenchToolbar.tsx:58-87`）
- startup restore / recent project payload 仍按 one-shot IPC 设计，不能绑到会频繁重建的 effect/callback 上。（`web/src/app/appRuntimeEffects.ts:220-249`; `.codestable/attention.md`）
- 桌面 chrome 依赖 drag / no-drag CSS 边界；后续如果改 toolbar、tab bar 或 topbar，需要特别检查窗口拖拽是否仍成立。（`web/src/app/workbench.css:3436-3447, 5859-5875`）

## 7. 相关文档

- `/Users/linsay/Desktop/code/rxnflow/.codestable/architecture/ARCHITECTURE.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/architecture/core-platform.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/requirements/project-content-persistence.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/compound/2026-06-19-decision-active-canvas-projection-helper.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/compound/2026-06-19-learning-startup-restore-one-shot-ipc.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/compound/2026-06-06-decision-canonical-import-data.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/features/2026-06-18-multi-canvas-persistence/multi-canvas-persistence-design.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/features/2026-06-18-multi-canvas-persistence/multi-canvas-persistence-acceptance.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/issues/2026-06-19-workbench-ui-regressions/workbench-ui-regressions-fix-note.md`

## 变更日志

- 2026-06-23：按当前实现回写多画布 tab rename/close、collapsed rail hover preview、fixed right sidebar toggle、紧凑 toolbar、节点卡新 meta row、统一 node inspector / structure dialog，以及当前文件点击/删除语义。
