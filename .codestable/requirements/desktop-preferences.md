---
doc_type: requirement
slug: desktop-preferences
pitch: 在桌面端保存自己的外部打开方式、能量单位和外观偏好
status: current
last_reviewed: 2026-06-26
implemented_by: [web-workbench]
tags: [desktop, preferences, settings, external-apps, theme, energy-unit]
---

# 设置桌面端偏好

## 用户故事

- 作为一个常用 GaussView 检查 Gaussian log 的用户，我希望点 source 的外部打开按钮就用 GaussView，而不是被系统默认文本编辑器打开。
- 作为一个经常看 ORCA / MAPLE 输出的人，我希望它们默认用我指定的文本编辑器打开，而不是每次都重新选择软件。
- 作为一个在浅色 / 深色环境之间切换的人，我希望 RxnFlow 可以跟随系统外观，也可以固定为深色或浅色。
- 作为一个只想按 kcal 看相对能量的人，我希望默认单位就是 kcal，并能在设置里改，而不是把单位切换挤在画布悬浮工具条上。
- 作为一个刚装好 RxnFlow 的用户，我希望没设置过软件路径时，第一次点击打开能引导我选择，之后自动记住。

## 为什么需要

RxnFlow 已经把导入的 source 文件复制到项目文件夹，节点面板里也有外部打开按钮。但不同计算输出更适合不同软件：Gaussian log 通常要进 GaussView，ORCA 和 MAPLE 输出更多时候只是文本查看。系统默认打开方式经常不对，用户还得去 Finder/Explorer 里找文件、再手动“打开方式”，工作流会被打断。

## 怎么解决

桌面端提供一个轻量设置入口，保存用户自己的打开方式、能量单位和外观偏好。source 按钮会根据文件类型选择对应软件；如果没有用户设置，就先尝试常见安装路径，找不到再弹窗让用户选择，并把这次选择记住。外观偏好可以在跟随系统、深色、浅色之间切换；能量显示默认使用 kcal，也可以在设置里改。

## 边界

- 它只管理 RxnFlow 自己的偏好，不修改系统默认打开方式。
- 它不内置或安装 GaussView、记事本、TextEdit 或其他外部软件；用户机器上没有时只负责提示选择。
- 它不把用户本机软件路径写进项目文件，项目分享给别人不会携带个人偏好。
- 它不做通用插件市场或任意命令脚本执行；只保存用户选择的应用路径并用来打开 source 文件。
- 它不改变导入文件里原始能量的单位和数值，只改变画布、表格、节点卡上的显示单位。

## 变更日志

- 2026-06-26：通过 `2026-06-26-desktop-preferences-source-openers` 落地；桌面偏好加入外观三态、能量单位、Gaussian/Text source opener，Source 外部打开使用本机 userData 偏好，工具栏删除/单位与节点更多操作迁移到 Settings/右键菜单。
