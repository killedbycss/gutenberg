import React, { useMemo } from 'react'
import SpecSvg from './SpecSvg'
import { makeMeasurer } from '../render/textLayout'
import { RENDER_FONT_FAMILY } from '../layout/schema'

export default function Bento({ items, fontReady, seed, onShuffle, onPick }) {
  const measurer = useMemo(() => makeMeasurer(RENDER_FONT_FAMILY), [fontReady])

  return (
    <div className="bento">
      <div className="bento-head">
        <div>
          <h2 className="bento-title">Бенто-раскладки</h2>
          <p className="bento-sub">
            Одна сетка из разных форматов и текстов. «Перемешать» создаёт новую
            композицию. Клик по фрагменту — открыть его в редакторе.
          </p>
        </div>
        <button className="btn-primary" onClick={onShuffle}>↻ Перемешать</button>
      </div>

      {/* key={seed} перезапускает анимацию «переключения» при каждом перемешивании */}
      <div className="bento-grid" key={seed}>
        {items.map((it, i) => (
          <button
            key={i}
            className={`bento-tile switch-${i % 2 ? 'a' : 'b'}`}
            style={{
              gridColumn: `span ${it.cols}`,
              gridRow: `span ${it.rows}`,
              animationDelay: `${i * 55}ms`,
              background: it.spec.canvas.background.color,
            }}
            onClick={() => onPick(it)}
            title="Открыть в редакторе"
          >
            <span className="contrast-badge">WCAG {it.palette.wcag} · {it.palette.contrast}:1</span>
            <SpecSvg
              spec={it.spec}
              measurer={measurer}
              className="bento-svg"
              preserveAspectRatio="xMidYMid meet"
              style={{ width: '100%', height: '100%', aspectRatio: 'auto' }}
              textAnimation={it.textAnimation}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
