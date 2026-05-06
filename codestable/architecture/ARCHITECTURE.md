# RxnFlow 架构总入口

> 状态：当前
> 创建日期：2026-05-01
> 最近更新：2026-05-06

## 1. 项目简介

RxnFlow 是一款面向计算化学结果的反应路径登记、图谱组装与可视化报告生成应用。项目依托外部生成的 Gaussian 日志、ORCA 输出、MAPLE/ASE XYZ 等原始计算输出文件，解析分子结构、能量、热化学参数与计算条件，将其登记为可复用化学对象，并支持用户通过节点图谱编辑反应路径、预览反应网络、生成能量曲线与标准化报告。

产品定位是专注计算化学领域的图谱编辑器。架构设计需要优先考虑 agent 友好操作、模块化解耦，以及 Web、macOS app、Windows exe、Linux CLI 等多端适配。

## 2. 核心概念 / 术语表

- Project：用户创建的工作空间，用于组织导入文件、化学对象、反应图谱与导出报告。
- Project Directory：一个可落盘 RxnFlow 项目的根目录，当前固定包含 `.rxnflow/manifest.json` 和 `inputs/raw/`。
- Project Manifest：项目级结构化元数据，当前 schema version 为 `project-v1`，记录 project id/name/schemaVersion/resources。
- Project Content：`.rxnflow/state/` 下保存的项目领域内容，当前覆盖真实 ChemicalObject、ReactionGraph、WorkspaceSnapshot 和基础 EnergyProfile snapshot。
- Project Content Index：`.rxnflow/state/project-content.json`，记录 state section 文件 kind、path、checksum 和 updated_at。
- Project Content Snapshot：一次保存/加载的项目内容快照，当前用于把对象、图谱、workspace 和 profile 数据跨进程恢复为核心 dataclass。
- Project Storage Backend：按项目相对 POSIX path 读写 bytes 的存储后端协议，当前落地本地文件系统 backend。
- Graph / Workspace Section Codec：`reaction-graphs-v1` 和 `workspaces-v1` 的序列化、反序列化和引用校验边界。
- Raw Output：外部计算程序产生的原始输出文件，例如 Gaussian log、ORCA output、MAPLE/ASE XYZ。
- Raw File Resource：复制进 Project Directory 的原始输入文件索引项，manifest 只记录项目相对 path、sha256 checksum 和 metadata。
- Parser Plugin：核心层格式解析插件，声明 can_parse 能力并把单个 Raw File 解析为 ChemicalObjectDraft。
- Parse Result：单次解析产物，包含 ChemicalObjectDraft 列表、provenance 和 warnings。
- Import Registry Workflow：核心层导入编排服务，串联 Project Store、Parser Registry 和 Chemical Registry，把 source file 变成等待确认或已登记的结构化导入状态。
- Import Batch / Import Item：单文件或批量导入的内存状态快照，逐项记录 source_path、raw resource、parse preview、warnings、error 和 registered object ids。
- Parse Preview：等待用户或 agent 确认的解析预览，记录 parser provenance、object_count、warnings 和原始 ParseResult；确认前不登记 ChemicalObject。
- Chemical Object：从原始输出解析并登记的可复用对象，包含结构、电荷自旋、方法、能量、热化学参数、来源、registry fingerprint 与校正项等信息。
- Chemical Registry：核心层对象登记服务，负责把 Parse Result 固化为项目内 Chemical Object，并维护来源追踪、基础去重、校正项追加和已持久化对象恢复。
- Correction：用户为化学对象补充的 append-only 能量校正项，例如谐振校正、溶剂化校正或手动校正。
- Reaction Graph：用户在画布上搭建的节点图谱，用于表达底物、催化剂、过渡态、中间体、产物及分叉反应路径。
- GraphPatch：UI 和 agent 共用的结构化图谱修改协议，当前支持添加/更新/删除节点与边，以及设置反应路径。
- Graph Editor Workspace：围绕一个 ReactionGraph 的 headless 编辑会话层，负责对象面板、selection、viewport、active path 和 preview，不替代 ReactionGraphService。
- Workspace Snapshot：平台壳层和 agent 可读取的 workspace 快照，包含 graph、Object Palette、Workspace Selection、Canvas Viewport、active path、Network Preview 和可选 updated_at。
- Object Palette：可拖入或放入 graph 的已登记 ChemicalObject 引用列表，当前来自调用方传入对象或 confirmed import items。
- Canvas Viewport：画布平移和缩放状态；属于 workspace-only state，不写入 GraphPatch。
- Workspace Selection：当前选中的 node、edge、path id 集合；属于 workspace-only state，不写入 ReactionGraph。
- Network Preview：从 ReactionGraph 派生的结构化预览数据，包含 nodes、edges、paths、active path 和 disconnected node diagnostics，不是渲染图或能量曲线。
- Active Path：当前 workspace 选中的 ReactionPath；path 数据仍由 ReactionGraph.paths 承载。
- Energy Engine：核心层能量 profile 计算服务，根据选定 ReactionPath 和 ChemicalObject 计算曲线可用的 EnergyProfile。
- Energy Profile：从选定反应路径计算得到的相对能量数据表与交互式能量曲线数据。
- Report Export：面向发布或复用的标准化导出结果，初期目标包括 PNG、ChemDraw/CDXML 与 Excel 能量表格。
- Report Export Service：核心层报告导出编排服务，消费已加载 graph/profile/object/table_rows，返回 ExportArtifact bytes 或写入指定目录。
- Energy Table：以结构名称为第一列的结构能量表，供 XLSX workbook 使用。
- Energy Diagram Route：从 EnergyProfile 派生的导出中间结构，供 PNG energy plot 和 CDXML energy diagram 共用。
- Platform Shell：端侧薄适配层，面向 CLI、Web adapter、桌面 bridge 或 agent，把输入参数转成核心服务调用并返回 JSON-safe 结果。
- App Kernel：进程内服务装配层，集中创建 ProjectStore、ParserRegistry、ChemicalRegistry、ImportRegistryWorkflow、ReactionGraphService、GraphEditorWorkspaceService、EnergyProfileEngine 和 ReportExportService。
- Platform Session：Platform Shell 的进程内运行态，记录当前 project、workspace、graph、profile、objects 和 artifacts 的可观察摘要。
- Shell Command：Platform Shell 接收的结构化命令，包含 command name 和 JSON-safe args。
- Shell Response：Platform Shell 返回的统一 DTO，包含 ok、data、error、warnings 和 artifacts，必须可 JSON 序列化。
- Shell Artifact：面向端侧的导出 artifact 投影，默认只包含 format、path 和 metadata；显式 include bytes 时使用 base64。
- CLI Entry：当前标准库入口为 `python3 -m rxnflow.cli`，用于运行 fixture、project 和 import preview 等最小命令。
- Web Payload Adapter：当前为纯 Python dict adapter，把未来 Web/desktop bridge payload 转成 Shell Command，不创建真实 Web route。

## 3. 子系统 / 模块索引

- Project 管理：项目创建、侧边栏组织、项目级状态与资源索引。
- Import / Parser：批量导入原始计算输出，生成解析预览，并在确认后登记可复用化学对象。
- Chemical Registry：登记、去重、版本化和复用化学对象及校正项。
- Graph Editor：节点画布、连线、分叉路径、反应网络编辑与实时预览。
- Energy Engine：路径选择、相对能量计算、数据表生成与曲线绘图。
- Export / Report：PNG、CDXML、Excel 等报告与数据导出。
- Platform Shells：Web、macOS、Windows、Linux CLI 等端侧包装与分发层。

当前已落地模块：

- [Core Platform](core-platform.md)：内置 fixture 的最小核心链路、可落盘的 Project Store 项目目录协议、Project Content Store 内容持久化、首批 Parser Plugins、Chemical Registry 登记与校正项服务、Import Registry Workflow、Reaction Graph patch 与 restore 协议、Graph Editor Workspace headless 编辑会话与 restore 协议、Energy Engine 相对能量 profile 计算、Report Export PNG/CDXML/XLSX 基线导出，以及 Platform Shell/App Kernel/CLI/payload adapter 基线。

## 4. 关键架构决定

- 核心领域模型先以 UI/平台无关的 Python dataclass 落地；后续端侧壳层不得复制核心业务逻辑。
- 最小核心链路采用 `Result<T>` 风格返回成功/错误，跨模块错误不得静默吞掉。
- Project Store 当前使用 `.rxnflow/manifest.json` 保存 `project-v1` manifest，raw file 副本放在 `inputs/raw/`。
- Project Manifest 中的 resource path 必须是项目相对 POSIX 路径，不保存用户源文件绝对路径。
- raw file resource 以 sha256 checksum 去重；重复添加同一内容应返回已有 resource。
- `project-v1` 之外的 manifest schema 不做 silent migration，当前返回 `invalid_input`。
- Parser Plugins 当前输出 ChemicalObjectDraft + provenance + warnings，不写 Project Store，不登记 ChemicalObject，不生成 ReactionGraph/EnergyProfile。
- Chemical Registry 当前接收 ParseResult 并登记 ChemicalObject；它不解析文件、不写 Project Store、不生成 ReactionGraph/EnergyProfile。
- ChemicalObject 当前携带 `registry_fingerprint`，用于持久化后恢复 ChemicalRegistry 的同来源同 draft 内容幂等索引；它不是化学相似度指纹，不用于自动合并。
- ChemicalRegistry 当前提供 `list_objects` 和 `restore_objects`，用于把已持久化 ChemicalObject 恢复为 project-scoped registry state；restore 不重新 parse raw file，也不调用 `register` 重新计算 fingerprint。
- Import Registry Workflow 当前是 ProjectStore、ParserRegistry 和 ChemicalRegistry 之间的核心编排层；它负责 raw file resource 登记、RawFile adapter、parse preview、用户/agent 确认和 batch/item 状态读取。
- Import Registry Workflow 的导入分两阶段：`import_files` 只复制 raw file 并生成 ParsePreview，`confirm_import` 才把选中的 ParseResult objects 登记进 ChemicalRegistry。
- 批量导入允许单文件失败；parse/add/register 错误记录在 ImportItem，project-level 错误才使整个 workflow 返回 Result error。
- 解析失败或格式不支持时 raw file resource 仍保留在 Project Directory 中；ImportBatch 和 ParsePreview 当前只保存在内存里。
- ChemicalObject 校正项是 append-only 的 Correction 记录，不改写 parser 原始 energy channel；是否计入能量由后续 Energy Engine 显式控制。
- 基础对象去重当前只保证同项目内同来源、同 draft fingerprint 的重复登记幂等，不基于分子式、标签、能量接近或几何相似度自动合并。
- Reaction Graph 当前通过 GraphPatch 修改；GraphPatch 是核心领域协议，不包含 selection、hover、viewport 等 UI 状态。
- Reaction Graph 只引用 ChemicalObject id，不复制 ChemicalObject、能量或 correction；object id 有效性由调用方提供集合进行校验。
- 分叉反应路径当前用多条 ReactionPath 表达，不新增 branch node 或 branch edge 类型。
- Graph Editor Workspace 是 GraphPatch 的 headless 壳层；所有 graph 结构变化最终经由 ReactionGraphService.apply_patch。
- Graph Editor Workspace 中 selection、viewport 和 active_path_id 属于 workspace-only state，不写入 ReactionGraph 或 Project Manifest。
- Object Palette 当前只暴露已登记 ChemicalObject 引用；pending/failed import items 不可直接创建 graph node。
- Network Preview 当前只表达结构预览和 disconnected node diagnostics，不包含真实 canvas 渲染、自动布局或能量曲线。
- Graph Editor Workspace 不调用 EnergyProfileEngine；能量曲线和 path-energy 联动留给后续 feature。
- ReactionGraphService 当前提供 `list_graphs` 和 `restore_graphs`，用于把已持久化 ReactionGraph 恢复为可继续 patch 的 project-scoped graph state；restore 不回放 GraphPatch。
- GraphEditorWorkspaceService 当前提供 `list_workspaces` 和 `restore_workspaces`，用于把已持久化 workspace-only 状态恢复为可继续编辑的 headless workspace；恢复时 palette 和 preview 仍由 ChemicalObject / ReactionGraph 派生。
- Gaussian/ORCA 解析通过 cclib adapter 隔离；XYZ/extxyz 解析通过标准 XYZ 解析器和 ASE extxyz adapter；MAPLE parser 只读已有 `.out` / `.xyz` 输出文件。
- cclib/ASE 提供的 eV energy 必须转换为 hartree 后进入 `EnergyValue`；MAPLE 明确标注 Hartree 的 energy 直接进入 hartree。
- 内置 fixture 只表达核心数据流，不代表真实化学体系，也不替代真实 Parser Plugin fixture corpus。
- 相对能量计算必须记录基线和单位；缺失能量不得默认为 0。
- Energy Engine 当前只读取传入的 ReactionGraph 和 ChemicalObject 集合，不解析、不登记、不持久化、不导出，也不修改 graph/object 状态。
- Energy Engine 的多对象节点能量当前按所有 ChemicalObject 的指定 energy key 以隐含系数 1 求和；更复杂的计量系数和热化学表达式尚未实现。
- Energy Engine 的校正项计入由 `EnergyOptions.include_corrections` 显式控制；启用时所有 Correction.energy 作为加性项叠加，正负号由 correction value 表达。
- Energy Engine 输出单位当前支持 `kcal_mol` 和 `kj_mol`；参与相减前必须统一转换到输出单位。
- Energy Engine 的 baseline 节点缺失能量时返回 `missing_energy`；非 baseline 点缺失能量时可返回带 `missingReason` 的 EnergyPoint 和 warning。
- Report Export Service 当前只消费调用方传入的已加载对象，不从 Project Store 读取 graph/profile，也不写 manifest 或登记 ProjectResource。
- Report Export Service 当前支持 `png`、`cdxml` 和 `xlsx` 三种 ExportFormat；其他格式返回 `invalid_input`。
- XLSX 导出当前生成 structure-first 的 `Energy Table`，并可附加 `Energy Profile` 和 `Warnings` sheet；模型中没有的 basis function、Shermo/Whitesides 校正等字段留空或由调用方 table_rows 提供。
- PNG 和 CDXML 导出共用 Energy Diagram Route；missing point 保留断点和 warning，不编造相对能量。
- CDXML 当前只生成可编辑能量图对象，包括 state line、connector、label、relative value、axis、fonttable 和 colortable；不生成分子结构级 CDXML、generic reaction scheme 或 CDX。
- PNG/XLSX writer 依赖 Pillow / XlsxWriter，但依赖在 adapter 内延迟 import，缺失时返回 `export_failed`。
- Platform Shell 当前通过 `rxnflow.platform` 提供 ShellCommand、ShellResponse、ShellArtifact、PlatformSession、AppKernel、PlatformShellService 和 handle_platform_payload。
- AppKernel 只做核心服务装配，不复制 parser、registry、graph、energy 或 export 的业务逻辑。
- PlatformShellService 当前支持 `fixture.run`、`project.create`、`project.load`、`import.preview`、`import.register_all`、`workspace.open`、`workspace.add_node`、`workspace.connect`、`workspace.set_path`、`energy.compute` 和 `export.profile` 命令。
- ShellResponse 是端侧 JSON 投影边界；dataclass、Path、tuple 和 bytes 不直接穿过该边界。
- ShellArtifact 默认不内联二进制；显式 `include_bytes=True` 时使用 base64 并在 metadata 中记录 encoding。
- Platform Session 只在进程内有效；当前不承诺跨进程恢复 ImportBatch、ChemicalObject、ReactionGraph、WorkspaceSnapshot、EnergyProfile 或 ExportArtifact 内容。
- CLI 当前通过 `python3 -m rxnflow.cli` 暴露标准库 argparse 入口，错误命令返回非 0 exit code。
- Web Payload Adapter 当前只接收/返回 dict，不引入 Web framework、route、server、worker、桌面窗口或打包入口。
- Project Content Store 当前通过 `rxnflow.content_store` 提供 ProjectContentIndex、ProjectContentFile、ProjectContentSnapshot、ProjectStorageBackend、LocalProjectStorageBackend 和 ProjectContentStore。
- Project Content Store 当前写入 `.rxnflow/state/project-content.json`、`chemical-objects.json`、`reaction-graphs.json`、`workspaces.json` 和 `energy-profiles.json`；其中 `chemical-objects.json` 使用 `chemical-objects-v1` 长期 codec 保存真实 ChemicalObject、provenance、registry fingerprint 和 append-only corrections，`reaction-graphs.json` 使用 `reaction-graphs-v1` 长期 codec 保存真实 ReactionGraph/ReactionPath，`workspaces.json` 使用 `workspaces-v1` 长期 codec 保存 workspace-only 状态。
- Project Content Store 不修改 `.rxnflow/manifest.json` schema，不登记 ProjectResource，不读取或解析 `inputs/raw/`。
- LocalProjectStorageBackend 只处理项目相对 POSIX path 和 bytes；不理解 ChemicalObject、ReactionGraph、WorkspaceSnapshot 或 EnergyProfile 领域语义。
- `project-content-v1`、`chemical-objects-v1`、`reaction-graphs-v1` 和 `workspaces-v1` 不做 silent fallback；index 缺失、schema 不兼容、坏 JSON、不安全 path、裸 energy、unsupported unit、重复 object/graph/workspace/node/edge/path id、缺失 object/node/edge/path/workspace 引用、非法 viewport 等返回结构化错误。
- 待补：真实 Gaussian/ORCA/MAPLE fixture corpus 与支持版本边界。
- 待补：真实 ImportBatch、ParsePreview、ExportArtifact index 和 EnergyProfile 长期仓储格式。
- 待补：真实图谱编辑 UI 渲染、画布布局持久化与端侧交互协议。
- 待补：组合报告、报告预览、图谱画布截图、CDX、PDF/PPTX/SVG/CSV 等导出能力边界。

## 5. 已知约束 / 硬边界

- 原始计算输出由外部程序生成，RxnFlow 不负责计算任务调度本身。
- 初始导出格式优先支持 PNG、ChemDraw/CDXML 与能量 Excel 表格。
- 设计上需要避免单一前端或单一桌面端绑定，核心领域逻辑应尽量和平台壳层解耦。
- 待补：支持的计算程序版本、解析容错策略、单位体系与能量基准约定。
