---
doc_type: requirement
slug: project-content-persistence
pitch: 把项目里的对象、图谱、导入记录、基础结果和导出索引保存下来，让用户关掉项目后还能继续工作
status: current
last_reviewed: 2026-05-22
implemented_by:
  - core-platform
  - web-workbench
tags: [project, persistence, restore, local-storage, import-ledger, energy-profile, export-artifact-index, validation, project-bundle, indexeddb, browser-storage]
---

# 保存并恢复项目内容

## 用户故事

- 作为一个整理多批计算输出的人，我希望导入预览、失败记录和已确认对象能跟项目一起保存，而不是重启后重新梳理。
- 作为一个用 agent 搭反应图的人，我希望对象、图谱和画布工作状态能落在项目目录里，方便下次继续编辑。
- 作为一个比较反应路径能量的人，我希望已计算的 EnergyProfile、缺失点和 warnings 能跟项目一起保存，方便下次直接查看或导出，而不是重新计算后才知道当时的结果。
- 作为一个反复导出报告的人，我希望已经写入项目 `exports/` 下的 PNG、CDXML、XLSX 导出文件能被项目索引记住格式、路径、checksum 和 metadata，方便下次打开项目时知道有哪些可复用报告 artifact。
- 作为一个长期维护项目文件的人，我希望系统能告诉我项目内容文件是否缺失、checksum 是否不一致、引用是否断掉，反应节点组成或能量表达式是否损坏，而不是等到加载失败时才逐个排查。
- 作为一个先用本地项目验证流程的人，我希望保存的数据是普通项目文件，能被测试、备份和后续 Web/桌面壳层复用。
- 作为一个用 CLI 或 agent 继续项目的人，我希望打开项目时能恢复已保存的对象、导入记录、图谱、workspace、energy profile 和导出索引，并且能把当前 session 再保存回项目内容文件。
- 作为一个没有云同步的早期用户，我希望能把项目导出为一个 `.rxnflow.zip` 包并在另一处导入，作为自己负责的备份或手动同步方式。
- 作为一个准备接入早期 Web 壳层的人，我希望核心 ProjectContentStore 能在非文件系统 project_ref 上工作，并能用浏览器本地存储 backend 的测试替身验证 IndexedDB / OPFS 方向的协议。
- 作为一个使用早期 Web 工作台的人，我希望浏览器里已经有真实 local project refs 和 project-relative bytes object 仓储基础，后续项目侧边栏可以在不引入云账号的前提下新建、打开和保存项目内容。
- 作为一个使用 Web 工作台项目入口的人，我希望能在页面左侧看到浏览器本地项目列表，新建或打开 project，保存真实 Project Content files，并在需要时显式打开 / 保存本地 bridge session，明确知道这些数据目前只在本浏览器本地。

## 为什么需要

RxnFlow 的核心流程会产生很多中间状态：已解析但待确认的分子、已登记对象、反应图、workspace 选择、导入错误、已计算能量 profile 和导出报告 artifact 索引。没有项目内容持久化时，用户关闭进程或刷新页面后只能重新导入、重新确认、重新搭图、重新计算 profile，已导出的报告文件也缺少可恢复的项目内索引，agent 也缺少稳定的恢复点。

## 怎么解决

系统把项目内容保存到项目目录的状态文件中。用户或端侧壳层可以在合适时机保存当前 snapshot，再从这些文件加载对象、图谱、workspace、导入 ledger、已计算 energy profile 和 export artifact index。Platform Shell 通过 `project.open` 打开项目：默认先校验项目内容，再把 snapshot 恢复到 ChemicalRegistry、ImportRegistryWorkflow、ReactionGraphService、GraphEditorWorkspaceService 和 session content collections；`project.open(load_content=false)` 或 CLI `--manifest-only` 只打开 manifest。Platform Shell 通过 `project.save_content(session_id)` 把当前 session content collections 写回 ProjectContentStore。导入预览会保留足够的信息，让待确认条目在恢复后仍然可以继续确认；reaction graph 会保留节点 composition 和兼容的 `chemical_object_ids` 投影，旧项目缺 composition 时按 coefficient 1 加载；energy profile 会保留当时的 options、points、missing reason、warnings 和可选 expression，旧项目缺 expression 时按空值加载，并在加载时校验 graph/path 引用、composition 投影和 expression node/source/kind/unit/coefficient/missing 语义；export artifact index 会记录 `exports/...` 项目相对路径、format、checksum、metadata 和 created_at，但不把导出 bytes 写进 JSON。系统还可以生成项目内容验证报告，检查 state section、schema、path、checksum、跨对象引用、composition/expression 语义和已登记导出文件的存在性/checksum，把问题汇总成 warning 或 error。

系统还提供 Project Bundle 导入/导出，把项目目录中的 `.rxnflow/`、`inputs/raw/` 和 `exports/` 打包成 `.rxnflow.zip`。导出和导入在 content index 存在时都会先运行 Project Content Validation；validation error 会阻止输出最终 bundle 或落地导入项目。导入采用 non-overwrite 语义，目标项目已存在时失败，不覆盖、不合并、不自动改名。Project Bundle 是用户手动备份/同步路径，不是云存储。

系统还提供 BrowserLocalProjectStorageBackend 作为浏览器本地 IndexedDB / OPFS 方向的核心协议测试替身。它实现与本地文件系统 backend 相同的 ProjectStorageBackend 入口，使用 opaque project_ref 隔离项目，按项目相对 POSIX path 保存 bytes、checksum 和 metadata，并可用 quota_bytes 模拟浏览器本地空间不足。ProjectContentStore 可以直接注入该 backend 保存、加载和验证 ProjectContentSnapshot；这证明 Web 壳层后续可复用同一 content store 协议，而不是重新定义项目内容格式。

Web Workbench 还提供真实 Browser Project Repository。它位于 `web/src/repository/`，当前使用 IndexedDB 保存 origin-local project refs、项目相对 POSIX path 下的 bytes、checksum 和 metadata。repository 提供 `listProjects`、`createProject`、`readObject`、`writeObject`、`exists`、`listObjects` 和 `deleteObject`，并保持 local-only：没有账号、云同步或跨设备冲突合并。

Web Workbench Project Sidebar 已接入该 repository。用户可以在左侧栏列出 browser-local projects，新建 project，打开已有 project，并保存 / 覆盖 `.rxnflow/manifest.json` 与 `.rxnflow/state/*.json` 真实 Project Content files。创建 browser project 时 Web 会写入空的 `project-v1` manifest、`project-content-v1` index 和 6 个空 section files；显式 Open Bridge 时 Web 把这些 bytes 作为 `project.open(content_files)` payload 交给本地 bridge；显式 Save Bridge Session 时 Web 调用 `project.save_content(include_content_files=true)` 并把返回的 section bytes 写回 Browser Project Repository。侧边栏会显示 local-only、backend、persistence、bridge、shallow validation、checksum 和 repository error。Export Bundle 当前已启用：active browser project 可从 Browser Project Repository 当前 `.rxnflow/`、`inputs/raw/` 和 `exports/` bytes 生成并下载 `.rxnflow.zip`，显示 fileCount、byteSize、rootName 和 checksum；Import Bundle 仍处于 disabled 状态，真实导入写入留给后续功能。

Web Workbench Report Export Panel 已能在 active browser project 下把 `export.profile` 返回的 PNG/CDXML/XLSX inline bytes 写入 Browser Project Repository 的 `exports/{basename}.{format}` object。写入成功后，Web 会 upsert `.rxnflow/state/export-artifacts.json` 的 `export-artifacts-v1` records，并更新 `.rxnflow/state/project-content.json` 中 export artifacts section 的 checksum，让 Project Sidebar shallow validation 继续显示 valid。该能力只持久化已由 ShellResponse 返回的 bytes，不在前端生成报告文件，也不自动调用 `project.save_content` 或 Save Bridge Session。

Web Workbench 还提供 Browser Bundle Archive Adapter。它位于 `web/src/app/projectBundleArchive.ts`，使用隔离的 `fflate` dependency boundary 从 project-relative bytes entries 生成 `.rxnflow.zip` bytes，或读取 `.rxnflow.zip` bytes 并返回 safe project-relative entries 与 shallow bundle summary。adapter 复刻核心 Project Bundle 的 single-root、manifest required、allowed roots、`inputs/raw`、duplicate、`__MACOSX` 和 symlink safety 语义。Web Export Bundle 通过 `web/src/app/projectBundleExport.ts` 消费该 adapter；导出只读取 Browser Project Repository 当前 bytes，不调用 Python `ProjectBundleService`，不自动 Save Bridge Session，也不替代 Project Content deep validation。

## 边界

- 它不负责云同步、账号权限、多人协作或冲突合并。
- 它不把所有内容塞进项目 manifest；manifest 仍只保存项目元数据和 raw file 资源索引。
- 它不重新运行 Gaussian、ORCA、MAPLE、ASE 或其他外部计算程序。
- 它不在加载时自动重新解析 raw files，也不根据 parser 版本变化自动修复 preview。
- 它不在加载时自动重新计算 EnergyProfile，也不根据当前 ChemicalObject energy/corrections 自动修复 stale profile。
- 它可以只读校验已经登记的 export artifact 文件是否存在、checksum 是否匹配；但不生成、复制、移动、删除或修复 export artifact 文件本身，也不把 ExportArtifact bytes 写入 Project Content JSON。
- 它不会自动修复损坏的 state 文件、断开的引用、错误 checksum 或不兼容 schema；验证报告只负责指出问题。
- 它不会为了兼容旧项目而补写缺失的 composition 或 expression 字段；旧缺字段合法加载，新字段损坏才报告错误。
- 它当前只支持 `project-content-v1` 的 no-op migration plan；legacy/new energy semantics optional fields 不需要迁移，不做真实 schema migration。
- 它不会在 project open 时部分恢复 validation error 的内容；有 error 时返回结构化错误。
- 它不会在 project open 时重新解析 raw files、重新确认 import、重新计算 EnergyProfile 或重新导出报告。
- 它不会把当前 CLI 命令进程里的 session 跨命令保存；CLI 只暴露 project open，不暴露 project save-content。
- Project Bundle 不自动保存当前进程内 session；需要调用方先用 `project.save_content` 写回内容，再导出 bundle。
- Project Bundle 只包含 `.rxnflow/`、`inputs/raw/` 和 `exports/`，不承诺保存项目根目录中的 notes、脚本或临时文件。
- Project Bundle import 不覆盖现有项目，不做自动改名、merge、diff 或冲突合并。
- BrowserLocalProjectStorageBackend 当前是 Python 核心协议测试替身，不是真实 JavaScript IndexedDB / OPFS adapter。
- Browser Project Repository 当前是真实 JavaScript IndexedDB-first adapter，并已接入 Web Project Sidebar 的 list/create/open/save Project Content files、显式 bridge open/save 流程和 Report Export Panel 的 `exports/...` artifact persistence；它仍不提供桌面 UI、文件选择器、浏览器持久存储权限请求、拖拽导入或完整本地数据管理界面。
- Browser Project Repository 当前不实现 OPFS payload store、Web Worker、Service Worker、大文件 chunking、云同步或账号系统；`.rxnflow.zip` bytes 读写 helper 已在 Web archive adapter 中落地，Project Sidebar 已能导出 active browser project 为 `.rxnflow.zip`，但还没有接 repository import workflow。
- Web Export Bundle 不自动保存当前 bridge session；如果用户在 Open Bridge 后修改了对象、图谱、workspace、profile 或 export index，需要先显式 Save Bridge Session，导出的 bundle 才会包含 repository 中最新 `.rxnflow/state/*.json`。
- Web Project Sidebar 保存 Project Content files，但 Web 本身不解析或重写 ChemicalObject、Import Ledger、ReactionGraph、WorkspaceSnapshot、EnergyProfile 或 ExportArtifact index 领域内容；这些 bytes 的深度恢复/保存仍由 Platform Shell 和 ProjectContentStore 承担。
- Web Export Artifact Persistence 会重写 `export-artifacts-v1` index 和 Project Content index 中的 checksum，但只处理 ShellArtifact inline bytes 到 browser-local `exports/...` 的窄路径；它不在前端生成 PNG/CDXML/XLSX bytes，不新增导出格式，不把 artifact 写入 Project Manifest resources，也不把 Browser Project Ref 当作 Python filesystem path。
- Project Sidebar 的 validation 只是浏览器 repository 浅校验，不调用 Python ProjectContentValidator，也不做 schema migration 或跨 section 引用检查。
- 浏览器本地存储不是云备份；浏览器清数据、profile 损坏或 origin 变化仍可能导致数据丢失，早期 Web 版本仍需要引导用户导出 `.rxnflow.zip` 手动备份。

## 变更日志

- 2026-05-22：补充 reaction graph composition 与 energy profile expression 的 Project Content Validation / migration plan 边界：旧缺字段合法，新字段语义错误可报告，v1 仍 no-op migration。
- 2026-05-14：补充项目内容验证报告、export artifact checksum 深校验和 migration plan 边界。
- 2026-05-14：补充 Platform Shell `project.open` / `project.save_content` 恢复与保存入口、CLI project open，以及 runtime ShellArtifact 转 ExportArtifactRecord 的 `exports/...` 边界。
- 2026-05-14：补充 `.rxnflow.zip` Project Bundle 导入/导出能力，用于本地备份和早期 Web 无云同步。
- 2026-05-14：补充 BrowserLocalProjectStorageBackend 核心协议测试替身，用于验证浏览器本地 storage backend contract。
- 2026-05-19：补充 Web Browser Project Repository 现状：真实 IndexedDB-first local project refs / bytes objects 已落地，仍 local-only，尚未接 Project Sidebar、bundle UI 或 Python bridge。
- 2026-05-20：补充 Web Project Sidebar 现状：可在浏览器本地 list/create/open/save 真实 Project Content files，并显示 local-only、validation、checksum 和 disabled bundle entry。
- 2026-05-20：更新 Web Project Sidebar bridge 现状：显式 Open Bridge / Save Bridge Session 可通过 `project.open(content_files)` 与 `project.save_content(include_content_files=true)` 协作；bundle IO、云同步和 browser_storage import adapter 仍未实现。
- 2026-05-20：补充 Web Export Artifact Persistence 现状：active browser project 下可把 runtime PNG/CDXML/XLSX inline artifacts 写入 `exports/...`，同步 `export-artifacts-v1` index 和 Project Content index checksum。
- 2026-05-22：补充 Web Browser Bundle Archive Adapter 现状：`fflate` 隔离在 archive helper 内，已支持 `.rxnflow.zip` bytes 读写、安全 entry 校验和 shallow summary，但用户可见 Project Sidebar import/export 仍未启用。
- 2026-05-22：补充 Web Project Sidebar Export Bundle 现状：active browser project 可下载 `.rxnflow.zip`，只读取 repository 当前 `.rxnflow/`、`inputs/raw/` 和 `exports/` bytes；Import Bundle 仍待后续功能。
