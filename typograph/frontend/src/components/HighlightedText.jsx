import React from 'react'
import { TYPE_META, displayChars } from '../typeMeta.js'

// Разбивает итоговый текст на сегменты по правкам и рисует их.
// Клик по подсвеченному участку откатывает конкретную правку (undo).
export default function HighlightedText({ text, edits, onUndo }) {
  const sorted = [...edits].sort((a, b) => a.start - b.start)
  const nodes = []
  let cursor = 0

  sorted.forEach((ed) => {
    if (ed.start > cursor) {
      nodes.push(
        <span key={`p${cursor}`}>{text.slice(cursor, ed.start)}</span>,
      )
    }
    const meta = TYPE_META[ed.rule_type] || { cls: '' }
    const shown = displayChars(text.slice(ed.start, ed.end))
    const tip =
      `${ed.message}\n«${ed.original}» → «${ed.new}»\n` +
      `язык: ${ed.lang} · клик — отменить`
    nodes.push(
      <mark
        key={`e${ed.id}`}
        className={`mk ${meta.cls}`}
        title={tip}
        onClick={() => onUndo(ed.id)}
      >
        {shown}
      </mark>,
    )
    cursor = ed.end
  })

  if (cursor < text.length) {
    nodes.push(<span key={`p${cursor}`}>{text.slice(cursor)}</span>)
  }

  return <div className="preview">{nodes}</div>
}
