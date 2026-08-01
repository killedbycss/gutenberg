import React, { useMemo, useRef, useState } from 'react'
import SpecSvg from './SpecSvg'
import { makeMeasurer } from '../render/textLayout'
import { RENDER_FONT_FAMILY } from '../layout/schema'
import { GIFEncoder, quantize, applyPalette } from 'gifenc'

export default function Bento({ items, fontReady, seed, onShuffle, onPick, animation = 'mixed', animationCss = '', speed = 1, distance = 18, stagger = 90, easing = 'smooth', easingCss = '', showWcag = true, colorVision = 'normal', fontCss = '' }) {
  const measurer = useMemo(() => makeMeasurer(RENDER_FONT_FAMILY), [fontReady])
  const gridRef = useRef(null)
  const [exporting, setExporting] = useState(false)

  async function renderComposition(phase = null) {
    const grid = gridRef.current
    if (!grid) return null
      const box = grid.getBoundingClientRect(); const scale = 2
      const canvas = document.createElement('canvas'); canvas.width = Math.round(box.width * scale); canvas.height = Math.round(box.height * scale)
      const ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, box.width, box.height)
      for (const tile of grid.querySelectorAll('.bento-tile')) {
        const svg = tile.querySelector('svg'); if (!svg) continue
        const rect = tile.getBoundingClientRect(); const copy = svg.cloneNode(true)
        copy.setAttribute('width', String(rect.width)); copy.setAttribute('height', String(rect.height)); copy.setAttribute('preserveAspectRatio', 'xMidYMid slice')
        if (phase != null) copy.querySelectorAll('.bento-text').forEach((text, index) => applyTextFrame(text, (phase + index * Math.max(.025, stagger / 4000)) % 1, animationCss))
        if (fontCss) { const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); const style = document.createElementNS('http://www.w3.org/2000/svg', 'style'); style.textContent = fontCss; defs.appendChild(style); copy.prepend(defs) }
        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }))
        const image = await new Promise((resolve, reject) => { const value = new Image(); value.onload = () => resolve(value); value.onerror = reject; value.src = url })
        ctx.drawImage(image, rect.left - box.left, rect.top - box.top, rect.width, rect.height); URL.revokeObjectURL(url)
      }
      return canvas
  }

  async function exportPng() {
    setExporting(true)
    try {
      const canvas = await renderComposition(); if (!canvas) return
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png')); const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = 'gutenberg-bento.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally { setExporting(false) }
  }

  async function exportGif() {
    setExporting(true)
    try {
      const first = await renderComposition(0); if (!first) return
      const width = Math.min(640, first.width); const height = Math.round(first.height * width / first.width)
      const frame = document.createElement('canvas'); frame.width = width; frame.height = height
      const ctx = frame.getContext('2d'); const encoder = GIFEncoder()
      for (let i = 0; i < 16; i += 1) {
        const source = i === 0 ? first : await renderComposition(i / 16)
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height)
        ctx.drawImage(source, 0, 0, width, height)
        const rgba = ctx.getImageData(0, 0, width, height); const palette = quantize(rgba.data, 256); const indexed = applyPalette(rgba.data, palette)
        encoder.writeFrame(indexed, width, height, { palette, delay: 100, repeat: 0 })
      }
      encoder.finish(); const blob = new Blob([encoder.bytes()], { type: 'image/gif' }); const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = 'gutenberg-bento.gif'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally { setExporting(false) }
  }


  return (
    <div className={`bento vision-${colorVision}`}>
      <div className="bento-head">
        <div>
          <h2 className="bento-title">Бенто-раскладки</h2>
          <p className="bento-sub">
            Одна сетка из разных форматов и текстов. «Перемешать» создаёт новую
            композицию. Клик по фрагменту — открыть его в редакторе.
          </p>
        </div>
        <div className="bento-actions"><button className="btn-ghost" onClick={exportPng} disabled={exporting}>PNG</button><button className="btn-ghost" onClick={exportGif} disabled={exporting}>{exporting ? 'Готовлю…' : 'GIF'}</button><button className="btn-primary" onClick={onShuffle}>↻ Перемешать</button></div>
      </div>

      {/* key={seed} перезапускает анимацию «переключения» при каждом перемешивании */}
      <div className={`bento-grid ease-${easing}`} key={seed} ref={gridRef} style={{ '--bento-speed': speed, '--bento-distance': `${distance}px`, ...(easingCss ? { '--bento-ease': easingCss } : {}) }}>
        {items.map((it, i) => (
          <button
            key={i}
            className={`bento-tile switch-${i % 2 ? 'a' : 'b'}`}
            style={{
              gridColumn: `${it.col} / span ${it.cols}`,
              gridRow: `${it.row} / span ${it.rows}`,
              animationDelay: `${i * 55}ms`,
              background: it.spec.canvas.background.color,
            }}
            onClick={() => onPick(it)}
            title="Открыть в редакторе"
          >
            {showWcag && <span className="contrast-badge">WCAG {it.palette.wcag} · {it.palette.contrast}:1</span>}
            <SpecSvg
              spec={it.spec}
              measurer={measurer}
              className="bento-svg"
              preserveAspectRatio="xMidYMid slice"
              viewBoxOverride={it.viewBox}
              style={{ width: '100%', height: '100%', aspectRatio: 'auto' }}
              textAnimation={animation === 'mixed' ? it.textAnimation : animation}
              animationCss={animationCss}
              stagger={stagger}
              showDeviceChrome={false}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

function applyTextFrame(node, phase, customCss = '') {
  const customName = customCss.trim().split(/\s+/)[0]?.replace(/^text/, '').toLowerCase()
  const kind = customCss ? customName : ([...node.classList].find((name) => name.startsWith('text-'))?.slice(5) || 'float')
  const angle = phase * Math.PI * 2
  const wave = Math.sin(angle)
  const transforms = {
    float: `translate(0 ${wave * 14}px)`, reveal: `translate(0 ${(1 - phase) * 22}px)`, drift: `translate(${wave * 18}px 0)`,
    pulse: `scale(${1 + wave * .04})`, rotate: `rotate(${wave * 4}deg)`, blur: `scale(${1 + wave * .025})`, wave: `translate(${wave * 12}px ${Math.cos(angle) * 8}px) skewX(${wave * 3}deg)`,
  }
  node.style.animation = 'none'; node.style.transform = transforms[kind] || transforms.float
  node.style.opacity = kind === 'reveal' ? String(Math.min(1, phase * 3)) : '1'
  node.style.filter = kind === 'blur' ? `blur(${Math.abs(wave) * 3}px)` : 'none'
}
