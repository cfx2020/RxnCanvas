---
doc_type: dev-guide
slug: desktop-rebuild-verification
status: current
summary: 当前桌面画布重构的验证命令和 UI 检查范围
tags: [desktop, electron, react, qa]
last_reviewed: 2026-06-15
---

# Desktop Rebuild Verification

当前 active 产品边界是 React/Vite renderer + Electron shell + local-engine lightweight `import.preview` candidates/provenance/warnings + lightweight stateless `import.register_selection` / `import.register_all` + Electron preload `registerImportCandidates` + renderer candidate review/fallback register + renderer-derived lightweight `importLedger` + lightweight `project.validate/open/save` + `.rxnflow` file/node/edge/barrier/importLedger 基础引用校验 + node 能量/position/可选 coefficient 形状校验 + source/export 文件存在性与 checksum warning + packaged embedded Node engine fallback + renderer-side fallback source parser + renderer-side lightweight report export + smoke Python core。验证时只证明当前可用功能，不证明历史完整 parser engine、local-http bridge、旧 Python ReportExportService 或 project bundle 能力。

## 命令

```bash
python3 -m unittest discover
cd web && npm run test
cd web && npm run build
cd web && npm run desktop:smoke
cd web && npm run desktop:release:smoke
cd web && npm run desktop:pack
cd web && npm run desktop:runtime:smoke
cd web && npm run desktop:pack:win
cd web && npm run desktop:installer:smoke:win
python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-desktop-canvas-rebuild/rxnflow-desktop-canvas-rebuild-items.yaml --yaml-only
```

## UI 检查

使用 `cd web && npm run dev` 启动 Vite，再打开 `http://127.0.0.1:5173/`。

桌面和窄屏都要确认：

- 首屏直接显示工作台和画布。
- Project Rail 的 `New Project Folder` 和 `Open Folder` 应作为可访问按钮出现；Electron 模式应调用 native workspace folder create/open，浏览器预览应可通过 `.rxnflow.json` package input 恢复项目。`New Project Folder` 应展开 `Create project` 表单；输入项目名创建后应进入空工作区。切回 `Diels-Alder Study` 应恢复示例文件和画布节点，再切回新项目仍应显示空文件区和空画布，不能只换项目名而沿用上一项目画布内容。项目行的 `Project actions` 应打开 `Import files into project` 和 `Delete project` 菜单项；对非当前项目执行导入或把外部文件 drop 到项目行后，应切到该项目并只在该项目显示新增 source/node。删除前出现确认层；确认删除当前项目后应切到另一个项目且不保留被删项目的画布/文件状态。
- `Import` 和项目行 `Import files into project` 可以添加 parsed/staged source node，并在 Source Inspector 显示 preview；Electron 模式优先使用 local engine `import.preview`，浏览器模式使用 renderer fallback parser。Gaussian / ORCA（含常见 Cartesian coordinate、charge/spin 摘要、`FINAL SINGLE POINT ENERGY` 与 `TOTAL SCF ENERGY`/`Total Energy` 形状）/ MAPLE（含多帧 XYZ 无单位 Hartree energy comment）/ 普通 XYZ comment energy（无单位按 Hartree、显式 Hartree/Ha 保留、eV 转 Hartree）/ ASE extxyz metadata（label、charge/spin、eV energy 转 Hartree）应显示解析出的节点信息；XYZ 形状错误但可识别为 XYZ 时应保留 staged source 并显示 `parse_failed` warning，不应退成 `unsupported_format`。多帧 XYZ/MAPLE/extxyz 应返回 candidates/objectCount/warnings，并打开候选选择面板，支持登记选中候选或全部候选；parser warning codes 应保持稳定排序，当前 UI 的多候选提示保留在 parser warning 之后。Electron 模式应优先走 preload `registerImportCandidates`，浏览器模式或 engine failure path 使用 renderer fallback。
- Project Rail 的 Files 区域应显示 source 文件行；点击文件行打开 Source Inspector，Meta/Ctrl 点击可多选，Shift 点击可范围选择，拖拽选中文件行时应写入 `application/x-rxnflow-raw-file` payload，行内 remove 按钮只移除文件行，不应隐式新增画布节点；匹配的 gas/solution log 应合并为一个结构行，显示 gas/sol 标记，拖拽时写入成组 source payload，未成对的单文件仍显示原始文件名；把文件行或外部 source 文件 drop 到画布时，应按 drop 的 graph-space 位置创建 source node 或候选登记面板。
- 节点可拖动，拖动中应连续跟随指针，release 后才吸附到 8px 网格；Select tool 在空白画布拖拽应显示框选层并在 release 后只更新节点选择，Pan tool 在空白画布拖拽应平移 viewport；普通 wheel 应平移画布且不改变 zoom，pinch-style 或 Ctrl/Meta+wheel 应以指针位置为锚点缩放；桌面宽度下小地图应以 `Navigate graph minimap` 可访问按钮出现，拖动时只显示 draft viewport window，松手后才提交主画布 viewport。节点/edge/barrier 支持 Shift 多选/反选；画布聚焦后 Delete/Backspace 应删除当前选择，Escape 应清空选择，方向键应按 20px 微调已选节点，Cmd/Ctrl+Z 与 Cmd+Shift+Z/Ctrl+Y 应撤销/重做画布编辑；输入框内按这些键不应触发画布快捷键。节点卡上的结构预览可折叠/展开；stoichiometric coefficient chip 可从 `×1` 改成其他非零有限值，并可通过 Undo/Redo 恢复。节点卡应显示当前 Energy/Unit 选项下的相对能量，`Set zero`/`Zero` 控件应可把该节点设为相对能量 zero point。
- 节点右侧连接点可拖出 edge；拖拽 release 即使发生在 window 上，也应按指针下命中的目标节点完成 edge，空白或同节点 release 应清掉临时线且不新增 edge。连接点也支持键盘激活，再在目标节点上用 Enter/Space 创建 edge。edge 可选中并显示在 Inspector，Inspector 可编辑 edge label，画布 edge label 和可访问名称应同步更新。
- 节点底部 barrier 手柄可拖到另一个节点，创建显式 barrier annotation；画布应出现 barrier arrow/guide 和 `Barrier label` 内联输入框，默认标签来自源/目标节点能量差；blur/Enter 可保存自定义 label，切换选择后 label 按钮可重新进入编辑，Delete selection 可删除当前 barrier，Undo/Redo 可恢复 barrier 创建、label 和删除。
- 悬浮工具条的 Energy/Unit/Undo/Redo/Delete selection/Auto layout/Fit view 可用：Energy 只提供当前 lightweight 表格真实承载的 `Egas`/`Gsol`，Unit 提供 hartree/kcal/mol/kJ/mol，并直接更新节点卡和 Table view 的相对能量；创建、删除 edge、编辑 edge label、微调节点或编辑 node coefficient 后可撤销/重做，Delete selection 会删除当前 node、edge、barrier 或混合选择，Auto layout 会按当前 Energy/Unit 能量源和 zero point 重排节点，Fit view 会适配当前节点 bounds。
- Table view、Source、Export 都能打开；节点卡 More actions 菜单里的 Source details 应打开该节点对应的 Source Inspector；主界面不应显示 Objects / Object Registry / Apply correction。有坐标 source 的节点卡和 Node 面板 `Structure Preview` 应显示 lightweight 2D skeletal SVG，不应显示旧占位 glyph、伪 3D 缩略图或 自动补出的隐式氢文本；Node 面板 `Edit 2D` 应打开 Ketcher 2D editor，保存后该节点出现 `Reset 2D` 并使用手动 KET/Molfile/CDXML/SVG 覆盖预览，重置后恢复自动推断；Node 面板里的 `3D Structure` 应打开 3Dmol.js ball-stick 查看器；有坐标 source 应显示 3Dmol canvas。
- Electron open/save 返回 project validation issues 时，画布应显示 `Project warnings` 或 `Project needs repair` 悬浮提示；barriers 应随 project package 保存/恢复，并由 Python engine 与 embedded engine 校验基础引用；桌面和窄屏都不应与顶部工具条重叠或产生水平溢出。
- Export 只显示 PNG/CDXML/XLSX 三个原 UI 默认报告格式，不显示 CSV/SVG/PDF/PPTX/CDX/JSON 格式开关；导出成功后 Export summary 应显示 artifact 名称、大小和保存位置。Electron 打开工作区文件夹时应回显项目内 `exports/...` 路径。
- 浏览器预览右上角显示 `Browser preview`；Electron 模式应可通过 preload 获取 local engine status，并显示 `Local engine` 或明确的 offline 状态；打包态即使找不到外部 Python engine，也应通过 embedded Node engine 返回 ready status。
- 页面不显示 local-http、Python bridge、ShellClient、cloud/Auth/sync、Search flows、Settings/Preferences、More canvas actions、Add Node、Compute/Profile、Objects、Object Registry、Apply correction 等非 active 功能；2D `Structure Preview` 属于当前 active UI，使用项目内轻量 SVG 从 source 坐标推断 skeletal depiction，并允许用户用 Ketcher editor 保存/重置单节点 KET/Molfile/CDXML/SVG；`3D Structure` 属于当前 active UI，使用 3Dmol.js 按 source 坐标渲染；2D/3D 原子联动仍不属于当前 active UI。
- 没有水平溢出、文本重叠或工具条遮挡主流程；520px 以下悬浮工具条应换行显示，`Unit` 的 `kcal/mol` 不应被裁切。
- UI 字距保持默认 `letter-spacing: 0`，触控目标保持 44px 左右，且 `prefers-reduced-motion` 下不会保留长动画。

## 桌面壳边界

Electron 当前只验证：

- BrowserWindow/main/preload 文件存在。
- 原生文件选择读取 64KB source preview，local engine `import.preview` 负责轻量解析，renderer 使用解析结果创建 parsed/staged node；候选登记时 Electron renderer 优先通过 preload `registerImportCandidates` 调用 local engine `import.register_selection/all`。
- PNG/CDXML/XLSX report artifact 保存；打开了工作区文件夹时 artifact 会写入项目内 `exports/` 并更新 `exports/manifest.json`。
- 本地工作区文件夹创建/打开/自动保存、`.rxnflow.zip` 导出、轻量 `importLedger` 写入/校验、source 副本写入、source/export size + sha256 元数据、file/node/edge/barrier 基础引用校验、node 能量/position/可选 coefficient 形状校验、打开项目时的缺失/不一致 warning、renderer Project validation 悬浮提示、旧 `.rxnflow.json` package 读取兼容，以及 recent projects 去重/持久化。
- `desktop:smoke` 会通过 `web/electron/engine-bridge.cjs` spawn `python3 -m rxnflow.engine_ipc` 并验证 `engine.status`、`import.preview`、`import.register_selection`、`import.register_all`、`project.validate`、`project.open`、`project.save`、file/node/edge/barrier/importLedger 引用校验、source checksum warning 和 export artifact checksum warning。它也会强制走 embedded Node engine fallback，验证其支持 `engine.status`、`import.preview`、`import.register_all` 和当前 UI 需要的 project capabilities/reference validation。`engine-bridge.cjs` 只会在 Python engine unavailable / timeout / bad response 时自动降级，不会吞掉真实 command validation 错误。
- `desktop:release:smoke` 会先运行 `desktop:icons`，再验证 Electron builder 元数据、RxnFlow PNG/ICNS/ICO 图标资产、macOS `dmg/zip` target、hardened runtime entitlements、Windows x64 `nsis/portable` target、Windows installer smoke wiring、runtime smoke wiring、发布 CI workflow、当前平台 unpacked app 结构，以及存在时的 Windows unpacked/installer/portable artifact 结构。
- `desktop:runtime:smoke` 会启动当前平台的 packaged unpacked app，传入 `--rxnflow-smoke-exit`，确认 packaged renderer 渲染出工作台、Inspector 只暴露 `Node / Source / Export`、Export 面板只暴露 PNG/CDXML/XLSX、不出现 Computer Profile / Objects / Object Registry / Compute/Profile / local-http / Python bridge / ShellClient 或 CSV/SVG/PDF/PPTX/CDX/JSON 等 inactive UI 文案、preload engine status ready、engine `registerImportCandidates` 能登记 Gaussian preview 后进程能干净退出。Windows CI 使用这条命令启动 `web/release/win-unpacked/RxnFlow.exe`；macOS CI 使用这条命令启动 `.app/Contents/MacOS/RxnFlow`。
- `desktop:installer:smoke:win` 在 Windows 上会找到 `web/release/RxnFlow Setup 0.0.0.exe`，静默安装到临时目录，启动安装后的 `RxnFlow.exe --rxnflow-smoke-exit`，确认 `RXNFLOW_DESKTOP_RUNTIME_SMOKE_OK` marker，再静默卸载；非 Windows host 会跳过。
- 当前 `web/build/icon.svg` 是桌面图标源资产，`web/build/icon.png`、`web/build/icon.icns`、`web/build/icon.ico` 由 `npm run desktop:icons` 生成。当前 macOS/arm64 环境中 `desktop:pack` 使用 unsigned local pack，并通过明确的 `electron-builder --mac dir` target 刷新 `web/release/mac-arm64/RxnFlow.app`；2026-06-15 本机重跑 `npm run desktop:pack` 和随后的 `npm run desktop:runtime:smoke` 均已通过。2026-06-15 本机重跑 `npm run desktop:pack:win` 已刷新 `web/release/win-unpacked/RxnFlow.exe` 和 `resources/app.asar`，随后 `npm run desktop:release:smoke` 通过 Windows x64 unpacked 结构检查；macOS host 仍不能作为 Windows `.exe` runtime 通过证据。仓库中仍存在此前 `desktop:dist:win` 生成并通过结构验证的 `web/release/RxnFlow Setup 0.0.0.exe` 和 `web/release/RxnFlow 0.0.0.exe`，但本机 macOS 交叉重跑完整 NSIS/portable dist 曾在 packaging 后长时间无进展并被中断，因此“最新 renderer 对应的 Windows installer/portable”需要 Windows CI 或 Windows 机器重新产出和验证。Windows CI 会对 NSIS 安装器执行安装/启动/卸载 smoke；真实用户机器和发布渠道验证仍待 release 流程补充。
- `.github/workflows/desktop-release.yml` 已定义发布验证：macOS runner 会构建 unsigned unpacked app 并运行 packaged runtime smoke；Windows runner 会构建 `win-unpacked`、启动 `RxnFlow.exe`，再生成 NSIS/portable artifacts，运行 `desktop:installer:smoke:win`，并做 release smoke 结构/配置检查。workflow 手动触发且勾选 `notarize_macos` 时，会使用 `MACOS_CSC_LINK`、`MACOS_CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_TEAM_ID`、`APPLE_APP_SPECIFIC_PASSWORD` secrets 构建签名 macOS artifacts，再运行 `desktop:notarize:mac` 提交 notarytool、staple app/DMG 并执行 `spctl`。
- `desktop:pack` 的 macOS app 是本地 unsigned unpacked app，用于结构、资源和 runtime smoke 验证，不是可分发签名包；当前 `codesign --verify --deep --strict web/release/mac-arm64/RxnFlow.app` 仍不能作为分发通过证据。hardened runtime/entitlements 配置和 notarization 脚本已经落地，但“可分发签名包已通过公证”只有在带 Apple Developer ID secrets 的 release workflow 成功后才成立。
- 当前 packaged app runtime smoke 证明的是桌面进程、renderer 工作台、active UI 边界、lightweight importLedger persistence 和 lightweight embedded desktop engine commands 可启动。打包态如果无法运行 `python3 -m rxnflow.engine_ipc`，`engine-bridge.cjs` 会降级到 `electron/embedded-engine.cjs`；renderer fallback 仍保留给浏览器预览或 engine failure path。完整 cclib/ASE parser 与旧持久化 registry 不在 embedded engine 范围内。

真实 Apple Developer ID 签名/公证成功证据、自动更新、Windows 安装器真实用户机器/发布渠道验证、完整 cclib/ASE parser、旧持久化 import registry workflow、Project Content 深校验/migration/content index 不属于当前完成项。
