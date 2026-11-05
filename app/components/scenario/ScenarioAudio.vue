<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted, watch } from 'vue'
import type { SavedRecording } from '@/core/types/scenario'
import courseAudioManifest from '../../../public/scenarios/audio/manifest.json'

const props = defineProps<{
  text: string
  taskId: string
  sessionId: string
  enabled: boolean
  canRecord?: boolean
  saved: SavedRecording[]
}>()
const emit = defineEmits<{ heard: []; failed: []; keep: [recording: SavedRecording] }>()
const voices = ref<SpeechSynthesisVoice[]>([])
const selectedVoice = ref('course')
const playback = ref('')
const micState = ref<'idle' | 'waiting' | 'recording'>('idle')
const micError = ref('')
const audioUrl = ref('')
const recording = shallowRef<SavedRecording | null>(null)
const savedUrl = ref('')
let generation = 0
let speechGeneration = 0
let stream: MediaStream | null = null
let recorder: MediaRecorder | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let speechTimer: ReturnType<typeof setTimeout> | null = null
let disposed = false
let coursePlayer: HTMLAudioElement | null = null
const playerId = Math.random().toString(36)
const appBase = useRuntimeConfig().app.baseURL
function updateVoices() {
  voices.value = window.speechSynthesis?.getVoices().filter(v => v.lang.toLowerCase().startsWith('en')) ?? []
}
function stopSpeech() {
  speechGeneration++
  if (speechTimer) clearTimeout(speechTimer)
  window.speechSynthesis?.cancel()
  if (coursePlayer) {
    coursePlayer.pause()
    coursePlayer.src = ''
    coursePlayer = null
  }
}
function startPlayback() {
  window.dispatchEvent(new CustomEvent('typewords-scenario-play', { detail: playerId }))
  document.querySelectorAll('audio').forEach(audio => audio.pause())
}
function onOtherPlayback(event: Event) {
  if ((event as CustomEvent).detail !== playerId) stopSpeech()
}
function play(slow = false) {
  stopSpeech()
  startPlayback()
  const asset = (courseAudioManifest as Record<string, string>)[props.text]
  const token = speechGeneration
  if (asset && selectedVoice.value === 'course') {
    const audio = new Audio(`${appBase.replace(/\/$/, '')}${asset}`)
    coursePlayer = audio
    audio.playbackRate = slow ? 0.75 : 1
    playback.value = '正在播放课程示范…'
    audio.onended = () => {
      if (token !== speechGeneration) return
      if (speechTimer) clearTimeout(speechTimer)
      playback.value = '播放结束，可以再听一次。'
      emit('heard')
    }
    const failed = () => {
      if (token !== speechGeneration) return
      stopSpeech()
      playback.value = '课程音频播放失败。请重试、更换声音，或看文字继续。'
      emit('failed')
    }
    audio.onerror = failed
    speechTimer = setTimeout(failed, 20000)
    void audio.play().catch(failed)
    return
  }
  if (!window.speechSynthesis || !voices.value.length) {
    playback.value = '英文声音不可用。可以更换声音后重试，或看文字继续；本题不会记为听力通过。'
    emit('failed')
    return
  }
  const speech = new SpeechSynthesisUtterance(props.text)
  speech.lang = 'en-US'
  speech.rate = slow ? 0.65 : 0.9
  speech.voice =
    voices.value.find(v => v.voiceURI === selectedVoice.value) ??
    voices.value.find(v => v.localService) ??
    voices.value[0]
  playback.value = '正在播放…'
  speech.onend = () => {
    if (token !== speechGeneration) return
    if (speechTimer) clearTimeout(speechTimer)
    playback.value = '播放结束，可以再听一次。'
    emit('heard')
  }
  speech.onerror = () => {
    if (token !== speechGeneration) return
    if (speechTimer) clearTimeout(speechTimer)
    playback.value = '播放失败。请重试、更换声音，或看文字继续。'
    emit('failed')
  }
  speechTimer = setTimeout(() => {
    if (token !== speechGeneration) return
    stopSpeech()
    playback.value = '声音没有响应。请重试、更换声音，或看文字继续。'
    emit('failed')
  }, 20000)
  window.speechSynthesis.speak(speech)
}
function releaseStream() {
  stream?.getTracks().forEach(t => t.stop())
  stream = null
  if (timer) clearTimeout(timer)
  micState.value = 'idle'
}
function stopRecording(discard = false) {
  if (discard) generation++
  if (recorder?.state === 'recording') recorder.stop()
  recorder = null
  releaseStream()
}
async function record() {
  stopSpeech()
  startPlayback()
  stopRecording(true)
  const token = generation
  micError.value = ''
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    micError.value = '这个浏览器无法录音。仍可直接开口，再看范例自评。'
    return
  }
  micState.value = 'waiting'
  try {
    const incoming = await navigator.mediaDevices.getUserMedia({ audio: true })
    if (token !== generation || disposed || !props.enabled) {
      incoming.getTracks().forEach(t => t.stop())
      return
    }
    stream = incoming
    const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t =>
      MediaRecorder.isTypeSupported(t)
    )
    const current = new MediaRecorder(incoming, mimeType ? { mimeType } : undefined)
    recorder = current
    const chunks: BlobPart[] = []
    current.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data)
    }
    current.onstop = () => {
      releaseStream()
      if (token !== generation || disposed) return
      const blob = new Blob(chunks, { type: current.mimeType })
      if (!blob.size) {
        micError.value = '没有录到声音，请重试或直接开口。'
        return
      }
      if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
      audioUrl.value = URL.createObjectURL(blob)
      recording.value = {
        id: crypto.randomUUID(),
        sessionId: props.sessionId,
        taskId: props.taskId,
        mimeType: blob.type,
        createdAt: new Date().toISOString(),
        blob,
      }
    }
    current.onerror = () => {
      micError.value = '录音中断，请重试或直接开口。'
      stopRecording(true)
    }
    current.start()
    micState.value = 'recording'
    timer = setTimeout(() => stopRecording(), 60000)
  } catch {
    if (token !== generation || disposed) return
    releaseStream()
    micError.value = '无法使用麦克风。可以检查权限，也可以直接开口并自评。'
  }
}
function refreshSaved() {
  if (savedUrl.value) URL.revokeObjectURL(savedUrl.value)
  const media = props.saved.findLast(m => m.taskId === props.taskId)
  savedUrl.value = media ? URL.createObjectURL(media.blob) : ''
}
function playRecording(event: Event) {
  stopSpeech()
  window.dispatchEvent(new CustomEvent('typewords-scenario-play', { detail: playerId }))
  document.querySelectorAll('audio').forEach(audio => {
    if (audio !== event.target) audio.pause()
  })
}
watch(() => props.saved, refreshSaved)
watch(
  () => props.enabled,
  enabled => {
    if (!enabled) {
      stopSpeech()
      stopRecording(true)
    }
  }
)
onMounted(() => {
  updateVoices()
  window.speechSynthesis?.addEventListener('voiceschanged', updateVoices)
  window.addEventListener('typewords-scenario-play', onOtherPlayback)
  refreshSaved()
})
onUnmounted(() => {
  disposed = true
  stopSpeech()
  stopRecording(true)
  window.speechSynthesis?.removeEventListener('voiceschanged', updateVoices)
  window.removeEventListener('typewords-scenario-play', onOtherPlayback)
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
  if (savedUrl.value) URL.revokeObjectURL(savedUrl.value)
})
</script>

<template>
  <section class="scenario-audio" aria-label="播放与录音">
    <div class="actions">
      <button type="button" :disabled="!enabled" @click="play()">播放{{ canRecord ? '问题' : '示范' }}</button>
      <button type="button" :disabled="!enabled" @click="play(true)">慢一点</button>
      <label v-if="voices.length" class="voice-label"
        >声音
        <select v-model="selectedVoice" aria-label="英文声音" @change="stopSpeech">
          <option value="course">课程示范（如有）</option>
          <option v-for="voice in voices" :key="voice.voiceURI" :value="voice.voiceURI">{{ voice.name }}</option>
        </select>
      </label>
    </div>
    <p v-if="playback" role="status">{{ playback }}</p>
    <div v-if="canRecord" class="recorder">
      <p>先自己回答。录音可选，仅在本机回听，不自动评分。</p>
      <div class="actions">
        <button v-if="micState === 'idle'" :disabled="!enabled" @click="record">开始录音</button>
        <button v-if="micState === 'waiting'" @click="stopRecording(true)">取消等待，直接开口</button>
        <button v-if="micState === 'recording'" @click="stopRecording()">结束录音（最多 60 秒）</button>
        <button v-if="micState === 'recording'" @click="stopRecording(true)">取消录音</button>
      </div>
      <p v-if="micError" role="status">{{ micError }}</p>
      <div v-if="audioUrl">
        <audio :src="audioUrl" controls aria-label="回听本次录音" @play="playRecording" />
        <button
          :disabled="!enabled || saved.some(m => m.id === recording?.id)"
          @click="recording && emit('keep', recording)"
        >
          {{ saved.some(m => m.id === recording?.id) ? '录音已保留' : '保留这次录音' }}
        </button>
      </div>
      <div v-if="savedUrl && !audioUrl">
        <p>此前保留的录音</p>
        <audio :src="savedUrl" controls aria-label="回听已保留录音" @play="playRecording" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.voice-label {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  max-width: 100%;
}
select {
  max-width: 180px;
  padding: 8px;
  border: 1px solid var(--color-item-border, #ddd);
  background: var(--color-second, #fff);
  border-radius: 8px;
}
p {
  font-size: 14px;
  line-height: 1.7;
}
.recorder {
  margin-top: 24px;
  padding-top: 14px;
  border-top: 1px solid var(--color-item-border, #ddd);
}
audio {
  display: block;
  margin: 12px 0;
  max-width: 100%;
}
</style>
