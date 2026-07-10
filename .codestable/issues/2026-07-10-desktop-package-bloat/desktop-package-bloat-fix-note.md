---
doc_type: issue-fix
issue: 2026-07-10-desktop-package-bloat
path: fast-track
fix_date: 2026-07-10
tags: [electron, package-size, npm, dependencies]
---

# 桌面安装包依赖膨胀修复记录

## 结果

React、Ketcher、3Dmol、Lucide 等 renderer-only 包移到 devDependencies；production dependencies 只保留 Electron main 运行时使用的 `archiver` 和 `extract-zip`。完整 npm audit 当前为 0 vulnerabilities。

## 体积结果

- macOS app：约 655 MB → 383 MB
- app.asar：约 321 MB → 48 MB
- ASAR entries：17,145 → 2,172

## 验证

重建后的 macOS app 通过 packaged runtime smoke，证明精简后 Electron main、renderer 和 bundled engine 仍可启动。

## 遗留

PyInstaller 的 `--collect-all cclib` 仍带入 SciPy/Matplotlib/Tk 等较大依赖，属于后续低风险优化项，不能在缺少 parser 回归样本时盲目裁剪。
