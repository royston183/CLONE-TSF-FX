import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isPlainF3, pickBackTarget, type BackEntry } from './back-shortcut.ts'

const entry = (label: string): BackEntry => ({ label, run: () => {} })
const key = (over: Partial<Parameters<typeof isPlainF3>[0]> = {}) => ({ key: 'F3', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...over })

describe('F3 is Back', () => {
  it('presses the button labelled Back, not an Exit button next to it', () => {
    const back = entry('Back')
    strictEqual(pickBackTarget([entry('Exit'), back]), back)
  })

  it('with no button labelled Back it presses the first one mounted, and with none it does nothing', () => {
    const first = entry('Cancel')
    strictEqual(pickBackTarget([first, entry('Exit')]), first)
    strictEqual(pickBackTarget([]), undefined)
  })

  it('acts on a plain F3 only', () => {
    strictEqual(isPlainF3(key()), true)
    deepStrictEqual([key({ key: 'F4' }), key({ ctrlKey: true }), key({ shiftKey: true }), key({ altKey: true }), key({ metaKey: true }), key({ repeat: true })].map(isPlainF3), [false, false, false, false, false, false])
  })
})
