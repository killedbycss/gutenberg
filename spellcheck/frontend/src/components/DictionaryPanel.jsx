import { useState } from 'react';

/** Боковая панель управления пользовательским словарём исключений. */
export default function DictionaryPanel({ words, onAdd, onRemove, onClose }) {
  const [value, setValue] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const w = value.trim();
    if (w) {
      onAdd(w);
      setValue('');
    }
  };

  return (
    <aside className="dict">
      <div className="dict__head">
        <strong>Словарь исключений</strong>
        <button className="dict__close" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
      </div>

      <form className="dict__add" onSubmit={submit}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Добавить слово…"
        />
        <button type="submit" aria-label="Добавить">
          +
        </button>
      </form>

      {words.length === 0 ? (
        <p className="dict__empty">
          Пока пусто. Слова, добавленные здесь или кнопкой «В словарь» в попапе,
          не считаются орфографической ошибкой.
        </p>
      ) : (
        <ul className="dict__list">
          {words.map((w) => (
            <li key={w}>
              <span>{w}</span>
              <button onClick={() => onRemove(w)} aria-label={`Удалить ${w}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
