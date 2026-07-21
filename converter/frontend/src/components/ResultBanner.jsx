import React from 'react'

// Итог конвертации: сводка, предупреждения, ошибки, повторное скачивание архива.
export default function ResultBanner({ result, onDownload, onDismiss }) {
  const { summary } = result
  if (!summary) return null
  const { outputsOk, outputsFailed, warnings = [], errors = [] } = summary

  return (
    <div className="result">
      <div className="result-top">
        <div className="result-msg">
          <span className="result-check">✓</span>
          <div>
            <strong>Готово — {outputsOk} файл(ов) в архиве</strong>
            <div className="muted">
              {summary.files} исходных · форматы: {summary.targets.join(', ').toUpperCase()}
              {outputsFailed > 0 && ` · ошибок: ${outputsFailed}`}
            </div>
          </div>
        </div>
        <div className="result-actions">
          <button className="btn-primary" onClick={onDownload}>
            Скачать ZIP ещё раз
          </button>
          <button className="icon-btn" onClick={onDismiss} title="Закрыть">✕</button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="notes">
          {warnings.map((w, i) => (
            <div className="note note-warn" key={i}>
              <b>{w.file}{w.format ? ` → ${w.format.toUpperCase()}` : ''}:</b> {w.warning}
            </div>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <div className="notes">
          {errors.map((e, i) => (
            <div className="note note-err" key={i}>
              <b>{e.file}{e.format ? ` → ${e.format.toUpperCase()}` : ''}:</b> {e.error}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
