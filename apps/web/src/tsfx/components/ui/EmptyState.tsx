import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return <div className="empty"><span className="empty-icon">{icon ?? <Inbox size={30} />}</span><h2>{title}</h2>{text && <p>{text}</p>}{action}</div>;
}
