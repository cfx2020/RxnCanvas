---
doc_type: issue-fix
issue: 2026-07-10-release-governance-baseline
path: fast-track
fix_date: 2026-07-10
tags: [release, legal, privacy, security, checksums]
---

# 发布治理基线修复记录

## 结果

新增 README、保守的 proprietary LICENSE、PRIVACY、SECURITY、CHANGELOG、用户支持格式说明、应用内许可证与 Node/Python 第三方依赖清单。Help 菜单改为本地 About，显示版本、数据目录与当前支持状态，不再打开无效的通用 GitHub 地址。CI 为平台产物生成 SHA-256 和带 source revision 的 release manifest。

## 遗留

许可证最终选择仍建议法律审阅；公开安全报告邮箱/私有 advisory、Git remote、release destination 和 Apple credentials 需要发布方提供。
