import React from 'react'
import { formatBytes } from '../fontMeta.js'

export default function CompressionPanel({ items, options, onChange, result }) {
  const compressible = items.filter((item) => ['image', 'media'].includes(item.report?.kind))
  if (!compressible.length) return null
  const original = compressible.reduce((sum, item) => sum + item.file.size, 0)
  const first = compressible[0]?.report
  const dimensions = first?.image || first?.media || {}
  const output = result?.summary?.outputBytes
  return <section className="compression-panel">
    <div className="compression-head"><div><h3>Сжатие и размер</h3><p>Пропорции сохраняются автоматически</p></div><span className="compression-kind">{first?.kind === 'media' ? 'Видео / GIF' : 'Изображение'}</span></div>
    <div className="compression-stats">
      <div><span>Исходный вес</span><strong>{formatBytes(original)}</strong></div>
      <div><span>Итоговый вес</span><strong>{output ? formatBytes(output) : 'после экспорта'}</strong></div>
      <div><span>Разрешение</span><strong>{dimensions.width || '—'} × {dimensions.height || '—'}</strong></div>
    </div>
    <div className="compression-controls">
      <label><span>Ширина, px</span><input type="number" min="1" max="8192" placeholder={dimensions.width || 'авто'} value={options.width} onChange={(e) => onChange({ width: e.target.value })} /></label>
      <label><span>Высота, px</span><input type="number" min="1" max="8192" placeholder={dimensions.height || 'авто'} value={options.height} onChange={(e) => onChange({ height: e.target.value })} /></label>
      <label className="quality-control"><span>Качество · {options.quality}%</span><input type="range" min="20" max="100" value={options.quality} onChange={(e) => onChange({ quality: +e.target.value })} /></label>
    </div>
  </section>
}
