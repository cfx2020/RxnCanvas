---
doc_type: feature-acceptance
feature: 2026-06-18-multi-canvas-persistence
status: accepted
accepted_at: 2026-06-19
summary: 多 Canvas Tab 已升级为项目级持久化工作区结构，桌面 open/autosave/startup restore/export 与浏览器 v2 package 打开均可恢复全部画布和 active canvas。
tags: [desktop, canvas, multi-canvas, persistence, workspace-folder, acceptance]
---

# Multi-canvas Persistence 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-19
> 关联方案 doc：`.codestable/features/2026-06-18-multi-canvas-persistence/multi-canvas-persistence-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `ProjectCanvasSnapshot` / `RxnFlowProjectCanvas` 已落地：`web/src/app/projectWorkspace.ts:25`、`web/src/domain/projectPackages.ts:118` 定义每个 canvas 的 `nodes` / `edges` / `barriers` / `viewport` / selection。
- [x] `ProjectWorkspaceSnapshot` 已变为共享 `files` + `canvases[]` + `activeCanvasId` + project-level UI state：`web/src/app/projectWorkspace.ts:27`。
- [x] `RxnFlowProjectPackage` 已支持 v2 多画布 envelope，并保留 v1/open normalize 兼容字段：`web/src/domain/projectPackages.ts:130`。
- [x] `buildProjectPackage()` 序列化 all canvases + active canvas，并从所有 canvas nodes 派生 `importLedger`：`web/src/domain/projectPackages.ts:157`。
- [x] `parseProjectPackage()` 接受 schemaVersion 1/2，并通过 `normalizeProjectCanvases()` / `normalizeSelectionIds()` 归一化旧包和坏 selection：`web/src/domain/projectPackages.ts:225`、`:439`、`:484`。

**名词层“现状 → 变化”逐项核对**

- [x] Canvas Tab：runtime-only tab state 已抽到 `web/src/app/projectCanvasState.ts:3`，并可和 project `canvases[]` 相互转换。
- [x] Canvas Snapshot：`canvasTabSnapshotFromState()` 与 `projectCanvasSnapshot()` 均做独立 clone，避免切换画布时共享引用污染。证据：`web/src/app/projectCanvasState.ts:23`、`web/src/app/projectWorkspace.ts:603`。
- [x] Project Workspace Snapshot：`projectWorkspaceSnapshot()` 先把 active canvas 投影回 `canvases[]`，再按 resolved active canvas 输出当前编辑态。证据：`web/src/app/projectWorkspace.ts:276`。
- [x] Active Canvas：`resolveActiveCanvasId()` 在 workspace 与 package 层均实现缺失回退。证据：`web/src/app/projectWorkspace.ts:631`、`web/src/domain/projectPackages.ts:479`。
- [x] Canvas Workspace Store：`.rxnflow/project.json` 当前写入 schemaVersion 2 的 `canvases[]` + `activeCanvasId`；桌面/engine 校验均支持 flatten all canvases。证据：`rxnflow/engine.py:1005`、`web/electron/embedded-engine.cjs:1085`。

**流程图核对**

- [x] `User creates / switches canvas tab` → `App commits current active canvas`：`App.tsx:419` / `App.tsx:433` 调用 `switchCanvasTabState()` / `createCanvasTabState()`。
- [x] `currentProjectWorkspaceSnapshot()` 生成 `files + canvases + activeCanvasId`：`web/src/app/App.tsx:377`。
- [x] Debounced autosave serialize v2：`web/src/app/App.tsx:329` 传入 `canvases` / `activeCanvasId`，`projectPackageWorkflow.ts:78` 调用 `buildProjectPackage()`。
- [x] Electron 写 `.rxnflow/project.json`：`web/electron/project-store.cjs:41` / `web/electron/main.cjs:761` 路径仍统一。
- [x] App restart / Open Folder / Open Recent：`appRuntimeEffects.ts:108`、`:191`、`:217` 将 `projectDirectory` 透传给 restore；`main.cjs:672` 暴露 startup restore payload。
- [x] `parseProjectPackage normalizes v1 or v2` → `projectWorkspaceFromPackage restores active canvas`：`projectPackages.ts:225`、`projectWorkspace.ts:681`。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] 新建多个画布后，保存/重开可恢复画布集合和 active canvas。证据：package normalize/unit tests、`desktop:runtime:smoke` startup restore、packaged actual restart smoke 截图 `/tmp/rxnflow-packaged-actual-restart.png`。
- [x] 每个画布保存自己的节点、连线、barrier、viewport、selection。证据：`projectCanvasState.test.ts:39` / `:58`、`projectPackages.test.ts:84` / `:138`。
- [x] source file 列表仍是项目级共享资源。证据：`ProjectWorkspaceSnapshot.files` 仍在 project-level，`projectWorkspaceWithImportPlan()` 只更新 active canvas：`web/src/app/importWorkspace.ts:265`。
- [x] 自动保存、Open Folder、startup restore、Export project 都走同一 v2 package schema。证据：`projectPackageWorkflow.ts:78`、`appRuntimeEffects.ts:108` / `:130` / `:217`、`main.cjs:761`。
- [x] 旧单画布项目打开后自动包成默认 canvas。证据：`projectPackages.test.ts:267`、`projectWorkspace.test.ts:459`。

**明确不做逐项核对**

- [x] 未实现 path tabs、relative energy sheets、path zero point 或 path-scoped stoichiometry persistence；grep 未发现新增相关代码路径。
- [x] 未新增 cloud sync、IndexedDB/OPFS、账号、多人协作、CRDT、冲突合并或后台目录 watcher；grep 仅命中文档中的既有边界说明。
- [x] 未持久化 undo/redo history、candidate review sheet、structure preview dialog、3D dialog、connection/barrier draft 或 hover UI。
- [x] 未新增跨画布复制/粘贴、跨画布引用、画布模板、权限、颜色或排序拖拽。
- [x] 未改变 parser / cclib / engine status / source external viewer 语义；engine 只改 project envelope validation/summary flatten。

**关键决策落地**

- [x] 多画布是项目级工作区结构：`ProjectWorkspaceSnapshot.canvases` 和 package v2 已落地。
- [x] 项目至少有一个 canvas：`emptyProjectWorkspace()`、`normalizeProjectCanvases()` 和 `defaultProjectCanvas()` 均保证 fallback。证据：`projectWorkspace.ts:188`、`projectPackages.ts:439`、`:465`。
- [x] active canvas 持久化：`activeCanvasId` 进入 autosave input、project package 和 restore path。证据：`App.tsx:329`、`projectPackages.ts:215`。
- [x] 旧单画布 schema 向前归一化，保存统一 v2：`parseProjectPackage()` 返回 `schemaVersion: 2`，`buildProjectPackage()` 返回 v2。
- [x] selection 轻量恢复并过滤坏引用：`normalizeSelectionIds()` 只保留当前 canvas 中存在的 ids。
- [x] viewMode / inspectorMode / energyDisplayOptions 保持 project-level：仍位于 `ProjectWorkspaceSnapshot` 顶层。
- [x] source 列表共享：`importLedger` 从 `files + all canvas nodes` 派生，不复制到 canvas 内。

**编排层变化核对**

- [x] App 的单画布 React state 变成 active canvas 编辑投影：`applyProjectWorkspaceApplyTransitionState()` 使用 `activeCanvasSnapshot()`。证据：`web/src/app/appStateAppliers.ts:99`。
- [x] 切换/新建画布先回写当前 active canvas，再投影目标 canvas：`projectCanvasState.ts:35` / `:57`。
- [x] `currentProjectWorkspaceSnapshot()` 不再只拼当前裸 nodes/edges/barriers，而是生成所有 canvases。证据：`App.tsx:377`。
- [x] Desktop startup restore one-shot race 已修复：startup effect 只运行一次，通过 `restoreProjectPackageRef` 调用最新 restore handler。证据：`App.tsx:230`、`:1060`。
- [x] Main process 可在 renderer restore 后用 `projectDirectory` 重新绑定 project id，避免 autosave 丢目录。证据：`main.cjs:793`、`:992`。

**挂载点反向核对**

- [x] `projectWorkspace.ts`：多画布 snapshot / restore / transition 主名词层已落地。
- [x] `App.tsx`：active canvas 编辑态与 `canvases[]` 双向投影已落地。
- [x] `projectPackages.ts` / `projectPackageWorkflow.ts`：v2 envelope 与 v1 normalize 已落地。
- [x] `appRuntimeEffects.ts` + Electron open/autosave/startup restore：全部透传 `projectDirectory` 并使用 v2 serialization。
- [x] tests/smoke：package normalize、workspace transition、runtime restore、desktop smoke 与浏览器 smoke 均覆盖。
- [x] 反向 grep：`CanvasTab|canvasTabs|activeCanvasId|canvases|RxnFlowProjectCanvas|ProjectWorkspaceSnapshot` 命中集中在方案列出的 app/domain/electron/engine/tests 挂载点；未出现方案外持久层。
- [x] 拔除沙盘推演：删除 `projectCanvasState.ts`、`projectWorkspace.ts` 多画布字段、`projectPackages.ts` v2 normalize、runtime restore 目录绑定和测试后，本 feature 从用户视角消失；source import、energy display、report export 与 parser 语义不需要回退。

## 3. 验收场景核对

- [x] **S1** 新建项目默认 `画布 1`，snapshot 至少一个 canvas。证据：`projectCanvasState.test.ts:35`、`projectWorkspace.test.ts:121`、`emptyProjectWorkspace()`。
- [x] **S2** `画布 1` / `画布 2` 内容互不覆盖。证据：`projectCanvasState.test.ts:39` / `:58`、browser v2 smoke 验证 active `画布 2` 显示 `Node B`。
- [x] **S3** 保存/自动保存后关闭重开恢复多个画布。证据：packaged actual restart smoke `/tmp/rxnflow-packaged-actual-restart.png`；`desktop:runtime:smoke` startup restore 通过。
- [x] **S4** 重开后 active canvas 与关闭前一致，缺失时安全回退。证据：browser v2 smoke 导入 `activeCanvasId=canvas-2` 后 `画布 2` 为 active；`resolveActiveCanvasId()` tests/normalize 覆盖回退。
- [x] **S5** 每个画布 viewport 恢复。证据：v2 package/workspace snapshot clone 与 browser smoke stage 恢复；`projectWorkspaceSnapshot()` 按 active canvas viewport 投影。
- [x] **S6** 每个画布 selection 恢复且坏引用过滤。证据：`normalizeSelectionIds()`；package normalize tests。
- [x] **S7** source 列表保持项目级共享。证据：`files` 顶层 schema、`importLedger` flatten all canvas nodes、docs/architecture 已回写。
- [x] **S8** `Export project` zip 中 `.rxnflow/project.json` 包含多画布结构。证据：`desktop:smoke` 的 project directory/archive smoke 使用 v2 content 并通过。
- [x] **S9** 旧单画布 `.rxnflow.json` / 工作区打开归一化为默认 canvas。证据：`projectPackages.test.ts:267`、`projectWorkspace.test.ts:459`。
- [x] **S10** 导入 source 并 autosave 后重启恢复时保留 `storedPath` / checksum。证据：packaged actual smoke 检查 `storedPath/checksum`；`desktop:smoke` project save/open checksum smoke 通过。
- [x] **S11** `npm run test -- --run` 通过：31 files / 238 tests。
- [x] **S12** `npm run build` 通过；3Dmol direct eval 与 chunk size 为既有 warning。
- [x] **S13** `npm run desktop:smoke` 通过。
- [x] **S14** `npm run desktop:runtime:smoke` 通过，包含 packaged startup restore marker。
- [x] **S15** 浏览器 dev preview 可打开 v2 项目且无 console/page error。证据：Node Playwright smoke 导入 `/tmp/rxnflow-accept-v2-project.rxnflow.json`；截图 `/tmp/rxnflow-accept-browser-desktop.png`、`/tmp/rxnflow-accept-browser-narrow.png`。
- [x] **S16** 桌面实际 smoke 创建第二画布、导入/拖入节点、关闭重开可见恢复。证据：实现阶段 packaged actual restart smoke 通过，截图 `/tmp/rxnflow-packaged-actual-restart.png`。

**浏览器视觉验证**

- [x] 桌面 `1440x940`：`.canvas-stage` = `872x832`，无 console/page error，截图 `/tmp/rxnflow-accept-browser-desktop.png`。
- [x] 窄屏 `390x844`：`.canvas-stage` = `328x409`，document `scrollWidth=720`，按项目约束横向滚动而不是压扁 canvas，截图 `/tmp/rxnflow-accept-browser-narrow.png`。
- [x] `webapp-testing` 首选 Python Playwright 因系统 Python 未安装 `playwright` 不可用，已用仓库内 Node Playwright fallback 执行等价验证。

## 4. 术语一致性

- Canvas Tab：代码中使用 `CanvasTabSnapshot` / `CanvasTabState` / `canvasTabs`，语义只指顶部画布标签，未与 reaction path tabs 混用。
- Canvas Snapshot：代码中是单 canvas 轻量状态，不包含 source list。
- Project Workspace Snapshot：代码中为 `files + canvases + activeCanvasId + project-level UI state`。
- Active Canvas：代码中为 `activeCanvasId` / `activeCanvasTabId`，未与 active project 混名。
- Canvas Workspace Store：文档归并到 `.rxnflow/project.json` schemaVersion 2，代码用 `RxnFlowProjectPackage` 表达。
- 防冲突 grep：`path tabs|relative energy sheet|IndexedDB|CRDT|cloud sync|history persistence|canvas color|reorder|template|permission` 未发现本 feature 新增 runtime 实现；命中仅为既有菜单 template/CSS grid 或边界文档。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已更新全局 active 形态，说明中间 canvas/table 现在是项目级多 Canvas Tab，source files 共享，每个 canvas 单独保存图谱/视口/选择；Local Engine project envelope 说明更新为 schemaVersion 2。
- [x] `.codestable/architecture/web-workbench.md`：已归并多画布 schema、App active canvas 投影、`projectCanvasState.ts` 边界、project package v2 serialize/restore、Electron startup restore / active project directory binding、QA 口径与代码锚点。
- [x] `docs/user/desktop-canvas-workbench.md`：已补用户层说明，介绍 Canvas Tab Bar、`New canvas`、共享 source list、保存/重开恢复全部画布和 active canvas。
- [x] `docs/dev/desktop-rebuild-verification.md`：已补多画布 open/autosave/restart 验证步骤、project package v2 检查和 `desktop:runtime:smoke` startup restore 说明。
- [x] 架构总入口无需新增新文档链接；本次是更新已有 `web-workbench` 文档。

## 6. requirement 回写

- [x] 方案 frontmatter `requirement: project-content-persistence` 指向 current req。
- [x] `.codestable/requirements/project-content-persistence.md` 已更新：pitch、last_reviewed、tags、用户故事、当前需求、项目格式、保存内容、校验、运行时边界、当前不做和变更日志均反映“项目内全部 canvas + active canvas”。
- [x] `.codestable/requirements/VISION.md` 已同步该 requirement 的 pitch。

## 7. roadmap 回写

- [x] 本 feature design frontmatter 没有 `roadmap` / `roadmap_item` 字段，属于非 roadmap 起头；无需回写 roadmap items.yaml 或主文档。

## 8. attention.md 候选盘点

- [x] 候选 1：startup restore IPC 是 one-shot，React effect 不应依赖频繁变化的 restore callback；应使用稳定 effect + ref 调用最新 handler，避免 main process payload 被消费后 renderer cleanup 取消恢复。已沉淀到 `.codestable/compound/2026-06-19-learning-startup-restore-one-shot-ipc.md`，并已追加 `.codestable/attention.md` 摘要。

## 9. 遗留

- 画布 rename / reorder / delete / duplicate 仍无 contract，后续单独 feature。
- 跨画布复制/移动节点、跨画布引用、画布模板、权限、颜色不在当前范围。
- 如果后续要做画布级 table/filter/export 偏好，需要重新评估 `viewMode / inspectorMode / energyDisplayOptions` 是否下沉到 canvas。
- 实现阶段无“顺手发现”被偷偷修掉；CSS 布局修复属于画布验证中发现的必要修复，已归入 QA/指南。

## 验证记录

- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-06-18-multi-canvas-persistence/multi-canvas-persistence-checklist.yaml --yaml-only`：通过。
- `python3 -m unittest discover`：22 tests passed。
- `cd web && npm run test -- --run`：31 files / 238 tests passed。
- `cd web && npm run build`：通过，保留既有 3Dmol eval / chunk size warning。
- `cd web && npm run desktop:smoke`：通过。
- `cd web && npm run desktop:pack`：通过，刷新 `web/release/mac-arm64/RxnFlow.app`。
- `cd web && npm run desktop:runtime:smoke`：通过，marker `RXNFLOW_DESKTOP_RUNTIME_SMOKE_OK rxnflow-embedded-engine-v1 embedded-node`。
- `cd web && npm run dev` + Node Playwright browser smoke：通过，截图 `/tmp/rxnflow-accept-browser-desktop.png`、`/tmp/rxnflow-accept-browser-narrow.png`。
