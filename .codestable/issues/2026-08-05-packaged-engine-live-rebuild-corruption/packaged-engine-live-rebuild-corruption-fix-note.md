---
doc_type: issue-fix
issue: 2026-08-05-packaged-engine-live-rebuild-corruption
path: fast-track
fix_date: 2026-08-05
tags: [desktop, engine, pyinstaller, import, packaging]
---

# 运行中重新打包导致内置解析引擎损坏修复记录

## 1. 问题描述

打包版 RxnFlow 保持运行时，如果同一路径重新生成 `RxnFlow.app`，随后导入正常的 Gaussian gas/sol 日志可能同时失败。错误来自 PyInstaller 运行时加载 `cclib`，表现为 `zlib.error: Error -3 while decompressing data: incorrect header check`。

## 2. 根因

问题 App 进程于 2026-08-05 18:56:55 启动，同一路径的 App 于 19:07:52 被重新打包覆盖。解析引擎采用 PyInstaller `--onefile`，部分 Python 模块会在收到完整文件解析请求后延迟从可执行文件归档加载。旧 App 进程继续从被新打包替换的资源路径启动或读取引擎，归档偏移与内容不再属于同一构建，因而在解压模块时失败。原始 gas/sol 日志和项目 `sources/` 副本均可由完整的新引擎正常解析。

## 3. 修复方案

- 打包态首次使用 Python 引擎时，将资源目录中的引擎复制到当前 Electron 主进程专属的临时目录。
- 当前 App 生命周期内所有 worker 只从该稳定副本启动，不再直接依赖可能被下一次打包覆盖的 `Contents/Resources/engine`。
- worker 全部退出或 Electron 主进程退出时清理临时引擎目录。

## 4. 改动文件清单

- `web/electron/engine-bridge.cjs`
- `web/electron/engine-bridge.test.cjs`
- `.codestable/issues/2026-08-05-packaged-engine-live-rebuild-corruption/packaged-engine-live-rebuild-corruption-fix-note.md`

## 5. 验证结果

- 当前打包引擎顺序解析 `SS-s-i8-fix2-tsr1.log` 与 `SS-s-i8-fix2-tsr1_sol.log` 均成功。
- 三个独立 PyInstaller 进程并发解析 12 轮，共 36 次解析全部成功。
- 新增回归测试确认源引擎被替换后，已物化的运行时副本内容和可执行权限保持不变。
- 将临时源引擎替换为无效文本后，稳定副本仍并发成功解析项目 `sources/` 中的 gas、sol、gas 三个请求，均返回 `gaussian-log-cclib+rxnflow-text-full-file`。
- Web 全量测试：45 个文件、445 个测试通过；其中一个导入进度时序用例首次在全量负载下超时，单独连续重跑三次和随后全量重跑均通过。
- Web production build 与 Electron desktop smoke 通过。
- 修复版 App 已打包到 `web/release-fixed-20260805-1930/mac-arm64/RxnFlow.app`，桌面 runtime smoke 返回 `bundled-python cclib=1.8.1`。
- 修复版包内引擎再次完整解析项目 `sources/` 中的 gas/sol 文件，均返回公式 `C52H38N2NiO2S2` 和 `gaussian-log-cclib+rxnflow-text-full-file`。

## 6. 使用说明

已经在重新打包过程中发生错误的旧 App 进程需要彻底退出后，再打开包含本修复的新 App。现有日志不需要修改或重新计算。
