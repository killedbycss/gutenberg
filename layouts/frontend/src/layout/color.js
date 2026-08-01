// Конвертации цвета для кастомной палитры. Внутреннее хранение — HEX (экран, RGB).
// CMYK здесь — упрощённая модель (без ICC-профилей): удобно вводить «печатные»
// значения, на экране всё равно показываем RGB-эквивалент.

export function clamp255(n) {
  return Math.max(0, Math.min(255, Math.round(n)))
}

export function hexToRgb(hex) {
  let h = String(hex || '').trim().replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6) return { r: 0, g: 0, b: 0 }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

export function rgbToHex({ r, g, b }) {
  const to = (n) => clamp255(n).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// CMYK в процентах (0..100) → RGB (0..255).
export function cmykToRgb({ c, m, y, k }) {
  const C = c / 100, M = m / 100, Y = y / 100, K = k / 100
  return {
    r: clamp255(255 * (1 - C) * (1 - K)),
    g: clamp255(255 * (1 - M) * (1 - K)),
    b: clamp255(255 * (1 - Y) * (1 - K)),
  }
}

// RGB (0..255) → CMYK в процентах (0..100), округлённые.
export function rgbToCmyk({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255
  const k = 1 - Math.max(R, G, B)
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 }
  const c = (1 - R - k) / (1 - k)
  const m = (1 - G - k) / (1 - k)
  const y = (1 - B - k) / (1 - k)
  const p = (n) => Math.round(n * 100)
  return { c: p(c), m: p(m), y: p(y), k: p(k) }
}

export const hexToCmyk = (hex) => rgbToCmyk(hexToRgb(hex))
export const cmykToHex = (cmyk) => rgbToHex(cmykToRgb(cmyk))

// Экранные RGB-приближения распространённых Pantone Solid Coated. Без
// физического веера и ICC-профиля это ориентир, а не цветопроба для печати.
export const PANTONE_COLORS = [
  ['Pantone White', '#FFFFFF'], ['Pantone Cool Gray 5 C', '#B1B3B3'], ['Pantone Black C', '#2D2926'],
  ['Pantone 186 C', '#C8102E'], ['Pantone 485 C', '#DA291C'], ['Pantone 151 C', '#FF8200'],
  ['Pantone 123 C', '#FFC72C'], ['Pantone 354 C', '#00B140'], ['Pantone 347 C', '#009A44'],
  ['Pantone 300 C', '#005EB8'], ['Pantone 286 C', '#0033A0'], ['Pantone 2592 C', '#9B26B6'],
  ['Pantone 219 C', '#DA1884'],
].map(([name, hex]) => ({ name, hex }))

export function nearestPantone(hex) {
  const rgb = hexToRgb(hex)
  return PANTONE_COLORS.reduce((best, item) => {
    const candidate = hexToRgb(item.hex)
    const distance = (rgb.r - candidate.r) ** 2 + (rgb.g - candidate.g) ** 2 + (rgb.b - candidate.b) ** 2
    return !best || distance < best.distance ? { ...item, distance } : best
  }, null)
}
