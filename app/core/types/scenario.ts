import type { Card } from 'ts-fsrs'

export type Skill = 'listen' | 'produce'
export type Hint = 0 | 1 | 2
export type Outcome = 'again' | 'hard' | 'good' | 'easy' | 'practice' | 'skip'
export interface LearnerProfile {
  name: string
  role: string
  product: string
  category: string
  audience: string
  action: string
  answers?: Partial<Record<'role' | 'product' | 'audience' | 'action', string>>
  dailyMinutes: 10 | 15 | 25
}
export interface Expression {
  id: string
  english: string
  chinese: string
  question: string
  questionChinese: string
  note: string
  hint: string
  accepted: string[]
  choices: string[]
  sample: boolean
}
export interface Lesson {
  id: string
  title: string
  goal: string
  expressions: Expression[]
}
export interface Task {
  id: string
  kind: 'learn' | 'listen' | 'type' | 'speak'
  expression: Expression
  skill: Skill
  review: boolean
  extension?: 'recall' | 'variant'
  initialHint: Hint
}
export interface Attempt {
  id: string
  sessionId: string
  taskId: string
  expressionId: string
  contentVersion: 1
  english: string
  skill: Skill
  inputMode: Task['kind']
  hint: Hint
  source: 'rule' | 'self' | 'practice'
  outcome: Outcome
  raw: string
  corrections: string[]
  createdAt: string
  scheduled: boolean
}
export interface ReviewCard {
  expressionId: string
  skill: Skill
  expression: Expression
  card: Card
  lastAttemptId: string
}
export interface Session {
  id: string
  lessonId: string | null
  title: string
  contentVersion: 1
  queue: Task[]
  index: number
  draft: string
  corrections: string[]
  hint: Hint
  heard: boolean
  audioFailed: boolean
  attemptIds: string[]
  startedAt: string
  finishedAt: string | null
  activeMs: number
}
export interface ScenarioState {
  version: 1
  profile: LearnerProfile
  attempts: Attempt[]
  cards: Record<string, ReviewCard>
  session: Session | null
  completedLessons: string[]
  dailyQueues: Record<string, string[]>
  activityDays: Record<string, number>
  lastExportAt: string | null
}
export interface SavedRecording {
  id: string
  sessionId: string
  taskId: string
  mimeType: string
  createdAt: string
  blob: Blob
}
export interface ScenarioRecord {
  state: ScenarioState
  media: SavedRecording[]
}
