---
doc_type: dev-guide
slug: project-bundle-import-export
component: project-bundle-import-export
status: current
summary: 如何通过 Platform Shell、CLI 或 Web Browser Project Repository 导入导出 RxnFlow .rxnflow.zip 项目包
tags: [project-bundle, platform-shell, cli, web, persistence, qa]
last_reviewed: 2026-05-22
---

# Project Bundle Import Export

## 概述

Project Bundle 是 `.rxnflow.zip` 项目包，用于本地备份和早期 Web 无云同步。它是传输格式，不是 live storage：导出前如需保存当前运行态 session，调用方应先在同一进程中执行 `project.save_content`；Web 工作台中对应操作是先点击 `Save Bridge`。

bundle 内部结构固定为：

```text
<project-name>.rxnflow.zip
└── <bundle-root>/
    ├── .rxnflow/
    ├── inputs/raw/
    └── exports/
```

第一版只打包 `.rxnflow/`、`inputs/raw/` 和 `exports/`。项目根目录中的 notes、临时脚本或其他散落文件不会进入 bundle。

## Web Browser Project Repository

Web 工作台不调用 Python `ProjectBundleService`、`project.import_bundle` 或 `project.export_bundle`。Web 侧 import/export 只围绕 Browser Project Repository bytes 工作：

- `web/src/app/projectBundleArchive.ts`：隔离 `fflate`，负责 `.rxnflow.zip` 读写、single-root、manifest required、allowed roots 和 path safety。
- `web/src/app/projectBundleExport.ts`：从 active browser project 收集 `.rxnflow/`、`inputs/raw/`、`exports/` objects，生成 Blob 并触发 browser download。
- `web/src/app/projectBundleImport.ts`：读取用户选择的 `.rxnflow.zip`，完整 archive 校验通过后创建新的 browser-local project 并写入 safe entries。
- `web/src/app/ProjectSidebar.tsx`：呈现 `Import Bundle`、`Export Bundle`、summary、错误和 partial import risk。

Web import 成功后不会自动 `Open Bridge`。Web export 前也不会自动 `Save Bridge`。如果当前 shell session 中有新图谱、workspace、profile 或 export index，需要调用方显式保存后再导出。

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

核心/CLI 导入会先检查 zip central directory，再写磁盘。Web archive adapter 使用同一组安全语义；以下 bundle 会被拒绝：

- 多个 top-level root。
- 缺少 `<root>/.rxnflow/manifest.json`。
- entry path 包含绝对路径、反斜杠、`.`、`..` 或空路径。
- 包含 `__MACOSX` 元数据目录。
- 包含 bundle root 外或 allowed roots 外的文件。
- `inputs/` 下不是 `inputs/raw/...` 的文件。

第一版只支持 `fail_if_exists`：如果目标 `<destination_dir>/<bundle-root>` 已存在，import 返回 `invalid_input`，不会覆盖、改名或合并。

Web 第一版只支持 create-new-project：即使当前已有同名 browser-local project，也创建新的 projectRef，不覆盖、不合并。

## Web 错误样例

Web E2E 使用动态样例覆盖坏包路径，不维护二进制 fixture：

- `non_zip_bytes`：文件名是 `.rxnflow.zip`，内容不是 zip，期望 `invalid_bundle`。
- `missing_manifest`：zip 中没有 `<root>/.rxnflow/manifest.json`，期望 `invalid_bundle`。
- `unsafe_entry`：zip entry 含不安全路径，期望 `invalid_bundle`。

repository 创建或写入失败时，Web import 返回 `storage_failed`；如果 project 已创建且部分 entries 已写入，Project Sidebar 显示 partial import risk、partialProjectRef 和 writtenCount。

## QA 命令

```bash
cd web && npm run test -- --run
cd web && npm run build
cd web && npm run test:e2e
cd web && npm run test:e2e:local-http
```

这些命令分别覆盖：

- Vitest component/unit：archive adapter、import/export actions、Project Sidebar 状态、roundtrip helper。
- Build：TypeScript 和 Vite production build。
- Default Playwright：fixture runtime 下 desktop/narrow Web workbench、bundle backup/restore、invalid bundle UI、console clean、无水平溢出。
- Local-http Playwright：真实 Python bridge 下 raw input persistence、Open Bridge、Save Bridge、Export Bundle、Import Bundle、再次 Open Bridge。

维护测试时，成功路径要走真实 Project Sidebar button/file input/download；helper 只负责生成输入文件或读下载结果，不应直接拼接生产状态。

## 相关文档

- `codestable/architecture/core-platform.md`
- `codestable/architecture/web-workbench.md`
- `codestable/requirements/project-content-persistence.md`
- `codestable/features/2026-05-14-project-bundle-import-export/project-bundle-import-export-design.md`
- `codestable/roadmap/rxnflow-web-project-portability/rxnflow-web-project-portability-roadmap.md`
