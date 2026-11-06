import { createEmptyCard, fsrs, Rating, type Grade } from 'ts-fsrs'
import { defaultProfile, lessonVariant, starterLessons } from './courses.ts'
import type { Attempt, Expression, Hint, Outcome, ScenarioState, Session, Skill, Task } from '../types/scenario.ts'

export const CONTENT_VERSION = 1
export const cloneState = <T>(value: T): T => structuredClone(value)
export const cardKey = (id: string, skill: Skill) => `${id}:${skill}`
export const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const freshState = (): ScenarioState => ({
  version: 1,
  profile: { ...defaultProfile },
  attempts: [],
  cards: {},
  session: null,
  completedLessons: [],
  dailyQueues: {},
  activityDays: {},
  lastExportAt: null,
})

export function normalizeAnswer(text: string): string {
  return text
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[.!?。！？]+$/, '')
    .trim()
}
export function checkAnswer(input: string, accepted: string[]): 'accepted' | 'unjudged' {
  return accepted.some(answer => normalizeAnswer(answer) === normalizeAnswer(input)) ? 'accepted' : 'unjudged'
}
export function gradeOutcome(outcome: Outcome, hint: Hint): Grade | null {
  if (outcome === 'skip' || outcome === 'practice') return null
  if (outcome === 'again' || hint === 2) return Rating.Again
  if (outcome === 'hard' || hint === 1) return Rating.Hard
  return outcome === 'easy' ? Rating.Easy : Rating.Good
}
export function suggestedHint(state: ScenarioState, expressionId: string): Hint {
  const attempts = state.attempts.filter(
    a => a.expressionId === expressionId && a.inputMode === 'speak' && a.outcome !== 'skip'
  )
  if (attempts.slice(-2).length === 2 && attempts.slice(-2).every(a => a.outcome === 'again')) return 2
  const independentDays = new Set(
    attempts
      .filter(a => a.hint <= 1 && ['good', 'easy', 'hard'].includes(a.outcome))
      .map(a => localDay(new Date(a.createdAt)))
  )
  if (independentDays.size >= 2) return 0
  const supportedDays = new Set(attempts.filter(a => a.outcome !== 'again').map(a => localDay(new Date(a.createdAt))))
  return supportedDays.size >= 2 ? 1 : 2
}
export function dueKeys(state: ScenarioState, now = new Date()): string[] {
  return Object.keys(state.cards)
    .filter(key => new Date(state.cards[key].card.due).getTime() <= now.getTime())
    .sort((a, b) => new Date(state.cards[a].card.due).getTime() - new Date(state.cards[b].card.due).getTime())
}
export function startSession(
  state: ScenarioState,
  id: string,
  options: { lessonId?: string; quick?: boolean; reviewOnly?: boolean } = {},
  now = new Date()
): ScenarioState {
  if (state.session && !state.session.finishedAt) return state
  const next = cloneState(state)
  const day = localDay(now)
  const due = dueKeys(next, now)
  // Keep the order of outstanding cards and fill empty places with newly due cards.
  const remaining = (next.dailyQueues[day] ?? []).filter(key => due.includes(key))
  const daily = [...remaining, ...due.filter(key => !remaining.includes(key))].slice(0, 6)
  next.dailyQueues[day] = daily
  const review = (options.quick ? daily.slice(0, 2) : daily).map((key): Task => {
    const card = next.cards[key]
    return {
      id: `${id}:review:${key}`,
      kind: card.skill === 'listen' ? 'listen' : 'speak',
      expression: cloneState(card.expression),
      skill: card.skill,
      review: true,
      initialHint: card.skill === 'listen' ? 0 : suggestedHint(next, card.expressionId),
    }
  })
  const lessons = starterLessons(next.profile)
  const lesson =
    options.reviewOnly || options.quick || (!options.lessonId && due.length >= 6)
      ? null
      : (lessons.find(l => l.id === options.lessonId) ??
        lessons.find(l => !next.completedLessons.includes(l.id)) ??
        lessons[0])
  const queue = [...review]
  if (lesson) {
    const expressions = next.profile.dailyMinutes === 10 ? lesson.expressions.slice(0, 2) : lesson.expressions
    for (const expression of expressions) {
      for (const kind of ['learn', 'listen', 'type', 'speak'] as const) {
        queue.push({
          id: `${id}:${expression.id}:${kind}`,
          kind,
          expression: cloneState(expression),
          skill: kind === 'listen' ? 'listen' : 'produce',
          review: false,
          initialHint: kind === 'learn' ? 2 : kind === 'listen' ? 0 : 1,
        })
      }
    }
    if (next.profile.dailyMinutes === 25) {
      const prior = Object.values(next.cards)
        .filter(card => card.skill === 'produce' && !expressions.some(e => e.id === card.expressionId))
        .sort((a, b) => +new Date(a.card.due) - +new Date(b.card.due))[0]
      const recall = prior?.expression ?? expressions[0]
      const variant = lessonVariant[lesson.id]
      const target = expressions.find(
        e => e.id === variant.expressionId || e.id === `personal-${variant.expressionId}`
      )!
      queue.push(
        {
          id: `${id}:recall`,
          kind: 'speak',
          expression: cloneState(recall),
          skill: 'produce',
          review: false,
          extension: 'recall',
          initialHint: 0,
        },
        {
          id: `${id}:variant`,
          kind: 'speak',
          expression: {
            ...target,
            questionChinese: target.id.startsWith('personal-')
              ? `第一次见到一位新客户。${target.questionChinese}`
              : variant.prompt,
          },
          skill: 'produce',
          review: false,
          extension: 'variant',
          initialHint: 0,
        }
      )
    }
  }
  if (!queue.length) return next
  next.session = {
    id,
    lessonId: lesson?.id ?? null,
    title: lesson?.title ?? '复习熟悉的表达',
    contentVersion: 1,
    queue,
    index: 0,
    draft: '',
    corrections: [],
    hint: queue[0].initialHint,
    heard: false,
    audioFailed: false,
    attemptIds: [],
    startedAt: now.toISOString(),
    finishedAt: null,
    activeMs: 0,
  }
  return next
}
export function commitTask(
  state: ScenarioState,
  sessionId: string,
  taskId: string,
  outcome: Outcome,
  raw = '',
  source?: Attempt['source'],
  now = new Date()
): ScenarioState {
  const current = state.session
  if (!current || current.id !== sessionId || current.finishedAt) return state
  const task = current.queue[current.index]
  if (!task || task.id !== taskId) return state
  const attemptId = `${sessionId}/${taskId}`
  if (state.attempts.some(a => a.id === attemptId)) return state
  const next = cloneState(state)
  const session = next.session!
  const actualOutcome =
    task.kind === 'learn' || task.kind === 'type' ? (outcome === 'skip' ? 'skip' : 'practice') : outcome
  const rating = gradeOutcome(actualOutcome, session.hint)
  const key = cardKey(task.expression.id, task.skill)
  const alreadyScheduled = next.attempts.some(
    a => a.sessionId === sessionId && cardKey(a.expressionId, a.skill) === key && a.scheduled
  )
  const attempt: Attempt = {
    id: attemptId,
    sessionId,
    taskId,
    expressionId: task.expression.id,
    contentVersion: 1,
    english: task.expression.english,
    skill: task.skill,
    inputMode: task.kind,
    hint: session.hint,
    source: source ?? (task.kind === 'speak' ? 'self' : task.kind === 'listen' ? 'rule' : 'practice'),
    outcome: actualOutcome,
    raw,
    corrections: [...session.corrections],
    createdAt: now.toISOString(),
    scheduled: false,
  }
  if (
    !task.extension &&
    rating !== null &&
    !alreadyScheduled &&
    !(task.kind === 'listen' && (!session.heard || session.audioFailed))
  ) {
    const old = next.cards[key]
    next.cards[key] = {
      expressionId: task.expression.id,
      expression: cloneState(task.expression),
      skill: task.skill,
      card: fsrs({ enable_fuzz: false }).next(old?.card ?? createEmptyCard(now), now, rating).card,
      lastAttemptId: attemptId,
    }
    attempt.scheduled = true
  }
  next.attempts.push(attempt)
  session.attemptIds.push(attemptId)
  session.index++
  session.draft = ''
  session.corrections = []
  session.heard = false
  session.audioFailed = false
  session.hint = session.queue[session.index]?.initialHint ?? 0
  if (session.index >= session.queue.length) {
    session.finishedAt = now.toISOString()
    if (session.lessonId && !next.completedLessons.includes(session.lessonId)) {
      const produced = session.queue.filter(t => t.kind === 'speak' && !t.review && !t.extension)
      if (produced.length && produced.every(t => next.attempts.some(a => a.taskId === t.id && a.outcome !== 'skip')))
        next.completedLessons.push(session.lessonId)
    }
  }
  return next
}

// A restored session contains snapshots, so edits to profile or course copy never rewrite past attempts.
export function sessionAttempts(state: ScenarioState, session: Session) {
  return state.attempts.filter(a => a.sessionId === session.id)
}

export function isSpokenRating(a: Attempt) {
  return a.inputMode === 'speak' && a.source === 'self' && a.outcome !== 'skip'
}
export function isIndependentAnswer(a: Attempt) {
  return isSpokenRating(a) && a.hint === 0 && (a.outcome === 'good' || a.outcome === 'easy')
}
