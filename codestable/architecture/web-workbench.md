---
doc_type: architecture
slug: web-workbench
status: current
created: 2026-05-16
last_reviewed: 2026-05-22
implements: [web-workbench-shell, project-content-persistence]
tags: [web, workbench, shell-client, react, vite, local-first, indexeddb, browser-storage, project-bundle, zip, i18n, import-inbox, raw-inputs, object-registry, graph-canvas, graph-editor-interaction-state, graph-object-drop, graph-node-layout, graph-edge-path-editing, graph-viewport-controls, graph-editor-workspace-persistence, node-composition, energy-semantics, energy-profile, energy-curve-interaction, report-export, export-readiness, export-artifact-persistence, local-http-shell-bridge, http-api-transport, e2e, bridge-qa]
---

# Web Workbench

## 1. 当前能力

RxnFlow 当前已有独立 `web/` 前端工程，用于承载 Web Workbench MVP 的第一屏 app shell。该工程使用 React + TypeScript + Vite + npm，提供 `dev`、`build`、`test`、`test:e2e` 和 `test:e2e:local-http` scripts。

当前 Web Workbench 已落地浏览器端壳层、只读工作台状态投影、真实浏览器本地项目仓储、第一版项目侧边栏、Web i18n 基础、Import Inbox UI、Browser Raw Input Store、Browser Bundle Archive Adapter、Object Registry Panel、Graph Canvas MVP、Graph Editor Interaction State、Graph Object Drop、Graph Node Layout、Graph Edge/Path Editing、Graph Canvas Viewport Controls、Graph Editor Workspace Persistence、Node Composition Editor、Energy Semantics Controls、Energy Profile Panel、Interactive Energy Curve 和 Report Export Panel：

1. 浏览器入口 `web/index.html` 挂载 React app。
2. `App` 通过 `createConfiguredShellRuntime(import.meta.env)` 创建前端 `ShellClient`，默认接入 `in-process-test` fixture transport；当 `VITE_RXNFLOW_SHELL_TRANSPORT=local-http` 时接入 `http-api` transport，并调用 `VITE_RXNFLOW_SHELL_ENDPOINT` 指向的本地 HTTP shell bridge。
3. `WorkbenchShell` 渲染三栏工作台结构：左侧 Project Sidebar，中间 graph workspace 区域，右侧 command/profile inspector。
4. 用户点击 `Fixture Run` 后，fixture transport 先返回 fixture session，再通过 `workbench.snapshot` 返回 Workbench Snapshot；前端用 projector 投影为 `WorkbenchDomainState` 并更新 project/session/graph/profile/object/artifact summary。
5. 未知 command 返回 `invalid_input`，UI 显示 error code 和 message。
6. 顶栏显示 `Local-only` 状态；当前不承诺云同步。
7. `WorkbenchUiState` 与 `WorkbenchDomainState` 分离，panel、pending command、active object、hover、dragging、pending edge、path draft 和 toolbar state 等 UI-only 状态不进入 ShellResponse；Graph Canvas 的 node/edge/path selection 已通过 Workspace Selection 投影进入 `WorkbenchDomainState.workspace.selection`。
8. `web/src/repository/` 提供 Browser Project Repository 契约、IndexedDB-first implementation、内存测试替身、path/checksum helpers 和结构化错误。
9. `createBrowserProjectRepository()` 在真实浏览器 IndexedDB 可用时返回 `IndexedDbBrowserProjectRepository`；IndexedDB 不可用时抛出 `storage_unavailable`，不静默退化成内存持久化。
10. Project Sidebar 从 Browser Project Repository 派生 UI state，可列出 browser-local projects，新建 project，打开已有 project，保存 / 覆盖 `.rxnflow/manifest.json` 与 `.rxnflow/state/*.json` 真实 Project Content files，并显示 local-only、backend、persistence、validation、bridge、checksum 和 repository error。
11. Project Bundle import/export 入口在侧边栏中可见但 disabled / unavailable；当前不触发 file picker、download、object URL 或 repository import/export write。
12. 打开 browser project 只更新 ProjectSidebarState，不自动创建 Python `PlatformSession`。只有用户显式点击 Open Bridge / Save Bridge Session 时，WorkbenchShell 才调用 `project.open(content_files)` / `project.save_content(include_content_files=true)` 并用 Workbench Snapshot 更新 WorkbenchDomainState。
13. `web/src/app/i18n/` 提供轻量 Web i18n runtime，当前支持 `zh-CN` 和 `en-US` message catalogs、typed message keys、`I18nProvider` / `useI18n`、本地浏览器 locale preference 和顶栏 locale switcher。
14. 中间工作区新增 `ImportInbox`，接收浏览器选择文件的 metadata 和可选 `File` 引用，展示 `import.preview` batch/items、parser metadata、raw resource、warnings/errors，并通过 `import.register_all` response 展示 registered object ids 和更新 WorkbenchDomainState 的 imports/objects/counts。
15. 当前 Import Inbox 在 fixture runtime 下继续传 `source_paths`；在 local-http runtime 下对小浏览器文件优先生成 `sources[].kind=inline_bytes`，通过本地 bridge 调用真实 Python `import.preview`。session 没有 core `project_path` 时，Platform Shell 使用 Temporary Preview Project；它不把 browser-local project ref 当成 core project path。
16. 当前 Import Inbox 在 active browser project 存在且 preview payload 校验通过时，会把 selected browser `File` 写入 Browser Project Repository 的 `inputs/raw/{sha12}-{safeName}`，并把对应 `raw_file` resource merge 进 `.rxnflow/manifest.json`；selected file list 显示 persisted/skipped/error 的 Raw Persistence Summary。
17. 当前 Browser Raw Input Store 使用 SHA-256 生成 `raw-{sha12}` id 和 `inputs/raw/{sha12}-{safeName}` path，metadata 记录 source name、byte size、mime type 和 last modified；同 checksum manifest resource 不重复追加，raw object 可覆盖同 path bytes。
18. 当前 Import Inbox 不实现大文件 chunking、OPFS payload store、Worker pool、browser_storage adapter、云上传或前端化学解析；超出 inline limit 的文件在前端显示 `payload_too_large`，不读取 bytes、不写 `inputs/raw/...`、不发 shell command。
19. 当前 Web 已新增 Browser Bundle Archive Adapter，使用 `fflate` 作为隔离的 zip dependency boundary。helper 能从 project-relative entries 生成 `.rxnflow.zip` bytes，或读取 zip bytes 并返回 safe project-relative entries 与 shallow summary；它复刻核心 Project Bundle 的 single-root、manifest required、allowed roots、`inputs/raw`、duplicate、`__MACOSX` 和 symlink safety 语义。
20. Browser Bundle Archive Adapter 当前不接 Project Sidebar UI，不读写 Browser Project Repository，不调用 ShellClient / local-http bridge / Python `ProjectBundleService`，也不执行 Project Content deep validation。后续 Project Sidebar export/import feature 需要通过该 helper 处理 zip bytes。
16. 右侧 inspector 顶部新增 `ObjectRegistryPanel`，展示 `WorkbenchDomainState.objects` 中的已登记对象列表、active object detail、source、formula、charge/spin、method、energy keys、thermochemistry keys、provenance、warnings、correction count/list 和 Correction Entry Form。
17. `WorkbenchShell` 维护 `activeObjectId` UI-only state；objects 更新后保留仍存在的 active object，否则自动选择第一个对象，selection 不进入 ShellResponse、Project Content 或 core workspace。
18. Correction Entry Form 对 active object 提交 `registry.apply_correction`，支持 manual/solvation/resonance、value/unit/reference/id/note 输入；成功后 `WorkbenchShell` 只用 ShellResponse object summary 替换 `WorkbenchDomainState.objects` 中的对象，失败时显示 ShellError code/message/target，不本地 append correction。
19. 中间工作区新增 `GraphCanvas`，从 `WorkbenchDomainState.workspace.graph` 渲染节点、边、路径、active path 和 Network Preview，并显示 disconnected node diagnostics。
20. Graph Canvas 通过 `ShellClient` 调用 fixture `workspace.open`、`workspace.add_node`、`workspace.set_node_composition`、`workspace.move_node`、`workspace.remove`、`workspace.select`、`workspace.set_viewport`、`workspace.connect`、`workspace.set_path`；成功后只使用 ShellResponse 返回的 workspace projection 更新 `WorkbenchDomainState`。
20. Graph Canvas 支持 click-driven 添加已登记对象节点、从 Object Registry 拖入已登记对象创建节点、拖动已有 graph node 重新布局、选择源节点后连接目标节点、选择 edge 后删除、选择 node 后删除、选择 path 后调整 Path Order Draft 并应用到 existing path；node/edge/path selection 会提交 `workspace.select` 并从 `WorkspaceSummary.selection` 恢复，pending edge、path draft、transient node dragging 和 transient canvas dragging 仍由 UI-only state 承载。
21. Graph Object Drop 使用 `application/x-rxnflow-graph-object` payload，只接受 `kind=registered-object` 且 object id 存在于 `WorkbenchDomainState.objects` 的拖拽；drop 位置映射为 `workspace.add_node(position)`，可见节点仍来自 ShellResponse workspace projection。
22. Graph Node Layout 使用固定虚拟画布 `600 x 360` 和 `20` grid；已有节点 pointer drag release 后发送 fixture/local-http `workspace.move_node(node_id, position)`，成功后只用 ShellResponse workspace projection 更新可见 node position；拖动中只显示 transient style。
23. Graph Edge/Path Editing 第一版使用真实 HTML edge button 作为可访问/可测点击目标，SVG 只负责视觉线条；Delete Selected 只对 node/edge selection 可用，发送 `workspace.remove` 后以 ShellResponse cascade 更新画布和 Network Preview。
24. Path Order Draft 只在选中 path 时初始化于当前 `path.node_ids`，上移/下移仅改 UI draft；点击 Apply Path Order 后才发送 `workspace.set_path(path_id, node_ids)`，成功后 active path 与 path list 来自 ShellResponse workspace projection。
25. Graph Canvas Viewport Controls 第一版提供 Pan、Zoom In、Zoom Out、Fit 和 Reset；`workspace.viewport` 由 ShellResponse projection 提供，Web 只生成 viewport intent 并发送 `workspace.set_viewport`。`graphViewport.ts` 统一处理 `600 x 360` 虚拟画布下的 viewport fallback、zoom clamp、screen/graph 坐标换算、CSS transform、zoom、pan、fit 和 reset；object drop、node drag 和 pan drag 共用该换算。
26. Graph Editor Workspace Persistence 复用现有 Project Content `reaction-graphs-v1` 和 `workspaces-v1`：node positions 保存在 `ReactionGraph.nodes[].position`，viewport、selection 和 active path 保存在 `WorkspaceSnapshot`。选择 node/edge/path 后 Web 发送 `workspace.select`；Project Sidebar 显式 Save Bridge Session 返回的 content files 会包含当前 graph/workspace 状态，Open Bridge / restored snapshot 后 GraphCanvas 恢复 node position、viewport、selected node/edge/path 和 active path。
27. Node Composition Editor 挂在 Graph Canvas 的 Network Preview 侧区；选中 graph node 后从 ShellResponse `GraphNodeSummary.composition` 初始化 Composition Draft，支持 object、coefficient、role、label rows 和 add/remove/reset/apply。Apply 成功后调用 `workspace.set_node_composition` 并只用返回的 workspace projection 重建 draft。
28. Graph Canvas 当前不实现自动布局、碰撞避让、缩放/平移自动持久化、拖动实时写盘、undo/redo、多选框选、键盘 nudging、path delete、自由绘线、edge label 编辑、minimap、wheel/pinch 或项目自动保存。
29. 右侧 inspector 新增 `EnergyProfilePanel`，基于 workspace active path 或用户选择 path 调用 fixture `energy.compute`，展示 profile summary、relative energy table、missing reason、warnings、Energy Expression Details 和交互式 SVG energy curve。
30. `EnergyProfilePanel` 支持 `output_unit`、`energy_key`、`energy_source`、`baseline_node_id` 和 correction policy UI options；Energy Channel Selector 从 `objects[].energy_channels` 汇总 key/source/unit 候选，同时保留自定义 key fallback。Correction Policy Controls 把 none/all/kinds/ids 映射为 `include_corrections` 和 `correction_policy` shell args。这些 options 只在点击 Compute 时映射为 Shell command args，不写入 Project Content 或 Browser Project Repository。
29. `energy.compute` 成功后 `WorkbenchShell` 只更新 `WorkbenchDomainState.profile`、`active.profileId` 和 `counts.profiles`；失败时显示 ShellError code/message/target，不直接 mutate graph/object/import state。
30. Energy curve preview 从 `EnergyProfile.points[]` 派生 Web UI-only `EnergyCurvePointState` / point status，显示有效、missing、correction 和 selected marker；hover/focus/click 会更新 Curve Point Detail，展示 label、node id、relative energy 或 missing reason、expression total、composition term count、correction count 和 missing code。
31. Energy curve point 和 energy table row 都可键盘 focus/click；点击 point 时 `WorkbenchShell` 复用 `workspace.select(node_ids=[nodeId])`，成功后 Graph Canvas selected node 和 Node Composition Editor 从 ShellResponse selection 自然联动。
32. Energy curve preview 跳过缺失 relative energy 的 point，不把 missing point 补成 0，也不把 missing point 连进有效 polyline；missing point 只在基线附近显示 marker/label，并在表格和 detail 中显示 `missing_reason`。
33. 右侧 inspector 新增 `ReportExportPanel`，基于当前 `WorkbenchDomainState.profile` 调用 fixture `export.profile`，提供 PNG/CDXML/XLSX format selection、include bytes、basename 和 title UI options。
34. Report Export Panel 会从当前 profile、format options、include bytes 和 active browser project state 派生 Export Readiness 静态摘要，显示 profile 是否存在、missing point 数量、含 correction 的 point 数量、inline bytes/download 状态、browser-local persistence 状态和 CDXML-only/ChemDraw 边界；该摘要不阻止导出、不改写 `export.profile` args，也不保存到 Project Content、Browser Project Repository 或 localStorage。
35. `export.profile` 成功后 `WorkbenchShell` 把 `ShellResponse.artifacts` 转为 `WorkbenchArtifactSummary` 并按 artifact id merge 到 `WorkbenchDomainState.artifacts`，同步 `counts.artifacts` 和 warnings。若存在 active browser project，`WorkbenchShell` 还会把带 inline bytes 的 artifacts 写入 Browser Project Repository 的 `exports/{basename}.{format}`。
36. Report Export artifact list 展示 format、id、path、inline/persisted 状态、checksum 和 metadata；`bytes_base64` 存在时提供 data URL download link，缺失时只显示不可下载状态。
37. Web Export Artifact Persistence 会同步 `.rxnflow/state/export-artifacts.json` 的 `export-artifacts-v1` records，并更新 `.rxnflow/state/project-content.json` 中 export artifact section 的 checksum，让 Project Sidebar shallow validation 继续 valid。
38. Report Export Panel 当前不调用 `project.save_content` 或 Save Bridge Session，不在前端生成 PNG/CDXML/XLSX bytes，不实现 file picker、OPFS、JSZip、云存储、账号系统、报告预览、CDX、PDF、PPTX、SVG 或 CSV。
36. `web/playwright.config.ts`、`web/playwright.local-http.config.ts` 和 `web/e2e/` 提供 Web Workbench E2E QA Harness；`npm run test:e2e` 会启动或复用 `http://127.0.0.1:5173/`，运行 Chromium 桌面和窄屏 fixture workbench journey，检查 console、页面身份、framework overlay、水平溢出、关键区域可见性并保存 Playwright screenshot/trace/report。默认 fixture E2E 当前包含 desktop graph editor matrix，覆盖 registered object drag/drop、node drag、edge delete、path reorder、viewport controls 和 Save/Open Bridge restore。
37. `npm run test:e2e:local-http` 会启动或复用本地 bridge `127.0.0.1:8766` 与 `http://127.0.0.1:5176/` local-http Vite server，只运行 local-http bridge smoke；bridge Python 解释器优先使用 `RXNFLOW_E2E_PYTHON`，其次使用 `CONDA_PREFIX/bin/python3`，最后回退到 `python3`，避免 Playwright shell path 与当前依赖环境不一致。该 smoke 覆盖 runtime badge、`fixture.run -> workbench.snapshot`、inline `water.xyz` preview、Project Content open/save bridge、energy compute 和 export artifact persistence。
38. 顶栏显示 Runtime Indicator：默认显示 `Runtime Fixture`，local-http 模式显示 `Runtime Local HTTP`，title 中保留 endpoint 或 transport kind，避免用户混淆 fixture mock 与本地 Python bridge。

`web/index.html` 是 Vite app 入口，不能直接用 `file://.../web/index.html` 预览。开发期查看页面需要运行：

```bash
cd web
npm run dev
```

然后打开 `http://127.0.0.1:5173/`。

## 2. 模块与职责

```
web/
├── index.html
├── package.json
├── playwright.local-http.config.ts
├── playwright.config.ts
├── vite.config.ts
├── e2e/
│   ├── workbench-helpers.ts
│   ├── local-http-bridge.spec.ts
│   ├── workbench-helpers.ts
│   └── workbench-journey.spec.ts
└── src/
    ├── main.tsx
    ├── shell/
    │   ├── types.ts
    │   ├── ShellClient.ts
    │   ├── httpTransport.ts
    │   ├── runtime.ts
    │   └── fixtureTransport.ts
    ├── repository/
    │   ├── types.ts
    │   ├── indexedDbRepository.ts
    │   └── memoryRepository.ts
    └── app/
        ├── App.tsx
        ├── ProjectSidebar.tsx
        ├── WorkbenchShell.tsx
        ├── GraphCanvas.tsx
        ├── graphEditorInteractionState.ts
        ├── graphNodeLayout.ts
        ├── graphViewport.ts
        ├── graphObjectDragPayload.ts
        ├── graphPathOrderDraft.ts
        ├── compositionDraftState.ts
        ├── EnergyProfilePanel.tsx
        ├── ReportExportPanel.tsx
        ├── ImportInbox.tsx
        ├── ObjectRegistryPanel.tsx
        ├── i18n/
        ├── importInboxState.ts
        ├── rawInputPersistence.ts
        ├── projectBundleArchive.ts
        ├── exportArtifactPersistence.ts
        ├── projectSidebarActions.ts
        ├── projectSidebarState.ts
        ├── workbenchState.ts
        └── workbench.css
```

- `web/src/shell/types.ts`：定义前端 JSON-safe Shell DTO，包括 `JsonValue`、`ShellCommandPayload`、`ShellError`、`ShellWarning`、`ShellArtifact`、`ShellResponse`、`ShellTransport`，以及 Workbench Snapshot、Object Summary Projection、Import Preview/Register summary DTO、Graph Summary Projection、`WorkspaceSelectionSummary`、`CanvasViewportSummary`、`WorkspaceCommandData`、`workspace.move_node` / `workspace.remove` / `workspace.select` / `workspace.set_viewport` command projection、typed Energy Profile Projection、Energy Expression summary types、`EnergyComputeData`、`ExportFormat` 和 `ExportProfileData`。
- `web/src/shell/ShellClient.ts`：负责 request id 填充、transport 调用和 response normalization。
- `web/src/shell/httpTransport.ts`：实现 `http-api` ShellTransport，通过 `fetch` POST JSON-safe Shell payload 到 local bridge endpoint；fetch/network/invalid JSON/malformed response 失败时返回 `transport_unavailable` ShellResponse。
- `web/src/shell/runtime.ts`：读取 Vite env 并创建 configured runtime；默认 `fixture`，`VITE_RXNFLOW_SHELL_TRANSPORT=local-http` 时使用 `createHttpShellTransport`，endpoint 默认 `http://127.0.0.1:8765/api/shell`。
- `web/src/shell/fixtureTransport.ts`：默认 fixture runtime transport，支持 `fixture.run`、`workbench.snapshot`、fixture `import.preview`、fixture `import.register_all`、fixture `workspace.open/add_node/set_node_composition/move_node/remove/select/set_viewport/connect/set_path` command projection、fixture `energy.compute`、fixture `export.profile` 和 unknown command 错误路径；fixture Project Content open/save 会序列化并恢复当前 `chemical-objects-v1`、`reaction-graphs-v1` 和 `workspaces-v1` 状态，workspace/energy/export command state 只服务 Web UI 编排测试。
- `web/src/app/workbenchState.ts`：定义 `WorkbenchDomainState`、`WorkbenchUiState` 和 `projectWorkbenchSnapshot`，把 `workbench.snapshot` 的 `ShellResponse` 投影为 UI 可读 domain state，保存 command status、session/project/active ids、objects/imports/workspace/profile/artifact summaries、counts、warnings 和 error。
- `web/src/app/App.tsx`：装配 configured `ShellClient`、RuntimeInfo 和 `BrowserProjectRepository`，把它们传入 Workbench shell。
- `web/src/app/WorkbenchShell.tsx`：渲染 Web app shell 第一屏，包括 local-only indicator、runtime indicator、command button、Project Sidebar、Import Inbox、Graph Canvas、Object Registry Panel、Energy Profile Panel、Report Export Panel、summary panels；同时维护 Project Sidebar state、Import Inbox state、active object UI state、Graph Editor Interaction State、Path Order Draft、Composition Draft、energy panel options 和 report export options，并把 create/open/save/refresh 编排到 repository，把 bridge open/save、preview/register、workspace open/add/set_node_composition/move/remove/select/set_viewport/connect/path commands、`energy.compute`、`export.profile`、browser-local raw input persistence 和 browser-local artifact persistence 编排到 ShellClient / Browser Project Repository。Graph Editor Interaction State 的 selection 会跟随 `WorkspaceSummary.selection` 恢复，旧 workspace projection 缺失 selection 时只做本地 prune，不主动补选第一个 node。
- `web/src/app/GraphCanvas.tsx`：图谱画布 MVP UI，展示 workspace graph nodes/edges/paths、active path、preview counts、disconnected diagnostics、click-driven graph commands、registered object drop target、Node Composition Editor、已有 node pointer drag move producer、edge selection/delete、path order draft controls，以及 Pan/Zoom/Fit/Reset viewport toolbar 和 viewport-transformed content layer。
- `web/src/app/graphEditorInteractionState.ts`：定义 Web Graph Canvas 的交互状态，包含 mode、selection、hover、dragging 和 pending edge，并提供 node/edge/path select、node/canvas dragging、start/complete/clear/prune 纯函数；其中 selection 可由 `WorkspaceSummary.selection` 恢复，其余 hover、dragging、pending edge 和 toolbar/pan 中间态不进入 ShellResponse、Project Content、Browser Project Repository 或 core workspace。
- `web/src/app/graphNodeLayout.ts`：定义 Graph Node Layout 固定虚拟坐标、fallback node position、CSS percent 映射、snap、clamp 和 pointer delta move helper；它只服务 Web canvas layout，不是 viewport/persistence schema。
- `web/src/app/graphViewport.ts`：定义 Graph Canvas Viewport helper，提供 `CanvasViewportSummary` fallback、`0.35..2.5` zoom clamp、screen/graph 坐标换算、CSS transform、zoom、pan、fit 和 reset helper；它只生成 viewport intent，不保存 Project Content。
- `web/src/app/graphObjectDragPayload.ts`：定义 Graph Object Drop 的 `application/x-rxnflow-graph-object` MIME type、`GraphObjectDragPayload`、serialize/parse helpers；payload 只承载 `kind`、`objectId`、`label`。
- `web/src/app/graphPathOrderDraft.ts`：定义 Path Order Draft helper，用于从 existing path 初始化 ordered node ids、上移/下移节点和判断 draft 是否变化；draft 只服务 Web UI，不进入 Shell DTO 或 Project Content。
- `web/src/app/compositionDraftState.ts`：定义 Composition Draft UI-only state helper，从 selected graph node 的 `composition` 或旧 `chemical_object_ids` 初始化 rows，提供 reconcile、row update/add/remove 和 dirty 判定；它不保存 Project Content，也不直接调用 Shell。
- `web/src/app/EnergyProfilePanel.tsx`：能量面板 UI，展示 command options、Energy Channel Selector、Correction Policy Controls、profile summary、relative energy table、missing reason、warnings、Energy Expression Details、交互式 SVG curve、Curve Point Detail 和 point/table selection；只消费 ShellResponse profile projection。
- `web/src/app/ReportExportPanel.tsx`：报告导出面板 UI，展示 format selection、include bytes、basename/title、Export Readiness 静态摘要、artifact list、metadata、warnings、inline download link、persisted state 和 checksum；只消费 ShellResponse artifact projection、当前 profile projection 与 Workbench persisted summary。
- `web/src/app/exportArtifactPersistence.ts`：Web Export Artifact Persistence helper，负责把 `ShellArtifact.bytes_base64` 解码写入 Browser Project Repository `exports/...`，upsert `export-artifacts-v1` records，并更新 Project Content index 中 export artifact section checksum。
- `web/src/app/ProjectSidebar.tsx`：左侧项目入口 UI，展示 browser-local project list、active browser project、local-only/backend badges、persistence/validation/bridge/checksum、repository error、Save Content、Open Bridge、Save Bridge 和 disabled Project Bundle actions。
- `web/src/app/ImportInbox.tsx`：导入收件箱 UI，展示 selected file metadata、expected format、strict toggle、preview/register/clear actions、batch/items、parser metadata、raw resource、registered object ids、warnings 和 errors。
- `web/src/app/ObjectRegistryPanel.tsx`：对象登记面板 UI，展示 object summary list、active object detail、source/provenance、energy/thermochemistry keys、warnings、correction count/list 和 Correction Entry Form；表单只产出 `ApplyCorrectionRequest`，已登记对象按钮同时是 Graph Object Drop drag source。
- `web/src/app/i18n/`：定义 `SupportedLocale`、`MessageKey`、`MessageCatalog`、`I18nProvider`、`useI18n`、locale detection / localStorage preference helpers，以及 `zh-CN` / `en-US` catalogs。
- `web/src/app/importInboxState.ts`：定义 Import Inbox UI state、file metadata projection、raw persistence UI projection、preview args helper、register eligibility 和 file size formatting。
- `web/src/app/rawInputPersistence.ts`：定义 Browser Raw Resource / Raw Persistence helper，负责 active browser project 下 selected File 的 SHA-256 checksum、safe basename、`inputs/raw/{sha12}-{safeName}` object 写入、`.rxnflow/manifest.json` raw resource merge 和 repository error payload 映射。
- `web/src/app/projectBundleArchive.ts`：定义 Browser Bundle Archive Adapter，负责 `.rxnflow.zip` writer/reader、Bundle Root 校验、zip central directory inspection、allowed roots / `inputs/raw` / duplicate / symlink / `__MACOSX` safety、fixed mtime stable output、entry checksum 和 shallow manifest summary。它是 Web 侧唯一直接 import `fflate` 的业务模块，不接 UI、repository writer 或 ShellClient。
- `web/src/app/projectContentBridge.ts`：定义 Browser Project Content Files helpers，生成空 `project-v1` manifest 与 `project-content-v1` sections，读写 Browser Project Repository，执行 shallow checksum validation，并在 Web bytes 与 shell `content_files` base64 payload 之间转换。
- `web/src/app/projectSidebarActions.ts`：封装 repository-backed sidebar actions：`refreshProjects`、`createProject`、`openProject` 和 `saveProjectContent`。
- `web/src/app/projectSidebarState.ts`：定义 `ProjectSidebarState`、`ProjectPersistenceState`、`ProjectBridgeState` 和 `SidebarValidationStatus`。
- `web/src/app/workbench.css`：当前 MVP 的响应式工作台样式；视觉风格不冻结，后续可替换组件库、配色、密度和面板细节。
- `web/src/repository/types.ts`：定义 Browser Project Repository 的 DTO、interface、`browserProjectBackendId`、path/project_ref validation、Web Crypto sha256 checksum helper 和 `BrowserProjectRepositoryError`。
- `web/src/repository/indexedDbRepository.ts`：真实浏览器 repository implementation，使用 IndexedDB database `rxnflow-browser-projects` 保存 `projects` 和 `objects` object stores；object key 为内部 `projectRef + path` 组合，公开边界只暴露 `projectRef` 和 project-relative path。
- `web/src/repository/memoryRepository.ts`：Vitest 用内存 test double，语义对齐 IndexedDB implementation，并支持 `quotaBytes` 模拟 `storage_quota_exceeded`。
- `web/playwright.config.ts`：默认 fixture Playwright E2E 配置，固定 `baseURL=http://127.0.0.1:5173`、Chromium project、fixture webServer 和 output/report 位置；通过 `testIgnore` 排除 local-http bridge spec。
- `web/playwright.local-http.config.ts`：local-http Playwright E2E 配置，按端口探测启动本地 bridge `127.0.0.1:8766` 与 Vite `127.0.0.1:5176`；bridge 命令显式设置 `PYTHONPATH` 指向仓库根后调用 `rxnflow.local_bridge.serve_local_bridge`，并按 `RXNFLOW_E2E_PYTHON` → `CONDA_PREFIX/bin/python3` → `python3` 顺序选择解释器，避免 Playwright shell 的 Python path / dependency 差异，Vite 设置 `VITE_RXNFLOW_SHELL_TRANSPORT=local-http` 和 endpoint，只匹配 `local-http-bridge.spec.ts`。
- `web/e2e/workbench-helpers.ts`：真实浏览器 QA helper，负责 storage reset、console issue collection、page identity、framework overlay 检查、horizontal overflow、region visibility、screenshot attachment、常用 workbench flow action、Graph Editor drag/drop、node drag、viewport controls 和 bridge restore。
- `web/e2e/workbench-journey.spec.ts`：桌面和窄屏 Workbench Journey E2E，覆盖项目、fixture、导入、对象、图谱、能量和报告导出主链路；其中 desktop graph editor matrix 专门覆盖 drag/drop、node drag、edge delete、path reorder、viewport controls 和 Save/Open Bridge restore。
- `web/e2e/local-http-bridge.spec.ts`：local-http bridge smoke，覆盖 Runtime Local HTTP endpoint、真实 bridge fixture snapshot、小文件 inline parser preview、Project Content open/save bridge、energy compute、export persistence、console clean 和无水平溢出。

## 3. 稳定边界

- Web UI 不直接 import Python core，也不复制 parser、registry、reaction graph、energy 或 export 领域算法。
- 前端 Shell DTO 必须保持 JSON-safe；`File`、`Blob`、`ArrayBuffer`、Path 和 class instance 不直接穿过 Shell Client。
- 当前前端代码支持 `in-process-test` fixture transport 和 `http-api` local bridge transport；默认仍为 fixture，只有设置 `VITE_RXNFLOW_SHELL_TRANSPORT=local-http` 时才调用本地 HTTP shell bridge。
- `http-api` transport 只转发 Shell payload 并规范化 ShellResponse，不解释 ChemicalObject、ReactionGraph、EnergyProfile 或 ExportArtifact 领域 payload。
- `transport_unavailable` 表示 fetch/network/invalid JSON/malformed response 层失败，和 Platform Shell 返回的 `invalid_input`、`graph_invalid` 等领域错误分离。
- Fixture Transport 只证明前端能按 `ShellResponse` 消费数据；它不代表真实 Gaussian、ORCA、MAPLE、XYZ/extxyz 导入能力。
- Workbench Snapshot 是只读状态投影，不是保存命令；保存仍由 `project.save_content` 承担。
- WorkbenchDomainState 是 shell response projection，不是 ChemicalObject / ReactionGraph / EnergyProfile 的前端复制品。
- WorkbenchUiState 只承载 UI-only 状态；当前不写回 core，也不替代 WorkspaceSnapshot。
- ProjectSidebarState 来自 Browser Project Repository，不替代 WorkbenchDomainState，也不伪造 shell session 或 PlatformSession。
- 三栏工作台结构是后续项目、导入、对象、图谱、能量和导出面板的承载骨架；当前 Graph Canvas 支持对象拖入创建节点、已有节点拖动布局、edge 删除、path 顺序草稿和 click-driven fallback，但不是完整拖拽图谱编辑器。
- Graph Canvas 只读取 `WorkbenchDomainState.workspace.graph`、`workspace.preview`、`workspace.viewport`、`workspace.selection` 和 `objects`；不从 DOM、Import Inbox pending/failed item 或 Project Sidebar state 反推图谱状态。
- Graph Canvas graph 结构变化只来自 `ShellClient` response；`WorkbenchShell` 不直接 patch `workspace.graph.nodes` / `edges` / `paths`。
- Graph Canvas 的 node/edge/path selection 通过 `workspace.select` 进入 core / fixture workspace state，并以 ShellResponse `WorkspaceSummary.selection` 为权威投影；workspace projection 更新后会清理失效的 node/edge/path 引用。
- Graph Canvas 的 mode、hover、dragging、pending edge、Path Order Draft、viewport intent、transient pan drag 和 toolbar state 仍是 UI-only state，不写入 Project Content、Browser Project Repository、localStorage 或 ShellResponse。
- Composition Draft 是 Web UI-only state：选中 node 后从 ShellResponse `GraphNodeSummary.composition` 初始化，编辑期间不修改 `WorkbenchDomainState.workspace.graph`，Apply 成功后才通过 `workspace.set_node_composition` 返回的 workspace projection 刷新 node composition 和兼容 `chemical_object_ids`。删除 selected node、切换 workspace 或 workspace projection 更新时会 prune/reconcile stale draft。
- Node Composition Editor 只替换 selected graph node 的 composition rows；基础 coefficient guard 只阻止 0、NaN、Infinity 等明显非法输入，shell error 仍以 code/message/target 显示。Web 不从分子式配平、不做电荷/元素守恒校验，也不把 missing/invalid composition 自动修复成默认值。
- Graph Canvas 删除 node/edge 只通过 `workspace.remove`；node 删除后的 edge/path cascade 必须来自 ShellResponse workspace projection，前端不自行推断。
- Workspace selection restore/save 只通过 Project Sidebar 的显式 Open Bridge / Save Bridge Session 闭环发生；Web 不引入 browser-local graph layout schema，也不使用 localStorage 保存图谱布局或选择。
- Path Order Draft 是 UI-only state；调整期间不修改 `WorkbenchDomainState.workspace.graph.paths`，只有 Apply 成功后的 ShellResponse 才更新 path order 和 active path projection。
- Existing Node Drag 只在 release 后发送 `workspace.move_node`；dragging / hover / pointer position 是 transient UI state，不写 Browser Project Repository、Project Content、localStorage 或 ShellResponse。
- Graph Canvas Viewport Controls 只生成 viewport intent；Zoom、Fit、Reset 和 pan release 都通过 `workspace.set_viewport` 提交，成功后只用 ShellResponse `workspace.viewport` 更新可见 viewport。Web 不直接 patch `WorkbenchDomainState.workspace.viewport`。
- Viewport Transform 只作用于 GraphCanvas content layer 和 screen/graph 坐标换算；object drop、node drag 和 pan drag 共用 `graphViewport.ts` helper，提交给 Shell 的 position 仍是 `600 x 360` workspace 虚拟坐标。
- Viewport intent、transient canvas dragging、surface DOM size、fit 中间值和 toolbar pressed state 都是 UI-only；它们不写 Project Content、Browser Project Repository、localStorage 或 ShellResponse。当前不实现 viewport auto persistence、undo/redo/history、minimap、wheel/pinch 或 inertial scroll。
- Node Layout position 属于 workspace graph 的 `ReactionNode.position` 投影，不写 ChemicalObject、Object Registry、Import Inbox、Energy Profile 或 Report Export；Web helper 只做 `600 x 360` / `20` grid 的显示和输入换算。
- Graph Object Drop 只接受 Object Registry 已登记对象产生的 `registered-object` payload；malformed payload、wrong kind、unknown object id、Import Inbox pending/failed item、raw resource、parser preview item 和浏览器文件都不能直接创建 graph node。
- Fixture `workspace.connect` 对同一 node pair 幂等；缺失 node 返回 `graph_invalid` / `target=node_id`。
- Energy Profile Panel 只通过 `energy.compute` 获取 profile projection，不从 graph/object energy keys 在前端重算相对能量、校正项、expression 或单位换算。
- Energy Panel options 是 UI-only state；`path_id` 默认跟随 `workspace.active_path_id`，`baseline_node_id` 只能来自当前 path node ids 或留空，`energy_source` 支持 `auto` / `energies` / `thermochemistry`，correction policy 支持 `none` / `all` / `kinds` / `ids`。
- Energy Channel Selector 候选来自当前 `WorkbenchDomainState.objects[].energy_channels` 的汇总 projection，显示 key/source/unit/object count；用户仍可输入自定义 energy key。候选缺失或 path-level partial/missing channel 不在前端修复，由 shell/core 返回 missing/invalid/ambiguous diagnostics。
- Correction Policy Controls 直接映射 shell args：`none` 发送 `include_corrections=false` 与 `{mode:"none"}`；`all/kinds/ids` 发送 `include_corrections=true` 与对应 `correction_policy`。ids 输入第一版按逗号/空白切分，不检查每个 id 是否存在于 path node。
- Energy compute 成功只替换 `WorkbenchDomainState.profile` 并更新 `active.profileId` / `counts.profiles`；不调用 `project.save_content`，不写 Browser Project Repository，不保存 Project Content。
- Energy Expression Details 逐点展示 Shell DTO 中的 terms、corrections、total 和 missing diagnostics；旧 profile 没有 expression 时该区域自然为空，不从 graph/object state 推断。
- Energy curve point state 是 Web component UI-only state：active/pinned point 只服务 hover/focus/click/detail，不写 Project Content、Browser Project Repository、localStorage 或 ShellResponse。
- Energy curve point status 只从现有 profile point 的 relative value、`missing_reason`、`expression.missing` 和 `expression.corrections.length` 派生；correction marker/count 不在前端重新求和 correction contribution。
- Energy point 缺失时必须显示 `missing_reason` 和 warning；如 Shell DTO 带 missing expression details，则 details 区展示缺失 code/object/key/source/message；SVG curve 只连接有 relative energy 的点，不把 missing point 当作 0。
- Energy curve point 和 table row 的 graph linkage 只通过 `workspace.select` 完成，Web 不直接 mutate `WorkbenchDomainState.workspace.selection`、graph/path/profile 或 node composition。
- Fixture `energy.compute` 支持 `kcal_mol` / `kj_mol`、`include_corrections` warning、missing path `graph_invalid` 和 imported object `missing_energy` 测试路径；它不代表真实 Energy Engine 算法运行在浏览器中。
- Report Export Panel 只通过 `export.profile` 获取 runtime `ShellArtifact` projection；前端不调用 core `ReportExportService` writer，不在浏览器生成 PNG/CDXML/XLSX bytes。
- Report Export options 是 UI-only state；`formats`、`include_bytes`、`basename` 和 `title` 只在点击 Export 时映射为 Shell command args，不写 core Project Content session。
- Export Readiness 是 Report Export Panel 内的静态 UI 摘要；它从 profile/options/browser project state 派生 missing/correction/bytes/persistence/CDXML-only 提示，不阻止导出、不调用 shell、不写 artifact metadata 或 repository。
- Report Export 成功先 merge `ShellResponse.artifacts` 到 `WorkbenchDomainState.artifacts` 并更新 `counts.artifacts`；存在 active browser project 且 artifact 带 inline bytes 时，Web 再写 Browser Project Repository 的 `exports/...` object，并把 persisted path/checksum merge 回 artifact summary。
- Web Export Artifact Persistence 只支持 `png`、`cdxml` 和 `xlsx`，path 由 `exports/{safeBasename}.{format}` 生成；不接受 ShellArtifact 的绝对 path 或项目外 path。重复导出按 artifact id/path upsert，不创建重复 index record。
- Web Export Artifact Persistence 会更新 `.rxnflow/state/export-artifacts.json` 和 `.rxnflow/state/project-content.json` 的对应 checksum；它不调用 `project.save_content`、不自动创建 browser project、不自动打开 bridge session、不把 Browser Project Ref 当作 Python filesystem path。
- Inline Artifact Download 只在 `bytes_base64` 存在时使用 data URL；`bytes_base64` 缺失时显示不可下载状态，且不会写 `exports/...` 或 export-artifacts record。artifact id、format、path、checksum、metadata key/value、warning/error code 原样显示，不进入 i18n 翻译。
- Fixture `export.profile` 支持 PNG/CDXML/XLSX、多格式、include bytes、missing profile、missing formats 和 CDXML-only warning 测试路径；它不代表真实 Report Export Service 在浏览器中运行。
- Web E2E QA Harness 分为默认 fixture mode 和 local-http mode。fixture mode 只通过真实浏览器 UI 操作已落地 fixture flow；local-http mode 通过浏览器 UI 调用本地 Python bridge smoke。两者都不在前端 import Python core、不新增 shell command、不改变 React app runtime。
- `npm run test:e2e` 与 `npm run test:e2e:local-http` 的 baseURL、server env、测试文件、outputDir 和 HTML report 目录互相隔离；local-http spec 不进入默认 fixture E2E。
- local-http E2E 使用固定开发端口 `8766`（bridge）和 `5176`（Vite）；端口冲突视为本地 QA 启动失败，不在 Web app 内做自动端口发现、后台 daemon、自动重连或 bridge GUI 控制。
- local-http E2E 需要使用安装了 Python 导出依赖的解释器；可用 `RXNFLOW_E2E_PYTHON=/path/to/python3 npm run test:e2e:local-http` 显式指定，未指定时优先跟随 `CONDA_PREFIX/bin/python3`。
- E2E tests 会清理测试上下文中的 `rxnflow-browser-projects` IndexedDB 和 localStorage，避免测试之间互相污染；这只是测试隔离，不是用户数据迁移或清理功能。
- Playwright screenshot、trace 和 HTML report 只写入 `web/test-results*/` / `web/playwright-report*/`，这些目录被 `.gitignore` 忽略，不进入 Project Content 或 Browser Project Repository。
- Default fixture E2E 的复杂 graph editor 手势矩阵不复制到 local-http E2E；local-http smoke 只验证真实 Python bridge 主链路，避免把 browser gesture flakiness 和 bridge dependency 绑定在同一测试。
- Browser Project Repository 是 Web 前端服务，不是 ShellTransport；它保存 bytes，不解析 ChemicalObject、ReactionGraph、EnergyProfile 或 ExportArtifact 语义。
- Browser Project Repository 当前是 IndexedDB-first：project refs、metadata 和 bytes 都写入 IndexedDB；OPFS payload store、Web Worker、Service Worker、StorageManager.persist 权限 UI 和大文件 chunking 尚未实现。
- Browser Project Repository 使用项目相对 POSIX path，禁止空路径、绝对路径、反斜杠、`.` 和 `..`；`writeObject` 覆盖同一 `projectRef/path`，`deleteObject` 对缺失对象幂等成功，`listObjects` 支持 exact file 和 prefix subtree。
- Browser Project Repository 明确 local-only；浏览器清数据、profile 损坏或 origin 变化可能删除项目内容。早期跨设备迁移仍依赖 `.rxnflow.zip` 手动备份路径。
- Browser Bundle Archive Adapter 是 helper-only archive boundary：`fflate` 只允许在 `projectBundleArchive.ts` 和对应测试中直接 import；Project Sidebar、WorkbenchShell、repository writer 和 Shell transport 不直接调用 zip library。adapter reader 不返回部分安全 entries；任一非法 zip entry 使整个 read 返回 structured `invalid_bundle` / `zip_failed`。
- Browser Project Content Files 使用现有 `.rxnflow/manifest.json`、`.rxnflow/state/project-content.json` 和 6 个 section files schema；Web 创建空 sections 或写回 shell 返回 bytes，但不解析 ChemicalObject、ReactionGraph、WorkspaceSnapshot、EnergyProfile 或 ExportArtifact 领域内容。
- Project Sidebar 的 validation 是 shallow repository validation：读取 index 与 section files，检查缺失和 checksum mismatch；它不调用 Python `ProjectContentValidator`，不做跨 section 引用深校验或 migration。
- Web I18n Runtime 是前端 UI runtime，不进入 ShellResponse，不写 Project Content，也不改变 Browser Project Repository 或 Python core contract。
- Locale preference 只保存在浏览器 localStorage，localStorage 不可用时 UI 仍可运行但不保证持久；默认按 browser language 选择，`zh*` 走 `zh-CN`，其他走 `en-US`。
- Message catalogs 当前只覆盖 Web Workbench / Project Sidebar 主 UI 文案；project name、projectRef、checksum、fixture ids、error code、error target 和底层 error message 等动态数据原样显示。
- Object Registry Panel 只读取 `WorkbenchDomainState.objects`；不从 Import Inbox pending/failed item、graph placeholder 或 Project Sidebar state 反推对象卡片。
- Object Summary Projection 是 UI summary，不是完整 ChemicalObject codec；当前可包含 formula、charge、spin_multiplicity、method、source_file_id、energy_keys、thermochemistry_keys、provenance、correction_count、corrections 明细和 warnings。
- Object Registry active object selection 是 `WorkbenchShell` 前端 UI-only state，不写入 Project Content，不替代 Workspace Selection 或 Graph Canvas selection；Graph Canvas click-driven 添加节点时把 active object id 作为 `workspace.add_node` 的 command args 传给 ShellClient，drag/drop 添加节点时把 payload object id 和 drop position 映射为同一 command。
- Correction Entry Form 只通过 `ShellClient` 调用 `registry.apply_correction`，不直接 import Python codec、不在前端重算校正项、不本地伪造 Object Summary；成功/失败状态均以 ShellResponse 为准。表单不实现 correction 编辑、删除、排序、批量导入或 undo/redo，也不自动调用 `project.save_content`。
- Import Inbox 的 selected browser `File` 在前端转换为 metadata / logical `inbox/<name>` path 供 fixture transport 验证 UI；local-http preview 可把小文件 bytes 编成 inline payload 发给 ShellClient。真实 File bytes 不作为 Python 可读 source path，也不让 local-http bridge 读取 Browser Project Repository / IndexedDB。
- Active browser project 存在且 preview payload 校验通过时，Import Inbox 会把 selected `File` 作为 Browser Raw Input Object 写入 `inputs/raw/{sha12}-{safeName}`，并把 Browser Raw Resource merge 进 `.rxnflow/manifest.json`。该 raw resource 是后续 project bundle anchor，不等同于 import confirmation，也不会自动登记 ChemicalObject。
- Raw Persistence Summary 是 selected file list 的 UI-only projection；长期状态只在 Browser Project Repository object 和 manifest resource 中，不写 localStorage、Project Content index 或 ShellResponse。
- Raw persistence failure 与 parser preview error 分开展示；repository write/manifest error 显示在 selected file list，preview 仍可继续使用原有 path/inline payload。oversized inline file 在 payload 阶段直接 `payload_too_large`，不会读取 bytes 或写 raw object。
- Import Inbox fixture preview 不代表真实 Gaussian、ORCA、MAPLE、XYZ/extxyz 完整支持；parser_id、warning/error code、raw resource path/checksum 都按 ShellResponse 原样显示。
- 当前已实现显式 Project Content open/save bridge、Web Export Artifact Persistence、Browser Bundle Archive Adapter、已登记对象拖入画布创建节点、已有 graph node 基础拖动布局、edge 删除和 path 顺序草稿；仍不实现 Project Sidebar bundle import/export UI、repository bundle writer、自动布局、缩放/平移持久化、path delete、自由绘线、edge label 编辑、高级 energy curve 编辑或报告预览。
- 当前 Web 前端不实现 HTTP route、Vercel route、FastAPI、Flask、Django、Express server、云存储、账号、权限或同步；`http-api` transport 只调用外部已启动的本地 HTTP shell bridge。

## 4. QA 与验证

当前 Web Workbench 使用 Vitest + Testing Library 覆盖 ShellClient 和 WorkbenchShell：

- `fixture.run` 返回 `ok=true` 的 JSON-safe response。
- `workbench.snapshot` fixture response 返回 JSON-safe project/object/workspace/profile summary。
- missing fixture snapshot session 返回 `invalid_input` 和 `target=session_id`。
- unknown command 返回 `ok=false` 和 `invalid_input`。
- App 首屏是 workbench，不是 landing page。
- 点击 `Fixture Run` 后，UI 通过 snapshot projector 展示 fixture project/profile/counts 和 `Ready` 状态。
- invalid command error code 可见。
- Browser Project Repository contract helpers 覆盖 project ref / storage object / write receipt JSON-safe shape、path safety 和 sha256 checksum。
- MemoryBrowserProjectRepository 覆盖 create/list/write/read/exists/list/delete、project isolation、overwrite、missing object、delete idempotency、quota failure 和 IndexedDB error mapping。
- Project Sidebar component tests 覆盖首屏 local-only / project list、create project + persisted validation、missing content + save、repository error 展示和 disabled bundle actions。
- I18n runtime tests 覆盖 catalog key completeness、browser locale detection、stored locale preference、storage failure fallback 和 `{param}` interpolation。
- WorkbenchShell component tests 覆盖英文默认文案、中文切换、英文切回，以及 Project Sidebar validation message 随 locale 渲染。
- ShellClient tests 覆盖 fixture `import.preview` JSON-safe response、success/failed item、warning code、missing source path error 和 repeated `import.register_all` idempotent registered ids。
- ShellClient tests 覆盖 fixture `workspace.open`、`workspace.add_node`、`workspace.connect`、`workspace.set_path` 的 JSON-safe graph projection、connect 幂等和 missing node `graph_invalid` error。
- ShellClient tests 覆盖 fixture `workspace.move_node` 的 JSON-safe command projection、node position 更新、missing node `graph_invalid` 和 invalid position `invalid_input`。
- ShellClient tests 覆盖 fixture `workspace.remove` 的 JSON-safe command projection、edge 删除、node 删除 cascade、空 selection 和未知 id error。
- ShellClient tests 覆盖 fixture `workspace.set_viewport` 的 JSON-safe command projection、viewport 更新、missing session、invalid viewport target 和 invalid `viewport.zoom` error。
- ShellClient tests 覆盖 fixture `registry.apply_correction` 的 JSON-safe object projection、自动 correction id、重复同 payload 幂等、snapshot 同步、invalid kind/unit/missing object 错误路径，以及 fixture `energy.compute` 的 JSON-safe profile projection、`kj_mol` output unit、`corrections_empty` warning 和 missing path `graph_invalid` error。
- WorkbenchShell component tests 覆盖 Import Inbox 文件 metadata queue、expected format/strict、preview batch、parser metadata、raw resource、warnings/errors、register all、registered object ids、imports/objects count 更新和中文文案。
- WorkbenchShell / raw input persistence tests 覆盖 active browser project 下 `water.xyz` 写入 `inputs/raw/{sha12}-water.xyz`、manifest `raw_file` resource merge、同 checksum 重复 preview 不重复 resource、无 active project skipped、repository write failure 独立显示 raw persistence error、oversized inline file 不读写 raw object、坏 manifest structured error，以及 raw id/path/checksum 中英文 UI 文案。
- Project Bundle Archive Adapter tests 覆盖 `.rxnflow.zip` writer/reader roundtrip、summary project id/name、entry checksum、稳定输出、`.DS_Store` / `__MACOSX` export skip、unsafe writer root/path rejection、unsafe reader multi-root/missing manifest/absolute/backslash/dotdot/dot/root file/outside roots/`inputs` 非 raw rejection、显式 safe directory entries、duplicate central directory entry、symlink external attributes 和 malformed manifest warning summary。
- WorkbenchShell component tests 覆盖 Object Registry Panel 空态、Fixture object 列表/详情、active object selection、Correction Entry Form 成功提交、失败错误展示且不本地追加 correction、import register 后 imported object 可选、warning 原样显示和中文静态文案。
- WorkbenchShell component tests 覆盖 Graph Canvas 首屏空态、workspace commands disabled、Fixture graph nodes/paths/preview、Open Workspace、Add Node、Connect、重复 Connect 幂等、Set Path、workspace error 可见和中文静态文案。
- Graph Editor Interaction State helper tests 覆盖 node selection 数组协议、pending edge start/complete/clear、stale selection/hover/dragging prune 和非 connect mode 保留。
- Graph Object Drag Payload helper tests 覆盖 valid payload、malformed JSON、wrong kind、empty object id 和 empty label。
- WorkbenchShell component tests 覆盖 Object Registry dragstart 写入 `application/x-rxnflow-graph-object`、drop Object B 到 Graph Canvas 后调用 `workspace.add_node(position)` 并显示 `node-web-3/object-b`、unknown object id drop 不发 shell command。
- Graph Node Layout helper tests 覆盖 existing position、fallback position、CSS percent 映射、snap、clamp 和 invalid finite fallback。
- Graph Viewport helper tests 覆盖 fallback viewport、zoom clamp、screen/graph 坐标换算、CSS transform、zoom、pan、fit 和 reset。
- WorkbenchShell component tests 覆盖 click node 仍选择且不发 move command、drag `node-b` 后发送 `workspace.move_node(node-b, [420, 220])` 并按 ShellResponse 新 position 更新样式。
- WorkbenchShell component tests 覆盖 edge selection/delete 发送 `workspace.remove(edge_ids=[edge-a-b])`、node selection/delete 发送 `workspace.remove(node_ids=[node-a])` 并使用 ShellResponse cascade、Path Order Draft Apply 前不发 `workspace.set_path`、Apply 后发送 `workspace.set_path(path-a-b, [node-b, node-a])`。
- WorkbenchShell component tests 覆盖 GraphCanvas Zoom In/Out、Fit、Reset 和 Pan mode empty-surface drag 发送 `workspace.set_viewport`；node drag 不触发 pan viewport command，zoom 后 object drop / node drag release 仍提交 graph coordinates。
- Composition Draft helper tests 覆盖从 selected node composition 初始化、旧 `chemical_object_ids` fallback、workspace 切换/删除后 prune stale draft，以及 row update/add/remove dirty state。
- WorkbenchShell component tests 覆盖 Node Composition Editor：选中 graph node 后从 ShellResponse composition 显示 rows，编辑 `object-a + 2*object-b` 后提交 `workspace.set_node_composition` payload，非法 coefficient 本地显示 `invalid_input` 且不发送 shell command。
- WorkbenchShell component tests 覆盖 Energy Profile Panel 首屏空态、Compute disabled、Fixture profile table/curve、`kj_mol` compute、Energy Channel Selector 选择 `thermochemistry:gibbs` 后发送 `energy_source=thermochemistry`、Correction Policy Controls 的 none/all/kinds/ids 映射、`corrections_empty` warning、中文静态文案，以及 imported object missing energy 不补 0。
- WorkbenchShell component tests 覆盖 composition edits 后 Energy Expression Details 显示 coefficient 和 energy source，并由 fixture expression projection 反映 selected node composition。
- ShellClient tests 覆盖 fixture `export.profile` JSON-safe artifact projection、PNG/CDXML/XLSX 多格式、inline bytes、include bytes disabled 和 missing formats `invalid_input` error。
- ShellClient tests 覆盖 `http-api` transport 的 endpoint missing、fetch failure、malformed response、HTTP non-ok shell error 穿透和 HTTP non-ok ok-response normalization。
- WorkbenchShell component tests 覆盖 Report Export Panel 首屏空态、Export disabled、默认 PNG/CDXML/XLSX 与 include bytes、成功导出 3 个 artifacts、writer metadata、`energy-table-v1` schema metadata、CDXML/XLSX download MIME、artifact count、CDXML warning、active browser project 下写入 `exports/...` 与 `export-artifacts-v1`、repository 写失败 warning/runtime artifact 保留、include bytes disabled 无下载链接/不写 repository 和中文静态文案。用户操作指南见 `docs/user/report-export-artifacts.md`。
- WorkbenchShell component tests 覆盖 local-http runtime 不可达时 `transport_unavailable` / `http-api` 可见。
- Export Artifact Persistence helper tests 覆盖 PNG/CDXML/XLSX bytes object 写入、record upsert、Project Content index checksum 更新、重复导出不重复记录、缺 inline bytes skip、unsupported format skip、坏 base64 error 和 summary merge。
- Playwright E2E tests 覆盖真实浏览器 desktop/narrow fixture Workbench Journey、page identity、console clean、no horizontal overflow、project create/save、fixture/import/graph/energy/report export 主链路和 screenshots；fixture report export E2E 固定 writer metadata、`energy-table-v1` schema metadata、download MIME、persisted path/checksum、CDXML warning 和 include-bytes-off；local-http Playwright smoke 覆盖本地 Python bridge 模式隔离、真实 bridge 主链路、真实 writer ids、persisted path/checksum 和 download MIME。
- Playwright Chromium raw input browser QA 覆盖 `http://127.0.0.1:5173/` 下 desktop `1280x900` 与 narrow `390x900`：创建 active browser project、运行 Fixture、选择 `water.xyz`、Preview 后显示 `Persisted raw input`、`inputs/raw/{sha12}-water.xyz` 和 raw checksum；两种 viewport 均无水平溢出，console error 为空。

实现验收时已通过：

- `npm run test`
- `npm run build`
- `python3 -m unittest discover`
- Browser 插件在 `http://127.0.0.1:5175/` 验证 Graph Editor Interaction State 接入后的 Graph Canvas 主链路：中文界面 `运行 Fixture -> 添加节点 -> 连接 -> 设为路径`，最终显示 `path-web-main`、`node-a -> node-b -> node-web-3` 和 `无断开节点`，console warning/error 为 0。截图：`/tmp/rxnflow-graph-interaction-state.png`。
- Browser 插件在 `http://127.0.0.1:5175/` 验证 object-drop 页面身份、非空白和 console clean；当前 Browser CUA 原生鼠标拖动未触发 HTML5 drop，后续用 Playwright 渲染页 DragEvent 验证 drop 行为。
- Playwright Chromium 渲染验证：`Fixture Run` 后向 `.graph-canvas-surface` dispatch registered-object drag/drop，node count 从 2 到 3，新 node 文本为 `Object B / node-web-3 / object-b / H2`，console warning/error 为 0。
- Browser 插件连接 `http://127.0.0.1:5175/` 做 node-layout QA 时页面可访问，但点击 `运行 Fixture` 触发 CDP `Runtime.evaluate` timeout；按前端 QA 流程 fallback 到本地 Playwright Chromium。
- Playwright Chromium 真实鼠标拖动验证：`Fixture Run` 后滚动 `node-b` 到视口内，拖动后 `node-b` style 从 `left 162px/top 709.406px` 变为 `left 252px/top 798.094px`，console issues `[]`。截图：`/tmp/rxnflow-node-layout-drag.png`。
- Browser 插件在 `http://127.0.0.1:5173/` 验证 edge/path editing 页面身份、非空白和 console clean；点击 `运行 Fixture` 时 CDP `Runtime.evaluate` timeout，按前端 QA 流程 fallback 到本地 Playwright Chromium。
- Playwright Chromium viewport `1440x950` 验证 edge/path editing 完整交互链：Fixture Run 后 edge button 可见，选择 `Fixture path` 后把第二个 node 上移并 Apply，页面显示 `node-b -> node-a`；随后选择 `Edge Object A to Object B` 并 Delete Selected，edge count 从 1 到 0，Object A/Object B 仍可见，无 framework overlay，console warning/error 为 0。截图：`/tmp/rxnflow-edge-path-fixture.png`、`/tmp/rxnflow-edge-path-reordered.png`、`/tmp/rxnflow-edge-path-edge-deleted.png`。
- Browser 插件在 `http://127.0.0.1:5173/` 验证 viewport controls 页面身份、非空白和 console clean；点击 `运行 Fixture` 时 CDP `Runtime.evaluate` timeout，按前端 QA 流程 fallback 到本地 Playwright Chromium。
- Playwright Chromium viewport `1440x950` 验证 viewport controls 完整交互链：Fixture Run 后 `node-a` / `node-b` 可见，Zoom In 后 transform 变为 `matrix(1.2, 0, 0, 1.2, -43, -31.8)`，Fit 后 zoom 输出 `179%`，Reset 后 transform 回到 identity，Pan mode 空白拖动后 transform 变为 `matrix(1, 0, 0, 1, 64.5, -50.88)`，overlay=false，console warning/error 为 0。截图：`/tmp/rxnflow-viewport-fixture.png`、`/tmp/rxnflow-viewport-zoom.png`、`/tmp/rxnflow-viewport-fit.png`、`/tmp/rxnflow-viewport-pan.png`。
- `npm run test:e2e`
- `npm run build`
- `python3 -m unittest discover`
- 真实 Chromium browser smoke：在 `http://127.0.0.1:5173/` 动态 import repository，执行 `createProject`、`writeObject`、`readObject`、`listObjects`、`deleteObject` 和 `exists=false`
- 真实浏览器桌面 viewport `1280x720` 验证 Project Sidebar open/save、Persisted/Valid/checksum、disabled bundle entry、无 console error/warn、无水平溢出
- 真实浏览器桌面 viewport `1280x720` 验证 locale switcher 可在 `zh-CN` / `en-US` 间切换，主文案更新且无 console error/warn、无水平溢出
- Playwright browser viewport `1280x720` 验证 Import Inbox 可见、Preview/Register 初始 disabled、无 console error/warn、无水平溢出
- Playwright browser viewport `390x840` 验证 Import Inbox 窄屏布局可见、Preview/Register 初始 disabled、无 console error/warn、无水平溢出
- Playwright Chromium viewport `1280x720` 验证 Object Registry Panel 运行 Fixture 后选择 Object B，填写 solvation correction（-2.4 kcal_mol, reference SMD, note），提交后 correction list/count 刷新，无 console warning/error、无水平溢出。截图：`/tmp/rxnflow-correction-desktop.png`。
- Playwright Chromium viewport `390x840` 验证同一 Correction Entry Form flow，Object Registry、Graph Canvas、Energy Profile Panel 和 Report Export Panel 仍可见，表单和 correction list 无重叠、无水平溢出。截图：`/tmp/rxnflow-correction-narrow.png`。
- Browser 插件在 `http://127.0.0.1:5174/` 验证 Graph Canvas 首屏可读、非空白、无 console warning/error；后续点击 Fixture Run 时 in-app Browser CDP click 两次超时，按前端 QA 流程 fallback 到本地 Playwright Chromium。
- Playwright Chromium viewport `1280x720` 验证 Graph Canvas 完整交互链：Fixture Run、选择 Object B、Add Node、Connect、Set Path，最终显示 `path-web-main`、`node-a -> node-b -> node-web-3` 和 no disconnected nodes；无 console warning/error、无水平溢出、节点无重叠。截图：`/tmp/rxnflow-graph-canvas-desktop.png`。
- Playwright Chromium viewport `390x840` 验证 Graph Canvas 窄屏纵向布局完成同一交互链，toolbar、canvas surface、preview panel 无水平溢出、节点无重叠。截图：`/tmp/rxnflow-graph-canvas-narrow.png`。
- Browser 插件在 `http://127.0.0.1:5173/` 验证 Energy Profile Panel 挂载、页面标题正确且 console clean；Browser 点击 Fixture Run 时 CDP evaluate 超时，按前端 QA 流程 fallback 到本地 Playwright Chromium。
- Playwright Chromium viewport `1280x720` 验证 Energy Profile Panel 完整交互链：Fixture Run、切换 `kj_mol`、include corrections、Compute，最终显示 `profile-path-a-b-electronic-kj_mol`、`-51.882` 和 `corrections_empty`；无 console warning/error、无水平溢出。截图：`/tmp/rxnflow-energy-panel-desktop.png`。
- Playwright Chromium viewport `390x840` 验证同一 energy compute flow，选项、表格、curve 和 warning 区域无重叠、无水平溢出。截图：`/tmp/rxnflow-energy-panel-narrow.png`。
- Playwright Chromium desktop/narrow 验证 missing energy path：导入 `water.xyz`、Add Node、Connect、Set Path、Compute 后表格包含 `node-web-3` / `missing_energy`，curve 只绘制两个非 missing 点，不补 0。截图：`/tmp/rxnflow-energy-panel-missing-desktop.png`、`/tmp/rxnflow-energy-panel-missing-narrow.png`。
- Browser 插件尝试连接 `http://127.0.0.1:5173/` 做 Report Export Panel QA；Browser screenshot CDP command 超时，按前端 QA 流程 fallback 到本地 Playwright Chromium。
- Playwright Chromium viewport `1280x720` 验证 Report Export Panel 完整交互链：Fixture Run、Compute、Export，最终显示 `artifact-png-rxnflow-profile`、`artifact-cdxml-rxnflow-profile`、`artifact-xlsx-rxnflow-profile`、3 个 Download link、`rxnflow-profile.png` data URL、metadata 和 `chemdraw_cdxml_only` warning；无 console warning/error、无水平溢出。截图：`/tmp/rxnflow-report-export-desktop.png`。
- Playwright Chromium viewport `390x840` 验证同一 report export flow，format options、artifact list、download link、metadata 和 warning 区域无重叠、无水平溢出。截图：`/tmp/rxnflow-report-export-narrow.png`。
- Playwright Chromium viewport `1280x720` 验证 include bytes disabled flow：导出仍显示 3 个 artifacts，但没有 Download link，显示 3 个 `Download unavailable`。截图：`/tmp/rxnflow-report-export-no-bytes.png`。
- Playwright E2E `web/e2e/workbench-journey.spec.ts` 验证 desktop `1280x720` 完整 Workbench Journey：project create/save、Fixture Run、Import Preview/Register、Object selection、Graph Add/Connect/Set Path、missing energy Compute、Report Export、include bytes disabled、framework overlay absent、console clean、无水平溢出和 screenshot attachment。
- Playwright E2E `web/e2e/workbench-journey.spec.ts` 验证 desktop Graph Editor Matrix：registered object drag/drop 后显示 `node-web-3`，已有 node drag 后 bounding box 有有限移动，edge selection + Delete Selected 后 edge count 为 0 且 nodes 保留，path order draft Apply 后显示 `node-b -> node-a`，Zoom/Fit/Reset/Pan 有可观察 viewport 变化，Save Bridge 后 reload/open/Open Bridge 恢复 `120%`、active path 和 path order。
- Playwright E2E `web/e2e/workbench-journey.spec.ts` 验证 narrow `390x840` Workbench Journey smoke：Fixture Run、Graph Add/Connect/Set Path、Zoom/Reset、Network Preview、Energy Compute、Report Export、关键区域可见、framework overlay absent、console clean、无水平溢出和 screenshot attachment。
- Playwright Chromium viewport `1280x720` 验证 active browser project 下 Report Export 写入 `exports/rxnflow-profile.png`、`.cdxml`、`.xlsx`，显示 persisted yes 和 `sha256:<64 hex>` checksum；无 console warning/error、无水平溢出。截图：`/tmp/rxnflow-export-persistence-desktop.png`。
- Playwright Chromium viewport `390x840` 验证窄屏 Report Export artifact list 与 download link 可用；无 console warning/error、无水平溢出。截图：`/tmp/rxnflow-export-persistence-mobile.png`。
- Report Export Verification 验证 fixture/local-http 路径：PNG/CDXML/XLSX 三个 artifact、3 个 Download link、CDXML `chemical/x-cdxml` MIME、XLSX spreadsheet MIME、fixture/真实 writer ids、`energy-table-v1` schema metadata、`chemdraw_cdxml_only` warning、browser-local persisted checksum、unsupported `cdx` 不写 repository、include-bytes-off 和 persistence failure warning。
- Browser 插件在 `http://127.0.0.1:5173/` 桌面中文界面验证 Report Export surface：artifact cards 为 3、download links 为 3、CDXML/XLSX data URL 前缀正确、`energy-table-v1` 和 `chemdraw_cdxml_only` 可见、Vite overlay 为 0、console clean、无水平溢出；窄屏交互因当前 in-app Browser 自动化不稳定，以 Playwright E2E `390x840` 为验收 fallback。
- 浏览器窄屏 viewport `390x840` 验证 Project Sidebar 和 locale switcher
- Browser 插件在 `http://127.0.0.1:5173/` 桌面 viewport `1280x900` 验证 Web Energy Semantics Controls：运行 Fixture、选择 `node-a`、通过 Node Composition Editor 增加 `object-b` coefficient 2、Apply 后 node card 显示 `object-a + 2*object-b`，选择 `thermochemistry:gibbs` 和 correction policy ids 后 Compute 显示 `profile-path-a-b-gibbs-thermochemistry-kcal_mol`，Energy Expression Details 显示 `系数 2` 与 `gibbs · thermochemistry`，页面无水平溢出且 console error 为 0。
- Browser 插件在窄屏 viewport `390x900` 验证同一状态下 composition rows 宽度 314px、energy options 单列 `314px`、policy controls 和 expression details 可见，`documentElement.scrollWidth=390`，无整体水平溢出。

桌面和窄屏验证均确认页面可用、无水平溢出；窄屏采用纵向堆叠布局。受当前 in-app Browser 自动化输入限制，浏览器内 create form 输入无法稳定自动填充；create flow 由 Testing Library component test 覆盖。
