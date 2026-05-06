---
doc_type: requirement
slug: project-content-persistence
pitch: 把项目里的对象、图谱、导入记录和基础结果保存下来，让用户关掉项目后还能继续工作
status: current
last_reviewed: 2026-05-07
implemented_by:
  - core-platform
tags: [project, persistence, restore, local-storage, import-ledger, energy-profile]
---

# 保存并恢复项目内容

## 用户故事

- 作为一个整理多批计算输出的人，我希望导入预览、失败记录和已确认对象能跟项目一起保存，而不是重启后重新梳理。
- 作为一个用 agent 搭反应图的人，我希望对象、图谱和画布工作状态能落在项目目录里，方便下次继续编辑。
- 作为一个比较反应路径能量的人，我希望已计算的 EnergyProfile、缺失点和 warnings 能跟项目一起保存，方便下次直接查看或导出，而不是重新计算后才知道当时的结果。
- 作为一个先用本地项目验证流程的人，我希望保存的数据是普通项目文件，能被测试、备份和后续 Web/桌面壳层复用。

## 为什么需要

RxnFlow 的核心流程会产生很多中间状态：已解析但待确认的分子、已登记对象、反应图、workspace 选择、导入错误和已计算能量 profile。没有项目内容持久化时，用户关闭进程或刷新页面后只能重新导入、重新确认、重新搭图、重新计算 profile，agent 也缺少稳定的恢复点。

## 怎么解决

系统把项目内容保存到项目目录的状态文件中。用户或端侧壳层可以在合适时机保存当前 snapshot，再从这些文件加载对象、图谱、workspace、导入 ledger 和已计算 energy profile。导入预览会保留足够的信息，让待确认条目在恢复后仍然可以继续确认；energy profile 会保留当时的 options、points、missing reason 和 warnings，并在加载时校验 graph/path 引用。

## 边界

- 它不负责云同步、账号权限、多人协作或冲突合并。
- 它不把所有内容塞进项目 manifest；manifest 仍只保存项目元数据和 raw file 资源索引。
- 它不重新运行 Gaussian、ORCA、MAPLE、ASE 或其他外部计算程序。
- 它不在加载时自动重新解析 raw files，也不根据 parser 版本变化自动修复 preview。
- 它不在加载时自动重新计算 EnergyProfile，也不根据当前 ChemicalObject energy/corrections 自动修复 stale profile。
- 它当前不提供真实 Web UI、桌面 UI、文件选择器、project bundle 或浏览器本地存储 adapter。
