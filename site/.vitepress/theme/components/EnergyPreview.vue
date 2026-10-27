<script setup>
import { ref } from 'vue'
import { useSiteContent } from '../sitePreferences'

const mode = ref('relative')
const content = useSiteContent()

const rows = {
  relative: [
    ['Reactant', '0.00', '0.00', '0.00', '0.00'],
    ['TS', '72.41', '71.44', '71.44', '71.44'],
    ['Product', '69.16', '66.37', '66.37', '66.37']
  ],
  absolute: [
    ['Reactant', '-3232678.79', '-3232237.89', '-3232235.99', '-3232237.89'],
    ['TS', '-3232606.38', '-3232166.45', '-3232164.55', '-3232166.45'],
    ['Product', '-3232609.62', '-3232171.52', '-3232169.62', '-3232171.52']
  ]
}
</script>

<template>
  <div class="energy-preview">
    <div class="energy-preview__top">
      <div>
        <span>Energy Table</span>
        <strong>{{ mode === 'relative' ? content.energy.tableTitle : content.energy.tableTitleAbsolute }}</strong>
      </div>
      <div class="energy-preview__switch" :aria-label="content.energy.label">
        <button
          type="button"
          :class="{ active: mode === 'relative' }"
          :aria-pressed="mode === 'relative'"
          @click="mode = 'relative'"
        >
          {{ content.energy.relative }}
        </button>
        <button
          type="button"
          :class="{ active: mode === 'absolute' }"
          :aria-pressed="mode === 'absolute'"
          @click="mode = 'absolute'"
        >
          {{ content.energy.absolute }}
        </button>
      </div>
    </div>
    <div class="energy-preview__table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ content.energy.structure }}</th>
            <th>{{ mode === 'relative' ? 'ΔEgas' : 'Egas' }}</th>
            <th>{{ mode === 'relative' ? 'ΔGgas' : 'Ggas' }}</th>
            <th>{{ mode === 'relative' ? 'ΔGgas+1M' : 'Ggas+1M' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows[mode]" :key="row[0]">
            <td>{{ row[0] }}</td>
            <td>{{ row[1] }}</td>
            <td>{{ row[2] }}</td>
            <td>{{ row[3] }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="energy-preview__note">{{ content.energy.note }}</p>
  </div>
</template>
