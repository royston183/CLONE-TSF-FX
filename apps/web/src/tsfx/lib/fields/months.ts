// src/lib/fields/months.ts
import type { Option } from '@tsfx/lib/grid/types';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Month options as ALM's period bar shows them: '04 - April'. */
export const MONTHS: Option[] = MONTH_NAMES.map((name, i) => {
  const value = String(i + 1).padStart(2, '0');
  return { value, label: `${value} - ${name}` };
});
