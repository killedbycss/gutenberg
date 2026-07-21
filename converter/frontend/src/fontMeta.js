// Справочники для человекочитаемого показа метрик и форматов.

export const WEIGHT_NAMES = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
}

export const WIDTH_NAMES = {
  1: 'Ultra Condensed',
  2: 'Extra Condensed',
  3: 'Condensed',
  4: 'Semi Condensed',
  5: 'Normal',
  6: 'Semi Expanded',
  7: 'Expanded',
  8: 'Extra Expanded',
  9: 'Ultra Expanded',
}

export function weightLabel(w) {
  if (w == null) return null
  return WEIGHT_NAMES[w] ? `${w} · ${WEIGHT_NAMES[w]}` : String(w)
}

export function widthLabel(w) {
  if (w == null) return null
  return WIDTH_NAMES[w] ? `${w} · ${WIDTH_NAMES[w]}` : String(w)
}

export function formatBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return `${n} Б`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`
  return `${(n / 1024 / 1024).toFixed(2)} МБ`
}

// Пояснение к типу контуров в бейдже формата.
export const OUTLINE_LABEL = {
  cff: 'CFF · кубические',
  glyf: 'glyf · квадратичные',
}
