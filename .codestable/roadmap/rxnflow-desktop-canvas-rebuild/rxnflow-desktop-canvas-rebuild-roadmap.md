---
doc_type: roadmap
slug: rxnflow-desktop-canvas-rebuild
status: active
created: 2026-06-12
last_reviewed: 2026-06-15
tags: [desktop, electron, canvas, ui-rebuild, local-first]
---

# RxnFlow desktop canvas rebuild roadmap

## 1. 背景

这次重构把 RxnFlow 从“底层能力先堆起来、Web UI 追着接线”的状态，收缩成一个面向桌面产品的本地优先画布工作台。当前代码库已在 `.codestable/history/2026-06-12-pre-desktop-canvas-rebuild/rxnflow-pre-desktop-canvas-rebuild.tar.gz` 做历史备份，后续可以从备份恢复被删掉的旧实现。

用户明确偏好的交互和视觉方向：

- Flowith 式二维/无限画布：缩放、平移、节点拖拽、节点关系可视化。
- 柔和软 UI：圆角、轻阴影、悬浮气泡、毛玻璃、macOS-like 但不绑定 SwiftUI。
- 目标交付形态：macOS 和 Windows 桌面端，Web 只作为开发/演示入口。

调研记录：

- 本轮尝试访问 Flowith 官网和搜索结果，但当前环境网络请求超时；因此不记录未经证实的 Flowith 内部技术栈。
- 本轮只采用用户明确给出的产品方向作为设计输入：二维/无限画布、普通 wheel 平移、pinch-style 或 Ctrl/Meta+wheel 缩放、节点拖拽、悬浮工具条、柔和圆角阴影、悬浮气泡和毛玻璃。
- RxnFlow 当前继续采用已落地的 Electron + React/Vite renderer 作为 macOS/Windows 桌面端起点；本地 engine 进程仍在后续 IPC feature 中定义。

## 2. 范围与明确不做

本轮保留当前 UI 已经表达出来的主链路：

- 项目/文件 rail 的本地工作区心智；Project Rail 提供命名新建、打开现有 `.rxnflow` / `.rxnflow.json` 项目、项目切换、项目行 `Project actions` / `Import files into project`、项目行外部文件 drop、项目行 `Project actions` / `Delete project` 和 source 文件列表；source 文件行支持单选打开 Source inspector、Meta/Ctrl 多选、Shift 范围选择、raw-file drag payload、成对 gas/solution log 结构行与成组拖拽 payload、drop 到画布 graph-space 位置创建 source node 或候选登记面板，以及行内移除，不恢复旧 ProjectContentStore 深层树、迁移或自动修复逻辑。
- 导入计算输出文件的入口。
- 画布节点、节点结构预览折叠/展开、节点 stoichiometric coefficient 编辑、节点相对能量显示和 zero point 选择、画布级 Energy/Unit 快速切换（当前 lightweight 表格承载 `Egas`/`Gsol` 与 hartree/kcal/mol/kJ/mol）、连线、从节点手柄拖拽创建 edge、edge label 编辑、缩放、平移、Select tool 空白画布框选、Pan tool 空白画布拖拽平移、节点拖拽连续预览与 release 后 8px 网格吸附、画布 Shift 多选/反选、Delete/Backspace/Escape/Arrow/Cmd-Ctrl undo-redo 快捷键，以及旧 UI 已承载的 Undo/Redo、Delete selection、Auto layout 和 Fit view 画布命令。
- 节点 inspector、source preview、能量表视图。
- 轻量 3D structure 入口和导出入口；当前恢复轻量 `3D Structure` 坐标摘要，以及 PNG/CDXML/XLSX 三个默认报告格式。对象登记 / Objects tab / correction 表单、旧 `energy.compute` / EnergyProfilePanel 不作为当前 active UI。
- 桌面壳提供本地工作区文件夹的创建/打开/自动保存入口，保存 `.rxnflow/project.json`、`.rxnflow/manifest.json`、根目录 `sources/` 副本和 `exports/manifest.json`；`Export project` 导出 `.rxnflow.zip` 分享/迁移包，旧 `.rxnflow.json` package 仍可兼容读取。
- 导入文件时 Electron 模式优先走 local engine `import.preview`，浏览器模式保留 renderer-side fallback parser；当前覆盖基础 Gaussian / ORCA（含常见 Cartesian coordinate、charge/spin 摘要、`FINAL SINGLE POINT ENERGY` 与 `TOTAL SCF ENERGY`/`Total Energy` 形状）/ MAPLE（含多帧 XYZ 无单位 Hartree energy comment）/ 普通 XYZ comment energy（无单位按 Hartree、显式 Hartree/Ha 保留、eV 转 Hartree、坏 XYZ `parse_failed` 投影）/ ASE extxyz metadata（label、charge/spin、eV energy 转 Hartree）文本特征，返回 parser provenance、warnings、objectCount、candidates 和部分坐标摘要。单候选 source 会自动生成 parsed source node；多候选 source 会打开候选选择面板，支持登记选中候选或全部候选为画布节点。Electron 模式优先通过 preload 调用 lightweight stateless `import.register_selection` / `import.register_all`，浏览器模式或 engine 失败时 fallback 到 renderer-side register，并把 candidate/parser provenance 保存进项目状态。不等同于完整历史 parser/register engine。

本轮删除或暂缓当前 UI 没有承载好的底层能力：

- CLI 一次性项目操作、bundle import/export 的完整后端链路。
- 完整 Project Content 深校验、migration、跨 section 自动修复。轻量 `.rxnflow` 目录的 file/node/edge/barrier/importLedger 基础引用、node 能量单位/数值/position/可选 coefficient 形状，以及 source/export 文件存在性、size 和 sha256 checksum 校验已作为桌面项目可靠性基线落地。
- Browser project bundle import/export helper。
- 旧 Report manifest 深校验、完整 artifact index cleanup/repair、CSV/SVG 高级导出、PDF/PPTX/CDX 和组合报告预览方向。
- Parser fixture corpus、public fixture intake、真实输出兼容性大矩阵。
- Python 侧 browser storage 测试替身和过度详细的 persistence codecs。
- Web i18n 全量文案系统。
- Local HTTP bridge 的生产化细节。
- 空白 Add Node 这类不经过导入/登记的演示捷径。

这些能力不作为本轮主代码保留；需要时按下面子 feature 重新设计。

## 3. 模块拆分

### Desktop Shell

负责 macOS / Windows 应用窗口、菜单、文件选择、项目目录打开/保存、后续自动启动本地 engine、IPC、更新和打包。当前采用 Electron + Node main/preload + React/Vite renderer。Electron builder 已有 macOS `dmg/zip`、Windows x64 `nsis/portable` target、RxnFlow app icon 资产、mac/win icon 配置、macOS hardened runtime entitlements、`desktop:release:smoke` 配置检查、embedded Node engine fallback、`desktop:runtime:smoke` packaged app 启动和 active UI 边界检查、`desktop:installer:smoke:win` NSIS 安装器 smoke；当前 macOS/arm64 机器的 unsigned local `desktop:pack` 已改用明确的 `electron-builder --mac dir` target，2026-06-15 本机重跑 `npm run desktop:pack` 和随后的 `npm run desktop:runtime:smoke` 均通过，并刷新 `web/release/mac-arm64/RxnFlow.app`。2026-06-15 本机重跑 `npm run desktop:pack:win` 已刷新 Windows x64 `win-unpacked`，随后 `desktop:release:smoke` 通过其结构检查；macOS host 仍不能作为 Windows `.exe` runtime 通过证据。仓库中保留此前 `desktop:dist:win` 生成并通过结构验证的 NSIS setup 和 portable artifacts；最新 renderer 对应的 Windows installer/portable 需要 Windows CI 或 Windows 机器重新产出验证。`.github/workflows/desktop-release.yml` 已把 macOS unpacked runtime、Windows unpacked runtime、Windows NSIS 安装/启动/卸载 smoke 和 Windows artifact 结构验证放进 CI；手动提供 Apple Developer ID secrets 时可执行 macOS 签名、公证、staple 和 `spctl`。真实 Apple 公证成功证据、Windows 安装器真实用户机器/发布渠道验证和自动更新仍是 release 缺口；完整 parser/registry engine 仍在 parser/project feature 缺口中。

### Canvas Workbench

React + TypeScript + Vite 的共享 UI。负责画布、节点、连线、inspector、文件 rail、顶部命令条、本地演示状态和轻量 PNG/CDXML/XLSX report export。Web dev 与 Electron renderer 复用这一层。

### Local Engine

后续承载 Python core 或可替换 engine。当前已落地 stdin/stdout JSON command boundary：Electron 通过 `web/electron/engine-bridge.cjs` 优先 spawn `python3 -m rxnflow.engine_ipc`，支持 `engine.status`、`flow.demo`、lightweight `import.preview` candidates/provenance/warnings、lightweight stateless `import.register_selection` / `import.register_all` 和轻量 `project.validate/open/save`。`project.validate` 已覆盖 lightweight envelope、file/node/edge/barrier/importLedger 基础引用、node 能量单位/数值/position/可选 coefficient 形状、source/export safe path 与 checksum warning。打包态如果 Python engine unavailable / timeout / bad response，会降级到 packaged `web/electron/embedded-engine.cjs`，继续提供同一组当前 UI command。完整 cclib/ASE parser、旧持久化 registry workflow 和 ProjectContent command contract 后续继续设计，不把旧平台 shell、bundle、validation 全部带入新架构。

### Desktop Project Store

当前已落地真实工作区文件夹：Electron 保存 `.rxnflow/project.json`、`.rxnflow/manifest.json`、renderer-derived lightweight `importLedger`、canvas `barriers`、根目录 `sources/` source/raw 副本和 `exports/manifest.json`，并支持 legacy `.rxnflow.json` package 读取兼容、recent projects 菜单持久化。source 副本和 export artifact 会记录 size / `sha256`，local engine 与 embedded fallback 打开项目时会报告 file/node/edge/barrier/importLedger 基础引用问题、node 能量/position/可选 coefficient 形状问题、缺失文件或 checksum 不一致；renderer 会把 validation issues 显示为 `Project warnings` / `Project needs repair` 悬浮提示。它仍不是旧 ProjectContentStore 的完整迁移/深校验/content-index 体系。

## 4. 接口契约

### Workbench State

```ts
type WorkbenchNode = {
  id: string
  label: string
  formula: string
  kind: "reactant" | "transition" | "product" | "intermediate"
  coefficient?: number
  energy: { gas: number | null; solution: number | null; unit: "kcal/mol" | "hartree" }
  sourceStatus?: "parsed" | "staged" | "demo"
  sourceFileId?: string
  sourceCandidateId?: string
  sourceObjectIndex?: number
  parserId?: string | null
  parserVersion?: string | null
  roleHint?: string
  charge?: number | null
  spinMultiplicity?: number | null
  position: { x: number; y: number }
}

type WorkbenchEdge = {
  id: string
  sourceId: string
  targetId: string
  label: string
}

type WorkbenchBarrier = {
  id: string
  sourceId: string
  targetId: string
  label?: string
}

type WorkbenchSourceFile = {
  id: string
  name: string
  kind: string
  size: number
  status: "ready" | "parsed" | "staged"
  preview: string
  sourcePath?: string // desktop import session only; stripped when copied into workspace sources/
  storedPath?: string // project-relative source copy, e.g. sources/01-file-gaussian.log
  checksum?: string // sha256:<hex> for stored source copies when available
  parse?: SourceParseResult // lightweight preview payload for source inspector and candidate review
}

type RxnFlowProjectPackageV1 = {
  schemaVersion: 1
  packageKind: "rxnflow-project"
  project: { id: string; label: string; meta: string }
  files: WorkbenchSourceFile[]
  nodes: WorkbenchNode[]
  edges: WorkbenchEdge[]
  barriers: WorkbenchBarrier[]
  viewport: { x: number; y: number; zoom: number }
  savedAt: string
}
```

工作区文件夹当前包含：

```text
<project>.rxnflow/
  project.json
  manifest.json
  sources/
  exports/
    manifest.json
```

### Desktop Preload API

```ts
type ProjectValidationPayload = {
  valid: boolean
  summary: Record<string, unknown>
  issues: Array<{ severity: "error" | "warning"; code: string; message: string }>
}

type RxnFlowDesktopApi = {
  chooseFiles(): Promise<{ canceled: boolean; files: DesktopSourceFile[] }>
  saveJsonSnapshot(payload: { defaultName: string; content: string }): Promise<{ canceled: boolean; filePath?: string }>
  saveReportArtifact(payload: {
    defaultName: string
    mimeType: string
    encoding: "utf8" | "base64"
    content: string
  }): Promise<{ canceled: boolean; filePath?: string; projectArtifactPath?: string }>
  openProjectPackage(): Promise<{ canceled: boolean; content?: string; filePath?: string; validation?: ProjectValidationPayload | null }>
  saveProjectPackage(payload: { defaultName: string; content: string }): Promise<{ canceled: boolean; filePath?: string; projectDirectory?: string | null; validation?: ProjectValidationPayload | null }>
  onMenuImportFiles(callback: () => void): () => void
  onMenuOpenProject(callback: () => void): () => void
  onMenuSaveProject(callback: () => void): () => void
  onOpenProjectContent(callback: (payload: { content: string; filePath?: string }) => void): () => void
}
```

### Desktop Engine IPC

```ts
type EngineRequest =
  | { command: "engine.status" }
  | { command: "flow.demo" }
  | { command: "import.preview"; files: EngineFilePayload[] }
  | { command: "project.validate"; content: string; projectPath?: string }
  | { command: "project.open"; projectPath: string }
  | { command: "project.save"; projectPath: string; content: string }

type EngineResponse<T> =
  | { ok: true; data: T; warnings?: EngineWarning[] }
  | { ok: false; error: EngineError; warnings?: EngineWarning[] }
```

本轮 UI 不直接绑定 Python dataclass，也不把桌面 engine 进程当作 React state。
当前 active command 有 `engine.status`、`flow.demo`、lightweight `import.preview` candidates/provenance/warnings、lightweight stateless `import.register_selection` / `import.register_all` 和轻量 `project.validate/open/save`；Electron renderer 已通过 preload 将多候选选择 UI 接入 engine register，并保留浏览器/failure fallback。当前 UI 可表达的 lightweight `importLedger` 已由 package schema 派生、保存和校验；完整 ProjectContent 深校验/migration、完整 parser command 和旧持久化 import registry workflow 仍是后续 contract 目标。

Backlog-only capabilities such as project/source search or filtering, generic settings/preferences panels, overflow canvas action menus, the old ShellClient `energy.compute` backend command, EnergyProfilePanel, Object Registry / Objects tab / correction form, full correction policy engine, old Python ReportExportService, CSV/SVG advanced export, and PDF/PPTX/CDX document export must not be added to the active renderer until a later feature design defines their UI affordance. The current renderer keeps automatic relative energy display as the lightweight UI-carried subset.

## 5. 子 feature 清单

1. `canvas-workbench-rebuild`：重建 Web 工作台主界面，落地无限画布、节点拖拽、节点手柄创建 edge、普通 wheel 平移、pinch-style 或 Ctrl/Meta+wheel 缩放、soft glass UI 和 inspector。  
   最小闭环：打开 `npm run dev` 后可创建本地项目、通过 Project Rail 打开现有 `.rxnflow` / `.rxnflow.json` project package、切换项目、经 Project actions / Import files into project 或项目行 drop 把外部文件导入目标项目、经 Project actions / Delete project 确认后从 renderer 本地项目列表删除项目、导入本地文件、查看 source preview、Project Rail source 文件行可选择/多选/范围选择，成对 gas/solution log 以一个结构行拖拽成组 payload，并 drop 到画布 graph-space 位置创建 source node 或候选登记面板、外部 source 文件可 drop 到画布指定位置导入、拖动节点且拖动中连续预览、release 后吸附到 8px 网格、用 Select tool 框选节点、用 Pan tool 空白拖拽平移画布、折叠/展开节点结构预览、用画布级 Energy/Unit 切换当前表格承载的 `Egas`/`Gsol` 和 hartree/kcal/mol/kJ/mol、拖拽创建 edge 且 window release 会完成命中节点或清掉空白释放、编辑 node coefficient、节点相对能量 zero point 和 edge label、缩放画布、适配当前视图、自动布局、删除当前选择、用 Shift 多选/反选图谱元素、用 Delete/Backspace 删除选择、Escape 清空选择、Arrow 微调已选节点、撤销/重做画布编辑、切换能量表、选择节点/edge、打开轻量 3D structure 预览，并导出 PNG/CDXML/XLSX 报告 artifact；不恢复通用 Settings/Preferences、More canvas actions overflow、旧 ShellClient `energy.compute` 后端命令面板、EnergyProfilePanel、Object Registry / Objects tab 或 correction 表单。

2. `desktop-shell-electron`：新增 Electron 壳，复用 Vite renderer，提供 macOS/Windows 窗口、菜单、文件选择、项目目录打开/保存、应用图标、打包脚本、release smoke、packaged runtime smoke 和 Windows installer smoke。当前已落地可复现 icon generator、PNG/ICNS/ICO 资产、builder icon 配置、macOS hardened runtime entitlements、embedded Node engine fallback、Windows x64 unpacked app、NSIS setup 和 portable artifacts 的结构验证，以及 macOS/Windows unpacked app runtime 与 Windows NSIS 安装/启动/卸载 smoke 的 CI 验证入口；packaged runtime smoke 会验证 renderer 工作台、`Node / Source / Export` Inspector tabs、inactive UI 文案缺席、preload engine status 和 candidate registration；本机最新验证中 `desktop:pack` 已通过明确的 macOS dir target 刷新当前 mac-arm64 unpacked app，`desktop:runtime:smoke` 也已通过；`desktop:pack:win` 已刷新当前 Windows x64 unpacked app 并通过 release 结构 smoke，但最新 Windows installer/portable 和 `.exe` runtime 仍需 Windows CI 或 Windows 机器重新产出/运行；签名/公证成功证据、自动更新和 Windows 安装器真实用户机器/发布渠道验证仍是 release 流程缺口。

3. `local-engine-ipc`：设计并接入本地 engine IPC，替换 Web 旧 local-http bridge 心智；桌面壳自动启动 engine，用户不手动启动 Python。当前已落地 `engine.status`、lightweight `import.preview` candidates/provenance/warnings、lightweight stateless `import.register_selection` / `import.register_all`、preload `registerImportCandidates` renderer 接入、renderer-derived lightweight `importLedger`、轻量 `project.validate/open/save`，以及 `.rxnflow` file/node/edge/barrier/importLedger 引用、node 能量/position/可选 coefficient 形状、source/export 文件存在性和 checksum warning；完整 cclib/ASE parser、旧持久化 registry workflow 和 ProjectContent command contract 仍待扩展。

4. `desktop-project-store`：重新设计桌面项目保存、打开、raw files、exports 和 `.rxnflow` 项目目录。当前已落地轻量 `.rxnflow` directory、renderer-derived lightweight `importLedger`、canvas `barriers`、带 size/sha256 的 source 副本、带 size/sha256 的 export artifact manifest、file/node/edge/barrier/importLedger 基础引用校验、node 能量/position/可选 coefficient 形状校验、renderer validation issue 悬浮提示、legacy `.rxnflow.json` 打开兼容和基础 recent projects；Project Content 深校验、migration、content index 和 artifact cleanup/repair 仍待设计。

5. `parser-engine-reintroduction`：从历史备份中按 UI 需求重新引入完整 Gaussian/ORCA/MAPLE/XYZ/extxyz parser engine，不恢复旧 fixture 大矩阵，先做用户路径覆盖。当前已先落地 local-engine / renderer fallback lightweight parser、preview candidates/provenance/warnings、lightweight stateless engine register commands、Electron renderer register IPC、renderer-side 多候选 chooser/fallback register workflow，以及保存/校验当前 UI 可表达的 lightweight `importLedger`；普通 XYZ comment energy、坏 XYZ `parse_failed` 投影、ORCA Cartesian coordinate/charge/spin 摘要、ORCA `TOTAL SCF ENERGY`/`Total Energy` fallback、MAPLE 多帧 XYZ 无单位 Hartree energy comment 与 ASE extxyz metadata summary 已回补，完整 cclib/ASE parser 和旧持久化 import registry workflow 仍按后续 feature 处理。

6. `report-export-reintroduction`：按 UI 里的 Export 入口重新引入原报告导出的 PNG/CDXML/XLSX。当前已先落地 renderer-side lightweight writer；Electron 在当前工作区文件夹下保存 artifact bytes、更新 `exports/manifest.json`，并在 Export summary 中回显保存位置。旧 Python ReportExportService、完整 artifact index、CSV/SVG 高级导出和 PDF/PPTX/CDX 继续保持 roadmap 状态。

7. `advanced-persistence-backlog`：重新评估 project bundle、content validation、migration、artifact index 是否需要回归；不默认恢复旧实现。

## 6. 排期

- 先完成 `canvas-workbench-rebuild`，稳定视觉和交互骨架。
- 其次做 `desktop-shell-electron`，让真实用户不需要 Python 或 bridge 知识。
- 再接 `local-engine-ipc` 和 `desktop-project-store`。
- Parser / report export 按 UI 验证后的真实需求逐项回引。

## 7. 观察项

- 如果未来 Web 要支持真实上传解析，必须二选一：浏览器内 Pyodide/TS parser，或云端 Python API。静态 Vercel demo 本身不能无后端完成任意真实解析。
- Flowith 的可借鉴点是 canvas-first 信息组织与节点引用，不是未经证实的技术栈。
- Codex App 的可借鉴点是 Electron + TypeScript/Node UI 壳与本地 engine/app-server 分层，而不是照搬其 agent domain。
