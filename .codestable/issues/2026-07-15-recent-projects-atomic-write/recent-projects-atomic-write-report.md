---
doc_type: issue-report
issue: 2026-07-15-recent-projects-atomic-write
status: confirmed
severity: medium
path: fast-track
tags: [electron, persistence, recent-projects, atomic-write]
---

# Recent Projects 文件可能被截断

## 1. 现象

Electron 进程在保存 Recent Projects 的过程中异常退出时，`recent-projects.json` 可能只写入一部分。下次启动读取失败后会回退为空状态，表现为最近项目列表和启动恢复记录消失。

## 2. 复现条件

1. 已存在有效的 `recent-projects.json`。
2. 保存新状态时在目标文件截断后、完整内容写完前终止进程或使写入失败。
3. 重启应用并加载 Recent Projects。

## 3. 期望行为

- 新状态只有完整写入后才替换旧状态。
- 替换失败时旧的有效 Recent Projects 文件保持不变。
- 临时写入文件在成功或失败后都被清理。
- `.rxnflow` 项目目录和源文件不受影响。

## 4. 根因与快速通道判定

`web/electron/recent-projects.cjs` 的 `saveRecentProjectsState()` 直接对 live JSON 调用 `writeFile`。根因明确、影响面局限于一个持久化模块，采用快速通道定点修复。
