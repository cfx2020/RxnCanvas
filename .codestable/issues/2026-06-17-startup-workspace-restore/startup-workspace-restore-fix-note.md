---
doc_type: issue-fix-note
status: fixed
slug: startup-workspace-restore
created_at: 2026-06-17
updated_at: 2026-06-17
---

# Startup workspace restore fix note

## 1. 问题

用户在打包后的 macOS app 中删除 demo 工作区，创建真实 `Ir` 工作区并导入 log 后，关闭并重新打开 app，界面又回到内置 demo：`Nickel catalysis` / `Ir screening` 返回，真实 `Ir` 工作区消失。

## 2. 根因

桌面端已经会把新建/打开的工作区目录写入 `recent-projects.json`，项目内容也会 autosave 到真实 `.rxnflow` 文件夹；但 app 重启时渲染层仍从 `initialProjects` 启动，没有主动恢复最近工作区。

另外，仅靠主进程在 `did-finish-load` 时推送 IPC 事件存在时序风险：React 的 `onOpenProjectContent` 订阅可能尚未注册，启动恢复事件会丢失。

## 3. 修复

- Electron 主进程启动时准备最近工作区恢复负载，并暴露 `rxnflow:get-startup-project-content`。
- preload 暴露 `window.rxnflowDesktop.getStartupProjectContent()`。
- React 启动后主动拉取一次 startup project content，避免 IPC 竞态。
- `projectPackageRestoreTransitionFromContent` 增加 `replaceProjects` 选项：桌面真实工作区恢复时用 `[restoredProject]` 替换 demo 项目列表，而不是把真实工作区叠到 demo 前面。
- 桌面 `Open Folder` / `Open Recent` / startup restore 统一传递或推断 `replaceProjects: true`。
- `desktop:runtime:smoke` 增加临时 userData + 临时 `.rxnflow` 工作区启动恢复验证，确认打包 app 启动后显示临时工作区且不显示 demo 项目。

## 4. 改动文件

- `web/electron/main.cjs`
- `web/electron/preload.cjs`
- `web/electron/runtime-smoke.cjs`
- `web/src/app/appRuntimeEffects.ts`
- `web/src/app/App.tsx`
- `web/src/app/projectPackageWorkflow.ts`
- `web/src/app/appRuntimeEffects.test.ts`
- `web/src/app/App.test.tsx`
- `web/src/app/projectPackageWorkflow.test.ts`

## 5. 验证

已通过：

```bash
cd /Users/linsay/Desktop/code/rxnflow/web
npx tsc -b --pretty false
npm run test
npm run build
npm run desktop:smoke
npm run desktop:pack
npm run desktop:runtime:smoke
```

其中 `npm run desktop:runtime:smoke` 现在包含两段：

1. 默认打包 app 启动 smoke。
2. 临时最近工作区 startup restore smoke：用临时 userData 写入 `recent-projects.json`，启动打包 app，验证页面显示 `Startup Restore Smoke`，并且不显示 `Diels-Alder Study` / `Nickel catalysis` / `Ir screening`。

浏览器实际 smoke 已通过：

- URL：`http://127.0.0.1:5173/`
- 桌面视口：`1280x800`
- 窄屏视口：`390x800`
- 验证项：页面标题、workbench 非空、无框架错误覆盖、console 无相关 error/warning、`New Project Folder` 表单打开/取消交互、窄屏 reload 后 toolbar 可见。

## 6. 结果

重新打包后的 app 路径仍是：

`/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`

预期现在重启 app 时会恢复最近真实工作区，不会重新把内置 demo 工作区插回当前工作区列表。

## 7. 剩余风险

- 目前只恢复最近一个真实工作区；如果后续要做“多工作区侧栏持久列表”，需要单独设计 recent/workspace index，而不是依赖单个 startup restore。
- macOS 签名、公证和 Windows 真机重启恢复尚未验证。
