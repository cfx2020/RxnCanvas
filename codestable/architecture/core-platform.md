---
doc_type: architecture
slug: core-platform
status: current
created: 2026-05-02
last_reviewed: 2026-05-04
tags: [core, fixture, domain-model, energy-profile]
---

# Core Platform

## 1. 当前能力

RxnFlow 当前已经落地六类核心能力。

第一类是内置 fixture 的最小核心链路：

1. 创建内存 ProjectManifest。
2. 将两个内置 ChemicalObjectDraft 登记为 ChemicalObject。
3. 构造两个 species 节点、一条边和一条 path 的 ReactionGraph。
4. 使用 `electronic` 能量键计算以第一个节点为基线的 EnergyProfile。

第二类是可落盘的 Project Store 项目目录协议：

1. 创建 Project Directory。
2. 写入 `.rxnflow/manifest.json`。
3. 创建 `inputs/raw/` 作为 raw file 副本目录。
4. 加载和保存 `project-v1` ProjectManifest。
5. 将外部 raw file 复制进项目目录，并在 manifest 中登记 `raw_file` ProjectResource。

第三类是 Parser Plugins 基线：

1. 使用 RawFile / ParserCapability / ParseOptions / ParseResult / ParserPlugin 定义插件协议。
2. 通过 ParserRegistry 对单个 RawFile 做插件选择、冲突处理和 parse 调用。
3. 用 cclib adapter 支持 Gaussian log 和 ORCA output 的基础字段映射。
4. 支持标准 XYZ 和 ASE extxyz 的结构与可用 metadata 解析。
5. 支持 MAPLE `.out` 基础字段和 MAPLE 风格多帧 `.xyz` energy 注释解析。

第四类是 Chemical Registry 基线：

1. 接收 `ParseResult(ChemicalObjectDraft[], provenance)` 并登记为项目内 ChemicalObject。
2. 按 project id 隔离 ChemicalObject 状态，并提供 object id 查询。
3. 使用 registry fingerprint 保证同项目内同来源、同 draft 内容的重复登记幂等。
4. 支持追加 resonance、solvation、manual 三类 append-only Correction。
5. 对 correction id 做幂等和冲突检测。

第五类是 Reaction Graph 协议：

1. 使用 GraphPatch 定义 UI 和 agent 共用的图谱修改操作。
2. 通过 ReactionGraphService 创建项目内空 ReactionGraph。
3. 支持 add/update node、add/update edge、remove 和 set_path patch。
4. 支持同一 graph 保存多条 ReactionPath，用多路径表达分叉。
5. 校验 node/object/edge/path 引用，patch 批次失败时不写回 graph state。

第六类是 Energy Engine：

1. 通过 EnergyProfileEngine 从指定 ReactionGraph / ReactionPath 和 ChemicalObject 集合计算 EnergyProfile。
2. 支持 `hartree`、`kcal_mol`、`kj_mol` 输入，并统一输出为 `kcal_mol` 或 `kj_mol`。
3. 支持多对象节点按隐含系数 1 求和。
4. 通过 `include_corrections` 显式控制是否叠加 ChemicalObject 上的 Correction.energy。
5. baseline 缺失能量时返回 `missing_energy`；非 baseline 缺失点保留为带 `missing_reason` 的 EnergyPoint 和 warning。

这些能力不提供 UI/CLI 产品入口，也不导出 PNG、CDXML 或 Excel。fixture 链路仍是开发/测试用垂直切片；Project Store 只负责项目目录、manifest 和 raw file 资源索引；Parser Plugins 只把 RawFile 解析为 ChemicalObjectDraft；Chemical Registry 只登记对象和追加校正项；Reaction Graph 只维护节点、边、路径和 patch 操作，不持久化对象内容或计算能量；Energy Engine 只读取传入 graph/object 数据并生成 profile 数据，不修改项目状态。

## 2. 模块与职责

```
run_core_fixture_vertical_slice
├── project.create_project
├── registry.register_fixture_objects
├── graph.build_fixture_graph
└── energy.compute_fixture_profile

ProjectStore
├── create_project
├── load_project
├── save_project
└── add_raw_file

ParserRegistry
├── can_parse over ParserPlugin[]
├── select plugin by confidence
├── plugin.parse(RawFile)
└── ParseResult(ChemicalObjectDraft[], provenance)

ChemicalRegistry
├── register(project_id, ParseResult)
├── get_object(project_id, object_id)
└── apply_correction(project_id, object_id, Correction)

ReactionGraphService
├── create_graph(project_id, label?)
├── apply_patch(project_id, graph_id, GraphPatch[], object_ids?)
└── list_paths(project_id, graph_id)

EnergyProfileEngine
└── compute_profile(project_id, graph, path_id, objects, options)
```

- `rxnflow.models`：核心值对象，包括 ProjectManifest、ChemicalObject、ReactionGraph、EnergyProfile、Result 相关承载类型。
- `rxnflow.project`：内存项目 manifest helper，以及文件系统 Project Store workflow。
- `rxnflow.project_manifest`：`project-v1` manifest JSON 与 dataclass 的序列化/反序列化边界。
- `rxnflow.parsers.contracts`：RawFile、ParserFormat、ParserCapability、ParseOptions、ParseResult、ParserPlugin。
- `rxnflow.parsers.registry`：ParserRegistry 插件选择、unsupported/ambiguous 分支和 parse 统一入口。
- `rxnflow.parsers.cclib_adapter`：Gaussian/ORCA 的 cclib adapter，把 cclib data 映射为 ChemicalObjectDraft。
- `rxnflow.parsers.xyz`：标准 XYZ 解析和 ASE extxyz adapter。
- `rxnflow.parsers.maple`：MAPLE `.out` 基础字段和 MAPLE 多帧 `.xyz` 解析。
- `rxnflow.registry`：fixture object draft 到 ChemicalObject 的登记和 provenance 附加；通用 ChemicalRegistry 的项目内对象登记、查询、fingerprint 幂等去重和 correction 追加。
- `rxnflow.graph`：fixture graph 构造；通用 ReactionGraphService 的项目内图谱创建、GraphPatch 应用、路径列表和 node/object/edge/path 引用校验。
- `rxnflow.energy`：fixture energy profile 计算；通用 EnergyProfileEngine 的 path 选择、baseline 解析、节点总能量、单位转换、correction inclusion 和缺失点诊断。
- `rxnflow.fixture`：默认 fixture scenario 和垂直切片编排入口。

## 3. 数据与状态

核心 fixture 使用稳定、可重复的标识：

- Project：`project-fixture-minimal-reaction`
- ChemicalObject：`object-a`、`object-b`
- ReactionGraph：`graph-a-b`
- ReactionPath：`path-a-b`
- EnergyProfile：`profile-a-b-electronic`

默认能量输入：

- `object-a.electronic = -100.000000 hartree`
- `object-b.electronic = -99.980000 hartree`

默认输出：

- `node-a.relativeEnergy = 0 kcal_mol`
- `node-b.relativeEnergy = 12.55018948 kcal_mol`

Project Store 使用以下稳定目录与 manifest 协议：

```
<project>/
├── .rxnflow/
│   └── manifest.json
└── inputs/
    └── raw/
```

- 当前 manifest schema version：`project-v1`
- Manifest 文件：`.rxnflow/manifest.json`
- Raw file 副本目录：`inputs/raw/`
- Raw file resource path：项目相对 POSIX 路径，例如 `inputs/raw/<sha-prefix>-input.log`
- Raw file checksum：`sha256:<hex>`
- Raw file metadata：当前记录 `source_name` 和 `byte_size`

Parser Plugins 使用以下稳定协议：

- ParserFormat：`gaussian-log`、`orca-output`、`xyz`、`extxyz`、`maple-output`、`maple-xyz`、`unknown`
- RawFile：`id`、`name`、`path`、`content`、`mime_type`、`size`
- ParseResult：`ChemicalObjectDraft[]` + `Provenance`
- Provenance：`source_file_id`、`parser_id`、`parser_version`、`parsed_at`
- warnings：继续解析但字段缺失、单位假设或格式歧义时通过 `Result.warnings` 返回

当前 parser 能力边界：

- Gaussian/ORCA：通过 cclib adapter 读取基础字段；cclib 的 `scfenergies` 按 eV 转 hartree。
- XYZ：标准 XYZ 解析元素和坐标；缺失 energy 返回 `missing_section` warning。
- extxyz：通过 ASE 读取 geometry 和可用 metadata；energy 按 ASE eV 语义转 hartree。
- MAPLE：解析 `.out` 中 task/model、坐标、Hartree energy；解析 MAPLE 风格 `.xyz` 中 `Image N` / `Frame N` 和 energy 注释。

Chemical Registry 当前使用以下稳定协议：

- ChemicalRegistry 入口：`register(project_id, parse_result)`、`get_object(project_id, object_id)`、`apply_correction(project_id, object_id, correction)`
- 登记输入：Parser Plugins 输出的 `ParseResult`
- 登记输出：带 registry 生成 id、source_file_id、provenance、corrections 的 `ChemicalObject`
- Registry fingerprint：`source_file_id`、`parser_id`、`parser_version`、draft index 和 draft 内容的哈希
- Correction kind：`resonance`、`solvation`、`manual`
- Correction 行为：append-only，不改写 ChemicalObject 原始 `energies` / `thermochemistry`

Reaction Graph 当前使用以下稳定协议：

- GraphPatch op：`add_node`、`update_node`、`add_edge`、`update_edge`、`remove`、`set_path`
- ReactionGraphService 入口：`create_graph(project_id, label)`、`apply_patch(project_id, graph_id, patches, object_ids)`、`list_paths(project_id, graph_id)`
- ReactionNode kind：`species`、`transition_state`、`group`、`annotation`
- species / transition_state 节点必须引用至少一个 ChemicalObject id
- annotation / group 节点允许不引用 ChemicalObject
- 分叉路径表达：同一 ReactionGraph 的多条 ReactionPath
- remove node 行为：删除节点，并级联删除相关 edge 和包含该 node 的 path

Energy Engine 当前使用以下稳定协议：

- EnergyProfileEngine 入口：`compute_profile(project_id, graph, path_id, objects, options)`
- 计算输入：已加载的 ReactionGraph、selected ReactionPath id、ChemicalObject 集合和 EnergyOptions
- baseline 规则：`baseline_node_id` 为空时使用 selected path 第一个 node；非空时必须属于 selected path
- node total energy：对 node 引用的所有 ChemicalObject 取 `options.energy_key` 并按隐含系数 1 求和
- correction inclusion：`include_corrections=True` 时叠加每个对象上的所有 Correction.energy；`False` 时忽略 corrections 且不改写原始 energy channel
- unit conversion：输入 `hartree`、`kcal_mol`、`kj_mol`，输出 `kcal_mol` 或 `kj_mol`
- missing point：baseline 缺失直接失败；非 baseline 缺失返回带 `missing_reason="missing_energy"` 的 EnergyPoint 和 warning

## 4. 错误语义

核心模块使用 `Result<T>` 边界协议。正常结果返回 `ok=True` 和 `value`；错误返回 `ok=False` 和 `RxnFlowError`。

当前已落地错误：

- `invalid_input`：fixture 缺少对象、对象缺少能量通道、请求 correction 或 unsupported fixture unit。
- `invalid_input`：Project Store 中 manifest 缺失、manifest JSON 损坏、schema 不兼容、source_path 不存在或不是普通文件、resource path 不安全。
- `invalid_input`：Parser Registry 中 RawFile 同时缺少 content 和有效 path。
- `invalid_input`：Chemical Registry 中 project id 缺失、ParseResult.objects 为空、ChemicalObject 不存在、Correction id 缺失或同 id correction 内容冲突。
- `invalid_input`：ReactionGraphService 中 project id 为空、graph id 不存在、GraphPatch 缺少必须 payload 或 patch 字段不支持。
- `invalid_input`：EnergyProfileEngine 中 project id 为空、energy key 为空、output unit 不支持或 EnergyValue unit 不支持。
- `unsupported_format`：没有插件支持、置信度不足或插件选择歧义。
- `parse_failed`：XYZ/MAPLE/cclib/ASE adapter 无法解析输入或字段映射失败。
- `internal_error`：Project Store 中 manifest 读写、raw file 复制或 source stat 的 I/O 失败。
- `internal_error`：extxyz 解析缺少 ASE 依赖。
- `graph_invalid`：node、edge、path 或 object 引用不存在，graph patch 重复 id，或 species / transition_state 节点缺少 ChemicalObject 引用。
- `graph_invalid`：EnergyProfileEngine 中 selected path 不存在、baseline 不在 path 中、path 引用缺失 node 或 node 引用缺失 ChemicalObject。
- `missing_energy`：请求的 energy key 在对应 ChemicalObject 中不存在。

缺失能量不得默认为 0；图谱引用错误不得继续计算 EnergyProfile。EnergyProfileEngine 中 baseline 缺失能量返回 `missing_energy`；非 baseline 节点缺失能量时允许返回包含缺失点和 warning 的 profile。

Project Store 不兼容 schema 不做 silent migration；当前只支持 `project-v1`。Manifest resource path 不允许绝对路径、空路径、`.` 或包含 `..`。

Chemical Registry 重复登记同一 ParseResult 时返回既有对象，不追加重复 ChemicalObject。重复提交同 id 且内容相同的 Correction 时幂等返回；同 id 不同内容返回 `invalid_input`。

ReactionGraphService 按顺序应用 patch；同一批 patches 中途失败时不写回 graph state。重复 set 同一 path id 会覆盖旧 path，add node/edge 遇到重复 id 返回 `graph_invalid`。

EnergyProfileEngine 不持久化 profile，也不写回 graph/object state；返回的 EnergyProfile.options 会记录实际 baseline node、energy key、output unit 和 correction inclusion。

## 5. 约束与边界

- 内置 fixture 不代表真实化学体系，不作为推荐反应示例。
- Project Store 不保存用户源文件的绝对路径；manifest 只保存项目相对路径。
- `add_raw_file` 只复制文件和登记 resource，不解析 Gaussian、ORCA、XYZ 或任何计算输出内容。
- Parser Plugins 不写 `.rxnflow/manifest.json`，不调用 ProjectStore.save_project，不登记 ChemicalObject，不生成 ReactionGraph/EnergyProfile。
- Chemical Registry 不调用 Parser Plugin 实现，不读取 raw file，不写 `.rxnflow/manifest.json`，不生成 ReactionGraph、EnergyProfile 或 export artifact。
- Chemical Registry 不基于 formula、label、energy 接近或 geometry 相似度自动合并对象。
- Correction 是 additive energy correction 的记录；正负号由用户输入值表达，是否参与能量计算由后续 Energy Engine 显式控制。
- ReactionGraphService 不调用 Chemical Registry、Parser Plugin、Project Store、Energy Engine 或 Export Service；它只接收 object id 集合作为引用校验输入。
- EnergyProfileEngine 不调用 Project Store、Parser Registry、Parser Plugins、ChemicalRegistry.apply_correction、ReactionGraphService.apply_patch 或 Export Service。
- EnergyProfileEngine 只读取传入的 ReactionGraph 和 ChemicalObject 集合，不登记对象、不修改 graph、不追加 correction、不写 `.rxnflow/manifest.json`。
- GraphPatch 不包含 UI 状态，不负责自动布局、拖拽、缩放或选中态。
- transition_state 节点只表达用户/上游对象语义，不判断虚频或结构特征。
- 多对象节点当前只表达同一状态包含多个对象，各对象隐含计量系数为 1；复杂化学计量留待后续 feature。
- MAPLE parser 不运行 MAPLE、PyTorch、ML potential 或外部计算，只解析已有输出文件。
- cclib 和 ASE 是 Parser Plugins 当前依赖边界；依赖锁定方式仍待后续包管理决策。
- 同一项目内重复添加相同 checksum 的 raw file 返回已有 resource，不追加重复条目。
- 当前只持久化 manifest 和 raw file resource，不持久化 ChemicalObject、ReactionGraph、EnergyProfile 的完整内容。
- fixture helper 仍只计算单对象 species 节点并输出 `kcal_mol`，用于保持最小垂直切片兼容。
- 通用 EnergyProfileEngine 可计算多对象节点，energy key 由 EnergyOptions 指定，输出支持 `kcal_mol` 和 `kj_mol`。
- `HARTREE_TO_KCAL_MOL = 627.509474` 是当前显式使用的转换常量。
- `KCAL_MOL_TO_KJ_MOL = 4.184` 是当前 kcal/mol 与 kJ/mol 的转换常量。
- 化学计量系数、多组分能量表达式、过渡态化学判定、热化学表达式、溶剂化公式和曲线绘图尚未实现。
- Gaussian/ORCA 真实 fixture corpus、MAPLE `.sum`/AutoNEB tree/MD thermo/IRC path 语义建模尚未实现。
