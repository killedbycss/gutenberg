import React, { useState } from 'react'
import { TYPE_META } from '../typeMeta.js'

// Панель настроек: типы правок, стиль тире в EN, язык по умолчанию,
// словарь исключений (хранится в localStorage на стороне App).
export default function Toolbar({
  ruleTypes,
  enabledTypes,
  onToggleType,
  enDashStyle,
  onEnDashStyle,
  defaultLang,
  onDefaultLang,
  exceptions,
  onExceptions,
  counts,
}) {
  const [exceptionDraft, setExceptionDraft] = useState('')
  const [showExceptions, setShowExceptions] = useState(false)
  const exceptionItems = exceptions.split('\n').map((item) => item.trim()).filter(Boolean)
  const addException = (event) => {
    event.preventDefault()
    const value = exceptionDraft.trim()
    if (!value || exceptionItems.includes(value)) return
    onExceptions([...exceptionItems, value].join('\n'))
    setExceptionDraft('')
  }
  const removeException = (value) => onExceptions(exceptionItems.filter((item) => item !== value).join('\n'))
  return (
    <aside className="toolbar">
      <section className="toolbar-group">
        <h3>Правила</h3>
        {ruleTypes.map((t) => (
          <label key={t.id} className="toolbar__check rule-switch">
            <input
              type="checkbox"
              checked={enabledTypes.includes(t.id)}
              onChange={() => onToggleType(t.id)}
            />
            <span className="style-switch" aria-hidden="true"><i /></span>
            <span className="rule-copy">
              <span className="rule-title">
                <b className={`dot ${TYPE_META[t.id]?.cls || ''}`} />
                <span>{t.title}</span>
              </span>
              <small>{t.description}</small>
            </span>
          </label>
        ))}
      </section>

      <section className="toolbar-group toolbar-fields">
        <label className="toolbar__field">
          <span>Тире в английском</span>
          <select value={enDashStyle} onChange={(e) => onEnDashStyle(e.target.value)}>
            <option value="us">US — em dash</option>
            <option value="uk">UK – en dash</option>
          </select>
        </label>
      </section>

      <section className="toolbar-group toolbar-fields">
        <label className="toolbar__field">
          <span>Язык</span>
          <select value={defaultLang} onChange={(e) => onDefaultLang(e.target.value)}>
            <option value="auto">Авто</option>
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </label>
      </section>

      <button className="toolbar__dict" onClick={() => setShowExceptions((value) => !value)}>
        Словарь исключений <span className="toolbar__count">{exceptionItems.length}</span>
      </button>
      {showExceptions && <section className="dict">
        <div className="dict__head"><strong>Словарь исключений</strong><button className="dict__close" onClick={() => setShowExceptions(false)} aria-label="Закрыть">✕</button></div>
        <form className="dict__add" onSubmit={addException}>
          <input value={exceptionDraft} onChange={(e) => setExceptionDraft(e.target.value)} placeholder="Добавить фрагмент…" spellCheck={false} />
          <button type="submit" aria-label="Добавить исключение">+</button>
        </form>
        {exceptionItems.length ? <ul className="dict__list">{exceptionItems.map((item) => (
          <li key={item}><span>{item}</span><button onClick={() => removeException(item)} aria-label={`Удалить ${item}`}>✕</button></li>
        ))}</ul> : <p className="dict__empty">Пока пусто. Добавленные фрагменты типограф изменять не будет.</p>}
      </section>}

      <div className="sidebar-legend" aria-label="Количество исправлений">
        <h3>Исправления</h3>
        {Object.entries(TYPE_META).map(([id, meta]) => (
          <span key={id} className="legend-item"><b className={`legend-mark ${meta.cls}`} />{meta.label}<em>{counts[id] || 0}</em></span>
        ))}
      </div>
    </aside>
  )
}
