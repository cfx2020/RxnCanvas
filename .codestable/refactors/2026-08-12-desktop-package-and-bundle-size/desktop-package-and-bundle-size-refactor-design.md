---
doc_type: refactor-design
refactor: 2026-08-12-desktop-package-and-bundle-size
status: approved
scope: Electron locale 与运行资源裁剪，以及 Vite 首屏/重型按需入口的 bundle 预算
summary: 保留中英文 Electron locale、收窄 ASAR build 资源，并用 manifest 依赖图建立可回归的首屏和按需 bundle 预算
---

# desktop-package-and-bundle-size refactor design

## 1. 本次范围

- 从 scan 勾选：#1 只保留中英文 Electron locale、#2 把 `build/` 改成运行资源白名单、#3 用按入口预算替代统一 chunk 告警。
- 明确不做：不更换 Electron 或 Ketcher，不修改 Python engine/cclib 收集，不直接编辑 `node_modules`，不在本轮转换 3Dmol 的 direct `eval`。
- 预估工作量：3 个实现步骤，整体风险中等；前两步预计合计减少约 47.7 MiB macOS 安装体积，第三步主要防止首屏依赖和 bundle 体积回退，不承诺显著减少磁盘占用。
- 体积口径：以 unpacked app/ASAR 的字节数衡量安装体积，以 DMG/ZIP/EXE 的字节数衡量下载体积；二者不混用。

## 2. 前置依赖

- 保留 `web/electron/release-smoke.cjs` 对 builder 配置、图标、签名资源与 unpacked app 形状的现有断言。
- 保留 `web/electron/runtime-smoke.cjs` 对 packaged renderer、Electron main 和 bundled engine 启动路径的验证。
- 保留 `web/src/app/heavyEditorLoaders.test.ts` 对 Ketcher/3Dmol retryable dynamic import 的验证。
- Vite manifest 使用源入口 key 和 `imports`/`dynamicImports` 建图，不依赖带 hash 的输出文件名。
- 预算采用当前生产构建基线加约 15%-20% 余量：首屏同步 JS + CSS 原始体积不超过 1.1 MiB；3Dmol 动态入口静态闭包不超过 0.8 MiB；Ketcher editor 动态入口静态闭包不超过 28 MiB；jsNoRender 报告导出入口静态闭包不超过 18 MiB。

## 3. 执行顺序

### 步骤 1：裁剪 Electron locale 并固化发行断言

- 引用方法：M-L4-03 Lazy Loading / Code Splitting。
- 具体操作：在 electron-builder 顶层配置 `electronLanguages`，保留 `en`、`zh-CN`、`zh-TW`；release smoke 验证配置白名单，并在当前平台已有 unpacked app 时枚举 locale 目录，断言保留集合和非白名单清理结果。
- 退出信号：release smoke 通过；重建 macOS unpacked app 后 locale 从约 220 份降到中英文集合，locale 总体积减少约 45 MiB；app 能通过 packaged runtime smoke。
- 验证责任：AI 自证 + HUMAN。
- 回滚：删除 `electronLanguages` 和对应 smoke 断言，恢复 electron-builder 默认全语言资源。

### 步骤 2：把 ASAR 中的 build 资源收窄到运行时图标

- 引用方法：M-L3-07 Single Responsibility Split。
- 具体操作：将 `files` 里的 `build/**/*` 替换为 `build/icon.png`、`build/icon.ico`；保持 `buildResources`、`mac.icon`、`mac.entitlements`、`win.icon` 不变；release smoke 分别检查仓库构建资源完整，以及打包后 ASAR 只携带主进程读取的运行图标。
- 退出信号：release smoke 与 packaged runtime smoke 通过；ASAR 中不存在 iconset、`icon.svg`、`icon.icns` 和 entitlement 副本；ASAR 体积减少约 2.36 MiB；macOS 应用包仍在 `Contents/Resources/icon.icns` 持有系统图标。
- 验证责任：AI 自证 + HUMAN。
- 回滚：恢复 `build/**/*` 文件模式和原 release smoke 断言。

### 步骤 3：建立 manifest bundle 预算并替代通用大块告警

- 引用方法：M-L4-03 Lazy Loading / Code Splitting。
- 具体操作：开启 Vite manifest；新增独立 Node 脚本读取 `dist/.vite/manifest.json`，递归计算入口静态 `imports`、CSS 和 assets 的唯一文件总量；断言首屏静态闭包不含 3Dmol/Ketcher 源入口，分别校验首屏、3Dmol、Ketcher editor、jsNoRender 预算；把脚本接入 `npm run build`；在预算生效后把 Vite 通用 chunk 阈值提高到略高于已知 Ketcher 单块，以避免重复且无场景信息的告警。
- 退出信号：正常生产构建不再输出 chunk 大于 500 kB 的通用告警；预算脚本输出各入口实际值/上限并通过；单元测试用临时 manifest 覆盖静态泄漏、缺失入口和超预算失败路径；现有 loader 测试通过。
- 验证责任：AI 自证 + HUMAN。
- 回滚：移除预算脚本和 build 串联，关闭 manifest，恢复 Vite 默认 chunk 阈值。

## 4. 风险与看点

- Electron locale 名称在 macOS 使用 `.lproj` 下划线形式、Windows 使用 `.pak` 连字符形式；白名单必须使用 electron-builder 支持的规范名称，并通过两个平台 CI 产物验证。
- `build/icon.png` 和 `build/icon.ico` 仍是 Electron main 的运行时路径，不能与构建期资源一起全部移出 ASAR。
- manifest 的 `imports` 图可能回指 `index.html` 以共享 React runtime；预算遍历必须去重并处理环，不能重复累计或无限递归。
- Ketcher 有 editor、miew 和 jsNoRender 多个动态入口；预算按功能入口静态闭包分别计算，不能只看最大的单文件。
- 调高 Vite 通用阈值只允许和自定义预算在同一步完成；若预算脚本未先通过，不得单独隐藏告警。
- 3Dmol direct `eval` 告警在本轮结束后仍会存在，作为 scan #4 的独立高风险事项继续保留；本轮不会伪装成已经解决。

## 5. 用户确认

- 2026-08-12：用户确认“好”，同意按 #1、#2、#3 的顺序执行，并要求明确处理大 chunk。
