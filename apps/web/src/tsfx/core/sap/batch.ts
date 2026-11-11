import { randomId } from '../crypto';
import { sapErrorMessage } from './odata';

export interface BatchOp { method: 'POST' | 'PATCH' | 'DELETE'; path: string; body?: unknown; etag?: string }
export interface BatchAnswer { statuses: number[]; ok: boolean; message: string; bodies: (Record<string, unknown> | null)[] }

const nl = '\r\n';

/**
 * A multipart/mixed $batch with ONE changeset, so SAP applies all operations or none.
 * (On this gateway a JSON $batch returns 415; multipart with one changeset is the working form.)
 */
export function buildBatch(ops: BatchOp[], boundary = `batch_${randomId()}`, changeset = `changeset_${randomId()}`): { contentType: string; body: string } {
  const parts = ops.map((op, i) => {
    const headers = [
      `${op.method} ${op.path} HTTP/1.1`,
      ...(op.body !== undefined ? ['Content-Type: application/json'] : []),
      'Accept: application/json',
      ...(op.etag ? [`If-Match: ${op.etag}`] : [])
    ].join(nl);
    const payload = op.body !== undefined ? JSON.stringify(op.body) : '';
    return `--${changeset}${nl}Content-Type: application/http${nl}Content-Transfer-Encoding: binary${nl}Content-ID: ${i + 1}${nl}${nl}${headers}${nl}${nl}${payload}${nl}`;
  }).join('');
  return {
    contentType: `multipart/mixed; boundary=${boundary}`,
    body: `--${boundary}${nl}Content-Type: multipart/mixed; boundary=${changeset}${nl}${nl}${parts}--${changeset}--${nl}--${boundary}--${nl}`
  };
}

const jsonPart = (part: string): Record<string, unknown> | null => {
  const start = part.indexOf('{'), end = part.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { const v: unknown = JSON.parse(part.slice(start, end + 1)); return v && typeof v === 'object' ? v as Record<string, unknown> : null; } catch { return null; }
};

/** Status of every response part and the SAP message of the first failed one. */
export function parseBatch(text: string): BatchAnswer {
  const marks = [...text.matchAll(/HTTP\/1\.1 (\d{3})/g)];
  const parts = marks.map((m, i) => ({ status: Number(m[1]), body: text.slice(m.index, marks[i + 1]?.index ?? text.length) }));
  const statuses = parts.map(p => p.status);
  const failed = parts.find(p => p.status >= 400);
  let message = '';
  if (failed) {
    const start = failed.body.indexOf('{'), end = failed.body.lastIndexOf('}');
    message = start >= 0 && end > start ? sapErrorMessage(failed.status, failed.body.slice(start, end + 1)) : `SAP returned HTTP ${failed.status}.`;
  }
  // The entity of each successful part (a created entity carries the key SAP assigned).
  return { statuses, ok: statuses.length > 0 && statuses.every(s => s < 300), message, bodies: parts.map(p => (p.status < 300 ? jsonPart(p.body) : null)) };
}
