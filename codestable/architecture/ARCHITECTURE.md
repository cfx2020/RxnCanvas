# RxnFlow 架构总入口

> 状态：当前
> 创建日期：2026-05-01
> 最近更新：2026-05-04

## 1. 项目简介

RxnFlow 是一款面向计算化学结果的反应路径登记、图谱组装与可视化报告生成应用。项目依托外部生成的 Gaussian 日志、ORCA 输出、MAPLE/ASE XYZ 等原始计算输出文件，解析分子结构、能量、热化学参数与计算条件，将其登记为可复用化学对象，并支持用户通过节点图谱编辑反应路径、预览反应网络、生成能量曲线与标准化报告。

产品定位是专注计算化学领域的图谱编辑器。架构设计需要优先考虑 agent 友好操作、模块化解耦，以及 Web、macOS app、Windows exe、Linux CLI 等多端适配。

## 2. 核心概念 / 术语表

- Project：用户创建的工作空间，用于组织导入文件、化学对象、反应图谱与导出报告。
- Project Directory：一个可落盘 RxnFlow 项目的根目录，当前固定包含 `.rxnflow/manifest.json` 和 `inputs/raw/`。
- Project Manifest：项目级结构化元数据，当前 schema version 为 `project-v1`，记录 project id/name/schemaVersion/resources。
- Raw Output：外部计算程序产生的原始输出文件，例如 Gaussian log、ORCA output、MAPLE/ASE XYZ。
- Raw File Resource：复制进 Project Directory 的原始输入文件索引项，manifest 只记录项目相对 path、sha256 checksum 和 metadata。
- Parser Plugin：核心层格式解析插件，声明 can_parse 能力并把单个 Raw File 解析为 ChemicalObjectDraft。
- Parse Result：单次解析产物，包含 ChemicalObjectDraft 列表、provenance 和 warnings。
- Chemical Object：从原始输出解析并登记的可复用对象，包含结构、电荷自旋、方法、能量、热化学参数、来源与校正项等信息。
- Chemical Registry：核心层对象登记服务，负责把 Parse Result 固化为项目内 Chemical Object，并维护来源追踪、基础去重和校正项追加。
- Correction：用户为化学对象补充的 append-only 能量校正项，例如谐振校正、溶剂化校正或手动校正。
- Reaction Graph：用户在画布上搭建的节点图谱，用于表达底物、催化剂、过渡态、中间体、产物及分叉反应路径。
- GraphPatch：UI 和 agent 共用的结构化图谱修改协议，当前支持添加/更新/删除节点与边，以及设置反应路径。
- Energy Engine：核心层能量 profile 计算服务，根据选定 ReactionPath 和 ChemicalObject 计算曲线可用的 EnergyProfile。
- Energy Profile：从选定反应路径计算得到的相对能量数据表与交互式能量曲线数据。
- Report Export：面向发布或复用的标准化导出结果，初期目标包括 PNG、ChemDraw/CDXML 与 Excel 能量表格。

## 3. 子系统 / 模块索引

- Project 管理：项目创建、侧边栏组织、项目级状态与资源索引。
- Import / Parser：批量导入原始计算输出，并解析结构、方法、能量、热化学参数等领域数据。
- Chemical Registry：登记、去重、版本化和复用化学对象及校正项。
- Graph Editor：节点画布、连线、分叉路径、反应网络编辑与实时预览。
- Energy Engine：路径选择、相对能量计算、数据表生成与曲线绘图。
- Export / Report：PNG、CDXML、Excel 等报告与数据导出。
- Platform Shells：Web、macOS、Windows、Linux CLI 等端侧包装与分发层。

当前已落地模块：

- [Core Platform](core-platform.md)：内置 fixture 的最小核心链路、可落盘的 Project Store 项目目录协议、首批 Parser Plugins、Chemical Registry 登记与校正项服务、Reaction Graph patch 协议，以及 Energy Engine 相对能量 profile 计算。

## 4. 关键架构决定

- 核心领域模型先以 UI/平台无关的 Python dataclass 落地；后续端侧壳层不得复制核心业务逻辑。
- 最小核心链路采用 `Result<T>` 风格返回成功/错误，跨模块错误不得静默吞掉。
- Project Store 当前使用 `.rxnflow/manifest.json` 保存 `project-v1` manifest，raw file 副本放在 `inputs/raw/`。
- Project Manifest 中的 resource path 必须是项目相对 POSIX 路径，不保存用户源文件绝对路径。
- raw file resource 以 sha256 checksum 去重；重复添加同一内容应返回已有 resource。
- `project-v1` 之外的 manifest schema 不做 silent migration，当前返回 `invalid_input`。
- Parser Plugins 当前输出 ChemicalObjectDraft + provenance + warnings，不写 Project Store，不登记 ChemicalObject，不生成 ReactionGraph/EnergyProfile。
- Chemical Registry 当前接收 ParseResult 并登记 ChemicalObject；它不解析文件、不写 Project Store、不生成 ReactionGraph/EnergyProfile。
- ChemicalObject 校正项是 append-only 的 Correction 记录，不改写 parser 原始 energy channel；是否计入能量由后续 Energy Engine 显式控制。
- 基础对象去重当前只保证同项目内同来源、同 draft fingerprint 的重复登记幂等，不基于分子式、标签、能量接近或几何相似度自动合并。
- Reaction Graph 当前通过 GraphPatch 修改；GraphPatch 是核心领域协议，不包含 selection、hover、viewport 等 UI 状态。
- Reaction Graph 只引用 ChemicalObject id，不复制 ChemicalObject、能量或 correction；object id 有效性由调用方提供集合进行校验。
- 分叉反应路径当前用多条 ReactionPath 表达，不新增 branch node 或 branch edge 类型。
- Gaussian/ORCA 解析通过 cclib adapter 隔离；XYZ/extxyz 解析通过标准 XYZ 解析器和 ASE extxyz adapter；MAPLE parser 只读已有 `.out` / `.xyz` 输出文件。
- cclib/ASE 提供的 eV energy 必须转换为 hartree 后进入 `EnergyValue`；MAPLE 明确标注 Hartree 的 energy 直接进入 hartree。
- 内置 fixture 只表达核心数据流，不代表真实化学体系，也不替代真实 Parser Plugin fixture corpus。
- 相对能量计算必须记录基线和单位；缺失能量不得默认为 0。
- Energy Engine 当前只读取传入的 ReactionGraph 和 ChemicalObject 集合，不解析、不登记、不持久化、不导出，也不修改 graph/object 状态。
- Energy Engine 的多对象节点能量当前按所有 ChemicalObject 的指定 energy key 以隐含系数 1 求和；更复杂的计量系数和热化学表达式尚未实现。
- Energy Engine 的校正项计入由 `EnergyOptions.include_corrections` 显式控制；启用时所有 Correction.energy 作为加性项叠加，正负号由 correction value 表达。
- Energy Engine 输出单位当前支持 `kcal_mol` 和 `kj_mol`；参与相减前必须统一转换到输出单位。
- Energy Engine 的 baseline 节点缺失能量时返回 `missing_energy`；非 baseline 点缺失能量时可返回带 `missingReason` 的 EnergyPoint 和 warning。
- 待补：多端共享核心与端侧适配边界。
- 待补：真实 Gaussian/ORCA/MAPLE fixture corpus 与支持版本边界。
- 待补：ChemicalObject、ReactionGraph、EnergyProfile 的内容持久化格式。
- 待补：图谱编辑 UI 状态、画布布局与端侧交互协议。
- 待补：报告导出格式的能力边界与第三方工具依赖策略。

## 5. 已知约束 / 硬边界

- 原始计算输出由外部程序生成，RxnFlow 不负责计算任务调度本身。
- 初始导出格式优先支持 PNG、ChemDraw/CDXML 与能量 Excel 表格。
- 设计上需要避免单一前端或单一桌面端绑定，核心领域逻辑应尽量和平台壳层解耦。
- 待补：支持的计算程序版本、解析容错策略、单位体系与能量基准约定。
