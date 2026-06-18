---
doc_type: requirement
slug: project-content-persistence
pitch: 以真实用户可见工作区文件夹保存项目内全部画布和导入来源
status: current
last_reviewed: 2026-06-19
implemented_by:
  - core-platform
  - web-workbench
tags: [project, persistence, desktop, electron, workspace-folder, rxnflow-project, import-ledger, export-manifest, multi-canvas]
---

# 保存并恢复桌面项目的全部画布

## 用户故事

- 作为一个在桌面端整理反应图谱的人，我希望新建项目就是新建一个我能在 Finder/Explorer 里看到的文件夹，打开项目也是打开一个文件夹。
- 作为一个在同一项目里整理多条反应设想的人，我希望可以用多个画布分别摆放不同图谱，关闭重开项目后每个画布和最后停留的画布都还在。
- 作为一个在项目里反复导入 log/out 的人，我希望导入后原始文件被复制进项目文件夹，而不是长期依赖 Downloads、桌面或临时路径。
- 作为一个日常编辑项目的人，我希望项目自动保存到当前工作区文件夹；只有分享项目或换电脑打开时，才需要显式导出压缩包。
- 作为一个排查项目损坏的人，我希望打开项目时能直接看到基础引用断裂、source/export 缺失或 checksum 不一致等 warning，而不是静默丢数据。

## 当前需求

当前 active 项目持久化只服务桌面画布工作台真实已承载的功能：

1. 保存并恢复项目内共享的 source files。
2. 保存并恢复项目内全部 canvas，每个 canvas 单独包含 nodes、edges、barriers、viewport 和 selection。
3. 保存并恢复 active canvas；若保存的 active canvas 缺失，打开时安全回退到第一个可用 canvas。
4. 保存轻量 `importLedger`，保留当前 UI 可见的 candidate/parser provenance，并从项目共享 source files + 全部 canvas nodes 派生。
5. 保存导出 artifact manifest，记录 PNG/CDXML/XLSX 输出及其 size / `sha256`。
6. 打开项目时做轻量校验，并把问题反馈给 renderer 的 `Project warnings` / `Project needs repair` 提示。
7. Electron 桌面端导入 source 后，`sourcePath` 只作为本次 full-file parse 和复制来源；自动保存必须把原始文件复制到工作区 `sources/` 并把项目状态更新为 `storedPath` + `checksum`。
8. Electron 桌面端常规编辑通过 debounce autosave 写回 active workspace folder；显式按钮和菜单语义是 `Export project`，用于生成 `.rxnflow.zip` 分享/迁移压缩包，不是日常保存入口。

## 当前方案

### 1. 项目格式

当前桌面主格式是普通工作区文件夹，而不是把 `.rxnflow` 目录本身当项目根：

```text
Project Name/
  .rxnflow/
    project.json
    manifest.json
  sources/
    imported.log
  exports/
    manifest.json
    rxnflow-report.xlsx
```

- `.rxnflow/project.json`：项目状态。当前写入 schemaVersion 2，结构是共享 `files` + `canvases[]` + `activeCanvasId`。
- `.rxnflow/manifest.json`：项目与 source 清单。
- `sources/`：导入 source 副本。
- `exports/manifest.json`：导出 artifact 清单。

当前仍兼容读取旧单画布 `.rxnflow.json` package，打开时会归一化为一个默认 canvas，但那不是长期主格式。`.rxnflow.zip` 目前是导出分享/迁移格式；导入 zip 还不是 active UI 承诺。

### 2. 保存内容

当前保存的是桌面画布工作台实际会用到的轻量状态：

- source file 摘要与必要元数据。
- source 原始文件在 `sources/` 下的项目内副本路径、size 和 `sha256`。
- 多个 canvas 及其 active canvas id。
- 每个 canvas 内的节点、edge、barrier、viewport 和轻量 selection。
- 节点 position、coefficient、基础能量字段。
- 当前 UI 派生出的 lightweight `importLedger`。
- export artifact manifest。

### 3. 打开/保存校验

`project.validate` / `project.open` / `project.save` 当前会校验：

- file / node / edge / barrier 基础引用。
- canvas 集合非空，且 `activeCanvasId` 指向可用 canvas 或能安全回退。
- `importLedger` 的 file / node / entry 引用。
- node 能量单位、数值、position、可选 coefficient 形状。
- source/export 文件是否缺失。
- source/export size 与 `sha256` 是否不一致。
- project-relative path 是否安全。

其中缺失文件或 checksum 不一致属于 warning；破坏结构或不安全路径属于 error。

### 4. 运行时边界

- Electron 桌面端通过 preload / local engine / embedded engine 读写该轻量项目格式。
- `New Project Folder` 会让用户选择父目录并创建真实工作区文件夹。
- `Open Folder` 会打开已有工作区文件夹。
- 如果当前没有创建或打开工作区文件夹，桌面 autosave 返回 `project_folder_required` warning，不再静默写 Electron `userData/projects/` 作为主项目目录。
- 浏览器开发预览可用于打开 `.rxnflow.json` 做 UI 验证，但不能访问本地绝对 `sourcePath` 或写入 `sources/`，不是长期持久化主形态。
- 启动恢复、Open Recent、Open Folder 和 autosave 共享 project directory 绑定；renderer 恢复项目后会把 project id 与工作区目录同步回 Electron main process。

## 当前不做

以下都不属于当前 active 项目持久化承诺：

- Browser Project Repository / IndexedDB 项目仓库。
- 旧 Project Content sections / deep content store / content index。
- `.rxnflow.zip` 导入主流程。
- local-http bridge / ShellClient / Platform Shell 自动保存链路。
- Energy Profile persistence、correction policy persistence。
- 跨画布复制/移动节点、跨画布引用、画布颜色、画布排序拖拽、画布模板或权限。
- 完整 parser registry / import registry workflow。
- 完整 artifact cleanup / repair / migration / deep validation。
- 云同步、账号、多人协作、跨设备冲突合并。

这些能力如果要回来，必须先进入 roadmap，并重新定义 UI 承载方式。

## 验证入口

- `python3 -m unittest discover`
- `cd /Users/linsay/Desktop/code/rxnflow/web && npm run test`
- `cd /Users/linsay/Desktop/code/rxnflow/web && npm run desktop:smoke`
- `cd /Users/linsay/Desktop/code/rxnflow/web && npm run desktop:runtime:smoke`

涉及打开/保存/恢复/警告提示的改动，还需要在浏览器或桌面壳中做实际 UI 验证。

## 变更日志

- 2026-06-19：项目保存格式升级为共享 source files + 多 canvas 集合 + active canvas，旧单画布包打开时归一化为默认 canvas。
