import { HttpError } from '@tsfx/lib/errors';
import { odataString } from '../odata-string';

const ALLOWED = new Set(['$select', '$filter', '$expand', '$orderby', '$top', '$skip', '$skiptoken', '$count', '$search', '$format']);

/** OData string literal: a quote is doubled (defined in core/odata-string.ts, free of SAP code). */
export { odataString };

/**
 * `EntitySet(Key='v',Other='w')`. Values are percent-encoded so '#', '?', '/' and spaces cannot break the URL;
 * date and number keys are written bare, as OData V4 requires, so a value that is not one is refused (400).
 */
export function entityPath(entitySet: string, key: Record<string, string>, types: Record<string, 'string' | 'date' | 'number'> = {}): string {
  const parts = Object.entries(key).map(([prop, value]) => {
    const t = types[prop] ?? 'string';
    if (t === 'string') return `${prop}=${encodeURIComponent(odataString(value))}`;
    if (!(t === 'number' ? /^-?\d+(\.\d+)?$/ : /^\d{4}-\d{2}-\d{2}$/).test(value)) throw new HttpError(400, `The key ${prop} '${value}' is not a valid ${t}.`);
    return `${prop}=${value}`;
  });
  return `${entitySet}(${parts.join(',')})`;
}

/** Absolute URL of a resource inside one service root, with allow-listed query options and `sap-client` set once. */
export function serviceUrl(base: string, path: string, query: string | URLSearchParams | undefined, client: string): URL {
  if (path.startsWith('/') || path.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.split('/').some(s => s === '.' || s === '..')) {
    throw new HttpError(400, 'Invalid OData path.');
  }
  const root = new URL(base);
  const url = new URL(path, root);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) throw new HttpError(400, 'OData path is outside the configured service.');
  for (const [k, v] of new URLSearchParams(query ?? '')) {
    if (k === 'sap-client') continue;
    if (!ALLOWED.has(k)) throw new HttpError(400, `Unsupported OData query option: ${k}`);
    url.searchParams.append(k, v);
  }
  url.searchParams.set('sap-client', client);
  return url;
}

/** Query of the next page (`@odata.nextLink`) without `sap-client`, or '' on the last page. */
export function nextQuery(data: unknown): string {
  const link = (data as { '@odata.nextLink'?: unknown } | null)?.['@odata.nextLink'];
  if (typeof link !== 'string' || !link) return '';
  const params = new URL(link, 'http://odata.local/').searchParams;
  params.delete('sap-client');
  return params.toString();
}

export function rowsOf(data: unknown): Record<string, unknown>[] {
  const value = (data as { value?: unknown } | null)?.value;
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** SAP's message from an OData error body (V4 string or V2 {value}), plus distinct detail messages. */
export function sapErrorMessage(status: number, text: string): string {
  try {
    const error = (JSON.parse(text) as { error?: { message?: unknown; details?: unknown } }).error;
    const raw = error?.message;
    const main = typeof raw === 'string' ? raw : typeof (raw as { value?: unknown })?.value === 'string' ? (raw as { value: string }).value : '';
    const details = Array.isArray(error?.details)
      ? (error.details as { message?: unknown }[]).map(d => (typeof d?.message === 'string' ? d.message : '')).filter(m => m && m !== main)
      : [];
    const all = [main, ...details].filter(Boolean);
    if (all.length) return all.join(' · ');
  } catch {
    // Not JSON (an HTML error page, for example): fall through to the status.
  }
  return `SAP returned HTTP ${status}.`;
}
