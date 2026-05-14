---
doc_type: dev-guide
slug: project-bundle-import-export
component: project-bundle-import-export
status: current
summary: 如何通过 Platform Shell 或 CLI 导入导出 RxnFlow .rxnflow.zip 项目包
tags: [project-bundle, platform-shell, cli, persistence]
last_reviewed: 2026-05-14
---

# Project Bundle Import Export

## 概述

Project Bundle 是 `.rxnflow.zip` 项目包，用于本地备份和早期 Web 无云同步。它是传输格式，不是 live storage：导出前如需保存当前运行态 session，调用方应先在同一进程中执行 `project.save_content`。

bundle 内部结构固定为：

```text
<project-name>.rxnflow.zip
└── <bundle-root>/
    ├── .rxnflow/
    ├── inputs/raw/
    └── exports/
```

第一版只打包 `.rxnflow/`、`inputs/raw/` 和 `exports/`。项目根目录中的 notes、临时脚本或其他散落文件不会进入 bundle。

## Platform Shell

```python
from rxnflow.platform import PlatformShellService, ShellCommand

service = PlatformShellService()

exported = service.run(
    ShellCommand(
        "project.export_bundle",
        {
            "project_path": "/path/to/project.rxnflow",
            "destination_path": "/tmp/project.rxnflow.zip",
        },
    )
)
assert exported.ok, exported.error

imported = service.run(
    ShellCommand(
        "project.import_bundle",
        {
            "bundle_path": "/tmp/project.rxnflow.zip",
            "destination_dir": "/path/to/projects",
            "conflict_policy": "fail_if_exists",
        },
    )
)
assert imported.ok, imported.error
```

成功响应的 `data.bundle` 包含：

- `bundle_path`
- `project_path`
- `project_id`
- `root_name`
- `file_count`
- `byte_size`
- `checksum`
- `validation_summary`

## CLI

```bash
python3 -m rxnflow.cli project export-bundle --json \
  --project-path /path/to/project.rxnflow \
  --destination-path /tmp/project.rxnflow.zip

python3 -m rxnflow.cli project import-bundle --json \
  --bundle-path /tmp/project.rxnflow.zip \
  --destination-dir /path/to/projects
```

CLI 成功时 exit code 为 0，失败时非 0，并在 stdout 输出统一 JSON error payload。

## Validation 行为

- 如果项目存在 `.rxnflow/state/project-content.json`，导出和导入都会先运行 Project Content Validation。
- validation error 会阻止导出最终 bundle 或阻止导入项目落地。
- validation warning 不阻断导入/导出，会通过 shell warnings 返回。
- manifest-only 项目允许打包；此时 `validation_summary.checked` 为 `false`。

## Import 安全边界

导入会先检查 zip central directory，再写磁盘。以下 bundle 会被拒绝：

- 多个 top-level root。
- 缺少 `<root>/.rxnflow/manifest.json`。
- entry path 包含绝对路径、反斜杠、`.`、`..` 或空路径。
- 包含 `__MACOSX` 元数据目录。
- 包含 bundle root 外或 allowed roots 外的文件。
- `inputs/` 下不是 `inputs/raw/...` 的文件。

第一版只支持 `fail_if_exists`：如果目标 `<destination_dir>/<bundle-root>` 已存在，import 返回 `invalid_input`，不会覆盖、改名或合并。

## 相关文档

- `codestable/architecture/core-platform.md`
- `codestable/requirements/project-content-persistence.md`
- `codestable/features/2026-05-14-project-bundle-import-export/project-bundle-import-export-design.md`
