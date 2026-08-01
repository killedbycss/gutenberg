import React, { useEffect, useState } from 'react'
import Coverage from './Coverage.jsx'
import { weightLabel, widthLabel, formatBytes, OUTLINE_LABEL } from '../fontMeta.js'

// Карточка одного шрифта: формат, метаданные, метрики, лицензия, покрытие.
export default function FontCard({ report, file, onRemove }) {
  const { filename, size, ok, error, source, metadata, metrics, coverage, image, media, kind } = report

  return (
    <div className="card font-card">
      <div className="card-top">
        <div className="file-id">
          {source && <span className={`fmt-badge fmt-${source.key}`}>{source.label}</span>}
          <div className="file-name">
            <strong title={filename}>{filename}</strong>
            <span className="muted">
              {formatBytes(size)}
              {kind === 'image' && image
                ? ` · ${image.width}×${image.height} px · ${image.mode}`
                : kind === 'media' && media ? ` · ${media.width || '—'}×${media.height || '—'} · ${media.duration ? media.duration.toFixed(1) + ' с' : 'медиа'}`
                : source && ` · ${OUTLINE_LABEL[source.outline] || source.outline}`}
            </span>
          </div>
        </div>
        <button className="icon-btn" onClick={onRemove} title="Убрать">✕</button>
      </div>
      <FilePreview file={file} kind={kind} />

      {!ok ? (
        <div className="error-box">{error || 'Не удалось прочитать шрифт'}</div>
      ) : (
        <>
          {kind === 'media' ? <div className="metrics-grid"><div className="tile"><div className="tile-label">Размер</div><div className="tile-value">{media?.width || '—'}×{media?.height || '—'}</div></div><div className="tile"><div className="tile-label">Длительность</div><div className="tile-value">{media?.duration ? `${media.duration.toFixed(1)} с` : '—'}</div></div></div> : kind === 'image' ? (
            <div className="metrics-grid">
              <div className="tile"><div className="tile-label">Ширина</div><div className="tile-value">{image.width} px</div></div>
              <div className="tile"><div className="tile-label">Высота</div><div className="tile-value">{image.height} px</div></div>
              <div className="tile"><div className="tile-label">Цвет</div><div className="tile-value">{image.mode}</div></div>
              <div className="tile"><div className="tile-label">Кадров</div><div className="tile-value">{image.frames}</div></div>
            </div>
          ) : <>
            <Meta metadata={metadata} />
            <Metrics metrics={metrics} />
            <License metadata={metadata} />
            <Coverage coverage={coverage} />
          </>}
        </>
      )}
    </div>
  )
}

function FilePreview({ file, kind }) {
  const [url, setUrl] = useState('')
  const [family, setFamily] = useState('')
  useEffect(() => {
    if (!file) return undefined
    const next = URL.createObjectURL(file); setUrl(next)
    if (kind === 'font') {
      const name = `Preview-${Math.random().toString(36).slice(2)}`
      const face = new FontFace(name, `url(${next})`)
      face.load().then((loaded) => { document.fonts.add(loaded); setFamily(name) }).catch(() => {})
    }
    return () => URL.revokeObjectURL(next)
  }, [file, kind])
  if (!url) return null
  const type = file?.type || ''
  if (kind === 'font') return <div className="file-preview font-preview" style={{ fontFamily: family || 'var(--font)' }}>Aa Бб Вв 0123<br/><small>Съешь ещё этих мягких французских булок</small></div>
  if (type.startsWith('video/') || /\.(mov|mp4|webm|m4v)$/i.test(file.name)) return <video className="file-preview media-preview" src={url} controls muted playsInline />
  return <img className="file-preview media-preview" src={url} alt={`Предпросмотр ${file.name}`} />
}

function Meta({ metadata }) {
  if (!metadata) return null
  const title = metadata.family || metadata.fullName
  return (
    <div className="meta">
      {title && <div className="meta-family">{title}</div>}
      <div className="meta-line">
        {metadata.subfamily && <span>{metadata.subfamily}</span>}
        {metadata.version && <span className="muted">{metadata.version}</span>}
        {metadata.designer && <span className="muted">© {metadata.designer}</span>}
      </div>
    </div>
  )
}

function Metrics({ metrics }) {
  if (!metrics) return null
  const v = metrics.vertical || {}
  const style = metrics.styleFlags
  const styleText = style
    ? [style.bold && 'Bold', style.italic && 'Italic'].filter(Boolean).join(' ') ||
      'Прямое'
    : null

  const tiles = [
    ['Глифов', metrics.glyphCount],
    ['Символов (cmap)', metrics.encodedCount],
    ['UPM', metrics.unitsPerEm],
    ['Насыщенность', weightLabel(metrics.weightClass)],
    ['Ширина', widthLabel(metrics.widthClass)],
    ['Начертание', styleText],
    ['Восходящая', v.ascent],
    ['Нисходящая', v.descent],
    ['Интерлиньяж', v.lineGap],
    ['Высота прописных', v.capHeight],
    ['Высота строчных', v.xHeight],
    ['Наклон', metrics.italicAngle ? `${metrics.italicAngle}°` : null],
  ].filter(([, value]) => value != null && value !== '')

  return (
    <div className="metrics-grid">
      {tiles.map(([label, value]) => (
        <div className="tile" key={label}>
          <div className="tile-label">{label}</div>
          <div className="tile-value">{value}</div>
        </div>
      ))}
    </div>
  )
}

function License({ metadata }) {
  const fsType = metadata?.fsType
  const desc = metadata?.licenseDescription
  const url = metadata?.licenseURL
  if (!fsType && !desc && !url) return null
  return (
    <div className={`license${fsType?.restricted ? ' restricted' : ''}`}>
      <div className="license-head">
        <span className="license-title">Лицензия / встраивание</span>
        {fsType && (
          <span className={`pill ${fsType.restricted ? 'pill-danger' : 'pill-ok'}`}>
            {fsType.restricted ? 'Ограничено' : 'Без ограничений'}
          </span>
        )}
      </div>
      {fsType?.labels?.map((l, i) => (
        <div className="license-line" key={i}>{l}</div>
      ))}
      {desc && <div className="license-desc">{truncate(desc, 200)}</div>}
      {url && (
        <a className="license-url" href={url} target="_blank" rel="noreferrer">
          {url}
        </a>
      )}
    </div>
  )
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s
}
