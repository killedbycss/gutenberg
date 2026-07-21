import { TYPE_LABEL } from '../utils/highlight.js';

function displayReplacement(r) {
  if (r === '') return '(удалить)';
  if (r.trim() === '') return `«${r}»`; // пробелы видны
  return r;
}

/** Всплывающее окно с вариантами исправления и действиями. */
export default function SuggestionPopup({
  match,
  top,
  left,
  onApply,
  onIgnore,
  onAddToDictionary,
  onClose,
}) {
  const isSpelling = match.type === 'spelling';
  return (
    <div className="popup" style={{ top, left }} role="dialog">
      <div className="popup__head">
        <span className={`popup__type popup__type--${match.type}`}>
          {TYPE_LABEL[match.type] || 'Ошибка'}
        </span>
        <button className="popup__x" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
      </div>

      {match.message && <p className="popup__msg">{match.message}</p>}

      {match.replacements.length > 0 ? (
        <div className="popup__suggestions">
          {match.replacements.map((r, i) => (
            <button
              key={i}
              className="popup__apply"
              onClick={() => onApply(r)}
              title="Принять исправление"
            >
              {displayReplacement(r)}
            </button>
          ))}
        </div>
      ) : (
        <div className="popup__nosug">Автоматических вариантов нет</div>
      )}

      <div className="popup__actions">
        <button className="popup__btn" onClick={onIgnore}>
          Пропустить
        </button>
        {isSpelling && (
          <button className="popup__btn" onClick={onAddToDictionary}>
            + В словарь
          </button>
        )}
      </div>
    </div>
  );
}
