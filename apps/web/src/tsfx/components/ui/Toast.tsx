import { useCallback, useEffect, useState } from 'react';
import { tsfxPortalRoot } from '@tsfx/lib/portal-root';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export type ToastKind = 'info' | 'success' | 'error';
export interface ToastMessage { text: string; kind: ToastKind; at: number }

/** A toast that clears itself after 3.5 s. */
export function useToast(): [ToastMessage | null, (text: string, kind?: ToastKind) => void] {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify = useCallback((text: string, kind: ToastKind = 'info') => setToast({ text, kind, at: Date.now() }), []);
  return [toast, notify];
}

export function Toast({ toast }: { toast: ToastMessage | null }) {
  if (!toast) return null;
  return createPortal(
    <div className={`ds-toast ${toast.kind}`} role="status">{toast.kind === 'success' ? <CheckCircle2 size={16} /> : toast.kind === 'error' ? <AlertCircle size={16} /> : null}{toast.text}</div>,
    tsfxPortalRoot()
  );
}
