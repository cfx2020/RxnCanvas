---
doc_type: refactor-scan
refactor: 2026-07-13-import-save-engine-hotpath
status: selected
scope: Electron engine bridge、Python IPC、项目源文件持久化与普通侧栏批量导入状态更新
---

# import-save-engine-hotpath scan

扫描范围约 10 个实现与测试文件，现有核心路径测试覆盖充分，不涉及架构边界重划。发现 5 个性能点，均属于 L4 性能与异步；整体风险中等。优先消除 Python 冷启动和重复文件哈希，最后再合并 renderer 状态更新。

## ✓ S1 Python IPC 只能处理单次请求

- 证据：`rxnflow/engine_ipc.py` 读取一次 stdin 后退出；连续三次 status PID 均不同。
- 影响：每个请求固定增加约 0.7–0.85 秒冷启动。
- 方法：M-L1-01、M-L4-06。
- 风险：协议错误后进程恢复、EOF 和退出码语义。

## ✓ S2 Electron 每个解析请求都 spawn Python

- 证据：`web/electron/engine-bridge.cjs` 每次 `runEngineRequest` 都 spawn；批量导入虽有并发 3，但每个文件仍独立冷启动。
- 影响：5 个轻量 XYZ 单文件请求约 3598ms，同批请求约 707ms。
- 方法：M-L4-02、M-L4-06。
- 风险：超时、崩溃恢复、退出时清理、最多 3 worker 的并发约束。

## ✓ S3 Electron autosave 重复完整读取所有源文件

- 证据：`project-store.cjs` 每次保存都 stat + readFile + SHA-256，即使 storedPath 未变化。
- 影响：大源文件产生重复磁盘 IO 和整文件 Buffer 峰值内存。
- 方法：M-L4-01。
- 风险：同大小修改、原子替换、哈希期间文件变化、缓存容量。

## ✓ S4 Python validation 再次完整哈希相同文件

- 证据：保存完成后每次调用 `project.validate`，Python 对 sources 与 exports 再做完整 SHA-256。
- 影响：稳定 autosave 总读取量约为所有源文件总大小的两倍；10×100MB 约 2GB。
- 方法：M-L4-01。
- 风险：不得削弱 missing、size mismatch、checksum mismatch 等校验。

## ✓ S5 普通侧栏导入逐文件重建完整工作区

- 证据：每个 `onFileParsed` 都独立调用 `stageSourceFilesForProject`，重复遍历文件、Canvas 和节点。
- 影响：N 个文件产生 N 次 React state commit 和全工作区 reconcile。
- 方法：M-L4-02。
- 风险：只适用于 `autoRegister:false`；画布投放的节点生成顺序不得改变。

## 明确不做

- 不把整批文件改为单次 IPC：会改变逐文件进度、错误隔离和大文件并行行为。
- 不跳过 autosave validation、source prune 或 manifest 写入。
- 不在本批处理同名文件物化竞争；这是独立 correctness issue。
