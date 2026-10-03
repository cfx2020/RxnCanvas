# AGENTS.md

本文件是 AI 协作的项目级硬约束入口。所有 CodeStable 子工作流和代码修改默认遵守本文件。

## 项目定位

- RxnFlow 是面向计算化学结果的反应路径登记、图谱组装与可视化报告生成应用。
- 核心产品形态是计算化学领域的图谱编辑器，不是量化计算任务调度器。
- 原始计算输出由外部程序生成；本项目负责导入、解析、登记、编辑、计算路径能量、可视化和导出。

## 架构约束

- 当前项目尚未发布正式版，不需要考虑旧版本、旧 UI、旧数据或旧设计的兼容性；以用户最新表述为准，必要时可以直接做破坏性更改、删除旧实现或重构既有方案。
- 优先保持领域核心、平台壳层、UI、导入解析、导出报告之间解耦。
- 领域核心不得依赖具体 UI 框架、桌面运行时或部署平台。
- Web、macOS app、Windows exe、Linux CLI 等端侧能力应通过薄壳层适配共享核心能力。
- 解析器按插件化方向设计，避免把 Gaussian、ORCA、MAPLE/ASE 等格式逻辑混在同一个大函数里。
- 图谱编辑状态、化学对象登记、能量计算和报告导出应使用明确的数据结构与接口契约，方便 agent 和测试直接操作。
- 当前技术栈为 React + TypeScript + Vite + npm、Electron 桌面壳与 Python/cclib 引擎；保持 UI、壳层和解析边界清晰。

## 代码规范

- 新增代码应优先选择小而清晰的模块边界，每个模块只承担一种主要职责。
- 共享数据结构需要有稳定命名和清晰字段含义，避免用松散字典在模块间传递关键领域数据。
- 计算化学数值处理必须显式记录单位、能量基准和校正项来源。
- 解析器和能量计算逻辑应可用无 UI 的单元测试验证。
- 涉及文件格式读写时，优先使用结构化解析/生成方式，不用脆弱的字符串拼接模拟格式。

## CodeStable 使用规则

- 新功能、大需求拆解、bug 修复、重构和知识沉淀优先走 `.codestable/` 下对应流程。
- `.codestable/architecture/` 只记录已落地现状；未落地的方案规划放在 `.codestable/roadmap/`。
- 用户确认的新 roadmap 接口契约约束对应 feature；已完成记录不构成新的待办。当前功能和测试入口先查 `.codestable/architecture/` 与 `docs/dev/desktop-rebuild-verification.md`，再核对代码。
- 文档只能将代码已有能力写为现状；过时规划、已删除模块和未采用方案不能推导为“尚待恢复”的需求。
- 发现值得长期保留的选型、踩坑、模式或调研结论时，提示用户是否沉淀到 `.codestable/compound/`。

## 禁止事项

- 不要把外部量化计算软件的任务调度当作 RxnFlow 初始范围来实现。
- 不要在没有用户确认的情况下删除、移动或重写已有文档和规格文件。
- 不要为了演示 UI 而把领域数据模型写死在组件内部。
- 不要在未明确范围时一次性实现完整大系统；先拆 roadmap，再逐条 feature 推进。
- 不要未经用户明确要求提交 git commit、创建分支或推送远端。

## UI 验证要求

- 涉及前端视觉、画布交互、图谱编辑或报告预览的改动，必须在浏览器或目标端里验证。
- 画布、表格、曲线和导出预览必须检查桌面与窄屏布局，避免文字和控件重叠。
- 图谱编辑器类界面优先服务高频编辑和信息扫描，不做营销式落地页布局。
- Web 工作台开发预览必须从 `web/` 目录运行 `npm run dev`，再打开 `http://127.0.0.1:5173/`；不要直接用 `file://.../web/index.html` 预览 Vite/React 源码入口。

## 常用验证命令

- 运行当前 Python 单元测试：`python3 -m unittest discover`
- 运行 Web 工作台开发服务：`cd web && npm run dev`
- 运行 Web 前端测试：`cd web && npm run test`
- 运行 Web 前端构建：`cd web && npm run build`
- 运行 Electron 回归测试：`cd web && node --test electron/*.test.cjs`（不包含在 `npm run test` 中）
- 校验 Markdown frontmatter：`python3 .codestable/tools/validate-yaml.py --file <path.md>`
- 校验纯 YAML：`python3 .codestable/tools/validate-yaml.py --file <path.yaml> --yaml-only`

## 当前实现与文档入口

- 工作台：React + TypeScript + Vite + npm；macOS/Windows：Electron；解析：Python+cclib。浏览器开发服务与桌面端使用同一 Python 引擎。
- 项目主格式：工作区文件夹内 `.rxnflow/project.json`、`.rxnflow/manifest.json`、`sources/`、`exports/`；支持 `.rxnflow.zip` 导入导出。
- 导出：renderer 生成 PNG/CDXML/XLSX，CDXML 包含 Ketcher 结构片段和项目组合逻辑。
- 支持格式与可信边界：`docs/user/supported-import-formats.md`。
- 架构：`.codestable/architecture/ARCHITECTURE.md`；发布验证：`docs/dev/desktop-rebuild-verification.md`。
