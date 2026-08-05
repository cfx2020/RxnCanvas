---
doc_type: issue-analysis
issue: 2026-08-05-stale-project-source-parse
status: confirmed
root_cause_type: state-consistency
related: [stale-project-source-parse-report.md]
tags: [desktop, source-files, parser, autosave, checksum]
---

# 项目 Source 覆盖后仍使用旧 Parse 根因分析

## 1. 问题定位

| 位置 | 问题 |
|---|---|
| `web/src/app/App.tsx` 项目文件 drop 路径 | 拖入画布时直接使用当前内存 `files`，未在生成节点前读取项目 `sources/` 的当前版本。 |
| `web/src/domain/projectPackages.ts` | `SourceFile` 只有磁盘 `checksum`，没有声明 parse 对应哪个文件版本。 |
| `web/src/app/importWorkspace.ts` | gas/sol 配对和节点刷新只判断 `parse.parsed`，无法排除 checksum 已变但 parse 仍旧的状态。 |
| `web/electron/project-store.cjs` | `resolveSourcePath()` 原先优先外部 `sourcePath`，autosave 可把残留旧外部文件再次复制到已有项目 `storedPath`。 |
| `web/electron/main.cjs` | renderer 没有只读检查项目 source size/checksum 的 IPC，也无法让 preview 解析结果携带对应 checksum。 |

## 2. 失败路径

1. 首次导入三重态 sol，项目 JSON 保存三重态 parse，source metadata 同时保留 `storedPath` 和旧外部 `sourcePath`。
2. 用户用同名单重态文件覆盖来源或项目副本。
3. renderer 从左侧拖入结构时直接复用三重态 parse，不读取磁盘。
4. autosave 更新项目 source checksum 时仍保留旧 parse；如果旧外部 `sourcePath` 可读，还可能把三重态字节重新复制到项目 `storedPath`。
5. 节点从旧 parse 取能量，Source 外部打开优先项目副本，于是两者最终都重新表现为三重态。

## 3. 根因

**主根因**：项目 source 的磁盘版本和结构化 parse 没有版本绑定，renderer 把 `parse` 当作永久有效缓存。

**次根因**：项目已经拥有合法 `storedPath` 后，autosave 仍把导入期外部 `sourcePath` 当作更高优先级的数据源，破坏了“项目副本是长期 authority”的边界。

这不是 Gaussian parser 对 multiplicity 的识别错误；两份 log 各自解析出的 multiplicity 正确，错误发生在文件版本、parse 缓存与持久化来源之间。

## 4. 影响面

- 同名覆盖的 gas、sol、ORCA、XYZ 等项目 source。
- 已存在节点的能量、formula、method、charge、multiplicity 和 coordinate preview。
- gas/solution 分组配对后的 `energySolution` / `energyTable`。
- Source 面板显示和外部打开文件的一致性。
- autosave 后重启恢复的项目 JSON。

## 5. 采用方案

1. `SourceFile` 增加 `parseChecksum`，显式记录当前 parse 对应的 source SHA-256。
2. Electron 增加项目 source 只读检查 IPC；`parse-source-preview` 返回本次实际解析文件的 size/checksum，并优先项目 `storedPath`。
3. renderer 在窗口重新聚焦、项目激活时静默检查文件；项目文件拖入画布前强制重新解析完整 gas/sol 分组。
4. checksum 与 parseChecksum 不一致时 parse 视为失效；解析失败后清空旧 parse，让节点进入 staged/pending，而不是继续复用旧能量。
5. 项目保存时优先已有 `storedPath`，只有项目副本不存在时才回退外部 `sourcePath`。
6. 刷新已有节点时保留用户标签、位置、尺寸、连线、手动画结构与选择，只更新 source 派生字段。
