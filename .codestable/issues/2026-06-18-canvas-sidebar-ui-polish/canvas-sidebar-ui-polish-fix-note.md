---
doc_type: issue-fix
issue: 2026-06-18-canvas-sidebar-ui-polish
path: standard
fix_date: 2026-06-18
related:
  - .codestable/issues/2026-06-18-canvas-sidebar-ui-polish/canvas-sidebar-ui-polish-analysis.md
tags: [ui, canvas, inspector, desktop, dark-mode]
---

# Canvas/sidebar UI polish 修复记录

## 1. 实际采用方案

按用户最新 UI 反馈把工作台收敛为「左侧项目/文件侧边栏 + 中央画布 + 右侧 Node inspector + 右上角 Export 浮层」：

- 节点卡改为紧凑化学卡片，只保留类型缩写、结构/公式预览、电荷/多重度、相对能量和状态指示灯。
- 绝对能量、解析来源、raw log 打开入口集中到右侧 Node inspector。
- Source / Export 不再作为右侧 inspector tab；Export 改为画布右上角浮动入口和浮层。
- 顶部工具条删除重复的 Import / Project，并合并 zoom / fit / auto layout 等画布控制。
- Minimap 缩小、移到画布右下角，并支持滚轮/触控板移动画布。
- Edge / barrier 标注几何重新按节点端口与曲线中点计算，barrier 改双箭头 + guide path。
- 补齐暗色模式下 inspector 子卡片、detail 文本、source/energy/structure 卡片的颜色覆盖。

## 2. 改动文件清单

- `web/src/app/CanvasWorkspace.tsx`
  - 节点卡显示 `TS` / `INT` / `R` / `P` 缩写、电荷/多重度、`ΔG/ΔE` 相对能量、source + solvation 指示灯。
  - Minimap 增加非 passive 原生 wheel 监听，避免 React passive wheel 警告并阻止事件冒泡到画布。
  - Barrier SVG 改为双箭头 marker。
- `web/src/app/canvasDrawing.ts`
  - Edge label 使用 Bezier 路径中点；连接端口外移；barrier guide/label/arrow 重新计算。
- `web/src/app/canvasGeometry.ts`
  - Minimap 尺寸缩小到轻量卡片。
- `web/src/app/WorkbenchToolbar.tsx`
  - 删除 Import / Project，合并 zoom controls，增加右上角 Export icon trigger。
- `web/src/app/InspectorPanels.tsx`
  - Inspector mode 收敛为 `inspector | export`；Node inspector 内嵌 source metadata 和 Open raw log 动作。
- `web/src/app/App.tsx`
  - ExportDock 改右上浮层；删除右下 zoom toolbar；接入 desktop `openSourceFile`。
- `web/src/app/appRuntimeEffects.ts`
  - 声明 desktop API `openSourceFile`。
- `web/electron/preload.cjs`
  - 暴露 `openSourceFile` 到 renderer。
- `web/electron/main.cjs`
  - 增加 `rxnflow:open-source-file` IPC，优先打开项目内 `storedPath`，再 fallback 到外部 `sourcePath`。
- `web/electron/release-smoke.cjs`
  - 更新 smoke 断言到新 sidebar / floating export 文案。
- `web/src/app/workbench.css`
  - 节点卡、toolbar、Export 浮层、右侧 inspector、minimap、暗色模式样式整体更新。
- 相关测试文件：
  - `web/src/app/App.test.tsx`
  - `web/src/app/InspectorPanels.test.tsx`
  - `web/src/app/canvasDrawing.test.ts`
  - `web/src/app/fileDisplay.test.ts`
  - `web/src/app/importRegistration.test.ts`
  - `web/src/app/projectWorkspace.test.ts`
  - `web/src/app/appSelectionAppliers.test.ts`

## 3. 验证结果

已通过：

- `python3 -m unittest discover`
  - 22 tests passed。
- `cd web && npm run test -- --run`
  - 30 files / 234 tests passed。
  - 已知 jsdom warning：HTMLCanvasElement `getContext()` 未实现；与 3Dmol/jsdom 环境有关。
  - 已知 node warning：`--localstorage-file` 无有效路径。
- `cd web && npm run build`
  - 构建通过。
  - 已知 build warning：3Dmol direct eval；Ketcher vendor chunk 较大。
- `cd web && npm run desktop:smoke`
  - Electron smoke passed。
- `cd web && npm run desktop:runtime:smoke`
  - Packaged runtime smoke passed：`release/mac-arm64/RxnFlow.app/Contents/MacOS/RxnFlow`。
- 浏览器实际 smoke：`http://127.0.0.1:5173/`
  - 顶部 toolbar 无 Import / Project。
  - Export 右上浮动入口可打开浮层。
  - 节点卡使用 compact kind、`ΔG/ΔE`、电荷/多重度、两个状态灯，且不再显示绝对 `Delta G/Delta E` 文本。
  - Source 不再是 inspector tab；Node panel 内可见 source 区块和 Open raw log 按钮。
  - Minimap 位于画布右下角，滚轮会移动画布，且控制台无 wheel passive warning。
  - 暗色模式下右侧 inspector 子卡片颜色和文字对比已修正。
  - 截图产物：
    - `output/playwright/ui-polish-light-after-minimap.png`
    - `output/playwright/ui-polish-dark-fixed.png`
    - `output/playwright/ui-polish-final-smoke.png`

## 4. 遗留事项

- 3Dmol 的 direct eval 和 Ketcher vendor 大 chunk 是第三方依赖/拆包层面的构建 warning，本次未处理。
- `Open raw log` 的 OS 外部打开能力已接入 Electron IPC；浏览器预览只能验证按钮和状态，真正用系统文稿/记事本打开需在桌面端手动点一次确认。
- Edge/barrier 几何已按本轮规则重算并有测试覆盖，但最终视觉舒适度仍建议用户在真实 Ir/Ni 项目里再做一次人工扫描。

## 5. 追加修正：2026-06-18 chrome/sidebar/node-port polish

根据用户截图反馈继续调整：

- 顶栏与工具条文本默认不可选中；`window-bar` 增加 Electron `-webkit-app-region: drag`，按钮区域设置 `no-drag`，避免选中文字导致标题栏拖不动。
- Export 入口从画布内浮动按钮移动到顶栏右侧图标区，保留浮动 export panel。
- 顶栏新增左右侧栏图标开关：project rail 和 node inspector 都可折叠；右侧栏折叠时点击节点只更新选择，不自动弹出侧栏。
- 节点卡：
  - header 去掉分子式，避免长公式挤占名称。
  - q/m 从 header 移到 2D 缩略图左下角，显示为 `charge,multiplicity` 简写。
  - source/solvation 两个状态灯合并为一个状态灯；未匹配溶剂化以 amber 表示。
  - TS/INT 标签、折叠按钮、更多按钮收进紧凑 action group，降低拥挤。
- 连线端口：edge anchor 从卡片外侧偏移改为节点边界中心，connector 圆点嵌在卡边，减少曲线和圆点断开的视觉问题。

追加验证：

```bash
cd web && npm run test -- --run src/app/App.test.tsx src/app/canvasDrawing.test.ts
cd web && npm run test -- --run
python3 -m unittest discover
cd web && npm run build
cd web && npm run desktop:smoke
cd web && npm run desktop:pack
cd web && npm run desktop:runtime:smoke
```

浏览器 smoke：`http://127.0.0.1:5173/`

- Export 在 `.window-actions`，画布内无 `.canvas-stage > .floating-export-trigger`。
- `window-bar` / toolbar / node 为 `user-select: none`，`window-bar` 为 `-webkit-app-region: drag`。
- 右侧栏折叠后点击节点不会弹出 inspector。
- 左侧栏可折叠。
- 节点 header 不再出现长分子式；每个节点只有一个状态灯；q/m badge 显示在结构缩略图左下角。

截图：`output/playwright/chrome-node-polish-final.png`。

已重新打包桌面端：`web/release/mac-arm64/RxnFlow.app`，`app.asar` 时间为 `Jun 18 13:07:45 2026`。
