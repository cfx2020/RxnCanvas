---
doc_type: refactor-scan
refactor: 2026-08-12-desktop-package-and-bundle-size
status: user-reviewed
scope: web/package.json、vite.config.ts、Electron release/runtime smoke、3Dmol/Ketcher loader 与 viewer 测试、build-engine.cjs
summary: 发现 4 条优化点：桌面发行资源 2 条、前端 bundle 治理 1 条、3Dmol 依赖边界 1 条；预计前两条可减少约 47.7 MiB 安装体积
---

# desktop-package-and-bundle-size scan

## 总览

- 扫描范围：`web/package.json`、`web/vite.config.ts`、`web/electron/release-smoke.cjs`、`web/electron/runtime-smoke.cjs`、`web/scripts/build-engine.cjs`、`web/src/app/Molecule3DmolViewer.loader.ts`、`web/src/app/Molecule3DmolViewer.tsx`、`web/src/app/KetcherEditorHost.loader.ts`、`web/src/app/heavyEditorLoaders.test.ts`、`web/src/app/Molecule3DmolViewer.test.tsx`
- 发现 4 条优化点：性能 3 / 结构 1 / 可读性 0
- 按风险：低 2 / 中 1 / 高 1
- 建议先做：#1、#2、#3。#1 和 #2 是可量化的安装体积缩减，合计预计约 47.7 MiB；#3 用首屏预算替代没有场景区分的 500 kB 通用告警。
- 建议慎做 / 后做：#4。它可以消除 3Dmol 的 direct `eval`，但需要对第三方依赖做版本锁定的构建期转换，并完整回归 3D 选择、旋转、缩放和振动播放。
- 前置检查 7 条全过：✓。范围共 10 个文件、约 1581 行；关键路径已有 release/runtime smoke、loader 单测和 3D viewer 单测。第三方代码不直接修改，改动放在本地依赖边界和构建流程。
- 体积口径：`v0.1.0-beta.4` 的 macOS DMG/ZIP 下载约 164 MB；本地展开的 `RxnFlow.app` 约 399 MB（约 380 MiB）。其中 Electron Framework 约 283 MB，已经占安装体积约 71%，不更换 Electron 架构就无法消除这部分基线。
- 正常生产构建基线：`web/dist` 约 35 MiB；诊断时开启 sourcemap 会临时扩大到约 92 MiB，但 sourcemap 不属于当前正式构建产物。`npm run build` 通过，并稳定复现 3Dmol direct `eval` 与 chunk 大于 500 kB 两类告警。

## 条目

### #1 只保留中英文 Electron locale ✓

- **位置**：`web/package.json:50-100`、`web/electron/release-smoke.cjs:110-135`
- **分类**：性能
- **现状**：桌面构建没有配置 `electronLanguages`；macOS app 中 Electron Framework 包含 220 个 `.lproj/locale.pak`，合计 46.95 MiB。
- **问题**：RxnFlow 当前产品界面只使用中英文，但发行包携带全部 Chromium 语言资源；保留英文、简体中文和繁体中文资源约需 1.63 MiB，其余约 45.32 MiB 没有产品用途。
- **建议**：在 electron-builder 配置中加入跨 macOS/Windows 命名均可匹配的英文、简体中文、繁体中文 locale 白名单；release smoke 同时断言白名单存在，并在打包产物中验证非白名单 locale 已移除。
- **建议映射的方法**：M-L4-03（按发行目标拆分并延后携带非必要资源）
- **风险**：低（不改应用文案或业务数据；需验证操作系统语言不是中英文时 Electron 能回退到英文）
- **验证**：AI 自证（跑 release smoke；重建 macOS unpacked app，对比 locale 数量和体积；Windows CI 验证 locales 目录）｜ HUMAN（中英文系统环境各启动一次，检查菜单、文件对话框、输入法和窗口行为）
- **范围**：约 25 行 / 2 文件

### #2 把 build 目录改成运行资源白名单 ✓

- **位置**：`web/package.json:55-65`、`web/electron/main.cjs:706-708`、`web/electron/release-smoke.cjs:85-135`
- **分类**：结构
- **现状**：electron-builder 的 `files` 使用 `build/**/*`，将 15 个构建资源全部复制进 `app.asar`；其中运行时只由主进程读取 `icon.png` 和 `icon.ico`，macOS 的 `icon.icns` 与 entitlements 已由 builder 在打包/签名阶段单独处理。
- **问题**：`build/` 共 2.96 MiB，运行时所需两个图标共 0.59 MiB；iconset、SVG 源文件、重复的 ICNS 和签名 entitlement 约 2.36 MiB 被无条件装入 ASAR，混淆了构建期资源与运行期资源边界。
- **建议**：把 `files` 中的 `build/**/*` 改成 `build/icon.png` 与 `build/icon.ico` 的显式白名单；保留 `buildResources`、macOS icon 和 entitlement 配置供 electron-builder 在构建期读取；更新 release smoke 分别验证源资源完整、ASAR 只含运行时资源。
- **建议映射的方法**：M-L3-07（分离构建期资源与运行期资源职责）
- **风险**：低（主进程现有路径保持不变；builder 仍从仓库 `build/` 读取平台图标和签名配置）
- **验证**：AI 自证（跑 release smoke、macOS packaged runtime smoke；列出 ASAR entries 并对比约 2.36 MiB 缩减；Windows CI 跑 installer smoke）｜ HUMAN（macOS Dock/Finder 与 Windows 窗口/任务栏/安装器图标目视确认）
- **范围**：约 30 行 / 3 文件

### #3 用按入口预算替代统一 chunk 告警 ✓

- **位置**：`web/vite.config.ts:15-29`、`web/src/app/KetcherEditorHost.loader.ts:1-7`、`web/src/app/Molecule3DmolViewer.loader.ts:1-7`、`web/src/app/heavyEditorLoaders.test.ts:1-40`
- **分类**：性能
- **现状**：Ketcher 和 3Dmol 已通过动态 import 按需加载；生产入口 JS 约 548 kB，3Dmol 块约 575 kB，Ketcher 功能块及其依赖最大约 16.3 MB，但 Vite 仍用统一 500 kB 阈值对所有入口和按需块发出同一条告警。
- **问题**：当前告警无法区分“首屏依赖泄漏”和“已隔离的重型编辑器功能”；构建只提示若干 chunk 超过 500 kB，既不能证明 Ketcher/3Dmol 没有重新进入首屏图，也没有针对首屏、3D viewer、Ketcher editor 分别设置可回归的大小上限。
- **建议**：输出 Vite manifest，并新增构建预算检查：限制首屏同步 JS/CSS 总量，断言 Ketcher 与 3Dmol 不在首屏静态依赖图，再分别记录按需功能块预算；通过该检查后再把 Vite 通用阈值调整为只报告超出已知重型功能块的异常值。
- **建议映射的方法**：M-L4-03（固化现有懒加载边界并用依赖图验证代码分割）
- **风险**：中（不会改变产品功能，但预算算法若未按 manifest 依赖图计算，可能误报或漏报；阈值需要以当前构建基线和合理余量拍板）
- **验证**：AI 自证（连续两次生产构建；预算脚本通过；故意把 loader 改成静态 import 的测试夹具能失败；现有 loader 测试通过）｜ HUMAN（首次启动后打开 3D 预览和 2D 编辑器，确认延迟加载状态与错误重试不变）
- **范围**：约 120 行 / 4-5 文件

### #4 用受控依赖边界移除 3Dmol direct eval ✗

暂缓理由：先完成低/中风险的发行资源裁剪与 bundle 预算；第三方代码转换单独设计和验收，避免和本轮体积优化混在同一次改动中。

- **位置**：`web/src/app/Molecule3DmolViewer.loader.ts:1-7`、`web/src/app/Molecule3DmolViewer.tsx:84-102`、`web/vite.config.ts:7-29`
- **分类**：性能
- **现状**：`3dmol@2.5.5` 的发布入口 `build/3Dmol.js` 在 `makeFunction` 中用 direct `eval` 把字符串 callback 转成函数；RxnFlow 只调用 `createViewer` 并传入真实函数 callback，不使用 3Dmol 的 HTML data-attribute/string callback 自动加载能力。
- **问题**：未使用的字符串 callback 路径仍被打进 575 kB 的按需块，生产构建每次产生 direct `eval` 安全告警；若直接改 `node_modules`，安装依赖后会丢失且无法审计上游版本变化。
- **建议**：在本地 3Dmol 适配层后增加版本锁定、精确匹配且失败即中止构建的转换，只把字符串 callback 分支改为拒绝并返回 no-op，保留真实函数 callback；增加产物扫描断言 3Dmol 块不再含 direct `eval`，不得直接编辑 `node_modules`。
- **建议映射的方法**：M-L1-03（在调用点与第三方库之间建立可替换、可验证的依赖边界）
- **风险**：高（3Dmol 的 viewer、model、shape 内部均复用 `makeFunction`；虽然 RxnFlow 不传字符串 callback，仍需用交互测试证明点击选择、hover、振动和清理路径没有被转换误伤）
- **验证**：AI 自证（3Dmol loader/viewer 单测、生产构建、产物无 direct `eval` 扫描、浏览器 console 无新增错误）｜ HUMAN（桌面与浏览器中旋转/缩放结构、选择 1-4 个原子、清空选择、播放/暂停振动并反复切换节点）
- **范围**：约 100 行 / 4-5 文件

## 已确认不列入本轮

- 不把“把 `chunkSizeWarningLimit` 调大”单独列为优化；没有 manifest 依赖图和首屏预算时，这只会隐藏回退。
- 不替换 Ketcher。它是当前 2D 分子编辑能力的主体且已经按需加载；若要显著减少其约 34 MiB 前端资源，需要更换编辑器或裁掉产品能力，属于 feature/architecture 决策，不是行为等价 refactor。
- 不更换 Electron。Electron Framework 当前约 283 MB，是安装后体积的主要基线；迁移 Tauri/native 会改变多端架构、运行时和发布链路，应单独走 roadmap。
- 不在本轮裁剪 PyInstaller 的 NumPy/SciPy/cclib 收集。bundled engine 约 59.6 MiB，`--collect-all cclib` 确有继续优化空间，但当前缺少足够的授权真实 Gaussian/ORCA parser golden fixtures；在没有刻画测试时改 hidden imports/数据收集会命中 refactor 前置检查第 2 条。
- 不把分析用 sourcemap 纳入发行体积。正常 `npm run build` 不生成 `.map`，当前生产 `web/dist` 约 35 MiB。
