/**
 * The workflow of a Deal ID as the status master (ZSGTSFTR_DEAL_ST, read with the Deal ID) lists it, set against the status the
 * Deal ID holds now. For viewing only: nothing here changes a status, and the stages and their texts are whatever the master holds.
 * Statuses are ordered by their code, as the master's own list is; a stage after the current one is "upcoming" (some of those are
 * alternatives to each other, or exceptional, such as a cancellation: the master does not say which, so none is guessed).
 */
import type { StatusOption } from './invoice.ts'

export type StageState = 'completed' | 'current' | 'upcoming'
export type Stage = { code: string; text: string; state: StageState }

/** "04 - BL Assigned to Deal ID for Invoicing" → code "04", text "BL Assigned to Deal ID for Invoicing". */
const split = (o: StatusOption): { code: string; text: string } => ({ code: o.key, text: o.text.startsWith(`${o.key} - `) ? o.text.slice(o.key.length + 3) : o.text })

export function workflowProgress(options: readonly StatusOption[], current: string): Stage[] {
  const sorted = [...options].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const stages: Stage[] = sorted.map((o) => {
    const { code, text } = split(o)
    return { code, text, state: code === current ? 'current' : code < current ? 'completed' : 'upcoming' }
  })
  // A current status the master does not list (it should) is still shown, in its place.
  if (current && !stages.some((s) => s.code === current)) {
    stages.push({ code: current, text: 'Not listed in the status master', state: 'current' })
    stages.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
  }
  return stages
}
