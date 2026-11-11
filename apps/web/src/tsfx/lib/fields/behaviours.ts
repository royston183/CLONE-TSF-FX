// src/lib/fields/behaviours.ts
import type { Option } from '@tsfx/lib/grid/types';
import { MONTH_NAMES, MONTHS } from './months';
import { formatAmount, formatDate, parseAmount, parseAmountInput, parseDate, stripGrouping, trimmed } from './parse';
import type { AnyField, FieldBehaviour, FieldType } from './types';

export const labelOf = (d: AnyField): string => d.label.replace(/\s*\*$/, '');
export const optionsFor = (d: AnyField, lk: unknown): Option[] => (typeof d.options === 'function' ? d.options(lk) : d.options ?? []);

/** The month in pasted text: '4', '04', 'April', 'apr', 'MM-YYYY', 'YYYY-MM', 'MM/YYYY'. '' when there is none. */
export function monthPart(v: string): string {
  const t = trimmed(v);
  const m = /^(\d{1,2})\s*[-/.]\s*\d{4}$/.exec(t) ?? /^\d{4}\s*[-/.]\s*(\d{1,2})$/.exec(t) ?? /^(\d{1,2})$/.exec(t);
  if (m) { const n = Number(m[1]); return n >= 1 && n <= 12 ? String(n).padStart(2, '0') : ''; }
  const name = t.toLowerCase();
  if (name.length >= 3) {
    const i = MONTH_NAMES.findIndex(n => n.toLowerCase().startsWith(name));
    if (i >= 0) return String(i + 1).padStart(2, '0');
  }
  return '';
}

/** Option for pasted text: value, label or description, else (as the legacy SAP screens did) the first option whose text starts with the same letter (only for text that starts with a letter). */
export function matchOption(options: Option[], v: string): string {
  const q = trimmed(v).toLowerCase();
  if (!q) return '';
  const texts = (o: Option) => [o.label, o.desc].filter((t): t is string => Boolean(t)).map(t => t.toLowerCase());
  const exact = options.find(o => o.value === trimmed(v) || o.value.toLowerCase() === q || texts(o).includes(q));
  if (exact) return exact.value;
  if (options === MONTHS) {
    const month = monthPart(v);
    if (month || /^\d/.test(q)) return month;
  }
  const hit = /^[a-z]/.test(q) ? options.find(o => texts(o).some(t => t.startsWith(q[0]))) : undefined;
  return hit ? hit.value : '';
}

function behaviour(over: Partial<FieldBehaviour> & Pick<FieldBehaviour, 'clean'>): FieldBehaviour {
  const b: FieldBehaviour = {
    check: () => '',
    format: v => v,
    paste: (v, d) => over.clean(v, d),
    toSap: v => v,
    fromSap: (v, d) => over.clean(v == null ? '' : String(v), d),
    align: 'left',
    ...over
  };
  return b;
}

const tooLong = (d: AnyField, v: string, unit = 'characters') => (d.max && v.length > d.max ? `${labelOf(d)} allows at most ${d.max} ${unit}.` : '');
const flagClean = (v: unknown) => (v === true || /^(x|true|yes|y|1)$/i.test(trimmed(v)) ? 'X' : '');
const notOption = (d: AnyField, v: string) => `${labelOf(d)} '${v}' is not a valid option.`;
const list = (v: unknown) => [...new Set(trimmed(v).split(/[,;]/).map(x => x.trim()).filter(Boolean))];

function numeric(defaultScale: number, shortcuts = false): FieldBehaviour {
  const scaleOf = (d: AnyField) => d.scale ?? defaultScale;
  const parse = shortcuts ? parseAmountInput : parseAmount;
  return behaviour({
    clean: (v, d) => parse(v, scaleOf(d)) ?? trimmed(v),
    check: (v, d) => {
      const scale = scaleOf(d);
      const parsed = parse(v, scale);
      if (parsed === null) return `${labelOf(d)} must be an amount with at most ${scale} decimals, e.g. 1234.50.`;
      const whole = parsed.replace('-', '').split('.')[0];
      if (d.precision && whole.replace(/^0+/, '').length > d.precision - scale) return `${labelOf(d)} is too large (at most ${d.precision - scale} digits before the decimal point).`;
      return '';
    },
    format: (v, d) => { const base = shortcuts ? parse(v, scaleOf(d)) ?? v : v; return d.zeroBlank && Number(base) === 0 ? '' : formatAmount(base); },
    toSap: (v, d) => (v === '' ? null : Number(parse(v, scaleOf(d)) ?? v)),
    align: 'right'
  });
}

const select = behaviour({
  clean: v => trimmed(v),
  check: (v, d, { lk }) => { const o = optionsFor(d, lk); return o.length && !o.some(x => x.value === v) ? notOption(d, v) : ''; },
  format: (v, d, { lk }) => optionsFor(d, lk).find(o => o.value === v)?.label ?? v,
  paste: (v, d, lk) => matchOption(optionsFor(d, lk), v)
});

const date = behaviour({
  clean: v => parseDate(v) ?? trimmed(v),
  check: (v, d) => (parseDate(v) === null ? `${labelOf(d)} must be a valid date (DD-MM-YYYY).` : ''),
  format: v => formatDate(v),
  toSap: v => v || null
});

export const BEHAVIOURS: Record<FieldType, FieldBehaviour> = {
  // Legacy columns (no type) keep exactly their own clean(); typed text collapses spaces. Clean never truncates:
  // over-length input is kept whole so check() can report it.
  text: behaviour({
    clean: (v, d) => (d.clean ? d.clean(trimmed(v)) : d.type ? trimmed(v).replace(/\s+/g, ' ') : trimmed(v)),
    check: (v, d) => tooLong(d, v)
  }),
  code: behaviour({
    clean: v => trimmed(v).toUpperCase().replace(/[^A-Z0-9_/-]/g, ''),
    check: (v, d) => tooLong(d, v)
  }),
  integer: behaviour({
    clean: (v, d) => {
      const t = trimmed(v).replace(/\s/g, '');
      // Commas are grouping only when they sit where grouping goes; otherwise the raw text reaches check().
      const digits = t.includes(',') ? stripGrouping(t) : t;
      if (digits === null) return t;
      return d.keepZeros && d.max && /^\d+$/.test(digits) ? digits.padStart(d.max, '0') : digits;
    },
    check: (v, d) => (!/^\d+$/.test(v) ? `${labelOf(d)} must be a whole number.` : tooLong(d, v, 'digits')),
    format: (v, d) => (d.zeroBlank && /^0*$/.test(v) ? '' : v),
    align: 'right'
  }),
  amount: numeric(2, true),
  decimal: numeric(2),
  date,
  dateRange: date,
  period: select,
  select,
  segmented: select,
  suggest: behaviour({
    clean: v => trimmed(v),
    check: (v, d, { lk, row }) => {
      const items = d.lookup ? d.lookup(lk, row) : [];
      return items.length && !items.some(i => trimmed(i.CODE) === v) ? `${labelOf(d)} '${v}' is not in the list.` : '';
    },
    format: (v, d, { lk, row }) => {
      const text = d.lookup?.(lk, row).find(i => trimmed(i.CODE) === v)?.TEXT;
      return text ? `${v} - ${text}` : v;
    },
    paste: (v, d, lk) => {
      const q = trimmed(v).toLowerCase();
      const hit = d.lookup?.(lk, {}).find(i => trimmed(i.CODE).toLowerCase() === q || trimmed(i.TEXT).toLowerCase() === q);
      return hit ? trimmed(hit.CODE) : trimmed(v);
    }
  }),
  multiSelect: behaviour({
    clean: v => list(v).join(','),
    check: (v, d, { lk }) => {
      const o = optionsFor(d, lk);
      const bad = list(v).find(x => o.length && !o.some(y => y.value === x));
      return bad ? notOption(d, bad) : '';
    },
    format: (v, d, { lk }) => list(v).map(x => optionsFor(d, lk).find(o => o.value === x)?.label ?? x).join(', '),
    paste: (v, d, lk) => list(v).map(x => matchOption(optionsFor(d, lk), x)).filter(Boolean).join(',')
  }),
  flag: behaviour({ clean: flagClean, format: v => (v === 'X' ? 'Yes' : 'No'), align: 'center' }),
  toggle: behaviour({ clean: flagClean, format: v => (v === 'X' ? 'Yes' : 'No'), align: 'center' }),
  textarea: behaviour({
    clean: v => (v == null ? '' : String(v)).replace(/\r\n?/g, '\n').split('\n').map(l => l.trimEnd()).join('\n').trim(),
    check: (v, d) => tooLong(d, v),
    format: v => { const [first, ...rest] = v.split('\n'); return rest.length || first.length > 80 ? `${first.slice(0, 80)} …` : first; }
  }),
  file: behaviour({
    clean: v => trimmed(v),
    check: (v, d) => (d.accept?.length && !d.accept.some(ext => v.toLowerCase().endsWith(ext.toLowerCase()))
      ? `${labelOf(d)} must be a ${d.accept.join(' or ')} file.` : '')
  }),
  display: behaviour({ clean: v => trimmed(v) })
};
