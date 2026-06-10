---
doc_type: decision
category: architecture
date: 2026-06-10
slug: codestable-hidden-root
status: active
area: codestable
tags: [codestable, docs, workflow]
---

## 背景

RxnFlow 早期把 CodeStable 产物放在 `codestable/`。但当前本地 `cs` 技能的启动约定要求读取 `.codestable/attention.md`，并以 `.codestable/` 判断仓库是否接入 CodeStable。目录名不一致会导致技能启动时误判骨架不完整，后续 feature、issue、roadmap、decision 等流程都需要额外解释。

## 决定

项目内 CodeStable 根目录统一为 `.codestable/`。所有 CodeStable 产物、工具脚本、roadmap、feature、issue、architecture、requirements、compound 和 reference 文档都从 `.codestable/` 读取和维护。

项目根的 `AGENTS.md` 继续作为 AI 协作硬约束入口；`.codestable/attention.md` 作为 CodeStable 技能启动时的轻量注意事项入口，记录每次启动都应该先知道的项目级约束。

## 理由

这让仓库结构和当前 `cs` 技能入口一致，避免每次触发 CodeStable 工作流都因为目录名不同而中断。隐藏目录也能减少产品源码浏览时的视觉干扰，把长期规格、规划和过程文档放在一个明确的工程协作区域。

## 后果

- 旧路径 `codestable/...` 不再作为项目内引用使用。
- CodeStable 工具命令应使用 `.codestable/tools/...`。
- 文档内指向 architecture、roadmap、features、issues、requirements、compound 的路径应使用 `.codestable/...`。
- 后续新增 CodeStable 文档时必须写入 `.codestable/`，不要重新创建 `codestable/`。

## 相关文档

- `.codestable/attention.md`
- `AGENTS.md`
- `.codestable/reference/system-overview.md`
- `.codestable/reference/shared-conventions.md`
- `.codestable/reference/tools.md`
