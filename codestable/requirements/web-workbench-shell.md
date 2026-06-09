---
doc_type: requirement
slug: web-workbench-shell
pitch: 打开浏览器就能看到 RxnFlow 的工作台雏形
status: current
last_reviewed: 2026-06-09
implemented_by:
  - web-workbench
tags: [web, workbench, workspace-first-flow-shell, project-rail, project-tree-import, canvas-stage, analysis-dock, local-first, shell-client, project-sidebar, project-data-library, transient-import, canonical-import-data, parse-candidate-chooser, canvas-chemical-node, indexeddb, i18n, object-registry, correction-entry, graph-canvas, graph-object-drop, graph-node-layout, graph-layout-helper, graph-edge-path-editing, graph-edge-label-editing, graph-editor-free-edge-drawing, graph-path-authoring, graph-editor-multiselect-keyboard, graph-viewport-controls, graph-editor-wheel-navigation, graph-editor-lightweight-history, graph-editor-workspace-persistence, node-composition, energy-semantics, energy-profile, pes-preview, energy-step-delta, energy-curve-interaction, report-export, report-preview, export-readiness, workspace-first-qa-guides, workspace-first-user-guide, e2e, bridge-qa]
---

# 打开浏览器就进入 RxnFlow 工作台

## 用户故事

- 作为一个想先试 Web 方向的用户，我希望打开页面后直接看到工作台，而不是先看一页产品介绍。
- 作为一个准备继续做导入、对象、图谱和能量面板的人，我希望页面先有稳定的承载结构，而不是每个功能都临时决定放在哪里。
- 作为一个担心数据是否上云的人，我希望早期页面明确显示当前是本地优先状态，而不是误以为已经有云同步。
- 作为一个用 agent 协作开发的人，我希望前端命令入口和错误展示有固定形状，后续功能能沿着同一套交互继续接。
- 作为一个继续扩展 Web 面板的人，我希望页面读取的是统一的工作台状态投影，而不是每个组件自己从单个命令响应里拼领域状态。
- 作为一个开始使用 Web 工作台的人，我希望左侧已经是可操作的项目入口，可以看到 browser-local project list、新建、打开和项目文件树；保存 / 校验只有在需要我处理时才提醒我，而不是长期占用侧边栏。
- 作为一个按工作区直觉使用 RxnFlow 的用户，我希望左侧项目树只显示当前项目已经导入的计算输出文件，点击或拖入画布后创建图谱节点；报告 PNG/CDXML/XLSX 文件留在右侧导出面板里管理。
- 作为一个按工作区直觉使用 RxnFlow 的用户，我希望页面一打开就分成项目抽屉、主画布和按需展开的导出栏，而不是被多个并列调试面板打断主流程。
- 作为一个从本地文件夹快速找 log/out/xyz/extxyz 的用户，我希望本地文件入口只是 picker；文件被拖到画布使用后才进入当前项目，之后自动保存并在下次打开时继续编辑。
- 作为一个组装反应路径的用户，我希望能把外部单对象输出文件直接拖到画布，让系统把它作为临时解析输入，解析后保存 RxnFlow 规范化对象数据，并在落点创建节点。
- 作为一个导入文件的用户，我希望导入入口在左侧项目树和中间画布上自然出现：点击项目旁的 `+` 或拖入项目树可把文件加入当前项目，把项目文件或外部文件拖到画布才创建图谱节点。
- 作为一个面对优化轨迹、多帧 extxyz 或多对象 MAPLE/Gaussian/ORCA 输出的用户，我希望系统不要自动把所有候选都扔到画布，而是在落点附近的候选选择器里让我手动选择一个或多个结构。
- 作为一个在画布上筛选结构的用户，我希望节点卡直接显示结构名、对象组成、方法、电荷自旋、可用能量、坐标摘要和 warning code，而不是点开右侧详情才能判断节点代表什么。
- 作为一个中文用户，我希望 Web 工作台能切换到简体中文，同时也保留英文界面，方便后续中英文材料和协作场景共存。
- 作为一个准备导入计算化学输出文件的用户，我希望 warnings/errors、候选选择和登记结果贴着画布落点反馈，而不是进入一个单独的导入收件箱。
- 作为一个在本机 Web 工作台试导入的用户，我希望 local-http 模式下选择的 12MiB 内原始输出文件能进入真实 Python parser preview，而不是只能看到 fixture 结果。
- 作为一个已经创建浏览器本地项目的用户，我希望导入预览时选中的原始输出文件能登记成项目内的规范化对象和轻量来源记录，而不是把 raw bytes 当作项目长期内容保存。
- 作为一个登记了计算化学对象的用户，我希望画布节点能直接显示结构名、3D 结构、电荷、自旋和能量等关键信息，而不是必须打开右侧对象调试面板。
- 作为一个需要补充溶剂化、谐振或手动校正项的用户，我希望后续可以在节点详情或对象编辑入口里维护校正项，但当前主界面不把对象登记调试面板作为常驻入口。
- 作为一个开始组装反应路径的用户，我希望中间图谱画布已经能从项目文件创建节点、从节点连接点拖线连接节点，并在无歧义时自动维护当前路径，而不是先理解独立的连接/设为路径按钮。
- 作为一个搭建反应图谱的用户，我希望能把左侧项目文件拖入画布创建节点，而不是必须先进入单独对象面板选择对象。
- 作为一个整理反应图谱布局的用户，我希望能直接拖动已有 graph node 调整位置，而不是只能接受默认节点排布。
- 作为一个整理反应图谱结构的用户，我希望能选中并删除不需要的节点或边，并让画布同步显示删除后的结构诊断。
- 作为一个整理反应路径的用户，我希望能选中并删除不需要的 path，同时保留 path 上的节点和边。
- 作为一个整理反应路径的用户，我希望能对已有 path 的节点顺序做受控调整，并在确认后才更新 active path。
- 作为一个标注反应图谱的用户，我希望能选中已有 edge 后编辑它的 label，用来记录反应步骤、条件、催化剂或分叉说明，同时不误改边的起点和终点。
- 作为一个搭建反应路径的用户，我希望能从一个图谱节点直接拖线到另一个节点创建连接，而不是只能通过按钮式 Connect 流程。
- 作为一个按画布直觉串反应路径的用户，我希望拖线连接能在无歧义时自动创建或延长 active path，并在分叉或重复节点时提示我手动调整路径。
- 作为一个整理稍复杂反应图谱的用户，我希望能同时选中多个 node、edge 或 path，用一次删除操作处理当前选择，而不是逐个点选删除。
- 作为一个整理节点布局的用户，我希望能在画布里框选多个节点，并用方向键按网格微调它们的位置。
- 作为一个键盘操作频繁的用户，我希望 Delete/Backspace、Escape 和方向键只在图谱画布焦点内生效，不影响输入框里的文字编辑。
- 作为一个在较大反应图谱里编辑路径的用户，我希望能缩放、平移、fit 和 reset 图谱画布，同时节点坐标仍保持在稳定的 workspace 虚拟坐标里。
- 作为一个在较大反应图谱里导航的用户，我希望能用鼠标滚轮或触控板类输入围绕指针位置缩放，并用浮动工具栏快速切换选择、平移、缩放、适配和重置视图。
- 作为一个频繁整理图谱的用户，我希望能撤销或重做最近一次布局、视口、选择或节点微调，而不是每次点错都手工调回去。
- 作为一个使用浏览器本地项目编辑图谱的用户，我希望自动保存后能恢复节点位置、画布视口、当前选中的节点/边/path、active path 和 3D 结构，而不是每次重新打开都丢失编辑上下文。
- 作为一个搭建反应路径的用户，我希望能在选中图谱节点后把节点组成编辑成 `A + 2B` 这类多对象表达，而不是只能用单个对象代表一个节点。
- 作为一个已经设置反应路径的用户，我希望能直接从当前 active path 计算相对能量，并看到结构名称、节点、相对能量、单位、缺失原因、warnings 和可交互曲线预览。
- 作为一个比较反应能垒和分步能量变化的用户，我希望右侧势能面能跟随 active path 自动刷新，并在表格和详情里显示相邻 step delta、missing reason 和 correction count。
- 作为一个在图谱和报告之间切换的用户，我希望主界面保持画布优先，右侧只在需要导出时展开 Report Export 面板；PES、对象详情和诊断不作为当前主流程 tab 常驻。
- 作为一个需要核对能量来源的用户，我希望能在能量面板里看到每个 profile point 的组成项、校正项、单位换算贡献和缺失明细，而不是只看到最终相对能量数字。
- 作为一个浏览能量曲线的用户，我希望曲线点能显示有效、缺失、含校正和当前选中的状态，并且点开某个 point 时看到对应结构、节点、相对能量、表达式总量、组成项数量和校正项数量。
- 作为一个从能量曲线定位图谱的用户，我希望点击曲线点或表格行后，中间图谱画布能选中同一个 graph node，而不是手动在画布里重新找。
- 作为一个需要比较 electronic energy 和 thermochemistry 的用户，我希望能在能量面板里明确选择 energy channel 和来源 section，而不是只能手输一个模糊的 key。
- 作为一个需要管理校正项口径的用户，我希望能按 none/all/kinds/ids 选择 correction policy，而不是只有一个笼统的 include corrections 开关。
- 作为一个已经得到能量剖面的用户，我希望能从 Web 工作台直接导出 PNG、CDXML 和 XLSX 文件，并在浏览器里看到清晰的下载入口。
- 作为一个需要把能量剖面交给 ChemDraw 继续整理的用户，我希望 CDXML 能量图已经包含结构名称、相对能量、相邻 `dE`、missing reason 和 correction marker，而不是只导出空泛曲线。
- 作为一个使用浏览器本地项目的用户，我希望导出的 PNG、CDXML 和 XLSX 文件能写入当前 browser-local project 的 `exports/...`，但普通导出面板不要把 checksum、writer metadata 或 persisted 状态当作用户要看的内容。
- 作为一个继续迭代 Web 工作台的人，我希望有一条可重复的真实浏览器回归命令，能覆盖桌面/窄屏主流程、图谱编辑关键手势和布局健康，而不是每次靠临时脚本或人工目测。
- 作为一个继续推进 local-http bridge 的开发者，我希望 fixture E2E 和 local-http E2E 分开运行，既能保留不依赖 Python bridge 的默认 UI 回归，也能用独立命令验证真实 bridge 主链路。
- 作为一个第一次验收 Web 工作台的用户，我希望有一份从第一屏开始的主流程指南，按创建项目、导入/拖文件、画布节点、连接路径、导出、自动保存和重新打开恢复的顺序判断当前版本是否可用。
- 作为一个继续维护 Web 工作台的开发者或 agent，我希望有一份 workspace-first QA matrix，能区分 fixture E2E、local-http E2E、手工用户验收和 Python/Web/YAML 基础检查各自证明什么、不证明什么。

## 为什么需要

RxnFlow 的核心流程已经能在无界面的状态下跑通，但用户很难从测试和命令行里感受到它会变成什么产品。没有 Web 工作台壳层时，后续导入面板、对象面板、图谱画布、能量曲线和导出面板也缺少共同的入口和布局骨架。

## 怎么解决

系统提供一个浏览器工作台雏形：页面打开后直接进入 Canvas-First / Workspace-First Flow Shell，顶部菜单只承载 Projects 和 Export；左侧 Project Rail 管 project list、项目新建、项目文件树、项目内文件导入和项目更多操作；中间 Canvas Stage 以 Graph Canvas 为主体并接收外部文件/项目文件 drop；右侧只按需展开 Report Export Panel。当前用户可见 Project Files 只显示项目已导入的计算输出文件，不显示导出 artifacts、checksum、backend ref 或 graph/object 内部 id。长期口径是 raw log/out/xyz/extxyz 只作为导入和复用入口，导入/解析后项目以 RxnFlow canonical data 为 authority：ChemicalObject、geometry、charge/spin、method、energy/thermochemistry/correction、轻量来源记录、graph/workspace/profile/export records。当前 Shell runtime 默认为 fixture；如果开发者设置 `VITE_RXNFLOW_SHELL_TRANSPORT=local-http`，Web ShellClient 会通过 `http-api` transport 调用本机 `rxnflow.local_bridge`。主界面不展示 `Runtime Fixture`、`Runtime Local HTTP`、IndexedDB backend id、browser project ref 或 `Local-only` badge。打开已有 project 时会自动把 `.rxnflow/manifest.json` 与 `.rxnflow/state/*.json` content files 交给 shell `project.open(content_files)` 恢复对象、图谱、workspace、3D geometry 和能量 profile；若旧项目只恢复出线性 edge 而没有 active path，Web 会自动修复为 `path-web-main`。active project + session 的工作台变更会防抖自动调用 `project.save_content(include_content_files=true)` 写回 Browser Project Repository。侧栏不再暴露 Project Bundle、手动 bridge 操作、手动 Save Project 按钮或 backend/runtime 实现名。旧 Source Tray / Import Inbox UI 已删除；项目树 `+` / drop 负责把计算输出加入 active project，Graph Canvas drop 负责串联 preview、single-object register、multi-candidate chooser 和 workspace node creation。fixture runtime 下继续用 shell `import.preview` projection 验证前端编排，并能从 Project Content files 恢复已保存对象、图谱、3D geometry 和 energy profile 供本地 UI 验收；local-http runtime 下优先把浏览器文件编码为 inline bytes 送入真实 Python `import.preview`，当前上限为 12MiB/文件，local bridge request body 默认 64MiB。中间图谱区域的 Graph Canvas 能展示 workspace graph nodes/edges/paths 和 active path，并通过项目文件拖入、transient file drop、Direct Edge Gesture、floating viewport controls、双指/普通 wheel 平移、ctrl/meta wheel zoom、右下角小地图和 runtime history 完成当前图谱编辑闭环；连线成功后无歧义时自动创建或延长 active path，不再提供独立 `Connect` 或 `Set Path` 按钮，也不渲染独立 Network Preview 或 Path List 常驻面板。最终可见 graph state 仍只来自 ShellResponse workspace projection。Report Export Panel 可基于当前 active profile 调用 `export.profile`，普通 UI 只显示 PNG/CDXML/XLSX、basename/title、Export button、导出文件名和 download link；CSV/SVG 保留为 core supported writer，不在 Web 普通导出面板显示。顶栏提供语言切换，当前支持 `zh-CN` 简体中文和 `en-US` 英文；默认按浏览器语言选择，手动偏好只保存在浏览器本地。这个壳层给后续真实导入、对象详情、画布、能量和导出功能预留位置，同时明确当前没有云同步。

截至 2026-06-06，workspace-first 主流程仍处在迁移前状态：左侧 Project Files Panel 只展示 browser-local project 已拥有的 `inputs/raw/...` raw files，外部浏览器 `File` 拖入画布时会先写入当前项目并合并 manifest raw resource，再调用 `import.preview`。该行为已被 `canonical-import-data` decision 和 `rxnflow-canonical-import-data` roadmap 标记为待迁移，不再作为长期产品口径。迁移后的主流程应改为：外部文件拖入画布时只作为 transient parser input；单对象 preview 自动 register canonical object 并按落点调用 `workspace.add_node`；多对象或多帧 preview 在落点附近显示 Parse Candidate Chooser，用户确认后通过 `import.register_selection` 登记指定 object indices，并按选择顺序在落点附近创建 stack graph nodes；Project Data Library 展示已导入对象、来源摘要、能量和 warning，不展示 `inputs/raw/...` path。Canvas Chemical Node 会从 ShellResponse 的 graph/object summaries 派生结构名、object ids / composition、formula、charge/spin、method、display energy、coordinate preview 和 warning code，不新增 core graph schema、不写 Project Content、不做前端能量计算或分子图布局。transient preview、register selection/register all 或 add-node 任一步失败都会停止后续步骤并显示 structured error code/target；取消候选选择不会登记对象或创建节点。

当前 workspace-first 主流程也有用户和开发者验收入口：`docs/user/workspace-first-workbench.md` 按用户操作顺序说明 Project Sidebar / Graph Canvas / Report Export Panel 的最小验收路线，以及 local-first、非云同步、自动保存、CDXML-not-CDX 和 parser smoke 边界；`docs/dev/workspace-first-flow-qa.md` 提供 QA matrix，说明默认 fixture E2E、local-http E2E、manual user journey、Web unit/build、Python unittest、YAML 和 diff check 的适用场景与证明边界。

## 边界

- 它还不是完整 Web 产品，只是第一版工作台壳层和项目侧边栏。
- 它不负责 browser_storage adapter、完整图谱编辑、高级能量曲线编辑、组合报告 composer、bundle IO 或云同步。
- 它不提供账号、权限、云存储、跨设备同步或多人协作。
- 当前页面需要通过本地开发服务预览，不是可双击打开的独立静态页面。
- 当前视觉风格不是长期定稿；后续可以替换配色、组件库、密度和面板细节。
- 当前 Workbench Snapshot 只读，不是项目保存机制；active browser project + session 的工作台变更通过自动保存调用 `project.save_content(include_content_files=true)` 写回 Browser Project Repository。没有 session 时只补齐空 Project Content files。
- 当前 Project Sidebar 不暴露 Project Bundle import/export 入口；Web bundle archive/import/export helper 仍保留在代码中作为内部可携带性适配层和测试工具，但不是用户主流程。
- 当前 Project Files 只展示已导入项目的计算输出文件并支持点击/拖入画布；单个 raw file 删除入口尚未落地。后续实现删除 `X` 前，需要先定义删除 raw file 后对 registered objects、graph nodes、auto-save 和 project restore 的级联/保留规则，不能只删 Browser Repository 对象造成半删状态。
- 当前迁移目标下，Project Data Library 展示的是项目内规范化对象/来源摘要，不是本地文件夹浏览器；浏览器 file/folder picker 只是导入入口，不作为长期项目权威。
- 当前用户可见导入入口只有项目树导入和画布 drop：项目树负责把外部 loose file 加入 active project，画布 drop 负责 preview/register/add-node；没有单独的 Source Tray / Import Inbox 面板。
- 当前主界面不提供 Analysis Dock / PES / Object / Diagnostics tab；Export 按钮只控制右侧 Report Export Panel 的展开/收起，不改变 `energy.compute`、`export.profile`、workspace command args、Project Content 或 Browser Project Repository schema。
- 当前主界面不得展示 backend id、browser project ref、`Runtime Fixture`、`browser-project:...` 等实现细节；常规 UI 不提供 Diagnostics tab。
- 当前 Export 由右侧 Report Export Panel 组织；窄屏首屏默认收起 Project Rail，以画布作为首屏主体。
- 当前 Dev Commands 只通过 dev/test-only `window.__rxnflowWorkbenchTest` API 触发，不渲染生产按钮；command status、warnings 和 errors 只在相关面板或错误提示里显示。
- 当前 i18n 只覆盖 Web 工作台和项目侧边栏主文案，不翻译项目名、projectRef、checksum、错误 code/target、文件名或底层错误 message。
- 当前语言偏好不是账号设置，也不写入 Project Content；清浏览器数据会丢失手动选择。
- 当前 transient import pipeline 使用 fixture transport 验证 Web UI / ShellResponse 投影闭环；local-http runtime 可把浏览器文件作为 inline bytes 送入 Python parser preview，当前上限为 12MiB/文件，local bridge request body 默认 64MiB。session 没有 core project_path 时使用 Temporary Preview Project，不把 browser-local project ref 当作 Python filesystem path。
- 当前迁移目标下，项目树导入和画布 drop 应把 selected browser `File` 作为 transient parser input；preview payload 校验通过后应登记 canonical import record / ChemicalObject，不在 manifest 中默认记录 raw resource anchor，不上传云端。当前 Web 仍有 `inputs/raw/...` 过渡实现，后续 canonical import data feature 会删除 raw bytes authority。
- 当前 transient import pipeline 不声明真实 Gaussian/ORCA/MAPLE/XYZ/extxyz 完整支持，只原样展示 shell/parser 返回的 parser metadata、warnings 和 errors。
- 当前 transient import pipeline 不实现大文件 chunking、OPFS payload store、Worker pool、browser_storage adapter 或云上传；inline bytes 超限时显示 `payload_too_large`，不读取 raw bytes、不写 `inputs/raw/...`、不发 shell command。
- 当前主界面不展示 Object Registry Panel 或 Correction Entry Form；Object Summary Projection 仍可带 `display_energy`、`coordinate_preview` 和 `geometry` 供画布节点快速扫描，但对象详情/校正项编辑会作为后续独立入口重新设计。
- 当前对象选择是前端 UI-only 状态，不写入 Project Content，不替代 Workspace Selection；项目文件或已登记对象可以进入画布创建节点。pending/failed import item 和 parser preview item 不能直接拖成 graph node；浏览器文件只能走 Transient File Drop pipeline，项目文件行复用 raw bytes 后走 preview/register/add-node。
- 当前 Transient File Drop 对 `object_count === 1` 的 preview 自动登记并创建一个 graph node；多对象、多帧和 path-family 文件不会自动创建全部 graph nodes，必须先显示候选选择器，用户确认后才登记选择对象并创建对应节点。
- 当前 Graph Canvas 支持已登记对象/项目文件进入画布创建节点、transient file 多候选选择器、Canvas Chemical Node 富摘要、从节点 Edge Connect Handle 直接拖线到另一个节点创建 edge、已有节点基础拖动布局、普通点击/Shift-click 多选 node/edge/path、select mode 空白画布 rubber-band 框选 nodes、Delete Selected 与 Delete/Backspace 删除当前 selection、Escape 清空 selection、方向键按网格微调 selected nodes、selected node composition draft、selected edge label draft、Select/Pan/Zoom/Fit/Reset、普通 wheel / 双指滚动平移、ctrl/meta wheel zoom、右下角小地图，以及 viewport/selection/selected node nudge 的 runtime-only Undo/Redo；当前主界面不渲染独立自动布局按钮、Network Preview 或 Path List；不实现碰撞避让、edge rerouting、label collision avoidance、缩放/平移自动持久化、删除撤销、add/connect/path order/edge label/composition 撤销、跨 reload history、持久化 history、edge/path nudge、edge/path rubber-band hit testing、viewport auto persistence、惯性滚动、多指 PointerEvent pinch、persistent minimap preference、edge endpoint 重连、结构化反应条件编辑、2D 分子渲染、自动反应配平、元素守恒或电荷守恒校验。
- 当前 Path Authoring 只在 `workspace.connect` 成功后做 active path 创建或延长：无 active path 时创建 `path-web-main=[from,to]`，tail/head 匹配时 append/prepend；分叉连接会创建并选中一条两节点 branch path；内部连接、重复节点或 no-op 只保留 edge，不显示“设为路径”类主流程状态。
- 当前 Graph Canvas 不直接保存项目内容；图谱变化只来自 ShellClient 返回的 workspace projection，保存由 WorkbenchShell 的自动保存闭环触发。
- 当前 path delete 不删除 nodes/edges，不删除或重算 EnergyProfile，不自动保存 Project Content 或 Browser Project Repository；它只通过 `workspace.remove(path_ids?)` 更新 workspace projection。
- 当前 Graph Canvas 的 node/edge/path selection 是 Workspace Selection projection，可随自动保存 / 打开 project 恢复；rubber-band draft、Path Order Draft、hover、dragging、edge hitbox、pending edge、layout plan、layout warnings、layout applying/no-op status、viewport intent、transient pan drag、surface DOM size、fit 中间值、wheel delta、keyboard focus intent、toolbar pressed state 和 Graph Editor History stack 都是 UI-only。它们不写 Project Content、Browser Project Repository、localStorage 或 ShellResponse。Direct Edge Gesture 的 pending preview 只在 release 前存在，不持久化、不自动保存、不产生 label prompt。viewport、selection、wheel viewport navigation、runtime history replay 和 selected node nudge 成功提交后只以 ShellResponse workspace projection 为权威状态。
- 当前不新增 Project Content schema、browser-local graph layout schema、localStorage graph persistence、自动保存、云同步或账号系统；恢复图谱布局/视口/选择只复用现有 `reaction-graphs-v1` 和 `workspaces-v1` content files。
- 当前 Energy Profile Panel 可经 fixture transport 或 local-http transport 调用 `energy.compute`；Project Content bridge 已可保存/恢复 session content files，Report Export Panel 已可把 inline artifacts 写入 active browser project 的 `exports/...`。
- 当前 Energy Profile Panel 可选择来自对象摘要的 energy channel、手输自定义 energy key，并选择 none/all/kinds/ids correction policy；它不在前端重新计算相对能量、校正项、expression 或单位换算，显示值、warnings、missing reason、curve point marker 和 expression details 都来自 ShellResponse profile projection。
- 当前 Energy Profile Panel 会在 active path projection 或能量选项变化时按 signature 自动触发一次 `energy.compute`，签名不变不重复自动 compute；手动 Compute 仍按当前 path/options 强制重算。
- 当前 PES Preview 表格和详情显示 step delta；该值只从相邻两个有效 relative energy 值派生，第一点或任一相邻 missing 点保持空值，不补 0。correction count 只来自 `point.expression.corrections.length`。
- 当前 Energy Profile Panel 的曲线点详情和 active/pinned point 是 UI-only 状态；不会保存到 Project Content、Browser Project Repository 或 localStorage。missing point 不补 0、不连入有效 polyline；correction marker 只基于 `expression.corrections.length`。
- 当前 Energy Profile Panel 点击曲线点或表格行只通过 `workspace.select` 联动 Graph Canvas selected node，不直接修改 graph/path/profile 或节点组成。
- 当前 Energy Profile Panel 不直接保存 profile，也不生成 PNG/CDXML/XLSX/CSV/SVG artifact；profile 持久化由自动保存将当前 session content 写回 Browser Project Repository。
- 当前 Report Export Panel 只处理 ShellResponse 返回的 runtime artifacts；active browser project 下会写 Browser Project Repository `exports/...` object 和 `export-artifacts-v1` browser-local index，但普通 UI 不显示 persisted path、checksum 或 writer metadata，不创建 Python filesystem artifact，也不依赖手动 `Save Project` 按钮。
- 当前 CDXML artifact 由 core writer 生成，包含结构名称、relative value + unit、相邻 `dE`、missing reason 和 `corr xN` marker；Web 不生成 CDXML bytes，也不在浏览器重算 step delta 或 correction marker。
- 当前 Report Export Panel 不在前端生成 PNG/CDXML/XLSX/CSV/SVG bytes；download link 只在 `bytes_base64` 存在时启用。当前 fixture/local-http 回归固定 Web-visible PNG/CDXML/XLSX download MIME，并断言 CSV/SVG 不出现在普通 UI。
- 当前 Report Export Panel 不实现 Preview mode、Export Readiness、file picker、File System Access API、OPFS、JSZip、云存储、账号系统、独立报告 writer、ChemDraw 编辑器、CDX、PDF 或 PPTX。
- 当前 Report Export Panel 的用户操作说明见 `docs/user/report-export-artifacts.md`。
- 当前 workspace-first 用户指南是验收入口，不替代 report export、project bundle、open project 或 parser output support 的详细指南；它通过相关功能链接串联这些文档。
- 当前 workspace-first QA matrix 不新增产品功能、Shell command、Project Content schema、Browser Repository schema、localStorage key、测试专用生产 UI 或第三方依赖。
- 当前 fixture/local-http E2E 只证明对应链路可用，不承诺完整 Gaussian、ORCA、MAPLE、XYZ 或 extxyz 真实输出兼容认证。
- 当前 Playwright screenshot、trace 和 HTML report 只作为测试产物写入 gitignored output，不进入 Project Content、Browser Project Repository、`.rxnflow.zip` 或 report export artifacts。
- 当前 Graph Canvas 使用 ShellClient workspace commands 验证 UI 编排；默认 fixture transport，local-http 模式可调用本地 Python bridge；项目内容打开时自动恢复，保存通过自动保存完成。
- 当前 E2E QA Harness 分为 fixture flow 和 local-http bridge smoke。默认 `npm run test:e2e` 不接真实 Python bridge，负责桌面/窄屏 UI 编排、Project Data Library / transient import 编排、自动保存 restore、advanced graph editor matrix、narrow advanced controls、console clean 和 no horizontal overflow；`npm run test:e2e:local-http` 只验证本机 bridge 主链路、本地 inline parser preview、project save/reopen restore、energy compute 和 report export writer projection，不复制复杂 graph gesture matrix，也不声明真实 Gaussian/ORCA/MAPLE/XYZ/extxyz 完整解析支持。
- 当前 E2E screenshot、trace 和 report 是测试产物，写入 git ignored 的 Playwright output，不进入 Project Content、Browser Project Repository 或报告导出索引。
