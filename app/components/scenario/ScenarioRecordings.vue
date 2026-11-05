<script setup lang="ts">
import { shallowRef, watch, onUnmounted } from 'vue'
import type { SavedRecording, Attempt } from '@/core/types/scenario'
const props = defineProps<{ recordings: SavedRecording[]; attempts: Attempt[] }>()
const items = shallowRef<{ recording: SavedRecording; url: string }[]>([])
function clear() {
  items.value.forEach(item => URL.revokeObjectURL(item.url))
}
watch(
  () => props.recordings,
  recordings => {
    clear()
    items.value = recordings.map(recording => ({ recording, url: URL.createObjectURL(recording.blob) }))
  },
  { immediate: true }
)
function play(event: Event) {
  window.speechSynthesis?.cancel()
  window.dispatchEvent(new CustomEvent('typewords-scenario-play', { detail: 'library' }))
  document.querySelectorAll('audio').forEach(audio => {
    if (audio !== event.target) audio.pause()
  })
}
onUnmounted(clear)
</script>
<template>
  <section v-if="items.length" aria-label="保留录音">
    <h2>保留的录音</h2>
    <div v-for="item in items" :key="item.recording.id" class="recording-item">
      <p>
        {{ attempts.find(a => a.taskId === item.recording.taskId)?.english ?? '未完成练习的录音' }}<br />
        <small
          >{{ new Date(item.recording.createdAt).toLocaleString('zh-CN') }} ·
          {{ Math.ceil(item.recording.blob.size / 1024) }} KB</small
        >
      </p>
      <audio :src="item.url" controls preload="none" aria-label="回听保留录音" @play="play" />
    </div>
  </section>
</template>
<style scoped>
.recording-item {
  padding: 16px 0;
  border-bottom: 1px solid var(--color-item-border, #ddd);
}
p {
  line-height: 1.8;
  margin: 0 0 12px;
  overflow-wrap: anywhere;
}
small {
  color: var(--color-sub-text, #746d7f);
}
audio {
  display: block;
  max-width: 100%;
}
h2 {
  font-size: 21px;
  margin: 30px 0 10px;
}
</style>
