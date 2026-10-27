import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'RxnCanvas',
  titleTemplate: false,
  description: '把计算化学结果整理成可编辑的反应路径图。',
  cleanUrls: true,
  srcExclude: ['README.md'],
  sitemap: {
    hostname: 'https://rxncanvas.831447.xyz'
  },
  head: [
    ['script', {}, `(() => {
  try {
    const saved = localStorage.getItem('rxncanvas-theme')
    const theme = saved === 'dark' || saved === 'light'
      ? saved
      : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    document.documentElement.dataset.theme = theme
  } catch {}
})()`],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/assets/rxncanvas-icon.svg' }],
    ['link', { rel: 'canonical', href: 'https://rxncanvas.831447.xyz/' }],
    ['meta', { name: 'theme-color', content: '#f5f8fa' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://rxncanvas.831447.xyz/' }],
    ['meta', { property: 'og:title', content: 'RxnCanvas · 计算化学反应路径工作台' }],
    ['meta', { property: 'og:description', content: '导入计算输出，组装反应路径，核对结构与能量，并导出可继续编辑的图表。' }],
    ['meta', { property: 'og:image', content: 'https://rxncanvas.831447.xyz/assets/rxncanvas-demo-poster.jpg' }]
  ],
  themeConfig: {
    logo: '/assets/rxncanvas-icon.svg',
    siteTitle: false,
    outline: false,
    socialLinks: [
      { icon: 'github', link: 'https://github.com/cfx2020/rxncanvas' }
    ]
  }
})
