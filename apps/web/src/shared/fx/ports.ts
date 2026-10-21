import { txt } from './masters.ts'
import type { FxRow } from './mw.ts'

/** A ZSGTSFTR_PORTGRP row: code ZPORT_GRP, short text ZPORT_GRP_SDESC, final description ZPORT_GRP_DESC. */
export type PortGroup = { code: string; label: string; desc?: string }

export function toPortGroups(rows: readonly FxRow[]): PortGroup[] {
  const seen = new Set<string>()
  const groups: PortGroup[] = []
  for (const r of rows) {
    const code = txt(r, 'ZPORT_GRP')
    const desc = txt(r, 'ZPORT_GRP_DESC')
    const label = txt(r, 'ZPORT_GRP_SDESC') || desc
    if (!code || !label || seen.has(code)) continue
    seen.add(code)
    groups.push(desc ? { code, label, desc } : { code, label })
  }
  return groups
}

/** What ZPOS / ZPOD store for a group: its final description (the short text when it has none). */
export const portValue = (group: PortGroup): string => group.desc || group.label

const same = (a: string, b: string | undefined) => !!b && a.toLowerCase() === b.trim().toLowerCase()

/** The group a stored ZPOS / ZPOD came from: the program stores the description, not the code. */
export function matchPortGroup(stored: string | null | undefined, groups: readonly PortGroup[]): PortGroup | undefined {
  const text = (stored ?? '').trim()
  if (!text) return undefined
  return groups.find((g) => same(text, g.desc) || same(text, g.label) || same(text, g.code))
}
