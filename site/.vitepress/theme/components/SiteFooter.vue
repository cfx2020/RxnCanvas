<script setup>
import { ArrowUpRight } from '@lucide/vue'
import { useSiteContent } from '../sitePreferences'

const content = useSiteContent()
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__inner">
      <a class="brand brand--footer" href="#top">
        <img src="/assets/rxncanvas-icon.svg" alt="" width="26" height="26">
        <span>RxnCanvas</span>
      </a>
      <p>{{ content.footer.description }}</p>
      <nav :aria-label="content.footer.navigationLabel">
        <a href="https://github.com/cfx2020/rxncanvas" target="_blank" rel="noreferrer">
          GitHub
          <ArrowUpRight :size="13" aria-hidden="true" />
        </a>
        <a href="https://github.com/cfx2020/rxncanvas/blob/main/PRIVACY.md" target="_blank" rel="noreferrer">
          {{ content.footer.privacy }}
        </a>
        <a href="https://github.com/cfx2020/rxncanvas/blob/main/LICENSE" target="_blank" rel="noreferrer">
          {{ content.footer.license }}
        </a>
      </nav>
    </div>
  </footer>
</template>
