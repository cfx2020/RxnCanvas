---
doc_type: user-guide
slug: supported-import-formats
component: source-import
status: current
summary: 共享 Python 解析器的格式支持、可信边界和文件大小限制
tags: [import, gaussian, orca, xyz, extxyz, maple, parser]
last_reviewed: 2026-10-02
---

# Supported Import Formats

## 功能简介

桌面与浏览器开发预览均通过 Python 引擎从完整文件中提取结构、能量和计算元数据，用于登记反应图谱节点。Gaussian/ORCA 标准字段由 cclib 提供。RxnFlow 不负责运行 Gaussian、ORCA 或其他量化计算任务。

## 当前支持边界

| 来源 | 当前状态 | 可识别内容 | 注意事项 |
|---|---|---|---|
| Gaussian `.log` / `.out` | 实验性 | 最终/候选结构、SCF 能量、热化学校正、部分频率与振动模式、charge/multiplicity、终止状态 | 多 Link1/多任务文件须检查候选和 warning；测试样例不构成逐版本保证 |
| ORCA `.out` | 实验性 | Cartesian 结构、single-point/total energy、部分溶剂与元数据 | 振动和复杂多任务输出覆盖有限 |
| XYZ | 支持基础格式 | 单帧/多帧坐标、comment 中的显式或约定能量 | 无单位 comment energy 会按 Hartree 处理并显示 warning |
| ASE extxyz | 支持基础格式 | 多帧坐标、energy、charge/spin 等常见 metadata | 非标准自定义字段可能被忽略 |
| MAPLE-style output | 实验性 | 多帧 XYZ/路径点和可识别能量 | `.sum`、AutoNEB tree、MD thermo、IRC path 不作为稳定承诺 |
| CSV / arbitrary text | 非结构化预览 | 文件可暂存并显示 preview | 不保证能够登记化学节点 |

“实验性”表示解析器有自动测试和合成样例，但尚未对所有真实程序版本、任务组合和异常终止形状建立保证。

## 如何使用

1. 在项目工作区中选择 Import Files。
2. 选择计算输出或 XYZ/extxyz 文件。
3. 如果文件包含多个候选结构，在 candidate review 中检查结构、能量和 warning。
4. 只登记符合预期的候选。
5. 在 Source Inspector 中检查 parser、termination、energy unit 和 warning，再用于报告。

## 文件大小限制

- 单个 source 上限为 512 MiB；桌面引擎和浏览器本地上传端点均拒绝超限解析。
- 浏览器上传完整文件，服务端以流写入临时文件，解析完成后删除；缺失原文件或解析失败不会回退到头尾样本。
- 浏览器项目 package 上限为 64MB。
- 单张画布图片上限为 10MB。
- `.rxnflow.zip` 压缩包上限为 2GB；解压后总量上限为 4GB，单条目上限为 1GB。

## 常见问题

Q: 为什么文件能导入但没有生成节点？  
A: 文件可能只被识别为普通文本、超过整文件解析限制，或 parser 没有找到足够可信的结构/能量。检查 Source warning。

Q: 能否直接相信自动识别的能量？  
A: 对重要项目应核对原始输出中的方法、单位、最终结构和热化学校正；尤其注意当前标为实验性的格式。

Q: 为什么只播放一个振动模式？  
A: 当前结构预览默认使用第一个持久化模式；对过渡态通常应确认它是否对应最大虚频。

## 相关功能

- [桌面画布工作台](desktop-canvas-workbench.md)
- [发布范围边界](../dev/release-scope-boundary.md)
