---
doc_type: requirement
slug: project-content-persistence
pitch: 把项目里的对象、图谱、导入记录、基础结果和导出索引保存下来，让用户关掉项目后还能继续工作
status: current
last_reviewed: 2026-05-14
implemented_by:
  - core-platform
tags: [project, persistence, restore, local-storage, import-ledger, energy-profile, export-artifact-index, validation]
---

# 保存并恢复项目内容

## 用户故事

- 作为一个整理多批计算输出的人，我希望导入预览、失败记录和已确认对象能跟项目一起保存，而不是重启后重新梳理。
- 作为一个用 agent 搭反应图的人，我希望对象、图谱和画布工作状态能落在项目目录里，方便下次继续编辑。
- 作为一个比较反应路径能量的人，我希望已计算的 EnergyProfile、缺失点和 warnings 能跟项目一起保存，方便下次直接查看或导出，而不是重新计算后才知道当时的结果。
- 作为一个反复导出报告的人，我希望已经写入项目 `exports/` 下的 PNG、CDXML、XLSX 导出文件能被项目索引记住格式、路径、checksum 和 metadata，方便下次打开项目时知道有哪些可复用报告 artifact。
- 作为一个长期维护项目文件的人，我希望系统能告诉我项目内容文件是否缺失、checksum 是否不一致、引用是否断掉，而不是等到加载失败时才逐个排查。
- 作为一个先用本地项目验证流程的人，我希望保存的数据是普通项目文件，能被测试、备份和后续 Web/桌面壳层复用。
- 作为一个用 CLI 或 agent 继续项目的人，我希望打开项目时能恢复已保存的对象、导入记录、图谱、workspace、energy profile 和导出索引，并且能把当前 session 再保存回项目内容文件。

## 为什么需要

RxnFlow 的核心流程会产生很多中间状态：已解析但待确认的分子、已登记对象、反应图、workspace 选择、导入错误、已计算能量 profile 和导出报告 artifact 索引。没有项目内容持久化时，用户关闭进程或刷新页面后只能重新导入、重新确认、重新搭图、重新计算 profile，已导出的报告文件也缺少可恢复的项目内索引，agent 也缺少稳定的恢复点。

## 怎么解决

系统把项目内容保存到项目目录的状态文件中。用户或端侧壳层可以在合适时机保存当前 snapshot，再从这些文件加载对象、图谱、workspace、导入 ledger、已计算 energy profile 和 export artifact index。Platform Shell 通过 `project.open` 打开项目：默认先校验项目内容，再把 snapshot 恢复到 ChemicalRegistry、ImportRegistryWorkflow、ReactionGraphService、GraphEditorWorkspaceService 和 session content collections；`project.open(load_content=false)` 或 CLI `--manifest-only` 只打开 manifest。Platform Shell 通过 `project.save_content(session_id)` 把当前 session content collections 写回 ProjectContentStore。导入预览会保留足够的信息，让待确认条目在恢复后仍然可以继续确认；energy profile 会保留当时的 options、points、missing reason 和 warnings，并在加载时校验 graph/path 引用；export artifact index 会记录 `exports/...` 项目相对路径、format、checksum、metadata 和 created_at，但不把导出 bytes 写进 JSON。系统还可以生成项目内容验证报告，检查 state section、schema、path、checksum、跨对象引用和已登记导出文件的存在性/checksum，把问题汇总成 warning 或 error。

## 边界

- 它不负责云同步、账号权限、多人协作或冲突合并。
- 它不把所有内容塞进项目 manifest；manifest 仍只保存项目元数据和 raw file 资源索引。
- 它不重新运行 Gaussian、ORCA、MAPLE、ASE 或其他外部计算程序。
- 它不在加载时自动重新解析 raw files，也不根据 parser 版本变化自动修复 preview。
- 它不在加载时自动重新计算 EnergyProfile，也不根据当前 ChemicalObject energy/corrections 自动修复 stale profile。
- 它可以只读校验已经登记的 export artifact 文件是否存在、checksum 是否匹配；但不生成、复制、移动、删除或修复 export artifact 文件本身，也不把 ExportArtifact bytes 写入 Project Content JSON。
- 它不会自动修复损坏的 state 文件、断开的引用、错误 checksum 或不兼容 schema；验证报告只负责指出问题。
- 它当前只支持 `project-content-v1` 的 no-op migration plan，不做真实 schema migration。
- 它不会在 project open 时部分恢复 validation error 的内容；有 error 时返回结构化错误。
- 它不会在 project open 时重新解析 raw files、重新确认 import、重新计算 EnergyProfile 或重新导出报告。
- 它不会把当前 CLI 命令进程里的 session 跨命令保存；CLI 只暴露 project open，不暴露 project save-content。
- 它当前不提供真实 Web UI、桌面 UI、文件选择器、project bundle 或浏览器本地存储 adapter。

## 变更日志

- 2026-05-14：补充项目内容验证报告、export artifact checksum 深校验和 migration plan 边界。
- 2026-05-14：补充 Platform Shell `project.open` / `project.save_content` 恢复与保存入口、CLI project open，以及 runtime ShellArtifact 转 ExportArtifactRecord 的 `exports/...` 边界。
