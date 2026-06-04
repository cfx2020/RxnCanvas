---
doc_type: requirement
slug: web-workbench-shell
pitch: 打开浏览器就能看到 RxnFlow 的工作台雏形
status: current
last_reviewed: 2026-06-04
implemented_by:
  - web-workbench
tags: [web, workbench, local-first, shell-client, project-sidebar, project-files, raw-file-drop, parse-candidate-chooser, canvas-chemical-node, indexeddb, i18n, import-inbox, raw-inputs, object-registry, correction-entry, graph-canvas, graph-object-drop, graph-node-layout, graph-auto-layout, graph-edge-path-editing, graph-edge-label-editing, graph-editor-free-edge-drawing, graph-path-authoring, graph-editor-multiselect-keyboard, graph-viewport-controls, graph-editor-wheel-minimap, graph-editor-lightweight-history, graph-editor-workspace-persistence, node-composition, energy-semantics, energy-profile, pes-preview, energy-step-delta, energy-curve-interaction, report-export, report-preview, export-readiness, e2e, bridge-qa]
---

# 打开浏览器就进入 RxnFlow 工作台

## 用户故事

- 作为一个想先试 Web 方向的用户，我希望打开页面后直接看到工作台，而不是先看一页产品介绍。
- 作为一个准备继续做导入、对象、图谱和能量面板的人，我希望页面先有稳定的承载结构，而不是每个功能都临时决定放在哪里。
- 作为一个担心数据是否上云的人，我希望早期页面明确显示当前是本地优先状态，而不是误以为已经有云同步。
- 作为一个用 agent 协作开发的人，我希望前端命令入口和错误展示有固定形状，后续功能能沿着同一套交互继续接。
- 作为一个继续扩展 Web 面板的人，我希望页面读取的是统一的工作台状态投影，而不是每个组件自己从单个命令响应里拼领域状态。
- 作为一个开始使用 Web 工作台的人，我希望左侧已经是可操作的项目入口，可以看到 browser-local project list、新建、打开、保存状态和本地存储风险。
- 作为一个按工作区直觉使用 RxnFlow 的用户，我希望左侧能看到当前项目已经拥有的 raw files 和 export artifacts，而不是只看到一次性导入队列。
- 作为一个从本地文件夹快速找 log/out/xyz/extxyz 的用户，我希望本地文件入口只是 picker；文件被拖到画布使用后才进入当前项目，之后可保存或打包分享。
- 作为一个组装反应路径的用户，我希望能把外部单对象输出文件或项目内 raw file 直接拖到画布，让系统先保存入项目、解析登记、再在落点创建节点。
- 作为一个面对优化轨迹、多帧 extxyz 或多对象 MAPLE/Gaussian/ORCA 输出的用户，我希望系统不要自动把所有候选都扔到画布，而是在落点附近的候选选择器里让我手动选择一个或多个结构。
- 作为一个在画布上筛选结构的用户，我希望节点卡直接显示结构名、对象组成、方法、电荷自旋、可用能量、坐标摘要和 warning code，而不是点开右侧详情才能判断节点代表什么。
- 作为一个中文用户，我希望 Web 工作台能切换到简体中文，同时也保留英文界面，方便后续中英文材料和协作场景共存。
- 作为一个准备导入计算化学输出文件的用户，我希望工作台里先有导入收件箱，可以看到待导入文件、解析预览批次、warnings/errors 和确认登记入口。
- 作为一个在本机 Web 工作台试导入的用户，我希望 local-http 模式下选择的小文件能进入真实 Python parser preview，而不是只能看到 fixture 结果。
- 作为一个已经创建浏览器本地项目的用户，我希望导入预览时选中的原始输出文件能保存成项目内的 raw input anchor，而不是只存在于一次性的 preview payload 里。
- 作为一个登记了计算化学对象的用户，我希望右侧能看到已登记对象列表和详情，包括来源、分子式、电荷自旋、方法、能量 key、provenance、warnings 和校正项状态。
- 作为一个需要补充溶剂化、谐振或手动校正项的用户，我希望能在对象登记面板里给当前对象追加校正项，并立即看到 correction count/list 刷新。
- 作为一个开始组装反应路径的用户，我希望中间图谱画布已经能从已登记对象添加节点、连接节点、设置当前路径，并实时看到网络预览。
- 作为一个搭建反应图谱的用户，我希望能把已登记对象从对象面板拖入画布创建节点，而不是只能先选中对象再点添加按钮。
- 作为一个整理反应图谱布局的用户，我希望能直接拖动已有 graph node 调整位置，而不是只能接受默认节点排布。
- 作为一个整理稍复杂反应图谱的用户，我希望能一键自动整理当前节点布局，并在布局已经整齐时看到 no-op 状态。
- 作为一个整理反应图谱结构的用户，我希望能选中并删除不需要的节点或边，并让画布和网络预览同步显示删除后的结构诊断。
- 作为一个整理反应路径的用户，我希望能选中并删除不需要的 path，同时保留 path 上的节点和边。
- 作为一个整理反应路径的用户，我希望能对已有 path 的节点顺序做受控调整，并在确认后才更新 active path。
- 作为一个标注反应图谱的用户，我希望能选中已有 edge 后编辑它的 label，用来记录反应步骤、条件、催化剂或分叉说明，同时不误改边的起点和终点。
- 作为一个搭建反应路径的用户，我希望能从一个图谱节点直接拖线到另一个节点创建连接，而不是只能通过按钮式 Connect 流程。
- 作为一个按画布直觉串反应路径的用户，我希望拖线连接能在无歧义时自动创建或延长 active path，并在分叉或重复节点时提示我手动调整路径。
- 作为一个整理稍复杂反应图谱的用户，我希望能同时选中多个 node、edge 或 path，用一次删除操作处理当前选择，而不是逐个点选删除。
- 作为一个整理节点布局的用户，我希望能在画布里框选多个节点，并用方向键按网格微调它们的位置。
- 作为一个键盘操作频繁的用户，我希望 Delete/Backspace、Escape 和方向键只在图谱画布焦点内生效，不影响输入框里的文字编辑。
- 作为一个在较大反应图谱里编辑路径的用户，我希望能缩放、平移、fit 和 reset 图谱画布，同时节点坐标仍保持在稳定的 workspace 虚拟坐标里。
- 作为一个在较大反应图谱里导航的用户，我希望能用鼠标滚轮或触控板类输入围绕指针位置缩放，并用小地图快速跳到图谱其他区域，而不是只能反复点 toolbar 按钮。
- 作为一个频繁整理图谱的用户，我希望能撤销或重做最近一次布局、视口、选择或节点微调，而不是每次点错都手工调回去。
- 作为一个使用浏览器本地项目编辑图谱的用户，我希望显式保存后能恢复节点位置、画布视口、当前选中的节点/边/path 和 active path，而不是每次重新打开都丢失编辑上下文。
- 作为一个搭建反应路径的用户，我希望能在选中图谱节点后把节点组成编辑成 `A + 2B` 这类多对象表达，而不是只能用单个对象代表一个节点。
- 作为一个已经设置反应路径的用户，我希望能直接从当前 active path 计算相对能量，并看到结构名称、节点、相对能量、单位、缺失原因、warnings 和可交互曲线预览。
- 作为一个比较反应能垒和分步能量变化的用户，我希望右侧势能面能跟随 active path 自动刷新，并在表格和详情里显示相邻 step delta、missing reason 和 correction count。
- 作为一个需要核对能量来源的用户，我希望能在能量面板里看到每个 profile point 的组成项、校正项、单位换算贡献和缺失明细，而不是只看到最终相对能量数字。
- 作为一个浏览能量曲线的用户，我希望曲线点能显示有效、缺失、含校正和当前选中的状态，并且点开某个 point 时看到对应结构、节点、相对能量、表达式总量、组成项数量和校正项数量。
- 作为一个从能量曲线定位图谱的用户，我希望点击曲线点或表格行后，中间图谱画布能选中同一个 graph node，而不是手动在画布里重新找。
- 作为一个需要比较 electronic energy 和 thermochemistry 的用户，我希望能在能量面板里明确选择 energy channel 和来源 section，而不是只能手输一个模糊的 key。
- 作为一个需要管理校正项口径的用户，我希望能按 none/all/kinds/ids 选择 correction policy，而不是只有一个笼统的 include corrections 开关。
- 作为一个已经得到能量剖面的用户，我希望能从 Web 工作台直接导出 PNG、CDXML、XLSX、CSV 和 SVG artifacts，并在浏览器里看到导出结果、metadata、warnings 和可用下载入口。
- 作为一个导出报告前做检查的用户，我希望导出面板提前告诉我当前 profile 是否有 missing point、是否包含 correction marker、include bytes 是否关闭、当前结果是否会 browser-local persisted，以及 ChemDraw 当前只支持 CDXML 不支持 CDX。
- 作为一个导出报告前做总览的用户，我希望在 Report Export 面板里先看到 graph/profile summary、energy table、graph snapshot、artifact reuse 和 warnings 的预览状态，再决定是否执行导出。
- 作为一个使用浏览器本地项目的用户，我希望导出的 PNG、CDXML、XLSX、CSV 和 SVG artifacts 在当前 browser-local project 下有 `exports/...` 路径、persisted 状态和 checksum，而不是刷新页面后只剩一次性的下载链接。
- 作为一个继续迭代 Web 工作台的人，我希望有一条可重复的真实浏览器回归命令，能覆盖桌面/窄屏主流程、图谱编辑关键手势和布局健康，而不是每次靠临时脚本或人工目测。
- 作为一个继续推进 local-http bridge 的开发者，我希望 fixture E2E 和 local-http E2E 分开运行，既能保留不依赖 Python bridge 的默认 UI 回归，也能用独立命令验证真实 bridge 主链路。

## 为什么需要

RxnFlow 的核心流程已经能在无界面的状态下跑通，但用户很难从测试和命令行里感受到它会变成什么产品。没有 Web 工作台壳层时，后续导入面板、对象面板、图谱画布、能量曲线和导出面板也缺少共同的入口和布局骨架。

## 怎么解决

系统提供一个浏览器工作台雏形：页面打开后直接进入项目、导入收件箱、图谱和命令/能量区域，先用 fixture 命令证明前端能接收结构化结果、读取 `workbench.snapshot`、更新状态并显示错误。当前 Shell runtime 默认为 fixture；如果开发者设置 `VITE_RXNFLOW_SHELL_TRANSPORT=local-http`，Web ShellClient 会通过 `http-api` transport 调用本机 `rxnflow.local_bridge`，顶栏用 runtime indicator 显示 `Runtime Fixture` 或 `Runtime Local HTTP`，避免用户混淆演示数据和本地 Python bridge。左侧 Project Sidebar 已接入 Browser Project Repository，能列出 browser-local projects，新建或打开 project，保存 `.rxnflow/manifest.json` 与 `.rxnflow/state/*.json` 真实 Project Content files，显式 Open Bridge / Save Bridge Session，并展示 local-only、IndexedDB backend、persistence、validation、bridge、checksum 和 repository error。中间区域新增 Import Inbox，能接收浏览器选择文件的 metadata 和可选 `File` 引用；fixture runtime 下继续展示 fixture `import.preview` batch/items，local-http runtime 下优先把小文件编码为 inline bytes 送入真实 Python `import.preview`，展示 parser_id、object_count、raw resource、warnings/errors，并通过 `import.register_all` response 展示 registered object ids 和更新工作台对象计数。若当前有 active browser project 且 preview payload 校验通过，Import Inbox 会先把 selected `File` 写入 Browser Project Repository 的 `inputs/raw/{sha12}-{safeName}`，并把 `raw_file` resource merge 进 `.rxnflow/manifest.json`；selected file list 同时显示 persisted/skipped/error、raw id/path/checksum 或 repository error code/target。中间图谱区域新增 Graph Canvas MVP，能展示 workspace graph nodes/edges/paths、active path 和 network preview，并通过 click-driven 命令从已登记 active object 添加 species node、连接两个节点、设置 `path-web-main`。Object Registry 中的已登记对象也可作为 graph drag source 拖入画布，drop 后仍通过 `workspace.add_node(position)` 创建节点，最终可见节点来自 ShellResponse workspace projection。已有 graph node 可用 pointer/mouse 拖动重新布局，release 后通过 `workspace.move_node(node_id, position)` 更新，位置经过固定虚拟画布和 grid 的 snap/clamp，最终可见位置仍来自 ShellResponse workspace projection；拖动中的 pointer state 只属于前端 UI。用户也可以点击 Apply Layout，由 Web helper 从当前 `GraphSummary` 生成确定性 layout plan：有 directed edges 时使用 left-to-right layered layout，无 edge 或 cycle 时使用 compact grid fallback 和非阻断 warning；WorkbenchShell 按稳定 node id 顺序逐个调用 `workspace.move_node`，全部 move 成功后才用可选 `workspace.set_viewport` fit 当前布局，第二次布局已一致时显示 no-op 而不重复发 move。layout plan、warning 和 status 都是 UI-only，不写 Project Content、Browser Project Repository、localStorage 或 ShellResponse。Graph Canvas 现在支持选中 edge、node 或 path 后执行 Delete Selected：前端只发送 `workspace.remove(node_ids?/edge_ids?/path_ids?)`，删除 node 后相关 edge/path cascade 和 disconnected diagnostics 都来自 ShellResponse workspace projection；删除 path 只移除 ReactionPath，不删除 path 上的 nodes/edges，active path 与 selection 由 ShellResponse 修剪。选择 node、edge 或 path 时，普通点击会替换 selection，Shift-click 会 add/toggle 当前 item 并允许 mixed selection；select mode 下从空白画布拖动会显示 rubber-band overlay，release 后把中心点落在矩形内的 node ids 发送为 `workspace.select`，drag 过程中不发送 shell command。Delete/Backspace 快捷键复用当前 selection 调用 `workspace.remove`，empty selection 时不发 command；Escape 调用空 `workspace.select` 并清理 pending edge / rubber-band draft；方向键只对 selected node ids 按 `20` grid step 顺序调用既有 `workspace.move_node`，edge/path selection 本身不会被 nudge。图谱快捷键只在 Graph Canvas 焦点范围内生效，input/textarea/select/contenteditable 内按键不触发 graph command。选中 edge 后，Network Preview 侧区会显示 Edge Label Draft；用户输入时只改临时 draft，不直接 patch graph，点击 Apply 后才调用 `workspace.update_edge(edge_id, label)`，成功后由 ShellResponse workspace projection 刷新 edge label、edge hitbox 可访问名称和 selected edge detail。空白 label 会归一化为 `null`，Clear 用于清空 label，Reset 只把草稿还原为当前 projection；该命令不修改 from_node/to_node，也不触发 energy 或 report 重新计算。用户也可以从节点的 Edge Connect Handle 发起 Direct Edge Gesture：pointer drag 期间 Web 只维护 `source="pointer"` 的 Pending Edge Draft、pointer graph position 和可选 target node，GraphEdgeLayer 显示 transient preview line；release 到合法且不同的 target node 时，WorkbenchShell 复用共享 `connectGraphNodes` 调用既有 `workspace.connect(from_node_id, to_node_id)`，成功后新 edge 仍只从 ShellResponse workspace projection 出现。release 到空白区域、同一个 source node、缺失 target 或 stale source 时只清理 pending draft，不发送 command；创建 edge 不弹 label prompt，后续标注仍选中 edge 使用 Edge Label Draft。Path list 支持选择 existing path，并在 Web 侧创建 Path Order Draft；用户上移/下移节点时只改临时 draft，点击 Apply Path Order 后才复用 `workspace.set_path(path_id, node_ids)` 更新 active path。Graph Canvas 还提供 Pan、Zoom In/Out、Fit、Reset、graph surface wheel zoom、ctrl/meta wheel pinch-like zoom 和 Graph Minimap navigation；前端用 `graphViewport` helper 做 `600 x 360` 虚拟画布下的坐标换算、zoom clamp、CSS transform、fit/pan/reset、anchor-preserving wheel zoom 和 minimap point-to-viewport mapping，提交 `workspace.set_viewport` 后只从 ShellResponse `workspace.viewport` 更新可见 viewport，object drop 和 node drag release 仍提交 workspace 虚拟坐标。Minimap 显示 node dots、当前 viewport window 和 zoom percent；拖动 minimap window 时只显示临时草稿，release 后才发送一次 viewport command。Graph Canvas 另有轻量撤销/重做：用户可用 Undo/Redo buttons，或在图谱焦点内使用 `Ctrl/Cmd+Z`、`Ctrl/Cmd+Shift+Z`、`Ctrl+Y`，撤销/重做最近的 layout、viewport、selection 或 selected node nudge。该 history 只存在于当前 Web runtime，最多保留 20 条 undo entry；回放仍调用既有 workspace 命令，失败或引用已失效时不会移动历史记录。选中图谱节点后，Network Preview 侧区会显示节点组成编辑器；用户可以把一个节点改成多个对象和系数组成，点击应用后才提交更新，成功后画布节点和后续能量表达式都以返回的工作区状态为准；multi/mixed selection 下 Node Composition、Edge Label 和 Path Order Draft 都不会初始化可编辑草稿。显式 Save Bridge Session 会把当前 `ReactionGraph.nodes[].position`、`ReactionGraph.edges[].label`、`WorkspaceSnapshot.viewport`、`WorkspaceSnapshot.selection` 和 `active_path_id` 写入 Project Content files；后续 Open Bridge / restored snapshot 可恢复 node position、edge label、viewport、selected node/edge/path 和 active path，但不会恢复 Graph Editor History stack。右侧 Object Registry Panel 展示 `WorkbenchDomainState.objects` 中的已登记对象，支持选择对象查看 id/label/source、formula、charge、spin、method、energy keys、thermochemistry keys、provenance、warnings、correction count/list，并提供 Correction Entry Form 追加 manual/solvation/resonance correction；表单只调用 `registry.apply_correction` Shell command，成功后用 ShellResponse object summary 更新对象，失败时显示 error code/message/target，不在前端本地伪造 correction。对象选择仍只存在于前端 UI，不替代 Workspace Selection。右侧 Energy Profile Panel 可跟随 active path 调用 `energy.compute`，展示 profile id、path、baseline、point count、relative energy table、missing reason、warnings、Energy Expression Details 和交互式 SVG 曲线；expression details 只读取 ShellResponse profile projection 中的 terms、corrections、total 和 missing diagnostics。曲线点和表格行会显示有效、缺失、含校正和 selected 状态，hover/focus/click 会更新 Curve Point Detail；点击曲线点或表格行时，前端只通过 `workspace.select(node_ids=[nodeId])` 联动 Graph Canvas 选中节点，不改 graph/path/profile，并会清空当前 Graph Editor History 以避免外部联动选择被误撤销。用户可以从已登记对象的能量通道里选择 electronic/thermochemistry 等 key/source，也可以保留自定义 key 输入；校正项口径可选 none、all、按类型或按 ID。output unit、energy key/source、baseline node、curve point state 和 correction policy 都只是命令参数或 UI-only state，不在前端计算公式或重算 expression。右侧 Report Export Panel 默认先显示 Report Preview Mode，从当前 workspace/profile/artifacts/warnings、Report Export options 和 active browser project state 派生 graph/profile summary、energy diagram / energy table / graph snapshot readiness、artifact reuse list 和 warnings；Preview 不调用 shell、不保存、不生成 artifact bytes。切到 Export mode 后可基于当前 active profile 调用 `export.profile`，选择 PNG/CDXML/XLSX/CSV/SVG、include bytes、basename 和 title，并展示 Export Readiness、runtime artifact id、format、path、inline/persisted 状态、checksum、metadata、warnings 和 inline download link。Export Readiness 只解释当前 profile/options/browser project state，提示 missing point、correction marker、include bytes、browser-local persistence 和 CDXML-only/ChemDraw 边界，不阻止导出、不改写 shell args。若当前有 active browser project，Web 会把带 inline bytes 的导出 artifact 写入 Browser Project Repository 的 `exports/{basename}.{format}`，同步 `export-artifacts-v1` index 并刷新 Project Sidebar validation。Web 工程提供两条真实浏览器回归入口：`npm run test:e2e` 覆盖默认 fixture desktop/narrow workbench journey、desktop graph editor matrix、narrow graph advanced controls、framework overlay absent、console clean、无水平溢出和截图/trace/report 产物边界；graph editor matrix 覆盖 registered object drag/drop、node drag、Apply Layout + history replay、path delete、edge label edit、direct edge drawing、rubber-band multi-select delete、keyboard nudge + undo/redo、path reorder、viewport controls、wheel/minimap navigation 和 Save/Open Bridge restore；narrow advanced controls 验证 layout/history/viewport/minimap、Network Preview、Path list 和 Edge Label Editor 在窄屏可达。`npm run test:e2e:local-http` 独立启动本地 Python bridge 与 local-http Vite server，只验证 runtime badge、bridge fixture snapshot、小文件 inline parser preview、Project Content open/save bridge、energy compute、export persistence 和 bundle roundtrip 主链路，不复制复杂图谱手势矩阵；local-http bridge 解释器可用 `RXNFLOW_E2E_PYTHON` 显式指定，否则优先跟随 `CONDA_PREFIX/bin/python3`。顶栏提供语言切换，当前支持 `zh-CN` 简体中文和 `en-US` 英文；默认按浏览器语言选择，手动偏好只保存在浏览器本地。这个壳层给后续真实导入、对象、画布、能量和导出功能预留位置，同时明确当前没有云同步。

当前 workspace-first 主流程在左侧新增 Project Files Panel：它只展示当前 browser-local project 已拥有的 `inputs/raw/...` 和 `exports/...` 文件，raw file row 可拖到 Graph Canvas，export artifact row 只展示。外部浏览器 `File` 拖入画布时，WorkbenchShell 会先把文件写入当前项目并合并 manifest raw resource，再调用 `import.preview`；项目内 raw file 再次拖入画布时复用已有 bytes，不重复写 raw object。单对象 preview 会自动 register 并按落点调用 `workspace.add_node`，画布节点仍只来自 ShellResponse workspace projection；多对象或多帧 preview 会在落点附近显示 Parse Candidate Chooser，用户可以多选候选，确认后通过 `import.register_selection` 登记指定 object indices，并按选择顺序在落点附近创建 stack graph nodes。Canvas Chemical Node 会从 ShellResponse 的 graph/object summaries 派生结构名、object ids / composition、formula、charge/spin、method、display energy、coordinate preview 和 warning code，不新增 core graph schema、不写 Project Content、不做前端能量计算或分子图布局。raw persistence、preview、register selection/register all 或 add-node 任一步失败都会停止后续步骤并显示 structured error code/target；取消候选选择不会登记对象或创建节点。

## 边界

- 它还不是完整 Web 产品，只是第一版工作台壳层和项目侧边栏。
- 它不负责 browser_storage adapter、完整图谱编辑、高级能量曲线编辑、组合报告 composer、bundle IO 或云同步。
- 它不提供账号、权限、云存储、跨设备同步或多人协作。
- 当前页面需要通过本地开发服务预览，不是可双击打开的独立静态页面。
- 当前视觉风格不是长期定稿；后续可以替换配色、组件库、密度和面板细节。
- 当前 Workbench Snapshot 只读，不是项目保存机制；Web Project Sidebar 保存 Project Content files，显式 Save Bridge Session 才通过 `project.save_content(include_content_files=true)` 把当前 core session 写回 Browser Project Repository。
- 当前 Project Sidebar 的 bundle import/export 入口只是 disabled / unavailable 状态，不触发 file picker、download 或 `.rxnflow.zip` IO。
- 当前 Project Files Panel 展示的是项目内文件，不是本地文件夹浏览器；浏览器 file/folder picker 只是导入入口，不作为长期项目权威。
- 当前 i18n 只覆盖 Web 工作台和项目侧边栏主文案，不翻译项目名、projectRef、checksum、错误 code/target、文件名或底层错误 message。
- 当前语言偏好不是账号设置，也不写入 Project Content；清浏览器数据会丢失手动选择。
- 当前 Import Inbox 使用 fixture transport 验证 Web UI / ShellResponse 投影闭环；local-http runtime 可把小浏览器文件作为 inline bytes 送入 Python parser preview。session 没有 core project_path 时使用 Temporary Preview Project，不把 browser-local project ref 当作 Python filesystem path。
- 当前 Import Inbox 在 active browser project 下会把 preview payload 校验通过的 selected browser `File` 保存为 Browser Raw Input Object，并在 manifest 中记录 raw resource anchor；这只是 browser-local project portability anchor，不自动确认导入、不登记 ChemicalObject、不调用 Open Bridge / Save Bridge Session，也不上传云端。
- 当前 Import Inbox 不声明真实 Gaussian/ORCA/MAPLE/XYZ/extxyz 完整支持，只原样展示 shell/parser 返回的 parser metadata、warnings 和 errors。
- 当前 Import Inbox 不实现大文件 chunking、OPFS payload store、Worker pool、browser_storage adapter 或云上传；inline bytes 超限时显示 `payload_too_large`，不读取 raw bytes、不写 `inputs/raw/...`、不发 shell command。
- 当前 Object Registry Panel 是对象 summary 面板，不新增/编辑/删除 ChemicalObject，不展示完整 geometry；Object Summary Projection 可带 `display_energy` 和 `coordinate_preview` 供画布节点快速扫描，但不替代 Energy Profile Panel 或完整结构查看器。
- 当前 Correction Entry Form 只追加 manual/solvation/resonance correction，不实现 correction 编辑、删除、排序、批量导入、自动推荐校正数值或 undo/redo；它只通过 ShellClient 调用 `registry.apply_correction`，不在前端直接调用 `ChemicalRegistry.apply_correction`，也不自动保存 Project Content。
- 当前对象选择是前端 UI-only 状态，不写入 Project Content，不替代 Workspace Selection；已登记对象可以拖入画布创建节点。pending/failed import item、raw resource 和 parser preview item 不能直接拖成 graph node；浏览器文件和项目内 raw file 只能走 Raw File Drop pipeline。
- 当前 Raw File Drop 对 `object_count === 1` 的 preview 自动登记并创建一个 graph node；多对象、多帧和 path-family 文件不会自动创建全部 graph nodes，必须先显示候选选择器，用户确认后才登记选择对象并创建对应节点。
- 当前 Graph Canvas 支持已登记对象拖入画布创建节点、raw file 多候选选择器、Canvas Chemical Node 富摘要、click-driven 备用路径、从节点 Edge Connect Handle 直接拖线到另一个节点创建 edge、已有节点基础拖动布局、一键自动布局、普通点击/Shift-click 多选 node/edge/path、select mode 空白画布 rubber-band 框选 nodes、Delete Selected 与 Delete/Backspace 删除当前 selection、Escape 清空 selection、方向键按网格微调 selected nodes、selected node composition 编辑、selected edge label draft、existing path 的 Path Order Draft、Pan/Zoom/Fit/Reset/wheel/minimap viewport controls，以及 layout/viewport/selection/selected node nudge 的 runtime-only Undo/Redo；不实现碰撞避让、edge rerouting、label collision avoidance、缩放/平移自动持久化、删除撤销、add/connect/path order/edge label/composition 撤销、跨 reload history、持久化 history、edge/path nudge、edge/path rubber-band hit testing、viewport auto persistence、惯性滚动、多指 PointerEvent pinch、persistent minimap preference、edge endpoint 重连、结构化反应条件编辑、2D/3D 分子渲染、自动反应配平、元素守恒或电荷守恒校验。
- 当前 Path Authoring 只在 `workspace.connect` 成功后做无歧义 active path 创建或延长：无 active path 时创建 `path-web-main=[from,to]`，tail/head 匹配时 append/prepend；分叉、内部连接、重复节点、stale path 或 no-op 不发送 `workspace.set_path`，只提示用户继续用 Path Order Draft 手动整理。
- 当前 Graph Canvas 不直接保存项目内容；图谱变化只来自 ShellClient 返回的 workspace projection，保存仍由 Project Sidebar 的显式 Save Bridge Session 触发。
- 当前 path delete 不删除 nodes/edges，不删除或重算 EnergyProfile，不自动保存 Project Content 或 Browser Project Repository；它只通过 `workspace.remove(path_ids?)` 更新 workspace projection。
- 当前 Graph Canvas 的 node/edge/path selection 是 Workspace Selection projection，可随显式 Save Bridge Session / Open Bridge 保存和恢复；rubber-band draft、Path Order Draft、hover、dragging、edge hitbox、pending edge、layout plan、layout warnings、layout applying/no-op status、viewport intent、transient pan drag、surface DOM size、fit 中间值、wheel delta、minimap geometry、minimap drag draft、keyboard focus intent、toolbar pressed state、Graph Editor History stack 和 Object Registry active object 都是 UI-only。它们不写 Project Content、Browser Project Repository、localStorage 或 ShellResponse。Direct Edge Gesture 的 pending preview 只在 release 前存在，不持久化、不自动保存、不产生 label prompt。viewport、selection、layout move、wheel/minimap viewport navigation、runtime history replay 和 selected node nudge 成功提交后只以 ShellResponse workspace projection 为权威状态。
- 当前不新增 Project Content schema、browser-local graph layout schema、localStorage graph persistence、自动保存、云同步或账号系统；恢复图谱布局/视口/选择只复用现有 `reaction-graphs-v1` 和 `workspaces-v1` content files。
- 当前 Energy Profile Panel 可经 fixture transport 或 local-http transport 调用 `energy.compute`；Project Content bridge 已可保存/恢复 session content files，Report Export Panel 已可把 inline artifacts 写入 active browser project 的 `exports/...`。
- 当前 Energy Profile Panel 可选择来自对象摘要的 energy channel、手输自定义 energy key，并选择 none/all/kinds/ids correction policy；它不在前端重新计算相对能量、校正项、expression 或单位换算，显示值、warnings、missing reason、curve point marker 和 expression details 都来自 ShellResponse profile projection。
- 当前 Energy Profile Panel 会在 active path projection 或能量选项变化时按 signature 自动触发一次 `energy.compute`，签名不变不重复自动 compute；手动 Compute 仍按当前 path/options 强制重算。
- 当前 PES Preview 表格和详情显示 step delta；该值只从相邻两个有效 relative energy 值派生，第一点或任一相邻 missing 点保持空值，不补 0。correction count 只来自 `point.expression.corrections.length`。
- 当前 Energy Profile Panel 的曲线点详情和 active/pinned point 是 UI-only 状态；不会保存到 Project Content、Browser Project Repository 或 localStorage。missing point 不补 0、不连入有效 polyline；correction marker 只基于 `expression.corrections.length`。
- 当前 Energy Profile Panel 点击曲线点或表格行只通过 `workspace.select` 联动 Graph Canvas selected node，不直接修改 graph/path/profile 或节点组成。
- 当前 Energy Profile Panel 不直接保存 profile，也不生成 PNG/CDXML/XLSX/CSV/SVG artifact；profile 持久化由显式 Save Bridge Session 将当前 session content 写回 Browser Project Repository。
- 当前 Report Export Panel 只处理 ShellResponse 返回的 runtime artifacts；active browser project 下会写 Browser Project Repository `exports/...` object 和 `export-artifacts-v1` browser-local index，并显示 persisted path 与 checksum，但不创建 Python filesystem artifact，也不自动调用 Save Bridge Session。
- 当前 Report Export Panel 显示 Export Readiness 静态摘要；missing point、include bytes 关闭、没有 active browser project 和 CDXML-only 都只是导出前提示，不改变导出按钮可用性和 `export.profile` 行为。
- 当前 Report Export Panel 不在前端生成 PNG/CDXML/XLSX/CSV/SVG bytes；download link 只在 `bytes_base64` 存在时启用，include bytes 关闭时只显示 artifact metadata 和不可下载状态。当前 fixture/local-http 回归已固定 CDXML/XLSX/CSV/SVG download MIME、writer metadata、`energy-table-v1`/graph snapshot metadata 和 browser-local checksum。
- 当前 Report Export Panel 不实现 file picker、File System Access API、OPFS、JSZip、云存储、账号系统、独立报告 writer、ChemDraw 编辑器、CDX、PDF 或 PPTX；Preview 只扫描已有 projection 和 artifact metadata，不保存、不生成 bytes。
- 当前 Report Export Panel 的 artifact id、format、path、metadata key/value、warning/error code 原样显示，不进入 i18n 翻译。用户操作说明见 `docs/user/report-export-artifacts.md`。
- 当前 Graph Canvas 使用 ShellClient workspace commands 验证 UI 编排；默认 fixture transport，local-http 模式可调用本地 Python bridge；项目内容保存/恢复通过 Project Sidebar 的显式 Open Bridge / Save Bridge Session 完成。
- 当前 E2E QA Harness 分为 fixture flow 和 local-http bridge smoke。默认 `npm run test:e2e` 不接真实 Python bridge，负责桌面/窄屏 UI 编排、advanced graph editor matrix、narrow advanced controls、console clean 和 no horizontal overflow；`npm run test:e2e:local-http` 只验证本机 bridge 主链路、小文件 parser preview、energy compute、report export writer projection 和 bundle roundtrip，不复制复杂 graph gesture matrix，也不声明真实 Gaussian/ORCA/MAPLE/XYZ/extxyz 完整解析支持。
- 当前 E2E screenshot、trace 和 report 是测试产物，写入 git ignored 的 Playwright output，不进入 Project Content、Browser Project Repository 或报告导出索引。
