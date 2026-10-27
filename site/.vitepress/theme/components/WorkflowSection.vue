<script setup>
import { ArrowRight, FileInput, GitBranch, ScanSearch, Share2 } from '@lucide/vue'
import { useSiteContent } from '../sitePreferences'

const content = useSiteContent()
const stepIcons = [FileInput, GitBranch, ScanSearch, Share2]
</script>

<template>
  <section id="workflow" class="section workflow">
    <div class="section__inner">
      <div class="section-heading section-heading--split">
        <div>
          <p class="section-kicker">{{ content.workflow.kicker }}</p>
          <h2>{{ content.workflow.title }}</h2>
        </div>
        <p>{{ content.workflow.description }}</p>
      </div>

      <ol class="workflow-steps">
        <li v-for="(step, index) in content.workflow.steps" :key="step.number" class="workflow-step">
          <div class="workflow-step__top">
            <span class="workflow-step__icon">
              <component :is="stepIcons[index]" :size="21" :stroke-width="1.65" aria-hidden="true" />
            </span>
            <span class="workflow-step__number">{{ step.number }}</span>
          </div>
          <h3>{{ step.title }}</h3>
          <p>{{ step.body }}</p>
          <ArrowRight
            v-if="index < content.workflow.steps.length - 1"
            class="workflow-step__arrow"
            :size="18"
            :stroke-width="1.4"
            aria-hidden="true"
          />
        </li>
      </ol>
    </div>
  </section>
</template>
