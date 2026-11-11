import { RefreshCw } from 'lucide-react';

/** Spinner with text, or ALM's three-bar shimmer placeholder. */
export function Loading({ text = 'Loading…', shimmer = false }: { text?: string; shimmer?: boolean }) {
  if (shimmer) return <div className="ov-info-shimmer" role="status" aria-label={text}><i /><i /><i /></div>;
  return <div className="empty" role="status"><RefreshCw size={18} className="spin" /><p>{text}</p></div>;
}
