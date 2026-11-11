// Transaction links and number formats of the TRM pop-up, ported from the SAP Reporting app (src/pages/trm-deal/rules.js
// and the key rules of src/api/trmdeal.js).
import type { Row } from '@tsfx/lib/grid/types';
import type { TransactionRef, TransactionTarget } from './types';

/** A value as text: blank for none (and for a list, which is never a single value). */
const text = (v: unknown): string => (v === null || v === undefined || Array.isArray(v) ? '' : String(v));

/** A SAP calendar date (YYYY-MM-DD, independent of the browser's time zone) or a timestamp as DD-MM-YYYY; '—' when invalid. */
export function sapDate(value: unknown): string {
  if (!value) return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return '—';
    const [year, month, day] = value.split('-');
    return `${day}-${month}-${year}`;
  }
  const at = new Date(String(value));
  if (!Number.isFinite(at.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(at);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get('day')}-${get('month')}-${get('year')}`;
}
/** A date of the pop-up: DD-MM-YYYY, blank without one. */
export const date = (value: unknown): string => (value ? sapDate(value) : '');

/** An amount that shows as zero is blank. */
const blankZero = (t: string): string => (/^-?0(\.0+)?$/.test(t) ? '' : t);
const inr = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** An amount with lakh grouping and its currency ("61,500.00 INR"); blank for none or zero. */
export const money = (value: unknown, currency?: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  const t = inr.format(Number(value));
  return blankZero(t) ? `${t}${currency ? ` ${text(currency)}` : ''}` : '';
};
const rateFormats: Record<number, Intl.NumberFormat> = {};
/** A rate or a number of units with lakh grouping and up to `digits` decimals. */
export const rate = (value: unknown, digits = 6): string => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
  ? '' : (rateFormats[digits] ??= new Intl.NumberFormat('en-US', { maximumFractionDigits: digits })).format(Number(value)));
/** A number without SAP's leading zeros ("0000001900004" → "1900004"). */
export const stripZeros = (value: unknown): string => text(value).replace(/^0+(?=\d)/, '');
/** "26E · Inv: Equity". */
export const codeName = (code: unknown, name: unknown): string => [text(code), text(name)].filter(Boolean).join(' · ');

/** SAP stores transaction numbers zero-padded to 13 places; users type them without the zeros. */
export const dealKey = (value: string): string => (/^\d{1,13}$/.test(value) ? value.padStart(13, '0') : value);
/** The most transactions a security class pop-up lists. */
export const MAX_TRANSACTIONS = 500;

const COMPANY = /^[A-Z0-9]{1,4}$/, NUMBER = /^[A-Z0-9]{1,13}$/;
const upper = (v: unknown): string => text(v).trim().toUpperCase();

/** The transaction or security class a report row carries with its company code (Reporting's hotspot), or null. */
export function hotspotOf(row: Record<string, unknown> | null | undefined): TransactionTarget | null {
  const bukrs = upper(row?.companyCode ?? row?.CompanyCode);
  const deal = upper(row?.dealNumber ?? row?.deal ?? row?.FinancialTransaction);
  const securityClass = upper(row?.securityId ?? row?.securityClass ?? row?.SecurityClass);
  if (!COMPANY.test(bukrs)) return null;
  if (NUMBER.test(deal)) return { kind: 'deal', bukrs, deal };
  if (NUMBER.test(securityClass)) return { kind: 'class', bukrs, securityClass };
  return null;
}

/** Fields that hold a TRM transaction number wherever an application shows one, next to `companyCode` or `CompanyCode`. */
export const TRANSACTION_FIELDS = ['FinancialTransaction', 'transactionNo', 'dealNumber'];

/**
 * The transaction a column or field shows in this row, or null: as declared (`transaction: { companyField }`), else
 * by name (a column of TRANSACTION_FIELDS in a row with `companyCode` or `CompanyCode`). Both need a valid company
 * code and number (letters and digits, up to 4 and 13), so a blank or a placeholder text is never a link.
 */
export function transactionTargetOf(definition: { field?: string; id?: string; transaction?: TransactionRef }, row: Row | Record<string, unknown>): TransactionTarget | null {
  const field = definition.field ?? definition.id ?? '';
  const ref = definition.transaction;
  if (!ref && !TRANSACTION_FIELDS.includes(field)) return null;
  const bukrs = upper(ref ? row[ref.companyField] : row.companyCode ?? row.CompanyCode);
  const number = upper(row[field]);
  if (!COMPANY.test(bukrs) || !NUMBER.test(number)) return null;
  return ref?.kind === 'class' ? { kind: 'class', bukrs, securityClass: number } : { kind: 'deal', bukrs, deal: number };
}
