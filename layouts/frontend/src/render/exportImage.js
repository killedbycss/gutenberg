// Экспорт готового макета: скачивание PNG и самодостаточного SVG.
// Серверного шеринга в v1 нет — но LayoutSpec сериализуем, так что «ссылку»
// можно добавить позже, не трогая рендер.

import { buildSvgString, svgToPngBlob } from './svg'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function baseName(spec) {
  const title = (spec.meta?.title || 'layout').trim().slice(0, 40) || 'layout'
  return `${spec.meta?.purpose || 'layout'}-${title}`.replace(/[\\/:*?"<>|\s]+/g, '-')
}

export function exportSvg(spec, measurer, fontCss) {
  const svg = buildSvgString(spec, measurer, { fontCss })
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${baseName(spec)}.svg`)
}

export async function exportPng(spec, measurer, fontCss, scale = 1) {
  const svg = buildSvgString(spec, measurer, { fontCss })
  const blob = await svgToPngBlob(svg, spec.canvas.width, spec.canvas.height, scale)
  if (blob) downloadBlob(blob, `${baseName(spec)}.png`)
}
