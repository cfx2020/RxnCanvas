<script setup>
import SiteHeader from './SiteHeader.vue'
import HeroSection from './HeroSection.vue'
import WorkflowSection from './WorkflowSection.vue'
import ProductSections from './ProductSections.vue'
import DemoSection from './DemoSection.vue'
import FormatSection from './FormatSection.vue'
import DownloadSection from './DownloadSection.vue'
import SiteFooter from './SiteFooter.vue'
</script>

<template>
  <div class="rxn-site">
    <SiteHeader />
    <main>
      <HeroSection />
      <WorkflowSection />
      <ProductSections />
      <DemoSection />
      <FormatSection />
      <DownloadSection />
    </main>
    <SiteFooter />
  </div>
</template>
