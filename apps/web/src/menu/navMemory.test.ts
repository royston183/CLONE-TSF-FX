import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EMPTY_MEMORY, levelKey, parseMemory, withScroll, withoutScroll } from './navMemory.ts'

describe('navMemory', () => {
  it('names a level by its path', () => {
    strictEqual(levelKey([]), '')
    strictEqual(levelKey([2, 0]), '2/0')
  })

  it('reads nothing from missing, broken or malformed storage', () => {
    deepStrictEqual(parseMemory(null), EMPTY_MEMORY)
    deepStrictEqual(parseMemory('{not json'), EMPTY_MEMORY)
    deepStrictEqual(parseMemory('{"path":"x","scroll":5}'), EMPTY_MEMORY)
  })

  it('keeps a good path and scroll map and drops bad entries', () => {
    const m = parseMemory('{"path":[2,1],"scroll":{"":120,"2":40,"3":-5,"4":"a"}}')
    deepStrictEqual(m, { path: [2, 1], scroll: { '': 120, '2': 40 } })
    deepStrictEqual(parseMemory('{"path":[1,-1]}').path, [])
    deepStrictEqual(parseMemory('{"path":[1.5]}').path, [])
  })

  it('records and forgets the scroll of one level without touching the others', () => {
    const a = withScroll(EMPTY_MEMORY, [], 310.6)
    const b = withScroll(a, [2], 50)
    deepStrictEqual(b.scroll, { '': 311, '2': 50 })
    deepStrictEqual(withoutScroll(b, [2]).scroll, { '': 311 })
    deepStrictEqual(withScroll(EMPTY_MEMORY, [], -4).scroll, { '': 0 })
    deepStrictEqual(b.path, [])
  })
})
