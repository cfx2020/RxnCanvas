<script setup>
import { Check, Download, FileSpreadsheet, Orbit, Waypoints } from '@lucide/vue'
import EnergyPreview from './EnergyPreview.vue'
import ExportPreview from './ExportPreview.vue'
import { useSiteContent } from '../sitePreferences'

const releaseUrl = 'https://github.com/cfx2020/rxncanvas/releases'
const content = useSiteContent()
</script>

<template>
  <div id="capabilities" class="product-sections">
    <section class="feature feature--canvas">
      <div class="section__inner feature__grid">
        <div class="feature__copy">
          <span class="feature__icon"><Waypoints :size="22" :stroke-width="1.6" aria-hidden="true" /></span>
          <p class="section-kicker">{{ content.product.canvas.kicker }}</p>
          <h2>{{ content.product.canvas.titleLead }}<br>{{ content.product.canvas.titleTail }}</h2>
          <p>{{ content.product.canvas.body }}</p>
          <ul class="feature-list">
            <li v-for="point in content.product.canvas.points" :key="point">
              <Check :size="15" aria-hidden="true" /> {{ point }}
            </li>
          </ul>
        </div>
        <figure class="feature__media feature__media--wide">
          <img
            class="screenshot-image"
            src="/assets/workbench-path.png"
            :alt="content.product.canvas.imageAlt"
            width="1240"
            height="700"
          >
        </figure>
      </div>
    </section>

    <section class="feature feature--structure">
      <div class="section__inner feature__grid">
        <div class="feature__copy">
          <span class="feature__icon"><Orbit :size="22" :stroke-width="1.6" aria-hidden="true" /></span>
          <p class="section-kicker">{{ content.product.structure.kicker }}</p>
          <h2>{{ content.product.structure.titleLead }}<br>{{ content.product.structure.titleTail }}</h2>
          <p>{{ content.product.structure.body }}</p>
          <p class="feature__boundary">{{ content.product.structure.boundary }}</p>
        </div>
        <figure class="feature__media">
          <img
            class="screenshot-image"
            src="/assets/structure-inspection.png"
            :alt="content.product.structure.imageAlt"
            width="900"
            height="412"
          >
        </figure>
      </div>
    </section>

    <section class="feature feature--energy">
      <div class="section__inner feature__grid">
        <div class="feature__copy feature__copy--energy">
          <p class="section-kicker">{{ content.product.energy.kicker }}</p>
          <h2>{{ content.product.energy.titleLead }}<br>{{ content.product.energy.titleTail }}</h2>
          <p>{{ content.product.energy.body }}</p>
        </div>
        <EnergyPreview />
      </div>
    </section>

    <section class="feature feature--export">
      <div class="section__inner">
        <div class="section-heading section-heading--split">
          <div>
            <span class="feature__icon"><FileSpreadsheet :size="22" :stroke-width="1.6" aria-hidden="true" /></span>
            <p class="section-kicker">{{ content.product.export.kicker }}</p>
            <h2>{{ content.product.export.title }}</h2>
          </div>
          <p>{{ content.product.export.body }}</p>
        </div>
        <ExportPreview />
      </div>
    </section>

    <section class="privacy-band" id="privacy">
      <div class="section__inner privacy-band__inner">
        <div>
          <p class="section-kicker">{{ content.product.privacy.kicker }}</p>
          <h2>{{ content.product.privacy.title }}</h2>
          <p>{{ content.product.privacy.body }}</p>
        </div>
        <div class="privacy-band__actions">
          <span v-for="point in content.product.privacy.points" :key="point">
            <Check :size="16" aria-hidden="true" /> {{ point }}
          </span>
          <a class="button button--light" :href="releaseUrl" target="_blank" rel="noreferrer">
            <Download :size="16" aria-hidden="true" />
            {{ content.product.privacy.download }}
          </a>
        </div>
      </div>
    </section>
  </div>
</template>
