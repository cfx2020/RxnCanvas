---
doc_type: issue-fix-note
status: fixed
slug: structure-2d-editor-white-screen
created_at: 2026-06-17
updated_at: 2026-06-17
---

# Structure 2D editor white screen fix note

## 1. 问题

用户打开真实 `Ir` 工作区后：

1. 节点卡没有显示 2D 结构，只显示 formula/placeholder。
2. 点击 `Edit 2D` 后打包桌面 app 白屏。

## 2. 根因

- Python engine 和 Electron embedded engine 解析 Gaussian/ORCA/XYZ/MAPLE 坐标时只保留了 `atomCount/elements/has3d`，没有把 `{ element, x, y, z }` 坐标 atoms 序列写入 `coordinatePreview.atoms`。
- 真实 `Ir` 工作区已经保存过旧 parse 结果；`.rxnflow/project.json` 里只有 `has3d: true` 和 atom count，没有 atoms，因此即使代码修好，新打开旧项目也需要从 `storedPath` 指向的项目内 raw log 重新补水。
- `Edit 2D` 懒加载 Ketcher 时没有 React ErrorBoundary；Ketcher 生产包加载/渲染错误会冒泡到整个 React root，表现为窗口白屏。
- Vite/Rolldown 生产构建把 Ketcher 依赖拆成循环 chunk，打包 app 中 Ketcher 会出现 `require_lodash is not a function`；dev server 下不复现。

## 3. 修复

- 为 Python engine 增加 `CoordinateAtom`，Gaussian/ORCA/XYZ/MAPLE 坐标解析保留完整 atoms；补全元素表到 `Rn`，修复 Ir 被显示成 `E77`。
- 同步修复 Electron embedded engine 的坐标 atoms 保留、payload round-trip、formula/elements 归一化。
- Electron 打开真实工作区时，如果 stored source 的 parse 缺少 coordinate atoms，会按 `storedPath` 读取项目内 raw log，并用 embedded engine 快速补水 parse；前端不需要把完整 log 放入 React state。
- 给 `Molecule2DEditorDialog` 增加 Ketcher ErrorBoundary，Ketcher 加载失败时只显示对话框内错误，不再白屏。
- Ketcher `staticResourcesUrl` 改为跟随 Vite `BASE_URL`，适配 packaged `file://` 资源路径。
- Vite production build 增加 Ketcher/lodash manual chunks，消除 packaged app 中 Ketcher chunk 循环依赖导致的 `require_lodash is not a function`。

## 4. 改动文件

- `rxnflow/engine.py`
- `tests/test_engine.py`
- `web/electron/embedded-engine.cjs`
- `web/electron/main.cjs`
- `web/electron/smoke.cjs`
- `web/src/app/KetcherEditorHost.tsx`
- `web/src/app/Molecule2DEditorDialog.tsx`
- `web/src/app/Molecule2DEditorDialog.test.tsx`
- `web/vite.config.ts`

## 5. 验证

已通过：

```bash
cd /Users/linsay/Desktop/code/rxnflow
python3 -m unittest discover

cd /Users/linsay/Desktop/code/rxnflow/web
npm run test
npm run build
npm run desktop:smoke
npm run desktop:pack
npm run desktop:runtime:smoke
```

额外真实数据 smoke：

- 用 `/Users/linsay/Documents/chemistry/Ir` 的真实项目和 stored logs 生成 enriched project content。
- 在开发预览 `http://127.0.0.1:5173/` 验证：7 个 Ir 节点显示 `.molecule-2d-depiction`，0 个 formula-only placeholder。
- 在打包 app `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app` 中通过 IPC 打开同一 Ir 项目验证：7 个节点显示 2D，点击 `Edit 2D` 后 Ketcher 对话框正常打开，窗口不白屏，console 无 error。
- 证据截图：`/tmp/rxnflow-packaged-ipc-ir-edit2d.png`。

## 6. 结果

重新打包后的 app 路径仍是：

`/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`

预期用户再次打开 `Ir` 项目后，节点卡会显示 2D 结构；点击 `Edit 2D` 会打开 Ketcher 编辑器，不再白屏。

## 7. 剩余风险

- 当前自动 2D 是从 3D 坐标投影/推断的结构草图，复杂金属配合物仍可能需要用户在 Ketcher 中手工整理后保存为 manual 2D。
- Vite build 仍有 3Dmol direct `eval` 和大 chunk warning；与本次白屏修复无关。
