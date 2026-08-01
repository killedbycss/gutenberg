import React, { useRef, useState } from 'react'

const ACCEPT = '.otf,.ttf,.woff,.woff2,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.mov,.mp4,.webm,.m4v'
const EXT_RE = /\.(otf|ttf|woff2?|png|jpe?g|webp|gif|bmp|tiff?|mov|mp4|webm|m4v)$/i

// Приём файлов: drag & drop + выбор через диалог. Поддерживает несколько файлов.
export default function Dropzone({ onFiles, disabled }) {
  const inputRef = useRef(null)
  const [over, setOver] = useState(false)

  function pick(list) {
    const files = Array.from(list || []).filter((f) => EXT_RE.test(f.name))
    if (files.length) onFiles(files)
  }

  function onDrop(e) {
    e.preventDefault()
    setOver(false)
    if (disabled) return
    pick(e.dataTransfer.files)
  }

  return (
    <div
      className={`dropzone${over ? ' over' : ''}${disabled ? ' disabled' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click()
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="dropzone-icon">⤓</div>
      <div className="dropzone-title">Перетащите шрифты, изображения или видео сюда</div>
      <div className="dropzone-hint">
        OTF, TTF, WOFF, WOFF2 · PNG, JPG, WebP, GIF · MOV, MP4, WebM
      </div>
    </div>
  )
}
