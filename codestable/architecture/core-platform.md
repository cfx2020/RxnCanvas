---
doc_type: architecture
slug: core-platform
status: current
created: 2026-05-02
last_reviewed: 2026-05-02
tags: [core, fixture, domain-model, energy-profile]
---

# Core Platform

## 1. 当前能力

RxnFlow 当前已经落地两类核心能力。

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

这些能力不解析真实计算输出文件，不提供 UI/CLI 产品入口，也不导出 PNG、CDXML 或 Excel。fixture 链路仍是开发/测试用垂直切片；Project Store 只负责项目目录、manifest 和 raw file 资源索引。

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
```

- `rxnflow.models`：核心值对象，包括 ProjectManifest、ChemicalObject、ReactionGraph、EnergyProfile、Result 相关承载类型。
- `rxnflow.project`：内存项目 manifest helper，以及文件系统 Project Store workflow。
- `rxnflow.project_manifest`：`project-v1` manifest JSON 与 dataclass 的序列化/反序列化边界。
- `rxnflow.registry`：fixture object draft 到 ChemicalObject 的登记和 provenance 附加。
- `rxnflow.graph`：fixture graph 构造，以及 node/object/edge/path 引用校验。
- `rxnflow.energy`：fixture energy profile 计算，支持 hartree 到 kcal/mol 的相对能量转换。
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

## 4. 错误语义

核心模块使用 `Result<T>` 边界协议。正常结果返回 `ok=True` 和 `value`；错误返回 `ok=False` 和 `RxnFlowError`。

当前已落地错误：

- `invalid_input`：fixture 缺少对象、对象缺少能量通道、请求 correction 或 unsupported fixture unit。
- `invalid_input`：Project Store 中 manifest 缺失、manifest JSON 损坏、schema 不兼容、source_path 不存在或不是普通文件、resource path 不安全。
- `internal_error`：Project Store 中 manifest 读写、raw file 复制或 source stat 的 I/O 失败。
- `graph_invalid`：node、edge、path 或 object 引用不存在。
- `missing_energy`：请求的 energy key 在对应 ChemicalObject 中不存在。

缺失能量不得默认为 0；图谱引用错误不得继续计算 EnergyProfile。

Project Store 不兼容 schema 不做 silent migration；当前只支持 `project-v1`。Manifest resource path 不允许绝对路径、空路径、`.` 或包含 `..`。

## 5. 约束与边界

- 内置 fixture 不代表真实化学体系，不作为推荐反应示例。
- Project Store 不保存用户源文件的绝对路径；manifest 只保存项目相对路径。
- `add_raw_file` 只复制文件和登记 resource，不解析 Gaussian、ORCA、XYZ 或任何计算输出内容。
- 同一项目内重复添加相同 checksum 的 raw file 返回已有 resource，不追加重复条目。
- 当前只持久化 manifest 和 raw file resource，不持久化 ChemicalObject、ReactionGraph、EnergyProfile 的完整内容。
- 当前只计算单对象 species 节点的单一 `electronic` energy key。
- 当前只输出 `kcal_mol` 相对能量。
- `HARTREE_TO_KCAL_MOL = 627.509474` 是当前显式使用的转换常量。
- 多组分态、过渡态行为、分叉路径、校正项计算、热化学表达式和溶剂化公式尚未实现。
- Gaussian、ORCA、XYZ 等真实解析器尚未实现，后续应通过 parser plugin roadmap item 接入。
