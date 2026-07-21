// Формульный подбор макета: метрики шрифта + назначение → LayoutSpec.
//
// Это заменяемый слой ПОДБОРА. Он не знает о рендеринге — только собирает объект
// схемы (schema.js). Позже сюда же можно добавить генератор из готовых шаблонов
// (`generator: 'template:<id>'`), не трогая рендер: важно лишь вернуть LayoutSpec.
//
// Ключевые правила (см. README, раздел «Формулы»):
//   • Оптический размер привязан к cap-height: fontSize = capPx / (capHeight/UPM),
//     поэтому разные шрифты дают одинаковый видимый рост заголовка.
//   • Кегли — модульная шкала: заголовок / ratio → подзаголовок / ratio → текст.
//   • Интерлиньяж выводится из вертикальных метрик шрифта.
//   • Блоки реально измеряются (measurer) и раскладываются потоком, при этом
//     каждый блок ограничен доступной высотой — тексты не наезжают друг на друга.

import { FONT_KEY, SCHEMA_VERSION } from './schema'
import { PALETTES } from './purposes'
import { wrapText } from '../render/textLayout'

const MAX_LINES = { headline: 3, subhead: 2, body: 6, caption: 2 }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const norm = (v, total) => +(v / total).toFixed(4)

export function generateLayout({ purpose, metrics, content, variant = 'top-left', palette, measurer }) {
  const W = purpose.width
  const H = purpose.height
  const short = Math.min(W, H)
  const s = purpose.scale

  const upm = metrics.unitsPerEm || 1000
  const capRatio = (metrics.capHeight || upm * 0.7) / upm

  // Кегли: заголовок привязан к cap-height, ниже — по модульной шкале.
  const capPx = s.headlineCap * short
  const fH = Math.round(capPx / capRatio)
  const fSub = Math.round(fH / s.ratio)
  const fBody = Math.round(Math.max(fSub / s.ratio, s.minBody * short))
  const fCap = Math.round(Math.max(fBody / 1.2, s.minBody * short * 0.8))

  // Интерлиньяж из метрик шрифта (доля высоты строки от кегля).
  const asc = metrics.ascent ?? upm * 0.8
  const desc = metrics.descent ?? -upm * 0.2
  const gap = metrics.lineGap ?? 0
  const natural = (asc - desc + gap) / upm
  const lhTight = clamp(natural * 0.94, 1.0, 1.3)
  const lhNormal = clamp(natural, 1.05, 1.45)
  const lhLoose = clamp(natural * 1.15, 1.3, 1.7)

  // Палитра: либо id пресета (строка), либо кастомный объект {bg,fg,accent,muted}.
  const pal = (palette && typeof palette === 'object')
    ? palette
    : (PALETTES[palette] || PALETTES[purpose.palette] || PALETTES.ink)
  const marginX = Math.round(s.marginX * W)
  const marginY = Math.round(s.marginY * H)

  const roles = {
    headline: { text: content.headline || '', fontSize: fH, lineHeight: lhTight, letterSpacing: -0.01, color: pal.fg },
    subhead: { text: content.subhead || '', fontSize: fSub, lineHeight: lhNormal, letterSpacing: 0, color: pal.accent },
    body: { text: content.body || '', fontSize: fBody, lineHeight: lhLoose, letterSpacing: 0, color: pal.fg },
    caption: { text: content.caption || '', fontSize: fCap, lineHeight: lhNormal, letterSpacing: 0.01, color: pal.muted },
  }

  // Авто-подгонка: если заголовок+подзаголовок+текст не помещаются по высоте,
  // ужимаем их кегли единым коэффициентом (подпись остаётся читаемой).
  const colW = W - 2 * marginX
  const availableH = H - 2 * marginY - captionSpace(measurer, roles, colW)
  const scale = fitColumn({ roles, order: ['headline', 'subhead', 'body'], colW, availableH, measurer })
  if (scale < 1) {
    for (const roleId of ['headline', 'subhead', 'body']) {
      roles[roleId].fontSize = Math.round(roles[roleId].fontSize * scale)
    }
  }

  const build = LAYOUTS[variant] || LAYOUTS['top-left']
  const frames = build({ W, H, marginX, marginY, roles, content, measurer })

  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      purpose: purpose.id,
      generator: 'formula@1',
      variant,
      title: content.headline || 'Макет',
      createdAt: new Date().toISOString(),
    },
    canvas: {
      width: W, height: H, unit: purpose.unit, dpi: purpose.dpi,
      background: { type: 'solid', color: pal.bg },
    },
    grid: {
      columns: 6, gutter: 0.02,
      margin: norm(marginX, W),
      baseline: norm(fBody * lhLoose, H),
    },
    fonts: {
      [FONT_KEY]: {
        ref: metrics.sha256 ? `upload:${metrics.sha256}` : 'upload:current',
        family: metrics.family || 'Загруженный шрифт',
        metrics,
      },
    },
    frames,
    palette: (palette && typeof palette === 'object') ? 'custom' : (palette || purpose.palette),
  }
}

// --- Помощники раскладки ---------------------------------------------------

function measureBlock(measurer, base, colW, maxLines) {
  const lines = wrapText({
    text: base.text, measurer,
    fontSizePx: base.fontSize, letterSpacingPx: base.letterSpacing * base.fontSize,
    maxWidthPx: colW, maxLines,
  })
  return { lines, height: lines.length * base.fontSize * base.lineHeight }
}

// Сумма высот блоков колонки при заданном масштабе кегля (для авто-подгонки).
function naturalColumnHeight(roles, order, colW, measurer, scale = 1) {
  let h = 0
  let first = true
  for (const roleId of order) {
    const base = roles[roleId]
    if (!base || !base.text.trim()) continue
    const b = scale === 1 ? base : { ...base, fontSize: base.fontSize * scale }
    const { height } = measureBlock(measurer, b, colW, MAX_LINES[roleId])
    h += (first ? 0 : b.fontSize * 0.5) + height
    first = false
  }
  return h
}

// Коэффициент, при котором колонка помещается в availableH (не меньше 0.45).
function fitColumn({ roles, order, colW, availableH, measurer }) {
  let scale = 1
  const need1 = naturalColumnHeight(roles, order, colW, measurer, 1)
  if (need1 > availableH && need1 > 0) scale = availableH / need1
  const need2 = naturalColumnHeight(roles, order, colW, measurer, scale)
  if (need2 > availableH && need2 > 0) scale *= availableH / need2
  return clamp(scale, 0.45, 1)
}

function textFrame(roleId, xPx, yPx, wPx, hPx, base, align, maxLines, W, H) {
  return {
    id: roleId, type: 'text', role: roleId, editable: true,
    box: { x: norm(xPx, W), y: norm(yPx, H), w: norm(wPx, W), h: norm(hPx, H) },
    z: 2,
    text: {
      content: base.text, font: FONT_KEY,
      fontSize: base.fontSize, lineHeight: base.lineHeight, letterSpacing: base.letterSpacing,
      align, valign: 'top', color: base.color, transform: 'none', maxLines,
    },
  }
}

function imageFrame(id, xPx, yPx, wPx, hPx, src, W, H, fit = 'contain', align = 'left', z = 3) {
  return {
    id, type: 'image', role: 'image', editable: true,
    box: { x: norm(xPx, W), y: norm(yPx, H), w: norm(wPx, W), h: norm(hPx, H) },
    z,
    image: { src: src || null, fit, align },
  }
}

// Поток текста сверху вниз от startY, но не ниже maxY: каждому блоку выдаётся
// остаток высоты, число строк режется под него → блоки не наезжают друг на друга.
function stackColumn({ colX, colW, startY, maxY, align, order, roles, measurer, W, H }) {
  let y = startY
  const frames = []
  let first = true
  for (const roleId of order) {
    const base = roles[roleId]
    if (!base || !base.text.trim()) continue
    const top = y + (first ? 0 : base.fontSize * 0.5)
    const lhPx = base.fontSize * base.lineHeight
    const fitLines = Math.floor((maxY - top) / lhPx)
    if (fitLines < 1) break // места больше нет — остальные блоки не размещаем
    const maxLines = Math.min(MAX_LINES[roleId], fitLines)
    const { lines } = measureBlock(measurer, base, colW, maxLines)
    const h = lines.length * lhPx
    frames.push(textFrame(roleId, colX, top, colW, h, base, align, maxLines, W, H))
    y = top + h
    first = false
  }
  return { frames, height: y - startY }
}

function captionSpace(measurer, roles, colW) {
  if (!roles.caption.text.trim()) return 0
  const { height } = measureBlock(measurer, roles.caption, colW, MAX_LINES.caption)
  return height + roles.caption.fontSize * 0.8 // высота + отбивка над подписью
}

function pushCaption(frames, roles, marginX, marginY, colW, align, measurer, W, H) {
  if (!roles.caption.text.trim()) return
  const { height } = measureBlock(measurer, roles.caption, colW, MAX_LINES.caption)
  frames.push(textFrame('caption', marginX, H - marginY - height, colW, height,
    roles.caption, align, MAX_LINES.caption, W, H))
}

function pushImages(frames, content, marginX, marginY, W, H, where) {
  const imgs = content.images || []
  if (!imgs.length) return
  const size = Math.round(Math.min(W, H) * 0.2)
  // Стартовый угол зависит от варианта; несколько картинок — каскадом со сдвигом.
  let baseX = marginX
  let baseY = marginY
  if (where === 'right') { baseX = W - marginX - size; baseY = H - marginY - size }
  else if (where === 'center-top') { baseX = Math.round((W - size) / 2); baseY = marginY }
  const step = Math.round(size * 0.34)
  const dir = where === 'right' ? -1 : 1
  imgs.forEach((im, i) => {
    frames.push(imageFrame(
      `img:${im.id}`,
      clamp(baseX + dir * i * step, 0, W - size),
      clamp(baseY + dir * i * step, 0, H - size),
      size, size, im.src, W, H, 'contain', where === 'center-top' ? 'center' : 'left', 3,
    ))
  })
}

// --- Варианты композиции ---------------------------------------------------

const LAYOUTS = {
  // Заголовок и текст от верхнего поля; подпись — внизу, лого — правый нижний угол.
  'top-left': ({ W, H, marginX, marginY, roles, content, measurer }) => {
    const colX = marginX
    const colW = W - 2 * marginX
    const maxY = H - marginY - captionSpace(measurer, roles, colW)
    const { frames } = stackColumn({
      colX, colW, startY: marginY, maxY, align: 'left',
      order: ['headline', 'subhead', 'body'], roles, measurer, W, H,
    })
    pushCaption(frames, roles, marginX, marginY, colW, 'left', measurer, W, H)
    pushImages(frames, content, marginX, marginY, W, H, 'right')
    return frames
  },

  // Весь блок текста по центру холста, выключка по центру.
  'centered': ({ W, H, marginX, marginY, roles, content, measurer }) => {
    const colX = marginX
    const colW = W - 2 * marginX
    const bottom = H - marginY - captionSpace(measurer, roles, colW)
    const probe = stackColumn({
      colX, colW, startY: marginY, maxY: bottom, align: 'center',
      order: ['headline', 'subhead', 'body'], roles, measurer, W, H,
    })
    const startY = clamp((marginY + bottom - probe.height) / 2, marginY, bottom - probe.height)
    const { frames } = stackColumn({
      colX, colW, startY, maxY: bottom, align: 'center',
      order: ['headline', 'subhead', 'body'], roles, measurer, W, H,
    })
    pushCaption(frames, roles, marginX, marginY, colW, 'center', measurer, W, H)
    pushImages(frames, content, marginX, marginY, W, H, 'center-top')
    return frames
  },

  // Заголовок и текст прижаты к нижней трети; лого — левый верхний угол.
  'bottom-band': ({ W, H, marginX, marginY, roles, content, measurer }) => {
    const colX = marginX
    const colW = W - 2 * marginX
    const bottom = H - marginY - captionSpace(measurer, roles, colW)
    const probe = stackColumn({
      colX, colW, startY: marginY, maxY: bottom, align: 'left',
      order: ['headline', 'subhead', 'body'], roles, measurer, W, H,
    })
    const startY = clamp(bottom - probe.height, marginY, bottom)
    const { frames } = stackColumn({
      colX, colW, startY, maxY: bottom, align: 'left',
      order: ['headline', 'subhead', 'body'], roles, measurer, W, H,
    })
    pushCaption(frames, roles, marginX, marginY, colW, 'left', measurer, W, H)
    pushImages(frames, content, marginX, marginY, W, H, 'left-top')
    return frames
  },
}
