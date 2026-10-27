<script setup>
import { AlertTriangle, CheckCircle2, FileText } from '@lucide/vue'
import { useSiteContent } from '../sitePreferences'

const content = useSiteContent()
const isExperimental = (index) => index > 0
</script>

<template>
  <section id="formats" class="section formats-section">
    <div class="section__inner">
      <div class="section-heading section-heading--split">
        <div>
          <p class="section-kicker">{{ content.formats.kicker }}</p>
          <h2>{{ content.formats.title }}</h2>
        </div>
        <p>{{ content.formats.description }}</p>
      </div>

      <div class="format-list">
        <article
          v-for="(format, index) in content.formats.items"
          :key="format.name"
          class="format-row"
        >
          <div class="format-row__name">
            <span><FileText :size="18" :stroke-width="1.7" aria-hidden="true" /></span>
            <div>
              <h3>{{ format.name }}</h3>
              <p>{{ format.ext }}</p>
            </div>
          </div>
          <p class="format-row__body">{{ format.body }}</p>
          <span class="format-row__status" :class="{ warning: isExperimental(index) }">
            <AlertTriangle v-if="isExperimental(index)" :size="14" aria-hidden="true" />
            <CheckCircle2 v-else :size="14" aria-hidden="true" />
            {{ isExperimental(index) ? content.formats.experimental : content.formats.supported }}
          </span>
        </article>
      </div>

    </div>
  </section>
</template>
