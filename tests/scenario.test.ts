import { createRequire } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Rating } from 'ts-fsrs'
import {
  checkAnswer,
  commitTask,
  dueKeys,
  freshState,
  gradeOutcome,
  isIndependentAnswer,
  isSpokenRating,
  latestSpokenAttempts,
  isJudgedListening,
  startSession,
  suggestedHint,
} from '../app/core/scenario/engine.ts'
import { starterLessons } from '../app/core/scenario/courses.ts'
import { parseScenarioZip, readZipEntry, validateState } from '../app/core/scenario/persistence.ts'
import type { ScenarioState } from '../app/core/types/scenario.ts'

const now = new Date('2026-11-05T04:00:00Z')
function finishLesson(lessonId = 'introduce', initial = freshState(), id = 'session-1', when = now) {
  let state = startSession(initial, id, { lessonId }, when)
  while (state.session && !state.session.finishedAt) {
    const task = state.session.queue[state.session.index]
    state.session.heard = true
    state = commitTask(state, id, task.id, 'good', task.expression.english, undefined, when)
  }
  return state
}
test('eight complete original lessons have valid answers, choices, and no unresolved placeholders', () => {
  const lessons = starterLessons()
  assert.equal(lessons.length, 8)
  const ids = lessons.flatMap(l => l.expressions.map(e => e.id))
  assert.equal(new Set(ids).size, ids.length)
  for (const lesson of lessons)
    for (const e of lesson.expressions) {
      assert.ok(!/\[.*\]/.test(e.english))
      assert.equal(checkAnswer(e.english, e.accepted), 'accepted')
      assert.ok(e.choices.includes(e.chinese))
    }
})
test('answer tolerance preserves negation, numbers and lexical distinctions', () => {
  assert.equal(checkAnswer('  i’m   Alex! ', ["I'm Alex.", 'I am Alex.']), 'accepted')
  assert.equal(checkAnswer('I am Alex', starterLessons()[0].expressions[1].accepted), 'accepted')
  assert.equal(checkAnswer("You can't play music.", ['You can play music.']), 'unjudged')
  assert.equal(checkAnswer('It is 50 dollars.', ['It is 15 dollars.']), 'unjudged')
  assert.equal(checkAnswer('Hi there', ['Hello.']), 'unjudged')
})
test('full answer and partial hints cap scheduling grades, practice and skip never schedule', () => {
  assert.equal(gradeOutcome('easy', 2), Rating.Again)
  assert.equal(gradeOutcome('good', 1), Rating.Hard)
  assert.equal(gradeOutcome('hard', 0), Rating.Hard)
  assert.equal(gradeOutcome('easy', 0), Rating.Easy)
  assert.equal(gradeOutcome('good', 0), Rating.Good)
  assert.equal(gradeOutcome('practice', 0), null)
  assert.equal(gradeOutcome('skip', 0), null)
})
test('a completed lesson separates listen/produce, records hint use, and commits once', () => {
  let state = startSession(freshState(), 's', { lessonId: 'introduce' }, now)
  const first = state.session!.queue[0]
  state = commitTask(state, 's', first.id, 'good', '', undefined, now)
  assert.equal(state.attempts[0].outcome, 'practice')
  assert.equal(Object.keys(state.cards).length, 0)
  const repeated = commitTask(state, 's', first.id, 'good', '', undefined, now)
  assert.equal(repeated, state)
  const complete = finishLesson('introduce')
  assert.equal(complete.attempts.length, 12)
  assert.equal(Object.keys(complete.cards).length, 6)
  assert.deepEqual(complete.completedLessons, ['introduce'])
  assert.ok(complete.attempts.filter(a => a.inputMode === 'speak').every(a => a.source === 'self' && a.hint === 1))
  assert.equal(validateState(JSON.parse(JSON.stringify(complete))).attempts.length, 12)
})
test('failed or unplayed audio and skipped steps cannot produce listening scores', () => {
  for (const audioFailed of [true, false]) {
    let state = startSession(freshState(), 's', {}, now)
    state = commitTask(state, 's', state.session!.queue[0].id, 'practice', '', undefined, now)
    state.session!.audioFailed = audioFailed
    state.session!.heard = audioFailed
    state = commitTask(state, 's', state.session!.queue[1].id, 'good', '', undefined, now)
    assert.equal(Object.keys(state.cards).length, 0)
    assert.equal(state.attempts[1].scheduled, false)
    assert.equal(isJudgedListening(state.attempts[1]), false)
  }
})
test('refresh preserves queue, current draft, corrections and maximum hints without duplicate attempts', () => {
  let state = startSession(freshState(), 'resume', {}, now)
  state.session!.draft = 'unfinished'
  state.session!.corrections = ['wrong']
  state.session!.hint = 2
  const restored = validateState(JSON.parse(JSON.stringify(state)))
  assert.deepEqual(restored, state)
  assert.deepEqual(startSession(restored, 'new-id', {}, now), restored)
  const task = restored.session!.queue[0]
  state = commitTask(restored, 'resume', task.id, 'practice', '', undefined, now)
  assert.equal(state.attempts[0].hint, 2)
  assert.deepEqual(state.attempts[0].corrections, ['wrong'])
  assert.equal(commitTask(state, 'resume', task.id, 'practice'), state)
})
test('daily queue is stable, capped, and unreviewed cards keep their due dates', () => {
  const finished = finishLesson()
  const tomorrow = new Date('2026-11-06T04:00:00Z')
  const dueBefore = structuredClone(finished.cards)
  finished.session = null
  const review = startSession(finished, 'review', { reviewOnly: true }, tomorrow)
  assert.equal(review.session!.queue.length, 6)
  assert.deepEqual(review.cards, dueBefore)
  assert.equal(dueKeys(review, tomorrow).length, 6)
  const snapshot = validateState(JSON.parse(JSON.stringify(review)))
  assert.deepEqual(snapshot.session!.queue, review.session!.queue)
  assert.equal(startSession(snapshot, 'other', {}, tomorrow), snapshot)
})
test('same expression and skill only schedule once in a session, including review plus lesson overlap', () => {
  const state = finishLesson()
  state.session = null
  const next = finishLesson('introduce', state, 'repeat', new Date('2026-11-06T04:00:00Z'))
  for (const id of ['hello', 'name', 'meet'])
    for (const skill of ['listen', 'produce']) {
      assert.equal(
        next.attempts.filter(a => a.sessionId === 'repeat' && a.expressionId === id && a.skill === skill && a.scheduled)
          .length,
        1
      )
    }
})
test('profile edits cannot rewrite historical content and minutes select a shorter course', () => {
  const state = freshState()
  state.profile.name = 'Ethan'
  state.profile.dailyMinutes = 10
  const next = startSession(state, 'name', {}, now)
  assert.equal(next.session!.queue.length, 8)
  assert.ok(next.session!.queue.some(t => t.expression.english === "I'm Ethan."))
  next.profile.name = 'Other'
  assert.ok(next.session!.queue.some(t => t.expression.english === "I'm Ethan."))
})
test('hint suggestions require separate learning days, never repeated attempts in a single day', () => {
  const state = finishLesson()
  assert.equal(suggestedHint(state, 'hello'), 2)
  const repeated = finishLesson('introduce', { ...state, session: null }, 'same-day')
  assert.equal(suggestedHint(repeated, 'hello'), 2)
  const different = finishLesson(
    'introduce',
    { ...repeated, session: null },
    'different',
    new Date('2026-11-06T04:00:00Z')
  )
  assert.equal(suggestedHint(different, 'hello'), 0)
})
test('every lesson can finish and pass backup schema validation', () => {
  let state = freshState()
  for (const lesson of starterLessons()) {
    state.session = null
    state = finishLesson(lesson.id, state, lesson.id)
    assert.doesNotThrow(() => validateState(JSON.parse(JSON.stringify(state))))
  }
  assert.equal(state.completedLessons.length, 8)
})
test('corrupt and future backups are rejected before storage changes', async () => {
  assert.throws(() => validateState({ ...freshState(), version: 2 }), /版本/)
  assert.throws(() => validateState({ ...freshState(), attempts: [{}] }))
  const state = finishLesson()
  const key = Object.keys(state.cards)[0]
  state.cards[key].card.due = 'bad date' as unknown as Date
  assert.throws(() => validateState(state))
  assert.equal(await parseScenarioZip({ file: () => null }), null)
  const parse = async (value: unknown, manifest?: unknown) => {
    const zip = new JSZip()
    zip.file('scenario/data.json', JSON.stringify(value))
    if (manifest) zip.file('manifest.json', JSON.stringify(manifest))
    return parseScenarioZip(await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' })))
  }
  await assert.rejects(parse({ version: 2, state: freshState(), media: [] }))
  await assert.rejects(parse({ version: 1, state: freshState(), media: [{ id: '../escape' }] }))
  const restored = await parse({ version: 1, state: finishLesson(), media: [] })
  assert.equal(restored!.state.completedLessons[0], 'introduce')
  await assert.rejects(parse({}, { format: 'typewords-personal', version: 2 }), /版本/)
})

const JSZip = createRequire(import.meta.url)('../public/libs/jszip.min.js')
test('enforces the decompressed byte budget even with a false directory size', async () => {
  const zip = new JSZip()
  zip.file('large', 'x'.repeat(2 * 1024 * 1024))
  const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  const entry = (await JSZip.loadAsync(data)).file('large')
  await assert.rejects(readZipEntry(entry, 1024), /超过大小/)
  entry._data.uncompressedSize = 1
  await assert.rejects(readZipEntry(entry, 1024), /超过大小/)
})

test('cards becoming due after the first session are available through both normal entrances', () => {
  const finished = finishLesson()
  const later = new Date(now.getTime() + 5 * 3600000)
  assert.equal(dueKeys(finished, later).length, 6)
  for (const options of [{}, { reviewOnly: true }]) {
    const next = startSession(finished, 'again', options, later)
    assert.equal(next.session!.id, 'again')
    assert.equal(next.session!.queue.length, 6)
    assert.ok(next.session!.queue.every(task => task.review))
  }
})

test('skipping speaking and passing listening do not count as independent speaking', () => {
  const attempts = finishLesson().attempts.map(a => (a.inputMode === 'speak' ? { ...a, outcome: 'skip' as const } : a))
  assert.equal(attempts.filter(isSpokenRating).length, 0)
  assert.equal(attempts.filter(isIndependentAnswer).length, 0)
  const spoken = { ...attempts.find(a => a.inputMode === 'speak')!, outcome: 'good' as const }
  assert.ok(isSpokenRating(spoken))
  assert.ok(!isIndependentAnswer(spoken))
  assert.ok(isIndependentAnswer({ ...spoken, hint: 0 }))
})

test('the 25-minute plan adds recall and a new situation without moving non-due cards', () => {
  const state = finishLesson()
  state.profile.dailyMinutes = 25
  const next = startSession(state, 'long', { lessonId: 'work' }, now)
  const extra = next.session!.queue.slice(-2)
  assert.deepEqual(
    extra.map(t => t.extension),
    ['recall', 'variant']
  )
  assert.ok(state.cards[extra[0].expression.id + ':produce'])
  const original = starterLessons().find(l => l.id === 'work')!.expressions[0]
  assert.notEqual(extra[1].expression.questionChinese, original.questionChinese)
  assert.equal(extra[1].expression.english, original.english)
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(next))).session!.queue, next.session!.queue)
  const finished = finishLesson('work', next, 'long')
  assert.ok(finished.attempts.filter(a => extra.some(t => t.id === a.taskId)).every(a => !a.scheduled))
  assert.deepEqual(
    finished.cards[extra[0].expression.id + ':produce'],
    state.cards[extra[0].expression.id + ':produce']
  )
})

test('personal expressions stay separate from examples and survive session and backup recovery', () => {
  const state = freshState()
  state.profile.role = '我修手机。'
  state.profile.answers = { role: 'I repair phones.' }
  state.profile.dailyMinutes = 25
  const started = startSession(state, 'p', { lessonId: 'work' }, now)
  const tasks = started.session!.queue.filter(t => t.expression.id === 'personal-sales')
  assert.ok(tasks.some(t => t.extension === 'variant'))
  assert.deepEqual(tasks[0].expression.accepted, ['I repair phones.'])
  assert.equal(tasks[0].expression.choices[0], '我修手机。')
  assert.equal(tasks[0].expression.sample, false)
  const complete = finishLesson('work', started, 'p')
  assert.ok(validateState(JSON.parse(JSON.stringify(complete))).cards['personal-sales:produce'])
  delete state.profile.answers
  assert.equal(starterLessons(state.profile)[1].expressions[0].id, 'sales')
})

test('editing an answer while the previous sentence is due schedules both independently', () => {
  const initial = freshState()
  initial.profile.role = '我修手机。'
  initial.profile.answers = { role: 'I repair phones.' }
  initial.profile.dailyMinutes = 25
  const first = finishLesson('work', initial, 'first', now)
  const restored = validateState(JSON.parse(JSON.stringify(first)))
  restored.profile.role = '我教音乐。'
  restored.profile.answers = { role: 'I teach music.' }
  const later = new Date(now.getTime() + 14 * 86400000)
  const result = finishLesson('work', restored, 'edited', later)
  const cards = Object.values(validateState(JSON.parse(JSON.stringify(result))).cards)
  for (const text of ['I repair phones.', 'I teach music.']) {
    assert.ok(cards.some(c => c.skill === 'produce' && c.expression.english === text))
    assert.ok(
      result.attempts.some(
        a => a.sessionId === 'edited' && a.scheduled && a.inputMode === 'speak' && a.english === text
      )
    )
  }
  result.profile.answers = initial.profile.answers
  assert.equal(starterLessons(result.profile, result.attempts)[1].expressions[0].id, 'personal-sales')
  const legacy = result.attempts.map(a => ({ ...a, expressionId: a.expressionId.split('@')[0] }))
  const texts = latestSpokenAttempts(legacy).map(a => a.english)
  assert.ok(texts.includes('I repair phones.') && texts.includes('I teach music.'))
  const repeat = {
    ...legacy.find(a => a.inputMode === 'speak' && a.english === 'I teach music.')!,
    expressionId: 'personal-sales@2',
    english: 'I teach  music.',
    outcome: 'again' as const,
  }
  const history = latestSpokenAttempts([...legacy, repeat])
  assert.equal(history.length, texts.length)
  assert.equal(history[0], repeat)
})

test('progress includes older expressions and counts listening assessments separately', () => {
  let state = freshState()
  for (const lesson of starterLessons()) state = finishLesson(lesson.id, state, lesson.id, now)
  assert.ok(latestSpokenAttempts(state.attempts).length > 8)
  const listening = state.attempts.filter(isJudgedListening)
  assert.equal(listening.length, starterLessons().flatMap(l => l.expressions).length)
  assert.equal(isJudgedListening({ ...listening[0], outcome: 'skip' }), false)
})
