---
doc_type: feature-ff-note
feature: bundled-python-cclib-engine
date: 2026-06-28
requirement:
tags: [desktop, electron, engine, python, cclib, packaging]
---

## 做了什么
把桌面 app 的本地解析运行时收敛到 bundled Python engine，并把 cclib 作为 packaged app 默认依赖。打包态不再保留 `embedded-engine.cjs` 这条 JS fallback engine，用户机器不需要自己安装 Python 或 cclib 才能走桌面解析。

## 改了哪些
- `web/scripts/build-engine.cjs` / `web/scripts/engine-entry.py` — 新增 PyInstaller engine 构建入口，输出 `web/engine/rxnflow-engine`。
- `web/electron/engine-bridge.cjs:104` — Electron engine bridge 优先运行 packaged/bundled engine，开发态无构建产物时才回退 `python3 -m rxnflow.engine_ipc`。
- `web/package.json:13` / `web/package.json:65` — desktop pack/dist 脚本在 Electron build 前执行 `desktop:engine`，并把 `engine/` 作为 extraResource。
- `rxnflow/engine_ipc.py:35` — `engine.status` 回传 runtime、Python 版本和 `dependencies.cclib`，供 smoke 与 UI 诊断。
- `web/electron/embedded-engine.cjs` — 删除旧 packaged JS fallback engine。

## 怎么验证的
跑过 `npm --prefix web run desktop:runtime:smoke`，确认 packaged runtime 返回 `runtime=bundled-python` 且 `cclib=1.8.1`。同时跑过 `npm --prefix web run desktop:smoke`、`npm --prefix web run desktop:release:smoke`、`npm --prefix web run build`、`npm --prefix web run test` 和 `python3 -m unittest discover`。
