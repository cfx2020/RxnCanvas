<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { Maximize, Pause, Play, Volume2, VolumeX, X } from '@lucide/vue'
import { useSiteContent } from '../sitePreferences'

const dialog = ref(null)
const video = ref(null)
const playing = ref(false)
const muted = ref(false)
const currentTime = ref(0)
const duration = ref(58)
const content = useSiteContent()

const progress = computed(() => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
})

function formatTime(value) {
  if (!Number.isFinite(value)) return '0:00'
  const seconds = Math.max(0, Math.floor(value))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function openVideo() {
  dialog.value?.showModal()
  currentTime.value = 0
  playing.value = false
}

function closeVideo() {
  video.value?.pause()
  dialog.value?.close()
}

function closeOnBackdrop(event) {
  if (event.target === dialog.value) closeVideo()
}

function togglePlayback() {
  if (video.value?.paused) {
    video.value.play().catch(() => {})
  } else {
    video.value?.pause()
  }
}

function seek(event) {
  if (!video.value) return
  video.value.currentTime = Number(event.target.value)
  currentTime.value = video.value.currentTime
}

function toggleMute() {
  if (!video.value) return
  video.value.muted = !video.value.muted
  muted.value = video.value.muted
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    video.value?.parentElement?.requestFullscreen?.()
  }
}

function syncTime() {
  currentTime.value = video.value?.currentTime ?? 0
}

function syncDuration() {
  if (Number.isFinite(video.value?.duration)) duration.value = video.value.duration
}

onBeforeUnmount(() => {
  video.value?.pause()
})
</script>

<template>
  <section id="demo" class="demo-section">
    <div class="section__inner">
      <div class="demo-section__head">
        <div>
          <p class="section-kicker">{{ content.demo.kicker }}</p>
          <h2>{{ content.demo.title }}</h2>
        </div>
        <p>{{ content.demo.description }}</p>
      </div>

      <button class="demo-poster" type="button" :aria-label="content.demo.play" @click="openVideo">
        <img
          src="/assets/rxncanvas-demo-poster.jpg"
          alt=""
          width="1920"
          height="1080"
        >
        <span class="demo-poster__veil"></span>
        <span class="demo-poster__play"><Play :size="26" fill="currentColor" aria-hidden="true" /></span>
        <span class="demo-poster__meta">
          <strong>{{ content.demo.titleCard }}</strong>
          <span>{{ content.demo.meta }}</span>
        </span>
      </button>
    </div>

    <dialog ref="dialog" class="video-dialog" @click="closeOnBackdrop" @close="video?.pause()">
      <div class="video-dialog__inner">
        <button class="video-dialog__close" type="button" :aria-label="content.demo.close" @click="closeVideo">
          <X :size="21" aria-hidden="true" />
        </button>
        <video
          ref="video"
          src="/assets/rxncanvas-demo.mp4"
          poster="/assets/rxncanvas-demo-poster.jpg"
          playsinline
          preload="metadata"
          @play="playing = true"
          @pause="playing = false"
          @timeupdate="syncTime"
          @loadedmetadata="syncDuration"
          @click="togglePlayback"
        ></video>
        <div class="video-controls">
          <button type="button" :aria-label="playing ? content.demo.pause : content.demo.playVideo" @click="togglePlayback">
            <Pause v-if="playing" :size="17" fill="currentColor" aria-hidden="true" />
            <Play v-else :size="17" fill="currentColor" aria-hidden="true" />
          </button>
          <span class="video-controls__time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
          <input
            class="video-controls__progress"
            type="range"
            min="0"
            :max="duration"
            step="0.1"
            :value="currentTime"
            :style="{ '--progress': `${progress}%` }"
            :aria-label="content.demo.progress"
            @input="seek"
          >
          <button type="button" :aria-label="muted ? content.demo.unmute : content.demo.mute" @click="toggleMute">
            <VolumeX v-if="muted" :size="18" aria-hidden="true" />
            <Volume2 v-else :size="18" aria-hidden="true" />
          </button>
          <button type="button" :aria-label="content.demo.fullscreen" @click="toggleFullscreen">
            <Maximize :size="18" aria-hidden="true" />
          </button>
        </div>
      </div>
    </dialog>
  </section>
</template>
