<script setup>
import { ArrowDown, Download, Play, ShieldCheck } from '@lucide/vue'
import { useSiteContent } from '../sitePreferences'

const releaseUrl = 'https://github.com/cfx2020/rxncanvas/releases'
const content = useSiteContent()
</script>

<template>
  <section id="top" class="hero">
    <div class="hero__grid" aria-hidden="true"></div>
    <div class="hero__inner">
      <div class="hero__copy">
        <h1>{{ content.hero.titleLead }}<br><span>{{ content.hero.titleTail }}</span></h1>
        <p class="hero__lede">
          {{ content.hero.lede }}
        </p>
        <div class="hero__actions">
          <a class="button button--primary" :href="releaseUrl" target="_blank" rel="noreferrer">
            <Download :size="17" :stroke-width="1.8" aria-hidden="true" />
            {{ content.hero.download }}
          </a>
          <a class="button button--secondary" href="#demo">
            <Play :size="16" :stroke-width="1.8" fill="currentColor" aria-hidden="true" />
            {{ content.hero.demo }}
          </a>
        </div>
        <p class="hero__note">
          <ShieldCheck :size="16" :stroke-width="1.8" aria-hidden="true" />
          {{ content.hero.note }}
        </p>
      </div>

      <figure class="hero-product">
        <img
          class="screenshot-image screenshot-image--hero"
          src="/assets/workbench-path.png"
          :alt="content.hero.imageAlt"
          width="1240"
          height="700"
          fetchpriority="high"
        >
      </figure>
    </div>
    <a class="hero__next" href="#workflow" :aria-label="content.hero.next">
      <ArrowDown :size="17" :stroke-width="1.7" aria-hidden="true" />
    </a>
  </section>
</template>
