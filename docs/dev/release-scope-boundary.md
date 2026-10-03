---
doc_type: dev-guide
slug: release-scope-boundary
status: current
summary: 当前代码提供的功能、运行环境及发布证据边界
tags: [release, desktop, scope]
last_reviewed: 2026-10-02
---

# 当前功能与发布范围

RxnFlow 是本地优先的计算化学反应图谱编辑器。当前实现是 React/TypeScript/Vite + Electron + Python/cclib，版本为 `0.1.0`。本文列出现有能力，不作为新功能待办。

## 已有能力

| 范围 | 当前实现 |
|---|---|
| 项目 | 创建/打开工作区文件夹，自动保存，最近项目和启动恢复，从侧栏移除项目引用，ZIP 导入导出 |
| 文件 | Gaussian、ORCA、XYZ/extxyz、MAPLE 文本导入；候选选择；文件搜索/筛选/排序；gas/sol 分组；桌面源副本、checksum 和重新解析 |
| 多画布 | 新建、切换、重命名、关闭/重新打开、删除，保存全部画布与活动画布 |
| 图谱编辑 | 节点、反应边、显式步骤语义、能垒、文字/图片标注、拖拽、框选、复制粘贴、撤销重做、平移缩放、小地图、自动布局 |
| 能量 | ΔEgas/ΔGsol、零点、系数、加入/释放物种表达式、Absolute/Relative 能量表、输出单位设置 |
| 结构 | 受控 2D 预览，Ketcher 编辑 KET/Molfile/CDXML，3Dmol 坐标查看、默认模式振动、原子编号及几何量测 |
| 报告 | PNG、CDXML、XLSX；浏览器下载或桌面保存到项目 exports，并记录清单 |
| 桌面偏好 | 系统/浅色/深色外观、能量单位、Gaussian/Text 外部打开应用、侧栏与工具条布局 |

代码入口：`web/src/app/App.tsx`、`ProjectRail.tsx`、`CanvasWorkspace.tsx`、`energyDisplay.ts`、`web/src/domain/projectPackages.ts`、`reportExports.ts`、`web/electron/main.cjs`、`project-store.cjs`、`rxnflow/engine.py`。

## 运行环境

- 桌面端由 Electron 提供本地文件读写和 Python 进程管理；安装包内含解析引擎，用户无需安装 Python。
- 浏览器开发预览通过 Vite 同源 loopback 接口把完整文件交给 Python 解析。浏览器不创建桌面 sources 目录；单独静态托管 dist 不具备解析服务。
- source/节点/候选及轻量 importLedger 构成当前来源关联；相对能量和报告在 renderer 的模块中计算/生成。
- 格式支持强度以[支持格式](../user/supported-import-formats.md)为准，代码中的字段或测试 fixture 不代表已验证所有程序版本。

## 发布状态

截至 2026-10-02，最近已发布版本为私有仓库的 [v0.1.0-beta.12](https://github.com/cfx2020/rxnflow/releases/tag/v0.1.0-beta.12)。其 [CI run](https://github.com/cfx2020/rxnflow/actions/runs/35374384687) 验证了 macOS 打包运行和 Windows NSIS 安装、启动、卸载；下载提供 macOS arm64 DMG/ZIP、Windows x64 setup/portable、统一 SHA-256 与 manifest。

该 macOS Beta 使用 ad-hoc 签名，未取得 Developer ID 公证证据。工作流支持手动签名/公证构建，自动发布入口处理 `v*-beta.*` tag。这些是当前发布渠道的事实，不能推断为任意新提交已经完成打包验收。

验证入口及覆盖限制见[验证指南](desktop-rebuild-verification.md)。
