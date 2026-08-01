// Слой РЕНДЕРИНГА. Принимает LayoutSpec (schema.js) и превращает его в список
// примитивов в АБСОЛЮТНЫХ пикселях холста. Один расчёт (specToDrawOps) питает
// два сериализатора: интерактивный превью на React (Preview.jsx) и статический
// самодостаточный SVG для экспорта (buildSvgString).

import { RENDER_FONT_FAMILY } from '../layout/schema'
import { wrapText } from './textLayout'
import iphoneStatusBar from '../assets/iphone-status-bar.svg?raw'

const island = '<rect x="138.5" y="13.6665" width="125" height="37" rx="18.5" fill="black"/>'
const darkStatusBar = iphoneStatusBar.replace(island, '__ISLAND__').replaceAll('fill="black"', 'fill="white"').replace('__ISLAND__', island)
const IPHONE_STATUS_BAR_LIGHT = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iphoneStatusBar)}`
const IPHONE_STATUS_BAR_DARK = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(darkStatusBar)}`

function applyTransform(text, transform) {
  if (transform === 'uppercase') return text.toUpperCase()
  if (transform === 'lowercase') return text.toLowerCase()
  return text
}

// LayoutSpec → примитивы. placeholders=true добавляет рамки-подсказки для
// пустых редактируемых слотов (только в превью, не в экспорте).
export function specToDrawOps(spec, measurer, { placeholders = false } = {}) {
  const W = spec.canvas.width
  const H = spec.canvas.height
  const ops = [{ kind: 'bg', color: spec.canvas.background?.color || '#ffffff', w: W, h: H }]
  const fonts = spec.fonts || {}
  const frames = [...(spec.frames || [])].sort((a, b) => (a.z || 0) - (b.z || 0))

  for (const f of frames) {
    if (f.hidden) continue // скрытые блоки не рисуются и не экспортируются
    const x = f.box.x * W
    const y = f.box.y * H
    const w = f.box.w * W
    const h = f.box.h * H

    if (f.type === 'text') {
      const t = f.text
      const fm = fonts[t.font]?.metrics || {}
      const upm = fm.unitsPerEm || 1000
      const asc = fm.ascent ?? upm * 0.8
      const desc = fm.descent ?? -upm * 0.2
      const fs = t.fontSize
      const lsPx = (t.letterSpacing || 0) * fs
      const lhPx = (t.lineHeight || 1.2) * fs
      const content = applyTransform(t.content || '', t.transform)

      if (!content.trim()) {
        if (placeholders && f.editable) ops.push(placeholder(f, x, y, w, h))
        continue
      }

      const lines = wrapText({
        text: content, measurer, fontSizePx: fs, letterSpacingPx: lsPx,
        maxWidthPx: w, maxLines: t.maxLines || 1000,
      })
      const blockH = lines.length * lhPx
      let top = y
      if (t.valign === 'middle') top = y + (h - blockH) / 2
      else if (t.valign === 'bottom') top = y + (h - blockH)

      // Смещение базовой линии: половинный leading (как в CSS line-height).
      const ascPx = (fs * asc) / upm
      const descPx = (fs * -desc) / upm
      const lead = lhPx - (ascPx + descPx)
      const anchor = t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start'
      const tx = anchor === 'middle' ? x + w / 2 : anchor === 'end' ? x + w : x

      ops.push({
        kind: 'text', frameId: f.id,
        lines: lines.map((text, i) => ({ text, x: tx, y: top + lead / 2 + ascPx + i * lhPx })),
        fontSize: fs, fill: t.color || '#000', letterSpacing: lsPx, anchor,
        box: { x, y, w, h }, fontFamily: spec.meta?.renderFontFamily || RENDER_FONT_FAMILY,
      })
    } else if (f.type === 'image') {
      if (f.image?.src) {
        ops.push({ kind: 'image', frameId: f.id, x, y, w, h, href: f.image.src, fit: f.image.fit || 'contain' })
      } else if (placeholders && f.editable) {
        ops.push(placeholder(f, x, y, w, h, 'изображение'))
      }
    }
  }
  return { width: W, height: H, ops }
}

function placeholder(f, x, y, w, h, label) {
  return { kind: 'placeholder', frameId: f.id, role: f.role, x, y, w, h, label: label || f.role }
}

// --- Экспорт: самодостаточный SVG со встроенным шрифтом --------------------

const round = (n) => Math.round(n * 100) / 100

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]
  ))
}

// LayoutSpec → строка SVG. fontCss — правило @font-face со шрифтом, встроенным
// data-URL, чтобы файл открывался где угодно без внешних зависимостей.
export function buildSvgString(spec, measurer, { fontCss = '' } = {}) {
  const draw = specToDrawOps(spec, measurer, { placeholders: false })
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${draw.width}" height="${draw.height}" viewBox="0 0 ${draw.width} ${draw.height}">`,
  ]
  if (fontCss) parts.push(`<defs><style>${fontCss}</style></defs>`)

  for (const op of draw.ops) {
    if (op.kind === 'bg') {
      parts.push(`<rect x="0" y="0" width="${op.w}" height="${op.h}" fill="${op.color}"/>`)
    } else if (op.kind === 'image') {
      const par = op.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'
      parts.push(
        `<image x="${round(op.x)}" y="${round(op.y)}" width="${round(op.w)}" height="${round(op.h)}" preserveAspectRatio="${par}" href="${op.href}"/>`,
      )
    } else if (op.kind === 'text') {
      const tspans = op.lines
        .map((l) => `<tspan x="${round(l.x)}" y="${round(l.y)}">${escapeXml(l.text)}</tspan>`)
        .join('')
      parts.push(
        `<text font-family="'${op.fontFamily || RENDER_FONT_FAMILY}', Arial, sans-serif" font-size="${op.fontSize}" fill="${op.fill}" text-anchor="${op.anchor}" letter-spacing="${round(op.letterSpacing)}">${tspans}</text>`,
      )
    }
  }
  parts.push(deviceChromeSvg(spec.meta?.purpose, draw.width, draw.height, spec.canvas.background?.color || '#fff'))
  parts.push('</svg>')
  return parts.join('')
}

function deviceChromeSvg(purpose, width, height, background) {
  const hex = background.replace('#', '')
  const rgb = hex.length === 6 ? [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16)) : [255, 255, 255]
  const dark = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 < 128
  const ink = dark ? '#fff' : '#111'
  const faint = dark ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.15)'
  if (purpose === 'mobile-portrait') return `<g><image href="${dark ? IPHONE_STATUS_BAR_DARK : IPHONE_STATUS_BAR_LIGHT}" x="0" y="0" width="${width}" height="${width*62/402}"/><rect x="${width*.36}" y="${height*.976}" width="${width*.28}" height="${height*.004}" rx="${height*.002}" fill="${ink}" opacity=".8"/></g>`
  if (purpose === 'tablet-portrait') return `<g><circle cx="${width*.5}" cy="${height*.015}" r="${height*.004}" fill="${ink}" opacity=".65"/><text x="${width*.04}" y="${height*.03}" fill="${ink}" font-family="sans-serif" font-size="${height*.011}" font-weight="600">9:41</text><rect x="${width*.43}" y="${height*.977}" width="${width*.14}" height="${height*.0035}" rx="${height*.002}" fill="${ink}" opacity=".7"/></g>`
  if (purpose === 'desktop-hd') return `<g><rect width="${width}" height="${height*.075}" fill="${faint}"/><circle cx="${width*.022}" cy="${height*.037}" r="${height*.009}" fill="#ff5f57"/><circle cx="${width*.042}" cy="${height*.037}" r="${height*.009}" fill="#febc2e"/><circle cx="${width*.062}" cy="${height*.037}" r="${height*.009}" fill="#28c840"/><rect x="${width*.16}" y="${height*.018}" width="${width*.68}" height="${height*.038}" rx="${height*.019}" fill="${background}" opacity=".72" stroke="${ink}" stroke-opacity=".18"/><text x="${width*.5}" y="${height*.044}" text-anchor="middle" fill="${ink}" opacity=".6" font-family="sans-serif" font-size="${height*.014}">gutenberg.local</text></g>`
  if (purpose === 'ebook-reader') return `<g><text x="${width*.05}" y="${height*.026}" fill="${ink}" opacity=".7" font-family="serif" font-size="${height*.01}">09:41</text><text x="${width*.95}" y="${height*.026}" text-anchor="end" fill="${ink}" opacity=".7" font-family="sans-serif" font-size="${height*.01}">82%</text><line x1="${width*.05}" y1="${height*.955}" x2="${width*.95}" y2="${height*.955}" stroke="${ink}" stroke-opacity=".22"/></g>`
  if (purpose === 'book-a5' || purpose === 'book-145x215') return `<g><line x1="${width*.08}" y1="${height*.94}" x2="${width*.92}" y2="${height*.94}" stroke="${ink}" stroke-opacity=".18"/><text x="${width*.5}" y="${height*.965}" text-anchor="middle" fill="${ink}" opacity=".65" font-family="serif" font-size="${height*.009}">— 24 —</text></g>`
  return ''
}

// SVG-строка → PNG Blob через offscreen canvas. scale множит разрешение.
export async function svgToPngBlob(svgString, width, height, scale = 1) {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Не удалось отрисовать SVG'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}
