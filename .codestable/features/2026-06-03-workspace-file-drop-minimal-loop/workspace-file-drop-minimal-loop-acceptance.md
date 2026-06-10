---
doc_type: feature-acceptance
feature: 2026-06-03-workspace-file-drop-minimal-loop
status: accepted
summary: 验收 workspace-first raw file drop 最小闭环、Project Files Panel、single-object guard、架构/需求/roadmap 回写
tags: [web, workspace-first, project-files, raw-file-drop, graph-canvas, local-first]
---

# workspace-file-drop-minimal-loop 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-03
> 关联方案 doc：.codestable/features/2026-06-03-workspace-file-drop-minimal-loop/workspace-file-drop-minimal-loop-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] `ProjectFileEntry` 已落地在 `web/src/app/projectFiles.ts`，字段包含 projectRef、path、name、kind、checksum、status、rawResourceId、registeredObjectIds、graphNodeIds、artifactIds 和 warnings；`listProjectFileEntries()` 从 `inputs/raw/` 与 `exports/` repository objects 派生项目文件面板数据。
- [x] Raw file drop payload 已落地在 `web/src/app/graphRawFileDropPayload.ts`，MIME type 为 `application/x-rxnflow-raw-file`，与 `application/x-rxnflow-graph-object` 分离。
- [x] `AddRawFileNodeRequest` 与 `onAddRawFileNode` 已落地在 `web/src/app/GraphCanvas.tsx`；GraphCanvas 能把 project file payload 或 native browser `File` drop 转成 canvas position request。
- [x] 方案中的 ProjectFilesPanel 示例由 `ProjectSidebar.tsx` 的 `ProjectFileRow` dragstart 实现；GraphCanvas 示例由 `rawFileNodeRequestFromDrop()` 实现。

流程图核对通过：external file / project raw file drop 都进入 `WorkbenchShell.addRawFileNode()`，再按 persist raw -> `import.preview` -> single-object guard -> `import.register_all` -> `workspace.add_node` 串联。

## 2. 行为与决策核对

需求摘要已落地：active browser project 下左侧显示 Project Files Panel；外部文件 drop 先进入项目 `inputs/raw/...`；项目内 raw file row 可再次拖回画布；单对象 preview 自动登记并创建节点。

明确不做核对：

- [x] 未新增 molecule preview、CDXML/CDX、PES preview 或 energy.compute 逻辑。
- [x] 未新增 Python Shell command、Project Content schema、Browser Project Repository interface 或 parser plugin。
- [x] Web 代码未 import Python parser/core，也未在前端解析 Gaussian/ORCA/MAPLE/XYZ/extxyz。
- [x] 未把 browser directory handle 写入 Project Content。

关键决策已落地：

- [x] 项目文件是权威：Project Files Panel 只读 active project repository，不展示 loose external files。
- [x] 单对象才自动建节点：`object_count !== 1` 显示 `candidate_selection_required`，不调用 register/add-node。
- [x] raw persistence helper 复用现有 `persistRawInputFile()` 与 `inputs/raw/{sha12}-{safeName}` manifest 语义。
- [x] 可见 graph node 只来自 ShellResponse workspace projection。
- [x] Import Inbox / Object Registry 可继续作为实现库存，但新验收入口是 Project Files Panel + Graph Canvas。

挂载点反向核对：实际改动集中在 Project Sidebar、Project Files projection、GraphCanvas drop target、WorkbenchShell drop pipeline、i18n/CSS/tests 和本 feature/roadmap/architecture/requirement 文档；未挂入 parser/core/cloud/schema。

## 3. 验收场景核对

- [x] S1/S2：active project 有/无文件时 Project Files Panel 分别显示文件列表或空态。证据：`ProjectSidebar.test.tsx`、`projectSidebarActions.test.ts`、`projectSidebarState.test.ts`。
- [x] S3/S4/S5：external file drop 写入 `inputs/raw/{sha12}-{safeName}` 并 merge manifest，同 checksum 不重复追加 resource。证据：`WorkbenchShell.test.tsx` 与既有 raw input persistence 测试。
- [x] S6/S7/S8：单对象 preview/register 成功后调用 `workspace.add_node(position)`，可见节点来自 ShellResponse，Project Files Panel 显示 `used-in-graph`。证据：`WorkbenchShell.test.tsx`、Playwright workspace-first raw file drop smoke。
- [x] S9：项目内 raw file row 再次拖到画布时复用已有 project file，不重复写 raw object。证据：`ProjectSidebar.test.tsx`、`WorkbenchShell.test.tsx`。
- [x] S10：`object_count !== 1` 不自动创建 graph node，显示候选选择器待办状态。证据：`WorkbenchShell.test.tsx`。
- [x] S11/S12/S13/S14：raw persistence、preview、register、add-node 任一步失败都停止后续步骤并显示 structured error。证据：`WorkbenchShell.test.tsx`。
- [x] S15：已登记对象拖入能力保留但不作为本 feature 兼容性要求；raw file payload 独立测试覆盖。
- [x] S16：Project Sidebar 的 Save Bridge、Export Bundle、Import Bundle 入口未移除。
- [x] S17：zh-CN / en-US 新增静态文案完整；动态 filename/path/checksum/error code 原样展示。证据：`messages.ts` catalog 和 Web tests。
- [x] S18/S19：桌面和 `390px` 窄屏 Project Files Panel 与 GraphCanvas drop 状态无水平溢出。证据：Playwright screenshots `web/test-results/workspace-file-drop-desktop.png`、`web/test-results/workspace-file-drop-mobile.png`。

验证命令：

- [x] `cd web && npm run test`：29 files / 259 tests passed。
- [x] `cd web && npm run build`。
- [x] `python3 -m unittest discover`：357 tests passed。
- [x] `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-06-03-workspace-file-drop-minimal-loop/workspace-file-drop-minimal-loop-checklist.yaml --yaml-only`。
- [x] `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-workspace-first-canvas-mvp/rxnflow-workspace-first-canvas-mvp-items.yaml --yaml-only`。
- [x] Browser/Playwright smoke：`http://127.0.0.1:5173/` 创建临时 project、运行 Fixture、drop `.extxyz` 到画布、看到 `Used in graph`，桌面和窄屏均无水平溢出。

## 4. 术语一致性

- `ProjectFileEntry` / `Project Files Panel` / `Raw File Drop` / `Drop Import Pipeline` 在 design、代码、tests 和 architecture 中保持同一含义。
- `graphRawFileDropMimeType` 与 `graphObjectDragMimeType` 命名明确区分 raw file intent 和 registered object drag。
- 防冲突：grep 命中集中在本 feature 相关 Web app modules 与 CodeStable 文档；未出现把 raw file drop 扩展成 parser/runtime API 的命名漂移。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md` 已加入 Project Files Panel、`ProjectFileEntry`、Raw File Drop to Canvas、single-object guard、失败停止语义、模块清单和 QA 记录。
- [x] 不需要更新 `.codestable/architecture/core-platform.md`：本 feature 未新增 Python shell command、core parser、registry、graph、energy 或 export writer。
- [x] `AGENTS.md` 不需要更新：现有 Web 预览、前端验证、模块解耦和 parser/core 边界规则足够覆盖本次能力。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md` 已补用户故事：项目文件面板、外部文件只是 picker、raw file 直接拖到画布、单对象自动建节点、多对象/多帧不自动铺满画布。
- [x] 同一 requirement 已补怎么解决与边界：Project Files Panel 展示项目内文件，Raw File Drop pipeline 是唯一浏览器文件/项目 raw file 到 graph node 的路径。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-workspace-first-canvas-mvp/rxnflow-workspace-first-canvas-mvp-items.yaml` 已将 `workspace-file-drop-minimal-loop` 从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-workspace-first-canvas-mvp/rxnflow-workspace-first-canvas-mvp-roadmap.md` 第 5 节已同步状态和当前最小闭环结论。
- [x] 下一项仍是 `canvas-chemical-node-card`，用于承接多对象/多帧候选选择和更丰富画布节点卡片。

## 8. AGENTS.md / CLAUDE.md 候选盘点

无候选。本 feature 没有新增每个后续 feature 都需要额外遵守的运行命令或环境约定；项目级 `AGENTS.md` 已说明 Vite dev server、浏览器验证和 Web/core 解耦边界。

## 9. 遗留

- 后续 `canvas-chemical-node-card` 需要实现多对象 / 多帧候选选择器，并让画布节点显示结构名称、来源文件、方法、电荷自旋、能量和轻量结构预览。
- 真实本地文件夹浏览 / directory picker 仍只是 roadmap 里的 Workspace Source 后续能力；当前最小闭环用 native file drop 和 Project Files Panel raw row 覆盖。
- 当前 raw file status overlay 是 Web runtime projection，不是长期 Project Content status schema。
- 无关未跟踪目录 `Ni-fxc/` 未触碰。
