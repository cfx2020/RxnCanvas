---
doc_type: issue-fix-note
status: implemented
date: 2026-06-27
slug: performance-native-cleanup
issue: Electron startup memory growth, canvas drag lag, titlebar hit-test regressions, and non-lazy heavy editor payloads
scope: web renderer, Electron shell, project persistence, canvas interaction loop, startup restore
---

# performance-native-cleanup 修复记录

## 背景

用户反馈 RxnFlow 刚打开可用，但拖动画布/节点后内存快速涨到 GB 级，按钮 hover/点击、标题栏区域、节点拖动和连线逐渐变卡，并怀疑有“原生已经提供但项目自建了更重实现”的情况。

事前探索记录见：`.codestable/compound/2026-06-27-explore-performance-native-audit.md`。

## 根因

1. 项目 JSON 常驻保存完整振动位移 payload：真实 Ir 项目的 `.rxnflow/project.json` 可达 216.9MB，主要来自 `vibrationModes[].displacements` 在 source parse/candidate parse 中重复持久化。
2. autosave dirty check 对完整 project/files/canvases 做 `JSON.stringify`，拖拽/编辑后会反复扫描大对象并制造大临时字符串。
3. Electron 启动恢复会读取 recent 列表中的多个工作区，并把多个 project content 一次性通过 IPC 发到 renderer，放大启动内存和“多个 RxnFlow 项目同时出现”的感知。
4. Ketcher 虽然由 React lazy 打开，但生产 HTML 仍通过 modulepreload 把重 chunk 在启动阶段预加载。
5. 画布节点 resize 和窗口级连线 pointermove 仍在高频事件里触发 React state 更新；节点拖动和滚轮已部分使用直接 DOM 预览，但 resize/connection 没跟上。
6. 顶栏拖拽区域经过多轮补丁后有多层 drag/no-drag 规则，容易在侧栏展开/折叠后吞掉按钮 hover/click。
7. 全局 tooltip `MutationObserver` 会监听整个 document body 并批量 query 按钮，和 hover/动态 UI 叠加时增加不必要工作。

## 修复内容

- 项目持久化瘦身：
  - `normalizeProjectFilesForPersistence` / `normalizeSourceFileForPersistence` 在保存、导入、恢复时剥离振动 displacement，只保留 mode metadata。
  - Electron `project-store.cjs` 写入 compact JSON，并在目录保存、JSON 保存、manifest/export manifest 中统一避免 pretty 大字符串。
  - Electron startup restore 的 `enrichProjectContentWithStoredSourceCoordinates` 即使无需补解析，也返回 slim content，避免旧 216MB JSON 直接过 IPC。

- 振动按需 hydration：
  - preload/main 增加 `rxnflowDesktop.parseSourcePreview` / `rxnflow:parse-source-preview`。
  - 结构预览点击振动时才从原始 source/storedPath 重新解析完整 displacement，播放仍可用，但完整 displacement 不写回常驻 project state。

- autosave 和 startup：
  - autosave key 改为 lightweight signature，只包含 source metadata、parse summary、canvas graph/annotation metadata，不包含 vibration displacement 和图片 dataURL 内容。
  - autosave 后 source metadata 对比改为字段级比较，移除完整 file stringify。
  - Electron 启动只恢复 active/最近的一个有效工作区；失败时再 fallback 下一个 recent，不再一次性恢复多个 recent project。
  - renderer 即使收到旧 `projectContents[]` payload，也只恢复一个 active payload。

- 交互性能：
  - 节点 resize 改为拖动中直接 DOM preview 节点尺寸和相关 edge/barrier path，松手后一次性提交 React state。
  - connection/barrier window pointermove 使用 `requestAnimationFrame` 合并，避免高频 pointermove 每次 setState。
  - 节点拖动保持实时更新边线，不再等松手才更新。

- 启动 bundle / UI hit-test：
  - Vite modulepreload 过滤 Ketcher vendor 依赖，启动 HTML 不再预加载 Ketcher chunk。
  - Ketcher CSS 改为打开编辑器时动态注入。
  - 删除全局 tooltip MutationObserver，改为关键控件显式 `title`。
  - 收敛 Electron titlebar 为单一契约：整条 fixed titlebar 可拖动，真实按钮/标签/input 是 no-drag island；删除旧 right-titlebar drag bridge / desktop-titlebar-drag-surface 补丁路径。

## 验证

- `npm --prefix web run test -- projectPackages.test.ts sourceParsers.test.ts vibrations.test.ts appRuntimeEffects.test.ts appCanvasEffects.test.ts canvasConnectionMagnetism.test.ts CanvasWorkspace.test.tsx Molecule3DmolViewer.test.tsx App.test.tsx importRegistration.test.ts --run`：通过，9 files / 117 tests。
- `npm --prefix web run build -- --mode production`：通过。仍有 3Dmol eval 与大 lazy chunk warning，属第三方包/惰性加载 chunk 提示。
- `npm --prefix web run desktop:smoke`：通过。
- `npm --prefix web run desktop:release:smoke`：通过。
- `npm --prefix web run desktop:runtime:smoke`：通过；startup restore smoke 现在额外检查不会恢复 older recent workspace。
- `npm --prefix web run desktop:pack`：通过，生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- Browser 验证：`http://127.0.0.1:5173/` 加载无 console error；左/右侧栏、主题、导出按钮反复点击可用；按钮中心 hit-test 为 `no-drag`；节点拖动后 node transform 与 edge path 同步更新；连接拖拽预览可生成并释放清理；dist HTML 只 modulepreload runtime，不含 Ketcher preload。

## 仍需观察

- CSS 视觉层仍然较厚（大量历史 box-shadow/backdrop-filter），本次只移除明显运行时热点和 titlebar 旧补丁；如果用户仍感觉 hover 慢，建议单独做 `workbench-css-surface-flattening` 重构。
- Ketcher chunk 仍然很大，但已改为不启动加载；真正打开 2D 编辑器时仍会一次性加载，这是保留内置 Ketcher 的代价。
- 3Dmol bundle 仍有 eval warning，来自第三方 `3dmol` 构建产物；本次不替换 3Dmol。
