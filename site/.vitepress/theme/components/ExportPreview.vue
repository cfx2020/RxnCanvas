<script setup>
import { computed, ref } from 'vue'
import { useSiteContent } from '../sitePreferences'

const active = ref('cdxml')
const content = useSiteContent()

const exports = computed(() => ({
  cdxml: {
    label: 'CDXML',
    title: content.value.exportPreview.cdxmlTitle,
    src: '/assets/export-cdxml.png',
    alt: content.value.exportPreview.cdxmlAlt,
    width: 1672,
    height: 904
  },
  xlsx: {
    label: 'XLSX',
    title: content.value.exportPreview.xlsxTitle,
    src: '/assets/export-xlsx.png',
    alt: content.value.exportPreview.xlsxAlt,
    width: 1672,
    height: 648
  }
}))
</script>

<template>
  <div class="export-preview">
    <div class="export-preview__tabs" role="tablist" :aria-label="content.exportPreview.tabsLabel">
      <button
        v-for="(item, key) in exports"
        :key="key"
        type="button"
        role="tab"
        :aria-selected="active === key"
        :class="{ active: active === key }"
        @click="active = key"
      >
        {{ item.label }}
      </button>
    </div>
    <figure>
      <div class="export-preview__head">
        <span>{{ exports[active].label }}</span>
        <strong>{{ exports[active].title }}</strong>
      </div>
      <img
        class="screenshot-image screenshot-image--export"
        :src="exports[active].src"
        :alt="exports[active].alt"
        :width="exports[active].width"
        :height="exports[active].height"
      >
    </figure>
  </div>
</template>
