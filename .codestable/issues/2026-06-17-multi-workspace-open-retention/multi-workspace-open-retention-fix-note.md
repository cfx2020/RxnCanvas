---
doc_type: issue-fix-note
status: fixed
slug: multi-workspace-open-retention
created_at: 2026-06-17
updated_at: 2026-06-17
---

# Multi workspace open retention fix note

## 1. 问题

用户在桌面端先打开真实 `Ir` 工作区，再打开真实 `Ni` 工作区时，左侧工作区列表被 `Ni` 覆盖，`Ir` 直接消失，无法同时看到多个文件夹。

## 2. 根因

上一轮为了解决“重启后 demo 工作区回来了”的问题，把桌面真实工作区打开路径统一传入 `replaceProjects: true`。

但 `web/src/app/projectPackageWorkflow.ts` 中的 `replaceProjects` 逻辑过于激进：

- 直接返回 `[restoredProject]`
- 丢弃当前所有已打开项目和 workspace snapshot

因此手动打开第二个真实工作区时，原先打开的真实工作区也被误删。

## 3. 修复

将 `replaceProjects` 语义调整为：

- 清掉内置 demo 工作区：`diels-alder` / `nickel` / `ir-screening`
- 保留当前已经打开的真实工作区
- 新打开的工作区置顶并激活
- 保存当前 active workspace snapshot，避免切换时丢状态

这样：

- 第一次打开真实 `Ir`：demo 消失，列表为 `Ir`
- 再打开真实 `Ni`：列表为 `Ni` + `Ir`，`Ni` 激活，`Ir` 保留

## 4. 改动文件

- `web/src/app/projectPackageWorkflow.ts`
- `web/src/app/appRuntimeEffects.ts`
- `web/src/app/App.tsx`
- `web/electron/main.cjs`
- `web/electron/runtime-smoke.cjs`
- `web/src/app/projectPackageWorkflow.test.ts`
- `web/src/app/appRuntimeEffects.test.ts`
- `web/src/app/App.test.tsx`

## 5. 验证

已通过：

```bash
cd /Users/linsay/Desktop/code/rxnflow/web
npx tsc -b --pretty false
npm run test -- --run src/app/projectPackageWorkflow.test.ts src/app/App.test.tsx src/app/appRuntimeEffects.test.ts
npm run test
npm run build
npm run desktop:smoke
npm run desktop:pack
npm run desktop:runtime:smoke
```

新增测试覆盖：

- workflow 层：`replaceProjects: true` 时保留已打开真实 `Ir`，清掉内置 demo，再激活新 `Ni`。
- App 层：模拟桌面 `open-project-content` 先打开 `Ir`、再打开 `Ni`，断言 `Ni open` 与 `Ir open` 同时存在，demo 项目不存在。
- Runtime 层：`getStartupProjectContent()` 支持返回多个 `projectContents` 并按顺序恢复。
- Electron runtime smoke：用两个临时 `.rxnflow` 工作区写入临时 `recent-projects.json`，验证打包 app 启动后两个工作区都显示且 demo 不显示。

浏览器实际 smoke 已通过：

- URL：`http://127.0.0.1:5173/`
- 通过 Playwright 在页面初始化时 mock `window.rxnflowDesktop`
- 模拟先打开 `Ir.rxnflow`，等待 `Ir open` 出现
- 再模拟打开 `Ni.rxnflow`，验证 `Ni open` + `Ir open` 同时可见，`Diels-Alder Study` / `Nickel catalysis` / `Ir screening` 不可见
- Console 无相关 error/warning

截图：`/tmp/rxnflow-multi-workspace-smoke.png`

## 6. 结果

重新打包后的 macOS app 路径：

`/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`

预期现在手动打开第二个真实工作区时，不会覆盖第一个真实工作区；关闭并重启后，也会从 recent list 恢复多个可读工作区。

## 7. 剩余风险

- 当前启动会恢复 recent list 中可读的多个工作区，但还没有做可视化的“最近工作区管理 / 固定 / 移除”界面。
- macOS 签名、公证和 Windows 真机多工作区打开尚未验证。
