import { useCallback, useState } from 'react'
import { StatusPopup, type StatusTone } from '../popup/Popup.tsx'

/** Queue real responses so a second result cannot hide an earlier business error. */
export function useMasterContractFeedback() {
  const [messages, setMessages] = useState<Array<{ message: string; tone: StatusTone }>>([])
  const show = useCallback((message: string, tone: StatusTone = 'info') => {
    setMessages(items => [...items, { message, tone }])
  }, [])
  const close = useCallback(() => setMessages(items => items.slice(1)), [])
  const current = messages[0]
  const element = current ? <StatusPopup open tone={current.tone}
    title={current.tone === 'success' ? 'Action Completed' : current.tone === 'error' ? 'Action Failed' : current.tone === 'warning' ? 'Action Required' : 'Information'}
    message={current.message} onClose={close} /> : null
  return { show, element }
}
