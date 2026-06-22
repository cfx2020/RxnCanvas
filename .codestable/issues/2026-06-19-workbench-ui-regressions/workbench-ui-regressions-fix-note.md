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
