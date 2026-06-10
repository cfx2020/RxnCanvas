---
doc_type: dev-guide
slug: platform-project-open-save
component: platform-shell-state-restore
status: current
summary: 如何通过 Platform Shell 打开、恢复和保存 RxnFlow 项目内容
tags: [platform-shell, project-content, persistence, cli]
last_reviewed: 2026-05-14
---

# Platform Project Open And Save

## 概述

Platform Shell 现在提供项目内容恢复和保存入口。集成方可以用 `project.open` 从 `.rxnflow/state/` 恢复 ChemicalObject、ImportBatch、ReactionGraph、WorkspaceSnapshot、EnergyProfile 和 ExportArtifactRecord，并用 `project.save_content` 把当前进程内 session 的内容写回 ProjectContentStore。

该层只做端侧编排，不重新解析 raw files，不重新确认 import，不重新计算 energy profile，也不重新导出报告。

## 前置依赖

- 项目目录必须包含 `.rxnflow/manifest.json`。
- 要恢复内容时，项目目录需要有有效的 `.rxnflow/state/project-content.json` 和 section files。
- 保存内容需要一个仍存在于当前进程内的 `session_id`，CLI 进程之间不会共享 session。

## 快速上手

```python
from rxnflow.platform import AppKernel, PlatformShellService, ShellCommand

kernel = AppKernel()
service = PlatformShellService(kernel)

opened = service.run(
    ShellCommand(
        "project.open",
        {"project_path": "/path/to/project", "load_content": True},
    )
)
assert opened.ok, opened.error
session_id = opened.data["session_id"]

saved = service.run(
    ShellCommand(
        "project.save_content",
        {"session_id": session_id},
    )
)
assert saved.ok, saved.error
```

Manifest-only 打开：

```python
response = service.run(
    ShellCommand(
        "project.open",
        {"project_path": "/path/to/project", "load_content": False},
    )
)
```

CLI 打开项目：

```bash
python3 -m rxnflow.cli project open --json --project-path /path/to/project
python3 -m rxnflow.cli project open --json --project-path /path/to/project --manifest-only
```

## 核心概念

- `project.load`：保留旧语义，只加载 manifest，创建 manifest-only session。
- `project.open(load_content=True)`：加载 manifest，校验 Project Content，校验通过后恢复内容到运行态服务。
- `project.open(load_content=False)`：只加载 manifest，不访问 Project Content。
- `project.open(content_files=...)`：接收 JSON-safe project content files payload，materialize 临时项目目录后复用 `project.open` 恢复流程。
- `project.save_content(session_id)`：从当前 session collections 构造 `ProjectContentSnapshot` 并写回 `.rxnflow/state/`。
- `project.save_content(include_content_files=True)`：除写回项目目录外，还在响应中返回 manifest、content index 和 section files 的 base64 bytes。
- `PlatformSession`：只在当前进程内有效，不是跨进程持久化机制。

## 接口参考

### `project.open`

参数：

| 字段 | 类型 | 说明 |
|---|---|---|
| `project_path` | `str` | 项目目录路径 |
| `load_content` | `bool` | 默认 `True`；为 `False` 时只打开 manifest |
| `content_files` | `list[dict]` | 可选；JSON-safe project content files payload。每项包含 project-relative POSIX `path`、`bytes_base64`、可选 `checksum` 与 `metadata`。提供该字段时 Platform Shell 会 materialize 临时项目目录后打开。 |

成功响应会包含：

- `object_count`
- `graph_count`
- `workspace_count`
- `profile_count`
- `artifact_count`
- `active_graph_id`
- `active_workspace_id`
- `active_profile_id`

validation error 会返回 `project_content_invalid`，并在 `error.details` 中带 validation report 摘要和 issues。

Inline content files 打开：

```python
response = service.run(
    ShellCommand(
        "project.open",
        {
            "load_content": True,
            "content_files": [
                {
                    "path": ".rxnflow/manifest.json",
                    "bytes_base64": "...",
                    "checksum": "sha256:...",
                },
                {
                    "path": ".rxnflow/state/project-content.json",
                    "bytes_base64": "...",
                    "checksum": "sha256:...",
                },
            ],
        },
    )
)
```

`content_files` 路径必须是安全的项目相对 POSIX path，不能是绝对路径、包含反斜杠、`.` 或 `..`。payload 必须包含 `.rxnflow/manifest.json`；`checksum` 存在时必须匹配 bytes。

### `project.save_content`

参数：

| 字段 | 类型 | 说明 |
|---|---|---|
| `session_id` | `str` | 当前进程内有效 session id |
| `include_content_files` | `bool` | 默认 `False`；为 `True` 时在 `data.content_files` 返回 manifest、content index 和 section files 的 base64 bytes/checksum/metadata |

保存时会把 session 中的 objects、import batches、reaction graphs、workspaces、energy profiles 和 export artifact records 写入 Project Content。运行时 `ShellArtifact` 只有文件路径位于当前项目 `exports/` 下时才转换为长期 `ExportArtifactRecord`；bytes-only、项目外路径或缺文件会返回 warning，不阻断保存。

## 常见场景

### 打开项目后继续编辑 workspace

```python
opened = service.run(ShellCommand("project.open", {"project_path": project_path}))
session_id = opened.data["session_id"]

updated = service.run(
    ShellCommand(
        "workspace.add_node",
        {
            "session_id": session_id,
            "kind": "species",
            "label": "INT1",
            "chemical_object_ids": ("object-a",),
        },
    )
)
```

### 打开项目后保存当前 session

```python
saved = service.run(ShellCommand("project.save_content", {"session_id": session_id}))
```

### 只检查 manifest

```bash
python3 -m rxnflow.cli project open --json --project-path /path/to/project --manifest-only
```

## 已知限制与注意事项

- CLI 只提供 `project open`，不提供 `project save-content`。
- `project.save_content` 只能保存当前进程内的 session。
- `content_files` / `include_content_files` 主要服务 Web Project Content Bridge；它们不表示 Python bridge 可以直接读取浏览器 IndexedDB 或 Browser Project Ref。
- restore 不会修复损坏的 Project Content。validation error 需要调用方展示给用户处理。
- project bundle 已由独立 ProjectBundleService 和 `project.export_bundle` / `project.import_bundle` 命令承担；browser local storage backend 当前已有核心协议测试替身，真实 JS/TS adapter 和 UI 接入仍由后续前端 roadmap 承担。

## 相关文档

- `.codestable/architecture/core-platform.md`
- `.codestable/requirements/project-content-persistence.md`
- `.codestable/features/2026-05-14-platform-shell-state-restore/platform-shell-state-restore-design.md`
- `.codestable/features/2026-05-14-platform-shell-state-restore/platform-shell-state-restore-acceptance.md`
- `docs/dev/browser-local-storage-backend.md`
