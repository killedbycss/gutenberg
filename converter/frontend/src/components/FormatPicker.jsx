import React from 'react'

// Сайдбар: выбор целевых форматов, пресета набора символов и запуск конвертации.
export default function FormatPicker({
  targets,
  selected,
  onToggle,
  preset,
  onPreset,
  woff2,
  hasFonts,
  fileKinds,
  fileCount,
  converting,
  onConvert,
}) {
  return (
    <aside className="toolbar">
      <div className="tool-group target-formats-group">
        <h3>Целевые форматы</h3>
        <div className="format-list">
          {targets.map((t) => {
            const isWoff2 = t.key === 'woff2'
            const typeBlocked = fileCount > 0 && fileKinds.size > 0 && !fileKinds.has(t.kind)
            const blocked = (isWoff2 && !woff2) || typeBlocked
            const on = selected.has(t.key) && !typeBlocked
            return (
              <React.Fragment key={t.key}>
              {(t.key === 'otf' || t.key === 'ico') && (
                <div className="format-group">{t.kind === 'image' ? 'Изображения' : 'Шрифты'}</div>
              )}
              <label
                className={`format-item${on ? ' on' : ''}${blocked ? ' blocked' : ''}`}
                title={typeBlocked ? `Только для ${t.kind === 'image' ? 'изображений' : 'шрифтов'}` : blocked ? 'WOFF2 недоступен: на сервере нет brotli' : t.note}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={blocked}
                  onChange={() => onToggle(t.key)}
                />
                <span className={`fmt-badge fmt-${t.key}`}>{t.label}</span>
                <span className="format-note">{t.note}</span>
              </label>
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {hasFonts && <div className="tool-group">
        <h3>Эталон набора</h3>
        <div className="segmented">
          <button
            className={preset === 'basic' ? 'on' : ''}
            onClick={() => onPreset('basic')}
          >
            Базовый
          </button>
          <button
            className={preset === 'extended' ? 'on' : ''}
            onClick={() => onPreset('extended')}
          >
            Расширенный
          </button>
        </div>
        <p className="tool-desc">
          {preset === 'basic'
            ? 'Кириллица (рус.) + латиница + осн. диакритика и пунктуация.'
            : '+ укр./бел./серб., Latin Extended-A, дроби и символы.'}
        </p>
      </div>}

      <button
        className="btn-primary convert-btn"
        disabled={converting || fileCount === 0 || selected.size === 0}
        onClick={onConvert}
      >
        {converting
          ? 'Конвертирую…'
          : `Конвертировать${fileCount ? ` · ${fileCount}` : ''}`}
      </button>
      {fileCount > 0 && selected.size === 0 && (
        <p className="tool-warn">Выберите хотя бы один формат</p>
      )}
    </aside>
  )
}
