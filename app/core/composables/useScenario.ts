import { computed, onMounted, onUnmounted, shallowRef, ref } from 'vue'
import { freshState } from '../scenario/engine.ts'
import { readRecord, writeState, SCENARIO_LOCK, restoreRecord, saveRecording } from '../scenario/persistence.ts'
import type { SavedRecording, ScenarioRecord, ScenarioState } from '../types/scenario.ts'

export function useScenario() {
  const state = shallowRef<ScenarioState>(freshState())
  const ready = ref(false)
  const writable = ref(false)
  const saving = ref(false)
  const error = ref('')
  const recordings = shallowRef<SavedRecording[]>([])
  let release: (() => void) | null = null
  let channel: BroadcastChannel | null = null
  let writes: Promise<void> = Promise.resolve()
  let disposed = false
  let pending = 0
  async function load() {
    const record = await readRecord()
    state.value = record.state
    recordings.value = record.media
  }
  async function acquire() {
    if (writable.value || disposed) return
    if (!navigator.locks) {
      error.value = '当前浏览器不支持安全的多标签保存，请使用新版 Chrome 或 Edge。'
      ready.value = true
      return
    }
    // Keep the lock alive for the page lifetime. No timeout-based leases that background tabs could accidentally outlive.
    void navigator.locks.request(SCENARIO_LOCK, { ifAvailable: true }, async lock => {
      if (disposed) return
      try {
        await load()
        if (disposed) return
        error.value = ''
        ready.value = true
        if (!lock) return
        writable.value = true
        await new Promise<void>(resolve => {
          release = resolve
        })
      } catch (e) {
        error.value = `无法读取学习记录：${(e as Error).message}。当前数据未被覆盖。`
        ready.value = true
      } finally {
        writable.value = false
        release = null
      }
    })
  }
  function stopWriting() {
    writable.value = false
    void writes.finally(() => release?.())
  }
  function takeover() {
    channel?.postMessage('takeover')
    setTimeout(() => {
      if (!disposed) void acquire()
    }, 350)
  }
  function enqueue(action: () => Promise<void>): Promise<boolean> {
    pending++
    saving.value = true
    const operation = writes.then(action)
    writes = operation
      .catch(e => {
        error.value = `未保存：${(e as Error).message}。请重试保存或导出记录。`
      })
      .finally(() => {
        pending--
        saving.value = pending > 0
      })
    return operation.then(
      () => true,
      () => false
    )
  }
  function change(reducer: (current: ScenarioState) => ScenarioState): Promise<boolean> {
    if (!writable.value || error.value) return Promise.resolve(false)
    const next = reducer(state.value)
    if (next === state.value) return Promise.resolve(true)
    state.value = next
    return enqueue(async () => {
      await writeState(next)
      if (!disposed) channel?.postMessage('saved')
    })
  }
  async function retry() {
    if (!writable.value) return acquire()
    const snapshot = structuredClone(state.value)
    const ok = await enqueue(() => writeState(snapshot))
    if (ok) error.value = ''
  }
  async function restore(record: ScenarioRecord) {
    if (!writable.value || error.value) throw new Error('请先在当前标签接管学习并解决保存错误。')
    const ok = await enqueue(() => restoreRecord(record))
    if (ok) {
      await load()
      channel?.postMessage('saved')
    }
    return ok
  }
  async function keepRecording(recording: SavedRecording) {
    if (!writable.value || error.value) return false
    const ok = await enqueue(() => saveRecording(recording))
    if (ok) recordings.value = [...recordings.value.filter(r => r.id !== recording.id), recording]
    return ok
  }
  onMounted(() => {
    channel = new BroadcastChannel(SCENARIO_LOCK)
    channel.onmessage = event => {
      if (event.data === 'takeover' && writable.value) stopWriting()
      if (event.data === 'saved' && !writable.value) void load().catch(() => {})
    }
    void acquire()
  })
  onUnmounted(() => {
    disposed = true
    stopWriting()
    channel?.close()
  })
  return {
    state,
    ready,
    writable,
    saving,
    error,
    recordings,
    change,
    retry,
    takeover,
    restore,
    keepRecording,
    enabled: computed(() => ready.value && writable.value && !error.value),
  }
}
