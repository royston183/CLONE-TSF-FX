// Update Price from the perspective of a date (pure, tested). The person picks a day; every commodity of Maintain
// Commodity is listed with the price set for exactly that day, or as Missing (with the last earlier price as a hint,
// which is what a trade flow of that day is priced at until a price is set). Saving writes prices with Effective From =
// the day picked: a create where the day has none, an update where it has one.
import { isoDay, str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';

export interface SheetLine {
  commodity: string;
  description: string;
  currency: string;
  unit: string;
  /** The price row whose Effective From is the day picked. */
  onDate: Row | null;
  /** The latest price row before the day picked (what applies until one is set for the day). */
  last: Row | null;
  status: 'Set' | 'Missing';
}

/** Every commodity on the day: its own price for the day, or Missing with the last earlier price. */
export function sheetFor(day: string, commodities: Row[], prices: Row[]): SheetLine[] {
  const d = isoDay(day);
  return commodities.map((c): SheetLine => {
    const code = str(c.commodity);
    const mine = prices.filter(p => str(p.commodity) === code);
    const onDate = mine.find(p => isoDay(p.effectiveFrom) === d) ?? null;
    const last = mine.filter(p => isoDay(p.effectiveFrom) < d).sort((a, b) => isoDay(b.effectiveFrom).localeCompare(isoDay(a.effectiveFrom)))[0] ?? null;
    return { commodity: code, description: str(c.description), currency: str(c.currency) || str(onDate?.currency) || 'USD', unit: str(c.unit), onDate, last, status: onDate ? 'Set' : 'Missing' };
  }).sort((a, b) => a.commodity.localeCompare(b.commodity));
}

/** A typed price as SAP takes it (4 decimals), '' when blank, or null when it is not a price above zero. */
export function priceOf(text: string): string | null {
  const t = text.trim().replace(/,/g, '');
  if (!t) return '';
  if (!/^\d+(\.\d{1,4})?$/.test(t) || !(Number(t) > 0)) return null;
  return Number(t).toFixed(4);
}

export interface SavePlan { creates: Row[]; updates: Row[]; problems: { commodity: string; message: string }[] }

/**
 * What Save sends for the day: a create for a Missing commodity given a price, an update for a Set one whose price
 * changed. A blank Missing price is left alone; a blank Set price keeps its price (Delete removes it).
 */
export function savePlan(day: string, lines: SheetLine[], edits: Record<string, string>): SavePlan {
  const plan: SavePlan = { creates: [], updates: [], problems: [] };
  const d = isoDay(day);
  if (!d) return { ...plan, problems: [{ commodity: '', message: 'Pick a date first.' }] };
  for (const l of lines) {
    const typed = edits[l.commodity];
    if (typed === undefined) continue;
    const price = priceOf(typed);
    if (price === null) { plan.problems.push({ commodity: l.commodity, message: `${l.commodity}: the price must be a number above zero with at most 4 decimals.` }); continue; }
    if (price === '') continue;
    if (!l.onDate) plan.creates.push({ commodity: l.commodity, effectiveFrom: d, price, currency: l.currency });
    else if (Number(str(l.onDate.price)) !== Number(price)) plan.updates.push({ ...l.onDate, price });
  }
  return plan;
}

/** The figures of the day: commodities, set for the day, missing. */
export const sheetFigures = (lines: SheetLine[]) => ({ total: lines.length, set: lines.filter(l => l.status === 'Set').length, missing: lines.filter(l => l.status === 'Missing').length });
