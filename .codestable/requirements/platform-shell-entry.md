---
doc_type: requirement
slug: platform-shell-entry
pitch: 用统一命令入口让 agent、命令行和未来端侧都能操作 RxnFlow 当前轻量核心流程
status: current
last_reviewed: 2026-06-17
implemented_by:
  - core-platform
tags: [platform-shell, cli, agent, multi-platform, engine-ipc]
---

# 用统一命令入口操作当前核心流程

## 用户故事

- 作为一个想让 agent 批量处理计算结果的人，我希望它能用稳定命令做 source preview、候选登记和项目打开/保存，而不是每次都临时拼 Python 调用。
- 作为一个先在终端验证流程的人，我希望不用等完整 UI 做好，也能创建项目、预览导入结果和跑通最小校验。
- 作为一个用 CLI 或 agent 继续项目的人，我希望能打开一个已有项目并恢复已保存的项目内容，而不是只能读 manifest。
- 作为一个准备做 Web 或桌面壳层的开发者，我希望不同端侧复用同一套输入输出形状，而不是每个端都重新定义一遍流程。

## 为什么需要

RxnFlow 当前已经有轻量 engine，可以做 source preview/full-file parse、候选登记、项目校验和项目打开/保存。如果没有统一入口，这些能力只能藏在代码和测试里。agent、命令行、未来 Web 和桌面端各自接入时，很容易重复发明参数格式和错误输出方式。

## 怎么解决

系统提供一层薄命令入口：调用方给出命令名和参数，得到结构化结果、警告和错误。当前命令边界是 `engine.status`、`flow.demo`、`import.preview`（Electron `sourcePath` 输入时具备 full-file parse 语义）、`import.register_selection`、`import.register_all`、`project.validate`、`project.open` 和 `project.save`；桌面壳和未来端侧都按同样的输入输出形状接线。`project.open` / `project.save` 只处理当前轻量工作区文件夹，不要求用户理解内部存储结构。图谱编辑、相对能量显示和报告导出仍主要由 renderer / Electron workbench 承载，不属于当前统一命令入口的主承诺。

## 边界

- 它不负责渲染真实画布、窗口、文件选择器或报告预览。
- 它不负责外部量化计算任务提交；输入文件仍由 Gaussian、ORCA、MAPLE/ASE 等外部程序生成。
- 它不把化学对象、反应图、能量曲线或导出结果完整持久化到项目 manifest；这些内容由工作区文件夹内隐藏 `.rxnflow/project.json` 状态写入并由 `project.open` 恢复。
- 它不决定最终 Web 框架、桌面框架、安装包或发布方式。

## 变更日志

- 2026-06-17：收口为当前轻量 command entry，去掉 project bundle 作为现行边界的表述。
- 2026-06-17：移除“算能量/导出”这类超出当前 command boundary 的旧表述。
