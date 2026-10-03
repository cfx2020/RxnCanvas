---
doc_type: dev-guide
slug: desktop-rebuild-verification
status: current
summary: 当前测试、性能、浏览器和桌面发布验证入口
tags: [desktop, electron, qa, performance]
last_reviewed: 2026-10-02
---

# 工作台验证

命令来自 `web/package.json`、`web/vite.config.ts`、`.github/workflows/desktop-release.yml`。检查当前代码、构建产物和发布 tag 时应记录各自 commit，不能用较早安装包的通过结果替代当前构建。

## 开发验证

在仓库根目录运行：

```bash
python3 -m unittest discover
```

以下命令均在 `web/` 目录分别运行：

```bash
npm ci
npm run test
node --test electron/*.test.cjs
npm run build
npm run desktop:smoke
```

- `npm run test` 运行 Vitest 和 bundle-budget/browser-engine 的 Node 测试。
- `electron/*.test.cjs` 被 Vitest 排除，需要单独运行；release workflow 在 renderer 测试后调用这组测试。它覆盖项目保存、源文件替换、近期项目、启动恢复和引擎进程池等行为。
- `npm run build` 执行 TypeScript、Vite 和 bundle budget 检查。
- `desktop:smoke` 需要已构建 renderer 及可用 Python+cclib 环境，覆盖真实引擎、项目目录、source/checksum 和 ZIP 等链路。开发环境准备方式见[Python 解析开发](python-parser.md)。

## 性能入口

| 在 web/ 执行 | 检查 |
|---|---|
| `npm run perf:parser` | Gaussian/ORCA benchmark，分别检查 p95 ≤ 250 ms |
| `npm run perf:bundle` | 构建及静态首屏 ≤ 1.10 MiB raw，检查重依赖动态加载预算 |
| `npm run perf:e2e` | Chromium：拖动 RAF p95 ≤ 50 ms、长帧 ≤ 2；侧栏 LayoutCount/RecalcStyleCount 各 ≤ 80 |

`perf:e2e` 使用隔离的 Vite 5175 端口，需要已安装 Playwright Chromium。它是性能 smoke，不覆盖完整业务流程。仓库没有 `test:e2e` npm script 或独立 Playwright 测试配置。

## 浏览器和桌面交互

在 `web/` 运行 `npm run dev`，打开 `http://127.0.0.1:5173/`。桌面热更新用 `npm run desktop:dev`。不得用 file URL 打开 Vite 源码入口。

按修改范围检查下列真实流程，并覆盖桌面与窄屏布局：

1. 创建/打开工作区，导入计算文件，检查候选、失败提示、gas/sol 分组、搜索筛选及文件拖入画布。
2. 多画布切换、重命名和关闭/重开，确认文件共享、画布图元/视口独立；退出重开后恢复保存内容。
3. 节点拖动、框选、连接锚点、能垒、文字/图片、复制粘贴、撤销重做。普通 wheel 向下滚时内容向上移动，Ctrl/Meta wheel 以指针缩放。
4. 通过节点上下文菜单设置系数和零点；工具条切换 ΔEgas/ΔGsol，Settings 切换输出单位。对照 Inspector 表达式、Absolute/Relative 表格与原始数据。
5. 打开结构对话框，编辑/重置 2D，检查 3D 原子选择、几何量测和振动播放；无可用位移时不能伪造动画。
6. 导出 PNG/CDXML/XLSX，检查长标签、结构、能量和导出路径；需要验证格式互操作时用目标应用打开产物。
7. 桌面项目自动保存、重新打开、ZIP 导入导出、源副本变动后刷新及失败提示；从侧栏移除项目应保留磁盘目录。
8. 检查侧栏、工具条、表格、Inspector、对话框的滚动和焦点，确认菜单/输入框不会误触发画布快捷键。

## 打包验证

以下命令在 `web/` 运行。`desktop:pack` 明确构建 macOS unpacked app，Windows 使用独立命令。

| 环境 | 命令顺序 |
|---|---|
| macOS | `npm run desktop:pack` → `npm run desktop:runtime:smoke` → `npm run desktop:release:smoke` |
| Windows | `npm run desktop:pack:win` → `npm run desktop:runtime:smoke` → `npm run desktop:dist:win` → `npm run desktop:installer:smoke:win` → `npm run desktop:release:smoke` |

`desktop:runtime:smoke` 启动当前平台已打包的应用，验证 renderer、preload、bundled engine 和恢复流程。Windows installer smoke 在 Windows 上执行隔离目录安装/启动/卸载，在其他系统仅跳过。release smoke 检查配置、图标及已有产物结构；它不证明签名、公证或真实用户机器兼容性。

## CI 与发布证据

当前 workflow 包含 Python/renderer/Electron 回归测试、parser/bundle/browser 性能检查、Electron smoke、macOS runtime、Windows runtime/installer。CI 和本地均用 `npm audit` 检查完整依赖树，包括 devDependencies：Electron、React、Ketcher 等实际随应用分发的组件列在其中，不能用 `--omit=dev` 排除。Python lock 审计按 workflow 的 pip-audit 命令执行。

2026-09-19（北京时间）发布的 [beta.12 CI](https://github.com/cfx2020/rxnflow/actions/runs/35374384687) 已通过 Windows 安装/启动/卸载及 macOS Beta 运行，Apple 签名公证 job 当次跳过。该 run 基于 `5cc635e`，不能证明后续提交或后来新增的 CI 步骤已通过。

Beta tag 工作流合并两端 EXE/DMG/ZIP，生成 SHA-256 与 release manifest，发布 GitHub Pre-release。手动 `notarize_macos` job 使用 Apple 凭证构建、notarize、staple 并检查 Gatekeeper；自动正式版 tag 发布尚未配置。详见[发布范围](release-scope-boundary.md)与[macOS Beta 安装](../user/macos-unsigned-beta.md)。

## 文档校验

Markdown frontmatter：`python3 .codestable/tools/validate-yaml.py --file <document.md>`。
纯 YAML 文件：同一命令加 `--yaml-only`；不要把这个参数用于 Markdown。
