<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowUpRight, Languages, Menu, Moon, Sun, X } from '@lucide/vue'
import {
  initializeSitePreferences,
  language,
  theme,
  toggleLanguage,
  toggleTheme,
  useSiteContent
} from '../sitePreferences'

const menuOpen = ref(false)
const content = useSiteContent()

watch(menuOpen, (open) => {
  document.body.classList.toggle('rxn-menu-open', open)
})

function closeMenu() {
  menuOpen.value = false
}

onMounted(initializeSitePreferences)

onBeforeUnmount(() => {
  document.body.classList.remove('rxn-menu-open')
})
</script>

<template>
  <header class="site-header">
    <div class="site-header__inner">
      <a class="brand" href="#top" :aria-label="content.header.homeLabel" @click="closeMenu">
        <img src="/assets/rxncanvas-icon.svg" alt="" width="32" height="32">
        <span>RxnCanvas</span>
        <em>BETA</em>
      </a>

      <nav class="desktop-nav" :aria-label="content.header.navigationLabel">
        <a href="#workflow">{{ content.header.workflow }}</a>
        <a href="#capabilities">{{ content.header.capabilities }}</a>
        <a href="#formats">{{ content.header.formats }}</a>
        <a href="#privacy">{{ content.header.privacy }}</a>
        <a href="https://github.com/cfx2020/rxncanvas/tree/main/docs/user" target="_blank" rel="noreferrer">
          {{ content.header.docs }}
          <ArrowUpRight :size="13" :stroke-width="1.8" aria-hidden="true" />
        </a>
      </nav>

      <div class="header-actions">
        <button
          class="preference-button"
          type="button"
          :aria-label="language === 'zh' ? content.header.switchToEnglish : content.header.switchToChinese"
          :title="language === 'zh' ? content.header.switchToEnglish : content.header.switchToChinese"
          @click="toggleLanguage"
        >
          <Languages :size="16" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ language === 'zh' ? 'EN' : '中文' }}</span>
        </button>
        <button
          class="preference-button preference-button--icon"
          type="button"
          :aria-label="theme === 'dark' ? content.header.switchToLight : content.header.switchToDark"
          :title="theme === 'dark' ? content.header.switchToLight : content.header.switchToDark"
          @click="toggleTheme"
        >
          <Sun v-if="theme === 'dark'" :size="17" :stroke-width="1.8" aria-hidden="true" />
          <Moon v-else :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <button
          class="menu-button"
          type="button"
          :aria-expanded="menuOpen"
          aria-controls="mobile-navigation"
          :aria-label="menuOpen ? content.header.closeMenu : content.header.openMenu"
          @click="menuOpen = !menuOpen"
        >
          <X v-if="menuOpen" :size="21" aria-hidden="true" />
          <Menu v-else :size="21" aria-hidden="true" />
        </button>
      </div>
    </div>

    <nav v-if="menuOpen" id="mobile-navigation" class="mobile-nav" :aria-label="content.header.mobileNavigationLabel">
      <a href="#workflow" @click="closeMenu">{{ content.header.workflow }}</a>
      <a href="#capabilities" @click="closeMenu">{{ content.header.capabilities }}</a>
      <a href="#formats" @click="closeMenu">{{ content.header.formats }}</a>
      <a href="#privacy" @click="closeMenu">{{ content.header.privacy }}</a>
      <a href="https://github.com/cfx2020/rxncanvas/tree/main/docs/user" target="_blank" rel="noreferrer">
        {{ content.header.docs }}
        <ArrowUpRight :size="15" aria-hidden="true" />
      </a>
    </nav>
  </header>
</template>
