---
doc_type: issue-fix
issue: 2026-06-19-workbench-ui-regressions
path: fast-track
fix_date: 2026-06-19
tags: [ui, canvas, electron, node-card, browser-qa]
---

# 工作台 UI 回归修复记录

## 1. 问题描述

用户通过两张截图反馈工作台存在多处 UI / 交互回归：顶部 `Local engine` 状态占位且导出按钮与侧栏按钮重叠；macOS 原生红黄绿窗口按钮被隐藏；画布无法用触控板滚动平移；节点卡片头部按钮错位、INT/TS 标注位置不对、标题不可直接改名、`×1` 系数溢出、能垒标注入口像折叠箭头且背后有卡片；2D 结构预览缺少 hover 后打开 3D 的全屏入口。

## 2. 根因

- `web/electron/main.cjs` 在 macOS 上调用 `setWindowButtonVisibility(false)`，把用户想保留的系统 traffic lights 一并隐藏了。
- 顶栏导出按钮继续复用旧的 `.floating-export-trigger` 浮动样式，但当前位置已迁移到 `.workspace-topbar-actions`，导致按钮按旧 absolute 定位覆盖右侧栏按钮；engine ready / browser preview 状态对用户没有信息价值，却占用顶栏空间。
- 画布 wheel 监听只在 App 初次 mount 时绑定一次；在 canvas/table 视图切换或画布 DOM 重新挂载后，新 `.canvas-surface` 没有重新绑定 wheel listener。
- 节点卡片 CSS 后置 override 把 header actions 改成两行 grid，并用负 margin / absolute 定位更多按钮；footer 的系数控件也有负 margin；能垒入口用伪元素画了一个额外背景并保留了箭头状路径。
- 节点标题只能从更多菜单触发 rename；2D 预览组件没有从画布卡片打开现有 3D dialog 的回调入口。

## 3. 修复方案

- macOS Electron 窗口显式恢复 `setWindowButtonVisibility(true)`。
- 顶栏保留 export 的 smoke-test class，但在 `.workspace-topbar-actions` 下强制按普通紧凑按钮布局；`EngineStatusPill` 仅在真实离线错误时显示，ready/browser preview 默认隐藏。
- wheel listener 按 `viewMode` / active canvas tab 重新订阅，保证视图切回画布后触控板滚动仍能平移。
- 节点卡片 header 恢复单行 flex：折叠按钮、更多按钮、INT/TS badge 从左到右排列且 badge 位于最右；footer 去掉负 margin，系数按钮限制在卡片内；能垒入口改成小圆形按钮 + baseline/hump 活化能曲线图标并移除背后伪元素卡片。
- 节点标题改为可点击 inline rename；2D 预览新增 hover/focus 可见的全屏按钮，点击复用现有 `StructurePreviewDialog` 打开 3D 视图。

## 4. 改动文件清单

- `web/electron/main.cjs`：恢复 macOS 原生 traffic lights 可见性。
- `web/src/app/App.tsx`：隐藏无意义 engine ready/browser preview 状态；修复 export 顶栏按钮 class；重绑 canvas wheel listener；把画布节点 2D 预览接到现有 3D dialog。
- `web/src/app/CanvasWorkspace.tsx`：节点标题可直接 rename；节点 header actions 重排；2D 预览新增 hover 全屏按钮；能垒入口 SVG 改为活化能曲线。
- `web/src/app/workbench.css`：顶栏按钮、节点 header/footer、系数控件、能垒入口、2D hover 全屏按钮的最终布局修复。
- `web/src/app/App.test.tsx`、`web/src/app/CanvasWorkspace.test.tsx`：更新隐藏 engine 状态断言、补充 wheel remount 回归覆盖、适配 2D 预览新增交互。

## 5. 验证结果

- `python3 -m unittest discover`：通过，22 个 Python 测试。
- `cd web && npm run test -- --run`：通过，31 个测试文件 / 238 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `cd web && ./node_modules/.bin/electron electron/main.cjs --rxnflow-smoke-exit`：通过，当前 dist renderer runtime smoke OK。
- `cd web && npm run desktop:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，已重新生成 `web/release/mac-arm64/RxnFlow.app`。
- `cd web && npm run desktop:runtime:smoke`：通过，packaged runtime smoke OK。
- Browser QA（Browser plugin 不可用，使用 Node Playwright fallback）：通过。
  - 页面身份：`http://127.0.0.1:5173/` / `RxnFlow Workbench`。
  - 顶栏：engine pill 不显示；Export 与右侧栏按钮 rect 不重叠，均为 34×30。
  - 触控板平移：wheel 前 `.canvas-world` translate 为 `{ x: 340, y: 278 }`，wheel 后为 `{ x: 376, y: 230 }`；table/canvas remount 后 wheel 仍能从 `{ x: 376, y: 230 }` 变为 `{ x: 354, y: 254 }`。
  - 节点卡片：三个头部项同一行，TS badge 为最右项；`×1` 右边界在节点右边界内；能垒按钮伪元素 `::before` 为 `display:none`；2D hover 全屏按钮存在；点击后能打开 3D dialog。
  - 截图证据：`/tmp/rxnflow-ui-fixed-desktop.png`、`/tmp/rxnflow-ui-fixed-3d.png`、`/tmp/rxnflow-ui-fixed-narrow.png`。

## 6. 遗留事项

- 本轮通过 Electron source runtime smoke 验证 renderer 与桌面桥可运行，并从代码层恢复 macOS native traffic lights；实际红黄绿按钮的视觉位置仍建议用户在真实桌面窗口中肉眼确认一次。
- 本轮已重新打包本地 `web/release/mac-arm64/RxnFlow.app`；未做签名 / notarization / Windows 真机验证。

## 7. Node inspector 视觉重构补充（2026-06-19 02:xx）

用户继续反馈右侧 node 面板仍像调试面板，和左侧 rail 视觉语言不一致，尤其是 2D / 3D 入口按钮、框线层级和对齐方式。补充修复如下：

- `web/src/app/InspectorPanels.tsx`：选中节点时改为紧凑的 `Identity / Structure / Energy / Source` 结构；去掉完整 parser debug 明细，仅保留精简 source 文件名、kind/status、raw-log 入口；直接选中 source 文件时仍保留完整 `NodeSourceSummary` 诊断。
- `web/src/app/InspectorPanels.tsx`、`web/src/app/Molecule3DmolViewer.tsx`：将 2D 和 3D 视图并排放入同一 `Structure 2D / 3D` 区块；2D 编辑、2D reset、打开 3D 改成小 icon action；3D viewer 增加 `compact` 模式，隐藏 HUD 和长空状态文案。
- `web/src/app/workbench.css`：新增 rail-consistent node inspector 样式，降低边框/卡片厚重感，统一圆角、间距、按钮尺寸和 light/dark 色彩。
- `web/src/app/fileDisplay.ts`、`web/src/app/appSelectionAppliers.ts`：点击左侧 source 文件时清空当前 canvas node/edge/barrier selection，保证右侧真正进入 Source inspector；否则精简后的节点 source brief 会遮蔽完整 source 诊断。
- `web/src/app/InspectorPanels.test.tsx`、`web/src/app/fileDisplay.test.ts`、`web/src/app/appSelectionAppliers.test.ts`：更新 source inspector 与选择状态覆盖。

验证：

- `cd web && npm run test -- --run src/app/InspectorPanels.test.tsx`：通过，3 个测试。
- `cd web && npm run test -- --run`：通过，31 个测试文件 / 238 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- Browser QA（Browser plugin 不可用，使用 Node Playwright fallback）：通过。
  - 页面身份：`http://127.0.0.1:5173/` / `RxnFlow Workbench`。
  - 临时导入 `rxnflow-qa-orca-water.out` 后，直接 Source inspector 显示 parser / parse scope / confidence / shown text / raw log action。
  - 选中生成节点后，node inspector 中 parser/debug terms 不再出现；2D / 3D 为两列并排，旧 `.structure-preview-actions` 为 0。
  - 3D icon action 可打开 `StructurePreviewDialog`，显示 H2O、3 atoms、H/O 元素。
  - 820px 窄屏下 node inspector 仍保持 2D / 3D 两列，无按钮重叠。
  - 截图证据：`/tmp/rxnflow-node-inspector-source.png`、`/tmp/rxnflow-node-inspector-desktop.png`、`/tmp/rxnflow-node-inspector-3d-dialog.png`、`/tmp/rxnflow-node-inspector-narrow.png`。

## 8. Structure preview 交互纠正（2026-06-22）

用户进一步澄清：不是在右侧 node 面板里把 2D / 3D 分成左右两块，而是右侧面板保持一个结构入口；点击后打开的小窗口里左侧显示 2D 结构、右侧显示 3D 结构。

本次修正：

- `web/src/app/InspectorPanels.tsx`：node inspector 的 `Structure` 区块从内嵌 2D/3D 双栏改为单个 `Open structure` 按钮；弹出的 `StructurePreviewDialog` 改为左右双栏，左侧 `Molecule2DDepiction`，右侧 `Molecule3DmolViewer`。
- `web/src/app/App.tsx`：向结构预览弹窗传入 2D 编辑和 reset 回调，保持 2D 编辑能力，但不再占用右侧 node 面板。
- `web/src/app/workbench.css`：新增弹窗 2D/3D 双栏样式、node 面板单按钮样式、深色模式与窄屏适配。

验证：

- `cd web && npm run test -- --run`：通过，31 个测试文件 / 238 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `python3 -m unittest discover`：通过，22 个 Python 测试。
- Browser QA（Browser plugin 不可用，使用 Node Playwright fallback）：通过。
  - node inspector 中 `.node-structure-open-button` 数量为 1。
  - node inspector 中 `.structure-split-view` 和 `.structure-pane` 数量均为 0。
  - 点击 `Open 3D Structure` 后，弹窗中 `.structure-dialog-pane` 数量为 2，且 2D pane 在左、3D pane 在右。
  - 弹窗包含 2D depiction 与 3Dmol viewer，无相关 console error / warning。
  - 截图证据：`/tmp/rxnflow-structure-viewer-panel.png`、`/tmp/rxnflow-structure-viewer-dialog.png`、`/tmp/rxnflow-structure-viewer-narrow.png`。

## 9. 提交前打包记录（2026-06-22）

用户要求更新 CodeStable、提交并重新打包 app。本轮打包记录如下：

- `npm run desktop:pack` 首次在当前受限沙箱失败于 `desktop:icons`：Playwright Chromium 无法注册 macOS Mach port（`bootstrap_check_in ... Permission denied`）。未修改本地代理或系统配置。
- 仓库已有 `web/build/icon.icns`、`web/build/icon.png`、`web/build/icon.ico`，并由 release smoke 校验；因此在当前环境中跳过图标再生成，用本地 Electron runtime 离线打包：
  - `cd web && npm run build`
  - `cd web && ./node_modules/.bin/electron-builder --mac dir --publish never --config.mac.identity=null --config.electronDist=./node_modules/electron/dist`
- 离线打包成功，产物：`web/release/mac-arm64/RxnFlow.app`。
- 因 `identity=null` 会跳过 electron-builder 签名，本轮对本地 app bundle 补做 ad-hoc 签名：
  - `cd web && codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app`
  - `codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过。
- `cd web && node electron/release-smoke.cjs`：通过，确认 release 配置、renderer asset path、embedded desktop engine、icon assets、macOS unpacked app 结构。
- `cd web && npm run desktop:runtime:smoke`：当前受限执行环境中失败，packaged app 进程被终止且 stdout/stderr 为空；直接执行 `release/mac-arm64/RxnFlow.app/Contents/MacOS/RxnFlow --rxnflow-smoke-exit` 返回 `exit=134` 且无输出。源 Electron runtime 在同一环境下也 SIGABRT，因此判定为当前 sandbox 不支持可靠启动 GUI/Electron runtime；真实桌面窗口仍建议用户本机肉眼打开确认。

## 10. 工作台 chrome / inspector / 节点卡片二次打磨（2026-06-22）

用户继续通过 7 张截图反馈：结构预览打开后顶部与左右侧栏不应一起模糊；左侧栏折叠后与 macOS traffic lights 冲突且缺少 Notion 式 hover 层；右侧 node 面板仍有重复 NODE 头、信息不足；右侧栏按钮应固定在窗口右上角；画布工具条占用空间大且没有按画布居中；节点卡片底部的 `0`、单位与 INT/TS 位置不符合扫描习惯；若干展开菜单失焦后不自动收起。

本轮修复：

- `web/src/app/App.tsx`：
  - 右侧栏按钮移出 `.workspace-topbar`，改为 app shell 级 fixed control，避免随右侧栏开合横向移动。
  - 左侧栏折叠后保留安全的顶栏 padding，并新增 `project-rail-hover` / `project-rail-hover-panel`，hover 或 focus 时临时预览完整 ProjectRail，避开左上 traffic lights 区域。
  - Export 浮层增加 outside click / Escape 关闭。
  - 向结构预览 dialog 传入左右侧栏状态，用于限定 backdrop blur 的范围。
- `web/src/app/ProjectRail.tsx`：workspace/project 菜单、删除确认、创建项目表单增加 outside click / Escape 关闭。
- `web/src/app/CanvasWorkspace.tsx`：
  - 节点更多菜单增加 outside click / Escape 关闭。
  - 节点卡片底部改为单行 `ΔG/ΔE + 数值`、`×1`、`INT/TS/R/P`；移除零点角标 `0`，卡片上不再显示能量单位。
- `web/src/app/WorkbenchToolbar.tsx`：把能量来源与单位压缩为一个 `Δ · Gsol/Egas · kcal/Eh/kJ` chip，减少工具条前半段占用。
- `web/src/app/InspectorPanels.tsx`：
  - 删除重复的 inspector 顶部 NODE 条，把 `Identity` 改为 `Node`。
  - 参考 gaussian-copilot overview 面板补充 method、basis、charge/spin、energy、free energy、job CPU time、termination、optimization curve；从 source preview 中提取 Gaussian/ORCA 常见字段并提供 fallback。
  - Structure preview backdrop 只对画布工作区生效；左右侧栏和顶部 chrome 保持清晰；点击 backdrop 或 Escape 可关闭。
- `web/src/app/workbench.css`：完成 fixed 右侧栏按钮、左侧 hover rail、画布居中工具条、node card meta row、inspector overview card、结构预览局部 blur、窄屏工具条裁切安全的最终样式。
- `web/src/app/App.test.tsx`：适配工具条单位短标签、移除 inspector rail header、节点卡片不再显示零点 `0` 与单位。

验证：

- `cd web && npm run test -- --run`：通过，31 个测试文件 / 238 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `python3 -m unittest discover`：通过，22 个 Python 测试。
- Browser QA（Browser skill 已阅读，但当前会话没有可调用的 in-app Browser Node REPL 工具；使用项目本地 Playwright fallback）：通过。
  - 页面身份：`http://127.0.0.1:5173/` / `RxnFlow Workbench`；页面非空，无 framework overlay，无 console error/warn。
  - 结构预览：`.structure-preview-scrim::before` 为 `top=48px, left=248px, right=320px`，blur 只覆盖画布工作区；dialog 中 2D pane 在左、3D pane 在右。
  - 左侧栏：折叠后顶栏展开按钮 x > 92，避开 traffic-light 区；hover trigger 可展开完整 ProjectRail 浮层。
  - 右侧栏：fixed toggle 在右侧栏开合前后 bbox 均为 `x=1748, y=10, 34×30`（1800px viewport），不再随侧栏移动。
  - 工具条：桌面与侧栏开合后 toolbar center 与 canvas-stage center 偏差均为 0；窄屏下前段 controls 可见且不压到侧栏。
  - 节点卡片：meta row 为 `ΔG 20.96 ×1 TS`；无 `.node-zero-indicator`；卡片能量不含 `kcal/mol / kJ/mol / Eh`；kind badge 位于 coefficient 右侧。
  - 失焦关闭：workspace menu、node action menu、export float panel 均能通过点击画布关闭。
  - 截图证据：`/tmp/rxnflow-ui-polish-desktop.png`、`/tmp/rxnflow-ui-polish-structure.png`、`/tmp/rxnflow-ui-polish-collapsed-hover.png`、`/tmp/rxnflow-ui-polish-narrow.png`。

## 11. 本轮重新打包记录（2026-06-23）

用户追问是否已重新打包。本轮补做 macOS 本地 `.app` 打包并验证：

- `cd web && npm run desktop:pack`：通过，重新生成 `web/release/mac-arm64/RxnFlow.app`。
- `electron-builder` 因 `--config.mac.identity=null` 跳过正式签名；随后执行 ad-hoc 签名：
  - `codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app`
  - `codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过。
- `cd web && node electron/release-smoke.cjs`：通过。
- `cd web && npm run desktop:runtime:smoke`：首次发现 runtime smoke 仍查找已删除的 `.inspector-rail-header`；已更新 `web/electron/main.cjs` 与 `web/electron/release-smoke.cjs`，改为验证新的 `.node-inspector-stack`。
- 重新 `desktop:pack` + ad-hoc 签名 + release smoke + packaged runtime smoke：全部通过。
- 最终产物：`web/release/mac-arm64/RxnFlow.app`。

## 12. 工作台 11 点 UI/交互打磨（2026-06-23）

用户继续通过 7 张截图反馈窗口拖拽、node 面板、左右侧栏高度、工具条、节点卡片、路径标签、文件栏、视图切换动画、画布标签页等 11 类问题。

本轮修复：

- `web/src/app/workbench.css`：为 topbar/tab bar 增加 macOS `-webkit-app-region: drag`，并为按钮/输入/侧栏/浮层设置 `no-drag`；压缩工具条间距与能量 chip，主题按钮改为纯图标；侧栏 padding 与留白重新收敛；表格/画布切换改为横向滑动过渡；移除路径/能垒标签阴影；节点卡片 meta row 改为分离的 `ΔG = value`、`×1`、`INT/TS` chips。
- `web/src/app/InspectorPanels.tsx`：把 Overview 合并进 Node summary；termination 只显示 `normal/error/unknown`；Formula 支持下标和分子量；Coordinates 简化为原子数；增加 Elapsed time；Optimization curve 移到 Structure 块下方。
- `web/src/app/WorkbenchToolbar.tsx`：能量来源选项改为 `ΔEgas / ΔGsol`，取消单独的 Δ 标记，缩短下拉胶囊。
- `web/src/app/CanvasWorkspace.tsx` / `web/src/app/canvasDrawing.ts`：普通路径标签默认隐藏 `path`，选中路径后可直接在画布上编辑；过渡态能垒标签始终由当前能量来源计算，Gsol 显示 `ΔG‡`，Egas 显示 `ΔE‡`，不再使用自定义阴影标签。
- `web/src/app/ProjectRail.tsx`：文件行去掉 gas/sol 与显式 Gaussian 文案，把 Gaussian 融入左侧图标；直接删除按钮改为三点菜单，删除项文案为 `Delete file and nodes`；Project 行不再可视显示 `open` 标记；active project 下方在多画布时显示画布列表。
- `web/src/app/App.tsx` / `web/src/app/projectCanvasState.ts` / `web/src/app/projectWorkspace.ts`：文件点击优先选中使用该文件的节点并显示 Node 面板；删除文件级联删除画布上引用该文件的节点、边和能垒；新画布按项目名命名，第二个起为 `项目名 1`；画布 tab 支持双击重命名与关闭；左侧 Project 区展示多画布。

验证：

- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `python3 -m unittest discover`：通过，22 个 Python 测试。
- 局部前端单测：`cd web && npm run test -- src/app/canvasGeometry.test.ts src/app/canvasDrawing.test.ts src/app/projectCanvasState.test.ts --run`：通过，3 个测试文件 / 15 个测试。
- 全量 `cd web && npm run test -- --run`：当前仍有 `App.test.tsx` 中 13 条旧 UI 断言未更新，主要断言旧项目 aria label、旧 barrier 自定义编辑、旧文件删除按钮；实际产品行为已按 2026-06-23 用户新需求改为隐藏 open 文案、能垒数据驱动、三点菜单删除。后续需要单独清理这些 App 级 UI 测试用例。
- Browser QA：Browser skill 已阅读，但当前会话没有暴露其要求的 in-app Browser Node REPL 工具；使用 bundled Node + Playwright fallback。验证 `http://127.0.0.1:5173/`：页面非空、无 framework overlay、无 console error；toolbar `ΔEgas/ΔGsol`、纯图标 dark toggle、Node summary formula 下标/termination、表格/画布切换 track、创建/关闭画布、Project canvas list、文件三点菜单、折叠左栏 hover trigger 均通过。
- 截图证据：`/tmp/rxnflow-ui-qa-desktop.png`、`/tmp/rxnflow-ui-qa-narrow.png`。

## 13. 本轮重新打包记录（2026-06-23 深夜）

在 11 点 UI/交互打磨后重新打包 macOS app：

- `cd web && npm run desktop:pack`：通过，重新生成 `web/release/mac-arm64/RxnFlow.app`；仍有既有 3Dmol direct eval 与大 chunk warning，electron-builder 仍提示 duplicate dependency references，但不阻塞产物生成。
- `cd web && codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app`：通过，完成 ad-hoc 签名。
- `cd web && codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过。
- `cd web && node electron/release-smoke.cjs`：通过。
- `cd web && npm run desktop:runtime:smoke`：通过，输出 `RxnFlow packaged runtime smoke passed`。
- 最终产物：`/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。

## 14. Node 面板 summary 行高与 formula 裁切修复（2026-06-24）

用户反馈 Node 面板顶部信息区过于紧凑，长 formula 行右侧字符被裁切。

本轮修复：

- `web/src/app/workbench.css`：取消 Node summary value 的 `overflow:hidden + white-space:nowrap` 强制单行裁切，改为 `overflow: visible`、`white-space: normal`、`overflow-wrap: anywhere`。
- `web/src/app/workbench.css`：formula 组件改为可换行 flex，保留下标显示，同时让分子量 `(219)` 不再被隐藏或省略。
- `web/src/app/workbench.css`：Node summary 增加 padding、行距、最小行高和 label/value 列宽，避免 `Basis functions` 这类两行 label 与右侧值挤在一起。

验证：

- Playwright 浏览器检查：在 `http://127.0.0.1:5173/` 中模拟 `C123H83Cl3IrN6O3 (219)` 长分子式，确认 Formula 行为 `overflow: visible`、`white-space: normal`、`flex-wrap: wrap`，截图 `/tmp/rxnflow-node-panel-formula-check.png`。
- `cd web && npm run test -- src/app/App.test.tsx --run`：通过，42 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `cd web && npm run desktop:release:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && npm run desktop:runtime:smoke`：通过。
- 解包 `app.asar` 后检查生产 CSS，确认包含 Node summary 防裁切规则。

## 15. 节点卡片 meta row 溢出与顶部按钮宽度修复（2026-06-24）

用户反馈节点卡片底部 `ΔG` 行右侧 `INT` 标记溢出，顶部 `×1` chip 与折叠/更多按钮不对齐且过宽。

本轮修复：

- `web/src/app/workbench.css`：节点卡片底部 meta row 改为两列布局：左侧 `ΔG/ΔE` 能量块可收缩，右侧 `INT/TS/R/P` 固定宽度，隐藏状态灯占位列，避免 badge 被挤出卡片。
- `web/src/app/workbench.css`：能量块设置 `overflow:hidden` + 数值 ellipsis，长值只截断在左侧块内，不再侵占右侧标签。
- `web/src/app/workbench.css`：顶部 `×1`、折叠、更多三个按钮统一为 `32×30px`，`×1` 不再比右侧两个按钮更长，三者顶部对齐。

验证：

- Playwright 浏览器检查 `http://127.0.0.1:5173/`：6 个节点的 `R/TS/P` badge 均在 node 和 meta row 内；能量块在 badge 左侧；顶部 `×1`、折叠、更多按钮等宽且 y 坐标对齐。截图 `/tmp/rxnflow-node-card-meta-check.png`。
- `cd web && npm run test -- src/app/App.test.tsx --run`：通过，42 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `cd web && npm run desktop:release:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && npm run desktop:runtime:smoke`：通过。
- 解包 `app.asar` 后检查生产 CSS，确认包含节点卡片 meta row 两列布局、`×1` 32px 宽度、kind badge 34px 固定宽度等规则。

## 16. 左侧栏密度、Project 菜单与画布标签页关闭语义修复（2026-06-24）

用户反馈顶部画布标签页仍是方形、和整体圆角风格不统一；点击 tab `×` 会直接删除画布，期望只关闭/隐藏 tab，真正删除画布应放到左侧栏。同时左侧栏 Project 加号、Project/File 三点按钮样式不统一，Project 菜单不应再提供与 Files 区重复的 import。

本轮修复：

- `web/src/app/projectCanvasState.ts`：为画布 tab 增加 `closed` UI 状态；`closeCanvasTabState` 改为只标记关闭并保留 snapshot；新增 `deleteCanvasTabState` 作为唯一删除状态转移；从侧栏选择已关闭画布时自动重开 tab。
- `web/src/app/App.tsx`：顶部 tab bar 只渲染未关闭的 tab；Project rail 仍列出全部画布；新增侧栏删除画布 handler；从 Project 三点菜单创建新画布时按项目名命名并切到新画布。
- `web/src/app/ProjectRail.tsx`：Project 行菜单中的 `Import files into project` 替换为 `New canvas`；active project 的画布列表增加三点菜单，提供 `Delete canvas`；Project、File、Canvas 三点按钮统一为 hover 显示的紧凑操作按钮。
- `web/src/app/workbench.css`：重做左侧栏信息密度，Project/File/Canvas 行高收敛到 34–36px；workspace/project/file/canvas 菜单统一为紧凑浮层；顶部画布 tab 改为圆角胶囊，close 按钮只负责隐藏 tab。
- `web/src/app/App.test.tsx` / `web/src/app/projectCanvasState.test.ts`：补充关闭不删除、侧栏重开、侧栏删除画布、Project 菜单不再显示 import 的测试。

验证：

- `cd web && npm run test -- src/app/projectCanvasState.test.ts src/app/App.test.tsx --run`：通过，2 个测试文件 / 48 个测试。
- `cd web && npm run test -- --run`：通过，31 个测试文件 / 243 个测试。
- Playwright QA（Browser skill 已阅读；当前会话未暴露其要求的 Node REPL 浏览器控制工具，因此使用项目内 Playwright fallback）：验证 `http://127.0.0.1:5173/` 非空、无 framework overlay、无 console error；Project header menu 高度 75px；Project row 34px、File row 36px；Project 菜单只有 `New canvas` / `Remove from sidebar`；创建新画布后 tab 为圆角胶囊；点击 tab `×` 后 tab 消失但侧栏画布仍在；点击侧栏画布可重开；侧栏画布三点菜单 `Delete canvas` 删除画布。
- 截图证据：`/tmp/rxnflow-project-menu-new-canvas.png`、`/tmp/rxnflow-new-canvas-tab.png`、`/tmp/rxnflow-closed-tab-still-in-sidebar.png`、`/tmp/rxnflow-sidebar-delete-canvas-menu.png`。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `cd web && npm run desktop:release:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app && codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过，完成 ad-hoc 签名与验证。
- `cd web && npm run desktop:runtime:smoke`：通过，输出 `RxnFlow packaged runtime smoke passed`。
- 解包 `release/mac-arm64/RxnFlow.app/Contents/Resources/app.asar` 后检查生产资源，确认包含 `project-canvas-action-menu`、`New canvas`、`Delete canvas` 等新实现 token。

补充验证：窄屏 `900×700` Playwright 检查发现左侧栏按钮会压到第一个画布 tab 文案；已在 `web/src/app/workbench.css` 增加 `@media (max-width: 980px)` 下的 `.workspace-topbar-left { padding-left: 44px }`，复测后 tab 起点从 x=94 调整到 x=138，截图 `/tmp/rxnflow-narrow-tabs-sidebar.png`，无 console error。
最终重新执行 `npm run test -- --run`、`npm run build`、`npm run desktop:release:smoke`、`npm run desktop:pack`、ad-hoc codesign/verify、`npm run desktop:runtime:smoke` 均通过；最终生产资源为 `index-LMHctpNF.css` / `index-veP-Flrk.js`。

## 17. 右侧栏按钮折叠后真实点击无响应修复（2026-06-24）

用户反馈右上角右侧栏按钮点击折叠后，再次点击无法展开、没有反应。

本轮定位：

- Vite/Playwright 合成点击与 Electron 开发壳点击都能触发 React `onClick`，但折叠后按钮中心的 `elementFromPoint` 命中的是嵌套 `svg`，不是 `button` 本体。
- 该区域属于 hidden titlebar / `-webkit-app-region: no-drag` 窗口 chrome，真实 macOS/Electron 点击命中 SVG 子元素时比 Playwright 合成点击更脆弱，可能表现为按钮看得见但点击无响应。

修复：

- `web/src/app/workbench.css`：为 `.workspace-topbar-actions button > svg/span`、左侧栏 titlebar 按钮图标增加 `pointer-events: none` 与 `-webkit-app-region: no-drag`，确保真实鼠标点击始终落在按钮本体上，而不是 SVG 子元素。

验证：

- Playwright Web QA：折叠右侧栏后，按钮中心 `elementFromPoint` 从 `svg` 变为 `BUTTON.window-icon-button.right-sidebar-fixed-toggle`；再次点击后 `Inspector` 恢复显示，无 console error。截图 `/tmp/rxnflow-right-sidebar-repro.png`。
- Playwright Electron QA：构建后启动 `web/electron/main.cjs`，折叠后按钮中心命中 `BUTTON`，点击后 `Inspector` 从 0 恢复为 1。截图 `/tmp/rxnflow-electron-right-sidebar-repro.png`。
- `cd web && npm run test -- src/app/App.test.tsx --run`：通过，42 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。

补充最终验证：

- `cd web && npm run test -- --run`：通过，31 个测试文件 / 243 个测试。
- `cd web && npm run desktop:release:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app && codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过。
- `cd web && npm run desktop:runtime:smoke`：通过。
- 最新 packaged app Playwright QA：折叠右侧栏后按钮中心命中 `BUTTON`，再次点击后 `Inspector` 恢复显示；`app.asar` 中生产 CSS `index-DfduCh9G.css` 包含 `workspace-topbar-actions button>svg`、`pointer-events:none!important`、`-webkit-app-region:no-drag`。

## 18. 顶部画布标签栏加号新建画布空白工作区修复（2026-06-24）

用户反馈点击顶部画布标签页的 `+` 后直接白屏。

本轮定位：

- 顶部 tab bar 的 `New canvas` 按钮直接写成 `onClick={onCreateTab}`。
- React 会把 click event 作为第一个参数传入；而 `App.createCanvasTab(projectId?)` 在上一轮为了支持左侧栏 Project 菜单新建画布，新增了可选 `projectId` 参数。
- 结果顶部 `+` 点击时把 `MouseEvent` 误当成 projectId，进入“给非当前项目创建画布”的分支，切到一个没有真实项目 summary 的 `Untitled Study` 空工作区；用户看到就像白屏/空白。

修复：

- `web/src/app/App.tsx`：`CanvasTabBar` 的 `+` 按钮改为 `onClick={() => onCreateTab()}`，不再把 click event 透传。
- `web/src/app/App.tsx`：`createCanvasTab(projectId?)` 增加防御，只接受非空 string 作为 projectId；其他类型一律回退当前 active project，避免类似事件误传再次污染状态。
- `web/src/app/App.test.tsx`：新增回归测试，点击顶部 tab `+` 后应创建 `Diels-Alder Study 1`，不出现 `Untitled Study` tab，当前项目仍为 `Diels-Alder Study`，左侧文件列表仍保留。

验证：

- Playwright Web QA：点击顶部 tab `+` 后 tabs 为 `Diels-Alder Study` / `Diels-Alder Study 1`，文件列表仍有 `gaussian.log / orca.out / maple-path.out`，无 `Untitled Study`，无 framework overlay / console error。截图 `/tmp/rxnflow-tab-plus-after.png`。
- Playwright Electron QA：构建后启动 `web/electron/main.cjs`，点击顶部 tab `+` 后 tabs 为 `Diels-Alder Study` / `Diels-Alder Study 1`，文件列表仍存在，无 overlay。截图 `/tmp/rxnflow-electron-tab-plus-after.png`。
- `cd web && npm run test -- src/app/App.test.tsx --run`：通过，43 个测试。
- `cd web && npm run test -- --run`：通过，31 个测试文件 / 244 个测试。
- `cd web && npm run desktop:release:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app && codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过。
- `cd web && npm run desktop:runtime:smoke`：通过。
- 最新 packaged app QA：在用户本地持久化项目 `Ir` 上点击顶部 tab `+` 后创建 `Ir 1`，没有 `Untitled Study`，无白屏/overlay。截图 `/tmp/rxnflow-packaged-tab-plus-after.png`。
- 解包 `release/mac-arm64/RxnFlow.app/Contents/Resources/app.asar`，确认生产 JS `index-Cmnh3e2S.js` 包含 `projectId` 类型防御相关 token。

## 19. 右上角 chrome 三按钮折叠态点击无响应修复（2026-06-24）

用户反馈右侧栏折叠后，右上角三个 chrome 按钮（深色模式、导出、展开右侧栏）都看得见但点击无响应。

本轮定位：

- 这三个按钮位于 Electron/macOS hidden titlebar 的可拖拽窗口 chrome 区域。
- 之前主要依赖父级 `.workspace-topbar-actions` 设置 `-webkit-app-region: no-drag`，而按钮本体、嵌套图标和折叠态层级没有全部显式声明；在真实打包 app 中容易被标题栏拖拽区域或上层布局吞掉点击。
- 需要把按钮自身、内部图标和容器层级同时固定为可点击 hitbox。

修复：

- `web/src/app/workbench.css`：为 `.desktop-window-actions`、`.workspace-topbar-actions`、三个右上角按钮及其子元素显式设置 `pointer-events: auto` / `-webkit-app-region: no-drag`。
- `web/src/app/workbench.css`：把 `.workspace-topbar-actions` 提升到稳定 chrome 层级（`z-index: 1000`、`isolation: isolate`），按钮自身保持 `position: relative` 与独立 z-index，避免折叠态被画布或侧栏遮罩层抢点击。

验证：

- Playwright Web QA：在 `http://127.0.0.1:5173/` 折叠右侧栏后，三个按钮中心 `elementFromPoint` 均命中 `BUTTON`，且 computed style 为 `pointer-events:auto`、`-webkit-app-region:no-drag`；点击深色模式切到 dark，点击导出打开 `Export panel`，点击右侧栏按钮恢复 `Inspector`。截图 `/tmp/rxnflow-chrome-buttons-matrix.png`。
- Playwright Electron 开发壳 QA：构建后启动 `web/electron/main.cjs`，折叠右侧栏后按真实坐标依次点击三个按钮，深色模式切换、导出浮层打开、右侧栏恢复均通过。截图 `/tmp/rxnflow-electron-chrome-coordinate.png`。
- `cd web && npm run test -- --run`：通过，31 个测试文件 / 244 个测试。
- `cd web && npm run desktop:release:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app && codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过。
- `cd web && npm run desktop:runtime:smoke`：通过。
- 最新 packaged app 坐标 QA：启动 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/MacOS/RxnFlow`，折叠右侧栏后按按钮中心真实坐标依次点击，`themeToggled=true`、`exportFloat=1`、`inspector=1`，无 console error；截图 `/tmp/rxnflow-packaged-chrome-coordinate.png`。
- 解包 `release/mac-arm64/RxnFlow.app/Contents/Resources/app.asar`，确认生产 CSS `index-D9647mFp.css` 包含 `pointer-events:auto!important`、`-webkit-app-region:no-drag!important`、`isolation:isolate`、`z-index:1000!important`。

## 20. 右上角 chrome 三按钮折叠态真实 macOS 点击修复补丁（2026-06-24）

用户复测反馈：第一次点击右侧栏按钮可以收起右侧栏；收起后右上角三个按钮（深色模式、导出、展开右侧栏）仍然看得见，但真实鼠标点击都没有反应。

本轮重新定位：

- 前一轮只保证了按钮自身和 SVG 子元素是 `no-drag`，Playwright 合成点击也能通过。
- 但折叠右侧栏后，`.workbench-shell` 扩展到窗口最右侧，内部 `.workspace-topbar` 和 `.canvas-tab-bar` 的 `-webkit-app-region: drag` 也随之延伸到了右上角三个固定按钮下面。
- `document.elementsFromPoint()` 在三个按钮中心下方都能看到 `NAV.canvas-tab-bar(appRegion=drag)` 和 `DIV.workspace-topbar(appRegion=drag)`。这解释了“DOM 点到按钮，但 macOS/Electron 真实鼠标事件被底下拖拽区域吃掉”的现象。

修复：

- `web/src/app/workbench.css`：新增 `.workspace.is-right-collapsed .workspace-topbar { margin-right: 152px !important; }`，让折叠态 topbar/tabbar 的可拖拽区域在布局上直接避开右上角 chrome 按钮组，而不是只依赖按钮自身 `no-drag` 覆盖。
- 保留前一轮的按钮 hitbox 修复；本轮补齐底层 drag 区域避让，避免真实 macOS 点击被底层拖拽区吞掉。

验证：

- Web QA：`http://127.0.0.1:5173/` 折叠右侧栏后，三个按钮中心的 `elementsFromPoint()` 栈中不再出现任何 `appRegion=drag` 元素；深色模式切换、导出面板打开、右侧栏重新展开均通过；截图 `/tmp/rxnflow-chrome-buttons-underlay-qa.png`。
- Electron 开发壳 QA：构建后启动 `web/electron/main.cjs`，折叠态三个按钮中心下方均无 drag 元素；三次点击行为均通过；截图 `/tmp/rxnflow-electron-underlay-qa.png`。
- `cd web && npm run test -- --run`：通过，31 个测试文件 / 244 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `cd web && npm run desktop:release:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app && codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过。
- `cd web && npm run desktop:runtime:smoke`：通过。
- 最新 packaged app QA：启动 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/MacOS/RxnFlow`，折叠右侧栏后 topbar 右边界为 `1288`、按钮组左边界为 `1310`，三个按钮中心下方均无 `appRegion=drag`；`themeToggled=true`、`exportFloat=1`、`inspector=1`，无 console error；截图 `/tmp/rxnflow-packaged-underlay-qa.png`。
- 解包 `release/mac-arm64/RxnFlow.app/Contents/Resources/app.asar`，确认生产 CSS `index-UPDgNDEt.css` 包含 `workspace.is-right-collapsed .workspace-topbar`、`margin-right:152px!important`、`pointer-events:auto!important`、`-webkit-app-region:no-drag!important`。

## 21. 右上角 chrome 改为 Codex 式“按钮洞”与透明 hover 样式（2026-06-24）

用户复测反馈：上一轮通过 `margin-right` 让出右上角整块区域后，点击恢复正常，但视觉上出现明显分界；同时按钮默认有边框和底色，不像 Codex 的标题栏按钮；Codex 的按钮之间空隙也可拖动窗口。

本轮调整：

- `web/src/app/App.tsx`：在右上角三个按钮之间插入 `window-action-drag-gap`，用于承载按钮间的真实拖拽 hitbox。
- `web/src/app/workbench.css`：取消折叠态 `.workspace-topbar` 的视觉裁切，让 topbar 继续绘制到窗口右边，消除右侧明显分界。
- `web/src/app/workbench.css`：把 `workspace-topbar` 本体改为 `no-drag`，把左侧 tab 区和右侧 action cluster/gap 改为 `drag`，按钮本体保持 `no-drag`，形成“拖拽区域里挖按钮洞”的模型，而不是整块挖掉。
- `web/src/app/workbench.css`：右上角深色模式、导出、侧栏按钮默认改为透明无边框、无阴影；只有 hover/focus 时显示轻量背景高亮，接近 Codex 标题栏按钮风格。

验证：

- Web QA：`http://127.0.0.1:5173/` 折叠右侧栏后，topbar 仍铺满窗口右边（`right=1440`），不再出现整块分界；按钮默认 `background=transparent`、`border=transparent`、`box-shadow=none`；按钮间两个 `window-action-drag-gap` 均为 `appRegion=drag`；按钮点击仍能切换主题、打开导出面板、展开右侧栏。截图 `/tmp/rxnflow-codex-chrome-visual.png`、`/tmp/rxnflow-codex-chrome-web-qa.png`。
- Electron 开发壳 QA：使用 Vite dev server 启动 Electron，折叠态按钮为 `button no-drag`，按钮组背景和两个 gap 为 `drag`，topbar 视觉连续，三按钮点击行为通过；截图 `/tmp/rxnflow-electron-codex-chrome-qa.png`。
- `cd web && npm run test -- --run`：通过，31 个测试文件 / 244 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `cd web && npm run desktop:release:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app && codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过。
- `cd web && npm run desktop:runtime:smoke`：通过。
- 最新 packaged app QA：启动 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/MacOS/RxnFlow`，折叠右侧栏后 topbar 仍铺满窗口右侧，右上角按钮默认透明无框，按钮中心为 `no-drag`，按钮组/gap 为 `drag`；主题、导出、展开右侧栏三次点击均通过；截图 `/tmp/rxnflow-packaged-codex-chrome-visual.png`、`/tmp/rxnflow-packaged-codex-chrome-after-clicks.png`。
- 解包 `release/mac-arm64/RxnFlow.app/Contents/Resources/app.asar`，确认生产资源包含 `window-action-drag-gap`、`workspace-topbar-actions`、`-webkit-app-region:drag!important`、`margin-right:0!important` 等 token。

## 22. 左侧栏与画布标签 UIUxpro 统一重设计（2026-06-24）

用户反馈：左侧栏按钮应与右侧 chrome 按钮一致；Project/File 高亮状态与高度不统一；Gaussian 图标徽标看不清；顶部画布 tab 与加号按钮风格割裂，打开的标签应更像连接到画布。

本轮按 UIUxpro 的状态层、4/8px 节奏、图标一致性与可见交互反馈原则调整：

- `web/src/app/workbench.css`：左侧栏固定按钮与折叠 hover trigger 改为右侧 chrome 同款透明默认态，hover/focus 才显示轻量背景。
- `web/src/app/workbench.css`：Project/File 行统一为 42px 高、14px 圆角、同一 active 背景/边框/内阴影；hover 与 active 状态使用同一状态层体系。
- `web/src/app/workbench.css`：Project 下的 canvas 子行统一为 32px 高、12px 圆角，并用左侧细分组线表达层级。
- `web/src/app/workbench.css`：Gaussian 小徽标改为清晰的绿色 `G` badge，尺寸 16px，白/深色模式均有明确边界，不再被图标容器裁切。
- `web/src/app/workbench.css`：顶部 active canvas tab 改成 38px 高、上圆角下连接的 attached tab；底部用伪元素覆盖边界，视觉上贴住 topbar 下沿。加号按钮改成透明 ghost button，hover 才出现状态层。
- `web/src/app/workbench.css`：补齐深色模式下左侧按钮、列表 active、Gaussian 徽标、canvas tab 的对等状态层与对比度。

验证：

- UIUxpro design-system 查询：`python3 /Users/linsay/.agents/skills/ui-ux-pro-max/scripts/search.py "desktop scientific graph editor minimal glass sidebar tabs" --design-system -p "RxnFlow Workbench"`，本轮采用其一致状态层、SVG 图标、间距节奏、light/dark contrast 检查原则。
- Web QA：`http://127.0.0.1:5173/` 下创建第二个 canvas，检查左侧按钮默认 `background=transparent` / `box-shadow=none`；active project 与 active file 均为 42px 高且背景一致；Gaussian badge `content="G"`、`display=grid`、16px 可见；active tab 为 16px 上圆角 attached tab；add tab 为透明 ghost button；light/dark 截图分别为 `/tmp/rxnflow-sidebar-tabs-uiqa-light.png`、`/tmp/rxnflow-sidebar-tabs-uiqa-dark.png`。
- `cd web && npm run test -- --run`：通过，31 个测试文件 / 244 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `cd web && npm run desktop:release:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app && codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过。
- `cd web && npm run desktop:runtime:smoke`：通过。
- 最新 packaged app QA：启动 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/MacOS/RxnFlow`，重复检查左侧按钮、active project/file 高度与背景、Gaussian badge、active tab、add tab 均通过；截图 `/tmp/rxnflow-packaged-sidebar-tabs-uiqa-light.png`、`/tmp/rxnflow-packaged-sidebar-tabs-uiqa-dark.png`。
- 解包 `release/mac-arm64/RxnFlow.app/Contents/Resources/app.asar`，确认生产资源包含 `project-file-kind-icon.kind-gaussian:after`、`canvas-tab-shell.is-active:after`、`left-sidebar-fixed-toggle`、`project-canvas-row-shell.is-active` 等新样式 token。

## 23. 左侧栏 active 高亮改为无框色块（2026-06-24）

用户反馈更喜欢参考图里 `Ir` 那种 active 高亮：只有柔和填充色块，不要 File 选中态那种明显描边框线。

修复：

- `web/src/app/workbench.css`：Project/File active 行统一改为透明边框 + 无内阴影，仅保留浅薄荷填充；File 选中态不再出现描边。
- `web/src/app/workbench.css`：Project/File hover、canvas 子行 hover/active 同步改为无可见描边的状态层，避免 hover 或子画布行仍出现框线。
- `web/src/app/workbench.css`：深色模式同步为透明边框 + 无阴影，保持 light/dark 状态一致。
- Gaussian `G` badge 保持可见，active 背景下 badge 外圈继续与浅薄荷底色匹配。

验证：

- Web QA：`http://127.0.0.1:5173/` 下检查 active project/file computed border 四边均为 `rgba(0, 0, 0, 0)`、`box-shadow=none`，light/dark 均通过；Gaussian `G` badge 仍 `display=grid`。截图 `/tmp/rxnflow-no-outline-sidebar-light.png`、`/tmp/rxnflow-no-outline-sidebar-dark.png`。
- `cd web && npm run test -- --run`：通过，31 个测试文件 / 244 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `cd web && npm run desktop:release:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app && codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过。
- `cd web && npm run desktop:runtime:smoke`：通过。
- 最新 packaged app QA：启动 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/MacOS/RxnFlow`，active project/file 在 light/dark 下均无可见 border / shadow，Gaussian badge 可见，无 console error；截图 `/tmp/rxnflow-packaged-no-outline-sidebar-light.png`、`/tmp/rxnflow-packaged-no-outline-sidebar-dark.png`。

## 24. Notion 风格标签栏高度与左侧栏按钮避让（2026-06-24）

用户反馈：顶部标签栏太窄，底部还有明显分界线；希望借鉴 Notion 的宽标签与无分界 titlebar 思路，但仍保留 RxnFlow 的圆角。左侧栏按钮也应像 Notion 一样放在侧栏/标题栏交界区域，折叠后不要和标签页重叠。

修复：

- `web/src/app/workbench.css`：工作台 topbar 高度提升到 58px，active canvas tab 提升到 50px 高、20px 上圆角，标签最小宽度提升，整体更接近 Notion 的宽标签栏节奏。
- `web/src/app/workbench.css`：移除 `.workspace-topbar` 底部分界线，并隐藏 active tab 的底部伪元素分界线，让 tab 与画布区域自然衔接。
- `web/src/app/workbench.css`：展开态左侧栏按钮移到侧栏右上角内部；折叠态 hover trigger 移到红绿灯后的标题栏区域，同时给 collapsed topbar 增加左侧避让，避免和 tab 重叠。
- `web/src/app/workbench.css`：深色模式同步移除标签栏底线并保持同等高度、圆角与 hover 状态层。

验证：

- Web QA：`http://127.0.0.1:5173/` 下创建第二个 canvas，检查 active tab 高度为 50px，topbar `border-bottom=0px none`，active tab `::after display=none`；展开态按钮位于 project rail 内，折叠态 trigger 在 active tab 左侧且不重叠，点击 trigger 可重新展开。截图 `/tmp/rxnflow-notion-tabs-desktop-expanded.png`、`/tmp/rxnflow-notion-tabs-desktop-collapsed.png`。
- 窄窗口 Web QA：560×760 下重复折叠态不重叠与重新展开检查，通过；截图 `/tmp/rxnflow-notion-tabs-narrow-expanded.png`、`/tmp/rxnflow-notion-tabs-narrow-collapsed.png`。
- `cd web && npm run test -- --run`：通过，31 个测试文件 / 244 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `cd web && npm run desktop:release:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app && codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过。
- `cd web && npm run desktop:runtime:smoke`：通过。
- 最新 packaged app QA：启动 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/MacOS/RxnFlow`，展开态按钮位于 248px 侧栏内，折叠态 trigger `right=146`、active tab `x=361`，无重叠；点击 trigger 可恢复侧栏，无 console error；截图 `/tmp/rxnflow-packaged-notion-tabs-expanded.png`、`/tmp/rxnflow-packaged-notion-tabs-collapsed.png`。

## 25. UIUXpro 紧凑标题栏与标签-画布同色连接（2026-06-24）

用户反馈上一版标题栏过高、标签占地太大；active 标签对比不明显，并且标签打开时背景应与画布颜色一致，让画布像从标签页里引出来。

修复：

- `web/src/app/workbench.css`：按 UIUXpro 的信息密度与状态层原则，把工作台 topbar 从 58px 压缩到 46px，active canvas tab 从 50px 压缩到 40px，add tab 调整为 38px，降低标题栏纵向占用。
- `web/src/app/workbench.css`：新增 `--rxnflow-canvas-surface` / `--rxnflow-titlebar-surface` / hover state token，active tab 与 `.canvas-stage` / `.canvas-view-pane` 使用同一 canvas surface，让画布与选中标签自然连接。
- `web/src/app/workbench.css`：inactive tab 改为极浅状态层，active tab 使用更清晰文字与同画布底色，避免厚重边框，同时提高层级辨识。
- `web/src/app/workbench.css`：同步调整左侧栏按钮、折叠 trigger 和 hover panel 的 top offset，适配新的 46px titlebar；深色模式同步使用同一 token 体系。

验证：

- UIUXpro design-system 查询：`python3 /Users/linsay/.agents/skills/ui-ux-pro-max/scripts/search.py "desktop scientific graph editor compact titlebar tabs minimal workspace" --design-system -p "RxnFlow Workbench"`，本轮采用其减少装饰、状态层、150-300ms hover、contrast 与 spacing 原则。
- Web QA：`http://127.0.0.1:5173/` 下创建第二个 canvas，检查 topbar 高 46px、active tab 高 40px、add button 高 38px、topbar 无底线、active tab `::after display=none`、active tab 背景等于 canvas 背景，折叠态 trigger 不与 tab 重叠且可重新展开。截图 `/tmp/rxnflow-compact-titlebar-desktop-expanded.png`、`/tmp/rxnflow-compact-titlebar-desktop-collapsed.png`。
- 窄窗口 Web QA：560×760 下重复紧凑高度、背景一致、不重叠与重新展开检查，通过；截图 `/tmp/rxnflow-compact-titlebar-narrow-expanded.png`、`/tmp/rxnflow-compact-titlebar-narrow-collapsed.png`。
- `cd web && npm run test -- --run`：通过，31 个测试文件 / 244 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `cd web && npm run desktop:release:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app && codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过。
- `cd web && npm run desktop:runtime:smoke`：通过。
- 最新 packaged app QA：启动 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/MacOS/RxnFlow`，确认 topbar 46px、active tab 40px、active tab 背景 `rgba(247, 252, 253, 0.96)` 等于 canvas 背景，折叠态无重叠并可重新展开，无 console error；截图 `/tmp/rxnflow-packaged-compact-titlebar-expanded.png`、`/tmp/rxnflow-packaged-compact-titlebar-collapsed.png`。

## 26. 清理旧厚标题栏覆盖并重验紧凑版（2026-06-24）

用户要求继续后，本轮做紧凑标题栏收尾：发现 `workbench.css` 中仍保留上一版 58px/50px 的 Notion-inspired 覆盖段，虽然后续 46px/40px UIUXpro 紧凑段会覆盖它，但容易造成后续维护时回归。

修复：

- `web/src/app/workbench.css`：删除旧的 `Notion-inspired titlebar/tab polish` 覆盖段，只保留当前 `UIUXpro compact titlebar correction`。
- 删除旧段后，左侧栏 toggle 回到更靠近 Codex/Notion 的标题栏位置（展开态约 x=104，仍在 248px rail 范围内）；折叠态 trigger 与 active tab 之间仍保留安全间距。

验证：

- Web QA：`http://127.0.0.1:5173/` 下重新检查 topbar 46px、active tab 40px、add button 38px、active tab 背景等于 canvas 背景、折叠态 trigger 不与 tab 重叠并可重新展开；通过。截图沿用 `/tmp/rxnflow-compact-titlebar-desktop-expanded.png`、`/tmp/rxnflow-compact-titlebar-desktop-collapsed.png`、`/tmp/rxnflow-compact-titlebar-narrow-expanded.png`、`/tmp/rxnflow-compact-titlebar-narrow-collapsed.png`。
- `cd web && npm run test -- --run`：通过，31 个测试文件 / 244 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `cd web && npm run desktop:release:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app && codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过。
- `cd web && npm run desktop:runtime:smoke`：通过。
- 最新 packaged app QA：启动 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/MacOS/RxnFlow`，确认 topbar 46px、active tab 40px、active tab 与 canvas 背景一致，折叠态 trigger `right=138`、active tab `x=196`，无重叠且可重新展开，无 console error；截图 `/tmp/rxnflow-packaged-compact-titlebar-expanded.png`、`/tmp/rxnflow-packaged-compact-titlebar-collapsed.png`。

## 27. 恢复画布底纹并统一 tab / toolbar / canvas surface（2026-06-24）

用户反馈：上一轮把画布底纹改没了；active tab、浮动工具栏、画布背景三块颜色没有接上；未选中 tab 还残留一小块奇怪底色（例如 `Ir 1`）。

修复：

- `web/src/app/workbench.css`：恢复 `.canvas-stage` 的画布底色渐变和 `.canvas-stage::before` 点阵纹理，使用 `--rxnflow-canvas-dot` 控制 light/dark 两套点阵可见度。
- `web/src/app/workbench.css`：把 `.canvas-view-pane` / `.workbench-view-pane` / `.workbench-view-track` 改回透明，避免 view pane 背景盖住底纹。
- `web/src/app/workbench.css`：新增 `--rxnflow-canvas-base` / glow / toolbar border token，让 active tab、floating toolbar、canvas 使用同一个基础 surface 色，避免三块背景割裂。
- `web/src/app/workbench.css`：未选中 tab 默认透明，仅 hover/focus 时显示轻量状态层，删除 `Ir 1` 那种未选中标签小色块。
- `web/src/app/workbench.css`：深色模式同步恢复点阵、surface 统一和未选中 tab 透明逻辑。

验证：

- Web QA：`http://127.0.0.1:5173/` 下检查 light/dark：`.canvas-stage::before background-image` 为点阵 `radial-gradient`；`.canvas-stage background-image` 含 glow radial-gradient；`.canvas-view-pane` 与 `.workbench-view-pane` 为透明；active tab / floating toolbar / canvas 的 `backgroundColor` 完全一致；未选中 tab 背景透明；topbar 46px、active tab 40px 未回归。截图 `/tmp/rxnflow-surface-texture-light.png`、`/tmp/rxnflow-surface-texture-dark.png`。
- `cd web && npm run test -- --run`：通过，31 个测试文件 / 244 个测试。
- `cd web && npm run build`：通过；仍有既有 3Dmol direct eval 与大 chunk warning。
- `cd web && npm run desktop:release:smoke`：通过。
- 首次组合执行 `desktop:release:smoke && desktop:pack && codesign...` 时 electron-builder 在 packaging 后半段偶发长时间无输出，本轮中断后分步重跑 `npm run desktop:pack`，通过。
- `cd web && npm run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `cd web && codesign --force --deep --sign - --entitlements build/entitlements.mac.plist release/mac-arm64/RxnFlow.app && codesign --verify --deep --strict --verbose=2 release/mac-arm64/RxnFlow.app`：通过。
- `cd web && npm run desktop:runtime:smoke`：通过。
- 最新 packaged app QA：启动 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app/Contents/MacOS/RxnFlow`，light/dark 下确认点阵底纹存在、view pane 不盖底纹、active tab / toolbar / canvas 基础色一致、未选中 tab 透明，无 console error；截图 `/tmp/rxnflow-packaged-surface-texture-light.png`、`/tmp/rxnflow-packaged-surface-texture-dark.png`。

## 28. 标签栏连接关系 / hover 层级 / 加号分隔修正（2026-06-24）

用户反馈：当前标签栏仍未达到预期——只有打开的标签页应该与画布连在一起；其余区域仍应保留标题栏分界。未打开标签悬浮时的高亮尺寸与 tab 本体不一致，关闭 `×` 与 hover 层不在同一层；加号按钮与标签列表之间也缺少明确分隔。

本轮修复：

- `web/src/app/workbench.css`：为 `.workspace-topbar` 恢复一条轻量底部分界线，但仅由 active tab 通过 `margin-bottom:-1px` 覆盖它，使“只有当前标签连到画布、其它区域仍有分界”成立。
- `web/src/app/workbench.css`：inactive tab 的 hover/focus 状态从内部 `.canvas-tab` 按钮提升到整个 `.canvas-tab-shell`，让 hover 背景、标签尺寸与关闭 `×` 同层一致，不再出现高亮和 `×` 分层错位。
- `web/src/app/workbench.css`：关闭按钮统一为垂直居中、按 `shell hover / focus-within / active` 显示；避免 `×` 漂在另一层或与 hover 区域脱节。
- `web/src/app/workbench.css`：为 `+` 按钮增加左侧 margin 与细分隔线 `::before`，让加号与标签组之间形成明确但轻量的分组关系。
- `web/src/app/workbench.css`：深色模式同步使用同一 divider / hover / active 逻辑，保持 light/dark 一致。

验证：

- Browser QA（Playwright fallback，`http://127.0.0.1:5173/`）：创建第二个 canvas 后，检查标题栏 `::after` 底线存在，active tab y 坐标比 inactive tab 下沉 1px 用于覆盖底线；inactive tab hover 时 `.canvas-tab-shell` 与 `.canvas-tab-close` 同时高亮，close 按钮 `opacity=1` 且位于同一胶囊层内；`+` 按钮 `margin-left=10px` 且 `::before` 为 `1px` divider。截图：`/tmp/rxnflow-tabs-after-fix.png`。
- `cd web && npm run build`：本轮已重新执行，用于确认样式修正未引入构建错误。

## 29. 标签栏回归修复：恢复右上 chrome / 去除顶栏空白 / 工具栏重新浮起（2026-06-24）

用户反馈：上一轮标签栏修正后出现严重回归——右侧栏三个按钮飘到左上角，标签栏上方出现大面积空白；工具栏不再是浮层；工具栏背景与画布背景脱节，画布点阵也被怀疑丢失。

本轮定位与修复：

- 根因 1：`web/src/app/workbench.css` 最终覆盖段里把 `.workspace-topbar-actions` 错误写成了 `position: relative !important`，覆盖掉前面已验证通过的 fixed 右上角布局，导致右上 3 个按钮回流到 `.app-shell` 左上区域，并把 workspace 顶部整体挤出 30px 空白。
- 修复 1：在最终覆盖段重新显式固定 `.workspace-topbar-actions`：`position: fixed; top: 12px; right: 14px; left: auto; z-index: 102;`，恢复 Codex 风格右上角按钮簇，同时消除顶栏上方空白。
- 根因 2：历史样式块把 `.floating-toolbar` 改成了文档流里的整行 toolbar（`position: relative; width: 100%`），覆盖了之前已验过的悬浮形态。
- 修复 2：在最终 surface 覆盖段把 `.floating-toolbar` 拉回画布内浮层：`position: absolute; top: 10px; left: 50%; transform: translateX(-50%); width: max-content; max-width: calc(100% - 72px); border-width: 1px; border-radius: 22px; backdrop-filter: blur(22px);`。
- 画布纹理检查：`.canvas-stage::before` 的 radial dot pattern 仍存在，本轮无需再恢复，只确保顶栏/工具栏修正没有覆盖该纹理与 canvas surface token。

验证：

- Browser QA（Playwright fallback，`http://127.0.0.1:5173/`）：
  - `.workspace` 的 y 坐标从错误回归时的 `30` 恢复为 `0`；`.workspace-topbar` 的 y 坐标恢复为 `0`，确认顶栏上方空白消失。
  - `.workspace-topbar-actions` 恢复为 `position=fixed`，bbox 位于右上角 `x=1918, y=12, w=116, h=30`；三个按钮重新一字排开。
  - `.floating-toolbar` 恢复为 `position=absolute`，bbox 位于画布上方 `y=10`，不再占用独立一行；`toolbarBg` 与 `canvasStageBg` 均为 `rgb(247, 252, 253)`。
  - `.canvas-stage::before` 的 `background-image` 仍为 radial dot gradient，点阵底纹仍存在。
  - 截图：`/tmp/rxnflow-topbar-regression-fixed2.png`。
- `cd web && npm run build`：通过；仍保留既有 3Dmol `eval` 与大 chunk warning。
