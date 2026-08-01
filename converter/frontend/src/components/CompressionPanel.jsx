import React from 'react'
import { formatBytes } from '../fontMeta.js'

export default function CompressionPanel({ items, options, result }) {
  const compressible = items.filter((item) => ['image', 'media'].includes(item.report?.kind))
  if (!compressible.length) return null
  const original = compressible.reduce((sum, item) => sum + item.file.size, 0)
  const first = compressible[0]?.report
  const dimensions = first?.image || first?.media || {}
  const output = result?.summary?.outputBytes
  const saved = output && original > output ? Math.round((1 - output / original) * 100) : null
  const outputDimensions = dimensions.width && dimensions.height
    ? `${Math.max(1, Math.round(dimensions.width / options.compression))} × ${Math.max(1, Math.round(dimensions.height / options.compression))}` : '—'
  return <section className="compression-panel">
    <div className="compression-head"><div><h3>Сжатие и размер</h3><p>Пропорции сохраняются автоматически</p></div><span className="compression-kind">{first?.kind === 'media' ? 'Видео / GIF' : 'Изображение'}</span></div>
    <div className="compression-stats">
      <div><span>Исходный вес</span><strong>{formatBytes(original)}</strong></div>
      <div><span>Итоговый вес</span><strong>{output ? formatBytes(output) : 'после экспорта'}</strong>{saved != null && <small>−{saved}% · в {(original / output).toFixed(1)}× меньше</small>}</div>
      <div><span>Разрешение после</span><strong>{outputDimensions}</strong></div>
    </div>
  </section>
}
