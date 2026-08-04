---
doc_type: issue-fix
issue: 2026-08-03-relative-energy-path-component
status: fixed
path: fast-track
fix_date: 2026-08-03
tags: [relative-energy, baseline, reaction-path, branches]
---

# 分支路径相对能量受无关连线影响修复记录

## 1. 问题描述

同一零点出发的单重态和三重态分支已经分别连接 Addition / Release 与首个路径节点时，补上一条远端普通路径边会让两个分支的相对能量从巨大错误值突然恢复正常；尚未接入零点路径的节点也会显示无意义的巨大相对能量。

## 2. 根因

renderer 能量模型原来从整张画布选择一条全局最长路径建立 participant context，没有用用户选择的零点限定路径连通分量。画布存在更长的断开路径片段时，Addition / Release 上下文会在错误分量中传播，而用户零点只在最后减法阶段生效。未被上下文覆盖但带普通路径边的节点仍按 standalone 自能量参与相减，产生跨化学组成的无意义大数。

## 3. 修复方案

- 用户设置零点后，先定位零点所在的无向连通路径分量，再在该分量内寻找反应路径起点并传播 Addition / Release context。
- 保留路径中间节点设为零点的能力：零点只选择连通分量，化学计量上下文仍从该分量的路径起点建立。
- 带普通路径边但不可从选定分量起点到达的节点不再计算相对能量，并从 Relative 表中隐藏；绝对能量数据保持可用。

## 4. 改动文件清单

- `web/src/app/energyDisplay.ts`
- `web/src/app/energyDisplay.test.ts`

## 5. 验证结果

- `npm run test -- --run src/app/energyDisplay.test.ts`：7 tests passed。
- `npm run test`：44 files、425 tests passed。
- `npm run build`：通过。
- 浏览器验证：已连接零点路径的 Endo 分支数值保持不变；未接入零点路径的 Exo 分支显示 `pending`，布局正常。
- `npm run desktop:pack`：通过，刷新 `web/release/mac-arm64/RxnFlow.app`。
- `npm run desktop:release:smoke`：通过。

## 6. 遗留事项

无。本次未改变显式 Addition / Release / participant 语义，也未提交 git commit。
