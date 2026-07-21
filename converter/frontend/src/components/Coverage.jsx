import React, { useState } from 'react'

// Отчёт о полноте набора символов: полоса на категорию + чипы недостающих глифов.
export default function Coverage({ coverage }) {
  if (!coverage) return null
  return (
    <div className="coverage">
      <div className="coverage-head">
        <span className="coverage-title">Покрытие набора</span>
        {coverage.complete ? (
          <span className="pill pill-ok">Полный набор</span>
        ) : (
          <span className="pill pill-warn">
            не хватает {coverage.missing} из {coverage.total}
          </span>
        )}
      </div>
      <div className="coverage-cats">
        {coverage.categories.map((cat) => (
          <Category key={cat.key} cat={cat} />
        ))}
      </div>
    </div>
  )
}

function Category({ cat }) {
  const [open, setOpen] = useState(false)
  const full = cat.missing === 0
  return (
    <div className="cat">
      <div className="cat-row">
        <span className="cat-label">{cat.label}</span>
        <span className={`cat-count${full ? ' full' : ''}`}>
          {cat.present}/{cat.total}
        </span>
      </div>
      <div className="bar">
        <div
          className={`bar-fill${full ? ' full' : ''}`}
          style={{ width: `${cat.coverage}%` }}
        />
      </div>
      {cat.missing > 0 && (
        <>
          <button className="cat-toggle" onClick={() => setOpen((v) => !v)}>
            {open ? 'Скрыть' : `Показать недостающие (${cat.missing})`}
          </button>
          {open && (
            <div className="glyph-chips">
              {cat.missingGlyphs.map((g) => (
                <span
                  key={g.cp}
                  className="glyph-chip"
                  title={`${g.cp}${g.name ? ' · ' + g.name : ''}`}
                >
                  {g.char || g.cp}
                </span>
              ))}
              {cat.missingTruncated && (
                <span className="glyph-chip more">…</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
