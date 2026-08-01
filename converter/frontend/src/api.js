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
  const compression = Math.max(1, +options.compression || 1)
  const ratio = Math.min(1 / compression, limit / bitmap.width, limit / bitmap.height)
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function loadVideo(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video'); const url = URL.createObjectURL(file)
    video.muted = true; video.playsInline = true; video.preload = 'auto'
    video.onloadedmetadata = () => resolve({ video, url }); video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Браузер не смог открыть видео')) }; video.src = url
  })
}
function seekVideo(video, time) { return new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = reject; video.currentTime = Math.min(time, Math.max(0, video.duration - .001)) }) }

async function videoToGif(file, options) {
  const { GIFEncoder, quantize, applyPalette } = await import('./vendor/gifenc.js')
  const { video, url } = await loadVideo(file)
  try {
    const compression = Math.max(1, +options.compression || 1); const fps = 12
    const width = Math.max(1, Math.round(video.videoWidth / compression)); const height = Math.max(1, Math.round(video.videoHeight / compression))
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); const encoder = GIFEncoder()
    const frames = Math.max(1, Math.ceil(video.duration * fps))
    for (let index = 0; index < frames; index += 1) {
      await seekVideo(video, index / fps); ctx.drawImage(video, 0, 0, width, height)
      const rgba = ctx.getImageData(0, 0, width, height); const palette = quantize(rgba.data, 256); const indexed = applyPalette(rgba.data, palette)
      encoder.writeFrame(indexed, width, height, { palette, delay: Math.round(1000 / fps), repeat: 0 })
    }
    encoder.finish(); return new Blob([encoder.bytes()], { type: 'image/gif' })
  } finally { URL.revokeObjectURL(url) }
}

function mediaMime(target) {
  const candidates = target === 'webm-video' ? ['video/webm;codecs=vp9', 'video/webm']
    : target === 'mov' ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4']
      : ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9']
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || ''
}
async function recordCanvas(canvas, drawFrames, target) {
  if (!window.MediaRecorder || !canvas.captureStream) throw new Error('Запись видео не поддерживается этим браузером')
  const mimeType = mediaMime(target); if (!mimeType) throw new Error('Выбранный видеоформат не поддерживается браузером')
  const chunks = []; const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType, videoBitsPerSecond: 8_000_000 })
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
  const done = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = () => reject(recorder.error || new Error('Ошибка записи видео')) })
  recorder.start(); await drawFrames(); recorder.stop(); await done
  return new Blob(chunks, { type: mimeType })
}
async function gifToVideo(file, target, options) {
  if (!window.ImageDecoder) return gifToVideoFallback(file, target, options)
  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: 'image/gif' }); await decoder.tracks.ready
  const track = decoder.tracks.selectedTrack; const compression = Math.max(1, +options.compression || 1)
  const first = await decoder.decode({ frameIndex: 0 }); const width = Math.max(2, Math.round(first.image.displayWidth / compression / 2) * 2); const height = Math.max(2, Math.round(first.image.displayHeight / compression / 2) * 2)
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d')
  first.image.close()
  return recordCanvas(canvas, async () => {
    for (let index = 0; index < track.frameCount; index += 1) {
      const { image } = await decoder.decode({ frameIndex: index }); ctx.drawImage(image, 0, 0, width, height); const duration = Math.max(20, (image.duration || 100000) / 1000); image.close(); await wait(duration)
    }
  }, target)
}
function gifDuration(buffer) {
  const bytes = new Uint8Array(buffer); const view = new DataView(buffer); let offset = 13; let duration = 0
  if (bytes[10] & 0x80) offset += 3 * (2 ** ((bytes[10] & 7) + 1))
  const skipBlocks = () => { while (offset < bytes.length) { const size = bytes[offset++]; if (!size) break; offset += size } }
  while (offset < bytes.length) {
    const marker = bytes[offset++]
    if (marker === 0x3b) break
    if (marker === 0x21) {
      const label = bytes[offset++]
      if (label === 0xf9 && bytes[offset] === 4) { duration += Math.max(2, view.getUint16(offset + 2, true)) * 10; offset += 6 } else skipBlocks()
    } else if (marker === 0x2c) {
      const packed = bytes[offset + 8]; offset += 9
      if (packed & 0x80) offset += 3 * (2 ** ((packed & 7) + 1))
      offset += 1; skipBlocks()
    } else break
  }
  return Math.max(1000, duration || 3000)
}
async function gifToVideoFallback(file, target, options) {
  const buffer = await file.arrayBuffer(); const duration = gifDuration(buffer); const url = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => { const value = new Image(); value.onload = () => resolve(value); value.onerror = reject; value.src = url })
    const compression = Math.max(1, +options.compression || 1); const width = Math.max(2, Math.round(image.naturalWidth / compression / 2) * 2); const height = Math.max(2, Math.round(image.naturalHeight / compression / 2) * 2)
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d')
    return await recordCanvas(canvas, async () => { const started = performance.now(); while (performance.now() - started < duration) { ctx.drawImage(image, 0, 0, width, height); await new Promise(requestAnimationFrame) } }, target)
  } finally { URL.revokeObjectURL(url) }
}
async function videoToVideo(file, target, options) {
  const { video, url } = await loadVideo(file)
  try {
    const compression = Math.max(1, +options.compression || 1); const width = Math.max(2, Math.round(video.videoWidth / compression / 2) * 2); const height = Math.max(2, Math.round(video.videoHeight / compression / 2) * 2)
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d')
    return await recordCanvas(canvas, async () => {
      await video.play(); await new Promise((resolve) => { const draw = () => { ctx.drawImage(video, 0, 0, width, height); if (video.ended) resolve(); else requestAnimationFrame(draw) }; draw() })
    }, target)
  } finally { URL.revokeObjectURL(url) }
}
async function convertMedia(file, target, options) {
  const sourceGif = ext(file.name) === 'gif' || file.type === 'image/gif'
  if (target === 'gif-video') return sourceGif && (+options.compression || 1) === 1 ? file : videoToGif(file, options)
  return sourceGif ? gifToVideo(file, target, options) : videoToVideo(file, target, options)
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
    const mediaTarget = ['mp4', 'mov', 'webm-video', 'gif-video'].includes(target)
    if (isVideo(file) !== mediaTarget && !(isImage(file) && !mediaTarget)) continue
    if (isImage(file) && !['ico', 'jpg', 'webp', 'png-lossless'].includes(target)) continue
    const blob = isVideo(file) ? await convertMedia(file, target, options) : isImage(file) ? await convertImage(file, target, options) : await convertFont(file, target)
    const suffix = target === 'png-lossless' ? 'png' : target === 'webm-video' ? 'webm' : target === 'gif-video' ? 'gif' : target
    outputs.push({ blob, filename: `${stem(file.name)}.${suffix}` })
  }
  if (!outputs.length) throw new Error('Нет совместимых сочетаний файлов и форматов')
  const packaged = outputs.length > 1 ? await createZip(outputs) : outputs[0]
  return { blob: packaged.blob, filename: packaged.filename, summary: { files: files.length, targets: selectedTargets, outputsOk: outputs.length, outputsFailed: 0, inputBytes: files.reduce((sum, file) => sum + file.size, 0), outputBytes: outputs.reduce((sum, output) => sum + output.blob.size, 0), warnings: [], errors: [] } }
}

async function createZip(outputs) {
  const encoder = new TextEncoder(); const local = []; const central = []; let offset = 0
  for (const output of outputs) {
    const name = encoder.encode(output.filename); const data = new Uint8Array(await output.blob.arrayBuffer()); const crc = crc32(data)
    const localHeader = new Uint8Array(30 + name.length); const lv = new DataView(localHeader.buffer)
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true)
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true); localHeader.set(name, 30)
    const centralHeader = new Uint8Array(46 + name.length); const cv = new DataView(centralHeader.buffer)
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true)
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); centralHeader.set(name, 46)
    local.push(localHeader, data); central.push(centralHeader); offset += localHeader.length + data.length
  }
  const centralSize = central.reduce((sum, value) => sum + value.length, 0); const end = new Uint8Array(22); const view = new DataView(end.buffer)
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, outputs.length, true); view.setUint16(10, outputs.length, true); view.setUint32(12, centralSize, true); view.setUint32(16, offset, true)
  return { blob: new Blob([...local, ...central, end], { type: 'application/zip' }), filename: 'converted-files.zip' }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc32(bytes) { let value = 0xffffffff; for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0 }

function decodeSummary(value) { try { return value ? JSON.parse(decodeURIComponent(escape(atob(value)))) : null } catch { return null } }
function filenameFromDisposition(value) { const match = value && /filename="?([^";]+)"?/.exec(value); return match ? match[1] : null }
export function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
