import React, { useMemo, useRef } from 'react'
import { specToDrawOps } from '../render/svg'
import { makeMeasurer } from '../render/textLayout'
import { RENDER_FONT_FAMILY } from '../layout/schema'

// Интерактивное превью макета: рисует примитивы из specToDrawOps (тот же расчёт,
// что и экспорт) и накладывает слой хит-зон для выделения и перетаскивания.
export default function Preview({
  spec, fontReady, selectedId, onSelect, onMoveFrame,
  onExportPng, onExportSvg, exporting,
}) {
  const svgRef = useRef(null)
  const drag = useRef(null)

  const measurer = useMemo(() => makeMeasurer(RENDER_FONT_FAMILY), [fontReady])
  const draw = useMemo(
    () => (spec ? specToDrawOps(spec, measurer, { placeholders: true }) : null),
    [spec, measurer],
  )

  if (!spec || !draw) return null
  const W = draw.width
  const H = draw.height
  const selFrame = spec.frames.find((f) => f.id === selectedId)

  function startDrag(e, frame) {
    e.stopPropagation()
    onSelect(frame.id)
    const rect = svgRef.current.getBoundingClientRect()
    drag.current = {
      id: frame.id, startX: e.clientX, startY: e.clientY,
      box: { ...frame.box }, rectW: rect.width, rectH: rect.height,
    }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', endDrag)
  }

  function onDragMove(e) {
    const d = drag.current
    if (!d) return
    let nx = d.box.x + (e.clientX - d.startX) / d.rectW
    let ny = d.box.y + (e.clientY - d.startY) / d.rectH
    if (!e.shiftKey) {
      nx = Math.round(nx * 100) / 100 // привязка к сетке 1% (Shift — свободно)
      ny = Math.round(ny * 100) / 100
    }
    nx = Math.max(0, Math.min(1 - d.box.w, nx))
    ny = Math.max(0, Math.min(1 - d.box.h, ny))
    onMoveFrame(d.id, { x: +nx.toFixed(4), y: +ny.toFixed(4) })
  }

  function endDrag() {
    drag.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', endDrag)
  }

  return (
    <div className="preview">
      <div className="preview-head">
        <span className="preview-dims">{W}×{H} px · {spec.canvas.dpi} dpi</span>
        <div className="preview-actions">
          <button className="btn-ghost" onClick={onExportSvg} disabled={exporting}>Скачать SVG</button>
          <button className="btn-primary" onClick={onExportPng} disabled={exporting}>
            {exporting ? 'Готовлю…' : 'Скачать PNG'}
          </button>
        </div>
      </div>

      <div className="preview-stage">
        <svg
          ref={svgRef}
          className="preview-svg"
          viewBox={`0 0 ${W} ${H}`}
          style={{ aspectRatio: `${W} / ${H}` }}
          onPointerDown={() => onSelect(null)}
        >
          {draw.ops.map((op, i) => renderOp(op, i))}

          {spec.frames.filter((f) => !f.hidden).map((f) => (
            <rect
              key={`hit-${f.id}`}
              x={f.box.x * W} y={f.box.y * H} width={f.box.w * W} height={f.box.h * H}
              fill="transparent" pointerEvents="all" style={{ cursor: 'move' }}
              onPointerDown={(e) => startDrag(e, f)}
            />
          ))}

          {selFrame && !selFrame.hidden && (
            <rect
              className="frame-sel" pointerEvents="none" fill="none"
              x={selFrame.box.x * W} y={selFrame.box.y * H}
              width={selFrame.box.w * W} height={selFrame.box.h * H}
            />
          )}
        </svg>
      </div>

      <p className="preview-hint">
        Клик — выбрать блок · перетаскивай — двигать (Shift — без привязки к сетке)
      </p>
    </div>
  )
}

function renderOp(op, i) {
  if (op.kind === 'bg') {
    return <rect key={i} x="0" y="0" width={op.w} height={op.h} fill={op.color} />
  }
  if (op.kind === 'image') {
    const par = op.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'
    return (
      <image key={i} x={op.x} y={op.y} width={op.w} height={op.h}
        href={op.href} preserveAspectRatio={par} />
    )
  }
  if (op.kind === 'placeholder') {
    const ls = Math.max(14, Math.min(op.w, op.h) * 0.14)
    return (
      <g key={i} pointerEvents="none">
        <rect x={op.x} y={op.y} width={op.w} height={op.h} className="frame-ph" />
        <text x={op.x + op.w / 2} y={op.y + op.h / 2} className="frame-ph-label"
          fontSize={ls} textAnchor="middle" dominantBaseline="middle">{op.label}</text>
      </g>
    )
  }
  if (op.kind === 'text') {
    return (
      <text key={i} fontFamily={`'${RENDER_FONT_FAMILY}'`} fontSize={op.fontSize}
        fill={op.fill} textAnchor={op.anchor} letterSpacing={op.letterSpacing}
        pointerEvents="none">
        {op.lines.map((l, j) => <tspan key={j} x={l.x} y={l.y}>{l.text}</tspan>)}
      </text>
    )
  }
  return null
}
