import { typeOf } from './index';
import type { AnyField } from './types';

/** Form widths follow the data, independently of a table column's width. */
export function formSizeOf(def: AnyField): 'short' | 'normal' | 'long' | 'full' {
  if (def.formSize) return def.formSize;
  const type = typeOf(def);
  if (['textarea', 'file', 'multiSelect'].includes(type)) return 'full';
  if (type === 'dateRange') return 'long';
  if (['date', 'integer', 'decimal', 'flag', 'toggle'].includes(type)) return 'short';
  if (['code', 'text', 'suggest'].includes(type) && def.max && def.max <= 12) return 'short';
  return 'normal';
}
