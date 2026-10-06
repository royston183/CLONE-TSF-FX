/*
 * UI constants only. The legacy page's dummy Regions, Entities, FX Models, CO Areas, statuses,
 * partner banks, Master Contracts and Deal IDs moved to fixtures.ts (tests only).
 *
 * KEPT STATIC: the Layout choices are display-only ALV-style variants; the ABAP source (and so
 * any LTDX layout) is not exported, and choosing one changes nothing but a toast.
 */
import type { LayoutChoice } from './types.ts'

export const LAYOUTS: readonly LayoutChoice[] = [
  { value: 'DEFAULT', label: 'Default view' },
  { value: 'DESK', label: 'Settlement desk view' },
]

export const PAGE_SIZES: readonly number[] = [8, 15, 25, 50]
export const DEFAULT_PAGE_SIZE = 15
