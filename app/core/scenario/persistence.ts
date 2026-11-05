import { get, set, update } from 'idb-keyval'
import { freshState, cardKey } from './engine.ts'
import { starterLessons } from './courses.ts'
import type { ScenarioRecord, ScenarioState, SavedRecording } from '../types/scenario.ts'

export const SCENARIO_KEY = 'TypeWordsScenarioState:v1'
export const SCENARIO_LOCK = 'TypeWordsScenarioWriter:v1'
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024
const expressionIds = new Set(starterLessons().flatMap(l => l.expressions.map(e => e.id)))
const lessonIds = new Set(starterLessons().map(l => l.id))
function assert(condition: unknown, message = '场景备份内容损坏，当前记录未更改。'): asserts condition {
  if (!condition) throw new Error(message)
}
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const string = (value: unknown, max = 10000): value is string => typeof value === 'string' && value.length <= max
const date = (value: unknown) =>
  (typeof value === 'string' || value instanceof Date) && Number.isFinite(new Date(value).getTime())
const number = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
function validExpression(e: any) {
  return (
    object(e) &&
    expressionIds.has(e.id) &&
    ['english', 'chinese', 'question', 'questionChinese', 'note', 'hint'].every(k => string(e[k], 2000)) &&
    Array.isArray(e.accepted) &&
    e.accepted.length > 0 &&
    e.accepted.length < 20 &&
    e.accepted.every(x => string(x, 2000)) &&
    Array.isArray(e.choices) &&
    e.choices.length === 3 &&
    e.choices.every(x => string(x, 2000)) &&
    e.choices.includes(e.chinese) &&
    typeof e.sample === 'boolean'
  )
}
export function validateState(raw: unknown): ScenarioState {
  assert(object(raw))
  assert(raw.version === 1, '不支持这个场景备份版本，当前记录未更改。')
  const s = raw as unknown as ScenarioState
  assert(
    object(s.profile) &&
      ['name', 'role', 'product', 'category', 'audience', 'action'].every(k => string(s.profile[k], 200))
  )
  assert([10, 15, 25].includes(s.profile.dailyMinutes))
  assert(Array.isArray(s.attempts) && s.attempts.length <= 100000 && object(s.cards))
  const ids = new Set<string>()
  for (const a of s.attempts) {
    assert(object(a) && string(a.id, 500) && !ids.has(a.id) && string(a.taskId, 300) && string(a.sessionId, 100))
    assert(expressionIds.has(a.expressionId) && a.contentVersion === 1 && ['listen', 'produce'].includes(a.skill))
    assert(['learn', 'listen', 'type', 'speak'].includes(a.inputMode) && [0, 1, 2].includes(a.hint))
    assert(
      ['rule', 'self', 'practice'].includes(a.source) &&
        ['again', 'hard', 'good', 'easy', 'practice', 'skip'].includes(a.outcome)
    )
    assert(
      string(a.english) &&
        string(a.raw) &&
        Array.isArray(a.corrections) &&
        a.corrections.length <= 100 &&
        a.corrections.every(x => string(x))
    )
    assert(date(a.createdAt) && typeof a.scheduled === 'boolean')
    ids.add(a.id)
  }
  assert(Object.keys(s.cards).length <= expressionIds.size * 2)
  for (const [key, c] of Object.entries(s.cards)) {
    assert(
      object(c) &&
        expressionIds.has(c.expressionId) &&
        ['listen', 'produce'].includes(c.skill) &&
        key === cardKey(c.expressionId, c.skill)
    )
    assert(validExpression(c.expression) && c.expression.id === c.expressionId && object(c.card) && date(c.card.due))
    assert(
      ['stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'reps', 'lapses', 'learning_steps'].every(k =>
        number(c.card[k])
      )
    )
    assert([0, 1, 2, 3].includes(c.card.state) && (!c.card.last_review || date(c.card.last_review)))
    assert(
      ids.has(c.lastAttemptId) &&
        s.attempts.some(
          a => a.id === c.lastAttemptId && a.scheduled && a.expressionId === c.expressionId && a.skill === c.skill
        )
    )
  }
  assert(Array.isArray(s.completedLessons) && s.completedLessons.every(x => lessonIds.has(x)))
  assert(
    object(s.dailyQueues) &&
      Object.entries(s.dailyQueues).every(
        ([day, keys]) =>
          /^\d{4}-\d{2}-\d{2}$/.test(day) &&
          Array.isArray(keys) &&
          keys.length <= 6 &&
          new Set(keys).size === keys.length &&
          keys.every(k => Object.hasOwn(s.cards, k))
      )
  )
  assert(s.lastExportAt === null || date(s.lastExportAt))
  const activityDays = s.activityDays ?? {}
  assert(
    object(activityDays) &&
      Object.entries(activityDays).every(([day, ms]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && number(ms))
  )
  if (s.session !== null) {
    const session = s.session
    assert(object(session) && string(session.id, 100) && string(session.title, 200) && session.contentVersion === 1)
    assert(session.lessonId === null || lessonIds.has(session.lessonId))
    assert(Array.isArray(session.queue) && session.queue.length > 0 && session.queue.length <= 40)
    const taskIds = new Set<string>()
    for (const task of session.queue) {
      assert(
        object(task) &&
          string(task.id, 300) &&
          !taskIds.has(task.id) &&
          ['learn', 'listen', 'type', 'speak'].includes(task.kind)
      )
      assert(
        validExpression(task.expression) &&
          ['listen', 'produce'].includes(task.skill) &&
          typeof task.review === 'boolean' &&
          [0, 1, 2].includes(task.initialHint)
      )
      taskIds.add(task.id)
    }
    assert(
      Number.isInteger(session.index) &&
        session.index >= 0 &&
        session.index <= session.queue.length &&
        string(session.draft)
    )
    assert(
      Array.isArray(session.corrections) &&
        session.corrections.length <= 100 &&
        session.corrections.every(x => string(x))
    )
    assert(
      [0, 1, 2].includes(session.hint) &&
        typeof session.heard === 'boolean' &&
        typeof session.audioFailed === 'boolean' &&
        number(session.activeMs)
    )
    assert(date(session.startedAt) && (session.finishedAt === null || date(session.finishedAt)))
    assert((session.index === session.queue.length) === (session.finishedAt !== null))
    assert(
      Array.isArray(session.attemptIds) &&
        session.attemptIds.length === session.index &&
        new Set(session.attemptIds).size === session.index
    )
    for (let i = 0; i < session.index; i++)
      assert(
        s.attempts.some(
          a => a.id === session.attemptIds[i] && a.sessionId === session.id && a.taskId === session.queue[i].id
        )
      )
  }
  // Discard unknown top-level fields (including any accidentally added settings or credentials).
  const restored = structuredClone({
    version: 1,
    profile: s.profile,
    attempts: s.attempts,
    cards: s.cards,
    session: s.session,
    completedLessons: s.completedLessons,
    dailyQueues: s.dailyQueues,
    activityDays,
    lastExportAt: s.lastExportAt,
  }) as ScenarioState
  for (const card of Object.values(restored.cards)) {
    card.card.due = new Date(card.card.due)
    if (card.card.last_review) card.card.last_review = new Date(card.card.last_review)
  }
  return restored
}
export async function readRecord(): Promise<ScenarioRecord> {
  const record = await get<ScenarioRecord>(SCENARIO_KEY)
  if (!record) return { state: freshState(), media: [] }
  return { state: validateState(record.state), media: record.media ?? [] }
}
export async function writeState(state: ScenarioState) {
  await update<ScenarioRecord>(SCENARIO_KEY, old => ({ state, media: old?.media ?? [] }))
}
export async function saveRecording(recording: SavedRecording) {
  await update<ScenarioRecord>(SCENARIO_KEY, old => {
    if (!old) throw new Error('请先保存本次练习，再保留录音。')
    if (old.media.some(m => m.id === recording.id)) return old
    if (old.media.reduce((sum, m) => sum + m.blob.size, 0) + recording.blob.size > MAX_MEDIA_BYTES)
      throw new Error('保留录音已接近 50 MB，请先导出。当前录音仍可回听。')
    return { state: old.state, media: [...old.media, recording] }
  })
}

export async function appendScenarioZip(zip: any, includeMedia = true) {
  const record = await readRecord()
  zip.file(
    'manifest.json',
    JSON.stringify({
      format: 'typewords-personal',
      version: 1,
      exportedAt: new Date().toISOString(),
      modules: zip.file('data.json') ? ['words', 'articles', 'settings', 'scenario'] : ['scenario'],
      mediaIncluded: includeMedia,
    })
  )
  zip.file(
    'scenario/data.json',
    JSON.stringify({
      version: 1,
      state: record.state,
      media: includeMedia
        ? record.media.map(({ blob, ...meta }) => ({ ...meta, size: blob.size, path: `scenario/media/${meta.id}` }))
        : [],
    })
  )
  if (includeMedia) for (const media of record.media) zip.file(`scenario/media/${media.id}`, media.blob)
}
export async function parseScenarioZip(zip: any): Promise<ScenarioRecord | null> {
  const entry = zip.file('scenario/data.json')
  if (!entry) return null // Old backups leave scenario data untouched.
  const manifestFile = zip.file('manifest.json')
  if (manifestFile) {
    const manifest = JSON.parse(await manifestFile.async('string'))
    assert(
      object(manifest) && manifest.format === 'typewords-personal' && manifest.version === 1,
      '不支持这个场景备份版本。'
    )
  }
  const text = await entry.async('string')
  assert(text.length < 25 * 1024 * 1024, '场景数据文件过大。')
  const data = JSON.parse(text)
  assert(object(data) && data.version === 1, '不支持这个场景备份版本。')
  const state = validateState(data.state)
  assert(Array.isArray(data.media) && data.media.length <= 10000)
  const media: SavedRecording[] = []
  let size = 0
  const ids = new Set<string>()
  for (const meta of data.media) {
    assert(object(meta) && string(meta.id, 100) && /^[a-zA-Z0-9-]+$/.test(meta.id) && !ids.has(meta.id))
    assert(meta.path === `scenario/media/${meta.id}` && string(meta.sessionId, 100) && string(meta.taskId, 300))
    assert(
      date(meta.createdAt) &&
        typeof meta.mimeType === 'string' &&
        /^audio\/(webm|ogg|mp4|mpeg|wav)(;codecs=[\w,.-]+)?$/.test(meta.mimeType)
    )
    assert(number(meta.size, 1, MAX_MEDIA_BYTES))
    size += meta.size
    assert(size <= MAX_MEDIA_BYTES, '录音总大小超过 50 MB。')
    assert(
      state.attempts.some(a => a.sessionId === meta.sessionId && a.taskId === meta.taskId) ||
        (state.session?.id === meta.sessionId && state.session.queue.some(t => t.id === meta.taskId))
    )
    const file = zip.file(meta.path)
    assert(file)
    const bytes = await file.async('uint8array')
    assert(bytes.byteLength === meta.size)
    media.push({
      id: meta.id,
      sessionId: meta.sessionId,
      taskId: meta.taskId,
      mimeType: meta.mimeType,
      createdAt: meta.createdAt,
      blob: new Blob([bytes], { type: meta.mimeType }),
    })
    ids.add(meta.id)
  }
  return { state, media }
}
export async function restoreRecord(record: ScenarioRecord) {
  const state = validateState(record.state)
  // One IndexedDB transaction replaces data and media together; failed writes retain the previous record.
  await set(SCENARIO_KEY, { state, media: record.media })
}
