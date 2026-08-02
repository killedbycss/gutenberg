const range = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => start + index)
const unique = (...groups) => [...new Set(groups.flat())]

const LATIN = range(0x20, 0x7e)
const CYRILLIC_RU = unique(range(0x0410, 0x044f), [0x0401, 0x0451])
const CYRILLIC_EXT = [
  ...range(0x0402, 0x040f), ...range(0x0452, 0x045f), 0x0490, 0x0491,
]
const DIACRITICS_BASIC = unique(
  range(0x00c0, 0x00ff).filter((code) => code !== 0x00d7 && code !== 0x00f7),
  [0x0152, 0x0153, 0x0178, 0x0160, 0x0161, 0x017d, 0x017e],
)
const DIACRITICS_EXT = range(0x0100, 0x017f)
const PUNCTUATION_BASIC = [
  0x00a0, 0x00a1, 0x00a2, 0x00a3, 0x00a5, 0x00a7, 0x00a9, 0x00ab, 0x00bb,
  0x00ae, 0x00b0, 0x00b1, 0x00b7, 0x00bf, 0x00d7, 0x00f7, 0x2013, 0x2014,
  0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020, 0x2021, 0x2022,
  0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x20bd, 0x2116, 0x2122, 0x2212,
]
const PUNCTUATION_EXT = [
  0x2044, 0x00bc, 0x00bd, 0x00be, 0x2153, 0x2154, 0x215b, 0x215c, 0x215d,
  0x215e, 0x2190, 0x2191, 0x2192, 0x2193, 0x2260, 0x2264, 0x2265, 0x221e,
]

const categories = (preset) => [
  ['latin', 'Латиница', LATIN],
  ['cyrillic', 'Кириллица', preset === 'extended' ? unique(CYRILLIC_RU, CYRILLIC_EXT) : CYRILLIC_RU],
  ['diacritics', 'Диакритика', preset === 'extended' ? unique(DIACRITICS_BASIC, DIACRITICS_EXT) : DIACRITICS_BASIC],
  ['punctuation', 'Пунктуация и знаки', preset === 'extended' ? unique(PUNCTUATION_BASIC, PUNCTUATION_EXT) : PUNCTUATION_BASIC],
]

export function coverageFromCmap(cmap, preset = 'basic') {
  const encoded = new Set(Object.keys(cmap || {}).map(Number))
  const result = categories(preset).map(([key, label, codepoints]) => {
    const missingCodes = codepoints.filter((code) => !encoded.has(code))
    const present = codepoints.length - missingCodes.length
    return {
      key, label, total: codepoints.length, present, missing: missingCodes.length,
      coverage: codepoints.length ? Math.floor(present / codepoints.length * 100) : 100,
      missingGlyphs: missingCodes.slice(0, 500).map((code) => ({
        cp: `U+${code.toString(16).toUpperCase().padStart(4, '0')}`,
        char: code === 0x20 || code === 0x00a0 ? '' : String.fromCodePoint(code),
        name: null,
      })),
      missingTruncated: missingCodes.length > 500,
    }
  })
  const total = result.reduce((sum, item) => sum + item.total, 0)
  const present = result.reduce((sum, item) => sum + item.present, 0)
  return { preset, total, present, missing: total - present, coverage: total ? Math.floor(present / total * 100) : 100, complete: present === total, categories: result }
}
