---
doc_type: requirement
slug: platform-shell-entry
pitch: 用统一命令入口让 agent、命令行和未来端侧都能操作 RxnFlow 核心流程
status: current
last_reviewed: 2026-05-14
implemented_by:
  - core-platform
tags: [platform-shell, cli, agent, multi-platform, project-bundle]
---

# 用统一命令入口操作核心流程

## 用户故事

- 作为一个想让 agent 批量处理计算结果的人，我希望它能用稳定命令导入、登记、组图、算能量和导出，而不是每次都临时拼 Python 调用。
- 作为一个先在终端验证流程的人，我希望不用等完整 UI 做好，也能创建项目、预览导入结果和跑通 fixture 导出。
- 作为一个用 CLI 或 agent 继续项目的人，我希望能打开一个已有项目并恢复已保存的项目内容，而不是只能读 manifest。
- 作为一个需要备份或搬运项目的人，我希望 CLI 或 agent 能导出和导入 `.rxnflow.zip` 项目包，而不用直接操作内部目录结构。
- 作为一个准备做 Web 或桌面壳层的开发者，我希望不同端侧复用同一套输入输出形状，而不是每个端都重新定义一遍流程。

## 为什么需要

RxnFlow 的核心能力已经能解析、登记、编辑图谱、计算能量并导出报告，但如果没有统一入口，这些能力只能藏在代码和测试里。agent、命令行、未来 Web 和桌面端各自接入时，很容易重复发明参数格式、错误输出和 artifact 处理方式。

## 怎么解决

系统提供一层薄命令入口：调用方给出命令名和参数，得到结构化结果、警告、错误和导出 artifact 摘要。终端可以先跑项目创建、项目打开、项目包导入/导出、导入预览和 fixture 导出；未来端侧也按同样的输入输出形状接线。`project.open` 默认恢复已保存的 Project Content，并在 `--manifest-only` / `load_content=false` 时只打开 manifest；`project.save_content` 是进程内 shell API，用于把当前 session 的项目内容写回 ProjectContentStore。`project.export_bundle` 和 `project.import_bundle` 负责 `.rxnflow.zip` 项目包传输，不创建或复用 session。

## 边界

- 它不负责渲染真实画布、窗口、文件选择器或报告预览。
- 它不负责外部量化计算任务提交；输入文件仍由 Gaussian、ORCA、MAPLE/ASE 等外部程序生成。
- 它不把化学对象、反应图、能量曲线或导出结果完整持久化到项目 manifest；这些内容通过 Project Content Store 写入 `.rxnflow/state/` 并由 `project.open` 恢复。
- 它不在 CLI 中暴露 `project save-content`，因为当前 CLI 是一次性进程，没有跨命令复用的 session。
- 它不把 project bundle 当作云同步或冲突合并机制；bundle import 第一版只支持 non-overwrite。
- 它不决定最终 Web 框架、桌面框架、安装包或发布方式。

## 变更日志

- 2026-05-14：补充 project open / save content shell 入口和 CLI project open 边界。
- 2026-05-14：补充 project export-bundle / import-bundle shell 与 CLI 入口。
