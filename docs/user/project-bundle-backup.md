---
doc_type: user-guide
slug: project-bundle-backup
component: project-bundle-import-export
status: current
summary: RxnFlow .rxnflow.zip 项目备份包的内部/CLI边界
tags: [project, backup, web-workbench, cli, bundle]
last_reviewed: 2026-06-05
---

# 项目备份包边界

## 功能简介

RxnFlow core/CLI 仍保留 `.rxnflow.zip` 项目包能力，用于内部测试、CLI 备份和后续可携带性方案参考。当前 Web 工作台主流程已经改为 `Save Project` 保存当前 browser-local project，左侧不再暴露 Import Bundle / Export Bundle 作为默认用户入口。

项目包不是云同步，也不是实时保存；如果浏览器数据或本地目录被清理，仍然需要你自己保管导出的 zip。后续如重新开放 Web 项目分享，会以新的产品入口和提示重新设计。

项目包只包含：

- `.rxnflow/`
- `inputs/raw/`
- `exports/`

项目根目录下额外放的 notes、脚本或临时文件不会进入 zip。Web 版也不会把云端账号、浏览器外文件、live session 或未保存的 bridge 改动写进 zip。

## Web 工作台当前口径

- 保存当前编辑态项目：点击左侧 `Save Project`。
- 继续处理已经导入的 raw 文件：在左侧 Project Files 点击 `Add to canvas` 或把 raw 文件拖到画布。
- 导出 PNG/CDXML/XLSX/CSV/SVG：使用右侧 Export 面板。
- `.rxnflow.zip` 导入/导出不再是 Web 左侧主流程入口。

## CLI 导出

```bash
python3 -m rxnflow.cli project export-bundle --json \
  --project-path /path/to/project.rxnflow \
  --destination-path /path/to/project.rxnflow.zip
```

## CLI 导入

```bash
python3 -m rxnflow.cli project import-bundle --json \
  --bundle-path /path/to/project.rxnflow.zip \
  --destination-dir /path/to/projects
```

导入后会创建：

```text
/path/to/projects/<bundle-root>/
```

如果这个目录已经存在，导入会失败，不会覆盖旧项目。

## CLI 导入后打开项目

导入只负责把项目文件放到目标目录，不会自动打开 session。继续查看项目内容时，再执行：

```bash
python3 -m rxnflow.cli project open --json --project-path /path/to/projects/<bundle-root>
```

## 常见问题

Q: Web 工作台现在还能直接导入/导出 `.rxnflow.zip` 吗？

A: 当前左侧主流程不暴露 Import Bundle / Export Bundle。项目状态先通过 `Save Project` 保存，报告文件走右侧 Export 面板。项目包能力仍作为内部/CLI能力保留。

Q: CLI 导出前需要保存吗？

A: Platform Shell 集成中需要先调用 `project.save_content`。CLI 当前没有跨命令 session，所以 CLI 只导出现有项目目录里的文件。

Q: Web 导入失败并显示 `invalid_bundle` 或 `zip_failed` 怎么办？

A: 这个 zip 不是安全的 RxnFlow 项目包，常见原因包括不是 zip、缺少 `.rxnflow/manifest.json`、包含多个根目录、包含 `../` 路径或包含 allowed roots 之外的文件。请重新导出项目包，不要手工改 zip 内部路径。

Q: 为什么导入失败并提示 `project_content_invalid`？

A: CLI / 核心导入会深度校验 bundle 中的 `.rxnflow/state/` 内容。这个错误表示 state 文件损坏、checksum 不一致或引用断裂。RxnFlow 不会部分导入损坏内容。

Q: 可以覆盖已有项目吗？

A: 第一版不支持覆盖、自动改名或合并。Web 导入会创建新的 browser-local project；CLI 导入要求目标目录不存在。

Q: 网页版需要购买云存储才能持久保存吗？

A: 不需要。当前 Web 工作台使用浏览器本地仓储保存项目内容；但它不是可靠云备份。长期保留或换设备时，请导出 `.rxnflow.zip` 并自行保管。

## 相关功能

- Web 工作台主流程验收：`docs/user/workspace-first-workbench.md`
- 报告导出格式和边界：`docs/user/report-export-artifacts.md`
- 打开并恢复项目内容：`docs/user/open-project-content.md`
