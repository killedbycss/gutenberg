import React, { useMemo, useRef, useState } from 'react'
import SpecSvg from './SpecSvg'
import { makeMeasurer } from '../render/textLayout'
import { RENDER_FONT_FAMILY } from '../layout/schema'
import { GIFEncoder, quantize, applyPalette } from 'gifenc'

export default function Bento({ items, fontReady, seed, onShuffle, onPick, animation = 'mixed', animationCss = '', speed = 1, distance = 18, stagger = 90, easing = 'smooth', easingCss = '', showWcag = true, colorVision = 'normal', fontCss = '' }) {
  const measurer = useMemo(() => makeMeasurer(RENDER_FONT_FAMILY), [fontReady])
  const gridRef = useRef(null)
  const [exporting, setExporting] = useState(false)

  async function renderComposition(sampleTime = null) {
    const grid = gridRef.current
    if (!grid) return null
      const box = grid.getBoundingClientRect(); const scale = 2
      const canvas = document.createElement('canvas'); canvas.width = Math.round(box.width * scale); canvas.height = Math.round(box.height * scale)
      const ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fff'; ctx.fillRect(0, 0, box.width, box.height)
      ctx.filter = sampleTime == null ? 'none' : getComputedStyle(grid).filter
      const tiles = [...grid.querySelectorAll('.bento-tile')]
      for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
        const tile = tiles[tileIndex]
        const svg = tile.querySelector('svg'); if (!svg) continue
        const rect = { left: box.left + tile.offsetLeft, top: box.top + tile.offsetTop, width: tile.offsetWidth, height: tile.offsetHeight }; const copy = svg.cloneNode(true)
        copy.setAttribute('width', String(rect.width)); copy.setAttribute('height', String(rect.height)); copy.setAttribute('preserveAspectRatio', 'xMidYMid slice')
        if (sampleTime != null) {
          const liveText = [...svg.querySelectorAll('.bento-text')]
          copy.querySelectorAll('.bento-text').forEach((text, index) => {
            const computed = getComputedStyle(liveText[index])
            const matrix = computed.transform && computed.transform !== 'none' ? new DOMMatrix(computed.transform) : null
            const viewBox = svg.viewBox.baseVal
            const scaleX = viewBox.width / rect.width; const scaleY = viewBox.height / rect.height
            text.style.animation = 'none'
            text.style.transform = matrix ? `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e * scaleX} ${matrix.f * scaleY})` : 'none'
            text.style.transformBox = 'fill-box'; text.style.transformOrigin = 'center'
            text.style.opacity = computed.opacity; text.style.filter = computed.filter
          })
        }
        if (fontCss) { const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); const style = document.createElementNS('http://www.w3.org/2000/svg', 'style'); style.textContent = fontCss; defs.appendChild(style); copy.prepend(defs) }
        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }))
        const image = await new Promise((resolve, reject) => { const value = new Image(); value.onload = () => resolve(value); value.onerror = reject; value.src = url })
        const computed = sampleTime == null ? null : getComputedStyle(tile)
        ctx.save(); ctx.globalAlpha = computed ? Number(computed.opacity) || 0 : 1
        if (computed) applyInsetClip(ctx, computed.clipPath, rect.left - box.left, rect.top - box.top, rect.width, rect.height)
        if (computed) applyTileTransform(ctx, computed.transform, rect.left - box.left, rect.top - box.top, rect.width, rect.height)
        ctx.drawImage(image, rect.left - box.left, rect.top - box.top, rect.width, rect.height); ctx.restore(); URL.revokeObjectURL(url)
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
    const animations = gridRef.current ? gridRef.current.getAnimations({ subtree: true }) : []
    const states = animations.map((item) => ({ item, currentTime: item.currentTime, playState: item.playState }))
    try {
      animations.forEach((item) => item.pause())
      const durations = animations.map((item) => Number(item.effect?.getTiming().duration) || 0).filter(Number.isFinite)
      const duration = Math.max(3200, Math.min(12000, durations.length ? Math.max(...durations) : 9200))
      animations.forEach((item) => { item.currentTime = 0 })
      const first = await renderComposition(0); if (!first) return
      const width = first.width; const height = first.height
      const frame = document.createElement('canvas'); frame.width = width; frame.height = height
      const ctx = frame.getContext('2d'); const encoder = GIFEncoder()
      const frames = Math.max(60, Math.min(120, Math.round(duration / 90)))
      const delay = Math.round(duration / frames)
      for (let i = 0; i < frames; i += 1) {
        const time = i * duration / frames
        animations.forEach((item) => { item.currentTime = time })
        const source = i === 0 ? first : await renderComposition(time)
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fff'; ctx.fillRect(0, 0, width, height)
        ctx.drawImage(source, 0, 0, width, height)
        const rgba = ctx.getImageData(0, 0, width, height); const palette = quantize(rgba.data, 256); const indexed = applyPalette(rgba.data, palette)
        encoder.writeFrame(indexed, width, height, { palette, delay, repeat: 0 })
      }
      encoder.finish(); const blob = new Blob([encoder.bytes()], { type: 'image/gif' }); const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = 'gutenberg-bento.gif'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally {
      states.forEach(({ item, currentTime, playState }) => { item.currentTime = currentTime; if (playState === 'running') item.play() })
      setExporting(false)
    }
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

function applyTileTransform(ctx, transform, x, y, width, height) {
  if (!transform || transform === 'none') return
  const matrix = new DOMMatrix(transform)
  ctx.translate(x + width / 2, y + height / 2)
  ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
  ctx.translate(-(x + width / 2), -(y + height / 2))
}

function applyInsetClip(ctx, clipPath, x, y, width, height) {
  if (!clipPath || clipPath === 'none') return
  const tokens = clipPath.match(/inset\(([^)]+)/)?.[1]?.trim().split(/\s+/).slice(0, 4) || []
  if (!tokens.length) return
  const expanded = tokens.length === 1 ? [tokens[0], tokens[0], tokens[0], tokens[0]]
    : tokens.length === 2 ? [tokens[0], tokens[1], tokens[0], tokens[1]]
      : tokens.length === 3 ? [tokens[0], tokens[1], tokens[2], tokens[1]] : tokens
  const amount = (value, size) => value.endsWith('%') ? parseFloat(value) * size / 100 : parseFloat(value) || 0
  const top = amount(expanded[0], height); const right = amount(expanded[1], width)
  const bottom = amount(expanded[2], height); const left = amount(expanded[3], width)
  ctx.beginPath(); ctx.rect(x + left, y + top, Math.max(0, width - left - right), Math.max(0, height - top - bottom)); ctx.clip()
}
