---
doc_type: user-guide
slug: project-bundle-backup
component: project-bundle-import-export
status: current
summary: 如何导出和导入 RxnFlow .rxnflow.zip 项目备份包
tags: [project, backup, cli, bundle]
last_reviewed: 2026-05-14
---

# 导出和导入项目备份包

## 功能简介

RxnFlow 可以把项目导出成 `.rxnflow.zip` 包，方便你自己备份或搬到另一处再导入。这个包不是云同步；如果浏览器或本地目录被清理，仍然需要你自己保管导出的 zip。

## 导出项目

```bash
python3 -m rxnflow.cli project export-bundle --json \
  --project-path /path/to/project.rxnflow \
  --destination-path /path/to/project.rxnflow.zip
```

导出包只包含：

- `.rxnflow/`
- `inputs/raw/`
- `exports/`

项目根目录下额外放的 notes、脚本或临时文件不会进入 zip。

## 导入项目

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

## 导入后打开项目

导入只负责把项目文件放到目标目录，不会自动打开 session。继续查看项目内容时，再执行：

```bash
python3 -m rxnflow.cli project open --json --project-path /path/to/projects/<bundle-root>
```

## 常见问题

Q: 导出前需要保存吗？

A: 如果你在同一个 Platform Shell 进程里刚编辑过项目，需要先调用 `project.save_content`。CLI 当前没有跨命令 session，所以 CLI 只导出现有项目目录里的文件。

Q: 为什么导入失败并提示 `project_content_invalid`？

A: bundle 中的 `.rxnflow/state/` 内容校验失败，可能是 state 文件损坏、checksum 不一致或引用断裂。RxnFlow 不会部分导入损坏内容。

Q: 可以覆盖已有项目吗？

A: 第一版不支持覆盖、自动改名或合并。请换一个空的目标目录，或先手动处理已有项目。
