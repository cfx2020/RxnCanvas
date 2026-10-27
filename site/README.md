# RxnCanvas 产品站

独立的 VitePress 静态站点，不参与桌面应用构建。

## 本地运行

```bash
cd site
npm install
npm run dev
```

打开 `http://127.0.0.1:5173/`。

## 构建

```bash
cd site
npm run build
```

静态产物位于 `site/.vitepress/dist/`。

## Cloudflare Pages

- 构建命令：`npm run build`
- 构建根目录：`site`
- 输出目录：`.vitepress/dist`
- 自定义域名：`rxncanvas.831447.xyz`

不要把根域 `831447.xyz` 指向该站点，现有博客继续使用原域名。
