# RxnFlow 架构总入口

> 状态：当前
> 创建日期：2026-05-01
> 最近更新：2026-05-16

## 1. 项目简介

RxnFlow 是一款面向计算化学结果的反应路径登记、图谱组装与可视化报告生成应用。项目依托外部生成的 Gaussian 日志、ORCA 输出、MAPLE/ASE XYZ 等原始计算输出文件，解析分子结构、能量、热化学参数与计算条件，将其登记为可复用化学对象，并支持用户通过节点图谱编辑反应路径、预览反应网络、生成能量曲线与标准化报告。

产品定位是专注计算化学领域的图谱编辑器。架构设计需要优先考虑 agent 友好操作、模块化解耦，以及 Web、macOS app、Windows exe、Linux CLI 等多端适配。

## 2. 核心概念 / 术语表

- Project：用户创建的工作空间，用于组织导入文件、化学对象、反应图谱与导出报告。
- Project Directory：一个可落盘 RxnFlow 项目的根目录，当前固定包含 `.rxnflow/manifest.json` 和 `inputs/raw/`。
- Project Manifest：项目级结构化元数据，当前 schema version 为 `project-v1`，记录 project id/name/schemaVersion/resources。
- Project Content：`.rxnflow/state/` 下保存的项目领域内容，当前覆盖真实 ChemicalObject、ReactionGraph、WorkspaceSnapshot、ImportBatch/ParsePreview、EnergyProfile snapshot 和 ExportArtifact index。
- Project Content Index：`.rxnflow/state/project-content.json`，记录 state section 文件 kind、path、checksum 和 updated_at。
- Project Content Snapshot：一次保存/加载的项目内容快照，当前用于把对象、导入 ledger、图谱、workspace、energy profile 和 export artifact index 跨进程恢复为核心 dataclass。
- Project Content Validation：对 Project Content index、section files、schema、checksum、安全 path、跨 section 引用和 `exports/...` artifact checksum 做只读校验。
- Validation Report：Project Content Validation 的结构化结果，包含 project id、schema version、ok、issues、checked_at 和 summary；warning 不阻止加载，error 使 report.ok 为 false。
- Validation Issue：单条 validation warning/error，包含 severity、code、message、target 和 JSON-safe details。
- Migration Plan：Project Content schema migration 的显式计划结果；当前只支持 `project-content-v1 -> project-content-v1` no-op，未知 source/target 返回 unsupported issue，不做 silent migration。
- Project Storage Backend：按项目相对 POSIX path 读写 bytes 的存储后端协议，当前落地本地文件系统 backend 和浏览器本地测试替身。
- Browser Local Storage Backend：面向 IndexedDB / OPFS 方向的 `ProjectStorageBackend` 核心协议测试替身，使用 opaque origin-local project key 隔离项目，不提供云同步。
- Browser Project Repository：未来 Web 端真实本地项目仓储，负责保存项目 refs、raw files、exports 和 bundle IO；当前只在 Web runtime boundary 文档中定义职责，不等同于 Python 测试替身。
- Project Bundle：`.rxnflow.zip` 项目包，内部只有一个 Bundle Root，用于本地备份和早期 Web 无云同步时的手动导入/导出。
- Bundle Export：把本地 Project Directory 的 `.rxnflow/`、`inputs/raw/` 和 `exports/` 复制进 Project Bundle，不保存当前进程内 session。
- Bundle Import：从 Project Bundle 安全解包成新的 Project Directory；第一版只支持 `fail_if_exists`，不覆盖、不合并、不自动改名。
- Bundle Summary：bundle shell / CLI 返回的 JSON-safe 摘要，包含 bundle path、project path、project id、root name、file count、byte size、checksum 和 validation summary。
- Graph / Workspace Section Codec：`reaction-graphs-v1` 和 `workspaces-v1` 的序列化、反序列化和引用校验边界。
- Raw Output：外部计算程序产生的原始输出文件，例如 Gaussian log、ORCA output、MAPLE/ASE XYZ。
- Raw File Resource：复制进 Project Directory 的原始输入文件索引项，manifest 只记录项目相对 path、sha256 checksum 和 metadata。
- Parser Plugin：核心层格式解析插件，声明 can_parse 能力并把单个 Raw File 解析为 ChemicalObjectDraft。
- Parse Result：单次解析产物，包含 ChemicalObjectDraft 列表、provenance 和 warnings。
- Parser Fixture Corpus：`tests/fixtures/parsers/` 下的解析器回归样例集合，当前包含 manifest、support matrix、synthetic MAPLE sp/opt `.out`、synthetic MAPLE path `.xyz` partial、synthetic Gaussian cclib、synthetic ORCA cclib、standard XYZ、ASE extxyz 输入、bad XYZ expected-error 样例和 golden snapshots，用于验证 ParserRegistry 语义稳定性和 import preview 保真。
- Fixture Manifest：parser fixture corpus 的 `parser-fixtures-v1` YAML 清单，记录 fixture id、program、format、task、parser_id、source policy、parse options、expected snapshot 和浮点容差。
- Golden Snapshot：parser fixture 的 `parser-golden-v1` JSON 期望，记录 ParseResult 的稳定投影，包括 object_count、provenance.parser_id、对象摘要、energy keys、energy units/value 和 warning codes。
- Parser Support Matrix：parser fixture corpus 的 `parser-support-matrix-v1` YAML 支持矩阵，按 program、format、task、field status、fixture ids、known limits 和 observed diagnostics 记录当前 fixture-backed 支持边界。
- Parser Diagnostic Catalog：support matrix 内的 warning/error code 目录，当前定义 `partial_parse`、`missing_section`、`ambiguous_value`、`unit_assumed`、`unsupported_task`、`unsupported_field`、`source_license_notice`、`invalid_input`、`unsupported_format` 和 `parse_failed` 的测试侧语义。
- Parser Corpus Developer Guide：`docs/dev/parser-fixture-corpus.md` 下的开发者和 agent 任务指南，说明新增 fixture、source policy、脱敏、snapshot 更新、support matrix、diagnostic codes、import preview regression 和 parser gap triage。
- Import Registry Workflow：核心层导入编排服务，串联 Project Store、Parser Registry 和 Chemical Registry，把 source file 变成等待确认或已登记的结构化导入状态。
- Import Batch / Import Item：单文件或批量导入的内存状态快照，逐项记录 source_path、raw resource、parse preview、warnings、error 和 registered object ids。
- Parse Preview：等待用户或 agent 确认的解析预览，记录 parser provenance、object_count、warnings 和原始 ParseResult；确认前不登记 ChemicalObject。
- Import Ledger：Project Content 中的 `import-ledger-v1` section，保存 ImportBatch、ImportItem、ParsePreview、registered ids、warnings 和 errors。
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
- Energy Profile Persistence：Project Content 中的 `energy-profiles-v1` section，保存已计算 EnergyProfile、EnergyOptions、EnergyPoint、missing reason 和 warnings；加载时校验 graph/path/node 顺序但不重新计算。
- Report Export：面向发布或复用的标准化导出结果，初期目标包括 PNG、ChemDraw/CDXML 与 Excel 能量表格。
- Report Export Service：核心层报告导出编排服务，消费已加载 graph/profile/object/table_rows，返回 ExportArtifact bytes 或写入指定目录。
- Export Artifact：`ReportExportService` 的运行时导出结果，可包含 bytes 或当前进程输出路径，不作为长期项目内容直接保存。
- Export Artifact Record：Project Content 中的长期导出索引记录，保存 id、format、`exports/...` 项目相对 path、sha256 checksum、metadata 和 created_at，不保存 bytes。
- Export Artifact Index：Project Content 中的 `export-artifacts-v1` section，保存 ExportArtifactRecord 列表；它不是 Project Manifest resource 列表。
- Energy Table：以结构名称为第一列的结构能量表，供 XLSX workbook 使用。
- Energy Diagram Route：从 EnergyProfile 派生的导出中间结构，供 PNG energy plot 和 CDXML energy diagram 共用。
- Platform Shell：端侧薄适配层，面向 CLI、Web adapter、桌面 bridge 或 agent，把输入参数转成核心服务调用并返回 JSON-safe 结果。
- App Kernel：进程内服务装配层，集中创建 ProjectStore、ProjectContentStore、ProjectBundleService、ParserRegistry、ChemicalRegistry、ImportRegistryWorkflow、ReactionGraphService、GraphEditorWorkspaceService、EnergyProfileEngine 和 ReportExportService。
- Project Open：Platform Shell 命令 `project.open`；默认先校验 Project Content，再恢复 registry、import batches、reaction graphs、workspaces、energy profiles 和 export artifact records。`load_content=false` / CLI `--manifest-only` 只打开 manifest。
- Save Content：Platform Shell 命令 `project.save_content`；把当前进程内 Platform Session 的 content collections 写回 ProjectContentStore，要求有效 `session_id` 和 session.project_path。
- Restored Session Summary：`project.open` / `project.save_content` 返回给端侧的 JSON-safe 摘要，包含 object_count、graph_count、workspace_count、profile_count、artifact_count 和 active ids。
- Platform Session：Platform Shell 的进程内运行态，记录当前 active project/workspace/graph/profile，以及可保存的 objects、import batches、reaction graphs、workspaces、energy profiles、export artifact records 和运行时 artifacts；它自身不跨进程持久化。
- Shell Command：Platform Shell 接收的结构化命令，包含 command name 和 JSON-safe args。
- Shell Response：Platform Shell 返回的统一 DTO，包含 ok、data、error、warnings 和 artifacts，必须可 JSON 序列化。
- Shell Artifact：面向端侧的导出 artifact 投影，默认只包含 format、path 和 metadata；显式 include bytes 时使用 base64。
- CLI Entry：当前标准库入口为 `python3 -m rxnflow.cli`，用于运行 fixture、project create/load/open、project export-bundle/import-bundle 和 import preview 等最小命令。
- Web Payload Adapter：当前为纯 Python dict adapter，把未来 Web/desktop bridge payload 转成 Shell Command，不创建真实 Web route。
- Web Runtime Boundary：已确认的 Web MVP 运行时分工，要求浏览器 UI 只经 Shell Client / Shell Payload 调用 Python core，项目内容第一版由 Browser Project Repository 和 `.rxnflow.zip` bundle 承担。
- Web Workbench App Shell：当前位于 `web/` 的 React + TypeScript + Vite 浏览器工作台壳层，提供三栏工作台第一屏、local-only indicator、fixture command 和基础状态投影。
- Frontend ShellClient：Web 前端统一命令客户端，接收 JSON-safe `ShellCommandPayload`，调用 `ShellTransport`，返回规范化 `ShellResponse`；当前只接 `in-process-test` fixture transport。
- Shell Transport：Web Shell Client 到 core runtime 的可替换通道，规划为 `in-process-test`、`local-python-bridge`、`http-api`；当前前端代码只落地 `in-process-test`，未来 transport 仍需独立 feature。
- WorkbenchShellState：Web app shell 从 `ShellResponse` 派生的最小 UI 可读投影，当前保存 command status、session/project/graph/profile summary、counts、warnings 和 error，不复制核心领域模型。
- Stateless Python API：Vercel/http-api 方向的候选执行层，只能作为无状态 command executor，不作为长期项目存储、跨请求 session authority 或持久 filesystem。

## 3. 子系统 / 模块索引

- Project 管理：项目创建、侧边栏组织、项目级状态与资源索引。
- Import / Parser：批量导入原始计算输出，生成解析预览，并在确认后登记可复用化学对象。
- Chemical Registry：登记、去重、版本化和复用化学对象及校正项。
- Graph Editor：节点画布、连线、分叉路径、反应网络编辑与实时预览。
- Energy Engine：路径选择、相对能量计算、数据表生成与曲线绘图。
- Export / Report：PNG、CDXML、Excel 等报告与数据导出。
- Platform Shells：Web、macOS、Windows、Linux CLI 等端侧包装与分发层。

当前已落地模块：

- [Core Platform](core-platform.md)：内置 fixture 的最小核心链路、可落盘的 Project Store 项目目录协议、Project Content Store 内容持久化与验证/migration plan、Project Bundle 导入/导出、Browser Local Storage Backend 核心协议测试替身、首批 Parser Plugins、parser fixture harness、parser support matrix diagnostics、parser corpus developer guide、import preview parser regression、MAPLE、Gaussian/ORCA cclib 与 XYZ/extxyz synthetic fixture coverage、Chemical Registry 登记与校正项服务、Import Registry Workflow 与 import ledger restore 协议、Reaction Graph patch 与 restore 协议、Graph Editor Workspace headless 编辑会话与 restore 协议、Energy Engine 相对能量 profile 计算、Energy Profile Persistence、Export Artifact Index、Report Export PNG/CDXML/XLSX 基线导出、Platform Shell/App Kernel/CLI/payload adapter 基线，以及 Web runtime boundary developer guide / payload POC。
- [Web Workbench](web-workbench.md)：`web/` React + TypeScript + Vite app shell、Frontend ShellClient、FixtureTransport、WorkbenchShellState、三栏工作台布局和浏览器验证边界。

## 4. 关键架构决定

- 核心领域模型先以 UI/平台无关的 Python dataclass 落地；后续端侧壳层不得复制核心业务逻辑。
- Web MVP 当前采用 local-first browser workbench 边界：浏览器本地项目仓储和 `.rxnflow.zip` bundle 是第一版项目内容 authority，Python core 只通过 Shell Command / Shell Response 边界暴露能力。
- Vercel/http-api 只能作为无状态 command executor 候选；serverless filesystem、跨请求 session 或 HTTP API 不得被当成长期项目存储。
- Web app shell 当前采用 client-heavy React + TypeScript + Vite + npm；若后续改用 Next.js 或其他框架，也不得让 App Router / Server Components 成为领域状态 authority。
- 最小核心链路采用 `Result<T>` 风格返回成功/错误，跨模块错误不得静默吞掉。
- Project Store 当前使用 `.rxnflow/manifest.json` 保存 `project-v1` manifest，raw file 副本放在 `inputs/raw/`。
- Project Manifest 中的 resource path 必须是项目相对 POSIX 路径，不保存用户源文件绝对路径。
- raw file resource 以 sha256 checksum 去重；重复添加同一内容应返回已有 resource。
- `project-v1` 之外的 manifest schema 不做 silent migration，当前返回 `invalid_input`。
- Parser Plugins 当前输出 ChemicalObjectDraft + provenance + warnings，不写 Project Store，不登记 ChemicalObject，不生成 ReactionGraph/EnergyProfile。
- Parser Fixture Harness 当前只存在于测试边界，通过 `tests/fixtures/parsers/manifest.yaml`、`tests/fixtures/parsers/support-matrix.yaml` 和 golden snapshot 验证 ParserRegistry 输出及 fixture-backed 支持边界；它不属于 `rxnflow.parsers` runtime API，不调用 Project Store、Import Workflow、Chemical Registry、Reaction Graph、Energy Engine 或 Report Export。
- Parser Fixture Corpus 当前覆盖 synthetic MAPLE sp/opt `.out`、synthetic MAPLE path `.xyz` partial、synthetic Gaussian cclib `.log`、synthetic ORCA cclib `.out`、standard XYZ geometry-only、ASE extxyz energy/charge/spin、ASE extxyz missing energy 和 bad XYZ count expected-error 样例；`support-matrix.yaml` 覆盖当前 9 个 manifest fixture ids，并把 MAPLE `.sum`、AutoNEB tree JSON 和 MD thermo artifact 记录为 reference-only；这些条目只固定当前 fixture-backed 解析边界，不声明真实第三方输出的完整版本支持矩阵。
- Parser Corpus Developer Guide 当前只记录开发者和 agent 维护流程，不新增 runtime API、fixture、diagnostic code、用户指南、UI、CLI command 或 Web route；真实第三方输出进入 corpus 前必须按该指南确认 source policy、redistributable、license 和 redaction。
- Import Preview Parser Regression 当前只存在于测试边界，用 parser fixture corpus 驱动 `ImportRegistryWorkflow.import_files` 和 `PlatformShellService(import.preview)`，验证 supported/partial fixture 进入 ParsePreview 后保留 parser_id、parser_version、object_count、warning codes、raw_resource/provenance linkage，并验证 expected parser failure 保留 raw resource 和 error code；它不确认导入、不登记 ChemicalObject、不新增 runtime API。
- Chemical Registry 当前接收 ParseResult 并登记 ChemicalObject；它不解析文件、不写 Project Store、不生成 ReactionGraph/EnergyProfile。
- ChemicalObject 当前携带 `registry_fingerprint`，用于持久化后恢复 ChemicalRegistry 的同来源同 draft 内容幂等索引；它不是化学相似度指纹，不用于自动合并。
- ChemicalRegistry 当前提供 `list_objects` 和 `restore_objects`，用于把已持久化 ChemicalObject 恢复为 project-scoped registry state；restore 不重新 parse raw file，也不调用 `register` 重新计算 fingerprint。
- Import Registry Workflow 当前是 ProjectStore、ParserRegistry 和 ChemicalRegistry 之间的核心编排层；它负责 raw file resource 登记、RawFile adapter、parse preview、用户/agent 确认和 batch/item 状态读取。
- Import Registry Workflow 的导入分两阶段：`import_files` 只复制 raw file 并生成 ParsePreview，`confirm_import` 才把选中的 ParseResult objects 登记进 ChemicalRegistry。
- 批量导入允许单文件失败；parse/add/register 错误记录在 ImportItem，project-level 错误才使整个 workflow 返回 Result error。
- 解析失败或格式不支持时 raw file resource 仍保留在 Project Directory 中；ImportBatch 和 ParsePreview 可通过 `import-ledger-v1` 保存到 Project Content。
- Import Registry Workflow 当前提供 `restore_batches`，用于把已持久化 ImportBatch 恢复为 project-scoped batch state；restore 不调用 `import_files`、ParserRegistry 或 ChemicalRegistry.register。
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
- Gaussian/ORCA 解析通过 cclib adapter 隔离；Gaussian DFT method 优先使用 cclib `metadata.functional`，ORCA DFT method 可从已知 `metadata.keywords` functional token 恢复，避免把具体泛函退化为泛称 `DFT`；XYZ/extxyz 解析通过标准 XYZ 解析器和 ASE extxyz adapter；MAPLE parser 只读已有 `.out` / `.xyz` 输出文件。
- cclib/ASE 提供的 eV energy 必须转换为 hartree 后进入 `EnergyValue`；MAPLE 明确标注 Hartree 的 energy 直接进入 hartree。
- 内置 fixture 只表达核心数据流，不代表真实化学体系；parser fixture corpus 当前仍是 synthetic / file-level 回归样例，`parser-support-matrix-v1` 只声明这些 fixture 和 reference-only artifacts 的字段边界，不替代 Gaussian/ORCA/MAPLE 真实版本支持矩阵。
- 相对能量计算必须记录基线和单位；缺失能量不得默认为 0。
- Energy Engine 当前只读取传入的 ReactionGraph 和 ChemicalObject 集合，不解析、不登记、不持久化、不导出，也不修改 graph/object 状态。
- Energy Engine 的多对象节点能量当前按所有 ChemicalObject 的指定 energy key 以隐含系数 1 求和；更复杂的计量系数和热化学表达式尚未实现。
- Energy Engine 的校正项计入由 `EnergyOptions.include_corrections` 显式控制；启用时所有 Correction.energy 作为加性项叠加，正负号由 correction value 表达。
- Energy Engine 输出单位当前支持 `kcal_mol` 和 `kj_mol`；参与相减前必须统一转换到输出单位。
- Energy Engine 的 baseline 节点缺失能量时返回 `missing_energy`；非 baseline 点缺失能量时可返回带 `missingReason` 的 EnergyPoint 和 warning。
- Energy Profile Persistence 当前保存物化后的 EnergyProfile snapshot，而不是计算 recipe；load/save 不调用 EnergyProfileEngine，不比较当前 ChemicalObject energy/corrections 是否已变化。
- `energy-profiles-v1` 中的 point energy 必须是 `{value, unit, reference}` 对象，unit 必须匹配 EnergyOptions.output_unit；missing point 必须只有 missing_reason，不允许混入 absolute/relative energy。
- `energy-profiles-v1` 加载时基于已加载 ReactionGraph 校验 graph_id、path_id、points[].node_id 顺序和 baseline_node_id；引用缺失或顺序错位返回结构化错误。
- Report Export Service 当前只消费调用方传入的已加载对象，不从 Project Store 读取 graph/profile，也不写 manifest 或登记 ProjectResource。
- Report Export Service 当前支持 `png`、`cdxml` 和 `xlsx` 三种 ExportFormat；其他格式返回 `invalid_input`。
- XLSX 导出当前生成 structure-first 的 `Energy Table`，并可附加 `Energy Profile` 和 `Warnings` sheet；模型中没有的 basis function、Shermo/Whitesides 校正等字段留空或由调用方 table_rows 提供。
- PNG 和 CDXML 导出共用 Energy Diagram Route；missing point 保留断点和 warning，不编造相对能量。
- CDXML 当前只生成可编辑能量图对象，包括 state line、connector、label、relative value、axis、fonttable 和 colortable；不生成分子结构级 CDXML、generic reaction scheme 或 CDX。
- PNG/XLSX writer 依赖 Pillow / XlsxWriter，但依赖在 adapter 内延迟 import，缺失时返回 `export_failed`。
- ExportArtifactRecord 与运行时 ExportArtifact 分离；长期索引只保存项目相对 path、format、checksum、metadata 和 created_at，不保存 ExportArtifact.bytes 或运行时绝对 path。
- `export-artifacts-v1` 的 record.path 第一版必须位于 `exports/` 下；checksum 必须是 `sha256:<64 hex>`。section codec 只做 shape 校验；Project Content Validation 会读取 artifact file bytes 复算 checksum。
- Project Bundle 当前通过 `rxnflow.project_bundle` 提供 ProjectBundleService 和 ProjectBundleSummary；它只复制项目文件，不解析 raw files、不恢复 session、不重新计算或导出报告。
- Bundle export 只打包 `.rxnflow/`、`inputs/raw/` 和 `exports/`，跳过 `.DS_Store` 等系统元数据；如果 `.rxnflow/state/project-content.json` 存在，导出前必须通过 Project Content Validation。
- Bundle import 先校验 zip entry 安全性和唯一 Bundle Root，再临时解包、加载 manifest、按需 validation，最后在目标目录中无覆盖落地。
- Platform Shell 当前通过 `rxnflow.platform` 提供 ShellCommand、ShellResponse、ShellArtifact、PlatformSession、AppKernel、PlatformShellService 和 handle_platform_payload。
- AppKernel 只做核心服务装配，不复制 parser、registry、graph、energy、export 或 bundle 复制逻辑。
- PlatformShellService 当前支持 `fixture.run`、`project.create`、`project.load`、`project.open`、`project.save_content`、`project.export_bundle`、`project.import_bundle`、`import.preview`、`import.register_all`、`workspace.open`、`workspace.add_node`、`workspace.connect`、`workspace.set_path`、`energy.compute` 和 `export.profile` 命令。
- ShellResponse 是端侧 JSON 投影边界；dataclass、Path、tuple 和 bytes 不直接穿过该边界。
- ShellArtifact 默认不内联二进制；显式 `include_bytes=True` 时使用 base64 并在 metadata 中记录 encoding。
- `project.open(load_content=True)` 先调用 ProjectContentStore.validate_project；validation error 返回 `project_content_invalid`，不做部分恢复；validation 通过后再 load_snapshot 并依次恢复 objects、import batches、reaction graphs 和 workspaces，energy profiles/export artifact records 存入 session。
- `project.open(load_content=False)` 和 `project.load` 都保持 manifest-only session，不读取 Project Content。
- `project.save_content` 基于当前进程内 session 构造 ProjectContentSnapshot 并写回 ProjectContentStore；CLI 当前不暴露 save-content，因为 CLI 是一次性进程，没有跨命令 session。
- Platform Shell restore/save 不重新 parse raw files、不确认 import、不重新计算 energy profile、不重新导出 report；runtime ShellArtifact 只有路径位于当前项目 `exports/` 下时才转换为长期 ExportArtifactRecord，其余情况作为 warning 保留。
- `project.export_bundle` / `project.import_bundle` 是项目包传输入口，不创建或复用 PlatformSession；import 成功后调用方需要显式 `project.open` 才能恢复运行态内容。
- Platform Session 只在进程内有效；跨进程内容恢复依赖 ProjectContentStore 和各核心服务 restore API，不由 PlatformSession 自身持久化。
- CLI 当前通过 `python3 -m rxnflow.cli` 暴露标准库 argparse 入口，错误命令返回非 0 exit code；CLI project open 支持默认恢复内容和 `--manifest-only`，CLI project export-bundle/import-bundle 支持 JSON 摘要。
- Web Payload Adapter 当前只接收/返回 dict，不引入 Web framework、route、server、worker、桌面窗口或打包入口。
- Web Runtime Boundary 当前通过 `docs/dev/web-runtime-boundary.md` 和 `tests/test_web_runtime_boundary.py` 落地；它确认 Shell Payload POC 可 JSON 序列化，并记录 local-first、browser project repository、stateless http-api 和 transport 边界。真实 Web app shell 由独立 Web Workbench 模块承载；HTTP route 和 Browser Project Repository adapter 仍未实现。
- Project Content Store 当前通过 `rxnflow.content_store` 提供 ProjectContentIndex、ProjectContentFile、ProjectContentSnapshot、ProjectContentValidationIssue、ProjectContentValidationReport、ProjectContentMigrationPlan、ProjectStorageBackend、LocalProjectStorageBackend、ProjectContentValidator 和 ProjectContentStore。
- Project Content Store 当前写入 `.rxnflow/state/project-content.json`、`chemical-objects.json`、`reaction-graphs.json`、`workspaces.json`、`energy-profiles.json`、`import-ledger.json` 和 `export-artifacts.json`；其中 `chemical-objects.json` 使用 `chemical-objects-v1` 长期 codec 保存真实 ChemicalObject、provenance、registry fingerprint 和 append-only corrections，`reaction-graphs.json` 使用 `reaction-graphs-v1` 长期 codec 保存真实 ReactionGraph/ReactionPath，`workspaces.json` 使用 `workspaces-v1` 长期 codec 保存 workspace-only 状态，`import-ledger.json` 使用 `import-ledger-v1` 保存 ImportBatch/ImportItem/ParsePreview 状态，`energy-profiles.json` 使用 `energy-profiles-v1` 保存已计算 EnergyProfile、EnergyOptions、EnergyPoint 和 warnings，`export-artifacts.json` 使用 `export-artifacts-v1` 保存 ExportArtifactRecord 索引。
- Project Content Store 不修改 `.rxnflow/manifest.json` schema，不登记 ProjectResource，不读取或解析 `inputs/raw/`。
- LocalProjectStorageBackend 只处理项目相对 POSIX path 和 bytes；不理解 ChemicalObject、ReactionGraph、WorkspaceSnapshot 或 EnergyProfile 领域语义。
- BrowserLocalProjectStorageBackend 当前通过 `rxnflow.browser_storage` 提供浏览器本地存储协议测试替身；它实现 read/write/exists/list/delete、project_ref 隔离、checksum、metadata 和 quota 错误语义，但不是真实 JS IndexedDB / OPFS adapter。
- ProjectContentValidator 只读 `.rxnflow/state/`、`.rxnflow/manifest.json` 和 `exports/...`，聚合 index/schema/path/checksum/codec/cross-ref/artifact issues；它不修复、不删除、不写回项目文件。
- ProjectContentStore 当前暴露 `validate_project(project_ref)` 和 `migration_plan(project_ref, target_schema_version="project-content-v1")`；`load_snapshot` 不自动 migration。
- `project-content-v1`、`chemical-objects-v1`、`reaction-graphs-v1`、`workspaces-v1`、`import-ledger-v1`、`energy-profiles-v1` 和 `export-artifacts-v1` 不做 silent fallback；index 缺失、schema 不兼容、坏 JSON、不安全 path、裸 energy、unsupported unit、重复 object/graph/workspace/profile/artifact/node/edge/path id、缺失 object/node/edge/path/workspace/profile 引用、非法 viewport、profile point energy/missing_reason 冲突、artifact path/checksum/metadata shape 错误和 warning shape 错误等返回结构化错误。
- 待补：真实 Gaussian/ORCA/MAPLE fixture coverage、Gaussian/ORCA/MAPLE/XYZ/extxyz 支持版本边界；当前 support matrix 只覆盖 synthetic/reference-only corpus，MAPLE `.sum`、AutoNEB tree JSON、MD thermo 和 path topology 语义仍未解析。
- 待补：真实图谱编辑 UI 渲染、画布布局持久化与端侧交互协议。
- 待补：组合报告、报告预览、图谱画布截图、CDX、PDF/PPTX/SVG/CSV 等导出能力边界。

## 5. 已知约束 / 硬边界

- 原始计算输出由外部程序生成，RxnFlow 不负责计算任务调度本身。
- 初始导出格式优先支持 PNG、ChemDraw/CDXML 与能量 Excel 表格。
- 设计上需要避免单一前端或单一桌面端绑定，核心领域逻辑应尽量和平台壳层解耦。
- Web 端不得直接复制 parser、registry、reaction graph、energy 或 export 领域逻辑；必须通过 Shell Client / Shell Response 投影调用核心能力。
- Web Workbench 当前三栏工作台结构用于承载后续 panel，但视觉风格、组件库、配色和密度尚未冻结。
- Web MVP 第一版不购买或绑定云存储；账号、跨设备同步、冲突合并和多人协作不属于当前 Web Workbench MVP 边界。
- 待补：支持的计算程序版本、解析容错策略、单位体系与能量基准约定。
