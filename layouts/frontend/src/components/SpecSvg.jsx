import React, { useMemo } from 'react'
import { specToDrawOps } from '../render/svg'
import { RENDER_FONT_FAMILY } from '../layout/schema'

// Статический (не интерактивный) рендер LayoutSpec в SVG. Тот же расчёт, что и
// в превью/экспорте (specToDrawOps). Используется в плитках бенто.
export default function SpecSvg({ spec, measurer, placeholders = false, className, style, preserveAspectRatio = 'xMidYMid meet', viewBoxOverride = null, textAnimation = '', stagger = 90, animationCss = '', showDeviceChrome = true }) {
  const draw = useMemo(
    () => (spec ? specToDrawOps(spec, measurer, { placeholders }) : null),
    [spec, measurer, placeholders],
  )
  if (!draw) return null
  const W = draw.width
  const H = draw.height
  const view = viewBoxOverride || { x: 0, y: 0, w: W, h: H }
  return (
    <svg
      className={className}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      style={{ aspectRatio: `${view.w} / ${view.h}`, display: 'block', ...style }}
      preserveAspectRatio={preserveAspectRatio}
    >
      {draw.ops.map((op, i) => renderOp(op, i, textAnimation, stagger, animationCss))}
      {showDeviceChrome && <DeviceChrome purpose={spec.meta?.purpose} width={W} height={H} background={spec.canvas?.background?.color} />}
    </svg>
  )
}

export function DeviceChrome({ purpose, width, height, background }) {
  const ink = isDark(background) ? '#fff' : '#111'
  const faint = isDark(background) ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.15)'
  if (purpose === 'mobile-portrait') return <g aria-label="Интерфейс смартфона">
    <text x={width * .075} y={height * .032} fill={ink} fontFamily="sans-serif" fontSize={height * .012} fontWeight="600">9:41</text>
    <rect x={width * .37} y={height * .012} width={width * .26} height={height * .034} rx={height * .017} fill="#050505" />
    <circle cx={width * .585} cy={height * .029} r={height * .005} fill="#20242a" />
    <rect x={width * .82} y={height * .022} width={width * .085} height={height * .012} rx={height * .006} fill="none" stroke={ink} strokeWidth={height * .0015} />
    <rect x={width * .825} y={height * .025} width={width * .062} height={height * .006} rx={height * .003} fill={ink} />
    <rect x={width * .36} y={height * .976} width={width * .28} height={height * .004} rx={height * .002} fill={ink} opacity=".8" />
  </g>
  if (purpose === 'tablet-portrait') return <g aria-label="Интерфейс планшета">
    <circle cx={width * .5} cy={height * .015} r={height * .004} fill={ink} opacity=".65" />
    <text x={width * .04} y={height * .03} fill={ink} fontFamily="sans-serif" fontSize={height * .011} fontWeight="600">9:41</text>
    <rect x={width * .43} y={height * .977} width={width * .14} height={height * .0035} rx={height * .002} fill={ink} opacity=".7" />
  </g>
  if (purpose === 'desktop-hd') return <g aria-label="Окно браузера">
    <rect x="0" y="0" width={width} height={height * .075} fill={faint} />
    <circle cx={width * .022} cy={height * .037} r={height * .009} fill="#ff5f57" /><circle cx={width * .042} cy={height * .037} r={height * .009} fill="#febc2e" /><circle cx={width * .062} cy={height * .037} r={height * .009} fill="#28c840" />
    <rect x={width * .16} y={height * .018} width={width * .68} height={height * .038} rx={height * .019} fill={background} opacity=".72" stroke={ink} strokeOpacity=".18" />
    <text x={width * .5} y={height * .044} textAnchor="middle" fill={ink} opacity=".6" fontFamily="sans-serif" fontSize={height * .014}>gutenberg.local</text>
  </g>
  if (purpose === 'ebook-reader') return <g aria-label="Интерфейс электронной книги">
    <text x={width * .05} y={height * .026} fill={ink} opacity=".7" fontFamily="serif" fontSize={height * .01}>09:41</text>
    <text x={width * .95} y={height * .026} textAnchor="end" fill={ink} opacity=".7" fontFamily="sans-serif" fontSize={height * .01}>82%</text>
    <line x1={width * .05} y1={height * .955} x2={width * .95} y2={height * .955} stroke={ink} strokeOpacity=".22" />
  </g>
  if (purpose === 'book-a5' || purpose === 'book-145x215') return <g aria-label="Элементы книжной страницы">
    <line x1={width * .08} y1={height * .94} x2={width * .92} y2={height * .94} stroke={ink} strokeOpacity=".18" />
    <text x={width * .5} y={height * .965} textAnchor="middle" fill={ink} opacity=".65" fontFamily="serif" fontSize={height * .009}>— 24 —</text>
  </g>
  return null
}

function isDark(hex = '#fff') {
  const value = hex.replace('#', '')
  if (value.length !== 6) return false
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16))
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

function renderOp(op, i, textAnimation, stagger, animationCss) {
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
        style={animationCss ? { animation: animationCss, animationDelay: `${i * stagger}ms` } : { animationDelay: `${i * stagger}ms` }} fontFamily={`'${RENDER_FONT_FAMILY}', Arial, sans-serif`} fontSize={op.fontSize}
        fill={op.fill} textAnchor={op.anchor} letterSpacing={op.letterSpacing}>
        {op.lines.map((l, j) => <tspan key={j} x={l.x} y={l.y}>{l.text}</tspan>)}
      </text>
    )
  }
  return null
}
