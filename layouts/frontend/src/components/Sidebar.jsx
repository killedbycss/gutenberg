import React, { useRef } from 'react'
import { PURPOSES, VARIANT_OPTIONS } from '../layout/purposes'
import { ROLES, ROLE_LABEL } from '../layout/schema'

const CAP_SOURCE_NOTE = {
  os2: 'из таблицы OS/2',
  geometric: 'измерено по контуру «H»/«x»',
  fallback: 'оценка приблизительная (в шрифте нет данных)',
}

const CONTENT_PLACEHOLDER = {
  headline: 'Главный заголовок',
  subhead: 'Подзаголовок или слоган',
  body: 'Основной текст. Переносы строк учитываются.',
  caption: 'Подпись · дата · @аккаунт',
}

export default function Sidebar({
  fontInfo, loadingFont, fontError, onUploadFont,
  purposeId, onPurpose, variant, onVariant,
  paletteColors, paletteLocked, paletteSelected, onPaletteColor,
  onTogglePaletteLock, onTogglePaletteColor, onRandomPalette,
  content, onContentField, onAddImage, onRemoveImage,
  spec, selected, selectedId, onSelect, onFrameChange, onToggleHidden,
  bgColor, onBgColor, onResetEdits, hasEdits,
}) {
  const activePurpose = PURPOSES.find((item) => item.id === purposeId)

  const groups = PURPOSES.reduce((acc, p) => {
    (acc[p.group] = acc[p.group] || []).push(p)
    return acc
  }, {})

  const imgZ = selected?.z ?? 3

  return (
    <aside className="toolbar">
      {/* --- Шрифт --- */}
      <FontPanel fontInfo={fontInfo} loadingFont={loadingFont} fontError={fontError} onUploadFont={onUploadFont} />

      {/* --- Назначение --- */}
      <div className="tool-group anim-in">
        <h3>Назначение</h3>
        <select className="select" value={purposeId} onChange={(e) => onPurpose(e.target.value)}>
          {Object.entries(groups).map(([group, items]) => (
            <optgroup key={group} label={group}>
              {items.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {/* --- Раскладка --- */}
      <div className="tool-group anim-in">
        <h3>Раскладка</h3>
        <div className="segmented">
          {VARIANT_OPTIONS.map((v) => (
            <button key={v.id} className={variant === v.id ? 'on' : ''} onClick={() => onVariant(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* --- Контент --- */}
      <div className="tool-group anim-in">
        <h3>Контент</h3>
        {(activePurpose?.group === 'Книги' || activePurpose?.group === 'Цифровые устройства') && (
          <button className="btn-ghost wide fish-layout" onClick={() => {
            onContentField('headline', 'Шрифт во всей красе')
            onContentField('subhead', 'Образец для цифрового носителя')
            onContentField('body', 'Типографика помогает выстроить ясную и выразительную систему. Ритм строки, поля и интервалы создают спокойное пространство для чтения. Форма каждой буквы раскрывается в разных кеглях и сценариях использования.')
            onContentField('caption', 'Гутенберг · образец набора')
          }}>Сгенерировать рыба-текст</button>
        )}
        {ROLES.map((role) => (
          <label key={role} className="field">
            <span className="field-label">{ROLE_LABEL[role]}</span>
            <textarea
              rows={role === 'body' ? 3 : 1}
              value={content[role]}
              placeholder={CONTENT_PLACEHOLDER[role]}
              onChange={(e) => onContentField(role, e.target.value)}
            />
          </label>
        ))}
      </div>

      {/* --- Инспектор выбранного блока (стиль; координаты — в панели над холстом) --- */}
      {selected && (
        <div className="tool-group inspector anim-in">
          <h3>Блок: {labelFor(selected)}</h3>

          {selected.type === 'text' ? (
            <>
              <label className="field">
                <span className="field-label">Кегль · {selected.text.fontSize}px</span>
                <input
                  type="range" min="8" max={maxFontSize(spec)} value={selected.text.fontSize}
                  onChange={(e) => onFrameChange(selected.id, { fontSize: +e.target.value })}
                />
              </label>
              <div className="segmented">
                {['left', 'center', 'right'].map((a) => (
                  <button key={a} className={selected.text.align === a ? 'on' : ''}
                    onClick={() => onFrameChange(selected.id, { align: a })}>
                    {a === 'left' ? '⟵' : a === 'center' ? '↔' : '⟶'}
                  </button>
                ))}
              </div>
              <label className="field inline">
                <span className="field-label">Цвет текста</span>
                <input type="color" value={selected.text.color}
                  onChange={(e) => onFrameChange(selected.id, { color: e.target.value })} />
              </label>
            </>
          ) : (
            <>
              <span className="field-label">Заполнение</span>
              <div className="segmented">
                {['contain', 'cover'].map((fit) => (
                  <button key={fit} className={selected.image.fit === fit ? 'on' : ''}
                    onClick={() => onFrameChange(selected.id, { fit })}>
                    {fit === 'contain' ? 'Вписать' : 'Заполнить'}
                  </button>
                ))}
              </div>
              <span className="field-label" style={{ marginTop: 10, display: 'block' }}>Слой</span>
              <div className="segmented">
                <button className={imgZ >= 2 ? 'on' : ''} onClick={() => onFrameChange(selected.id, { z: 3 })}>Поверх текста</button>
                <button className={imgZ < 2 ? 'on' : ''} onClick={() => onFrameChange(selected.id, { z: 1 })}>Позади текста</button>
              </div>
            </>
          )}

          <button className="link-btn" onClick={() => onToggleHidden(selected.id)}>
            {selected.hidden ? 'Показать блок' : 'Скрыть блок'}
          </button>
        </div>
      )}

      {/* --- Фон и сброс --- */}
      <div className="tool-group anim-in">
        <label className="field inline">
          <span className="field-label">Цвет фона</span>
          <input type="color" value={bgColor || spec?.canvas.background.color || '#000000'}
            onChange={(e) => onBgColor(e.target.value)} />
        </label>
        {hasEdits && (
          <button className="link-btn" onClick={onResetEdits}>Сбросить ручные правки</button>
        )}
      </div>
    </aside>
  )
}

export function FontPanel({ fontInfo, loadingFont, fontError, onUploadFont }) {
  const fontInput = useRef(null)
  return <div className="tool-group anim-in">
    <h3>Шрифт</h3>
    <div className={`dropzone compact${loadingFont ? ' disabled' : ''}`} onClick={() => fontInput.current?.click()}>
      <div className="dropzone-title">{loadingFont ? 'Читаю шрифт…' : fontInfo ? fontInfo.fileName : 'Загрузить шрифт'}</div>
      <div className="dropzone-hint">OTF · TTF · WOFF · WOFF2</div>
    </div>
    <input ref={fontInput} type="file" hidden accept=".otf,.ttf,.woff,.woff2,.ttc" onChange={(e) => {
      if (e.target.files[0]) onUploadFont(e.target.files[0])
      e.target.value = ''
    }} />
    {fontError && <p className="tool-warn">{fontError}</p>}
    {fontInfo && <div className="metrics">
      <div className="metrics-name">{fontInfo.metrics.family || 'Без имени'}</div>
      <dl className="metrics-grid"><dt>UPM</dt><dd>{fontInfo.metrics.unitsPerEm}</dd><dt>cap-height</dt><dd>{fontInfo.metrics.capHeight}</dd><dt>x-height</dt><dd>{fontInfo.metrics.xHeight}</dd></dl>
      <p className={`metrics-src${fontInfo.metrics.capHeightSource === 'fallback' ? ' warn' : ''}`}>cap-height: {CAP_SOURCE_NOTE[fontInfo.metrics.capHeightSource] || '—'}</p>
      {fontInfo.metrics.hasCyrillic === false && <p className="script-note">Кириллица не найдена. Для Bento включён английский текст.</p>}
    </div>}
  </div>
}

function labelFor(frame) {
  if (frame.type === 'image') return 'изображение'
  return ROLE_LABEL[frame.role] || frame.role
}

function maxFontSize(spec) {
  if (!spec) return 600
  return Math.round(Math.min(spec.canvas.width, spec.canvas.height) * 0.5)
}
