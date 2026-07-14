---
doc_type: refactor-apply-notes
refactor: 2026-07-13-import-save-engine-hotpath
status: completed
---

# import-save-engine-hotpath apply notes

## 步骤 1：Python 多请求协议

- 改动：`rxnflow/engine_ipc.py`、`tests/test_engine.py`。
- 结果：逐行处理 NDJSON，多请求复用进程；错误请求后可继续；单请求 EOF 退出码保持兼容。
- 验证：Python 定向测试通过。
- 偏离：无。

## 步骤 2：Electron 常驻 worker pool

- 改动：`web/electron/engine-bridge.cjs`、`web/electron/main.cjs`、`web/electron/smoke.cjs`、`web/electron/engine-bridge.test.cjs`。
- 结果：懒启动、FIFO、最多 3 worker；每 worker 单 in-flight；timeout/crash/bad response 只回收故障 worker；应用退出显式 shutdown。
- 验证：PID 复用、并发上限、FIFO、崩溃/超时恢复和无残留测试通过。
- 偏离：无。

## 步骤 3：Electron 文件指纹缓存

- 改动：`web/electron/project-store.cjs`、`web/electron/project-store.test.cjs`。
- 结果：materialize/persist 共用 256 项 LRU；未变化文件只 stat；缓存 miss 使用流式 SHA-256；哈希期间变化最多重试 3 次。
- 验证：共享缓存、同大小改写、原子替换、变化重试、prune 和 LRU 淘汰测试通过。
- 偏离：无。

## 步骤 4：Python validation 哈希缓存

- 改动：`rxnflow/engine.py`、`tests/test_engine.py`。
- 结果：source/export 共用 128 项 stat fingerprint LRU；所有 missing/mismatch warning 保持。
- 验证：命中、同大小修改、原子替换、删除和容量测试通过。
- 偏离：无。

## 步骤 5：侧栏导入 frame batching

- 改动：`web/src/app/importParseJobs.ts`、`web/src/app/importParseJobs.test.ts`、`web/src/app/App.tsx`、`web/src/app/App.test.tsx`。
- 结果：仅 `autoRegister:false` 的普通侧栏导入合并同一 animation frame 内的工作区提交；成功、失败、卸载路径均 flush/cancel；画布投放保持逐文件。
- 自动验证：相关 78 项测试通过；Web 全量 42 文件、381 项测试通过；浏览器工作台加载正常且 console error 为 0。
- HUMAN 验证：用户在收到验收说明后回复“下一步”，本批按验收通过收尾。
- 偏离：无。

## 全量回归

- Python：34 项通过。
- Electron Node tests：9 项通过。
- Web：381 项通过。
- Web production build：通过。
- Bundled Python engine：已重建。
- 默认 `desktop:smoke`：通过。
- `git diff --check`：通过。
