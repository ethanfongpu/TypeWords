<script setup lang="ts">
import { computed, ref, shallowRef, watch, onMounted, onUnmounted } from 'vue'
import ScenarioAudio from '@/components/scenario/ScenarioAudio.vue'
import ScenarioRecordings from '@/components/scenario/ScenarioRecordings.vue'
import { useScenario } from '@/core/composables/useScenario'
import { personalFields, starterLessons } from '@/core/scenario/courses'
import {
  checkAnswer,
  cloneState,
  commitTask,
  dueKeys,
  isIndependentAnswer,
  isSpokenRating,
  localDay,
  sessionAttempts,
  startSession,
} from '@/core/scenario/engine'
import { appendScenarioZip, parseScenarioZip } from '@/core/scenario/persistence'
import { loadJsLib } from '@/core/utils'
import { LIB_JS_URL } from '@/core/config/env'
import type { Hint, Outcome, LearnerProfile, ScenarioState, ScenarioRecord } from '@/core/types/scenario'

useHead({ title: '场景短课 · TypeWords 个人学习版' })
const { state, ready, writable, saving, error, enabled, recordings, change, retry, takeover, restore, keepRecording } =
  useScenario(flushDraft)
const view = ref<'today' | 'practice' | 'profile' | 'progress' | 'backup'>('today')
const busy = ref(false)
const draft = ref('')
const feedback = ref('')
const checked = ref(false)
const composing = ref(false)
const profileDraft = ref<LearnerProfile>({ ...state.value.profile })
const answerDraft = ref<NonNullable<LearnerProfile['answers']>>({})
const pendingImport = shallowRef<ScenarioRecord | null>(null)
const notice = ref('')
const includeMedia = ref(true)
const session = computed(() => state.value.session)
const task = computed(() => session.value?.queue[session.value.index])
const lessons = computed(() => starterLessons(state.value.profile))
const clock = ref(Date.now())
const due = computed(() => dueKeys(state.value, new Date(clock.value)))
let dueTimer: ReturnType<typeof setTimeout>
function refreshDue() {
  clearTimeout(dueTimer)
  clock.value = Date.now()
  const next = Math.min(
    ...Object.values(state.value.cards)
      .map(card => +new Date(card.card.due))
      .filter(time => time > clock.value)
  )
  if (Number.isFinite(next)) dueTimer = setTimeout(refreshDue, Math.min(next - clock.value, 2_147_483_647))
}
watch(() => state.value.cards, refreshDue)
const recommended = computed(
  () => lessons.value.find(l => !state.value.completedLessons.includes(l.id)) ?? lessons.value[0]
)
const currentAttempts = computed(() => (session.value ? sessionAttempts(state.value, session.value) : []))
const spoken = computed(() => currentAttempts.value.filter(isSpokenRating))
const listened = computed(() => currentAttempts.value.filter(a => a.source === 'rule' && a.scheduled))
const choices = computed(() => {
  const options = [...(task.value?.expression.choices ?? [])]
  const offset = (task.value?.expression.id.length ?? 0) % 3
  return [...options.slice(offset), ...options.slice(0, offset)]
})
const recentSpeaking = computed(() => {
  const latest = new Map<string, (typeof state.value.attempts)[number]>()
  for (const a of state.value.attempts) {
    if (isSpokenRating(a)) {
      latest.delete(a.expressionId)
      latest.set(a.expressionId, a)
    }
  }
  return [...latest.values()].reverse().slice(0, 8)
})
const recentDays = computed(() => {
  const days = new Map<string, { count: number; self: number; independent: number }>()
  for (const a of state.value.attempts) {
    const day = localDay(new Date(a.createdAt))
    const item = days.get(day) ?? { count: 0, self: 0, independent: 0 }
    item.count++
    if (isSpokenRating(a)) item.self++
    if (isIndependentAnswer(a)) item.independent++
    days.set(day, item)
  }
  return [...days.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 7)
})
let draftTimer: ReturnType<typeof setTimeout> | null = null
let activityAt = 0
let activePending = 0
let interval: ReturnType<typeof setInterval> | null = null
function editSession(edit: (s: NonNullable<ScenarioState['session']>) => void) {
  const id = session.value?.id
  const taskId = task.value?.id
  return change(current => {
    if (!current.session || current.session.id !== id || current.session.queue[current.session.index]?.id !== taskId)
      return current
    const next = cloneState(current)
    edit(next.session!)
    return next
  })
}
function resetStep() {
  if (draftTimer) clearTimeout(draftTimer)
  draft.value = session.value?.draft ?? ''
  feedback.value = ''
  checked.value = false
  activityAt = 0
}
watch([() => task.value?.id, writable], resetStep, { flush: 'sync' })
watch(
  () => session.value?.draft,
  () => {
    if (!writable.value) resetStep()
  }
)
const listenChoice = computed(() => (task.value?.kind === 'listen' ? (session.value?.draft ?? '') : ''))
const listenFeedback = computed(() =>
  listenChoice.value === task.value?.expression.chinese ? '听懂了这句的意思。' : '这次没有选对。看看中文，再听一遍。'
)
watch(view, () => {
  activityAt = 0
  if (view.value === 'profile') {
    profileDraft.value = { ...state.value.profile }
    answerDraft.value = { ...state.value.profile.answers }
  }
})
function activity() {
  const now = Date.now()
  if (view.value === 'practice' && task.value && enabled.value && !document.hidden) {
    if (activityAt && now - activityAt < 30000) activePending += now - activityAt
    activityAt = now
  }
}
function flushActivity() {
  if (!activePending || !enabled.value || error.value || !task.value) return
  const ms = activePending
  activePending = 0
  void change(current => {
    if (!current.session || current.session.finishedAt) return current
    const next = cloneState(current)
    next.session!.activeMs += ms
    const day = localDay()
    next.activityDays[day] = (next.activityDays[day] ?? 0) + ms
    return next
  })
}
function saveDraft() {
  if (draftTimer) clearTimeout(draftTimer)
  if (composing.value || !enabled.value) return
  const value = draft.value
  draftTimer = setTimeout(() => {
    void editSession(s => {
      s.draft = value
    })
  }, 200)
}
function flushDraft() {
  if (draftTimer) clearTimeout(draftTimer)
  if (task.value?.kind === 'type' && !composing.value && draft.value !== session.value?.draft)
    return editSession(s => {
      s.draft = draft.value
    })
}
function onDraftInput() {
  checked.value = false
  feedback.value = ''
  saveDraft()
}
function onCompositionEnd() {
  composing.value = false
  saveDraft()
}
function markTypo() {
  void editSession(s => {
    if (s.corrections.length < 100) s.corrections.push('[手滑更正] ' + draft.value)
  })
  feedback.value = '已标记手滑。修改后可以重新检查，原始提交会保留。'
}
async function setHint(level: Hint) {
  await editSession(s => {
    s.hint = Math.max(s.hint, level) as Hint
  })
}
async function begin(lessonId?: string, quick = false, reviewOnly = false) {
  if (busy.value || !enabled.value) return
  busy.value = true
  try {
    const ok = await change(current => startSession(current, crypto.randomUUID(), { lessonId, quick, reviewOnly }))
    if (ok && session.value && !session.value.finishedAt) {
      view.value = 'practice'
      resetStep()
    } else notice.value = '目前没有到期的复习，先选一节短课吧。'
  } finally {
    busy.value = false
  }
}
async function submit(outcome: Outcome, raw = draft.value) {
  if (!task.value || !session.value || !enabled.value || busy.value) return
  const sessionId = session.value.id
  const taskId = task.value.id
  busy.value = true
  if (draftTimer) clearTimeout(draftTimer)
  flushActivity()
  try {
    await change(current => commitTask(current, sessionId, taskId, outcome, raw))
  } finally {
    busy.value = false
  }
}
async function checkTyping() {
  if (!task.value || !draft.value.trim() || !enabled.value || composing.value) return
  checked.value = true
  if (checkAnswer(draft.value, task.value.expression.accepted) === 'accepted') {
    feedback.value = '这句符合参考表达。跟写只记录练习，不计独立掌握。'
  } else {
    feedback.value = '未自动判定。请对照范例自查，也可以修改后再提交。'
    await editSession(s => {
      if (s.corrections.length < 100) s.corrections.push(draft.value)
    })
  }
}
async function answerListen(choice: string) {
  if (!enabled.value || busy.value || listenChoice.value || !session.value?.heard || session.value.audioFailed) return
  await editSession(s => {
    s.draft = choice
  })
}
async function pause() {
  if (draftTimer) clearTimeout(draftTimer)
  flushActivity()
  await flushDraft()
  view.value = 'today'
}
async function nextLesson() {
  if (busy.value) return
  await change(current => ({ ...cloneState(current), session: null }))
  view.value = 'today'
}
async function saveProfile() {
  const profile = { ...profileDraft.value, answers: { ...answerDraft.value } }
  for (const key of ['name', 'role', 'product', 'category', 'audience', 'action'] as const)
    profile[key] = profile[key].trim().slice(0, 200)
  for (const { field, label } of Object.values(personalFields)) {
    const answer = profile.answers[field]?.trim()
    if (!answer) {
      delete profile.answers[field]
      continue
    }
    if (!profile[field] || !/[a-z]/i.test(answer)) {
      notice.value = '请为“' + label + '”填写中文意思和对应的英文句子。'
      return
    }
    profile.answers[field] = answer
  }
  if (profile.name && !/^[\p{L}\p{M} .'-]+$/u.test(profile.name)) {
    notice.value = '称呼请填写姓名，不要填入句子或特殊符号。'
    return
  }
  const ok = await change(current => ({ ...cloneState(current), profile }))
  if (ok) {
    notice.value = '资料已保存。下一次新课将使用你保存的表达。'
    view.value = 'today'
  }
}
async function exportBackup() {
  busy.value = true
  notice.value = ''
  try {
    const JSZip = await loadJsLib('JSZip', LIB_JS_URL.JSZIP)
    const zip = new JSZip()
    // Export the in-memory snapshot too, so the user can rescue drafts after a storage failure.
    await appendScenarioZip(zip, includeMedia.value)
    const record = JSON.parse(await zip.file('scenario/data.json').async('string'))
    record.state = cloneState(state.value)
    zip.file('scenario/data.json', JSON.stringify(record))
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `TypeWords-场景-${localDay()}.zip`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    if (enabled.value) await change(current => ({ ...cloneState(current), lastExportAt: new Date().toISOString() }))
    notice.value = '备份文件已生成，请保留下载的 ZIP 文件。'
  } catch (e) {
    notice.value = `导出失败：${(e as Error).message || String(e)}`
  } finally {
    busy.value = false
  }
}
async function inspectImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  pendingImport.value = null
  if (!file) return
  busy.value = true
  try {
    if (file.size > 80 * 1024 * 1024) throw new Error('文件超过 80 MB。')
    const JSZip = await loadJsLib('JSZip', LIB_JS_URL.JSZIP)
    const record = await parseScenarioZip(await JSZip.loadAsync(file))
    if (!record) {
      notice.value = '这个旧版备份没有场景数据，当前场景记录保持不变。请到原设置页恢复单词和文章。'
      return
    }
    pendingImport.value = record
  } catch (e) {
    notice.value = `未导入：${(e as Error).message || String(e)}`
  } finally {
    busy.value = false
    input.value = ''
  }
}
async function confirmImport() {
  if (!pendingImport.value || !enabled.value || busy.value) return
  busy.value = true
  try {
    if (await restore(pendingImport.value)) {
      pendingImport.value = null
      notice.value = '场景资料、练习进度、复习时间和保留录音已恢复。'
      resetStep()
    }
  } catch (e) {
    notice.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
function hidden() {
  if (!document.hidden) refreshDue()
  activityAt = 0
  flushActivity()
}
onMounted(() => {
  interval = setInterval(flushActivity, 15000)
  document.addEventListener('visibilitychange', hidden)
})
onUnmounted(() => {
  clearTimeout(dueTimer)
  if (draftTimer) clearTimeout(draftTimer)
  if (interval) clearInterval(interval)
  document.removeEventListener('visibilitychange', hidden)
})
</script>

<template>
  <main class="scenario-page" @pointerdown="activity" @keydown="activity">
    <header class="scenario-header">
      <NuxtLink to="/" class="brand">TypeWords <span>个人学习版</span></NuxtLink>
      <nav aria-label="场景导航">
        <button
          :class="{ selected: view === 'today' || view === 'practice' }"
          @click="view === 'practice' ? pause() : (view = 'today')"
        >
          今日短课
        </button>
        <button :class="{ selected: view === 'progress' }" @click="view = 'progress'">学习记录</button>
        <button :class="{ selected: view === 'profile' }" @click="view = 'profile'">我的资料</button>
        <button
          :class="{ selected: view === 'backup' }"
          @click="view === 'practice' ? pause().then(() => (view = 'backup')) : (view = 'backup')"
        >
          备份
        </button>
      </nav>
    </header>

    <div class="status-line" role="status">
      <span :class="{ danger: error }">{{
        !ready
          ? '正在读取记录…'
          : error
            ? error
            : !writable
              ? '当前为只读状态'
              : saving
                ? '正在保存…'
                : '已保存到本机 · 可导出迁移'
      }}</span>
      <button v-if="error" @click="retry">重试保存</button>
    </div>
    <div v-if="ready && !writable && !error" class="notice" role="alert">
      正在另一个标签学习。本页只读，避免覆盖进度。
      <button @click="takeover">在这里继续（接管）</button>
    </div>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>

    <template v-if="ready">
      <section v-if="view === 'today'" class="today">
        <div class="today-main">
          <h1>每天一点，<br />把英语用起来。</h1>
          <p class="intro">从一句问候开始。先听懂，再试着自己说。</p>
          <div class="daily-plan panel">
            <div class="plan-top"><span>今天练什么？</span><span>初学者 · 中文辅助</span></div>
            <h2>
              {{ session && !session.finishedAt ? session.title : due.length >= 6 ? '今天先复习' : recommended.title }}
            </h2>
            <p>
              {{
                session && !session.finishedAt
                  ? `上次练到第 ${session.index + 1} 步，进度已保留。`
                  : due.length >= 6
                    ? '先照顾到期的表达，今天不急着学新的。'
                    : recommended.goal
              }}
            </p>
            <fieldset class="duration" :disabled="!enabled || busy">
              <legend>今天留多少时间？</legend>
              <button
                v-for="minutes in [10, 15, 25]"
                :key="minutes"
                :aria-pressed="state.profile.dailyMinutes === minutes"
                :class="{ selected: state.profile.dailyMinutes === minutes }"
                @click="
                  change(s => ({ ...cloneState(s), profile: { ...s.profile, dailyMinutes: minutes as 10 | 15 | 25 } }))
                "
              >
                {{ minutes }} 分钟
              </button>
            </fieldset>
            <p class="small">
              {{ due.length }} 张卡到期 · 每次最多复习 6 张 ·
              {{
                state.profile.dailyMinutes === 10
                  ? '新课精简到 2 个表达'
                  : state.profile.dailyMinutes === 25
                    ? '学完后再回忆一句，并换个场景开口'
                    : '2–3 个短表达，按自己的节奏练习'
              }}
            </p>
            <button class="primary" :disabled="!enabled || busy" @click="begin()">
              {{ session && !session.finishedAt ? '继续上次练习' : '开始今天的练习' }} <span aria-hidden="true">→</span>
            </button>
            <button
              v-if="due.length && (!session || session.finishedAt)"
              class="text-button"
              :disabled="!enabled || busy"
              @click="begin(undefined, true)"
            >
              只有 3 分钟？先复习两张卡
            </button>
            <button v-if="session?.finishedAt" class="text-button" @click="view = 'practice'">查看上次回顾</button>
          </div>
        </div>
        <aside class="course-list">
          <h2>从介绍自己开始</h2>
          <p class="small">{{ lessons.length }} 节短课，随时暂停，不必一次学完。</p>
          <button
            v-for="(lesson, i) in lessons"
            :key="lesson.id"
            class="lesson-row"
            :disabled="!enabled || busy"
            @click="begin(lesson.id)"
          >
            <span class="lesson-number">{{ String(i + 1).padStart(2, '0') }}</span>
            <span
              ><strong>{{ lesson.title }}</strong
              ><small>{{ lesson.goal }}</small></span
            >
            <span class="lesson-state">{{ state.completedLessons.includes(lesson.id) ? '练过' : '→' }}</span>
          </button>
          <div class="original-links">
            <NuxtLink to="/words">单词练习</NuxtLink><NuxtLink to="/articles">文章练习</NuxtLink>
          </div>
          <p class="small">没有填写真实资料时使用明确标注的样例。基础学习不需要账号或 AI 密钥。</p>
        </aside>
      </section>

      <section v-if="view === 'practice' && session" class="practice panel">
        <header class="practice-top">
          <span>{{ session.title }}</span
          ><button @click="pause">暂停，稍后继续</button>
        </header>
        <template v-if="task">
          <p class="small">
            第 {{ session.index + 1 }} / {{ session.queue.length }} 步 ·
            {{
              task.extension === 'recall'
                ? '回忆练习'
                : task.extension === 'variant'
                  ? '换个场景开口'
                  : task.review
                    ? '到期复习'
                    : { learn: '认识这句话', listen: '听懂意思', type: '试着写一句', speak: '开口回答' }[task.kind]
            }}
          </p>
          <progress :value="session.index" :max="session.queue.length" aria-label="本次练习进度" />
          <p v-if="task.expression.sample" class="sample-note">练习样例 · 不代表你的真实工作或产品</p>

          <template v-if="task.kind === 'learn'">
            <h1 class="english">{{ task.expression.english }}</h1>
            <p class="meaning">{{ task.expression.chinese }}</p>
            <p class="explanation">{{ task.expression.note }}</p>
            <ScenarioAudio
              :key="task.id"
              :text="task.expression.english"
              :task-id="task.id"
              :session-id="session.id"
              :enabled="enabled"
              :saved="recordings"
            />
            <p class="small">听一听，再跟着读。跟读不计为独立回答。</p>
            <button class="primary" :disabled="!enabled || busy" @click="submit('practice')">我跟着读过了，继续</button>
          </template>

          <template v-else-if="task.kind === 'listen'">
            <h1>听一听，这句话是什么意思？</h1>
            <p class="small">先播放，再选择中文意思。声音不可用时可以看文字继续。</p>
            <ScenarioAudio
              :key="task.id"
              :text="task.expression.english"
              :task-id="task.id"
              :session-id="session.id"
              :enabled="enabled"
              :saved="recordings"
              @heard="
                editSession(s => {
                  if (listenChoice) return
                  s.heard = true
                  s.audioFailed = false
                })
              "
              @failed="
                editSession(s => {
                  if (listenChoice) return
                  s.audioFailed = true
                })
              "
            />
            <div class="choice-list">
              <button
                v-for="choice in choices"
                :key="choice"
                :disabled="
                  !enabled || busy || !!listenChoice || !session.heard || session.audioFailed || session.hint === 2
                "
                :class="{ chosen: listenChoice === choice }"
                @click="answerListen(choice)"
              >
                {{ choice }}
              </button>
            </div>
            <button class="text-button" :disabled="!enabled || busy || !!listenChoice" @click="setHint(2)">
              看文字继续（不计听力成绩）
            </button>
            <div v-if="session.hint === 2" class="hint-box">
              <strong>{{ task.expression.english }}</strong>
              <p>{{ task.expression.chinese }}</p>
            </div>
            <p v-if="listenChoice" role="status" class="feedback">{{ listenFeedback }}</p>
            <button
              v-if="listenChoice || session.hint === 2"
              class="primary"
              :disabled="!enabled || busy"
              @click="
                submit(
                  session.hint === 2 ? 'skip' : listenChoice === task.expression.chinese ? 'good' : 'again',
                  listenChoice
                )
              "
            >
              继续
            </button>
          </template>

          <template v-else>
            <h1>{{ task.expression.questionChinese }}</h1>
            <template v-if="task.kind === 'speak'">
              <ScenarioAudio
                :key="task.id"
                :text="task.expression.question"
                :task-id="task.id"
                :session-id="session.id"
                :enabled="enabled"
                :saved="recordings"
                can-record
                @keep="keepRecording"
              />
            </template>
            <p v-else class="meaning">试着写出：{{ task.expression.chinese }}</p>
            <div class="actions hints">
              <button :disabled="!enabled" @click="setHint(1)">需要一点提示</button
              ><button :disabled="!enabled" @click="setHint(2)">看看完整范例</button>
            </div>
            <div v-if="session.hint > 0" class="hint-box">
              <span class="small">{{
                session.hint === 2 ? '完整范例 · 本次记为跟练' : '句首提示 · 本次记为提示后完成'
              }}</span>
              <p class="english">{{ session.hint === 2 ? task.expression.english : task.expression.hint }}</p>
              <p>{{ task.expression.chinese }}</p>
              <ScenarioAudio
                v-if="session.hint === 2 && task.kind === 'speak'"
                :key="task.id + '-model'"
                :text="task.expression.english"
                :task-id="task.id"
                :session-id="session.id"
                :enabled="enabled"
                :saved="recordings"
              />
            </div>
            <form v-if="task.kind === 'type'" @submit.prevent="checkTyping">
              <label for="scenario-answer">写下你的回答</label>
              <textarea
                id="scenario-answer"
                v-model="draft"
                :disabled="!enabled || busy"
                maxlength="2000"
                rows="2"
                autocomplete="off"
                spellcheck="false"
                @input="onDraftInput"
                @compositionstart="composing = true"
                @compositionend="onCompositionEnd"
              />
              <div class="actions">
                <button type="submit" :disabled="!enabled || busy || !draft.trim()">检查这句话</button>
                <button
                  v-if="checked"
                  type="button"
                  class="primary"
                  :disabled="!enabled || busy"
                  @click="submit('practice')"
                >
                  我已自查，继续
                </button>
              </div>
              <p v-if="feedback" class="feedback" role="status">{{ feedback }}</p>
              <p v-if="checked && checkAnswer(draft, task.expression.accepted) === 'unjudged'">
                参考：{{ task.expression.english }}
              </p>
              <button v-if="checked" type="button" class="text-button" @click="markTypo">这次只是按错键</button>
            </form>
            <div v-else class="self-rating">
              <p>开口以后，再选择这次的感受。<strong>这是自评，不是发音评分。</strong></p>
              <div class="actions">
                <button :disabled="!enabled || busy" @click="submit('again')">没说出来</button
                ><button :disabled="!enabled || busy" @click="submit('hard')">看提示后说出来</button>
                <button :disabled="!enabled || busy" @click="submit('good')">自己说出来了</button
                ><button v-if="session.hint === 0" :disabled="!enabled || busy" @click="submit('easy')">
                  很轻松地说出来了
                </button>
              </div>
              <p v-if="session.hint > 0" class="small">本次已看过英文提示，仍按提示后完成记录，不计独立回答。</p>
            </div>
          </template>
          <button class="text-button skip" :disabled="!enabled || busy || !!listenChoice" @click="submit('skip')">
            这一步先跳过
          </button>
          <p v-if="session.activeMs >= state.profile.dailyMinutes * 60000" class="notice">
            已经练了一会儿，可以暂停，今天先到这里。进度会保留。
          </p>
        </template>
        <template v-else>
          <h1>今天，又多练了几句。</h1>
          <p class="intro">本次练习已结束。下次到期时，熟悉的表达会再出现。</p>
          <dl class="summary-grid">
            <div>
              <dt>听力自动判定</dt>
              <dd>{{ listened.filter(a => a.outcome === 'good').length }} / {{ listened.length }}</dd>
            </div>
            <div>
              <dt>开口自评（次）</dt>
              <dd>{{ spoken.length }}</dd>
            </div>
            <div>
              <dt>无英文提示完成（自评）</dt>
              <dd>{{ spoken.filter(isIndependentAnswer).length }}</dd>
            </div>
          </dl>
          <ul class="review-list">
            <li v-for="a in currentAttempts.filter(a => a.inputMode === 'speak')" :key="a.id">
              <strong>{{ a.english }}</strong
              ><span>{{
                a.outcome === 'skip'
                  ? '已跳过'
                  : a.hint === 2 || a.outcome === 'again'
                    ? '下次继续跟练'
                    : a.hint === 1 || a.outcome === 'hard'
                      ? '仍需提示 · 自评'
                      : '自己说出 · 自评'
              }}</span>
            </li>
          </ul>
          <p class="small">待复习 {{ due.length }} 张卡。录音次数不代表发音达标。</p>
          <button class="primary" :disabled="!enabled || busy" @click="nextLesson">结束今天的练习</button>
        </template>
      </section>

      <section v-if="view === 'profile'" class="settings panel">
        <h1>我的练习资料</h1>
        <p>
          资料只保存在本机。填写工作、产品、适用人群或用途的中文意思，再填对应的英文回答，即可在相关短课练习自己的句子。只填写资料时仍使用课程样例。
        </p>
        <form @submit.prevent="saveProfile">
          <label
            v-for="field in [
              ['name', '英文称呼（可留空）'],
              ['role', '我的工作'],
              ['product', '产品名称'],
              ['category', '产品类别'],
              ['audience', '适用人群'],
              ['action', '一个已确认的用途'],
            ] as const"
            :key="field[0]"
          >
            {{ field[1]
            }}<input
              v-model="profileDraft[field[0]]"
              :disabled="!enabled"
              :placeholder="field[0] === 'name' ? '未填写时使用练习样例 Alex' : '可留空，中文或英文均可'"
              maxlength="200"
          /></label>
          <label v-for="item in personalFields" :key="item.field">
            {{ item.label }}的英文回答（可选）
            <input v-model="answerDraft[item.field]" maxlength="200" :disabled="!enabled" :placeholder="item.example" />
          </label>
          <p class="small">课程里的销售、书、音箱等都是样例。价格、认证、交期等未知内容请先核实。</p>
          <button class="primary" :disabled="!enabled || busy" type="submit">保存资料</button>
        </form>
      </section>

      <section v-if="view === 'progress'" class="settings panel">
        <h1>看见每一次尝试</h1>
        <p>
          已练过 {{ state.completedLessons.length }} / {{ lessons.length }} 节短课。这表示完成练习，不代表已经掌握。
        </p>
        <h2>最近 7 个学习日</h2>
        <p v-if="!recentDays.length">还没有练习记录，先从一句问候开始。</p>
        <ul class="review-list">
          <li v-for="[day, stats] in recentDays" :key="day">
            <strong>{{ day }}</strong
            ><span
              >{{ stats.count }} 次练习 · {{ stats.self }} 次口头自评 · {{ stats.independent }} 次无英文提示口头回答 ·
              有效活动 {{ Math.round((state.activityDays[day] ?? 0) / 1000) }} 秒</span
            >
          </li>
        </ul>
        <template v-if="recentSpeaking.length">
          <h2>最近开口说过的表达</h2>
          <ul class="review-list">
            <li v-for="a in recentSpeaking" :key="a.id">
              <strong>{{ a.english }}</strong>
              <span
                >{{ isIndependentAnswer(a) ? '独立说出' : a.outcome === 'again' ? '还需练习' : '借助提示完成' }} ·
                最近一次自评</span
              >
            </li>
          </ul>
        </template>
        <h2>接下来复习</h2>
        <p v-if="!Object.keys(state.cards).length">完成听力和口头练习后，会分别生成复习卡。</p>
        <ul class="review-list">
          <li
            v-for="card in Object.values(state.cards)
              .slice()
              .sort((a, b) => +new Date(a.card.due) - +new Date(b.card.due))
              .slice(0, 12)"
            :key="card.expressionId + card.skill"
          >
            <strong>{{ card.expression.english }}</strong
            ><span
              >{{ card.skill === 'listen' ? '听懂' : '表达（自评）' }} ·
              {{ new Date(card.card.due).toLocaleString('zh-CN') }}</span
            >
          </li>
        </ul>
        <button v-if="due.length" class="primary" :disabled="!enabled || busy" @click="begin(undefined, false, true)">
          开始到期复习
        </button>
      </section>

      <section v-if="view === 'backup'" class="settings panel">
        <h1>让学习记录跟着你</h1>
        <p>场景数据保存在当前浏览器，不会自动云同步。换电脑或清理浏览器前，请先导出。</p>
        <p class="small">
          上次生成备份：{{ state.lastExportAt ? new Date(state.lastExportAt).toLocaleString('zh-CN') : '尚未导出' }} ·
          已保留 {{ recordings.length }} 段录音
        </p>
        <label class="check-label"
          ><input v-model="includeMedia" type="checkbox" /> 一并导出保留的录音（完整备份）</label
        >
        <button :disabled="busy" class="primary" @click="exportBackup">导出场景备份 ZIP</button>
        <p class="small">只含场景资料、记录、进度及所选录音，不包含账号凭据。单词与文章请使用原设置页的完整导出。</p>
        <h2>从备份恢复</h2>
        <p>先检查文件，确认后替换整个场景模块。单词和文章不受影响。</p>
        <label class="file-label"
          >选择备份文件<input type="file" accept=".zip" :disabled="!enabled || busy" @change="inspectImport"
        /></label>
        <div v-if="pendingImport" class="notice">
          <p>
            文件包含 {{ pendingImport.state.attempts.length }} 次练习、{{
              Object.keys(pendingImport.state.cards).length
            }}
            张复习卡、{{ pendingImport.media.length }} 段录音。确认后会替换当前场景资料、进度和录音。
          </p>
          <div class="actions">
            <button :disabled="busy" @click="exportBackup">先导出当前记录</button
            ><button :disabled="busy || !enabled" @click="confirmImport">确认替换场景数据</button
            ><button @click="pendingImport = null">取消</button>
          </div>
        </div>
        <NuxtLink to="/setting?index=5">前往原设置页（单词、文章及完整备份）</NuxtLink>
        <ScenarioRecordings :recordings="recordings" :attempts="state.attempts" />
      </section>
    </template>
    <footer class="scenario-footer">按自己的节奏，练习真实能用的一句。<span>本地保存 · 无需付费 AI</span></footer>
  </main>
</template>

<style scoped>
.scenario-page {
  --accent: #6d4ed5;
  max-width: 1120px;
  margin: 0 auto;
  padding: 28px 36px 20px;
  color: var(--color-main-text, #24212e);
  font-family: var(--font-family), sans-serif;
  box-sizing: border-box;
}
.scenario-header,
.scenario-header nav,
.status-line,
.actions,
.practice-top,
.original-links,
.plan-top {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.scenario-header {
  justify-content: space-between;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--color-item-border, #e6e2ec);
}
.brand {
  color: var(--color-main-text, #25202d);
  font-size: 21px;
  font-weight: 750;
  letter-spacing: -0.5px;
}
.brand span {
  color: var(--color-sub-text, #6c667a);
  font-size: 12px;
  font-weight: 400;
  margin-left: 8px;
}
button,
input,
textarea,
select {
  font: inherit;
  box-sizing: border-box;
}
button {
  cursor: pointer;
  border: 1px solid var(--color-item-border, #dedbe5);
  background: var(--color-second, #fff);
  color: inherit;
  padding: 10px 16px;
  border-radius: 10px;
  line-height: 1.5;
  transition:
    background 0.15s,
    border-color 0.15s;
}
button:hover:enabled {
  border-color: var(--accent);
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button:focus-visible,
input:focus-visible,
textarea:focus-visible,
a:focus-visible {
  outline: 3px solid #ad9be6;
  outline-offset: 3px;
}
.scenario-header button {
  border: 0;
  background: transparent;
  font-size: 14px;
  padding: 8px 10px;
}
.scenario-header button.selected {
  background: var(--color-third, #eee9fa);
  color: var(--accent);
}
.status-line {
  min-height: 40px;
  font-size: 12px;
  color: var(--color-sub-text, #716a7e);
}
.status-line button {
  padding: 3px 8px;
}
.danger {
  color: #b93535;
}
.today {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 64px;
  padding: 32px 0 44px;
}
h1,
h2,
p {
  margin-top: 0;
}
h1 {
  font-size: 38px;
  line-height: 1.35;
  letter-spacing: -1px;
  font-weight: 700;
  margin-bottom: 18px;
}
h2 {
  font-size: 21px;
  line-height: 1.5;
  margin-bottom: 10px;
  font-weight: 650;
}
p {
  line-height: 1.8;
  margin-bottom: 18px;
}
.intro {
  color: var(--color-sub-text, #72697d);
  font-size: 16px;
}
.panel {
  background: var(--color-second, #fff);
  border: 1px solid var(--color-item-border, #e6e2ec);
  border-radius: 20px;
  padding: 28px;
}
.daily-plan {
  margin-top: 30px;
  box-shadow: 0 8px 30px #4f366008;
}
.plan-top {
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-sub-text, #716a7e);
  margin-bottom: 24px;
}
.plan-top span:first-child {
  color: var(--accent);
  font-weight: 600;
}
.duration {
  border: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 22px 0 14px;
}
.duration legend {
  font-size: 13px;
  margin-bottom: 10px;
}
.duration .selected,
.choice-list .chosen {
  background: #ede7ff;
  border-color: #b6a4e8;
  color: #4b318f;
}
.primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  font-weight: 600;
  padding: 12px 22px;
}
.daily-plan > .primary {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-top: 20px;
}
.text-button {
  border: 0;
  color: var(--accent);
  background: transparent;
  padding: 10px 0;
  font-size: 13px;
  display: block;
}
.small {
  font-size: 12px;
  color: var(--color-sub-text, #746d7f);
  line-height: 1.8;
}
.course-list {
  padding-top: 10px;
}
.lesson-row {
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 20px 0;
  border: 0;
  border-bottom: 1px solid var(--color-item-border, #e6e2ec);
  border-radius: 0;
  background: transparent;
}
.lesson-row:disabled {
  opacity: 1;
}
.lesson-number {
  color: var(--accent);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.lesson-row strong {
  display: block;
  font-size: 16px;
  font-weight: 550;
  margin-bottom: 5px;
}
.lesson-row small {
  display: block;
  color: var(--color-sub-text, #746d7f);
  font-size: 12px;
  line-height: 1.7;
}
.lesson-state {
  margin-left: auto;
  color: var(--accent);
  font-size: 12px;
  white-space: nowrap;
}
.original-links {
  margin: 28px 0 12px;
  gap: 24px;
  font-size: 14px;
}
.practice,
.settings {
  max-width: 760px;
  margin: 28px auto 54px;
  padding: 36px;
}
.practice h1,
.settings h1 {
  font-size: 28px;
  margin-top: 26px;
}
.practice-top {
  justify-content: space-between;
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--color-item-border, #e6e2ec);
  font-size: 14px;
}
.practice-top button {
  font-size: 12px;
  padding: 6px 10px;
}
progress {
  width: 100%;
  height: 5px;
  accent-color: var(--accent);
  margin-bottom: 24px;
}
.sample-note {
  font-size: 12px;
  color: var(--color-sub-text, #746d7f);
}
.english {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 30px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.meaning {
  font-size: 19px;
  margin: 14px 0;
}
.explanation {
  background: var(--color-third, #f5f2fa);
  padding: 18px;
  border-radius: 12px;
  font-size: 15px;
}
.practice :deep(button) {
  font: inherit;
  cursor: pointer;
  border: 1px solid var(--color-item-border, #dedbe5);
  border-radius: 10px;
  background: var(--color-second, #fff);
  color: inherit;
  padding: 10px 16px;
}
.practice :deep(button.primary) {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.practice :deep(button.text-button) {
  border: 0;
  background: transparent;
  color: var(--accent);
  padding: 10px 0;
  font-size: 13px;
}
.practice > .primary {
  margin-top: 24px;
}
.choice-list {
  display: grid;
  gap: 10px;
  margin: 24px 0 10px;
}
.choice-list button {
  text-align: left;
}
.hint-box {
  background: var(--color-third, #f5f2fa);
  border-left: 3px solid var(--accent);
  padding: 18px;
  border-radius: 6px;
  margin: 16px 0 24px;
}
.hint-box p:last-child {
  margin-bottom: 0;
}
.hint-box .english {
  margin: 8px 0;
}
.hints {
  margin-top: 22px;
}
.feedback {
  margin: 16px 0;
  font-size: 14px;
}
label {
  display: block;
  font-size: 14px;
  margin: 16px 0 8px;
  line-height: 1.7;
}
input:not([type='checkbox']),
textarea {
  display: block;
  width: 100%;
  border: 1px solid var(--color-item-border, #dedbe5);
  background: var(--color-primary, #faf9fc);
  color: inherit;
  border-radius: 10px;
  padding: 12px;
  margin: 8px 0 16px;
}
textarea {
  resize: vertical;
  font-size: 20px;
}
.skip {
  margin-top: 24px;
}
.notice {
  padding: 16px;
  border: 1px solid var(--color-item-border, #dedbe5);
  border-radius: 12px;
  background: var(--color-third, #f5f2fa);
  font-size: 14px;
  line-height: 1.8;
  margin-bottom: 18px;
}
.self-rating {
  margin-top: 24px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin: 30px 0;
}
.summary-grid dt {
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-sub-text, #746d7f);
}
.summary-grid dd {
  font-size: 27px;
  margin: 10px 0 0;
}
.review-list {
  list-style: none;
  padding: 0;
}
.review-list li {
  padding: 16px 0;
  border-bottom: 1px solid var(--color-item-border, #dedbe5);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.review-list strong {
  font-weight: 500;
  overflow-wrap: anywhere;
}
.review-list span {
  font-size: 12px;
  color: var(--color-sub-text, #746d7f);
}
.settings h2 {
  margin-top: 32px;
}
.check-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
}
.settings > .small {
  margin-top: 16px;
}
.scenario-footer {
  border-top: 1px solid var(--color-item-border, #e6e2ec);
  padding-top: 18px;
  color: var(--color-sub-text, #746d7f);
  font-size: 12px;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  line-height: 1.8;
}
@media (max-width: 900px) {
  .today {
    gap: 28px;
  }
  .scenario-page {
    padding: 22px;
  }
  .scenario-header {
    gap: 16px;
  }
}
@media (max-width: 650px) {
  .scenario-page {
    padding: 20px 16px;
  }
  .today {
    grid-template-columns: 1fr;
    padding-top: 22px;
    gap: 32px;
  }
  h1 {
    font-size: 32px;
  }
  .scenario-header nav {
    gap: 4px;
    width: 100%;
    justify-content: space-between;
  }
  .scenario-header button {
    padding: 8px 4px;
    font-size: 13px;
  }
  .panel {
    padding: 22px;
    border-radius: 16px;
  }
  .practice,
  .settings {
    margin-top: 18px;
  }
  .practice h1,
  .settings h1 {
    font-size: 25px;
  }
  .english {
    font-size: 27px;
  }
  .summary-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  .scenario-footer span {
    display: block;
  }
}
</style>
