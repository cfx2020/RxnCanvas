---
doc_type: issue-fix
issue: 2026-07-10-reproducible-python-engine
path: fast-track
fix_date: 2026-07-10
tags: [python, engine, lockfile, supply-chain]
---

# Python engine 可复现构建修复记录

## 结果

新增输入依赖与带 hash 的 universal lockfile，固定 PyInstaller、cclib、setuptools 及完整传递依赖。构建优先使用 `uv --with-requirements`；pip fallback 强制 `--require-hashes` 并重建隔离 venv。CI 使用固定版本 pip-audit 审计该 lockfile。

## 主要文件

- `web/engine-requirements.in`
- `web/engine-requirements.lock`
- `web/scripts/build-engine.cjs`
- `.github/workflows/desktop-release.yml`

## 验证

bundled engine 已从 lockfile 重建并通过 `engine.status`、desktop smoke 和 packaged runtime smoke。
