---
doc_type: issue-fix
issue: 2026-08-13-extract-zip-path-traversal
status: fixed
severity: high
---

# extract-zip path traversal fix note

## 根因

GitHub Actions 的 `npm audit --omit=dev` 在 `v0.1.0-beta.5` tag 发布中发现直接生产依赖 `extract-zip@2.0.1` 存在未校验符号链接路径穿越漏洞（GHSA-jmr9-qjv8-65gv）。该依赖用于导入 `.rxnflow.zip` 项目归档，无法通过忽略审计或风险接受继续发布。

## 修复

- 移除 `extract-zip`，改用 `yauzl@3.4.0` 的 lazy entry / streaming API。
- 在 `web/electron/project-store.cjs` 中逐项执行路径边界、重复路径、Unix 文件类型、压缩格式、条目数、单项展开大小和总展开大小校验。
- 只接受目录和普通文件；符号链接、设备文件、加密或不支持的压缩条目直接拒绝。
- 在临时导入目录内使用 `wx` 文件创建和 stream pipeline，校验项目状态后才原子移动到目标目录。
- 同步 `package-lock.json`、第三方许可证清单和 notices。

## 验证

- `npm audit --omit=dev`：0 vulnerabilities。
- `npm run desktop:smoke`：通过。
- Electron smoke 覆盖正常 archive round-trip，以及含符号链接条目的恶意 archive 被拒绝且没有写出临时目录。
- `node --check electron/project-store.cjs electron/smoke.cjs`：通过。
- `npm run desktop:release:smoke`：通过，并断言生产依赖仍使用 `yauzl@3.4.0`。

## 发布影响

- `v0.1.0-beta.5` 只留下失败的 CI 记录，没有创建 GitHub Release。
- 修复进入后续提交并使用 `v0.1.0-beta.6` 重新触发完整跨平台 Beta 发布。
