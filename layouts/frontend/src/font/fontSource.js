// Загрузка пользовательского шрифта: метрики (с бэка), регистрация FontFace для
// превью и сборка встраиваемого @font-face (data-URL) для экспорта SVG/PNG.

import { fetchCyrillicSupport, fetchMetrics } from '../api'
import { RENDER_FONT_FAMILY } from '../layout/schema'

const EXT_INFO = {
  woff2: { mime: 'font/woff2', fmt: 'woff2' },
  woff: { mime: 'font/woff', fmt: 'woff' },
  otf: { mime: 'font/otf', fmt: 'opentype' },
  ttf: { mime: 'font/ttf', fmt: 'truetype' },
  ttc: { mime: 'font/collection', fmt: 'truetype' },
}

function extInfo(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  return EXT_INFO[ext] || EXT_INFO.otf
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

let currentFace = null

export async function loadFont(file) {
  const buffer = await file.arrayBuffer()
  const metrics = await fetchMetrics(file)
  const verifiedCyrillic = await fetchCyrillicSupport(file).catch(() => null)
  if (verifiedCyrillic !== null) metrics.hasCyrillic = verifiedCyrillic

  // Регистрируем шрифт под фиксированным именем — под ним же он рендерится в
  // превью и встраивается в экспорт, поэтому картинка совпадает везде.
  if (currentFace) {
    try { document.fonts.delete(currentFace) } catch { /* игнор */ }
  }
  const face = new FontFace(RENDER_FONT_FAMILY, buffer)
  await face.load()
  document.fonts.add(face)
  currentFace = face

  const { mime, fmt } = extInfo(file.name)
  const fontCss =
    `@font-face{font-family:'${RENDER_FONT_FAMILY}';` +
    `src:url(data:${mime};base64,${toBase64(buffer)}) format('${fmt}');` +
    `font-weight:normal;font-style:normal;}`

  return { metrics, fontCss, fileName: file.name }
}

// Прочитать картинку/лого как data-URL (полностью на клиенте).
export function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Не удалось прочитать изображение'))
    reader.readAsDataURL(file)
  })
}
