// src/lib/fields/types.ts
import type { LookupItem, Option, Row } from '@tsfx/lib/grid/types';
import type { TransactionRef } from '@tsfx/lib/trm/types';

export type FieldType = 'text' | 'code' | 'integer' | 'amount' | 'decimal' | 'date' | 'dateRange' | 'period'
  | 'select' | 'suggest' | 'multiSelect' | 'flag' | 'toggle' | 'segmented' | 'textarea' | 'file' | 'display';

/** One field, described once: grid cell, form control, browser and server checks, display and OData conversion. */
export interface FieldDef<L = unknown> {
  field: string;
  /** Caption; a trailing ' *' marks a required field in grids and is left out of messages. */
  label: string;
  type?: FieldType;
  required?: boolean;
  /** SAP length (text, code, textarea) or digits (integer). */
  max?: number;
  /** Decimals of amount and decimal (default 2). */
  scale?: number;
  /** Total digits of amount and decimal. */
  precision?: number;
  /** Integer stored as NUMC: zero-padded to `max`. */
  keepZeros?: boolean;
  /** Integer, amount, decimal: show zero as blank in tables. */
  zeroBlank?: boolean;
  /** Amount: the field holding its currency (its own column). */
  currencyField?: string;
  /** dateRange: the field holding the end date (this field holds the start). */
  toField?: string;
  /** period: the field holding the year (this field holds the month). */
  yearField?: string;
  options?: Option[] | ((lk: L) => Option[]);
  lookup?: (lk: L, row: Row) => LookupItem[];
  /** suggest: offer the F4 value-help dialog. */
  valueHelp?: boolean;
  /** file: allowed extensions such as '.xlsx', and the size limit. */
  accept?: string[];
  maxBytes?: number;
  key?: boolean;
  mono?: boolean;
  width?: number;
  /** Form layout override; defaults to a width appropriate to the field's type and length. */
  formSize?: 'short' | 'normal' | 'long' | 'full';
  placeholder?: string;
  computed?: (row: Row, lk: L) => string;
  /** Display-only status fields use a labelled traffic-light tag. */
  statusTone?: (row: Row) => 'green' | 'amber' | 'red';
  /**
   * The text a record shows for this field outside editing, when it is not the stored value (e.g. a status that follows
   * a date); editing still sets the stored value.
   */
  shown?: (row: Row, lk: L) => string;
  /** A TRM transaction number (or, with kind 'class', a security class): shown as a link that opens its FTR_DISPLAY pop-up. */
  transaction?: TransactionRef;
  describe?: (row: Row, lk: L) => string;
  /** Legacy shorthands of table-maintenance modules written before field types. */
  clean?: (value: string) => string;
  flag?: boolean;
}

// Definitions differ only in their lookup type; behaviours are generic over it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous lookup types
export type AnyField = FieldDef<any>;

export interface FieldContext { row: Row; lk: unknown }

export interface FieldBehaviour {
  /** Any input (typed, pasted, sent by a browser, read from SAP) → canonical string; unparseable text is kept for check(). */
  clean(value: unknown, def: AnyField): string;
  /** '' when fine, else the problem. Called only for non-empty values; required is checked by checkFields. */
  check(value: string, def: AnyField, ctx: FieldContext): string;
  format(value: string, def: AnyField, ctx: FieldContext): string;
  paste(value: string, def: AnyField, lk: unknown): string;
  toSap(value: string, def: AnyField): unknown;
  fromSap(value: unknown, def: AnyField): string;
  align: 'left' | 'right' | 'center';
}
