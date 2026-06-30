---
doc_type: decision
category: constraint
status: active
created: 2026-06-30
summary: "Reaction path 的 addition/release/participant 语义必须显式写入，不允许 heuristic fallback 自动拍板"
tags: [reaction-path, canvas, energy, constraint]
---

# 显式 reaction path semantics 约束

## 决定

RxnFlow 的 reaction path 中，`participant`、`addition`、`release` 和 `branch` 这类会影响路径能量和曲线解释的语义，必须由用户显式编辑并写入项目数据。

代码不允许保留“没有显式语义时，根据图结构 heuristic fallback 自动猜 addition/release”的路径。未标语义的节点按普通 path state 处理，未标语义的 edge 按普通 `path` 处理。

## 背景

用户的真实反应网络会包含中途释放物、加入物和多条分叉选择性路径。靠图拓扑自动猜测容易把 N2、Cl、3 等自由物质当普通 INT，或把分叉路径误归入主链；更麻烦的是，当显式语义和 heuristic 同时存在时，后续 bug 很难定位到底是谁在生效。

## 影响

- 画布 UI 需要提供手动标记入口，而不是把语义隐藏在自动算法里。
- 能量计算只能消费 `FlowNode.pathRole` / `FlowEdge.stepRole` 这类显式字段和默认 state/path。
- 自动建议可以作为后续功能出现，但只能给建议，不能直接作为计算 authority。
- 老项目没有这些字段时，不做 addition/release 自动补全；用户需要手动标记后才进入对应能量表达式。

## 替代方案

曾考虑保留 heuristic fallback 以兼容未标语义的旧图，但该方案会继续制造不可预期的路径解释，已明确放弃。
