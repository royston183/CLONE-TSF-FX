/** One <option> as the search popup lists it. */
export type SelectOption = { value: string; label: string; disabled: boolean }

/**
 * The options matching what was typed, in their original order within each tier: those whose
 * text or value starts with it ("SG" -> "SG01 - Singapore"), then those with a word that does
 * ("IN11 - Olam SG Branch"). Case is ignored; an empty query lists everything.
 */
export function rankOptions(options: readonly SelectOption[], query: string): SelectOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options.slice()
  const starts: SelectOption[] = []
  const words: SelectOption[] = []
  for (const o of options) {
    const label = o.label.toLowerCase()
    if (label.startsWith(q) || o.value.toLowerCase().startsWith(q)) starts.push(o)
    else if (label.split(/[\s\-–—/·(),:|_]+/).some((w) => w.startsWith(q))) words.push(o)
  }
  return [...starts, ...words]
}
