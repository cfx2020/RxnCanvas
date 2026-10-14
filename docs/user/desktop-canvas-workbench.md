---
doc_type: user-guide
slug: desktop-canvas-workbench
status: current
summary: 当前桌面工作台的项目、导入、图谱编辑和导出操作
tags: [desktop, canvas, local-first]
last_reviewed: 2026-10-02
---

# 使用 RxnCanvas 工作台

RxnCanvas 用于把已有计算输出整理成反应图谱和报告。

## 项目与文件

从工作区动作入口创建新项目文件夹或选择 `Use existing folder`。桌面项目保存在用户选择的目录，编辑自动保存；最近项目和启动恢复可重新打开已有工作区。`Remove from sidebar` 只移除列表引用，保留磁盘文件夹。

通过导入入口、项目菜单或文件拖放导入 Gaussian、ORCA、XYZ/extxyz、MAPLE 文本。桌面端复制完整文件到项目 sources，再交给 Python 解析；导入中显示进度，多个候选结构需要选择后登记。解析失败会显示问题，不会用不完整预览替代原文件。格式边界见[支持格式](supported-import-formats.md)。

Files 区支持搜索、筛选、排序、单选、多选和范围选择。匹配的 gas/sol 文件成组显示；把文件组拖到画布可在落点创建节点。桌面工作区会检查源副本是否改变，需要时重新解析。

## 多画布与编辑

同一项目可以创建多个画布，支持切换、重命名、关闭/重新打开和删除。文件列表由项目共享，图谱、标注、视口和选择属于各自画布。

使用选择工具框选节点，平移工具或普通滚轮移动画布。向下滚时画布内容向上移动；Ctrl/Meta 滚轮或触控板缩放手势以指针为中心缩放。小地图和 Fit view 用于定位图谱。

节点可拖动、复制粘贴和通过上下文菜单改名、设置零点及系数。使用连接锚点表达路径、加入和释放物种；能垒连接用于显示能量差。文字工具和图片插入可添加画布标注。

撤销/重做支持常见编辑。删除选择使用上下文菜单或 Delete/Backspace；在输入框里按快捷键不会删除画布内容。`Cmd/Ctrl+K` 打开命令面板，可搜索已有工具、视图和项目动作。

## 能量、结构与设置

工具条在 ΔEgas 与 ΔGsol 之间切换；Settings 中选择输出单位和系统/浅色/深色外观。零点、系数以及显式反应步骤共同决定相对能量，Inspector 显示相应表达式。

Table view 提供 Absolute/Relative 表格，包含可用的 Egas、Ggas、Ggas+1M、Esol、Gsol、basis count 等；没有解析结果的字段显示缺失值。

选择节点后用 `Open structure` 检查结构。2D 可用 Ketcher 编辑或重置；3D 支持旋转查看、原子编号、键长/键角/二面角量测，以及有位移数据时播放默认振动模式。过渡态应核对所播放模式与原始计算结果一致。

Settings 可指定 Gaussian 文件与其他文本 source 的外部打开应用。路径保存在本机，不随项目分享。

## 保存、分享与报告

桌面工作区包含 `.rxncanvas/project.json`、`.rxncanvas/manifest.json`、`sources/` 和 `exports/`。项目状态、来源和导出物随工作区保存。

导出项目 ZIP 可用于分享或换机；打开 `.rxncanvas.zip` 会在压缩包旁创建新的工作区并恢复内容。导入前后可核对文件、画布和能量；遇到缺失文件或校验警告时先检查来源。

报告支持 PNG、CDXML 和 XLSX。PNG/CDXML 表达反应能量图；XLSX 包含绝对/相对能量表、导入文件和元数据。桌面项目导出会记录保存位置和 exports 清单，CDXML 可在 ChemDraw 中继续编辑。

## 浏览器开发预览

在仓库 `web/` 运行 `npm run dev`，打开 `http://127.0.0.1:5173/`。浏览器将完整 File bytes 交给本机 Python 服务解析，保留结构化项目结果，但不创建桌面 sources 目录，也不能按本地绝对路径重新打开原文件。首次准备 Python 依赖需要网络，详见[开发指南](../dev/python-parser.md)。
