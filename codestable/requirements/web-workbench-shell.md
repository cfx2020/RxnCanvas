---
doc_type: requirement
slug: web-workbench-shell
pitch: 打开浏览器就能看到 RxnFlow 的工作台雏形
status: current
last_reviewed: 2026-05-22
implemented_by:
  - web-workbench
tags: [web, workbench, local-first, shell-client, project-sidebar, indexeddb, i18n, import-inbox, object-registry, correction-entry, graph-canvas, graph-object-drop, graph-node-layout, graph-edge-path-editing, graph-viewport-controls, graph-editor-workspace-persistence, node-composition, energy-semantics, energy-profile, report-export, e2e, bridge-qa]
---

# 打开浏览器就进入 RxnFlow 工作台

## 用户故事

- 作为一个想先试 Web 方向的用户，我希望打开页面后直接看到工作台，而不是先看一页产品介绍。
- 作为一个准备继续做导入、对象、图谱和能量面板的人，我希望页面先有稳定的承载结构，而不是每个功能都临时决定放在哪里。
- 作为一个担心数据是否上云的人，我希望早期页面明确显示当前是本地优先状态，而不是误以为已经有云同步。
- 作为一个用 agent 协作开发的人，我希望前端命令入口和错误展示有固定形状，后续功能能沿着同一套交互继续接。
- 作为一个继续扩展 Web 面板的人，我希望页面读取的是统一的工作台状态投影，而不是每个组件自己从单个命令响应里拼领域状态。
- 作为一个开始使用 Web 工作台的人，我希望左侧已经是可操作的项目入口，可以看到 browser-local project list、新建、打开、保存状态和本地存储风险。
- 作为一个中文用户，我希望 Web 工作台能切换到简体中文，同时也保留英文界面，方便后续中英文材料和协作场景共存。
- 作为一个准备导入计算化学输出文件的用户，我希望工作台里先有导入收件箱，可以看到待导入文件、解析预览批次、warnings/errors 和确认登记入口。
- 作为一个在本机 Web 工作台试导入的用户，我希望 local-http 模式下选择的小文件能进入真实 Python parser preview，而不是只能看到 fixture 结果。
- 作为一个登记了计算化学对象的用户，我希望右侧能看到已登记对象列表和详情，包括来源、分子式、电荷自旋、方法、能量 key、provenance、warnings 和校正项状态。
- 作为一个需要补充溶剂化、谐振或手动校正项的用户，我希望能在对象登记面板里给当前对象追加校正项，并立即看到 correction count/list 刷新。
- 作为一个开始组装反应路径的用户，我希望中间图谱画布已经能从已登记对象添加节点、连接节点、设置当前路径，并实时看到网络预览。
- 作为一个搭建反应图谱的用户，我希望能把已登记对象从对象面板拖入画布创建节点，而不是只能先选中对象再点添加按钮。
- 作为一个整理反应图谱布局的用户，我希望能直接拖动已有 graph node 调整位置，而不是只能接受默认节点排布。
- 作为一个整理反应图谱结构的用户，我希望能选中并删除不需要的节点或边，并让画布和网络预览同步显示删除后的结构诊断。
- 作为一个整理反应路径的用户，我希望能对已有 path 的节点顺序做受控调整，并在确认后才更新 active path。
- 作为一个在较大反应图谱里编辑路径的用户，我希望能缩放、平移、fit 和 reset 图谱画布，同时节点坐标仍保持在稳定的 workspace 虚拟坐标里。
- 作为一个使用浏览器本地项目编辑图谱的用户，我希望显式保存后能恢复节点位置、画布视口、当前选中的节点/边/path 和 active path，而不是每次重新打开都丢失编辑上下文。
- 作为一个搭建反应路径的用户，我希望能在选中图谱节点后把节点组成编辑成 `A + 2B` 这类多对象表达，而不是只能用单个对象代表一个节点。
- 作为一个已经设置反应路径的用户，我希望能直接从当前 active path 计算相对能量，并看到结构名称、节点、相对能量、单位、缺失原因、warnings 和基础曲线预览。
- 作为一个需要核对能量来源的用户，我希望能在能量面板里看到每个 profile point 的组成项、校正项、单位换算贡献和缺失明细，而不是只看到最终相对能量数字。
- 作为一个需要比较 electronic energy 和 thermochemistry 的用户，我希望能在能量面板里明确选择 energy channel 和来源 section，而不是只能手输一个模糊的 key。
- 作为一个需要管理校正项口径的用户，我希望能按 none/all/kinds/ids 选择 correction policy，而不是只有一个笼统的 include corrections 开关。
- 作为一个已经得到能量剖面的用户，我希望能从 Web 工作台直接导出 PNG、CDXML 和 XLSX artifacts，并在浏览器里看到导出结果、metadata、warnings 和可用下载入口。
- 作为一个使用浏览器本地项目的用户，我希望导出的 PNG、CDXML 和 XLSX artifacts 在当前 browser-local project 下有 `exports/...` 路径、persisted 状态和 checksum，而不是刷新页面后只剩一次性的下载链接。
- 作为一个继续迭代 Web 工作台的人，我希望有一条可重复的真实浏览器回归命令，能覆盖桌面/窄屏主流程、图谱编辑关键手势和布局健康，而不是每次靠临时脚本或人工目测。
- 作为一个继续推进 local-http bridge 的开发者，我希望 fixture E2E 和 local-http E2E 分开运行，既能保留不依赖 Python bridge 的默认 UI 回归，也能用独立命令验证真实 bridge 主链路。

## 为什么需要

RxnFlow 的核心流程已经能在无界面的状态下跑通，但用户很难从测试和命令行里感受到它会变成什么产品。没有 Web 工作台壳层时，后续导入面板、对象面板、图谱画布、能量曲线和导出面板也缺少共同的入口和布局骨架。

## 怎么解决

系统提供一个浏览器工作台雏形：页面打开后直接进入项目、导入收件箱、图谱和命令/能量区域，先用 fixture 命令证明前端能接收结构化结果、读取 `workbench.snapshot`、更新状态并显示错误。当前 Shell runtime 默认为 fixture；如果开发者设置 `VITE_RXNFLOW_SHELL_TRANSPORT=local-http`，Web ShellClient 会通过 `http-api` transport 调用本机 `rxnflow.local_bridge`，顶栏用 runtime indicator 显示 `Runtime Fixture` 或 `Runtime Local HTTP`，避免用户混淆演示数据和本地 Python bridge。左侧 Project Sidebar 已接入 Browser Project Repository，能列出 browser-local projects，新建或打开 project，保存 `.rxnflow/manifest.json` 与 `.rxnflow/state/*.json` 真实 Project Content files，显式 Open Bridge / Save Bridge Session，并展示 local-only、IndexedDB backend、persistence、validation、bridge、checksum 和 repository error。中间区域新增 Import Inbox，能接收浏览器选择文件的 metadata 和可选 `File` 引用；fixture runtime 下继续展示 fixture `import.preview` batch/items，local-http runtime 下优先把小文件编码为 inline bytes 送入真实 Python `import.preview`，展示 parser_id、object_count、raw resource、warnings/errors，并通过 `import.register_all` response 展示 registered object ids 和更新工作台对象计数。中间图谱区域新增 Graph Canvas MVP，能展示 workspace graph nodes/edges/paths、active path 和 network preview，并通过 click-driven 命令从已登记 active object 添加 species node、连接两个节点、设置 `path-web-main`。Object Registry 中的已登记对象也可作为 graph drag source 拖入画布，drop 后仍通过 `workspace.add_node(position)` 创建节点，最终可见节点来自 ShellResponse workspace projection。已有 graph node 可用 pointer/mouse 拖动重新布局，release 后通过 `workspace.move_node(node_id, position)` 更新，位置经过固定虚拟画布和 grid 的 snap/clamp，最终可见位置仍来自 ShellResponse workspace projection；拖动中的 pointer state 只属于前端 UI。Graph Canvas 现在也支持选中 edge 或 node 后执行 Delete Selected：前端只发送 `workspace.remove(node_ids?/edge_ids?)`，删除 node 后相关 edge/path cascade 和 disconnected diagnostics 都来自 ShellResponse workspace projection。选择 node、edge 或 path 时，前端发送 `workspace.select(selection={...})`，并从 `WorkspaceSummary.selection` 恢复当前选择；未知引用由 shell 返回结构化 `graph_invalid`，删除 node/edge 后失效选择会被修剪。Path list 支持选择 existing path，并在 Web 侧创建 Path Order Draft；用户上移/下移节点时只改临时 draft，点击 Apply Path Order 后才复用 `workspace.set_path(path_id, node_ids)` 更新 active path。Graph Canvas 还提供 Pan、Zoom In/Out、Fit 和 Reset viewport controls；前端用 `graphViewport` helper 做 `600 x 360` 虚拟画布下的坐标换算、zoom clamp、CSS transform 和 fit/pan/reset intent，提交 `workspace.set_viewport` 后只从 ShellResponse `workspace.viewport` 更新可见 viewport，object drop 和 node drag release 仍提交 workspace 虚拟坐标。选中图谱节点后，Network Preview 侧区会显示节点组成编辑器；用户可以把一个节点改成多个对象和系数组成，点击应用后才提交更新，成功后画布节点和后续能量表达式都以返回的工作区状态为准。显式 Save Bridge Session 会把当前 `ReactionGraph.nodes[].position`、`WorkspaceSnapshot.viewport`、`WorkspaceSnapshot.selection` 和 `active_path_id` 写入 Project Content files；后续 Open Bridge / restored snapshot 可恢复 node position、viewport、selected node/edge/path 和 active path。右侧 Object Registry Panel 展示 `WorkbenchDomainState.objects` 中的已登记对象，支持选择对象查看 id/label/source、formula、charge、spin、method、energy keys、thermochemistry keys、provenance、warnings、correction count/list，并提供 Correction Entry Form 追加 manual/solvation/resonance correction；表单只调用 `registry.apply_correction` Shell command，成功后用 ShellResponse object summary 更新对象，失败时显示 error code/message/target，不在前端本地伪造 correction。对象选择仍只存在于前端 UI，不替代 Workspace Selection。右侧 Energy Profile Panel 可跟随 active path 调用 `energy.compute`，展示 profile id、path、baseline、point count、relative energy table、missing reason、warnings、Energy Expression Details 和基础 SVG 曲线；expression details 只读取 ShellResponse profile projection 中的 terms、corrections、total 和 missing diagnostics。用户可以从已登记对象的能量通道里选择 electronic/thermochemistry 等 key/source，也可以保留自定义 key 输入；校正项口径可选 none、all、按类型或按 ID。output unit、energy key/source、baseline node 和 correction policy 都只是命令参数，不在前端计算公式或重算 expression。右侧 Report Export Panel 可基于当前 active profile 调用 `export.profile`，选择 PNG/CDXML/XLSX、include bytes、basename 和 title，并展示 runtime artifact id、format、path、inline/persisted 状态、checksum、metadata、warnings 和 inline download link。若当前有 active browser project，Web 会把带 inline bytes 的导出 artifact 写入 Browser Project Repository 的 `exports/{basename}.{format}`，同步 `export-artifacts-v1` index 并刷新 Project Sidebar validation。Web 工程提供两条真实浏览器回归入口：`npm run test:e2e` 覆盖默认 fixture desktop/narrow workbench journey、desktop graph editor matrix、framework overlay absent、console clean、无水平溢出和截图/trace/report 产物边界；graph editor matrix 覆盖 registered object drag/drop、node drag、edge delete、path reorder、viewport controls 和 Save/Open Bridge restore。`npm run test:e2e:local-http` 独立启动本地 Python bridge 与 local-http Vite server，验证 runtime badge、bridge fixture snapshot、小文件 inline parser preview、Project Content open/save bridge、energy compute 和 export persistence；local-http bridge 解释器可用 `RXNFLOW_E2E_PYTHON` 显式指定，否则优先跟随 `CONDA_PREFIX/bin/python3`。顶栏提供语言切换，当前支持 `zh-CN` 简体中文和 `en-US` 英文；默认按浏览器语言选择，手动偏好只保存在浏览器本地。这个壳层给后续真实导入、对象、画布、能量和导出功能预留位置，同时明确当前没有云同步。

## 边界

- 它还不是完整 Web 产品，只是第一版工作台壳层和项目侧边栏。
- 它不负责 browser_storage adapter、完整图谱编辑、高级能量曲线编辑、报告预览、bundle IO 或云同步。
- 它不提供账号、权限、云存储、跨设备同步或多人协作。
- 当前页面需要通过本地开发服务预览，不是可双击打开的独立静态页面。
- 当前视觉风格不是长期定稿；后续可以替换配色、组件库、密度和面板细节。
- 当前 Workbench Snapshot 只读，不是项目保存机制；Web Project Sidebar 保存 Project Content files，显式 Save Bridge Session 才通过 `project.save_content(include_content_files=true)` 把当前 core session 写回 Browser Project Repository。
- 当前 Project Sidebar 的 bundle import/export 入口只是 disabled / unavailable 状态，不触发 file picker、download 或 `.rxnflow.zip` IO。
- 当前 i18n 只覆盖 Web 工作台和项目侧边栏主文案，不翻译项目名、projectRef、checksum、错误 code/target、文件名或底层错误 message。
- 当前语言偏好不是账号设置，也不写入 Project Content；清浏览器数据会丢失手动选择。
- 当前 Import Inbox 使用 fixture transport 验证 Web UI / ShellResponse 投影闭环；local-http runtime 可把小浏览器文件作为 inline bytes 送入 Python parser preview。session 没有 core project_path 时使用 Temporary Preview Project，不把 browser-local project ref 当作 Python filesystem path。
- 当前 Import Inbox 不声明真实 Gaussian/ORCA/MAPLE/XYZ/extxyz 完整支持，只原样展示 shell/parser 返回的 parser metadata、warnings 和 errors。
- 当前 Import Inbox 不实现大文件 chunking、OPFS payload store、Worker pool、browser_storage adapter 或云上传；inline bytes 超限时显示 `payload_too_large` 并不发 shell command。
- 当前 Object Registry Panel 是对象 summary 面板，不新增/编辑/删除 ChemicalObject，不展示完整 geometry 或 energy numeric values。
- 当前 Correction Entry Form 只追加 manual/solvation/resonance correction，不实现 correction 编辑、删除、排序、批量导入、自动推荐校正数值或 undo/redo；它只通过 ShellClient 调用 `registry.apply_correction`，不在前端直接调用 `ChemicalRegistry.apply_correction`，也不自动保存 Project Content。
- 当前对象选择是前端 UI-only 状态，不写入 Project Content，不替代 Workspace Selection；已登记对象可以拖入画布创建节点，但 pending/failed import item、raw resource、parser preview item 和浏览器文件不能直接拖成 graph node。
- 当前 Graph Canvas 支持已登记对象拖入画布创建节点、click-driven 备用路径、已有节点基础拖动布局、选中 node/edge 后删除、selected node composition 编辑、existing path 的 Path Order Draft，以及 Pan/Zoom/Fit/Reset viewport controls；不实现自动布局、碰撞避让、缩放/平移自动持久化、撤销/重做、多选框选、键盘 nudging、viewport undo/redo/history、minimap、wheel/pinch、path delete、自由绘线、edge label 编辑、端点拖拽改边、自动反应配平、元素守恒或电荷守恒校验。
- 当前 Graph Canvas 不直接保存项目内容；图谱变化只来自 ShellClient 返回的 workspace projection，保存仍由 Project Sidebar 的显式 Save Bridge Session 触发。
- 当前 Graph Canvas 的 node/edge/path selection 是 Workspace Selection projection，可随显式 Save Bridge Session / Open Bridge 保存和恢复；Path Order Draft、hover、dragging、edge hitbox、pending edge、viewport intent、transient pan drag、surface DOM size、fit 中间值、toolbar pressed state 和 Object Registry active object 都是 UI-only。它们不写 Project Content、Browser Project Repository、localStorage 或 ShellResponse。viewport 和 selection 成功提交后只以 ShellResponse workspace projection 为权威状态。
- 当前不新增 Project Content schema、browser-local graph layout schema、localStorage graph persistence、自动保存、云同步或账号系统；恢复图谱布局/视口/选择只复用现有 `reaction-graphs-v1` 和 `workspaces-v1` content files。
- 当前 Energy Profile Panel 可经 fixture transport 或 local-http transport 调用 `energy.compute`；Project Content bridge 已可保存/恢复 session content files，Report Export Panel 已可把 inline artifacts 写入 active browser project 的 `exports/...`。
- 当前 Energy Profile Panel 可选择来自对象摘要的 energy channel、手输自定义 energy key，并选择 none/all/kinds/ids correction policy；它不在前端重新计算相对能量、校正项、expression 或单位换算，显示值、warnings、missing reason 和 expression details 都来自 ShellResponse profile projection。
- 当前 Energy Profile Panel 不直接保存 profile，也不生成 PNG/CDXML/XLSX artifact；profile 持久化由显式 Save Bridge Session 将当前 session content 写回 Browser Project Repository。
- 当前 Report Export Panel 只处理 ShellResponse 返回的 runtime artifacts；active browser project 下会写 Browser Project Repository `exports/...` object 和 `export-artifacts-v1` browser-local index，并显示 persisted path 与 checksum，但不创建 Python filesystem artifact，也不自动调用 Save Bridge Session。
- 当前 Report Export Panel 不在前端生成 PNG/CDXML/XLSX bytes；download link 只在 `bytes_base64` 存在时启用，include bytes 关闭时只显示 artifact metadata 和不可下载状态。当前 fixture/local-http 回归已固定 CDXML/XLSX download MIME、writer metadata、`energy-table-v1` schema metadata 和 browser-local checksum。
- 当前 Report Export Panel 不实现 file picker、File System Access API、OPFS、JSZip、云存储、账号系统、报告预览、ChemDraw 编辑器、CDX、PDF、PPTX、SVG 或 CSV。
- 当前 Report Export Panel 的 artifact id、format、path、metadata key/value、warning/error code 原样显示，不进入 i18n 翻译。用户操作说明见 `docs/user/report-export-artifacts.md`。
- 当前 Graph Canvas 使用 ShellClient workspace commands 验证 UI 编排；默认 fixture transport，local-http 模式可调用本地 Python bridge；项目内容保存/恢复通过 Project Sidebar 的显式 Open Bridge / Save Bridge Session 完成。
- 当前 E2E QA Harness 分为 fixture flow 和 local-http bridge smoke。默认 `npm run test:e2e` 不接真实 Python bridge；`npm run test:e2e:local-http` 只验证本机 bridge 主链路、小文件 parser preview、energy compute 和 report export writer projection，不声明真实 Gaussian/ORCA/MAPLE/XYZ/extxyz 完整解析支持。
- 当前 E2E screenshot、trace 和 report 是测试产物，写入 git ignored 的 Playwright output，不进入 Project Content、Browser Project Repository 或报告导出索引。
