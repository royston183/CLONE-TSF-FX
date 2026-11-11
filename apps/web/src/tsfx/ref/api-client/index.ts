export * from '@slc/api-client'
export { codeText, fmtDate, fmtNum, formatAmount, formatAmountWhileTyping, looseMatch, parseAmount, runLimited, toNum } from './format.ts'
/** A raw fetch of a gateway address (the gateway is same-origin); any status is answered, only an unreachable gateway rejects. */
export const refFetch = (address: string, init: RequestInit = {}): Promise<Response> => fetch(address, { credentials: 'same-origin', ...init })
