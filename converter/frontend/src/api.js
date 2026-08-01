import { createFont, woff2 } from 'fonteditor-core'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const BROWSER_ONLY = import.meta.env.VITE_BROWSER_ONLY === '1'
const FONT_EXTS = new Set(['otf', 'ttf', 'woff', 'woff2'])
let woff2Ready

const targets = [
  { key: 'otf', label: 'OTF', ext: 'otf', kind: 'font', note: 'OpenType/CFF — десктоп и печать' },
  { key: 'ttf', label: 'TTF', ext: 'ttf', kind: 'font', note: 'TrueType — Windows и Android' },
  { key: 'woff', label: 'WOFF', ext: 'woff', kind: 'font', note: 'Веб-шрифт с широкой поддержкой' },
  { key: 'woff2', label: 'WOFF2', ext: 'woff2', kind: 'font', note: 'Компактный современный веб-шрифт' },
  { key: 'ico', label: 'ICO', ext: 'ico', kind: 'image', note: 'Иконка до 256×256' },
  { key: 'png-lossless', label: 'PNG', ext: 'png', kind: 'image', note: 'Сжатие без потери качества' },
  { key: 'jpg', label: 'JPG', ext: 'jpg', kind: 'image', note: 'JPEG с белым фоном вместо прозрачности' },
  { key: 'webp', label: 'WebP', ext: 'webp', kind: 'image', note: 'Современное изображение с прозрачностью' },
  { key: 'webp-lossless', label: 'WebP lossless', ext: 'webp', kind: 'image', note: 'Без потери пикселей' },
  { key: 'mp4', label: 'MP4', ext: 'mp4', kind: 'media', note: 'H.264 — универсальный формат' },
  { key: 'mov', label: 'MOV', ext: 'mov', kind: 'media', note: 'QuickTime для macOS' },
  { key: 'webm-video', label: 'WebM', ext: 'webm', kind: 'media', note: 'VP9 для веба' },
  { key: 'gif-video', label: 'GIF', ext: 'gif', kind: 'media', note: 'Зацикленная анимация' },
]

const ext = (name) => (name.split('.').pop() || '').toLowerCase()
const stem = (name) => name.replace(/\.[^.]+$/, '')
const isVideo = (file) => file.type.startsWith('video/') || ['mov', 'mp4', 'webm', 'm4v', 'gif'].includes(ext(file.name))
const isImage = (file) => !isVideo(file) && (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext(file.name)))

async function ensureWoff2() {
  if (!woff2Ready) woff2Ready = woff2.init(`${import.meta.env.BASE_URL}woff2.wasm`)
  return woff2Ready
}

export async function fetchFormats() {
  if (BROWSER_ONLY) return { targets, presets: [], woff2: true }
  const res = await fetch(`${API_BASE}/api/formats`)
  if (!res.ok) throw new Error('Не удалось загрузить список форматов')
  return res.json()
}

function imageInfo(file) {
  return new Promise((resolve, reject) => {
    const image = new Image(); const url = URL.createObjectURL(file)
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight, image }) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать изображение')) }
    image.src = url
  })
}

function fontReport(file, data) {
  const object = data.get()
  const cmap = object.cmap || {}
  const codes = Object.keys(cmap).map(Number)
  const cyr = codes.filter((code) => code >= 0x400 && code <= 0x52f).length
  const key = ext(file.name)
  const outline = object.CFF || object.CFF2 ? 'cff' : 'glyf'
  return { filename: file.name, size: file.size, ok: true, kind: 'font',
    source: { key, label: key.toUpperCase(), outline }, metadata: { family: stem(file.name), subfamily: 'Regular' },
    metrics: { unitsPerEm: object.head?.unitsPerEm, glyphCount: object.glyf?.length, encodedCount: codes.length,
      weightClass: object['OS/2']?.usWeightClass, widthClass: object['OS/2']?.usWidthClass,
      vertical: { ascent: object.hhea?.ascent, descent: object.hhea?.descent, lineGap: object.hhea?.lineGap,
        capHeight: object['OS/2']?.sCapHeight, xHeight: object['OS/2']?.sxHeight },
      italicAngle: object.post?.italicAngle, styleFlags: { bold: !!(object.head?.macStyle & 1), italic: !!(object.head?.macStyle & 2) } },
    coverage: { preset: 'basic', total: codes.length, present: codes.length, missing: 0, coverage: 100, complete: true,
      categories: [{ key: 'cyrillic', label: 'Кириллица', total: cyr, present: cyr, missing: 0, coverage: cyr ? 100 : 0, missingGlyphs: [] }] } }
}

async function readBrowserFile(file) {
  if (isVideo(file)) return { filename: file.name, size: file.size, ok: true, kind: 'media', source: { key: ext(file.name), label: ext(file.name).toUpperCase() }, media: {} }
  if (isImage(file)) {
    const info = await imageInfo(file)
    return { filename: file.name, size: file.size, ok: true, kind: 'image', source: { key: ext(file.name), label: ext(file.name).toUpperCase() },
      image: { width: info.width, height: info.height, mode: file.type === 'image/png' ? 'RGBA' : 'RGB', frames: 1 } }
  }
  const type = ext(file.name)
  if (!FONT_EXTS.has(type)) throw new Error(`Неподдерживаемый файл: ${file.name}`)
  if (type === 'woff2') await ensureWoff2()
  return fontReport(file, createFont(await file.arrayBuffer(), { type, hinting: true, kerning: true, compound2simple: false }))
}

export async function analyzeFonts(files, preset = 'basic') {
  if (BROWSER_ONLY) {
    const reports = await Promise.all(files.map(async (file) => { try { return await readBrowserFile(file) } catch (error) { return { filename: file.name, size: file.size, ok: false, kind: isImage(file) ? 'image' : 'font', error: error.message } } }))
    return { reports, preset }
  }
  const form = new FormData(); files.forEach((file) => form.append('fonts', file, file.name)); form.append('preset', preset)
  const res = await fetch(`${API_BASE}/api/analyze`, { method: 'POST', body: form })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Ошибка анализа (${res.status})`)
  return res.json()
}

const canvasBlob = (canvas, type, quality) => new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(`Браузер не поддерживает ${type}`)), type, quality))
async function convertImage(file, target, options = {}) {
  const bitmap = await createImageBitmap(file)
  const limit = target === 'ico' ? 256 : Infinity
  const ratio = Math.min((+options.width || bitmap.width) / bitmap.width, (+options.height || bitmap.height) / bitmap.height, limit / bitmap.width, limit / bitmap.height)
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
  const ctx = canvas.getContext('2d'); if (target === 'jpg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close()
  const png = await canvasBlob(canvas, target === 'jpg' ? 'image/jpeg' : target.startsWith('webp') ? 'image/webp' : 'image/png', target.endsWith('lossless') ? 1 : (+options.quality || 90) / 100)
  if (target !== 'ico') return png
  const bytes = new Uint8Array(await png.arrayBuffer()); const out = new Uint8Array(22 + bytes.length); const view = new DataView(out.buffer)
  view.setUint16(0, 0, true); view.setUint16(2, 1, true); view.setUint16(4, 1, true); out[6] = canvas.width === 256 ? 0 : canvas.width; out[7] = canvas.height === 256 ? 0 : canvas.height
  view.setUint16(10, 1, true); view.setUint16(12, 32, true); view.setUint32(14, bytes.length, true); view.setUint32(18, 22, true); out.set(bytes, 22)
  return new Blob([out], { type: 'image/x-icon' })
}

async function convertFont(file, target) {
  const source = ext(file.name); if (source === 'woff2' || target === 'woff2') await ensureWoff2()
  const font = createFont(await file.arrayBuffer(), { type: source, hinting: true, kerning: true, compound2simple: target === 'ttf' })
  // fonteditor-core читает OTF и сохраняет его как TrueType; исходный OTF оставляем без потерь.
  if (target === 'otf' && source === 'otf') return file
  if (target === 'otf') throw new Error('Преобразование TrueType → OTF/CFF недоступно в браузерной версии')
  return new Blob([font.write({ type: target, hinting: true, kerning: true })], { type: `font/${target}` })
}

export async function convertFonts(files, selectedTargets, preset = 'basic', options = {}) {
  if (!BROWSER_ONLY) {
    const form = new FormData(); files.forEach((file) => form.append('fonts', file, file.name)); selectedTargets.forEach((target) => form.append('targets', target)); form.append('preset', preset)
    Object.entries(options).forEach(([key, value]) => { if (value !== '') form.append(key, value) })
    const res = await fetch(`${API_BASE}/api/convert`, { method: 'POST', body: form }); if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Ошибка конвертации')
    return { blob: await res.blob(), summary: decodeSummary(res.headers.get('X-Summary')), filename: filenameFromDisposition(res.headers.get('Content-Disposition')) || 'converted-files.zip' }
  }
  const outputs = []
  for (const file of files) for (const target of selectedTargets) {
    if (isVideo(file)) continue
    if (isImage(file) !== ['ico', 'jpg', 'webp', 'png-lossless', 'webp-lossless'].includes(target)) continue
    const blob = isImage(file) ? await convertImage(file, target, options) : await convertFont(file, target)
    const suffix = target === 'png-lossless' ? 'png' : target === 'webp-lossless' ? 'webp' : target
    outputs.push({ blob, filename: `${stem(file.name)}.${suffix}` })
  }
  if (!outputs.length) throw new Error('Нет совместимых сочетаний файлов и форматов')
  // GitHub Pages не может сформировать серверный ZIP: браузер скачивает готовые файлы по очереди.
  outputs.slice(1).forEach(({ blob, filename }, index) => setTimeout(() => downloadBlob(blob, filename), 250 * (index + 1)))
  return { blob: outputs[0].blob, filename: outputs[0].filename, summary: { files: files.length, targets: selectedTargets, outputsOk: outputs.length, outputsFailed: 0, inputBytes: files.reduce((sum, file) => sum + file.size, 0), outputBytes: outputs.reduce((sum, output) => sum + output.blob.size, 0), warnings: [], errors: [] } }
}

function decodeSummary(value) { try { return value ? JSON.parse(decodeURIComponent(escape(atob(value)))) : null } catch { return null } }
function filenameFromDisposition(value) { const match = value && /filename="?([^";]+)"?/.exec(value); return match ? match[1] : null }
export function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
