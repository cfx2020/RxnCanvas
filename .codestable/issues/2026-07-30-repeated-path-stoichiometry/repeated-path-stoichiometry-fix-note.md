---
doc_type: issue-fix
issue: 2026-07-30-repeated-path-stoichiometry
path: fast-track
fix_date: 2026-07-30
tags: [web, reaction-path, energy, stoichiometry]
---

# 重复路径参与物计量丢失修复记录

## 1. 问题描述

同一物种在一条反应路径的不同步骤中重复加入或释放时，能量表达式只保留一次。实际 Ni 项目的 `S-s-i5-2-t2fix-tsf` 节点因此只计算一次 `i3-2` release 和一次 `s-i1` addition，显示约 `-591264.03 kcal/mol`。

## 2. 根因

`energyDisplay.ts` 使用同一个物种归一逻辑处理两种不同语义：

- 同一步骤中出现的等价 participant 副本应当视为替代表示，只选择一个。
- 不同步骤中再次出现的 participant 是新的化学计量事件，必须继续累计。

原实现沿路径传播 participant context 时再次按 label、formula、charge 和 multiplicity 全局去重，因此把跨步骤的重复事件错误折叠为一次。

## 3. 修复方案

- 保留每个 path step 内的物种归一，避免同一步骤的图形副本被重复计算。
- participant 进入累计路径上下文后按节点顺序稳定排序，但保留每一次 occurrence；即使复用同一个画布节点，不同步骤的连接边仍分别计数。
- 表达式既支持不同副本分别出现，也支持同一节点复用后合并成系数 `2`。

## 4. 改动文件清单

- `web/src/app/energyDisplay.ts`
- `web/src/app/energyDisplay.test.ts`

## 5. 验证结果

- 定向测试：`energyDisplay.test.ts` 6 个测试通过。
- 新增回归覆盖：同一步的等价副本只算一次；同一 participant 在两个连续步骤发生时累计为系数 `2`。
- 旧有分支汇合测试继续通过，替代路径 participant 不会被错误合并。
- 使用当前 `/Users/linsay/Documents/chemistry/Ni/.rxnflow/project.json` 和同一前端计算函数验证：目标表达式包含两次 `+ i3-2`、两次 `- s-i1`，相对能量约为 `-35.0005 kcal/mol`。
- Web 全量测试：44 个文件、417 个测试全部通过。
- Production build 通过；仅保留既有 3Dmol direct-eval 与 bundle size warning。
- 浏览器开发工作台重新加载正常，控制台无 error 或 warning。

## 6. 遗留事项

无。本次只修复路径 participant occurrence 的计量语义，没有修改项目数据或能量源文件。
