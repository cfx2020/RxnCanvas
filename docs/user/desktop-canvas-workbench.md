---
doc_type: user-guide
slug: desktop-canvas-workbench
status: current
summary: 当前 RxnFlow 桌面多画布工作台的可用功能和边界
tags: [desktop, canvas, multi-canvas, local-first, electron]
last_reviewed: 2026-07-10
---

# Desktop Canvas Workbench

RxnFlow 当前是本地优先的反应路径多画布工作台。第一屏就是可编辑工作台，不是网页 landing page。

## 当前可用

1. 在左侧 Project Rail 新建、打开、切换或从本地项目列表删除项目。`New Project Folder` 会先展开项目名表单，桌面端确认后在用户选择的父目录下创建真实工作区文件夹；`Open Folder` 在 Electron 桌面端调用本地工作区文件夹打开入口，在浏览器开发预览中可选择 `.rxnflow.json` project package 做 UI 验证；项目行的 `Project actions` 提供 `Import files into project` 和 `Delete project`，也可以把本地计算文件直接 drop 到项目行导入到该项目；删除前需要确认，只移除当前 renderer 本地项目列表中的项目，不删除磁盘文件；项目切换会恢复该本地项目自己的 source 文件、画布标签、当前 active 画布、画布节点、选择和视口状态，不把上一项目的画布内容混到当前项目里。
2. 使用 `Import`、项目行 `Import files into project` 或桌面端 `File > Import Files` 导入本地计算输出文件。当前会读取文本 preview，并对 Gaussian / ORCA（含常见 Cartesian coordinate、charge/spin 摘要、`FINAL SINGLE POINT ENERGY` 与 `TOTAL SCF ENERGY`/`Total Energy` 形状）/ MAPLE（含多帧 XYZ 无单位 Hartree energy comment）/ 普通 XYZ comment energy（无单位按 Hartree、显式 Hartree/Ha 保留、eV 转 Hartree）/ ASE extxyz metadata（label、charge/spin、eV energy 转 Hartree）做轻量解析；Electron 桌面端优先通过本地 engine 解析和登记候选，打包应用在外部 Python engine 不可用时会自动使用内置 lightweight engine，浏览器预览使用 renderer fallback。单候选文件会在目标项目画布中创建 parsed source node；无法识别的文件仍保留为 staged source node；形状错误但可识别为 XYZ 的文件会显示 `parse_failed` warning，而不是归为未知格式。多帧 XYZ/MAPLE/extxyz preview 会打开候选选择面板，可登记选中候选或全部候选。Project Rail 的文件行支持单选、Meta/Ctrl 多选、Shift 范围选择、拖拽 raw-file payload，以及从当前项目移除 source 文件行；匹配的 gas/solution log 会显示为一个结构行并作为一组 source 拖拽，未成对的单文件仍显示原始文件名；这些文件行操作不会隐式新增画布节点。把 Project Rail source 文件行或外部计算文件拖到画布时，会在 drop 的 graph-space 位置创建对应 source node 或候选登记面板。
3. 使用工作区顶部的 Canvas Tab Bar 管理同一项目里的多个画布。默认项目至少有一个 `画布 1`；点击带 `+` 图标的 `New canvas` 按钮会新建空白画布并切换过去。每个画布有自己的节点、edge、barrier、视口和画布选择；左侧 source 文件列表仍是项目级共享资源，不会因为切换画布而复制一份。桌面端自动保存、`Open Folder`、Open Recent 和启动恢复都会恢复项目里的全部画布，以及关闭前最后停留的 active canvas。
4. 在中间画布拖动节点、用 Select tool 在空白画布拖出框选、用 Pan tool 或普通滚轮/触控板平移画布、用 pinch-style 或 Ctrl/Meta+wheel 缩放，并用小地图拖拽导航、右下角缩放控件适配当前视图。节点拖动中会连续跟随指针，松手后再吸附到 8px 网格。节点、edge、barrier 支持 Shift 多选/反选；画布聚焦后可用 Delete/Backspace 删除当前选择、Escape 清空选择、方向键按 20px 微调已选节点，Cmd/Ctrl+Z 与 Cmd+Shift+Z/Ctrl+Y 可撤销/重做画布编辑；这些快捷键不会在输入框里触发。节点卡上的结构预览可折叠/展开，`×1` 系数可直接点击编辑，用于记录当前结构的化学计量系数。
5. 从节点右侧连接点拖到另一个节点，可以创建 reaction edge；如果拖拽 release 落在 window 但指针下仍命中目标节点，也会完成 edge，落在空白处则清掉临时连线。也可以用键盘聚焦连接点后按 Enter/Space，再聚焦目标节点按 Enter/Space 创建 edge。点击 edge 可在右侧 Inspector 查看来源、目标并编辑 edge label。节点底部 barrier 手柄可拖到另一个节点创建显式能垒标注；标注会显示自动 `ΔE‡`/`ΔG‡` 标签，并支持画布内联改名、选中和 Delete selection 删除。
6. 悬浮工具条支持旧 UI 已承载的画布编辑命令：Undo、Redo、Delete selection、Auto layout 和 Fit view；同时提供画布级 `Energy`/`Unit` 快速切换。当前 lightweight 表格真实承载 `Egas` 和 `Gsol` 两种能量源，Unit 支持 hartree、kcal/mol 和 kJ/mol。Delete selection 会按当前多选集合删除节点、edge 或 barrier，并级联移除被删节点相关的 edge/barrier。节点卡会显示当前 Energy/Unit 选项下的相对能量，并可直接把该节点设为相对能量 zero point；Auto layout 使用当前 Energy/Unit 能量源和 zero point 做轻量能量排序布局，不调用旧后端 `energy.compute`。
7. 切换到 Table view 查看结构、类型、formula、gas/solution energy 和相对值。
8. 右侧 Inspector 可查看 selected node、selected edge、source preview 和 Export。节点卡的 More actions 菜单可直接打开该节点的 Source details；Selected edge 面板支持修改 edge label；节点卡和 Node 面板里的 `Structure Preview` 会从真实坐标或 Molfile 生成受控的 ChemDraw-like 2D 骨架图。Node 面板提供 `Edit 2D`，Ketcher 编辑后保存 KET/Molfile/CDXML canonical 数据并重新生成预览，不保存第三方 SVG；`Reset 2D` 可恢复自动推断。`3D Structure` 会打开 3Dmol.js ball-stick 查看器；存在频率数据时可立即播放第一个振动模式。
9. Export 当前可导出原 UI 默认承载的 PNG、CDXML、XLSX 报告 artifact；PNG 是当前图谱报表图，CDXML 表达节点/边/能量元数据，XLSX 包含能量表、导入文件表和导出元数据。Electron 桌面端导出后会在 Export summary 中显示保存位置；打开工作区文件夹时会显示项目内 `exports/...` artifact 路径。
10. Electron 桌面端可通过 Project Rail 的 `New Project Folder` 创建真实工作区文件夹，通过 `Open Folder` 或菜单 `File > Open RxnFlow Project Folder` 打开本地工作区；同一入口也可以选择 `.rxnflow.zip`，应用会在压缩包旁创建新的工作区并恢复项目。`File > Export RxnFlow Project Zip` 可导出分享/迁移压缩包。旧 `.rxnflow.json` package 仍可读取但不是主入口。工作区包含 `.rxnflow/project.json`、`.rxnflow/manifest.json`、`sources/` 导入 source 副本和 `exports/manifest.json`，并为 source/export 文件记录 size 与 `sha256`；打开项目时会校验基础引用、数值形状、文件缺失和 checksum。打开或创建过的工作区会进入 `File > Open Recent`。
11. Electron 桌面端会自动探测本地 engine；右上角显示 `Local engine` 表示 IPC 可用。打包应用包含 bundled Python+cclib engine，因此不要求用户手动安装或启动 Python/local bridge。浏览器开发预览显示 `Browser preview`。

## 当前不提供

- 不提供旧 ShellClient `energy.compute` 后端命令面板、EnergyProfilePanel、Object Registry / Objects tab、correction 表单、完整 correction policy engine 或旧 ChemicalRegistry service；当前只有 renderer-side 相对能量显示。
- 当前节点卡/Inspector 的 2D 结构预览由项目代码基于坐标或 Molfile 生成；Ketcher 保存 KET/Molfile/CDXML，不保存外部 SVG。当前仍不支持 2D/3D 原子联动选择或 atom-map 工作流。`3D Structure` 支持真实坐标、振动播放和键长/键角/二面角量测，但不提供轨迹、表面或电荷密度等高级 viewer 功能。
- 不要求用户手动启动 Python、local HTTP bridge 或 ShellClient。
- 不提供账号、云同步、多人协作或后台目录监听。
- CSV/SVG/PDF/PPTX/CDX 导出、旧 Python ReportExportService、完整 Gaussian/ORCA/MAPLE/XYZ parser engine、旧 Chemical Registry/完整持久化 import registry workflow、Project Content 深校验/migration/content index、完整 artifact cleanup/repair、完整 energy/correction backend 仍在 roadmap 中。

## 开发预览

从仓库 `web/` 目录启动：

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:5173/
```

不要直接用 `file://.../web/index.html` 打开 Vite/React 源码入口。
