---
doc_type: issue-fix
issue: 2026-07-10-resource-size-limits
path: fast-track
fix_date: 2026-07-10
tags: [performance, security, large-files, zip]
---

# 大文件与资源边界修复记录

## 结果

项目 state/package、source、canvas image 和 ZIP 增加明确上限；浏览器大文件解析改为 head/tail sampling，Python 在读取全文前检查文件大小。ZIP 限制 compressed size、单 entry、expanded total 和 entry count。

## 主要限制

- project state/package：64 MB
- full source parse：512 MB
- canvas image：10 MB；stored data URL：14 MB
- archive：2 GB compressed、1 GB/entry、4 GB expanded、20,000 entries

## 验证

新增浏览器大文件 sampling、项目大小、图片归一化和 Python sparse-file 回归测试；相关测试与 build/smoke 通过。
