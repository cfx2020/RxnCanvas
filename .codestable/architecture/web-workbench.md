---
doc_type: architecture
slug: web-workbench
status: current
created: 2026-05-16
last_reviewed: 2026-06-17
implements: [desktop-canvas-rebuild]
tags: [web, react, vite, local-first, canvas, table-view, source-preview, report-export, desktop-renderer]
---

# Web Workbench

## 1. 当前能力

`web/` 当前是 RxnFlow 桌面客户端的 renderer 原型，而不是云 Web 或完整旧 Web Workbench。技术栈：

- React
- TypeScript
- Vite
- npm
- lucide-react icons
- Vitest + Testing Library
- Electron local engine lightweight source parser via `import.preview`
- Electron preload/main register IPC via `window.rxnflowDesktop.registerImportCandidates`, backed by lightweight stateless `import.register_selection` / `import.register_all`
- renderer-side lightweight source parser fallback in `web/src/domain/sourceParsers.ts`; it mirrors the engine preview contract with candidates, warnings, objectCount, parser provenance, coordinate summary fields and parsed coordinate atoms for viewer use.
- renderer-side candidate review flow is planned by `web/src/app/importRegistration.ts`, coordinated by `web/src/app/App.tsx`, and rendered by `web/src/app/InspectorPanels.tsx`; multi-candidate imports open a soft-glass dialog, Electron mode prefers local engine register, and browser/engine failure paths fall back to renderer-side node creation with parser/candidate provenance.
- renderer-side lightweight report export in `web/src/domain/reportExports.ts`, with save/status orchestration in `web/src/app/reportExportWorkflow.ts` and browser download primitives in `web/src/app/browserDownloads.ts`.
- renderer-side lightweight relative energy derivation in `web/src/app/energyDisplay.ts`; current active UI does not expose Object Registry or correction editing.
- renderer-side project state schema in `web/src/domain/projectPackages.ts`; it derives lightweight `importLedger` entries from files/nodes, preserves legacy node `corrections` fields when present, persists canvas `barriers`, Electron persists it into real workspace folders (`.rxnflow/project.json` metadata + root `sources/` / `exports/`), and legacy `.rxnflow.json` packages without `importLedger` or `barriers` are normalized on open.
- renderer-side project package open/save helper 和 browser/Electron runtime transition in `web/src/app/projectPackageWorkflow.ts`; it builds runtime-specific default filenames, serializes active project state, maps parsed package content into project/workspace snapshots plus validation payloads, and prepares restore transitions that replace duplicate project summaries while saving the current active workspace.

当前 UI 主链路：

1. App 首屏直接进入工作台，不做 landing page。
2. 左侧 Project Rail 展示本地项目/工作区、桌面端 `New Project Folder` 创建真实用户可见工作区文件夹、`Open Folder` 打开已有工作区文件夹、切换项目、通过 `Project actions` / `Import files into project` 或项目行 drop 把外部文件导入目标项目、通过 `Project actions` / `Delete project` 从 renderer 本地项目列表删除项目，以及本地文件列表；App 层用 renderer 内存快照隔离每个本地项目的 files、nodes、edges、barriers、viewport、selection 和 lightweight energy display options，避免只切换标题而复用上一项目画布。当前删除项目只移除 renderer 内存中的本地项目记录，不删除磁盘 project directory 或 source 文件。
3. 用户可选择本地文件；Electron 模式只把 64KB preview sample 放进 renderer/source panel，同时把 `sourcePath` 传给 local engine `import.preview`，由 Python engine 读取完整 log/out 解析；文件进入桌面工作区后通过 desktop autosave 复制到当前工作区根目录 `sources/`，项目状态更新为 project-relative `storedPath` + size/sha256，Source 面板显示当前 source 是项目副本、等待 autosave 复制还是浏览器 preview。浏览器模式使用 renderer fallback parser 和 preview sample，不能写入项目文件夹。当前 active parser 识别 Gaussian / ORCA（含常见 Cartesian coordinate、charge/spin 摘要）/ MAPLE / 普通 XYZ comment energy / ASE extxyz metadata（label、charge/spin、eV energy 转 Hartree）的摘要、formula、部分坐标摘要和多帧候选，返回 `parseScope` / `confidence` / warnings/provenance；Gaussian/ORCA 返回能量表字段（Egas、basis、Ggas、Ggas+1M，pairing 后补 Esol/Gsol），并把文件作为 parsed/staged source 放进目标工作台。单候选 source 自动生成一个节点；多候选 source 打开候选选择面板，支持登记选中候选或全部候选为节点。Project Rail 文件行支持单选、Meta/Ctrl 多选、Shift 范围选择、`application/x-rxnflow-raw-file` drag payload 和行内 remove；匹配的 gas/solution log 会合并为一个结构行并以成组 source payload 拖拽，未成对单文件保留原始文件名；这些文件行操作只作用于 source 列表，不隐式新增画布节点。Project Rail 文件行或外部 source 文件 drop 到 Canvas Stage 时，会把 drop client point 转成 graph-space 坐标，并在该位置创建 source node 或候选登记面板。外部 source 文件 drop 到项目行，或通过项目行 action 导入到非当前项目时，会先更新目标项目 snapshot 再切换到该项目显示导入结果。Electron 模式优先通过 preload 调用 local engine register commands，浏览器模式或 engine 失败时使用 renderer fallback；保存项目时会把当前 files/nodes 的 candidate/parser provenance 派生为 lightweight `importLedger`。
4. 中间 Canvas Stage 支持节点卡、节点结构预览折叠/展开、节点 More actions 菜单打开对应 Source details、节点 stoichiometric coefficient inline 编辑、节点卡相对能量显示和 zero point 选择、连线、节点手柄拖拽创建 edge、键盘激活节点手柄再用目标节点 Enter/Space 创建 edge、edge 选择检查、Inspector edge label 编辑、节点底部 barrier 手柄拖拽创建显式能垒标注、barrier inline label 编辑/选择/删除、节点拖拽、Select tool 空白画布框选、Pan tool 空白画布拖拽平移、普通 wheel 平移、pinch-style 或 Ctrl/Meta+wheel 缩放、可拖拽导航的 minimap 和 zoom controls；minimap 在拖动期间只显示 draft viewport window，pointer release 后提交主画布 viewport。节点/edge/barrier 支持 Shift 多选/反选，画布聚焦后支持 Delete/Backspace 删除当前选择、Escape 清空选择、方向键 20px 微调已选节点、Cmd/Ctrl+Z 和 Cmd+Shift+Z/Ctrl+Y 撤销/重做，输入框内不会触发图谱快捷键；悬浮工具条提供 Energy/Unit、Undo、Redo、Delete selection、Auto layout 和 Fit view。当前 lightweight 表格真实承载的 canvas energy modes 是 `Egas`/`Gsol`，Unit 支持 hartree/kcal/mol/kJ/mol，并直接驱动节点卡、barrier 默认标签、Auto layout 和 Table view 的相对能量显示。Auto layout 是 renderer-side lightweight 能量排序布局，不恢复旧 ShellClient `energy.compute` 后端命令。Fit view 会按当前节点 bounds 自适应，桌面优先完整展示图谱，窄屏优先让当前主画布内容进入视野。
5. 中间 Table View 展示当前节点的结构、类型、formula、gas/solution energy 和相对值。
6. 右侧 Inspector 支持 Node、Source 和 Export。Object Registry / Objects tab / correction 表单不属于当前 active UI；节点卡和 Node 详情提供 lightweight `Structure Preview` 2D skeletal depiction，Node 详情可用 Ketcher + Indigo WASM `Edit 2D` 手动画板保存/重置单节点 KET/Molfile/CDXML/SVG，并另提供 3Dmol.js `3D Structure` 真实坐标查看器。
7. Export dock 当前只显示原 UI 默认报告格式 PNG/CDXML/XLSX；renderer 生成 PNG 报表图、CDXML 节点/边/能量元数据、XLSX 能量表/文件表/元数据。
8. 顶部 window bar 显示 runtime 状态：浏览器预览为 `Browser preview`，Electron 模式通过 preload 调用 local engine status。
9. Electron 模式下，File 菜单可打开本地工作区文件夹，并可把当前工作区导出为 `.rxnflow.zip` 压缩包；旧 `.rxnflow.json` project package 仍可通过兼容路径读取但不是主入口。桌面 renderer 对 active project 做 debounce autosave：只有已有打开/创建的工作区文件夹时才写回该文件夹；没有工作区文件夹时返回 `project_folder_required` warning，不再静默写到 Electron `userData/projects/` 托管目录。工作区目录会保存隐藏 `.rxnflow/project.json`、`.rxnflow/manifest.json`、轻量 `importLedger`、根目录 `sources/` 下带 size/sha256 的 source 副本，以及根目录 `exports/manifest.json` 下带 artifact size/sha256 的 export artifact manifest。

## 2. 当前刻意不做

以下旧 Web 能力不在 active UI/code 中：

- ShellClient、fixture transport、HTTP transport、local-http bridge。
- IndexedDB Browser Project Repository、Project Content 自动保存/恢复、`.rxnflow.zip` 导入 helper；当前只保留工作区 zip 导出。
- 完整持久化 Import registry / full parser pipeline；轻量 Import preview 已提供 candidates/provenance/warnings，local engine 已有 stateless register commands，Electron renderer 已通过 preload 接入这些命令，renderer 仍保留浏览器/failure fallback，并已保存当前 UI 可表达的 lightweight `importLedger`。
- 旧 `energy.compute` Shell command、EnergyProfilePanel、完整 EnergyProfilePanel correction policy、Object Registry / Objects tab / correction 表单，以及完整 ObjectRegistryPanel service 绑定；当前 active UI 只保留 renderer-side 相对能量显示。
- Three.js 自研 Molecule3DViewer、atom measurement 和 2D/3D 原子联动；当前 active UI 使用 lightweight 2D `Structure Preview` / Ketcher + Indigo WASM `Edit 2D` 与 3Dmol.js `3D Structure` 坐标查看器。
- i18n runtime、dev/test fixture API、Playwright E2E harness。
- 旧 Python ReportExportService、report manifest、artifact index、CSV/SVG/PDF/PPTX/CDX 格式入口。
- 云端账号、同步、对象存储或 Vercel function command executor。

这些能力如果重新出现，必须先在 roadmap/feature design 中说明 UI 承载方式和桌面端边界。

## 3. 当前组件边界

当前主要实现集中在：

- `web/src/app/App.tsx`
- `web/src/app/CanvasWorkspace.tsx`
- `web/src/app/Molecule2DDepiction.tsx`
- `web/src/app/Molecule2DEditorDialog.tsx`
- `web/src/app/ProjectRail.tsx`
- `web/src/app/WorkbenchToolbar.tsx`
- `web/src/app/ReportPanels.tsx`
- `web/src/app/InspectorPanels.tsx`
- `web/src/app/Molecule3DmolViewer.tsx`
- `web/src/app/importRegistration.ts`
- `web/src/app/importRegistrationTypes.ts`
- `web/src/app/importSources.ts`
- `web/src/app/importLayout.ts`
- `web/src/app/importNodes.ts`
- `web/src/app/candidateReview.ts`
- `web/src/app/desktopImportRegistration.ts`
- `web/src/app/importWorkspace.ts`
- `web/src/app/projectWorkspace.ts`
- `web/src/app/appStateAppliers.ts`
- `web/src/app/appRuntimeEffects.ts`
- `web/src/app/appSelectionAppliers.ts`
- `web/src/app/appCanvasEffects.ts`
- `web/src/app/appReportExport.ts`
- `web/src/app/appProjectActions.ts`
- `web/src/app/appImportActions.ts`
- `web/src/app/appCanvasKeyboardActions.ts`
- `web/src/app/projectPackageWorkflow.ts`
- `web/src/app/desktopRuntime.ts`
- `web/src/app/reportExportWorkflow.ts`
- `web/src/app/browserDownloads.ts`
- `web/src/app/canvasEditState.ts`
- `web/src/app/canvasSelectionState.ts`
- `web/src/app/canvasMutationState.ts`
- `web/src/app/canvasKeyboardState.ts`
- `web/src/app/canvasDragState.ts`
- `web/src/app/canvasLinkState.ts`
- `web/src/app/canvasEditHistory.ts`
- `web/src/app/canvasGeometry.ts`
- `web/src/app/canvasDrawing.ts`
- `web/src/app/canvasHitTesting.ts`
- `web/src/app/energyDisplay.ts`
- `web/src/app/fileDisplay.ts`
- `web/src/app/workbench.css`
- `web/src/app/App.test.tsx`
- `web/src/app/CanvasWorkspace.test.tsx`
- `web/src/app/InspectorPanels.test.tsx`
- `web/src/app/Molecule2DDepiction.test.tsx`
- `web/src/app/importRegistration.test.ts`
- `web/src/app/projectWorkspace.test.ts`
- `web/src/app/projectPackageWorkflow.test.ts`
- `web/src/app/reportExportWorkflow.test.ts`
- `web/src/app/browserDownloads.test.ts`
- `web/src/app/canvasEditState.test.ts`
- `web/src/app/canvasEditHistory.test.ts`
- `web/src/app/canvasGeometry.test.ts`
- `web/src/app/canvasDrawing.test.ts`
- `web/src/app/canvasHitTesting.test.ts`
- `web/src/app/energyDisplay.test.ts`
- `web/src/app/fileDisplay.test.ts`
- `web/src/domain/sourceParsers.ts`
- `web/src/domain/sourceParsers.test.ts`
- `web/src/domain/reportExports.ts`
- `web/src/domain/reportExports.test.ts`
- `web/src/domain/projectPackages.ts`
- `web/src/domain/projectPackages.test.ts`

当前组件边界：

- `App.tsx`
  - 持有当前 renderer workspace state 和组件装配入口。App 通过 props 编排画布、Project Rail、Toolbar、Report panel 和 Inspector panel，不再直接承载这些区域的主要 JSX，也不再直接承载 workspace seed/deep-clone/restore snapshot、report artifact save/status、浏览器 download 纯逻辑、大段 transition-to-React-setter 赋值、source/canvas selection setter 编排、canvas DOM listener lifecycle、project create/switch/delete 计算、import/candidate review 编排、canvas keyboard shortcut 分发或 Electron/browser runtime effect 细节。
- `CanvasWorkspace.tsx` / `Molecule2DDepiction.tsx` / `appCanvasEffects.ts`
  - 中央画布渲染层；承载 `CanvasSurface`、`ReactionNodeCard`、节点卡 lightweight 2D skeletal structure preview（自动推断或单节点 manual KET/Molfile/CDXML/SVG）、edge/connection/barrier SVG、barrier inline label editor、`MiniMap`、`ZoomControls`、rubber-band/drop helper 和 App 仍需使用的画布 selection/size 类型 helper。画布状态机仍由 App 持有，CanvasWorkspace 只负责渲染和局部控件状态；`appCanvasEffects.ts` 承载 canvas wheel listener 和 connection draft window pointer listener 生命周期，避免 App 直接内联 DOM listener 细节。
- `ProjectRail.tsx`
  - 左侧本地项目/source file 列表；内部持有 `New Project Folder` 表单 UI 状态，`Open Folder` 调用 App 层 project package open，项目行 actions/drop 和 source 文件行选择/拖拽/remove 通过 props 回到 App。
- `WorkbenchToolbar.tsx`
  - 顶部悬浮画布命令条；负责 Import/Save、Energy/Unit、view/tool、Undo/Redo/Delete/Auto layout/Fit view/Export 控件。`workbench.css` 在窄屏下让工具条换行并隐藏分隔线，避免 Unit select 或命令按钮被裁切。
- `ReportPanels.tsx`
  - Export dock 和 Energy table view；Export 只暴露 PNG/CDXML/XLSX。
- `reportExportWorkflow.ts` / `browserDownloads.ts` / `appReportExport.ts`
  - Report export app workflow helper；负责把 active export options + project context 转为 PNG/CDXML/XLSX artifacts、串行保存、过滤取消项、生成用户可见导出状态，并隔离 Electron `saveReportArtifact` payload 编码与浏览器 download 细节。`appReportExport.ts` 承载 export busy/status/artifacts 的高层 runtime 编排；ReportPanels 只渲染 export UI，App 只把当前 state 传入 helper。
- `InspectorPanels.tsx` / `Molecule2DEditorDialog.tsx` / `Molecule3DmolViewer.tsx`
  - 右侧 Inspector 的 Node/Source/Export tab、SourceInspector、edge/barrier inspector、候选登记 sheet、lightweight 2D `Structure Preview`、Ketcher + Indigo WASM 2D editor dialog、3Dmol.js `3D Structure` 弹窗，以及 source display helpers。App 只导入 `sourceFileForNode` / `sourceCoordinatePreview` 参与弹窗编排。
- `importRegistration.ts` / `importRegistrationTypes.ts`
  - import/register 模块 barrel 与共享类型入口；App 和测试仍从 `importRegistration.ts` 取稳定公开表面，具体实现按职责拆到下列小模块。
- `importSources.ts` / `importLayout.ts` / `importNodes.ts`
  - source file 转换与 source id 查找、导入落点/节点 id/节点坐标计算、renderer fallback/desktop registered object 到 graph node 的映射。
- `candidateReview.ts` / `desktopImportRegistration.ts` / `importWorkspace.ts` / `appImportActions.ts`
  - multi-candidate review entry/default selection/review state/selection toggle、source candidate review selection transition、可注入 desktop `registerImportCandidates` bridge payload、selected/all/auto register fallback、当前项目 import apply transition、pending import project transition、import picker runtime transition、raw file drop import transition、desktop file dialog result transition、候选登记 apply transition、非当前项目 import plan 到 workspace snapshot 的合成、候选登记节点追加后的 workspace snapshot 合成。`appImportActions.ts` 承载 App-level 当前项目/跨项目 source staging、candidate review 打开/选择/登记、browser file import、desktop file import、raw file drop 和 import picker 分发；App 只负责传入 refs、当前 snapshot 和 state appliers。
- `projectWorkspace.ts` / `appStateAppliers.ts` / `appSelectionAppliers.ts` / `appProjectActions.ts`
  - Project/workspace 纯 state helper；负责 demo seed、empty workspace、initial workspace map、canvas edit snapshot/restore、project workspace snapshot/restore/apply transition、本地项目 summary/fallback 生成、创建/切换/保存当前并激活目标/删除项目 workspace transition、workspace deep clone 和 project package restore snapshot。`appStateAppliers.ts` 承载 App 层 transition/snapshot 到 React setters 的机械赋值，包括 canvas selection、project workspace restore、project transition apply、imported workspace snapshot apply 和 canvas edit snapshot restore；`appSelectionAppliers.ts` 承载 source file selection/delete、node source details、node/edge/barrier selection transition 和 canvas collection mutation transition 到 React setters 的机械赋值；`appProjectActions.ts` 承载 create/switch/delete project 的 App-level action 合成，统一返回可应用 transition 或 inactive delete action。
- `projectPackageWorkflow.ts` / `desktopRuntime.ts` / `appRuntimeEffects.ts`
  - Project package app workflow helper；负责 `.rxnflow` / `.rxnflow.json` 默认文件名、当前项目包序列化、打开内容解析、invalid package validation payload、package-to-workspace snapshot 映射、browser/Electron runtime transition，以及打开项目时的 restore transition 合成（保存当前 workspace、替换重复项目摘要、激活恢复项目）。`desktopRuntime.ts` 负责 renderer 可见 engine status 类型和 browser preview / engine failure status payload。`appRuntimeEffects.ts` 承载 renderer 对 `window.rxnflowDesktop` 的 typed API surface、project open/save browser/Electron runtime effect、native menu subscription 和 engine status probe；App 只负责把 React ref/state/context 传入这些 effect helper。
- `canvasEditState.ts` / `canvasEditHistory.ts` / `appCanvasKeyboardActions.ts`
  - Canvas edit 纯状态 helper 与兼容导出口；当前直接负责清空/恢复 canvas interaction transition、删除 selection 并清空交互 transition、删除节点时级联移除相关 edge/barrier，以及 bounded undo/redo history 栈转移。`canvasSelectionState.ts` 拆出 selection id toggle/replace、node/edge/barrier exclusive selection 构造、node/edge/barrier 选择 transition 和 selection 查询 helper；`canvasMutationState.ts` 从大状态机中拆出 edge/barrier label 和 node coefficient 更新 transition，并把 inspector apply 字段一并返回；`canvasKeyboardState.ts` 拆出 keyboard shortcut action / preventDefault transition 和 editable target 判定；`appCanvasKeyboardActions.ts` 承载 React keyboard event 到 undo/redo/delete/clear/nudge handlers 的分发；`canvasDragState.ts` 拆出 canvas/node pointer-down 起始 drag state 与 selection 派生 transition、pointer move / draft move 动作分类 transition、node drag / rubber-band / pan pointer-end 收尾 transition、已选节点 nudge transition、node drag 位置落点/是否移动判断、rubber-band 选区节点集合和 pointer draft current 更新；`canvasLinkState.ts` 拆出 connection/barrier draft 起始和完成 transition、键盘连线 source/edge transition、connection/barrier draft target 归一化、追加 edge/barrier 记录和 edge/barrier 创建 transition。App 仍持有 React state 和 pointer event 生命周期，但不再把这些选择集合/history 栈变换散落在 JSX 容器里。
- `canvasGeometry.ts` / `canvasDrawing.ts` / `canvasHitTesting.ts`
  - 画布几何、client/world 坐标换算、wheel/pan viewport 更新、selection、minimap、edge/barrier path 和 DOM hit-testing 等计算/适配；CanvasWorkspace/App 复用这些 helper，测试锁定坐标、viewport 手势、SVG path 和节点命中行为。
- `energyDisplay.ts` / `fileDisplay.ts`
  - 能量显示/relative table/table-node selection/coefficient/zero-point selection transition helper 与 source file 分组、文件选择/selection/delete transition（含 source inspector/keyboard edge cleanup apply 字段）、节点 source details selection（含 source inspector/keyboard edge cleanup apply 字段）、drag payload、路径/格式显示 helper；UI 组件通过这些模块拿稳定显示契约，避免把领域显示逻辑写进 JSX。

当前 renderer 已把报告格式细节拆到 `reportExports.ts`，导出保存/status 编排拆到 `reportExportWorkflow.ts`，项目包 envelope / normalize 逻辑拆到 `projectPackages.ts`，renderer open/save 纯编排拆到 `projectPackageWorkflow.ts`。当前约束是不要把这些职责重新塞回单个大容器组件。

## 4. 桌面端考虑

当前 Web renderer 避免依赖浏览器专属长期存储或云后端；当前桌面端共享约束如下：

- `web/electron/main.cjs` 已提供最小 Electron BrowserWindow、macOS/Windows 菜单和文件选择 IPC。
- `web/electron/preload.cjs` 暴露受限 `window.rxnflowDesktop` API；renderer 不启用 Node integration。
- `web/electron/engine-bridge.cjs` 已提供 local engine bridge：开发态优先 spawn `python3 -m rxnflow.engine_ipc`，执行 `engine.status` / `import.preview` / `import.register_selection` / `import.register_all` / 轻量 `project.validate/open/save` 并返回结构化结果；如果 Python engine unavailable / timeout / bad response，会降级到 packaged `web/electron/embedded-engine.cjs`，继续提供同一组当前 UI 承载的轻量命令；`preload.cjs` 暴露 `registerImportCandidates` 给 renderer 的 candidate review flow。
- 浏览器模式继续使用 file input 和 renderer fallback parser；Electron 模式使用原生 open dialog 读取 source preview sample 和 `sourcePath`，并优先使用 local engine `import.preview` 的 full-file 解析结果。
- 轻量 source parser 当前同时存在于 local engine、embedded engine 和 renderer fallback 中；Electron/Python 路径使用 full-file parse，浏览器 fallback 仍是 preview/sample parse。它已经返回 `parserId`、`parserVersion`、`parseScope`、`confidence`、`objectCount`、`warnings`、`candidates`、`coordinatePreview` 和 `energyTable`。local engine 已提供 lightweight stateless register commands；Electron renderer 优先使用这些命令完成 selected/all register，浏览器和 engine failure path 使用 renderer fallback。`projectPackages.ts` 保存时从 files/nodes 派生 lightweight `importLedger`，打开旧轻量 package 时会回填 ledger。完整 cclib/ASE parser、虚拟滚动完整 log viewer 和旧持久化 registry workflow不属于当前 renderer contract。
- 浏览器模式继续使用 download；Electron 模式使用原生 save dialog 保存 PNG/CDXML/XLSX report artifact。
- Electron 模式提供 `createProjectFolder` / `openProjectPackage` / `saveProjectPackage` / `autosaveProjectPackage` IPC。Project Rail 的 `New Project Folder` 会让用户选择父目录并创建真实工作区文件夹，`Open Folder` 和 native menu 都调用同一个 open path；浏览器开发预览下该按钮仍通过 hidden file input 读取 `.rxnflow.json` package 做 UI 验证。desktop autosave 不弹保存对话框，会按 active project id 写入已打开/创建的工作区文件夹；如果没有工作区文件夹则返回 `project_folder_required` warning，不再写 Electron `userData/projects/` 托管主项目。导入 source 后，autosave 会把 `sourcePath` 指向的原始文件复制到工作区根目录 `sources/` 并返回去掉 session-only `sourcePath` 的 saved content，renderer 用返回内容刷新 `storedPath` / checksum。顶部 toolbar 的 `Export project` 和 File 菜单的 `Export RxnFlow Project Zip` 用 `saveProjectPackage` 把整个工作区导出为 `.rxnflow.zip` 压缩包。工作区写入带 lightweight `importLedger` 和 canvas `barriers` 的 `.rxnflow/project.json`、`.rxnflow/manifest.json`、`sources/` source 副本和 `exports/manifest.json`；打开时读取工作区文件夹，也兼容旧 `.rxnflow.json` package。打开/创建/自动保存成功的工作区路径会记录到 `File > Open Recent`，recent store 位于 Electron `userData` 下的 JSON 文件。Python engine 和 embedded fallback 都能校验/读写同一个 lightweight `rxnflow-project` envelope，并在打开工作区时检查 file/node/edge/barrier/importLedger 基础引用、node 能量单位/数值/position/coefficient 形状，以及 source/export 文件缺失、size 不一致和 sha256 不一致。renderer 会把返回的 validation issues 显示为 canvas 内 `Project warnings` / `Project needs repair` 软玻璃悬浮提示。当前目录格式仍是轻量 project store，不包含旧 ProjectContent 深校验、migration、content index 或完整 artifact cleanup/repair 语义。
- `electron-builder` 已配置 macOS `dmg/zip` 与 Windows x64 `nsis/portable` target；`desktop:icons` 会从 `web/build/icon.svg` 生成 PNG/ICNS/ICO 资产，builder 已接入 mac/win icon 配置；macOS builder 已启用 hardened runtime，并使用 `web/build/entitlements.mac.plist`。`desktop:release:smoke` 会验证 builder 配置、图标资产、embedded engine fallback、Windows installer smoke wiring、runtime smoke wiring、发布 CI workflow、当前平台 unpacked app 结构，以及存在时的 Windows artifacts。`desktop:runtime:smoke` 会启动当前平台 packaged unpacked app，等待 renderer 工作台渲染，并通过 preload 验证 engine status 与 candidate registration 后退出。当前 macOS/arm64 环境已通过 unsigned local `desktop:pack` 刷新带 `icon.icns` 的 mac-arm64 unpacked app，并已通过 `desktop:pack:win` 刷新 Windows x64 `win-unpacked/RxnFlow.exe`；仓库中仍保留此前 `desktop:dist:win` 生成并通过结构验证的 NSIS setup 和 portable artifacts，但“最新 renderer 对应的 Windows installer/portable 已运行验证”目前只以 Windows CI 或 Windows 机器重产证据为准。
- `.github/workflows/desktop-release.yml` 是当前发布验证入口：PR/push 跑 core/web/Electron smoke、macOS packaged runtime smoke 和 Windows packaged runtime smoke；手动勾选 `notarize_macos` 且配置 Apple Developer ID secrets 后，才执行签名 macOS artifacts、`desktop:notarize:mac`、staple 和 `spctl`。
- 当前 packaged runtime smoke 证明 Electron process、renderer workbench、lightweight importLedger persistence 和 embedded lightweight desktop engine commands 可用。它不证明完整 cclib/ASE parser、旧持久化 registry 或旧 ProjectContent engine 已恢复。
- 当前不要求用户手动启动 Python、本地 bridge 或命令行服务；Electron smoke 会自动探测 local engine。
- macOS/Windows 差异应放在 Electron shell 和 packaging 层，renderer 保持平台无关。

## 5. QA

当前验证命令：

```bash
cd web && npm run test
cd web && npm run build
cd web && npm run desktop:smoke
```

UI 改动还需要真实浏览器验证桌面与窄屏：

- 桌面：canvas/table/source/export 均可打开；Project Rail 的 `New Project Folder` / `Open Folder` 可见，浏览器预览能恢复 `.rxnflow.json` package；Project Rail 项目行的 `Project actions` 可打开 `Import files into project` 和 `Delete project`，项目行可接收外部 source 文件 drop 到该项目，删除需经确认后才移除当前 renderer 本地项目列表项；Project Rail source 文件行可单选、多选、范围选择、拖拽 raw-file payload、成对 gas/solution log 结构行拖拽成组 payload、drop 到画布指定位置创建 source node 或候选登记面板，并可从列表移除；外部 source 文件也可 drop 到画布指定位置导入；Select tool 可框选节点且不移动 viewport，Pan tool 可空白拖拽平移画布；节点/edge/barrier 选择后 Delete selection 或 Delete/Backspace 可移除当前选择，Shift 可多选/反选，Escape 可清空选择，方向键可微调已选节点，节点 coefficient、节点相对能量 zero point、Inspector edge label 和 barrier inline label 可编辑，Undo/Redo 可恢复画布编辑；Energy/Unit 会直接更新节点卡和 Table view，相对能量 zero point 可从节点卡设置；Auto layout 会重排节点，Fit view 会把当前节点 bounds 放入视图；节点卡和 Inspector `Structure Preview` 对有坐标 source 显示 2D skeletal SVG、无自动补出的隐式氢文本，Node Inspector `Edit 2D` 可打开 Ketcher editor 并保存/重置 manual KET/Molfile/CDXML/SVG，`3D Structure` 弹窗可打开；Export 只显示 PNG/CDXML/XLSX；runtime status 可见；无 local-http / Python bridge / ShellClient / cloud / sync / Search flows / Settings / Preferences / More canvas actions / Add Node / Compute / Profile / Objects / Object Registry / Apply correction 文案，无横向溢出，默认视图不让节点被 inspector 遮挡。
- 窄屏：toolbar 可见且可换行，Energy/Unit select 不被裁切，无横向溢出，默认视图让当前主节点进入 canvas 可见区域。
- 可访问性：工具条、minimap、zoom controls、画布、节点、节点 coefficient 控件、节点连接手柄、节点 barrier 手柄和 barrier label 控件有可访问名称；画布可聚焦并支持原 UI 图谱快捷键，节点连接手柄支持键盘创建 edge；CSS 保持 `letter-spacing: 0` 并提供 `prefers-reduced-motion` 降级。
