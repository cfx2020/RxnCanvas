# RxnFlow 架构总入口

> 状态：当前
> 创建日期：2026-05-01
> 最近更新：2026-07-10

## 1. 当前产品边界

RxnFlow 现在处于桌面画布重构期，旧代码已备份到 `.codestable/history/2026-06-12-pre-desktop-canvas-rebuild/rxnflow-pre-desktop-canvas-rebuild.tar.gz`。当前架构以用户最新规则为准：

- 原 UI 已承载的用户可见功能应在当前桌面工作台保留轻量可用入口；原 UI 没承载或用户未认可的功能，不出现在当前主界面。
- 已有底层但当前 UI 不承载的能力先移入 roadmap/backlog，不作为 active code 继续维护。
- 当前 Web 只做本地优先桌面 renderer / demo，不做账号、云同步、Vercel 云解析或用户手动 Python bridge。
- 目标客户端是 macOS 和 Windows 桌面端；当前 active 组合是 Electron + React/Vite renderer + bundled Python+cclib local engine。

## 2. 当前 active 形态

### Web Renderer

`web/` 是当前唯一 active UI 工程，技术栈为 React + TypeScript + Vite + npm。它现在提供一个本地优先画布工作台：

- 左侧 project rail：本地项目/工作区列表、桌面端 `New Project Folder` 创建真实用户可见工作区文件夹、`Open Folder` 打开已有工作区文件夹、按项目隔离/恢复 renderer 工作区快照、通过 `Project actions` / `Import files into project` 把本地文件导入目标项目、通过项目行 drop 把外部文件导入目标项目、通过 `Project actions` / `Remove from sidebar` 从 renderer 本地项目列表移除项目引用（不删除磁盘文件夹）、active project 下的 canvas 列表、按结构名分组的文件列表与成组 source 拖拽，以及左下角 Settings 入口。左侧栏折叠后仍保留 hover preview rail。浏览器预览仍只能通过 hidden file input 打开 JSON 项目包做 UI 验证，不能真正打开本地文件夹；Settings 在浏览器里只做外观/单位等可降级项，外部 app opener 控件标记为 Desktop only。
- 中间 canvas/table：项目级多 Canvas Tab，支持按项目名派生默认标签、新建、重命名、关闭与持久化恢复；反应节点画布、节点拖拽、Select tool 空白画布框选、Pan tool 空白画布拖拽平移、节点手柄拖拽或键盘激活后创建 edge、edge label 画布内编辑、barrier 与 text/image annotation、画布平移/缩放、可拖拽导航 minimap、能量表视图，以及带滑动动画的 canvas/table 切换。source files 仍是项目级共享资源；每个 canvas 单独保存 nodes / edges / barriers / annotations / viewport / selection。删除与节点 Rename / Set zero / Source details 这类低频操作走 canvas/node 右键菜单和键盘快捷键，不再挤在悬浮工具栏或节点三点菜单里。
- 右侧 inspector：节点详情、source preview 和 export dock；节点详情现在是统一 node panel，含 formula+分子量、method/basis、charge-spin、energy/free energy、termination、elapsed、optimization curve，以及单按钮打开的 structure dialog。结构对话框打开后左侧显示 2D、右侧显示 3D。Object Registry / Objects tab / correction 表单不属于当前 active UI。
- 导入路径：Electron dialog/drop 先创建 metadata-only source placeholder，Project Rail 立即显示文件名、大小、类型和 pending progressbar；随后 Electron 把原始 log/out/xyz 复制到工作区根目录的 `sources/`，再通过 renderer 限并发队列把单文件 job 交给 bundled Python engine `import.preview`。Gaussian/ORCA full-file 的 source kind、energy/free energy、basis count 和 coordinates 以 cclib 为权威；RxnFlow text parser 只补 termination/job time/opt+freq continuation、solvent/role labels、XYZ/MAPLE 和 browser fallback 等应用元数据。项目元数据写入工作区内隐藏 `.rxnflow/` 目录，后续持久化使用 project-relative `storedPath`，`sourcePath` 只作为本次导入解析和复制的临时来源。`SourceFile.checksum` 记录当前项目副本的磁盘版本，`parseChecksum` 记录结构化 parse 对应版本；窗口重新聚焦、项目激活和项目文件拖入画布前会检查项目副本，变更后重新解析完整 gas/sol 分组，两者不一致时旧 parse 不得参与节点能量或 gas/sol 配对。浏览器开发预览继续使用 renderer-side parser fallback，不能访问本地绝对路径或写入项目文件夹。单候选 source 自动生成 parsed source node；多候选 source 进入候选选择面板，支持登记选中候选或全部候选为节点，并把 candidate/parser provenance 持久化到项目节点和轻量 `importLedger`。
- 相对能量当前由 renderer 根据画布节点、baseline 和 gas/solution source 计算，并通过画布级紧凑 `ΔEgas` / `ΔGsol` 显示；输出单位的权威偏好在 Settings 中，默认 `kcal/mol`，可切到 `Eh` / `kJ`。它不恢复旧 UI `Compute`/PES 面板、旧 Python `energy.compute` command、Object Registry 或 correction policy engine。
- Export 当前恢复原 UI 默认承载的 PNG/CDXML/XLSX 报告 artifact，由 renderer-side `web/src/domain/reportExports.ts` 生成；CSV/SVG/PDF/PPTX/CDX 和旧 Python ReportExportService 不在当前 active UI 中伪造。
- Electron 模式右上角显示 local engine 状态；浏览器预览显示 `Browser preview`。macOS traffic lights 已在 Electron 主窗口显式恢复，workspace topbar / canvas tab bar 使用 drag region 支持拖动窗口。

当前 Web renderer 不依赖本地 HTTP bridge、IndexedDB project repository、ShellClient、Three.js 分子 viewer、i18n runtime 或 Playwright E2E harness。节点卡/Inspector `Structure Preview` 使用项目内代码从导入坐标或 canonical Molfile 生成受控 SVG depiction；Ketcher 编辑结果只持久化 KET/Molfile/CDXML，不持久化或注入第三方 SVG。`3D Structure` 使用 3Dmol.js 做真实坐标 ball-stick 预览，普通结构弹窗默认播放第一个振动模式；过渡态导入顺序由解析结果提供，通常对应最大虚频。普通视图支持键长、键角、二面角内联量测与 `C1`/`H2` 风格元素序号标签；这不是恢复旧 Three.js 自研测量工具，也不做 2D/3D 原子联动或 atom-map 工作流。

### Local Engine

`rxnflow/engine.py` 只保留当前桌面工作台需要的 local engine：

- `demo_flow()` 返回本地演示 ReactionFlow。
- `export_flow_json()` 输出稳定 JSON。
- `parse_source_preview()` 提供 renderer/browser fallback text parser；`preview_sources()` 在有 `sourcePath` 时读取完整文件，并优先把 Gaussian/ORCA full-file 交给 cclib 解析。
- `rxnflow/engine_ipc.py` 提供 stdin/stdout JSON command boundary，当前支持 `engine.status`、`flow.demo`、`import.preview`、`import.register_selection`、`import.register_all` 和轻量 `project.validate/open/save`；`engine.status` 回传 `runtime`、Python 版本和 `dependencies.cclib`。
- `import.preview` 返回兼容当前 UI 的扁平 parse 字段，同时附带 `parserId`、`parserVersion`、`parseScope`、`confidence`、`objectCount`、`warnings`、`candidates`、`coordinatePreview`、`CoordinatePreview.vibrationModes`（存在可靠振动数据时）和当前表格使用的 `energyTable`。Gaussian/ORCA 的 source kind、energy/free energy、basis count 和 coordinates 只从 cclib 合并；text parser 继续补 termination/job time/opt+freq continuation、solvent/role labels 和 non-cclib/browser fallback。`import.register_selection` / `import.register_all` 提供轻量、无状态的候选登记对象摘要并保留 `energyTable`。Electron renderer 通过 preload 优先调用这些 register commands，再把对象摘要映射成画布节点；浏览器预览 fallback 到 renderer-side candidate register。
- 工作区文件夹打开/保存路径会校验 `.rxnflow/project.json` project envelope（当前 schemaVersion 2 为共享 source files + `canvases[]` + `activeCanvasId`）、safe project-relative paths、file/node/edge 基础引用一致性、轻量 `importLedger` entry/file/node 引用、node 能量单位/数值/position 形状，以及工作区 `sources/` / `exports/` 文件存在性、size 和 sha256 checksum；缺失文件或不一致 checksum 是 warning，不安全路径和破坏项目结构的字段是 error。

它不是旧 parser/registry/graph/energy/export/platform shell 的替代品，也不提供完整真实输出兼容矩阵或报告生成。

### Desktop Target

桌面端已有最小 Electron 壳，位于 `web/electron/`，当前架构约束是：

- Electron shell 负责 macOS/Windows 窗口、菜单、文件选择、打包和启动本地 engine。
- Electron shell 已提供原生文件导入、真实工作区文件夹创建/打开、自动保存到当前工作区、流式导出和安全导入 `.rxnflow.zip`（压缩包、单条目、展开总量和条目数均有限制）、轻量 `importLedger` 持久化、source size/sha256 元数据、旧 `.rxnflow.json` package 读取兼容、当前 project 下 PNG/CDXML/XLSX report artifact store、export artifact size/sha256 元数据、基础 recent projects 菜单持久化。常规项目不再托管到 Electron `userData/projects/`；没有创建或打开工作区文件夹时，桌面端 autosave 只返回 `project_folder_required` warning，不静默写隐藏主项目目录。
- Electron shell 已提供 `web/electron/engine-bridge.cjs`，打包态 spawn app extraResource 里的 `engine/rxnflow-engine`，开发态优先使用 `web/engine/rxnflow-engine`，没有构建产物时才回退 `python3 -m rxnflow.engine_ipc`；它执行 `engine.status`、cclib-backed full-file `import.preview`、lightweight stateless `import.register_selection` / `import.register_all`、轻量 `project.validate/open/save`、file/node/edge 引用校验和 source/export checksum warning 验证。`web/electron/embedded-engine.cjs` 已删除，不再作为 packaged fallback。
- Electron shell 保存桌面偏好到 Electron `userData/rxnflow-preferences.json`，当前 schema 包含 `appearance: system | dark | light`、`energyOutputUnit` 和 `sourceOpeners.gaussian/text`。Source 外部打开不再走系统默认 `shell.openPath`，而是按 source kind / parser id 分类为 Gaussian 或 text profile，依次使用用户偏好、常见默认路径探测、选择应用弹窗，并通过无 shell 字符串的 app path + file path 启动外部应用。偏好不写入项目 JSON 或导出包。
- 桌面/Python engine 当前统一版本为 `0.1.0`。Electron builder 已配置 macOS `dmg/zip` 和 Windows x64 `nsis/portable` target；生产 ASAR 只携带 Electron main 所需运行时依赖，renderer 依赖由 Vite bundle；Python engine 由带 hash 的 lockfile 构建。renderer 有 CSP、导航/新窗口拦截和生产菜单限制，macOS afterPack 会移除未使用隐私权限并收紧 ATS。CI 会生成 SHA-256 与 release manifest，并上传第三方依赖清单。
- `desktop:runtime:smoke` 会启动 packaged unpacked app，等待 React 工作台渲染，并通过 preload 调用 engine status 与 `registerImportCandidates` 后退出；`.github/workflows/desktop-release.yml` 会在 macOS runner 上验证 unsigned unpacked app runtime，在 Windows runner 上验证 `win-unpacked/RxnFlow.exe` runtime，再生成 Windows NSIS/portable artifacts，并运行 `desktop:installer:smoke:win` 对 NSIS 安装器执行安装、启动、卸载 smoke。推送 `v*-beta.*` tag 时，同一次 workflow 会额外生成 ad-hoc signed macOS DMG/ZIP，等待两端验证成功后只汇总 EXE/DMG/ZIP，生成统一 checksum/manifest，并以 job 级 `contents: write` 权限创建 GitHub Pre-release；blockmap 和平台临时清单不进入用户下载列表。手动 workflow 仍可在提供 Apple Developer ID secrets 时执行签名 macOS dist、notarytool 提交、staple 和 `spctl`。
- React/Vite renderer 复用当前 Web Workbench UI。
- 旧持久化 import registry workflow 和 ProjectContent engine IPC 不属于当前 active surface；当前只保留 UI 已承载的 lightweight `importLedger`，用户不需要手动启动 Python bridge。
- 当前尚未取得真实 Apple Developer ID 签名/公证成功证据，也未完成自动更新或 Windows 安装器真实用户机器/发布渠道验证；当前 macOS/arm64 环境已通过 unsigned local `desktop:pack` 刷新 mac-arm64 unpacked app 与 `icon.icns`，也已通过 `desktop:pack:win` 刷新 Windows x64 unpacked app。仓库中保留此前 `desktop:dist:win` 生成并通过结构验证的 NSIS setup 和 portable artifacts，但最新 renderer 对应的 Windows installer/portable 需要 Windows CI 或 Windows 机器重新产出验证。Windows CI 已接入 NSIS 安装/启动/卸载 smoke。packaged app runtime smoke 证明桌面进程、renderer 工作台和 bundled Python+cclib engine commands 可启动；它不证明旧 registry/ProjectContent engine 已恢复。

## 3. 当前不在 active code 的能力

以下能力在旧代码、旧文档或历史 feature 中出现过，但本轮不作为当前实现承诺：

- 旧 `energy.compute` Shell command、EnergyProfilePanel、完整 EnergyProfilePanel correction policy、Object Registry / Objects tab / correction 表单和完整 ObjectRegistryPanel service 绑定；当前 active UI 只有 renderer-side lightweight relative energy display。
- 旧完整 parser 兼容矩阵、cclib/ASE fixture corpus 和旧持久化 import registry workflow；当前 active code 有 bundled Python+cclib local engine、renderer fallback parser、preview candidates、Electron preload register IPC、lightweight stateless engine register commands、renderer-side fallback register 和 lightweight `importLedger`。Gaussian/ORCA full-file 标准字段已由 cclib authoritative 回归，但旧 registry workflow 和大矩阵 fixture 仍不在 active code。
- Project Content 深持久化、IndexedDB repository、migration/content index；当前 active code 有真实工作区文件夹、隐藏 `.rxnflow/project.json` / `.rxnflow/manifest.json` 轻量 state、基础 file/node/edge/importLedger 引用校验、带 checksum 的 `sources/` 副本、`exports/manifest.json`，以及受资源限制保护的 `.rxnflow.zip` 导入/导出。
- Local HTTP shell bridge、Platform Shell、CLI command surface。
- Three.js 自研 3D 分子 viewer、旧结构测量和 2D/3D 原子联动；当前 active UI 使用 lightweight 2D `Structure Preview` / Ketcher + Indigo WASM `Edit 2D` 与 3Dmol.js `3D Structure` 坐标查看器，并在 3Dmol 实现新的振动播放与普通视图内联结构量测。
- CSV/SVG/PDF/PPTX/CDX 导出、旧 Python ReportExportService、report manifest 深校验和完整 artifact index。
- 云 Web、账号/Auth、跨设备同步、对象存储、serverless command executor。

这些内容只允许出现在 `.codestable/roadmap/` 或历史备份中；如果重新进入 active code，必须先有新 feature design，并确认 UI 承载方式。

## 4. 当前验证入口

- Python smoke：`python3 -m unittest discover`
- Web test：`cd web && npm run test`
- Web build：`cd web && npm run build`
- Web preview：`cd web && npm run dev`，打开 `http://127.0.0.1:5173/`；端口被占用时使用 Vite 输出的新端口。
- Desktop runtime smoke：`cd web && npm run desktop:runtime:smoke`
- Desktop smoke / release smoke：`cd web && npm run desktop:smoke`、`cd web && npm run desktop:release:smoke`

涉及 UI、画布、表格或导出的改动必须浏览器验证桌面和窄屏布局。

## 5. 变更记录

- 2026-07-10：同步发布准备修复现状：移除第三方 SVG 持久化/注入、恢复 annotation round-trip、统一 `0.1.0` 版本、锁定 Python engine 依赖、收紧 Electron renderer 与 macOS 权限、增加大文件/归档资源边界、实现 `.rxnflow.zip` 安全导入与流式导出、缩减生产 ASAR，并增加 release manifest、SHA-256 和第三方依赖清单。
