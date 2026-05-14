---
doc_type: dev-guide
slug: browser-local-storage-backend
component: browser-local-storage-adapter
status: current
summary: 如何在核心测试或未来 Web bridge 中使用浏览器本地 ProjectStorageBackend 替身
tags: [browser-storage, project-content, persistence, storage-backend]
last_reviewed: 2026-05-14
---

# Browser Local Storage Backend

## 概述

`BrowserLocalProjectStorageBackend` 是浏览器本地 IndexedDB / OPFS 方向的核心协议测试替身。它实现 `ProjectStorageBackend`，可直接注入 `ProjectContentStore`，用于验证 `.rxnflow/state/` 的 bytes、path、checksum 和 validation contract 在非文件系统 project_ref 上仍然成立。

它不是云存储，也不是真实 JavaScript IndexedDB / OPFS adapter。数据只存在于当前 Python backend 实例中；真实 Web UI、文件选择器、持久存储权限和浏览器 quota 提示由后续前端 roadmap 接入。

## 快速上手

```python
from rxnflow.browser_storage import BrowserLocalProjectStorageBackend
from rxnflow.content_store import ProjectContentStore

backend = BrowserLocalProjectStorageBackend()
store = ProjectContentStore(backend)

saved = store.save_snapshot("project-demo", snapshot)
assert saved.ok, saved.error

loaded = store.load_snapshot("project-demo")
assert loaded.ok, loaded.error
```

`project_ref` 在这个 backend 中是 origin-local project key，不是目录路径。不同 project_ref 的相同 object path 会互相隔离。

## 行为边界

- object path 仍必须是项目相对 POSIX path。
- `write_object` 写入或替换单个 `(project_ref, path)` record。
- `read_object` 返回 bytes、checksum 和 metadata。
- `list_objects` 支持 exact file 和 prefix subtree，并按 path 稳定排序。
- `delete_object` 删除单个 record；对象不存在时也返回 ok。
- checksum 始终按 bytes 计算为 `sha256:` 字符串。

## Quota 模拟

可用 `quota_bytes` 模拟浏览器本地空间不足：

```python
backend = BrowserLocalProjectStorageBackend(quota_bytes=1024)
```

超过 quota 时返回 `storage_quota_exceeded`，target 为 `quota`，details 中包含 `quota_bytes`、`requested_bytes` 和 `current_bytes`。失败写入不会部分覆盖已有对象；替换或删除对象后，用量按当前 records 重新计算。

## 不做什么

- 不保存到磁盘。
- 不提供跨浏览器、跨设备或账号同步。
- 不实现云备份、权限、冲突合并或多人协作。
- 不新增 Platform Shell / CLI 命令。
- 不调用 parser、import、registry、graph、energy、export 或 bundle 服务。
- 早期 Web 版本仍应引导用户导出 `.rxnflow.zip` 做手动备份。
