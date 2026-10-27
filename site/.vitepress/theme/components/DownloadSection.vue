<script setup>
import { ArrowUpRight, Download, Monitor } from '@lucide/vue'
import { useSiteContent } from '../sitePreferences'

const releaseUrl = 'https://github.com/cfx2020/rxncanvas/releases'
const content = useSiteContent()
</script>

<template>
  <section class="download-section">
    <div class="download-section__grid" aria-hidden="true"></div>
    <div class="section__inner download-section__inner">
      <div>
        <p class="section-kicker">{{ content.download.kicker }}</p>
        <h2>{{ content.download.titleLead }}<br>{{ content.download.titleTail }}</h2>
        <div class="download-section__actions">
          <a class="button button--primary" :href="releaseUrl" target="_blank" rel="noreferrer">
            <Download :size="17" aria-hidden="true" />
            {{ content.download.releases }}
          </a>
          <a class="text-link" href="https://github.com/cfx2020/rxncanvas/tree/main/docs/user" target="_blank" rel="noreferrer">
            {{ content.download.docs }}
            <ArrowUpRight :size="15" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div class="download-platforms">
        <div>
          <Monitor :size="20" :stroke-width="1.6" aria-hidden="true" />
          <span>
            <strong>macOS</strong>
            <small>{{ content.download.macos }}</small>
          </span>
        </div>
        <div>
          <Monitor :size="20" :stroke-width="1.6" aria-hidden="true" />
          <span>
            <strong>Windows</strong>
            <small>{{ content.download.windows }}</small>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
