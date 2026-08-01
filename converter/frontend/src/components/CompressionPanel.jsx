import React from 'react'
import { formatBytes } from '../fontMeta.js'

export default function CompressionPanel({ items, options, result }) {
  const compressible = items.filter((item) => ['image', 'media'].includes(item.report?.kind))
  if (!compressible.length) return null
  const original = compressible.reduce((sum, item) => sum + item.file.size, 0)
  const first = compressible[0]?.report
  const dimensions = first?.image || first?.media || {}
  const outputTotal = result?.summary?.outputBytes
  const outputCount = result?.summary?.outputsOk || 0
  const output = outputTotal && outputCount ? outputTotal / outputCount : null
  const originalComparable = original / compressible.length
  const saved = output && originalComparable > output ? Math.round((1 - output / originalComparable) * 100) : null
  const outputDimensions = dimensions.width && dimensions.height
    ? `${Math.max(1, Math.round(dimensions.width / options.compression))} × ${Math.max(1, Math.round(dimensions.height / options.compression))}` : '—'
  return <section className="compression-panel">
    <div className="compression-head"><div><h3>Сжатие и размер</h3><p>Пропорции сохраняются автоматически</p></div><span className="compression-kind">{first?.kind === 'media' ? 'Видео / GIF' : 'Изображение'}</span></div>
    <div className="compression-stats">
      <div><span>Исходный вес</span><strong>{formatBytes(originalComparable)}</strong>{compressible.length > 1 && <small>в среднем на файл</small>}</div>
      <div><span>Итоговый вес</span><strong>{output ? formatBytes(output) : 'после экспорта'}</strong>{saved != null && <small>−{saved}% · в {(originalComparable / output).toFixed(1)}× меньше</small>}</div>
      <div><span>Разрешение после</span><strong>{outputDimensions}</strong></div>
    </div>
  </section>
}
