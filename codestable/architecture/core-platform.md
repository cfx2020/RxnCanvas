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

RxnFlow 当前已经落地一条内置 fixture 的最小核心链路：

1. 创建内存 ProjectManifest。
2. 将两个内置 ChemicalObjectDraft 登记为 ChemicalObject。
3. 构造两个 species 节点、一条边和一条 path 的 ReactionGraph。
4. 使用 `electronic` 能量键计算以第一个节点为基线的 EnergyProfile。

该能力是开发/测试用的垂直切片，不解析真实计算输出文件，不创建持久化项目目录，不提供 UI/CLI 产品入口，也不导出 PNG、CDXML 或 Excel。

## 2. 模块与职责

```
run_core_fixture_vertical_slice
├── project.create_project
├── registry.register_fixture_objects
├── graph.build_fixture_graph
└── energy.compute_fixture_profile
```

- `rxnflow.models`：核心值对象，包括 ProjectManifest、ChemicalObject、ReactionGraph、EnergyProfile、Result 相关承载类型。
- `rxnflow.project`：内存项目 manifest 创建和资源列表附加。
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

## 4. 错误语义

核心模块使用 `Result<T>` 边界协议。正常结果返回 `ok=True` 和 `value`；错误返回 `ok=False` 和 `RxnFlowError`。

当前已落地错误：

- `invalid_input`：fixture 缺少对象、对象缺少能量通道、请求 correction 或 unsupported fixture unit。
- `graph_invalid`：node、edge、path 或 object 引用不存在。
- `missing_energy`：请求的 energy key 在对应 ChemicalObject 中不存在。

缺失能量不得默认为 0；图谱引用错误不得继续计算 EnergyProfile。

## 5. 约束与边界

- 内置 fixture 不代表真实化学体系，不作为推荐反应示例。
- 当前只计算单对象 species 节点的单一 `electronic` energy key。
- 当前只输出 `kcal_mol` 相对能量。
- `HARTREE_TO_KCAL_MOL = 627.509474` 是当前显式使用的转换常量。
- 多组分态、过渡态行为、分叉路径、校正项计算、热化学表达式和溶剂化公式尚未实现。
- Gaussian、ORCA、XYZ 等真实解析器尚未实现，后续应通过 parser plugin roadmap item 接入。
