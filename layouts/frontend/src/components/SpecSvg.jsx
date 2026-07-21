import React, { useMemo } from 'react'
import { specToDrawOps } from '../render/svg'
import { RENDER_FONT_FAMILY } from '../layout/schema'

// Статический (не интерактивный) рендер LayoutSpec в SVG. Тот же расчёт, что и
// в превью/экспорте (specToDrawOps). Используется в плитках бенто.
export default function SpecSvg({ spec, measurer, placeholders = false, className, style, preserveAspectRatio = 'xMidYMid meet', textAnimation = '' }) {
  const draw = useMemo(
    () => (spec ? specToDrawOps(spec, measurer, { placeholders }) : null),
    [spec, measurer, placeholders],
  )
  if (!draw) return null
  const W = draw.width
  const H = draw.height
  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      style={{ aspectRatio: `${W} / ${H}`, display: 'block', ...style }}
      preserveAspectRatio={preserveAspectRatio}
    >
      {draw.ops.map((op, i) => renderOp(op, i, textAnimation))}
    </svg>
  )
}

function renderOp(op, i, textAnimation) {
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
  if (op.kind === 'text') {
    return (
      <text key={i} className={textAnimation ? `bento-text text-${textAnimation}` : undefined}
        style={{ animationDelay: `${i * 90}ms` }} fontFamily={`'${RENDER_FONT_FAMILY}'`} fontSize={op.fontSize}
        fill={op.fill} textAnchor={op.anchor} letterSpacing={op.letterSpacing}>
        {op.lines.map((l, j) => <tspan key={j} x={l.x} y={l.y}>{l.text}</tspan>)}
      </text>
    )
  }
  return null
}
