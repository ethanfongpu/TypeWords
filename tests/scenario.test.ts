import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Rating } from 'ts-fsrs'
import {
  checkAnswer,
  commitTask,
  dueKeys,
  freshState,
  gradeOutcome,
  startSession,
  suggestedHint,
} from '../app/core/scenario/engine.ts'
import { starterLessons } from '../app/core/scenario/courses.ts'
import { parseScenarioZip, validateState } from '../app/core/scenario/persistence.ts'
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
test('six complete original lessons have valid answers, choices, and no unresolved placeholders', () => {
  const lessons = starterLessons()
  assert.equal(lessons.length, 6)
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
  assert.equal(state.completedLessons.length, 6)
})
test('corrupt and future backups are rejected before storage changes', async () => {
  assert.throws(() => validateState({ ...freshState(), version: 2 }), /版本/)
  assert.throws(() => validateState({ ...freshState(), attempts: [{}] }))
  const state = finishLesson()
  const key = Object.keys(state.cards)[0]
  state.cards[key].card.due = 'bad date' as unknown as Date
  assert.throws(() => validateState(state))
  assert.equal(await parseScenarioZip({ file: () => null }), null)
  const parse = (value: unknown) =>
    parseScenarioZip({
      file: name => (name === 'scenario/data.json' ? { async: async () => JSON.stringify(value) } : null),
    })
  await assert.rejects(parse({ version: 2, state: freshState(), media: [] }))
  await assert.rejects(parse({ version: 1, state: freshState(), media: [{ id: '../escape' }] }))
  const restored = await parse({ version: 1, state: finishLesson(), media: [] })
  assert.equal(restored!.state.completedLessons[0], 'introduce')
  await assert.rejects(
    parseScenarioZip({
      file: name => ({
        async: async () =>
          JSON.stringify(
            name === 'manifest.json'
              ? { format: 'typewords-personal', version: 2 }
              : { version: 1, state: freshState(), media: [] }
          ),
      }),
    }),
    /版本/
  )
})
