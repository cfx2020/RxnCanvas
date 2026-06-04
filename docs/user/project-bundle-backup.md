---
doc_type: user-guide
slug: project-bundle-backup
component: project-bundle-import-export
status: current
summary: 如何在 Web 工作台或 CLI 中导出和导入 RxnFlow .rxnflow.zip 项目备份包
tags: [project, backup, web-workbench, cli, bundle]
last_reviewed: 2026-06-05
---

# 导出和导入项目备份包

## 功能简介

RxnFlow 可以把项目导出成 `.rxnflow.zip` 包，方便你自己备份或搬到另一处再导入。这个包不是云同步，也不是实时保存；如果浏览器数据或本地目录被清理，仍然需要你自己保管导出的 zip。

项目包只包含：

- `.rxnflow/`
- `inputs/raw/`
- `exports/`

项目根目录下额外放的 notes、脚本或临时文件不会进入 zip。Web 版也不会把云端账号、浏览器外文件、live session 或未保存的 bridge 改动写进 zip。

## Web 工作台导出

1. 在左侧 Project Sidebar 新建或打开 browser-local project。
2. 如果刚通过 `Open Bridge` 做过图谱、workspace、profile 或 export index 改动，先点击 `Save Bridge`。
3. 点击 `Export Bundle`。
4. 看到 `Bundle ready` 后，浏览器会下载 `.rxnflow.zip`。

`Export Bundle` 读取的是当前浏览器本地仓储中的 bytes。它不会自动调用 `Save Bridge`，也不会临时生成缺失的报告文件。

## Web 工作台导入

1. 点击 Project Sidebar 中的 `Import Bundle`。
2. 选择一个 `.rxnflow.zip` 文件。
3. 看到 `Bundle imported` 后，左侧 active project 会指向新创建的 browser-local project。
4. 如果要恢复图谱、workspace、能量 profile 或导出索引到当前 shell session，继续点击 `Open Bridge`。

Web 导入第一版总是创建新的 browser-local project，不覆盖、不合并当前项目，也不自动 `Open Bridge`。

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

Q: 导出前需要保存吗？

A: Web 工作台里，如果已经 `Open Bridge` 并做过改动，导出前先点 `Save Bridge`。Platform Shell 集成中需要先调用 `project.save_content`。CLI 当前没有跨命令 session，所以 CLI 只导出现有项目目录里的文件。

Q: Web 导入后为什么右下/中间面板还没有恢复图谱？

A: `Import Bundle` 只把 bundle 写入浏览器本地项目仓储。继续点击 `Open Bridge` 才会把 `.rxnflow/state/` 中的 Project Content 恢复到当前 shell session。

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
