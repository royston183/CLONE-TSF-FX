import { ArrowLeft } from 'lucide-react';
import { useRouter } from '@tsfx/lib/client/nav';
import { resolveTrail } from '@tsfx/config/catalog';
import { safeFrom } from '@tsfx/lib/drill/params';
import { formatField } from '@tsfx/lib/fields';
import { MODULES } from '@tsfx/modules/registry';

/** "Liquidity Statement · 1000 - Demo India Ltd · 01-2026" and the back label, from a same-app path and its s.* selection. */
export function fromInfo(from: string): { text: string; back: string } {
  const url = new URL(from, 'http://app.invalid');
  const { current, invalid } = resolveTrail(url.pathname.split('/').filter(Boolean));
  if (invalid) return { text: url.pathname, back: 'Back' };
  const def = current.module && Object.hasOwn(MODULES, current.module) ? MODULES[current.module] : undefined;
  const selection = Object.fromEntries([...url.searchParams].filter(([k]) => k.startsWith('s.')).map(([k, v]) => [k.slice(2), v]));
  const parts = def && 'selection' in def ? def.selection.map(d => formatField(d, selection, def.lookups(undefined))).filter(Boolean) : [];
  const back = def?.kind === 'report' ? 'Back to report' : def?.kind === 'dashboard' ? 'Back to dashboard' : `Back to ${current.title}`;
  return { text: [current.title, ...parts].join(' · '), back };
}

/** The slim bar of a screen opened by a drill (spec §5.2); nothing unless `from` is a safe same-app path. */
export function DrillFromBar({ from }: { from: string | null }) {
  const router = useRouter();
  const back = safeFrom(from);
  if (!back) return null;
  const info = fromInfo(back);
  return (
    <div className="kit-drill-from" role="status">
      <span>Opened from <b>{info.text}</b></span>
      <button type="button" className="text-button" onClick={() => router.push(back)}><ArrowLeft size={14} />{info.back}</button>
    </div>
  );
}
