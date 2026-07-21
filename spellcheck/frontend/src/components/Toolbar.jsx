/** Верхняя панель: язык, тумблер стиля, словарь и статус проверки. */
export default function Toolbar({
  language,
  onLanguage,
  enableStyle,
  onToggleStyle,
  status,
  ltAvailable,
  count,
  detected,
  dictCount,
  onToggleDict,
  wordCount,
  charCount,
}) {
  const statusText = () => {
    if (ltAvailable === false) return 'LanguageTool недоступен';
    if (status === 'checking') return 'Проверка…';
    if (status === 'error') return 'Ошибка проверки';
    if (status === 'ready')
      return count === 0 ? 'Ошибок не найдено' : `Найдено ошибок: ${count}`;
    return 'Готово к проверке';
  };

  const statusMod =
    ltAvailable === false || status === 'error'
      ? 'bad'
      : status === 'checking'
        ? 'busy'
        : status === 'ready' && count === 0
          ? 'good'
          : 'info';

  return (
    <div className="toolbar">
      <label className="toolbar__field">
        <span>Язык</span>
        <select value={language} onChange={(e) => onLanguage(e.target.value)}>
          <option value="auto">Авто</option>
          <option value="ru-RU">Русский</option>
          <option value="en-US">English</option>
        </select>
      </label>

      <label className="toolbar__check">
        <input type="checkbox" checked={enableStyle} onChange={onToggleStyle} />
        <span className="style-switch" aria-hidden="true"><i /></span>
        <span>Проверять стиль</span>
      </label>

      <button className="toolbar__dict" onClick={onToggleDict}>
        📖 Словарь <span className="toolbar__count">{dictCount}</span>
      </button>

      <div className="toolbar__stats" title="Слов и символов">
        {wordCount} сл. · {charCount} симв.
      </div>

      <div className="toolbar__spacer" />

      <div className={`toolbar__status toolbar__status--${statusMod}`}>
        <span className="toolbar__dot" />
        {statusText()}
        {detected && language === 'auto' && status === 'ready' && (
          <span className="toolbar__detected">· {detected.name}</span>
        )}
      </div>
    </div>
  );
}
