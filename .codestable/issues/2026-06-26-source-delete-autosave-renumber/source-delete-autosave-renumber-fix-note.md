---
doc_type: issue-fix
issue: 2026-06-26-source-delete-autosave-renumber
path: fast-track
fix_date: 2026-06-26
tags: [electron, project-store, autosave, source-files]
---

# 删除 source 后 autosave 重编号失败修复记录

## 1. 问题描述

用户在桌面端导入一个 Gaussian log 后删除该 source，界面出现 `Project needs repair`，错误为 Electron autosave 调用 `rxnflow:autosave-project-package` 失败：`EACCES: permission denied, copyfile .../sources/16-...log -> .../sources/15-...log`。重启后被删除的 log 仍在项目中。

## 2. 根因

`web/electron/project-store.cjs` 的 `persistSourceFile()` 保存项目目录时按当前 `files` 数组 index 生成 `sources/NN-id-name.ext`。删除中间 source 后，后续 source 的 index 前移，autosave 会把已保存的旧 source 路径复制到新的前移路径，例如 `16-...` 复制到 `15-...`。如果目标路径存在、权限受限或被占用，copyfile 报 EACCES；即使不报错，也会造成 source 路径不稳定和无意义重命名。

## 3. 修复方案

保存项目目录时优先复用每个 source 已有且安全的 `storedPath`，并限制为项目内 `sources/...` 路径；只有新导入且没有可复用 `storedPath` 的 source 才按 index 生成新路径。保存过程中维护 `usedStoredPaths`，避免重复路径冲突；重复时为新生成路径追加后缀。

## 4. 改动文件清单

- `web/electron/project-store.cjs`
  - `saveProjectDirectory()` 维护本次保存使用过的 source 路径集合。
  - `persistSourceFile()` 改为通过 `sourceStoredPathForFile()` 选择目标路径。
  - 新增 `isSafeStoredSourcePath()`，只复用安全的 `sources/...` 路径。
  - 新增 `withFileNameSuffix()`，处理新生成路径冲突。
  - 新增保存后 orphan source 清理：删除 `sources/` 下没有被当前项目引用的文件，避免旧重编号副本长期堆积。
  - 新导入 source 的物理文件名改为基于原始文件名的短路径；重名时才追加后缀，不再把 `desktop-file-时间戳` 临时 id 写入文件名。
- `web/electron/smoke.cjs`
  - 新增回归覆盖：保存三个 source 后删除中间项，再次保存时剩余 source 的 `storedPath` 不应被重编号，文件 bytes 仍保持正确，且被删除 source 的物理副本会被清理。

## 5. 验证结果

- `node web/electron/smoke.cjs` 通过。
- smoke 覆盖到项目目录保存、删除中间 source 后重新保存、剩余 source 路径稳定、未引用 source 清理、manifest/state 写入和本地 engine 基础命令。

## 6. 遗留事项

- 新版保存会清理 `sources/` 下未被项目引用的普通文件。当前只清理 `sources/` 顶层文件；若未来支持 source 子目录，再扩展递归清理。
