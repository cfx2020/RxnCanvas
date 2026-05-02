# RxnFlow 架构总入口

> 状态：当前
> 创建日期：2026-05-01
> 最近更新：2026-05-02

## 1. 项目简介

RxnFlow 是一款面向计算化学结果的反应路径登记、图谱组装与可视化报告生成应用。项目依托外部生成的 Gaussian 日志、ORCA 输出、MAPLE/ASE XYZ 等原始计算输出文件，解析分子结构、能量、热化学参数与计算条件，将其登记为可复用化学对象，并支持用户通过节点图谱编辑反应路径、预览反应网络、生成能量曲线与标准化报告。

产品定位是专注计算化学领域的图谱编辑器。架构设计需要优先考虑 agent 友好操作、模块化解耦，以及 Web、macOS app、Windows exe、Linux CLI 等多端适配。

## 2. 核心概念 / 术语表

- Project：用户创建的工作空间，用于组织导入文件、化学对象、反应图谱与导出报告。
- Project Directory：一个可落盘 RxnFlow 项目的根目录，当前固定包含 `.rxnflow/manifest.json` 和 `inputs/raw/`。
- Project Manifest：项目级结构化元数据，当前 schema version 为 `project-v1`，记录 project id/name/schemaVersion/resources。
- Raw Output：外部计算程序产生的原始输出文件，例如 Gaussian log、ORCA output、MAPLE/ASE XYZ。
- Raw File Resource：复制进 Project Directory 的原始输入文件索引项，manifest 只记录项目相对 path、sha256 checksum 和 metadata。
- Chemical Object：从原始输出解析并登记的可复用对象，包含结构、电荷自旋、方法、能量与热化学参数等信息。
- Correction：用户为化学对象补充的校正项，例如谐振校正、溶剂化校正。
- Reaction Graph：用户在画布上搭建的节点图谱，用于表达底物、催化剂、过渡态、中间体、产物及分叉反应路径。
- Energy Profile：从选定反应路径计算得到的相对能量数据表与交互式能量曲线。
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

- [Core Platform](core-platform.md)：内置 fixture 的最小核心链路，以及可落盘的 Project Store 项目目录协议。

## 4. 关键架构决定

- 核心领域模型先以 UI/平台无关的 Python dataclass 落地；后续端侧壳层不得复制核心业务逻辑。
- 最小核心链路采用 `Result<T>` 风格返回成功/错误，跨模块错误不得静默吞掉。
- Project Store 当前使用 `.rxnflow/manifest.json` 保存 `project-v1` manifest，raw file 副本放在 `inputs/raw/`。
- Project Manifest 中的 resource path 必须是项目相对 POSIX 路径，不保存用户源文件绝对路径。
- raw file resource 以 sha256 checksum 去重；重复添加同一内容应返回已有 resource。
- `project-v1` 之外的 manifest schema 不做 silent migration，当前返回 `invalid_input`。
- 内置 fixture 只表达核心数据流，不代表真实化学体系，也不替代 Gaussian/ORCA/XYZ 解析器。
- 相对能量计算必须记录基线和单位；缺失能量不得默认为 0。
- 待补：多端共享核心与端侧适配边界。
- 待补：解析器插件接口与数据模型稳定层。
- 待补：ChemicalObject、ReactionGraph、EnergyProfile 的内容持久化格式。
- 待补：图谱编辑状态与 agent 操作接口。
- 待补：报告导出格式的能力边界与第三方工具依赖策略。

## 5. 已知约束 / 硬边界

- 原始计算输出由外部程序生成，RxnFlow 不负责计算任务调度本身。
- 初始导出格式优先支持 PNG、ChemDraw/CDXML 与能量 Excel 表格。
- 设计上需要避免单一前端或单一桌面端绑定，核心领域逻辑应尽量和平台壳层解耦。
- 待补：支持的计算程序版本、解析容错策略、单位体系与能量基准约定。
